"""
routes/customers.py — Customer management + AR subledger endpoints.

AR SUBLEDGER DESIGN
===================
The customer account behaves like a real Accounts Receivable subledger
(QuickBooks / Sage / SAP style):

  Outstanding Balance = MAX(Total Invoiced - Total Received, 0)
  Advance Credit      = MAX(Total Received - Total Invoiced, 0)

Rules:
  • Outstanding NEVER goes negative.
  • Advance Credit ONLY appears when the customer has overpaid.
  • If the customer has credit, Outstanding stays at zero.
  • Running balance in ledger goes negative for overpayments — displayed as "CR".

Endpoints
---------
GET    /api/customers                      -> list customers (with AR summary)
POST   /api/customers                      -> create customer
GET    /api/customers/<id>                 -> customer profile + AR stats
PUT    /api/customers/<id>                 -> update customer
GET    /api/customers/<id>/bookings        -> booking history
GET    /api/customers/<id>/credit-balance  -> current AR balance (for UI hints)
POST   /api/customers/<id>/credit          -> record advance deposit / credit memo
POST   /api/customers/<id>/apply-credit    -> apply existing credit balance to an open invoice
GET    /api/customers/<id>/statement       -> full AR subledger (invoices + payments + running balance)
"""

from datetime import date as date_type
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.customer import Customer
from ..models.booking import Booking
from ..models.invoice import Invoice
from ..models.payment import Payment
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service, accounting_service
from ..services.reference_service import generate_payment_reference

customers_bp = Blueprint("customers", __name__)

VALID_METHODS = {"cash", "bank_transfer", "credit_card", "mobile_money"}


# ─────────────────────────────────────────────────────────────────────────────
# Helper: compute AR summary for a customer
# ─────────────────────────────────────────────────────────────────────────────

def _ar_summary(customer_id: int) -> dict:
    """
    Compute the correct AR balance summary for a customer.

    Design:
      Applied Payments  = SUM(Invoice.amount_paid)     — cash actually credited to invoices
                          (captures both regular payments AND credit applications)
      Open Credit       = SUM(Payment.unapplied_amount) — cash received, not yet applied
                          (excludes credit_application rows which are internal movements)
      Net Outstanding   = MAX(Total Invoiced - Applied Payments, 0)
                          — what is still owed on invoices

    The two are INDEPENDENT: a customer can have both outstanding invoices AND open credit
    simultaneously.  Open credit must be manually applied via the Apply Credit workflow.
    """
    # Total value of all non-cancelled invoices raised
    total_invoiced = round(float(
        db.session.query(
            db.func.coalesce(db.func.sum(Invoice.total_amount), 0.0)
        ).filter(
            Invoice.customer_id == customer_id,
            Invoice.status != "cancelled",
        ).scalar() or 0.0
    ), 2)

    # Total cash applied to invoices (invoice side is the source of truth —
    # it is updated by both regular payments and credit applications)
    applied_payments = round(float(
        db.session.query(
            db.func.coalesce(db.func.sum(Invoice.amount_paid), 0.0)
        ).filter(
            Invoice.customer_id == customer_id,
            Invoice.status != "cancelled",
        ).scalar() or 0.0
    ), 2)

    # Unallocated cash sitting on the account (excludes internal credit_application records)
    open_credit = round(float(
        db.session.query(
            db.func.coalesce(db.func.sum(Payment.unapplied_amount), 0.0)
        ).filter(
            Payment.customer_id == customer_id,
            Payment.transaction_type != "credit_application",
        ).scalar() or 0.0
    ), 2)

    # Total cash received from customer (for reference only)
    total_received = round(float(
        db.session.query(
            db.func.coalesce(db.func.sum(Payment.amount), 0.0)
        ).filter(
            Payment.customer_id == customer_id,
            Payment.transaction_type != "credit_application",
        ).scalar() or 0.0
    ), 2)

    net_outstanding = max(round(total_invoiced - applied_payments, 2), 0.0)

    return {
        # Primary AR fields
        "total_invoiced":   total_invoiced,
        "applied_payments": applied_payments,   # SUM(invoice.amount_paid)
        "open_credit":      open_credit,         # SUM(payment.unapplied_amount)
        "net_outstanding":  net_outstanding,      # total_invoiced - applied_payments
        "total_received":   total_received,       # total cash in (reference)

        # Legacy aliases — keep so existing callers don't break
        "outstanding":      net_outstanding,
        "advance_credit":   open_credit,
        "credit_balance":   open_credit,
        "total_paid":       applied_payments,
        "net_balance":      round(total_invoiced - applied_payments, 2),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Customer CRUD
# ─────────────────────────────────────────────────────────────────────────────

@customers_bp.get("/")
@jwt_required()
def list_customers():
    search   = request.args.get("search", "").strip()
    page     = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))

    query = Customer.query
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                Customer.name.ilike(like),
                Customer.email.ilike(like),
                Customer.phone.ilike(like),
                Customer.passport_number.ilike(like),
            )
        )

    query     = query.order_by(Customer.name)
    total     = query.count()
    customers = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [c.to_dict(include_stats=True) for c in customers],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@customers_bp.post("/")
@jwt_required()
def create_customer():
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    name = (data.get("name") or "").strip()
    if not name:
        return error("Customer name is required.")

    customer = Customer(
        name            = name,
        email           = (data.get("email") or "").strip() or None,
        phone           = (data.get("phone") or "").strip() or None,
        passport_number = (data.get("passport_number") or "").strip() or None,
        nationality     = (data.get("nationality") or "").strip() or None,
        notes           = data.get("notes"),
        created_by      = user_id,
    )
    db.session.add(customer)
    db.session.flush()
    audit_service.log("CREATE", "customers", customer.id, user_id, new_values=customer.to_dict())
    db.session.commit()

    return created(customer.to_dict())


@customers_bp.get("/<int:customer_id>")
@jwt_required()
def get_customer(customer_id: int):
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")
    return success(customer.to_dict(include_stats=True))


@customers_bp.put("/<int:customer_id>")
@jwt_required()
def update_customer(customer_id: int):
    user_id  = get_jwt_identity()
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    old = customer.to_dict()

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return error("Customer name cannot be empty.")
        customer.name = name
    if "email"           in data: customer.email           = data["email"]
    if "phone"           in data: customer.phone           = data["phone"]
    if "passport_number" in data: customer.passport_number = data["passport_number"]
    if "nationality"     in data: customer.nationality     = data["nationality"]
    if "notes"           in data: customer.notes           = data["notes"]

    audit_service.log("UPDATE", "customers", customer.id, user_id,
                      old_values=old, new_values=customer.to_dict())
    db.session.commit()

    return success(customer.to_dict())


@customers_bp.get("/<int:customer_id>/bookings")
@jwt_required()
def get_customer_bookings(customer_id: int):
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    bookings = (
        Booking.query
        .filter_by(customer_id=customer_id)
        .order_by(Booking.travel_date.desc())
        .all()
    )
    return success({
        "customer": customer.to_dict(),
        "bookings": [b.to_dict() for b in bookings],
    })


# ─────────────────────────────────────────────────────────────────────────────
# AR: Credit balance quick-check  (used by UI to show "apply credit?" hint)
# ─────────────────────────────────────────────────────────────────────────────

@customers_bp.get("/<int:customer_id>/credit-balance")
@jwt_required()
def get_credit_balance(customer_id: int):
    """
    Return the current AR balance for a customer without the full statement.
    Used by the invoice creation form to show "Customer has credit — apply it?"
    """
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    summary = _ar_summary(customer_id)

    return success({
        "customer_id":   customer_id,
        "customer_name": customer.name,
        **summary,
        "has_credit":    summary["advance_credit"] > 0,
        "has_balance":   summary["outstanding"]    > 0,
    })


# ─────────────────────────────────────────────────────────────────────────────
# AR: Record advance deposit / credit memo (not tied to a specific invoice)
# ─────────────────────────────────────────────────────────────────────────────

@customers_bp.post("/<int:customer_id>/credit")
@jwt_required()
def record_customer_advance(customer_id: int):
    """
    Record a customer advance deposit or credit memo that is NOT tied to a
    specific invoice.

    Use cases:
      • Customer pre-pays before an invoice is raised.
      • Customer overpaid on a previous booking and you want to record
        a standalone credit.
      • Issue a credit note / credit memo.

    Unlike regular payments, this does NOT require an open invoice.
    The transaction_type is set to "advance_deposit" (or "credit_memo" if
    the caller passes transaction_type=credit_memo).
    The full amount is stored in Payment.amount as credit on the account.
    The running balance in the customer ledger will go negative (shown as CR).

    Required fields:
        amount         — credit amount
        payment_method — cash | bank_transfer | credit_card | mobile_money

    Optional fields:
        transaction_type   — advance_deposit (default) | credit_memo
        payment_date       — date received (default: today)
        notes              — bank reference / description
    """
    user_id  = int(get_jwt_identity())
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    amount = float(data.get("amount") or 0)
    if amount <= 0:
        return error("Credit amount must be greater than zero.")

    method = (data.get("payment_method") or "").strip()
    if method not in VALID_METHODS:
        return error(f"payment_method must be one of: {', '.join(sorted(VALID_METHODS))}")

    txn_type = (data.get("transaction_type") or "advance_deposit").strip()
    if txn_type not in ("advance_deposit", "credit_memo"):
        txn_type = "advance_deposit"

    raw_date = data.get("payment_date")
    pmt_date = None
    if raw_date:
        try:
            pmt_date = date_type.fromisoformat(str(raw_date))
        except (ValueError, TypeError):
            pass
    if not pmt_date:
        pmt_date = date_type.today()

    notes = (data.get("notes") or "").strip() or None

    # Advance deposits are customer-level; no invoice_id required.
    payment = Payment(
        payment_reference = generate_payment_reference(),
        invoice_id        = None,           # not tied to a specific invoice
        customer_id       = customer_id,
        transaction_type  = txn_type,
        amount            = round(amount, 2),
        amount_applied    = 0.0,            # nothing applied to an invoice yet
        unapplied_amount  = round(amount, 2),  # entire amount is unallocated credit
        payment_date      = pmt_date,
        payment_method    = method,
        notes             = notes,
        created_by        = user_id,
    )
    db.session.add(payment)
    db.session.flush()

    # Journal entry: DR Cash/Bank  CR Accounts Receivable
    try:
        accounting_service.record_customer_payment(payment, created_by=user_id)
    except ValueError as e:
        db.session.rollback()
        return error(str(e))

    audit_service.log("CREATE", "payments", payment.id, user_id,
                      new_values={
                          "payment_reference": payment.payment_reference,
                          "amount":            round(amount, 2),
                          "transaction_type":  txn_type,
                          "customer_id":       customer_id,
                      })
    db.session.commit()
    db.session.refresh(payment)

    summary = _ar_summary(customer_id)

    return created({
        "payment":       payment.to_dict(),
        **summary,
        "has_credit":    summary["advance_credit"] > 0,
    })


# ─────────────────────────────────────────────────────────────────────────────
# AR: Apply existing credit balance to an open invoice
# ─────────────────────────────────────────────────────────────────────────────

@customers_bp.post("/<int:customer_id>/apply-credit")
@jwt_required()
def apply_credit_to_invoice(customer_id: int):
    """
    Apply the customer's existing advance credit balance toward an open invoice.

    This is the core operation for using unallocated cash (credit) to pay
    outstanding invoices — no new cash is collected from the customer.

    Example:
        Customer credit:  10,000  (already received, sitting idle)
        Invoice balance:  12,000  (outstanding)

        Apply credit →    10,000 applied to invoice
        Invoice becomes:   2,000 remaining (collect this separately)
        Customer credit:       0 (fully used up)

    Required fields:
        invoice_id  — the open invoice to apply credit toward

    Optional fields:
        amount      — how much credit to apply (default: min(credit, invoice_balance))
        notes       — staff note (e.g. "Applied advance credit from Jan deposit")
    """
    user_id  = int(get_jwt_identity())
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    # ── Validate invoice ────────────────────────────────────────────
    invoice_id = data.get("invoice_id")
    if not invoice_id:
        return error("invoice_id is required.")
    invoice = Invoice.query.get(invoice_id)
    if not invoice:
        return not_found("Invoice")
    if invoice.customer_id != customer_id:
        return error("Invoice does not belong to this customer.")
    if invoice.status in ("draft", "cancelled"):
        return error(f"Cannot apply credit to a {invoice.status} invoice.")
    if invoice.balance_due <= 0:
        return error("This invoice is already fully paid — no balance to apply credit to.")

    # ── Validate source payment (optional but recommended for audit trail) ──
    source_payment_id = data.get("source_payment_id")
    source_payment    = None
    if source_payment_id:
        source_payment = Payment.query.get(source_payment_id)
        if not source_payment:
            return error("Source payment not found.")
        if source_payment.customer_id != customer_id:
            return error("Source payment does not belong to this customer.")
        if source_payment.unapplied_amount <= 0.005:
            return error("This payment has no unallocated balance remaining.")

    # ── Check available credit ──────────────────────────────────────
    # If a source payment is specified, cap to its unapplied_amount.
    # Otherwise fall back to the global AR advance_credit.
    if source_payment:
        available_credit = round(source_payment.unapplied_amount, 2)
    else:
        ar = _ar_summary(customer_id)
        available_credit = ar["advance_credit"]

    if available_credit <= 0.005:
        return error(
            f"{customer.name} has no advance credit on account. "
            f"Record a payment or advance deposit first."
        )

    # ── Determine how much credit to apply ─────────────────────────
    requested = float(data.get("amount") or 0)
    if requested <= 0:
        # Default: apply as much as possible
        apply_amount = round(min(available_credit, invoice.balance_due), 2)
    else:
        if requested > available_credit + 0.005:
            return error(
                f"Cannot apply {requested:.2f} — only {available_credit:.2f} unallocated on this payment."
            )
        if requested > invoice.balance_due + 0.005:
            return error(
                f"Cannot apply {requested:.2f} — invoice balance due is only {invoice.balance_due:.2f}."
            )
        apply_amount = round(requested, 2)

    notes = (data.get("notes") or f"Credit applied to {invoice.invoice_number}").strip()

    # ── Decrement source payment's unapplied_amount (audit trail) ──
    if source_payment:
        source_payment.amount_applied   = round(source_payment.amount_applied   + apply_amount, 2)
        source_payment.unapplied_amount = round(source_payment.unapplied_amount - apply_amount, 2)
        if source_payment.unapplied_amount < 0:
            source_payment.unapplied_amount = 0.0

    # ── Create a credit-application payment record ──────────────────
    # transaction_type = "credit_application"
    # payment_method   = "credit_balance" (no new cash — internal transfer)
    # amount           = apply_amount (offsets the AR running balance)
    # amount_applied   = apply_amount (fully applied to this invoice)
    # unapplied_amount = 0
    payment = Payment(
        payment_reference = generate_payment_reference(),
        invoice_id        = invoice.id,
        customer_id       = customer_id,
        transaction_type  = "credit_application",
        amount            = apply_amount,
        amount_applied    = apply_amount,
        unapplied_amount  = 0.0,
        payment_date      = date_type.today(),
        payment_method    = "credit_balance",   # internal — no cash received
        notes             = notes,
        created_by        = user_id,
    )
    db.session.add(payment)
    db.session.flush()

    # ── Update invoice ──────────────────────────────────────────────
    invoice.amount_paid = round(
        min(invoice.amount_paid + apply_amount, invoice.total_amount), 2
    )
    invoice.recalculate_status()

    audit_service.log("CREATE", "payments", payment.id, user_id,
                      new_values={
                          "payment_reference":  payment.payment_reference,
                          "amount":             apply_amount,
                          "transaction_type":   "credit_application",
                          "invoice_id":         invoice_id,
                          "customer_id":        customer_id,
                          "source_payment_id":  source_payment_id,
                          "notes":              notes,
                      })
    db.session.commit()
    db.session.refresh(payment)

    # ── Updated AR summary ──────────────────────────────────────────
    updated_ar = _ar_summary(customer_id)

    return created({
        "payment":           payment.to_dict(),
        "invoice_status":    invoice.status,
        "invoice_balance":   invoice.balance_due,
        "credit_applied":    apply_amount,
        "credit_remaining":  updated_ar["advance_credit"],
        "outstanding_after": updated_ar["outstanding"],
        **updated_ar,
    })


# ─────────────────────────────────────────────────────────────────────────────
# AR: Full customer account statement  (proper AR subledger)
# ─────────────────────────────────────────────────────────────────────────────

@customers_bp.get("/<int:customer_id>/statement")
@jwt_required()
def get_customer_statement(customer_id: int):
    """
    Return the full AR subledger for a customer.

    Summary block:
        total_invoiced  — sum of all non-cancelled invoice totals
        total_received  — sum of all payment amounts
        outstanding     — MAX(invoiced - received, 0)  [never negative]
        advance_credit  — MAX(received - invoiced, 0)  [only when overpaid]
        net_balance     — invoiced - received  [negative = credit on account]

    Ledger entries (chronological):
        entry_type      — invoice | invoice_payment | advance_deposit | credit_memo | refund | adjustment
        date            — event date
        reference       — INV-xxx or PAY-xxx
        debit           — invoice total (charges to customer)
        credit          — full payment / credit amount received
        running_balance — cumulative DR - CR  (negative = credit)
        balance_label   — "DR" | "CR" | "Settled"

    Invoice status is computed from the invoice's own fields — independent
    of the running account balance.
    """
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    # ── Load all non-cancelled invoices ───────────────────────────────────────
    invoices = (
        Invoice.query
        .filter_by(customer_id=customer_id)
        .filter(Invoice.status != "cancelled")
        .order_by(Invoice.issue_date, Invoice.id)
        .all()
    )

    # ── Load ALL payments / AR transactions ───────────────────────────────────
    payments = (
        Payment.query
        .filter_by(customer_id=customer_id)
        .order_by(Payment.payment_date, Payment.id)
        .all()
    )

    # ── Build raw entry list ───────────────────────────────────────────────────
    raw_entries = []

    for inv in invoices:
        # Build service description from booking items
        service_types     = []
        description_parts = []
        if inv.booking and inv.booking.items:
            for item in inv.booking.items:
                if item.service_type not in service_types:
                    service_types.append(item.service_type)
                    description_parts.append(item.service_type.replace("_", " ").title())

        svc_label = " + ".join(description_parts) if description_parts else "Services"
        dest      = (inv.booking.destination or "") if inv.booking else ""
        desc      = f"{svc_label} — {dest}" if dest else svc_label

        # Invoice status badge logic (independent of account balance)
        if inv.status == "paid":
            inv_status_display = "paid"
        elif inv.status == "partially_paid":
            inv_status_display = "partially_paid"
        elif inv.status == "overdue":
            inv_status_display = "overdue"
        else:
            inv_status_display = inv.status   # issued, draft, etc.

        sort_date = inv.issue_date.isoformat() if inv.issue_date else "0000-01-01"
        raw_entries.append({
            "entry_type":       "invoice",
            "date":             sort_date,
            "sort_key":         f"{sort_date}_A_inv_{inv.id:06d}",   # A = invoices before same-day pmts
            "reference":        inv.invoice_number,
            "booking_ref":      inv.booking.booking_reference if inv.booking else None,
            "booking_id":       inv.booking_id,
            "invoice_id":       inv.id,
            "service_types":    service_types,
            "description":      desc,
            "debit":            round(inv.total_amount, 2),
            "credit":           0.0,
            "status":           inv_status_display,
            # Invoice-level payment details (independent of account balance)
            "invoice_total":    round(inv.total_amount, 2),
            "invoice_paid":     round(inv.amount_paid, 2),
            "invoice_balance":  round(inv.balance_due, 2),
        })

    for pmt in payments:
        method_label = (pmt.payment_method or "").replace("_", " ").title()
        txn_type     = pmt.transaction_type or "invoice_payment"

        # Build description
        if txn_type == "credit_application":
            inv_ref = pmt.invoice.invoice_number if pmt.invoice else "invoice"
            desc = f"Credit applied to {inv_ref}"
            if pmt.notes:
                desc += f" — {pmt.notes}"
        elif txn_type == "advance_deposit":
            desc = f"Advance deposit / pre-payment — {method_label}"
            if pmt.notes:
                desc += f" ({pmt.notes})"
        elif txn_type == "credit_memo":
            desc = f"Credit memo — {method_label}"
            if pmt.notes:
                desc += f" ({pmt.notes})"
        elif txn_type == "refund":
            desc = f"Refund — {method_label}"
            if pmt.notes:
                desc += f" ({pmt.notes})"
        elif txn_type == "write_off":
            desc = f"Bad-debt write-off"
            if pmt.notes:
                desc += f" — {pmt.notes}"
        elif txn_type == "adjustment":
            desc = f"Balance adjustment"
            if pmt.notes:
                desc += f" — {pmt.notes}"
        else:
            # invoice_payment — legacy [ADVANCE] notes handling for old records
            if pmt.notes and pmt.notes.startswith("[ADVANCE]"):
                txn_type = "advance_deposit"
                extra    = pmt.notes.replace("[ADVANCE]", "").strip().lstrip("—").strip()
                desc     = f"Advance deposit / pre-payment — {method_label}"
                if extra:
                    desc += f" ({extra})"
            else:
                desc = f"{method_label} payment"
                if pmt.notes:
                    desc += f" — {pmt.notes}"

        # Link to booking (via invoice)
        booking_ref = None
        booking_id  = None
        if pmt.invoice and pmt.invoice.booking:
            booking_ref = pmt.invoice.booking.booking_reference
            booking_id  = pmt.invoice.booking_id

        inv_ref = pmt.invoice.invoice_number if pmt.invoice else None

        # ── Payment allocation status ──────────────────────────────────────
        amt           = round(pmt.amount or 0.0, 2)
        amt_applied   = round(pmt.amount_applied or 0.0, 2)
        amt_unapplied = round(pmt.unapplied_amount or 0.0, 2)

        if txn_type == "credit_application":
            payment_status = "applied"          # internal credit movement
        elif amt_unapplied >= amt - 0.005:
            payment_status = "open_credit"      # nothing applied to an invoice yet
        elif amt_unapplied > 0.005:
            payment_status = "partially_applied"# some applied, some still open
        else:
            payment_status = "fully_applied"    # all cash has been applied

        sort_date = pmt.payment_date.isoformat() if pmt.payment_date else "0000-01-01"
        raw_entries.append({
            "entry_type":        txn_type,
            "date":              sort_date,
            "sort_key":          f"{sort_date}_B_pmt_{pmt.id:06d}",
            "payment_id":        pmt.id,
            "reference":         pmt.payment_reference,
            "booking_ref":       booking_ref,
            "booking_id":        booking_id,
            "invoice_id":        pmt.invoice_id,
            "invoice_number":    inv_ref,
            "description":       desc,
            "payment_method":    pmt.payment_method,
            "debit":             0.0,
            "credit":            amt,             # full cash received (display only)
            "amount_applied":    amt_applied,     # applied to an invoice
            "unapplied_amount":  amt_unapplied,   # open / unallocated
            "payment_status":    payment_status,  # open_credit | partially_applied | fully_applied | applied
            "status":            "received",
        })

    # ── Sort chronologically ───────────────────────────────────────────────────
    raw_entries.sort(key=lambda e: e["sort_key"])

    # ── Compute running balance ────────────────────────────────────────────────
    # Running balance = invoice outstanding (charges minus what has been APPLIED to invoices).
    # Open credits are tracked separately via SUM(unapplied_amount).
    # credit_application rows DO reduce the running balance (they apply credit to invoices).
    # Advance deposits do NOT reduce the running balance until they are applied.
    running = 0.0
    entries = []
    for e in raw_entries:
        if e["entry_type"] == "invoice":
            # Charge to customer
            running = round(running + e["debit"], 2)
        else:
            # Only the APPLIED portion reduces the invoice outstanding.
            # credit_application.amount_applied reduces invoice balance (correct).
            # Unapplied portion of regular payments goes to open credit, not here.
            running = round(running - e.get("amount_applied", 0.0), 2)

        e["running_balance"] = running
        if running > 0.005:
            e["balance_label"] = "DR"    # still owed on invoices
        elif running < -0.005:
            e["balance_label"] = "CR"    # over-applied (should be rare)
        else:
            e["balance_label"] = "NIL"   # invoices settled
        del e["sort_key"]
        entries.append(e)

    # ── AR summary — use _ar_summary() for consistent correct formulas ─────────
    ar = _ar_summary(customer_id)

    invoice_count = len([e for e in entries if e["entry_type"] == "invoice"])
    payment_count = len([e for e in entries if e["entry_type"] != "invoice"])

    return success({
        "customer": customer.to_dict(include_stats=True),
        "summary": {
            # Core AR figures (new correct model)
            "total_invoiced":   ar["total_invoiced"],
            "applied_payments": ar["applied_payments"],  # applied to invoices
            "open_credit":      ar["open_credit"],        # unallocated cash
            "net_outstanding":  ar["net_outstanding"],    # still owed on invoices

            # Legacy aliases — keep so old frontend references don't break
            "total_received":   ar["total_received"],
            "total_paid":       ar["applied_payments"],
            "outstanding":      ar["net_outstanding"],
            "advance_credit":   ar["open_credit"],
            "credit_balance":   ar["open_credit"],
            "net_balance":      ar["net_balance"],

            # Counts and flags
            "invoice_count":    invoice_count,
            "payment_count":    payment_count,
            "has_credit":       ar["open_credit"]      > 0.005,
            "has_outstanding":  ar["net_outstanding"]  > 0.005,
            "is_settled":       ar["net_outstanding"]  == 0.0 and ar["open_credit"] == 0.0,
        },
        "entries": entries,
    })
