"""
routes/reports.py -- Financial reporting endpoints.

GET /api/reports/dashboard           -> key metrics for dashboard
GET /api/reports/profit-loss         -> Profit & Loss statement
GET /api/reports/daily-sales         -> sales totals grouped by day
GET /api/reports/customer-balances   -> outstanding customer balances
GET /api/reports/vendor-balances     -> outstanding vendor balances
GET /api/reports/cash-book           -> cash movement ledger
GET /api/reports/trial-balance       -> monthly financial summary
GET /api/reports/sparklines          -> 6-month dashboard charts
"""

from datetime import date
import calendar
from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from ..extensions import db
from ..utils.responses import success, error

from ..models.invoice import Invoice
from ..models.payment import Payment
from ..models.vendor_bill import VendorBill, VendorPayment
from ..models.expense import Expense
from ..models.booking import Booking, BookingItem
from ..models.customer import Customer
from ..models.vendor import Vendor
from ..models.accounting import ChartOfAccount, JournalEntry, JournalEntryLine
from ..models.trial_balance import TrialBalanceEntry, TRIAL_BALANCE_CATEGORIES


reports_bp = Blueprint("reports", __name__)

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _month_label(col):
    try:
        dialect = db.engine.dialect.name
    except Exception:
        dialect = "postgresql"

    if dialect == "sqlite":
        return func.strftime("%Y-%m", col)
    return func.to_char(col, "YYYY-MM")


def _parse_dates():
    today = date.today()
    first_day = today.replace(day=1)

    return (
        request.args.get("date_from", first_day.isoformat()),
        request.args.get("date_to", today.isoformat())
    )


# ─────────────────────────────────────────────
# Dashboard (kept minimal here)
# ─────────────────────────────────────────────

@reports_bp.get("/dashboard")
@jwt_required()
def dashboard():
    today = date.today()
    date_from = request.args.get("date_from", today.replace(month=1, day=1).isoformat())
    date_to   = request.args.get("date_to", today.isoformat())

    revenue = db.session.query(func.sum(Invoice.total_amount)).filter(
        Invoice.issue_date >= date_from,
        Invoice.issue_date <= date_to,
    ).scalar() or 0.0

    expenses = db.session.query(func.sum(Expense.amount)).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).scalar() or 0.0

    return success({
        "revenue": round(revenue, 2),
        "expenses": round(expenses, 2),
        "net": round(revenue - expenses, 2)
    })


# ─────────────────────────────────────────────
# Profit & Loss
# ─────────────────────────────────────────────

@reports_bp.get("/profit-loss")
@jwt_required()
def profit_and_loss():
    date_from, date_to = _parse_dates()

    revenue = db.session.query(func.sum(Invoice.total_amount)).filter(
        Invoice.issue_date >= date_from,
        Invoice.issue_date <= date_to,
        Invoice.status != "cancelled",
    ).scalar() or 0.0

    expenses = db.session.query(func.sum(Expense.amount)).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).scalar() or 0.0

    return success({
        "revenue": round(revenue, 2),
        "expenses": round(expenses, 2),
        "net_profit": round(revenue - expenses, 2),
    })


# ─────────────────────────────────────────────
# Sparklines (6 months)
# ─────────────────────────────────────────────

@reports_bp.get("/sparklines", strict_slashes=False)
@jwt_required()
def sparklines():
    today = date.today()

    months = []
    for i in range(5, -1, -1):
        y, m = today.year, today.month - i
        while m <= 0:
            m += 12
            y -= 1
        months.append(f"{y:04d}-{m:02d}")

    start = months[0] + "-01"
    end = today.isoformat()

    rev = db.session.query(
        _month_label(Invoice.issue_date),
        func.sum(Invoice.total_amount)
    ).filter(
        Invoice.issue_date >= start,
        Invoice.issue_date <= end,
    ).group_by(_month_label(Invoice.issue_date)).all()

    rev_map = {m: float(v or 0) for m, v in rev}

    exp = db.session.query(
        _month_label(Expense.expense_date),
        func.sum(Expense.amount)
    ).filter(
        Expense.expense_date >= start,
        Expense.expense_date <= end,
    ).group_by(_month_label(Expense.expense_date)).all()

    exp_map = {m: float(v or 0) for m, v in exp}

    revenue = [rev_map.get(m, 0) for m in months]
    expenses = [exp_map.get(m, 0) for m in months]
    net = [r - e for r, e in zip(revenue, expenses)]

    return success({
        "months": months,
        "revenue": revenue,
        "expenses": expenses,
        "net_profit": net
    })