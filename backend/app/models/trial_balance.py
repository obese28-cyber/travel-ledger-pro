"""
models/trial_balance.py — Period-based operating expense entries for the Trial Balance.

Each row stores one expense line item for a given month/year period.
The trial balance UI reads and writes these rows; revenue/COGS are
pulled live from invoices and vendor bills.
"""

from datetime import datetime, timezone
from ..extensions import db

# Ordered list of (category_key, display_label) for the trial balance expense section.
# The order here is the order shown in the UI.
TRIAL_BALANCE_CATEGORIES = [
    ("staff_cost",          "Staff Cost"),
    ("fuel_lubricant",      "Fuel & Lubricant"),
    ("rent",                "Rent"),
    ("periodicals",         "Periodicals"),
    ("audit_fees",          "Audit Fees"),
    ("legal_fees",          "Legal Fees"),
    ("travel_transport",    "Travel & Transportation"),
    ("electricity_water",   "Electricity and Water"),
    ("communication",       "Communication & Broadband"),
    ("license_guarantee",   "License & Guarantee"),
    ("bank_charges",        "Bank Charges"),
    ("office_expense",      "Office Expense"),
    ("printing_stationery", "Printing & Stationery"),
    ("repairs_vehicles",    "Repairs - Motor Vehicles"),
    ("repairs_fixtures",    "Repairs - Fixtures & Fittings"),
    ("cleaning_sanitation", "Cleaning & Sanitation"),
    ("bad_debt",            "Bad Debt"),
    ("depreciation",        "Depreciation"),
    ("insurance",           "Insurance"),
    ("selling_distribution","Selling and Distribution"),
    ("finance_cost",        "Finance Cost"),
]

CATEGORY_KEYS   = {k for k, _ in TRIAL_BALANCE_CATEGORIES}
CATEGORY_LABELS = {k: v for k, v in TRIAL_BALANCE_CATEGORIES}


class TrialBalanceEntry(db.Model):
    """
    One expense entry per (year, month, category).
    period_month = 0 means the full-year entry (used for annual view).
    """
    __tablename__ = "trial_balance_entries"

    id            = db.Column(db.Integer, primary_key=True)
    period_year   = db.Column(db.Integer, nullable=False)
    period_month  = db.Column(db.Integer, nullable=False, default=0)
    category_key  = db.Column(db.String(60), nullable=False)
    amount        = db.Column(db.Float, nullable=False, default=0.0)
    notes         = db.Column(db.Text)
    created_by    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_at    = db.Column(db.DateTime,
                              default=lambda: datetime.now(timezone.utc),
                              onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint("period_year", "period_month", "category_key",
                            name="uq_tbe_period_category"),
    )

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "period_year":  self.period_year,
            "period_month": self.period_month,
            "category_key": self.category_key,
            "label":        CATEGORY_LABELS.get(self.category_key, self.category_key),
            "amount":       round(self.amount, 2),
            "notes":        self.notes,
        }
