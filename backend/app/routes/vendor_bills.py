"""
routes/vendor_bills.py — Vendor bill and vendor payment endpoints.

POST /api/vendor-bills                → record a vendor cost (creates journal entry)
GET  /api/vendor-bills                → list vendor bills
GET  /api/vendor-bills/<id>           → bill detail
POST /api/vendor-bills/<id>/payments  → pay a vendor bill (creates journal entry)

Accounting entries:
  Recording vendor bill: DR Cost of Sales / CR Accounts Payable
  Paying vendor:         DR Accounts Payable / CR Cash or Bank
"""

from datetime import date
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.vendor import Vendor
from ..models.vendor_bill import VendorBill, VendorPayment, VendorPaymentBatch
from ..models.booking import BookingItem
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service, accounting_service
from ..services.reference_service import (
    generate_vendor_bill_reference, generate_vendor_payment_reference,
    generate_vendor_batch_reference
)

vendor_bills_bp = Blueprint("vendor_bills", __name__)

VALID_METHODS = {"cash", "bank_transfer", "credit_card", "mobile_money"}



def _parse_date(value):
    """Convert a YYYY-MM-DD string to a Python date object, or return None."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


@vendor_bills_bp.post("/")
@jwt_required()
def create_vendor_bill():
    """
    Record a vendor bill (cost owed to a supplier for a booking).

    Required fields:
        vendor_id    — which vendor
        amount       — total amount owed
        booking_item_id — (recommended) links cost to specific service in booking

    Optional fields:
        booking_id, description, bill_date, due_date
    """
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    vendor_id = data.get("vendor_id")
    if not vendor_id:
        return error("vendor_id is required.")
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return not_found("Vendor")

    amount = float(data.get("amount") or 0)
    if amount <= 0:
        return error("Amount must be greater than zero.")

    # Determine COGS account code from the linked booking item's service type
    cogs_code = "5000"  # default: airline tickets
    booking_item_id = data.get("booking_item_id")
    if booking_item_id:
        booking_item = BookingItem.query.get(booking_item_id)
        if booking_item:
            cogs_code = booking_item.get_cogs_account_code()

    bill = VendorBill(
        bill_reference  = generate_vendor_bill_reference(),
        vendor_id       = vendor_id,
        booking_id      = data.get("booking_id"),
        booking_item_id = booking_item_id,
        description     = data.get("description"),
        amount          = round(amount, 2),
        bill_date       = _parse_date(data.get("bill_date")),
        due_date        = _parse_date(data.get("due_date")),
        amount_paid     = 0.0,
        status          = "unpaid",
        created_by      = user_id,
    )
    db.session.add(bill)
    db.session.flush()

    # Create journal entry — DR COGS / CR Accounts Payable
    try:
        accounting_service.record_vendor_bill(bill, cogs_account_code=cogs_code,
                                               created_by=user_id)
    except ValueError as e:
        db.session.rollback()
        return error(str(e))

    audit_service.log("CREATE", "vendor_bills", bill.id, user_id,
                      new_values={"bill_reference": bill.bill_reference,
                                  "vendor_id": vendor_id, "amount": amount})
    db.session.commit()
    db.session.refresh(bill)

    return created(bill.to_dict())


@vendor_bills_bp.get("/")
@jwt_required()
def list_vendor_bills():
    """
    List vendor bills. Supports filtering by vendor, status, or booking.

    Query params:
        vendor_id, booking_id, status (unpaid|partially_paid|paid)
        page / per_page
    """
    vendor_id  = request.args.get("vendor_id",  type=int)
    booking_id = request.args.get("booking_id", type=int)
    status     = request.args.get("status", "").strip()
    page       = int(request.args.get("page", 1))
    per_page   = int(request.args.get("per_page", 20))

    query = VendorBill.query

    if vendor_id:
        query = query.filter_by(vendor_id=vendor_id)
    if booking_id:
        query = query.filter_by(booking_id=booking_id)
    if status:
        query = query.filter_by(status=status)

    query = query.order_by(VendorBill.due_date.asc())
    total = query.count()
    bills = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [b.to_dict() for b in bills],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@vendor_bills_bp.get("/<int:bill_id>")
@jwt_required()
def get_vendor_bill(bill_id: int):
    """Return a vendor bill with payment history."""
    bill = VendorBill.query.get(bill_id)
    if not bill:
        return not_found("Vendor bill")

    data = bill.to_dict()
    data["payments"] = [p.to_dict() for p in bill.payments]
    return success(data)


@vendor_bills_bp.post("/<int:bill_id>/payments")
@jwt_required()
def pay_vendor(bill_id: int):
    """
    Record a payment to a vendor (settles a vendor bill).

    Required fields:
        amount         — amount paid
        payment_method — cash | bank_transfer | credit_card | mobile_money

    Optional fields:
        payment_date, notes

    Accounting entry created:
      DR  2000  Accounts Payable   [amount]
      CR  1010  Bank Account       [amount]
    """
    user_id = int(get_jwt_identity())
    bill    = VendorBill.query.get(bill_id)
    if not bill:
        return not_found("Vendor bill")

    if bill.status == "paid":
        return error("This vendor bill is already fully paid.")

    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    amount = float(data.get("amount") or 0)
    if amount <= 0:
        return error("Payment amount must be greater than zero.")
    if amount > bill.balance_due + 0.01:
        return error(
            f"Payment amount ({amount:.2f}) exceeds the outstanding balance "
            f"({bill.balance_due:.2f})."
        )

    method = (data.get("payment_method") or "").strip()
    if method not in VALID_METHODS:
        return error(f"payment_method must be one of: {', '.join(VALID_METHODS)}")

    payment = VendorPayment(
        payment_reference = generate_vendor_payment_reference(),
        vendor_bill_id    = bill.id,
        vendor_id         = bill.vendor_id,
        amount            = round(amount, 2),
        payment_date      = _parse_date(data.get("payment_date")),
        payment_method    = method,
        notes             = data.get("notes"),
        created_by        = user_id,
    )
    db.session.add(payment)
    db.session.flush()

    # Update bill balance
    bill.amount_paid = round(bill.amount_paid + amount, 2)
    bill.recalculate_status()

    # Journal entry — DR Payable / CR Bank
    try:
        accounting_service.record_vendor_payment(payment, created_by=user_id)
    except ValueError as e:
        db.session.rollback()
        return error(str(e))

    audit_service.log("CREATE", "vendor_payments", payment.id, user_id,
                      new_values={"payment_reference": payment.payment_reference,
                                  "amount": amount, "vendor_bill_id": bill_id})
    db.session.commit()
    db.session.refresh(payment)

    return created({
        "payment":      payment.to_dict(),
        "bill_status":  bill.status,
        "balance_due":  bill.balance_due,
    })


@vendor_bills_bp.route("/bulk-pay", methods=["POST", "OPTIONS"])
@jwt_required(optional=True)
def bulk_pay_vendor():
    """
    Pay multiple vendor bills with a single payment transaction (e.g. one cheque).
    All bills must belong to the same vendor.

    Body:
    {
      "vendor_id":         1,
      "payment_method":    "bank_transfer",
      "payment_date":      "2026-05-14",
      "payment_reference": "CHQ-00123",
      "notes":             "May batch payment",
      "bills": [
        {"bill_id": 1, "amount": 500.00},
        {"bill_id": 3, "amount": 750.00}
      ]
    }

    Creates one VendorPayment per bill, all sharing the same payment_reference
    (cheque number) and creates accounting entries for each.
    """
    if request.method == "OPTIONS":
        return {}, 200

    user_id = get_jwt_identity()
    if not user_id:
        return error("Authorization required."), 401
    user_id = int(user_id)
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    vendor_id = data.get("vendor_id")
    if not vendor_id:
        return error("vendor_id is required.")
    vendor = Vendor.query.get(vendor_id)
    if not vendor:
        return not_found("Vendor")

    method = (data.get("payment_method") or "").strip()
    if method not in VALID_METHODS:
        return error("payment_method must be one of: " + ", ".join(VALID_METHODS))

    pmt_date = _parse_date(data.get("payment_date"))
    pmt_ref  = (data.get("payment_reference") or "").strip() or None
    notes    = (data.get("notes") or "").strip() or None

    bills_data = data.get("bills") or []
    if not bills_data:
        return error("At least one bill must be included in a bulk payment.")

    # ── Validate all bills up-front ────────────────────────────────────────────
    validated = []
    total_amount = 0.0
    for i, item in enumerate(bills_data):
        bill_id = item.get("bill_id")
        amount  = float(item.get("amount") or 0)
        if not bill_id:
            return error(f"Item {i+1}: bill_id is required.")
        if amount <= 0:
            return error(f"Item {i+1}: amount must be greater than zero.")

        bill = VendorBill.query.get(bill_id)
        if not bill:
            return error(f"Item {i+1}: Vendor bill ID {bill_id} not found.")
        if bill.vendor_id != vendor_id:
            return error(f"Item {i+1}: Bill {bill.bill_reference} does not belong to this vendor.")
        if bill.status == "paid":
            return error(f"Item {i+1}: Bill {bill.bill_reference} is already fully paid.")
        if amount > bill.balance_due + 0.01:
            return error(
                f"Item {i+1}: Payment amount ({amount:.2f}) exceeds balance due "
                f"({bill.balance_due:.2f}) for bill {bill.bill_reference}."
            )
        validated.append((bill, round(amount, 2)))
        total_amount += amount

    # ── Create ONE batch record (single external reference for the whole payment) ─
    batch = VendorPaymentBatch(
        batch_reference   = generate_vendor_batch_reference(),
        vendor_id         = vendor_id,
        payment_method    = method,
        payment_date      = pmt_date,
        payment_reference = pmt_ref,        # user-supplied cheque/transfer ref
        total_amount      = round(total_amount, 2),
        bill_count        = len(validated),
        notes             = notes,
        created_by        = user_id,
    )
    db.session.add(batch)
    db.session.flush()   # get batch.id before creating payments

    # ── Create individual payment record per bill, all linked to the batch ──────
    created_payments = []

    for bill, amount in validated:
        payment = VendorPayment(
            payment_reference = generate_vendor_payment_reference(),
            batch_id          = batch.id,
            vendor_bill_id    = bill.id,
            vendor_id         = bill.vendor_id,
            amount            = amount,
            payment_date      = pmt_date,
            payment_method    = method,
            notes             = notes,
            created_by        = user_id,
        )
        db.session.add(payment)
        db.session.flush()

        # Update bill balance & status
        bill.amount_paid = round(bill.amount_paid + amount, 2)
        bill.recalculate_status()

        # Journal entry — DR Accounts Payable / CR Cash/Bank
        try:
            accounting_service.record_vendor_payment(payment, created_by=user_id)
        except ValueError as e:
            db.session.rollback()
            return error(f"Accounting error for bill {bill.bill_reference}: {e}")

        audit_service.log("CREATE", "vendor_payments", payment.id, user_id,
                          new_values={
                              "payment_reference": payment.payment_reference,
                              "batch_id":          batch.id,
                              "vendor_bill_id":    bill.id,
                              "amount":            amount,
                          })
        created_payments.append(payment)

    db.session.commit()

    return created({
        "batch":          batch.to_dict(),
        "payments":       [p.to_dict() for p in created_payments],
        "total_amount":   round(total_amount, 2),
        "bill_count":     len(created_payments),
    })
