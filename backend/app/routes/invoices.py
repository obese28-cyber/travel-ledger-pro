"""
routes/invoices.py -- Invoice management endpoints.

POST  /api/invoices/from-booking/<id>  -> generate invoice from a booking
GET   /api/invoices                    -> list invoices
GET   /api/invoices/<id>               -> invoice detail
PATCH /api/invoices/<id>/issue         -> issue invoice + auto-create supplier invoices
PATCH /api/invoices/<id>/cancel        -> cancel an invoice

When an invoice is ISSUED:
  1. DR Accounts Receivable / CR Sales Revenue    (customer invoice)
  2. DR Cost of Sales       / CR Accounts Payable (auto supplier invoice per line item)
"""

from datetime import date
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.invoice import Invoice, InvoiceItem
from ..models.booking import Booking, BookingItem
from ..models.vendor_bill import VendorBill
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service, accounting_service
from ..services.reference_service import generate_invoice_number, generate_vendor_bill_reference

invoices_bp = Blueprint("invoices", __name__)


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


@invoices_bp.get("/")
@jwt_required()
def list_invoices():
    status      = request.args.get("status", "").strip()
    customer_id = request.args.get("customer_id", type=int)
    page        = int(request.args.get("page", 1))
    per_page    = int(request.args.get("per_page", 20))

    query = Invoice.query
    if status:
        query = query.filter_by(status=status)
    if customer_id:
        query = query.filter_by(customer_id=customer_id)

    query    = query.order_by(Invoice.created_at.desc())
    total    = query.count()
    invoices = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [inv.to_dict(include_items=False) for inv in invoices],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@invoices_bp.post("/from-booking/<int:booking_id>")
@jwt_required()
def create_invoice_from_booking(booking_id: int):
    """
    Generate a draft invoice from an existing booking.

    Each line item is built from the booking item's supplier, cost, and selling price.
    Markup = selling_price - supplier_cost (hidden from customer by default).

    Auto-creates supplier invoices (VendorBills) when the draft is later issued.
    """
    user_id = int(get_jwt_identity())
    booking = Booking.query.get(booking_id)
    if not booking:
        return not_found("Booking")

    existing = Invoice.query.filter_by(booking_id=booking_id) \
                            .filter(Invoice.status != "cancelled").first()
    if existing:
        return error(
            f"Booking {booking.booking_reference} already has invoice "
            f"{existing.invoice_number} ({existing.status}). "
            "Cancel it first if you need to re-invoice."
        )

    data     = request.get_json() or {}
    tax_rate = float(data.get("tax_rate", 0))

    subtotal = round(sum(item.selling_price for item in booking.items), 2)
    tax_amt  = round(subtotal * tax_rate / 100, 2)
    total    = round(subtotal + tax_amt, 2)

    invoice = Invoice(
        invoice_number = generate_invoice_number(),
        booking_id     = booking_id,
        customer_id    = booking.customer_id,
        issue_date     = date.today(),
        due_date       = _parse_date(data.get("due_date")),
        subtotal       = subtotal,
        tax_amount     = tax_amt,
        total_amount   = total,
        amount_paid    = 0.0,
        status         = "draft",
        notes          = data.get("notes"),
        created_by     = user_id,
    )
    db.session.add(invoice)
    db.session.flush()

    for bk_item in booking.items:
        selling = float(bk_item.selling_price or 0)
        cost    = float(bk_item.vendor_cost   or 0)
        markup  = round(selling - cost, 2)
        line = InvoiceItem(
            invoice_id      = invoice.id,
            booking_item_id = bk_item.id,
            supplier_id     = bk_item.vendor_id,       # link to supplier
            description     = bk_item.description or f"{bk_item.service_type.replace('_', ' ').title()} service",
            quantity        = 1,
            supplier_cost   = cost,
            unit_price      = selling,
            total_price     = selling,
            markup_amount   = markup,
            show_markup     = False,                    # hidden from customer by default
        )
        db.session.add(line)

    audit_service.log("CREATE", "invoices", invoice.id, user_id,
                      new_values={"invoice_number": invoice.invoice_number,
                                  "total_amount": invoice.total_amount})
    db.session.commit()
    db.session.refresh(invoice)

    return created(invoice.to_dict())


@invoices_bp.get("/<int:invoice_id>")
@jwt_required()
def get_invoice(invoice_id: int):
    invoice = Invoice.query.get(invoice_id)
    if not invoice:
        return not_found("Invoice")
    data = invoice.to_dict()
    data["payments"] = [p.to_dict() for p in invoice.payments]
    return success(data)


@invoices_bp.patch("/<int:invoice_id>/issue")
@jwt_required()
def issue_invoice(invoice_id: int):
    """
    Issue a draft invoice. This:
      1. Creates the customer-side journal entry (DR Receivable / CR Revenue)
      2. Auto-creates a VendorBill (supplier invoice) for every line item that
         has a supplier_id and supplier_cost > 0, then posts the COGS entry
         (DR Cost of Sales / CR Accounts Payable) for each.

    Both sides of the books are posted in a single transaction so they always balance.
    """
    user_id = int(get_jwt_identity())
    invoice = Invoice.query.get(invoice_id)
    if not invoice:
        return not_found("Invoice")

    if invoice.status != "draft":
        return error(f"Only draft invoices can be issued. Current status: {invoice.status}")

    invoice.status = "issued"
    # Lock the issue date to today if not already set.
    # Once assigned it is permanent — no further updates should overwrite it.
    if not invoice.issue_date:
        invoice.issue_date = date.today()

    # 1. Revenue journal entry (DR Receivable / CR Revenue)
    try:
        accounting_service.record_invoice_issued(invoice, created_by=user_id)
    except ValueError as e:
        db.session.rollback()
        return error(str(e))

    # 2. Auto-create supplier invoices (VendorBills) for each line item
    supplier_bills_created = []
    for item in invoice.items:
        if not item.supplier_id or not item.supplier_cost or item.supplier_cost <= 0:
            continue  # skip items with no supplier or zero cost

        # Avoid duplicate bills if re-issuing somehow
        existing_bill = VendorBill.query.filter_by(
            booking_item_id = item.booking_item_id
        ).first() if item.booking_item_id else None

        if existing_bill:
            continue

        bill = VendorBill(
            bill_reference  = generate_vendor_bill_reference(),
            vendor_id       = item.supplier_id,
            booking_id      = invoice.booking_id,
            booking_item_id = item.booking_item_id,
            description     = f"Supplier cost: {item.description}",
            amount          = round(item.supplier_cost * item.quantity, 2),
            bill_date       = invoice.issue_date,
            due_date        = invoice.due_date,
            amount_paid     = 0.0,
            status          = "unpaid",
            created_by      = user_id,
        )
        db.session.add(bill)
        db.session.flush()

        # COGS journal entry (DR Cost of Sales / CR Accounts Payable)
        cogs_code = "5000"
        if item.booking_item_id:
            bk_item = BookingItem.query.get(item.booking_item_id)
            if bk_item:
                cogs_code = bk_item.get_cogs_account_code()

        try:
            accounting_service.record_vendor_bill(bill, cogs_account_code=cogs_code,
                                                  created_by=user_id)
        except ValueError as e:
            db.session.rollback()
            return error(f"Supplier invoice error: {str(e)}")

        supplier_bills_created.append(bill.bill_reference)

    audit_service.log("UPDATE", "invoices", invoice.id, user_id,
                      old_values={"status": "draft"},
                      new_values={"status": "issued"})
    db.session.commit()

    result = invoice.to_dict()
    result["supplier_bills_created"] = supplier_bills_created
    return success(result)


@invoices_bp.patch("/<int:invoice_id>/cancel")
@jwt_required()
def cancel_invoice(invoice_id: int):
    user_id = int(get_jwt_identity())
    invoice = Invoice.query.get(invoice_id)
    if not invoice:
        return not_found("Invoice")

    if invoice.status in ("paid", "partially_paid"):
        return error("Cannot cancel an invoice that has payments recorded.")
    if invoice.status == "cancelled":
        return error("Invoice is already cancelled.")

    invoice.status = "cancelled"
    audit_service.log("UPDATE", "invoices", invoice.id, user_id,
                      old_values={"status": invoice.status},
                      new_values={"status": "cancelled"})
    db.session.commit()
    return success({"id": invoice.id, "status": invoice.status})


@invoices_bp.route("/<int:invoice_id>/pdf", methods=["GET", "OPTIONS"])
@jwt_required(optional=True)
def download_invoice_pdf(invoice_id: int):
    """
    Generate and return a PDF for this invoice.
    GET /api/invoices/:id/pdf
    Returns: application/pdf
    """
    from flask import make_response, request as flask_request, current_app
    if flask_request.method == "OPTIONS":
        return {}, 200

    try:
        invoice = Invoice.query.get(invoice_id)
        if not invoice:
            return not_found("Invoice")

        data = invoice.to_dict()
        data["payments"] = [p.to_dict() for p in invoice.payments]

        agency = current_app.config.get("AGENCY_PROFILE") or {}

        from ..services.pdf_service import generate_invoice_pdf
        pdf_bytes = generate_invoice_pdf(data, agency)

        inv_num = invoice.invoice_number.replace("/", "-")
        filename = f"Invoice-{inv_num}.pdf"

        response = make_response(pdf_bytes)
        response.headers["Content-Type"]        = "application/pdf"
        response.headers["Content-Disposition"] = f'inline; filename="{filename}"'
        response.headers["Content-Length"]      = str(len(pdf_bytes))
        return response

    except Exception as exc:
        import traceback
        print(f"[PDF] Error generating invoice {invoice_id}: {exc}")
        traceback.print_exc()
        return error(f"PDF generation failed: {str(exc)}", 500)
