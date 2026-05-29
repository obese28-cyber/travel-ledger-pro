"""
routes/reports.py -- Financial reporting endpoints.

GET /api/reports/dashboard           -> key metrics for the dashboard
GET /api/reports/profit-loss         -> Profit & Loss statement
GET /api/reports/daily-sales         -> sales totals grouped by day
GET /api/reports/customer-balances   -> outstanding amounts owed by customers
GET /api/reports/vendor-balances     -> outstanding amounts owed to vendors

All report endpoints accept optional query params:
    date_from  -- start date (YYYY-MM-DD), default: first day of current month
    date_to    -- end date   (YYYY-MM-DD), default: today
"""

from datetime import date, timedelta
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, and_, text
from ..extensions import db


def _month_label(col):
    """Return a SQL expression for YYYY-MM grouping, compatible with SQLite and PostgreSQL."""
    import os
    db_url = os.environ.get("DATABASE_URL", "")
    if "postgres" in db_url:
        return func.to_char(col, "YYYY-MM")
    return func.strftime("%Y-%m", col)
from ..models.invoice import Invoice
from ..models.payment import Payment
from ..models.vendor_bill import VendorBill, VendorPayment
from ..models.expense import Expense
from ..models.booking import Booking, BookingItem
from ..models.customer import Customer
from ..models.vendor import Vendor
from ..models.accounting import JournalEntryLine, ChartOfAccount, JournalEntry
from ..models.trial_balance import TrialBalanceEntry, TRIAL_BALANCE_CATEGORIES, CATEGORY_LABELS
from ..utils.responses import success, error

reports_bp = Blueprint("reports", __name__)


def _parse_dates():
    """Parse date_from and date_to from query params. Default to current month."""
    today      = date.today()
    first_day  = today.replace(day=1)
    date_from  = request.args.get("date_from", first_day.isoformat())
    date_to    = request.args.get("date_to",   today.isoformat())
    try:
        return date_from, date_to
    except Exception:
        return first_day.isoformat(), today.isoformat()


def _account_balance(account_code: str, date_from: str, date_to: str) -> float:
    """
    Sum all journal entry line movements for a given account code within a date range.
    Returns: total_debits - total_credits (net movement)
    """
    result = db.session.query(
        func.sum(JournalEntryLine.debit  - JournalEntryLine.credit)
    ).join(
        JournalEntryLine.entry
    ).join(
        JournalEntryLine.account
    ).filter(
        ChartOfAccount.account_code == account_code,
        JournalEntry.entry_date >= date_from,
        JournalEntry.entry_date <= date_to,
        JournalEntry.is_posted == True,
    ).scalar()
    return round(result or 0.0, 2)


def _sum_account_type(account_type: str, date_from: str, date_to: str,
                      code_prefix: str = None) -> float:
    """
    Sum net movements across all accounts of a given type (and optional code prefix).
    For revenue accounts: net movement = credits - debits (revenue increases with credits)
    For expense accounts: net movement = debits - credits (expenses increase with debits)
    """
    query = db.session.query(
        func.sum(JournalEntryLine.debit - JournalEntryLine.credit)
    ).join(JournalEntryLine.entry).join(JournalEntryLine.account).filter(
        ChartOfAccount.account_type == account_type,
        JournalEntry.entry_date >= date_from,
        JournalEntry.entry_date <= date_to,
        JournalEntry.is_posted == True,
    )
    if code_prefix:
        query = query.filter(ChartOfAccount.account_code.like(f"{code_prefix}%"))

    result = query.scalar() or 0.0

    # For revenue, a credit entry increases revenue, so we negate (credits > debits -> positive revenue)
    if account_type == "revenue":
        return round(-result, 2)
    # For expense, a debit entry increases expense
    return round(result, 2)


# ---------------------------------------------------------------------------

@reports_bp.get("/dashboard")
@jwt_required()
def dashboard():
    """
    Return the key metrics shown on the main dashboard.
    """
    today     = date.today()
    # Dashboard defaults to year-to-date so all entries in the current year appear.
    # Callers can override via ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    ytd_start = today.replace(month=1, day=1).isoformat()
    date_from = request.args.get("date_from", ytd_start)
    date_to   = request.args.get("date_to",   today.isoformat())

    # Revenue: sum invoice totals by issue_date (accrual basis — revenue recognised
    # when invoice is raised, not when cash is received).
    # Cancelled invoices are excluded; all other statuses count.
    total_revenue = round(
        db.session.query(func.sum(Invoice.total_amount)).filter(
            Invoice.issue_date >= date_from,
            Invoice.issue_date <= date_to,
            Invoice.status != "cancelled",
        ).scalar() or 0.0, 2
    )

    # COGS: sum BookingItem vendor costs for bookings whose invoice was issued
    # in the period (accrual basis — COGS recognised when revenue is recognised).
    total_cogs = round(
        db.session.query(func.sum(BookingItem.vendor_cost))
        .join(Booking,  Booking.id  == BookingItem.booking_id)
        .join(Invoice,  Invoice.booking_id == Booking.id)
        .filter(
            Invoice.issue_date >= date_from,
            Invoice.issue_date <= date_to,
            Invoice.status     != "cancelled",
        ).scalar() or 0.0, 2
    )

    # Operating expenses: query Expense table directly (source-of-truth)
    total_opex = round(
        db.session.query(func.sum(Expense.amount)).filter(
            Expense.expense_date >= date_from,
            Expense.expense_date <= date_to,
        ).scalar() or 0.0, 2
    )

    gross_profit = round(total_revenue - total_cogs, 2)
    net_profit   = round(gross_profit - total_opex, 2)

    # Outstanding customer balances (unpaid invoices)
    outstanding_customers = db.session.query(
        func.sum(Invoice.total_amount - Invoice.amount_paid)
    ).filter(
        Invoice.status.notin_(["paid", "cancelled", "draft"])
    ).scalar() or 0.0

    # Outstanding vendor balances (unpaid bills)
    outstanding_vendors = db.session.query(
        func.sum(VendorBill.amount - VendorBill.amount_paid)
    ).filter(
        VendorBill.status.notin_(["paid"])
    ).scalar() or 0.0

    # Recent payments (last 5)
    recent_payments = Payment.query.order_by(Payment.payment_date.desc()).limit(5).all()

    # Booking counts by status
    booking_counts = db.session.query(
        Booking.status, func.count(Booking.id)
    ).group_by(Booking.status).all()
    booking_summary = {status: count for status, count in booking_counts}

    return success({
        "period":                  {"from": date_from, "to": date_to},
        "total_revenue":           round(total_revenue, 2),
        "total_cogs":              round(total_cogs, 2),
        "gross_profit":            gross_profit,
        "total_operating_expenses": round(total_opex, 2),
        "net_profit":              net_profit,
        "outstanding_customer_balances": round(outstanding_customers, 2),
        "outstanding_vendor_balances":   round(outstanding_vendors, 2),
        "recent_payments":         [p.to_dict() for p in recent_payments],
        "booking_summary":         booking_summary,
    })


@reports_bp.get("/profit-loss")
@jwt_required()
def profit_and_loss():
    """
    Profit & Loss statement for a given period.

    COGS is calculated in two ways:
    1. From vendor bills linked to booking items (accurate, requires bills to be entered)
    2. Fallback: from booking item vendor_cost estimates (always available)

    Operating expenses come from journal entries on 6xxx accounts.
    """
    date_from, date_to = _parse_dates()

    # -- Revenue from journal entries (4xxx) ----------------------------------
    revenue = _sum_account_type("revenue", date_from, date_to)

    # -- Cost of Sales --------------------------------------------------------
    # Label each service type with a human-readable name
    SERVICE_TYPE_LABELS = {
        "flight":       "Flight Tickets",
        "hotel":        "Hotel Reservations",
        "visa":         "Visa Services",
        "tour_package": "Tour Packages",
        "insurance":    "Travel Insurance",
        "other":        "Other Services",
    }

    # Source 1: vendor bills linked to booking items (grouped by service type)
    billed_by_service = db.session.query(
        BookingItem.service_type,
        func.sum(VendorBill.amount).label("total"),
    ).join(
        VendorBill, VendorBill.booking_item_id == BookingItem.id
    ).filter(
        VendorBill.bill_date >= date_from,
        VendorBill.bill_date <= date_to,
    ).group_by(BookingItem.service_type).all()

    # Source 2: vendor bills NOT linked to any booking item
    unlinked_total = db.session.query(
        func.sum(VendorBill.amount)
    ).filter(
        VendorBill.bill_date >= date_from,
        VendorBill.bill_date <= date_to,
        VendorBill.booking_item_id.is_(None),
    ).scalar() or 0.0

    cogs_breakdown = []
    total_cogs = 0.0

    for service_type, total in billed_by_service:
        amt = round(total or 0.0, 2)
        if amt:
            cogs_breakdown.append({
                "account_name": SERVICE_TYPE_LABELS.get(
                    service_type,
                    service_type.replace("_", " ").title()
                ),
                "account_code": BookingItem.COGS_ACCOUNT_MAP.get(service_type, "5000"),
                "amount":       amt,
                "source":       "vendor_bill",
            })
            total_cogs += amt

    if unlinked_total > 0:
        cogs_breakdown.append({
            "account_name": "Other Vendor Costs",
            "account_code": "5000",
            "amount":       round(unlinked_total, 2),
            "source":       "vendor_bill",
        })
        total_cogs += unlinked_total

    # Fallback: if no vendor bills recorded yet, estimate from booking item vendor_cost
    if total_cogs == 0:
        booking_cogs = db.session.query(
            BookingItem.service_type,
            func.sum(BookingItem.vendor_cost).label("total"),
        ).join(
            Booking, Booking.id == BookingItem.booking_id
        ).filter(
            Booking.created_at >= date_from,
            Booking.created_at <= date_to,
            Booking.status.notin_(["cancelled"]),
        ).group_by(BookingItem.service_type).all()

        for service_type, total in booking_cogs:
            amt = round(total or 0.0, 2)
            if amt:
                label = SERVICE_TYPE_LABELS.get(
                    service_type,
                    service_type.replace("_", " ").title()
                )
                cogs_breakdown.append({
                    "account_name": label + " (estimated)",
                    "account_code": BookingItem.COGS_ACCOUNT_MAP.get(service_type, "5000"),
                    "amount":       amt,
                    "source":       "booking_estimate",
                })
                total_cogs += amt

    total_cogs = round(total_cogs, 2)

    # -- Operating Expenses ---------------------------------------------------
    opex_accounts = ChartOfAccount.query.filter(
        ChartOfAccount.account_code.like("6%"),
        ChartOfAccount.is_active == True,
    ).order_by(ChartOfAccount.account_code).all()

    opex_breakdown = []
    total_opex = 0.0
    for acct in opex_accounts:
        amount = _account_balance(acct.account_code, date_from, date_to)
        if amount != 0:
            opex_breakdown.append({
                "account_code": acct.account_code,
                "account_name": acct.account_name,
                "amount":       amount,
            })
            total_opex += amount

    gross_profit = round(revenue - total_cogs, 2)
    net_profit   = round(gross_profit - total_opex, 2)

    return success({
        "period":       {"from": date_from, "to": date_to},
        "revenue":      round(revenue, 2),
        "cogs": {
            "total":     round(total_cogs, 2),
            "breakdown": cogs_breakdown,
        },
        "gross_profit": gross_profit,
        "operating_expenses": {
            "total":     round(total_opex, 2),
            "breakdown": opex_breakdown,
        },
        "net_profit":   net_profit,
    })


@reports_bp.get("/daily-sales")
@jwt_required()
def daily_sales():
    """
    Sales totals grouped by day within the selected period.
    Shows invoices issued and payments received per day.
    """
    date_from, date_to = _parse_dates()

    # Invoices issued per day
    invoices_by_day = db.session.query(
        Invoice.issue_date,
        func.count(Invoice.id).label("invoice_count"),
        func.sum(Invoice.total_amount).label("total_invoiced"),
    ).filter(
        Invoice.issue_date >= date_from,
        Invoice.issue_date <= date_to,
        Invoice.status.notin_(["draft", "cancelled"]),
    ).group_by(Invoice.issue_date).order_by(Invoice.issue_date).all()

    # Payments received per day
    payments_by_day = db.session.query(
        Payment.payment_date,
        func.count(Payment.id).label("payment_count"),
        func.sum(Payment.amount).label("total_collected"),
    ).filter(
        Payment.payment_date >= date_from,
        Payment.payment_date <= date_to,
    ).group_by(Payment.payment_date).order_by(Payment.payment_date).all()

    # Merge into a dict keyed by date
    days = {}
    for row in invoices_by_day:
        d = row.issue_date.isoformat() if hasattr(row.issue_date, "isoformat") else str(row.issue_date)
        days.setdefault(d, {})["invoiced"]      = round(row.total_invoiced or 0, 2)
        days[d]["invoice_count"] = row.invoice_count

    for row in payments_by_day:
        d = row.payment_date.isoformat() if hasattr(row.payment_date, "isoformat") else str(row.payment_date)
        days.setdefault(d, {})["collected"]     = round(row.total_collected or 0, 2)
        days[d]["payment_count"] = row.payment_count

    # Sort by date
    daily = [{"date": k, **v} for k, v in sorted(days.items())]

    return success({
        "period": {"from": date_from, "to": date_to},
        "daily":  daily,
        "totals": {
            "total_invoiced":  round(sum(r.get("invoiced",  0) for r in daily), 2),
            "total_collected": round(sum(r.get("collected", 0) for r in daily), 2),
        },
    })


@reports_bp.get("/customer-balances")
@jwt_required()
def customer_balances():
    """
    List all customers with outstanding invoice balances.
    Only returns customers who have at least one unpaid invoice.
    """
    rows = db.session.query(
        Customer.id,
        Customer.name,
        Customer.email,
        Customer.phone,
        func.count(Invoice.id).label("open_invoices"),
        func.sum(Invoice.total_amount - Invoice.amount_paid).label("total_outstanding"),
    ).join(Invoice, Invoice.customer_id == Customer.id).filter(
        Invoice.status.notin_(["paid", "cancelled", "draft"])
    ).group_by(Customer.id).order_by(
        func.sum(Invoice.total_amount - Invoice.amount_paid).desc()
    ).all()

    customers = [{
        "customer_id":       r.id,
        "customer_name":     r.name,
        "email":             r.email,
        "phone":             r.phone,
        "open_invoices":     r.open_invoices,
        "total_outstanding": round(r.total_outstanding or 0, 2),
    } for r in rows]

    total_outstanding = round(sum(c["total_outstanding"] for c in customers), 2)

    return success({
        "customers":        customers,
        "total_outstanding": total_outstanding,
    })


@reports_bp.get("/vendor-balances")
@jwt_required()
def vendor_balances():
    """
    List all vendors with outstanding balances (unpaid bills).
    Sorted by total owed, highest first.
    """
    rows = db.session.query(
        Vendor.id,
        Vendor.name,
        Vendor.type,
        Vendor.email,
        Vendor.phone,
        func.count(VendorBill.id).label("open_bills"),
        func.sum(VendorBill.amount - VendorBill.amount_paid).label("total_outstanding"),
    ).join(VendorBill, VendorBill.vendor_id == Vendor.id).filter(
        VendorBill.status.notin_(["paid"])
    ).group_by(Vendor.id).order_by(
        func.sum(VendorBill.amount - VendorBill.amount_paid).desc()
    ).all()

    vendors = [{
        "vendor_id":         r.id,
        "vendor_name":       r.name,
        "vendor_type":       r.type,
        "email":             r.email,
        "phone":             r.phone,
        "open_bills":        r.open_bills,
        "total_outstanding": round(r.total_outstanding or 0, 2),
    } for r in rows]

    total_outstanding = round(sum(v["total_outstanding"] for v in vendors), 2)

    return success({
        "vendors":           vendors,
        "total_outstanding": total_outstanding,
    })


# ─────────────────────────────────────────────────────────────────────────────
# Cash Book
# ─────────────────────────────────────────────────────────────────────────────

@reports_bp.get("/cash-book")
@jwt_required()
def cash_book():
    """
    Cash Book — unified view of every cash movement.

    INFLOWS:  customer payments received  (DR Cash/Bank / CR Receivable)
    OUTFLOWS: vendor payments made        (DR Payable   / CR Cash/Bank)
    OUTFLOWS: operating expenses paid     (DR Expense   / CR Cash/Bank)

    Each entry carries a running_balance (cumulative net cash position).

    Query params:
        date_from      — start date (YYYY-MM-DD), default: first day of current month
        date_to        — end date   (YYYY-MM-DD), default: today
        payment_method — filter by method (cash|bank_transfer|credit_card|mobile_money)
    """
    from ..models.payment      import Payment
    from ..models.vendor_bill  import VendorPayment
    from ..models.expense      import Expense, CATEGORY_LABEL_MAP

    date_from, date_to = _parse_dates()
    method_filter = request.args.get("payment_method", "").strip()

    # ── Customer payments (INFLOWS) ───────────────────────────────────────────
    inflow_query = Payment.query.filter(
        Payment.payment_date >= date_from,
        Payment.payment_date <= date_to,
    )
    if method_filter:
        inflow_query = inflow_query.filter_by(payment_method=method_filter)
    inflows = inflow_query.order_by(Payment.payment_date, Payment.id).all()

    # ── Vendor payments (OUTFLOWS) ────────────────────────────────────────────
    outflow_query = VendorPayment.query.filter(
        VendorPayment.payment_date >= date_from,
        VendorPayment.payment_date <= date_to,
    )
    if method_filter:
        outflow_query = outflow_query.filter_by(payment_method=method_filter)
    outflows = outflow_query.order_by(VendorPayment.payment_date, VendorPayment.id).all()

    # ── Expense payments (OUTFLOWS) ───────────────────────────────────────────
    expense_query = Expense.query.filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    )
    if method_filter:
        expense_query = expense_query.filter_by(payment_method=method_filter)
    expense_outflows = expense_query.order_by(Expense.expense_date, Expense.id).all()

    # ── Build unified entries list ────────────────────────────────────────────
    entries = []

    for pmt in inflows:
        inv = pmt.invoice
        entries.append({
            "entry_type":     "inflow",
            "sort_key":       (str(pmt.payment_date)) + f"_in_{pmt.id:06d}",
            "date":           pmt.payment_date.isoformat(),
            "reference":      pmt.payment_reference,
            "party_type":     "customer",
            "party_name":     pmt.customer.name if pmt.customer else "Unknown",
            "party_id":       pmt.customer_id,
            "invoice_number": inv.invoice_number if inv else None,
            "invoice_id":     pmt.invoice_id,
            "booking_ref":    inv.booking.booking_reference if inv and inv.booking else None,
            "booking_id":     inv.booking_id if inv else None,
            "description":    f"Payment from {pmt.customer.name if pmt.customer else 'customer'}",
            "payment_method": pmt.payment_method,
            "notes":          pmt.notes,
            "inflow":         round(pmt.amount, 2),
            "outflow":        0.0,
        })

    for vpmt in outflows:
        bill   = vpmt.bill
        vendor = vpmt.vendor
        entries.append({
            "entry_type":     "outflow",
            "sort_key":       (str(vpmt.payment_date)) + f"_out_{vpmt.id:06d}",
            "date":           vpmt.payment_date.isoformat(),
            "reference":      vpmt.payment_reference,
            "party_type":     "vendor",
            "party_name":     vendor.name if vendor else "Unknown",
            "party_id":       vpmt.vendor_id,
            "bill_reference": bill.bill_reference if bill else None,
            "bill_id":        vpmt.vendor_bill_id,
            "booking_ref":    bill.booking.booking_reference if bill and bill.booking else None,
            "booking_id":     bill.booking_id if bill else None,
            "description":    f"Payment to {vendor.name if vendor else 'supplier'}",
            "payment_method": vpmt.payment_method,
            "notes":          vpmt.notes,
            "inflow":         0.0,
            "outflow":        round(vpmt.amount, 2),
        })

    for exp in expense_outflows:
        cat_label = CATEGORY_LABEL_MAP.get(exp.category, exp.category)
        entries.append({
            "entry_type":     "expense",
            "sort_key":       (str(exp.expense_date)) + f"_exp_{exp.id:06d}",
            "date":           exp.expense_date.isoformat(),
            "reference":      exp.expense_reference,
            "party_type":     "expense",
            "party_name":     exp.vendor_payee or cat_label,
            "expense_id":     exp.id,
            "category":       exp.category,
            "category_label": cat_label,
            "description":    f"{cat_label} — {exp.description}",
            "payment_method": exp.payment_method,
            "notes":          exp.notes,
            "inflow":         0.0,
            "outflow":        round(exp.amount, 2),
        })

    # ── Sort chronologically, inflows before outflows on same day ─────────────
    entries.sort(key=lambda e: e["sort_key"])

    # ── Running cash balance ──────────────────────────────────────────────────
    running = 0.0
    for e in entries:
        running += e["inflow"] - e["outflow"]
        e["running_balance"] = round(running, 2)
        del e["sort_key"]

    # ── Summary ───────────────────────────────────────────────────────────────
    total_in      = round(sum(e["inflow"]  for e in entries), 2)
    total_out     = round(sum(e["outflow"] for e in entries), 2)
    net_cash      = round(total_in - total_out, 2)
    expense_total = round(sum(
        e["outflow"] for e in entries if e["entry_type"] == "expense"
    ), 2)

    return success({
        "period": {"from": date_from, "to": date_to},
        "summary": {
            "total_inflow":    total_in,
            "total_outflow":   total_out,
            "net_cash":        net_cash,
            "inflow_count":    len([e for e in entries if e["entry_type"] == "inflow"]),
            "outflow_count":   len([e for e in entries if e["entry_type"] in ("outflow", "expense")]),
            "expense_outflow": expense_total,
        },
        "entries": entries,
    })


# ── Trial Balance ────────────────────────────────────────────────────────────

@reports_bp.get("/trial-balance")
@jwt_required()
def get_trial_balance():
    """
    Return revenue, COGS, and operating expense entries for a given period.

    Query params:
        month  -- 1-12 (required)
        year   -- 4-digit year (required)

    Revenue  = total amount from invoices ISSUED in that month/year
    COGS     = total amount from vendor bills created in that month/year
    Expenses = stored TrialBalanceEntry rows for that period
    """
    try:
        month = int(request.args.get("month", 0))
        year  = int(request.args.get("year",  0))
    except (ValueError, TypeError):
        return error("month and year must be integers.")

    if not (1 <= month <= 12) or year < 2000:
        return error("Provide a valid month (1-12) and year (>= 2000).")

    # Build date range for the requested month
    import calendar
    last_day   = calendar.monthrange(year, month)[1]
    date_from  = f"{year}-{month:02d}-01"
    date_to    = f"{year}-{month:02d}-{last_day:02d}"

    # ── Revenue: sum of issued invoices in the period ─────────────────────────
    revenue = db.session.query(
        func.sum(Invoice.total_amount)
    ).filter(
        Invoice.issue_date >= date_from,
        Invoice.issue_date <= date_to,
        Invoice.status.in_(["issued", "partially_paid", "paid"]),
    ).scalar() or 0.0
    revenue = round(revenue, 2)

    # ── COGS: sum of vendor bills created in the period ───────────────────────
    cogs = db.session.query(
        func.sum(VendorBill.amount)
    ).filter(
        VendorBill.bill_date >= date_from,
        VendorBill.bill_date <= date_to,
    ).scalar() or 0.0
    cogs = round(cogs, 2)

    gross_profit = round(revenue - cogs, 2)

    # ── Operating expenses: stored entries for this period ────────────────────
    stored = {
        e.category_key: e
        for e in TrialBalanceEntry.query.filter_by(
            period_year=year, period_month=month
        ).all()
    }

    expense_lines = []
    total_opex    = 0.0
    for key, label in TRIAL_BALANCE_CATEGORIES:
        entry  = stored.get(key)
        amount = round(entry.amount, 2) if entry else 0.0
        total_opex += amount
        expense_lines.append({
            "category_key": key,
            "label":        label,
            "amount":       amount,
            "notes":        entry.notes if entry else None,
        })
    total_opex = round(total_opex, 2)

    net_profit = round(gross_profit - total_opex, 2)

    return success({
        "period":        {"year": year, "month": month},
        "revenue":       revenue,
        "cogs":          cogs,
        "gross_profit":  gross_profit,
        "total_opex":    total_opex,
        "net_profit":    net_profit,
        "expenses":      expense_lines,
    })


@reports_bp.post("/trial-balance/expenses")
@jwt_required()
def save_trial_balance_expenses():
    """
    Bulk upsert operating expense entries for a period.

    Body:
    {
      "year":  2026,
      "month": 5,
      "entries": [
        {"category_key": "staff_cost",    "amount": 5000.00, "notes": "May salaries"},
        {"category_key": "rent",          "amount": 1500.00},
        ...
      ]
    }
    """
    from flask_jwt_extended import get_jwt_identity
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    year  = data.get("year")
    month = data.get("month")
    if not year or not month:
        return error("year and month are required.")

    entries_data = data.get("entries") or []
    if not entries_data:
        return error("No entries provided.")

    saved = []
    for item in entries_data:
        key    = (item.get("category_key") or "").strip()
        if not key or key not in {k for k, _ in TRIAL_BALANCE_CATEGORIES}:
            continue  # skip unknown keys
        amount = round(float(item.get("amount") or 0), 2)
        notes  = (item.get("notes") or "").strip() or None

        # Upsert
        entry = TrialBalanceEntry.query.filter_by(
            period_year=year, period_month=month, category_key=key
        ).first()

        if entry:
            entry.amount     = amount
            entry.notes      = notes
            entry.created_by = user_id
        else:
            entry = TrialBalanceEntry(
                period_year  = year,
                period_month = month,
                category_key = key,
                amount       = amount,
                notes        = notes,
                created_by   = user_id,
            )
            db.session.add(entry)

        saved.append(key)

    db.session.commit()
    return success({"saved": len(saved), "period": {"year": year, "month": month}})

# ── Sparklines endpoint ──────────────────────────────────────────────────────

@reports_bp.get("/sparklines", strict_slashes=False)
@jwt_required()
def sparklines():
    """
    Returns 6-month monthly arrays for dashboard sparkline charts.

    Response shape:
      {
        "months":       ["2025-12", "2026-01", ...],   // 6 YYYY-MM labels
        "revenue":      [float, ...],                  // payments received per month
        "expenses":     [float, ...],                  // operating expenses per month
        "gross_profit": [float, ...],                  // booking margin per month
        "net_profit":   [float, ...],                  // gross_profit - expenses
        "receivables":  [float, ...],                  // invoice total_amount issued per month
        "payables":     [float, ...],                  // vendor bills raised per month
      }
    """
    today = date.today()

    # Build the last-6-months list (YYYY-MM strings), oldest first
    months = []
    for i in range(5, -1, -1):
        y, m = today.year, today.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append(f"{y:04d}-{m:02d}")

    month_start = months[0] + "-01"   # first day of oldest month
    month_end   = today.isoformat()   # today

    # ── Revenue: sum invoice totals by issue_date (accrual basis) ────────
    # Revenue is recognised when invoice is raised, not when cash is received.
    rev_rows = (
        db.session.query(
            _month_label(Invoice.issue_date).label("month"),
            func.sum(Invoice.total_amount).label("total"),
        )
        .filter(
            Invoice.issue_date >= month_start,
            Invoice.issue_date <= month_end,
            Invoice.status != "cancelled",
        )
        .group_by(_month_label(Invoice.issue_date))
        .all()
    )
    rev_map = {r.month: round(r.total or 0, 2) for r in rev_rows}

    # ── Operating expenses per month ─────────────────────────────────────
    exp_rows = (
        db.session.query(
            _month_label(Expense.expense_date).label("month"),
            func.sum(Expense.amount).label("total"),
        )
        .filter(
            Expense.expense_date >= month_start,
            Expense.expense_date <= month_end,
        )
        .group_by(_month_label(Expense.expense_date))
        .all()
    )
    exp_map = {r.month: round(r.total or 0, 2) for r in exp_rows}

    # ── COGS: BookingItem vendor_cost by invoice issue_date (accrual basis) ─
    cogs_rows = (
        db.session.query(
            _month_label(Invoice.issue_date).label("month"),
            func.sum(BookingItem.vendor_cost).label("total"),
        )
        .join(Booking,  Booking.id         == BookingItem.booking_id)
        .join(Invoice,  Invoice.booking_id == Booking.id)
        .filter(
            Invoice.issue_date >= month_start,
            Invoice.issue_date <= month_end,
            Invoice.status     != "cancelled",
        )
        .group_by(_month_label(Invoice.issue_date))
        .all()
    )
    cogs_map = {r.month: round(r.total or 0, 2) for r in cogs_rows}

    # ── Gross profit: (Revenue - COGS) per invoice month (accrual basis) ───
    gp_rows = (
        db.session.query(
            _month_label(Invoice.issue_date).label("month"),
            func.sum(BookingItem.selling_price - BookingItem.vendor_cost).label("total"),
        )
        .join(Booking,  Booking.id         == BookingItem.booking_id)
        .join(Invoice,  Invoice.booking_id == Booking.id)
        .filter(
            Invoice.issue_date >= month_start,
            Invoice.issue_date <= month_end,
            Invoice.status     != "cancelled",
        )
        .group_by(_month_label(Invoice.issue_date))
        .all()
    )
    gp_map = {r.month: round(r.total or 0, 2) for r in gp_rows}

    # ── Receivables: invoice total_amount issued per month ───────────────
    rec_rows = (
        db.session.query(
            _month_label(Invoice.issue_date).label("month"),
            func.sum(Invoice.total_amount).label("total"),
        )
        .filter(
            Invoice.issue_date >= month_start,
            Invoice.issue_date <= month_end,
        )
        .group_by(_month_label(Invoice.issue_date))
        .all()
    )
    rec_map = {r.month: round(r.total or 0, 2) for r in rec_rows}

    # ── Payables: vendor bills raised per month ───────────────────────────
    pay_rows = (
        db.session.query(
            _month_label(VendorBill.bill_date).label("month"),
            func.sum(VendorBill.amount).label("total"),
        )
        .filter(
            VendorBill.bill_date >= month_start,
            VendorBill.bill_date <= month_end,
        )
        .group_by(_month_label(VendorBill.bill_date))
        .all()
    )
    pay_map = {r.month: round(r.total or 0, 2) for r in pay_rows}

    revenue      = [rev_map.get(m, 0.0)  for m in months]
    cogs         = [cogs_map.get(m, 0.0) for m in months]
    expenses     = [exp_map.get(m, 0.0)  for m in months]
    gross_profit = [gp_map.get(m, 0.0)   for m in months]
    net_profit   = [round(gp_map.get(m, 0.0) - exp_map.get(m, 0.0), 2) for m in months]
    receivables  = [rec_map.get(m, 0.0)  for m in months]
    payables     = [pay_map.get(m, 0.0)  for m in months]

    return success({
        "months":       months,
        "revenue":      revenue,
        "cogs":         cogs,
        "expenses":     expenses,
        "gross_profit": gross_profit,
        "net_profit":   net_profit,
        "receivables":  receivables,
        "payables":     payables,
    })
