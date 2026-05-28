"""
models/payment.py — Customer payment / AR transaction model.

Each row represents ONE financial event on a customer account:

  transaction_type  | meaning
  ------------------+----------------------------------------------------
  invoice_payment   | Cash received against a specific invoice
  advance_deposit   | Pre-payment / deposit before invoice exists
  credit_memo       | Credit note issued to customer (reduces balance)
  refund            | Cash refunded to customer (increases balance)
  write_off         | Bad-debt write-off (clears balance)
  adjustment        | Manual balance correction by admin

Key AR fields:
  amount            — FULL amount received / credited (never capped)
  amount_applied    — portion applied to a specific invoice
  unapplied_amount  — portion sitting as customer credit (= amount - amount_applied)
"""

from datetime import datetime, timezone
from ..extensions import db


TRANSACTION_TYPES = {
    "invoice_payment",
    "advance_deposit",
    "credit_application",   # applying existing credit balance to an invoice
    "credit_memo",
    "refund",
    "write_off",
    "adjustment",
}


class Payment(db.Model):
    __tablename__ = "payments"

    id                = db.Column(db.Integer, primary_key=True)
    payment_reference = db.Column(db.String(50), nullable=False, unique=True)
                        # e.g. PAY-2026-001

    # invoice_id is nullable: advance deposits / credit memos may not be tied to one invoice
    invoice_id        = db.Column(db.Integer, db.ForeignKey("invoices.id"),  nullable=True)
    customer_id       = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)

    # --- AR transaction type ---
    transaction_type  = db.Column(db.String(30), nullable=False, default="invoice_payment")
                        # invoice_payment | advance_deposit | credit_memo | refund | write_off | adjustment

    # --- Amount fields ---
    amount            = db.Column(db.Float, nullable=False)
                        # FULL amount received / credited — never capped at invoice balance
    amount_applied    = db.Column(db.Float, nullable=False, default=0.0)
                        # portion credited against a specific invoice
    unapplied_amount  = db.Column(db.Float, nullable=False, default=0.0)
                        # excess sitting as customer credit (= amount - amount_applied)

    payment_date      = db.Column(db.Date, nullable=False,
                                  default=lambda: datetime.now(timezone.utc).date())
    payment_method    = db.Column(db.String(30), nullable=False)
                        # cash | bank_transfer | credit_card | mobile_money
    notes             = db.Column(db.Text)
    created_by        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    invoice  = db.relationship("Invoice",  back_populates="payments", foreign_keys=[invoice_id])
    customer = db.relationship("Customer", back_populates="payments")
    creator  = db.relationship("User",     foreign_keys=[created_by])

    # Maps payment method -> account code (for journal entries)
    ACCOUNT_MAP = {
        "cash":           "1000",   # Cash on Hand
        "bank_transfer":  "1010",   # Bank Account - Main
        "credit_card":    "1010",   # Treated as bank for MVP
        "mobile_money":   "1010",   # Treated as bank for MVP
        "credit_balance": "1200",   # Accounts Receivable -- internal credit application
    }

    def get_account_code(self) -> str:
        return self.ACCOUNT_MAP.get(self.payment_method, "1010")

    @property
    def is_advance(self) -> bool:
        return self.transaction_type == "advance_deposit"

    @property
    def is_credit(self) -> bool:
        """True for transaction types that reduce customer balance."""
        return self.transaction_type in ("invoice_payment", "advance_deposit", "credit_memo")

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "payment_reference": self.payment_reference,
            "invoice_id":        self.invoice_id,
            "invoice_number":    self.invoice.invoice_number if self.invoice else None,
            "customer_id":       self.customer_id,
            "customer_name":     self.customer.name if self.customer else None,
            "transaction_type":  self.transaction_type,
            "amount":            self.amount,
            "amount_applied":    self.amount_applied,
            "unapplied_amount":  self.unapplied_amount,
            "payment_date":      self.payment_date.isoformat() if self.payment_date else None,
            "payment_method":    self.payment_method,
            "notes":             self.notes,
            "created_by":        self.created_by,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Payment {self.payment_reference} [{self.transaction_type}] - {self.amount}>"
