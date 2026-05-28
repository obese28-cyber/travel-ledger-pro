"""
routes/vendors.py — Vendor/Supplier management endpoints.

GET  /api/vendors                  -> list vendors
POST /api/vendors                  -> create vendor
GET  /api/vendors/<id>             -> view vendor (with outstanding balance)
PUT  /api/vendors/<id>             -> update vendor
GET  /api/vendors/<id>/balance     -> balance detail (legacy)
GET  /api/vendors/<id>/statement   -> full supplier ledger (bills + payments, running balance)
"""

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.vendor import Vendor, VENDOR_TYPE_TO_SERVICE
from ..models.vendor_bill import VendorBill, VendorPayment
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service

vendors_bp = Blueprint("vendors", __name__)

VALID_TYPES    = {"airline", "hotel", "tour", "visa", "insurance", "other"}
VALID_SERVICES = {"flight", "hotel", "tour_package", "visa", "insurance", "other"}


@vendors_bp.get("/")
@jwt_required()
def list_vendors():
    vendor_type = request.args.get("type", "").strip()
    search      = request.args.get("search", "").strip()
    page        = int(request.args.get("page", 1))
    per_page    = int(request.args.get("per_page", 50))

    query = Vendor.query.filter_by(is_active=True)
    if vendor_type and vendor_type != "all":
        query = query.filter_by(type=vendor_type)
    if search:
        query = query.filter(Vendor.name.ilike(f"%{search}%"))

    query   = query.order_by(Vendor.name)
    total   = query.count()
    vendors = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [v.to_dict(include_balance=True) for v in vendors],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@vendors_bp.post("/")
@jwt_required()
def create_vendor():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    name = (data.get("name") or "").strip()
    if not name:
        return error("Vendor name is required.")

    v_type = (data.get("type") or "other").strip()
    if v_type not in VALID_TYPES:
        return error("Invalid vendor type. Must be one of: " + ', '.join(sorted(VALID_TYPES)))

    svc_type = (data.get("default_service_type") or "").strip() or None
    if svc_type and svc_type not in VALID_SERVICES:
        return error("Invalid default_service_type. Must be one of: " + ', '.join(sorted(VALID_SERVICES)))
    if not svc_type:
        svc_type = VENDOR_TYPE_TO_SERVICE.get(v_type, "other")

    vendor = Vendor(
        name                 = name,
        type                 = v_type,
        default_service_type = svc_type,
        contact_name         = data.get("contact_name"),
        phone                = data.get("phone"),
        email                = data.get("email"),
        notes                = data.get("notes"),
    )
    db.session.add(vendor)
    db.session.flush()
    audit_service.log("CREATE", "vendors", vendor.id, user_id, new_values=vendor.to_dict())
    db.session.commit()

    return created(vendor.to_dict(include_balance=True))


@vendors_bp.get("/<int:vendor_id>")
@jwt_required()
def get_vendor(vendor_id: int):
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return not_found("Vendor")
    return success(vendor.to_dict(include_balance=True))


@vendors_bp.put("/<int:vendor_id>")
@jwt_required()
def update_vendor(vendor_id: int):
    user_id = int(get_jwt_identity())
    vendor  = Vendor.query.get(vendor_id)
    if not vendor:
        return not_found("Vendor")

    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    old = vendor.to_dict()

    if "name"         in data: vendor.name         = data["name"]
    if "contact_name" in data: vendor.contact_name = data["contact_name"]
    if "phone"        in data: vendor.phone        = data["phone"]
    if "email"        in data: vendor.email        = data["email"]
    if "notes"        in data: vendor.notes        = data["notes"]
    if "is_active"    in data: vendor.is_active    = bool(data["is_active"])

    if "type" in data:
        if data["type"] not in VALID_TYPES:
            return error("Invalid type. Must be one of: " + ', '.join(sorted(VALID_TYPES)))
        vendor.type = data["type"]
        if "default_service_type" not in data:
            vendor.default_service_type = VENDOR_TYPE_TO_SERVICE.get(data["type"], "other")

    if "default_service_type" in data:
        svc = (data["default_service_type"] or "").strip() or None
        if svc and svc not in VALID_SERVICES:
            return error("Invalid default_service_type. Must be one of: " + ', '.join(sorted(VALID_SERVICES)))
        vendor.default_service_type = svc or VENDOR_TYPE_TO_SERVICE.get(vendor.type, "other")

    audit_service.log("UPDATE", "vendors", vendor.id, user_id,
                      old_values=old, new_values=vendor.to_dict())
    db.session.commit()

    return success(vendor.to_dict(include_balance=True))


@vendors_bp.get("/<int:vendor_id>/balance")
@jwt_required()
def get_vendor_balance(vendor_id: int):
    """Legacy endpoint — returns unpaid bills and recent payments."""
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return not_found("Vendor")

    unpaid_bills = VendorBill.query.filter(
        VendorBill.vendor_id == vendor_id,
        VendorBill.status.notin_(["paid"])
    ).order_by(VendorBill.due_date).all()

    recent_payments = vendor.payments.order_by(
        db.text("payment_date DESC")
    ).limit(20).all()

    return success({
        "vendor":              vendor.to_dict(),
        "outstanding_balance": vendor.get_balance(),
        "unpaid_bills":        [b.to_dict() for b in unpaid_bills],
        "recent_payments":     [p.to_dict() for p in recent_payments],
    })


@vendors_bp.get("/<int:vendor_id>/statement")
@jwt_required()
def get_vendor_statement(vendor_id: int):
    """
    Return a full account statement for a supplier/vendor.

    The statement is a chronological list of every financial event:
      - Bill received  -> DEBIT  (we owe the vendor more)
      - Payment made   -> CREDIT (we pay the vendor)

    Each entry includes a running_balance reflecting what we currently owe.

    Response shape mirrors /customers/<id>/statement for consistency.
    """
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return not_found("Vendor")

    # ── Load all bills for this vendor ────────────────────────────────────────
    bills = VendorBill.query.filter_by(vendor_id=vendor_id)\
                            .order_by(VendorBill.bill_date, VendorBill.id).all()

    # ── Load all payments to this vendor ─────────────────────────────────────
    payments = VendorPayment.query.filter_by(vendor_id=vendor_id)\
                                  .order_by(VendorPayment.payment_date, VendorPayment.id).all()

    # ── Build entries ─────────────────────────────────────────────────────────
    entries = []

    for bill in bills:
        # Derive service type from the linked booking item if available
        service_type = None
        if bill.booking_item and bill.booking_item.service_type:
            service_type = bill.booking_item.service_type

        desc = bill.description or "Supplier invoice"

        entries.append({
            "entry_type":    "bill",
            "date":          bill.bill_date.isoformat() if bill.bill_date else None,
            "sort_key":      (bill.bill_date.isoformat() if bill.bill_date else "0000") + f"_bill_{bill.id:06d}",
            "reference":     bill.bill_reference,
            "booking_ref":   bill.booking.booking_reference if bill.booking else None,
            "booking_id":    bill.booking_id,
            "bill_id":       bill.id,
            "service_type":  service_type,
            "description":   desc,
            "debit":         round(bill.amount, 2),
            "credit":        0.0,
            "amount_paid":   round(bill.amount_paid, 2),
            "balance_due":   round(bill.balance_due, 2),
            "due_date":      bill.due_date.isoformat() if bill.due_date else None,
            "status":        bill.status,
        })

    for pmt in payments:
        method_label = (pmt.payment_method or "").replace("_", " ").title()
        bill_ref = None
        if pmt.vendor_bill_id:
            b = VendorBill.query.get(pmt.vendor_bill_id)
            if b:
                bill_ref = b.bill_reference

        entries.append({
            "entry_type":     "payment",
            "date":           pmt.payment_date.isoformat() if pmt.payment_date else None,
            "sort_key":       (pmt.payment_date.isoformat() if pmt.payment_date else "0000") + f"_pmt_{pmt.id:06d}",
            "reference":      pmt.payment_reference,
            "bill_reference": bill_ref,
            "description":    f"{method_label} payment" + (f" — {pmt.notes}" if pmt.notes else ""),
            "payment_method": pmt.payment_method,
            "debit":          0.0,
            "credit":         round(pmt.amount, 2),
            "status":         "paid",
        })

    # ── Sort chronologically ──────────────────────────────────────────────────
    entries.sort(key=lambda e: e["sort_key"])

    # ── Running balance (cumulative amount we owe vendor) ─────────────────────
    running = 0.0
    for e in entries:
        running += e["debit"] - e["credit"]
        e["running_balance"] = round(running, 2)
        del e["sort_key"]

    # ── Summary ───────────────────────────────────────────────────────────────
    total_billed  = round(sum(e["debit"]  for e in entries if e["entry_type"] == "bill"),    2)
    total_paid    = round(sum(e["credit"] for e in entries if e["entry_type"] == "payment"), 2)
    outstanding   = round(total_billed - total_paid, 2)

    return success({
        "vendor": vendor.to_dict(include_balance=True),
        "summary": {
            "total_billed":   total_billed,
            "total_paid":     total_paid,
            "outstanding":    outstanding,
            "bill_count":     len([e for e in entries if e["entry_type"] == "bill"]),
            "payment_count":  len([e for e in entries if e["entry_type"] == "payment"]),
        },
        "entries": entries,
    })
