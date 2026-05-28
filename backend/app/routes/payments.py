"""
routes/payments.py — Customer payment / AR transaction endpoints.

AR SUBLEDGER LOGIC
==================
Every payment stores the FULL amount received.  The system then computes:

  amount_applied   = min(amount, invoice.balance_due)   [capped at what invoice owed]
  unapplied_amount = amount - amount_applied              [excess = customer credit]

invoice.amount_paid is ALWAYS capped at invoice.total_amount so an invoice
can never show a negative balance_due.  The excess credit lives on the customer
account — visible in the customer statement running balance and summary cards.

POST /api/payments          → record invoice payment (partial / full / overpayment)
POST /api/payments/bulk     → record payments across multiple invoices at once
GET  /api/payments          → list all payments (filter by invoice / customer)
GET  /api/payments/<id>     → single payment detail
"""

from datetime import date
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.invoice import Invoice
from ..models.payment import Payment
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service, accounting_service
from ..services.reference_service import generate_payment_reference

payments_bp = Blueprint("payments", __name__)

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


def _compute_ar_split(amount: float, invoice: Invoice):
    """
    Given a raw payment amount and an invoice, compute how much is applied vs
    unapplied (credit).

    Returns: (amount_applied, unapplied_amount, new_invoice_amount_paid)
    """
    balance_due      = max(round(invoice.balance_due, 2), 0.0)
    amount_applied   = round(min(amount, balance_due), 2)
    unapplied_amount = round(amount - amount_applied, 2)
    new_paid         = round(min(invoice.amount_paid + amount_applied, invoice.total_amount), 2)
    return amount_applied, unapplied_amount, new_paid


@payments_bp.post("/")
@jwt_required()
def record_payment():
    """
    Record a customer payment against an invoice.

    AR behaviour:
      - amount can exceed the invoice balance (overpayment allowed).
      - amount_applied  = portion credited to this invoice (≤ balance due).
      - unapplied_amount = excess stored as customer advance credit.
      - invoice.amount_paid is capped at invoice.total_amount.
      - invoice status is recalculated automatically.

    Required fields:
        invoice_id     — the invoice being paid
        amount         — FULL amount received (may exceed balance due)
        payment_method — cash | bank_transfer | credit_card | mobile_money

    Optional fields:
        payment_date   — date received (default: today)
        notes          — bank reference / receipt number
    """
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    # ── Validate invoice ────────────────────────────────────────────
    invoice_id = data.get("invoice_id")
    if not invoice_id:
        return error("invoice_id is required.")
    invoice = Invoice.query.get(invoice_id)
    if not invoice:
        return not_found("Invoice")
    if invoice.status in ("draft", "cancelled"):
        return error(f"Cannot record payment on a {invoice.status} invoice.")

    # ── Validate amount ─────────────────────────────────────────────
    amount = float(data.get("amount") or 0)
    if amount <= 0:
        return error("Payment amount must be greater than zero.")

    # ── Validate payment method ─────────────────────────────────────
    method = (data.get("payment_method") or "").strip()
    if method not in VALID_METHODS:
        return error(f"payment_method must be one of: {', '.join(sorted(VALID_METHODS))}")

    # ── AR split calculation ────────────────────────────────────────
    amount_applied, unapplied_amount, new_paid = _compute_ar_split(amount, invoice)

    # ── Create payment record (full amount stored) ──────────────────
    payment = Payment(
        payment_reference = generate_payment_reference(),
        invoice_id        = invoice.id,
        customer_id       = invoice.customer_id,
        transaction_type  = "invoice_payment",
        amount            = round(amount, 2),
        amount_applied    = amount_applied,
        unapplied_amount  = unapplied_amount,
        payment_date      = _parse_date(data.get("payment_date")) or date.today(),
        payment_method    = method,
        notes             = data.get("notes"),
        created_by        = user_id,
    )
    db.session.add(payment)
    db.session.flush()  # get payment.id before journal entry

    # ── Update invoice ──────────────────────────────────────────────
    invoice.amount_paid = new_paid
    invoice.recalculate_status()

    # ── Journal entry: DR Cash/Bank  CR Accounts Receivable ────────
    try:
        accounting_service.record_customer_payment(payment, created_by=user_id)
    except ValueError as e:
        db.session.rollback()
        return error(str(e))

    audit_service.log("CREATE", "payments", payment.id, user_id,
                      new_values={
                          "payment_reference": payment.payment_reference,
                          "amount":            round(amount, 2),
                          "amount_applied":    amount_applied,
                          "unapplied_amount":  unapplied_amount,
                          "invoice_id":        invoice_id,
                          "transaction_type":  "invoice_payment",
                      })
    db.session.commit()
    db.session.refresh(payment)

    return created({
        "payment":          payment.to_dict(),
        "invoice_status":   invoice.status,
        "balance_due":      invoice.balance_due,
        "amount_applied":   amount_applied,
        "unapplied_amount": unapplied_amount,   # > 0 when customer overpaid
        "has_credit":       unapplied_amount > 0,
    })


@payments_bp.post("/bulk")
@jwt_required()
def bulk_payment():
    """
    Record payments across multiple invoices in one transaction.

    Body:
        payment_method    — cash | bank_transfer | credit_card | mobile_money
        payment_date      — YYYY-MM-DD (default: today)
        notes             — optional notes shared across all payments
        invoices          — list of { invoice_id, amount }

    Each entry is processed with the same AR split logic as a single payment.
    Overpayment on individual invoices in bulk mode is allowed.
    """
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    method = (data.get("payment_method") or "").strip()
    if method not in VALID_METHODS:
        return error(f"payment_method must be one of: {', '.join(sorted(VALID_METHODS))}")

    pmt_date     = _parse_date(data.get("payment_date")) or date.today()
    notes_shared = data.get("notes") or None

    invoice_payments = data.get("invoices") or []
    if not invoice_payments:
        return error("invoices list is required and must not be empty.")

    results     = []
    errors_list = []

    for item in invoice_payments:
        inv_id = item.get("invoice_id")
        amount = float(item.get("amount") or 0)

        if not inv_id:
            errors_list.append("Missing invoice_id in one of the entries.")
            continue
        if amount <= 0:
            errors_list.append(f"Amount for invoice #{inv_id} must be greater than zero.")
            continue

        invoice = Invoice.query.get(inv_id)
        if not invoice:
            errors_list.append(f"Invoice #{inv_id} not found.")
            continue
        if invoice.status in ("draft", "cancelled"):
            errors_list.append(f"Invoice #{inv_id} is {invoice.status} — cannot receive payment.")
            continue
        if invoice.balance_due <= 0:
            errors_list.append(f"Invoice #{inv_id} is already fully paid — skipped.")
            continue

        amount_applied, unapplied_amount, new_paid = _compute_ar_split(amount, invoice)

        payment = Payment(
            payment_reference = generate_payment_reference(),
            invoice_id        = invoice.id,
            customer_id       = invoice.customer_id,
            transaction_type  = "invoice_payment",
            amount            = round(amount, 2),
            amount_applied    = amount_applied,
            unapplied_amount  = unapplied_amount,
            payment_date      = pmt_date,
            payment_method    = method,
            notes             = notes_shared,
            created_by        = user_id,
        )
        db.session.add(payment)
        db.session.flush()

        invoice.amount_paid = new_paid
        invoice.recalculate_status()

        try:
            accounting_service.record_customer_payment(payment, created_by=user_id)
        except ValueError as e:
            db.session.rollback()
            return error(f"Accounting error for invoice #{inv_id}: {e}")

        audit_service.log("CREATE", "payments", payment.id, user_id,
                          new_values={
                              "payment_reference": payment.payment_reference,
                              "amount":            round(amount, 2),
                              "amount_applied":    amount_applied,
                              "unapplied_amount":  unapplied_amount,
                              "invoice_id":        inv_id,
                              "bulk":              True,
                          })
        results.append(payment.to_dict())

    if errors_list and not results:
        db.session.rollback()
        return error("; ".join(errors_list))

    db.session.commit()

    return created({
        "payments":         results,
        "count":            len(results),
        "errors":           errors_list,
        "total_received":   round(sum(r["amount"] for r in results), 2),
        "total_applied":    round(sum(r["amount_applied"] for r in results), 2),
        "total_unapplied":  round(sum(r["unapplied_amount"] for r in results), 2),
    })


@payments_bp.get("/")
@jwt_required()
def list_payments():
    """
    List customer payments / AR transactions.

    Query params:
        invoice_id        — filter by invoice
        customer_id       — filter by customer
        transaction_type  — filter by type (invoice_payment | advance_deposit | …)
        page / per_page
    """
    invoice_id       = request.args.get("invoice_id",       type=int)
    customer_id      = request.args.get("customer_id",      type=int)
    transaction_type = request.args.get("transaction_type")
    page             = int(request.args.get("page", 1))
    per_page         = int(request.args.get("per_page", 20))

    query = Payment.query

    if invoice_id:
        query = query.filter_by(invoice_id=invoice_id)
    if customer_id:
        query = query.filter_by(customer_id=customer_id)
    if transaction_type:
        query = query.filter_by(transaction_type=transaction_type)

    query    = query.order_by(Payment.payment_date.desc(), Payment.id.desc())
    total    = query.count()
    payments = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [p.to_dict() for p in payments],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@payments_bp.get("/<int:payment_id>")
@jwt_required()
def get_payment(payment_id: int):
    """Return a single payment / AR transaction record."""
    payment = Payment.query.get(payment_id)
    if not payment:
        return not_found("Payment")
    return success(payment.to_dict())
