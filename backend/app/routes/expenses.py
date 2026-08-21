"""
routes/expenses.py -- Operating expense management endpoints.
"""

from datetime import date
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func

from ..extensions import db
from ..models.expense import (
    Expense,
    EXPENSE_CATEGORIES,
    CATEGORY_ACCOUNT_MAP,
    CATEGORY_LABEL_MAP,
)
from ..models.accounting import ChartOfAccount
from ..services import accounting_service, audit_service
from ..services.reference_service import generate_expense_reference
from ..utils.responses import success, created, paginated, error, not_found

expenses_bp = Blueprint("expenses", __name__)

VALID_CATEGORIES = {key for key, _, _ in EXPENSE_CATEGORIES}
VALID_PAYMENT_METHODS = {"cash", "bank_transfer", "credit_card", "mobile_money"}


# ---------------------- HELPERS ----------------------

def _month_label(col):
    return func.strftime("%Y-%m", col)


def _get_account_by_code(code: str) -> ChartOfAccount:
    acct = ChartOfAccount.query.filter_by(account_code=code, is_active=True).first()
    if not acct:
        raise ValueError(f"Account code '{code}' not found.")
    return acct


def _parse_date(value, default):
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        return default


# ---------------------- CATEGORIES ----------------------

@expenses_bp.get("/categories", strict_slashes=False)
@jwt_required()
def list_categories():
    totals = dict(
        db.session.query(Expense.category, func.sum(Expense.amount))
        .group_by(Expense.category)
        .all()
    )

    return success([
        {
            "key": key,
            "label": label,
            "account_code": code,
            "total_spent": round(totals.get(key, 0.0), 2),
        }
        for key, code, label in EXPENSE_CATEGORIES
    ])


# ---------------------- SUMMARY ----------------------

@expenses_bp.get("/summary", strict_slashes=False)
@jwt_required()
def summary():
    today = date.today()
    first_day = today.replace(day=1)

    date_from = _parse_date(request.args.get("date_from"), first_day)
    date_to = _parse_date(request.args.get("date_to"), today)

    total = db.session.query(func.sum(Expense.amount)).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).scalar() or 0.0

    by_cat = db.session.query(
        Expense.category,
        func.sum(Expense.amount),
        func.count(Expense.id),
    ).filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).group_by(Expense.category).all()

    return success({
        "period": {"from": str(date_from), "to": str(date_to)},
        "total": round(total, 2),
        "by_category": [
            {
                "key": c,
                "label": CATEGORY_LABEL_MAP.get(c, c),
                "total": float(t or 0),
                "count": cnt,
            }
            for c, t, cnt in by_cat
        ],
    })


# ---------------------- LIST ----------------------

@expenses_bp.get("/", strict_slashes=False)
@jwt_required()
def list_expenses():
    today = date.today()
    first_day = today.replace(day=1)

    date_from = _parse_date(request.args.get("date_from"), first_day)
    date_to = _parse_date(request.args.get("date_to"), today)

    query = Expense.query.filter(
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).order_by(Expense.expense_date.desc())

    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 50))

    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items=[e.to_dict() for e in items],
        total=total,
        page=page,
        per_page=per_page,
    )


# ---------------------- CREATE ----------------------

@expenses_bp.post("/", strict_slashes=False)
@jwt_required()
def create_expense():
    user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data:
        return error("JSON required")

    category = data.get("category", "").strip()
    if category not in VALID_CATEGORIES:
        return error("Invalid category")

    amount = float(data.get("amount", 0))
    if amount <= 0:
        return error("Invalid amount")

    expense_date = _parse_date(data.get("expense_date"), date.today())

    account = _get_account_by_code(CATEGORY_ACCOUNT_MAP[category])

    expense = Expense(
        expense_reference=generate_expense_reference(),
        category=category,
        account_id=account.id,
        description=data.get("description", ""),
        amount=amount,
        expense_date=expense_date,
        payment_method=data.get("payment_method", "bank_transfer"),
        created_by=user_id,
    )

    db.session.add(expense)
    db.session.flush()

    accounting_service.record_expense(expense, created_by=user_id)
    audit_service.log("CREATE", "expenses", expense.id, user_id)

    db.session.commit()

    return created(expense.to_dict())


# ---------------------- SINGLE ----------------------

@expenses_bp.get("/<int:expense_id>", strict_slashes=False)
@jwt_required()
def get_expense(expense_id):
    expense = Expense.query.get(expense_id)
    if not expense:
        return not_found("Expense")
    return success(expense.to_dict())


# ---------------------- CATEGORY LEDGER ----------------------

@expenses_bp.get("/category/<string:category_key>", strict_slashes=False)
@jwt_required()
def category_ledger(category_key):
    if category_key not in VALID_CATEGORIES:
        return not_found("Category")

    date_from = _parse_date(request.args.get("date_from"), date(2000, 1, 1))
    date_to = _parse_date(request.args.get("date_to"), date.today())

    expenses = Expense.query.filter(
        Expense.category == category_key,
        Expense.expense_date >= date_from,
        Expense.expense_date <= date_to,
    ).order_by(Expense.expense_date).all()

    running = 0
    entries = []

    for e in expenses:
        running += e.amount
        entries.append({**e.to_dict(), "running_total": round(running, 2)})

    return success({
        "category": category_key,
        "total": round(running, 2),
        "count": len(entries),
        "entries": entries,
    })