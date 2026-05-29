"""
routes/expenses.py -- Operating expense management endpoints.

GET  /api/expenses                      -> list expenses (filterable)
POST /api/expenses                      -> create expense + journal entry
GET  /api/expenses/categories           -> list all 21 categories with totals
GET  /api/expenses/summary              -> dashboard summary (totals, monthly, by-category)
GET  /api/expenses/<id>                 -> get single expense
GET  /api/expenses/category/<key>       -> ledger drilldown for one category
"""

from datetime import date, datetime, timezone
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from ..extensions import db as _ext_db


def _month_label(col):
    """Return a SQL expression for YYYY-MM grouping — always uses to_char (PostgreSQL)."""
    from ..extensions import db
    try:
        dialect = db.engine.dialect.name
    except Exception:
        dialect = "postgresql"
    if dialect == "sqlite":
        return func.strftime("%Y-%m", col)
    return func.to_char(col, "YYYY-MM")
from ..extensions import db
from ..models.expense import Expense, EXPENSE_CATEGORIES, CATEGORY_ACCOUNT_MAP, CATEGORY_LABEL_MAP
from ..models.accounting import ChartOfAccount
from ..services import accounting_service
from ..services.reference_service import generate_expense_reference
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service

expenses_bp = Blueprint("expenses", __name__)

VALID_CATEGORIES      = {key for key, _, _ in EXPENSE_CATEGORIES}
VALID_PAYMENT_METHODS = {"cash", "bank_transfer", "credit_card", "mobile_money"}


def _get_account_by_code(code: str) -> ChartOfAccount:
    """Return the chart-of-account row for a given code, or raise ValueError."""
    acct = ChartOfAccount.query.filter_by(account_code=code, is_active=True).first()
    if not acct:
        raise ValueError(f"Account code '{code}' not found in chart of accounts.")
    return acct


# ---------------------------------------------------------------------------

@expenses_bp.get("/categories", strict_slashes=False)
@jwt_required()
def list_categories():
    """Return all 21 expense categories with their account code and all-time total."""
    totals = dict(
        db.session.query(Expense.category, func.sum(Expense.amount))
        .group_by(Expense.category)
        .all()
    )
    categories = []
    for key, code, label in EXPENSE_CATEGORIES:
        categories.append({
            "key":          key,
            "label":        label,
            "account_code": code,
            "total_spent":  round(totals.get(key, 0.0), 2),
        })
    return success(categories)


@expenses_bp.get("/summary", strict_slashes=False)
@jwt_required()
def summary():
    """
    Dashboard summary for the Expenses page.
    Query params: date_from, date_to (default: current month)
    """
    today     = date.today()
    first_day = today.replace(day=1)
    date_from = request.args.get("date_from", first_day.isoformat())
    date_to   = request.args.get("date_to",   today.isoformat())

    # Total in period
    total = db.session.query(func.sum(Expense.amount)).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).scalar() or 0.0
    total = round(total, 2)

    # By category
    by_cat_rows = db.session.query(
        Expense.category,
        func.sum(Expense.amount).label("total"),
        func.count(Expense.id).label("count"),
    ).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).group_by(Expense.category).all()

    by_category = [
        {
            "key":   r.category,
            "label": CATEGORY_LABEL_MAP.get(r.category, r.category),
            "total": round(r.total, 2),
            "count": r.count,
        }
        for r in by_cat_rows
    ]
    cat_keys_in_result = {r["key"] for r in by_category}
    for key, _, label in EXPENSE_CATEGORIES:
        if key not in cat_keys_in_result:
            by_category.append({"key": key, "label": label, "total": 0.0, "count": 0})
    by_category.sort(key=lambda x: x["label"])

    # By payment method
    by_method_rows = db.session.query(
        Expense.payment_method,
        func.sum(Expense.amount).label("total"),
    ).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).group_by(Expense.payment_method).all()
    by_method = {(r.payment_method or "unknown"): round(r.total, 2) for r in by_method_rows}

    # Monthly totals (last 6 months)
    monthly_rows = db.session.query(
        _month_label(Expense.expense_date).label("month"),
        func.sum(Expense.amount).label("total"),
        func.count(Expense.id).label("count"),
    ).group_by(_month_label(Expense.expense_date)).order_by(
        _month_label(Expense.expense_date).desc()
    ).limit(6).all()
    monthly = [
        {"month": r.month, "total": round(r.total, 2), "count": r.count}
        for r in reversed(monthly_rows)
    ]

    # Recent 5
    recent = Expense.query.filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).order_by(Expense.expense_date.desc(), Expense.id.desc()).limit(5).all()

    # Cash vs Bank split
    cash_total = round(db.session.query(func.sum(Expense.amount)).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
        Expense.payment_method == "cash",
    ).scalar() or 0.0, 2)
    bank_total = round(total - cash_total, 2)

    return success({
        "period":       {"from": date_from, "to": date_to},
        "total":        total,
        "cash_outflow": cash_total,
        "bank_outflow": bank_total,
        "by_category":  by_category,
        "by_method":    by_method,
        "monthly":      monthly,
        "recent":       [e.to_dict() for e in recent],
    })


@expenses_bp.get("/", strict_slashes=False)
@jwt_required()
def list_expenses():
    """
    List expenses with optional filters.
    Query params: date_from, date_to, category, payment_method, search, page, per_page
    """
    today     = date.today()
    first_day = today.replace(day=1)
    date_from = request.args.get("date_from", first_day.isoformat())
    date_to   = request.args.get("date_to",   today.isoformat())
    category  = request.args.get("category",  "").strip()
    method    = request.args.get("payment_method", "").strip()
    search    = request.args.get("search",    "").strip()
    page      = int(request.args.get("page",     1))
    per_page  = int(request.args.get("per_page", 50))

    query = Expense.query.filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    )
    if category and category != "all":
        query = query.filter_by(category=category)
    if method and method != "all":
        query = query.filter_by(payment_method=method)
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                Expense.description.ilike(like),
                Expense.vendor_payee.ilike(like),
                Expense.expense_reference.ilike(like),
            )
        )

    query   = query.order_by(Expense.expense_date.desc(), Expense.id.desc())
    total   = query.count()
    records = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [e.to_dict() for e in records],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@expenses_bp.post("/", strict_slashes=False)
@jwt_required()
def create_expense():
    """
    Record a new expense and post the double-entry journal.
    DR expense_account (6xxx)  /  CR cash or bank (1000 or 1010)
    """
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    # Validate category
    category = (data.get("category") or "").strip()
    if not category:
        return error("category is required.")
    if category not in VALID_CATEGORIES:
        return error("Invalid category. Choose one of: " + ", ".join(sorted(VALID_CATEGORIES)))

    # Validate description
    description = (data.get("description") or "").strip()
    if not description:
        return error("description is required.")

    # Validate amount
    amount_raw = data.get("amount")
    if amount_raw is None:
        return error("amount is required.")
    try:
        amount = round(float(amount_raw), 2)
    except (TypeError, ValueError):
        return error("amount must be a number.")
    if amount <= 0:
        return error("amount must be greater than zero.")

    # Validate payment method
    payment_method = (data.get("payment_method") or "bank_transfer").strip()
    if payment_method not in VALID_PAYMENT_METHODS:
        return error("Invalid payment_method. Must be one of: " + ", ".join(sorted(VALID_PAYMENT_METHODS)))

    # Validate date
    expense_date_str = (data.get("expense_date") or "").strip()
    if expense_date_str:
        try:
            expense_date = date.fromisoformat(expense_date_str)
        except ValueError:
            return error("expense_date must be YYYY-MM-DD.")
    else:
        expense_date = date.today()

    # Resolve chart-of-account
    account_code = CATEGORY_ACCOUNT_MAP[category]
    try:
        account = _get_account_by_code(account_code)
    except ValueError as e:
        return error(str(e))

    # Create expense record
    expense = Expense(
        expense_reference = generate_expense_reference(),
        category          = category,
        account_id        = account.id,
        description       = description,
        vendor_payee      = (data.get("vendor_payee") or "").strip() or None,
        amount            = amount,
        expense_date      = expense_date,
        payment_method    = payment_method,
        receipt_number    = (data.get("receipt_number") or "").strip() or None,
        notes             = (data.get("notes") or "").strip() or None,
        created_by        = user_id,
    )
    db.session.add(expense)
    db.session.flush()  # get expense.id for journal entry

    # Post double-entry journal:  DR expense_account / CR cash_or_bank
    try:
        accounting_service.record_expense(expense, created_by=user_id)
    except ValueError as e:
        db.session.rollback()
        return error(f"Accounting error: {str(e)}", 500)

    audit_service.log("CREATE", "expenses", expense.id, user_id, new_values=expense.to_dict())
    db.session.commit()

    return created(expense.to_dict())


@expenses_bp.get("/<int:expense_id>", strict_slashes=False)
@jwt_required()
def get_expense(expense_id: int):
    """Return a single expense record."""
    expense = Expense.query.get(expense_id)
    if not expense:
        return not_found("Expense")
    return success(expense.to_dict())


@expenses_bp.get("/category/<string:category_key>", strict_slashes=False)
@jwt_required()
def category_ledger(category_key: str):
    """
    Ledger drilldown for one expense category.
    Returns all transactions with a running total and monthly breakdown.
    Query params: date_from, date_to (default: full history)
    """
    if category_key not in VALID_CATEGORIES:
        return not_found("Category")

    date_from = request.args.get("date_from", "2000-01-01")
    date_to   = request.args.get("date_to",   date.today().isoformat())

    expenses = Expense.query.filter(
        Expense.category     == category_key,
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).order_by(Expense.expense_date, Expense.id).all()

    # Build ledger entries with running total
    running = 0.0
    entries = []
    for exp in expenses:
        running += exp.amount
        entries.append({
            **exp.to_dict(),
            "running_total": round(running, 2),
        })

    total = round(running, 2)

    # Monthly breakdown
    monthly_rows = db.session.query(
        _month_label(Expense.expense_date).label("month"),
        func.sum(Expense.amount).label("total"),
        func.count(Expense.id).label("count"),
    ).filter(
        Expense.category     == category_key,
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).group_by(_month_label(Expense.expense_date)).order_by(
        _month_label(Expense.expense_date)
    ).all()
    monthly = [
        {"month": r.month, "total": round(r.total, 2), "count": r.count}
        for r in monthly_rows
    ]

    return success({
        "category": {
            "key":          category_key,
            "label":        CATEGORY_LABEL_MAP.get(category_key, category_key),
            "account_code": CATEGORY_ACCOUNT_MAP.get(category_key, ""),
        },
        "period":  {"from": date_from, "to": date_to},
        "total":   total,
        "count":   len(entries),
        "monthly": monthly,
        "entries": entries,
    })
