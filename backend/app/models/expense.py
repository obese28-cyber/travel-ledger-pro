"""
models/expense.py — General operating expense model.

Expenses are agency-level costs not tied to a specific booking
(e.g. office rent, staff salary, marketing, utilities).
"""

from datetime import datetime, timezone
from ..extensions import db


# ── 21 expense categories with their chart-of-account codes ──────────────────
# Each key maps to:  (account_code, account_name)
# All accounts use the 6xxx range (operating expenses).
# reports.py queries code_prefix="6" to sum total OpEx.

EXPENSE_CATEGORIES = [
    ("staff_cost",           "6100", "Staff Cost"),
    ("fuel_lubricant",       "6110", "Fuel & Lubricant"),
    ("rent",                 "6120", "Rent"),
    ("periodicals",          "6130", "Periodicals"),
    ("audit_fees",           "6140", "Audit Fees"),
    ("legal_fees",           "6150", "Legal Fees"),
    ("travel_transport",     "6160", "Travel & Transportation"),
    ("electricity_water",    "6170", "Electricity and Water"),
    ("communication",        "6180", "Communication & Broadband"),
    ("license_guarantee",    "6190", "License & Guarantee"),
    ("bank_charges",         "6200", "Bank Charges"),
    ("office_expense",       "6210", "Office Expense"),
    ("printing_stationery",  "6220", "Printing & Stationery"),
    ("repairs_vehicles",     "6230", "Repairs - Motor Vehicles"),
    ("repairs_fixtures",     "6240", "Repairs - Fixtures & Fittings"),
    ("cleaning_sanitation",  "6250", "Cleaning & Sanitation"),
    ("bad_debt",             "6260", "Bad Debt"),
    ("depreciation",         "6270", "Depreciation"),
    ("insurance",            "6280", "Insurance"),
    ("selling_distribution", "6290", "Selling & Distribution"),
    ("finance_cost",         "6300", "Finance Cost"),
]

# Convenience dicts for fast lookup
CATEGORY_ACCOUNT_MAP  = {key: code  for key, code, _    in EXPENSE_CATEGORIES}
CATEGORY_LABEL_MAP    = {key: label for key, _,    label in EXPENSE_CATEGORIES}
ACCOUNT_CATEGORY_MAP  = {code: key  for key, code, _    in EXPENSE_CATEGORIES}


class Expense(db.Model):
    __tablename__ = "expenses"

    id                = db.Column(db.Integer, primary_key=True)
    expense_reference = db.Column(db.String(50), nullable=False, unique=True)
                        # e.g. EXP-2026-001
    category          = db.Column(db.String(60), nullable=False)
                        # one of the 21 category keys above
    account_id        = db.Column(db.Integer, db.ForeignKey("chart_of_accounts.id"), nullable=False)
    description       = db.Column(db.Text, nullable=False)
    vendor_payee      = db.Column(db.String(200))   # free-text payee name
    amount            = db.Column(db.Float, nullable=False)
    expense_date      = db.Column(db.Date, nullable=False,
                                  default=lambda: datetime.now(timezone.utc).date())
    payment_method    = db.Column(db.String(30))
                        # cash | bank_transfer | credit_card | mobile_money
    receipt_number    = db.Column(db.String(100))
    notes             = db.Column(db.Text)
    created_by        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    account = db.relationship("ChartOfAccount")
    creator = db.relationship("User", foreign_keys=[created_by])

    PAYMENT_ACCOUNT_MAP = {
        "cash":          "1000",
        "bank_transfer": "1010",
        "credit_card":   "1010",
        "mobile_money":  "1010",
    }

    def get_payment_account_code(self) -> str:
        return self.PAYMENT_ACCOUNT_MAP.get(self.payment_method or "", "1010")

    @property
    def category_label(self) -> str:
        return CATEGORY_LABEL_MAP.get(self.category, self.category.replace("_", " ").title())

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "expense_reference": self.expense_reference,
            "category":          self.category,
            "category_label":    self.category_label,
            "account_id":        self.account_id,
            "account_code":      self.account.account_code if self.account else None,
            "account_name":      self.account.account_name if self.account else None,
            "description":       self.description,
            "vendor_payee":      self.vendor_payee,
            "amount":            self.amount,
            "expense_date":      self.expense_date.isoformat() if self.expense_date else None,
            "payment_method":    self.payment_method,
            "receipt_number":    self.receipt_number,
            "notes":             self.notes,
            "created_by":        self.created_by,
            "created_by_name":   self.creator.name if self.creator else None,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Expense {self.expense_reference} — {self.category}>"
