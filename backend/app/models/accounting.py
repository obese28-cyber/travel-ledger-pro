"""
models/accounting.py — Chart of Accounts, JournalEntry, JournalEntryLine.

These three tables form the double-entry accounting engine.
Every financial event creates one JournalEntry with two or more JournalEntryLines,
and the sum of all debits must always equal the sum of all credits.
"""

from datetime import datetime, timezone
from ..extensions import db


class ChartOfAccount(db.Model):
    """
    Master list of all financial accounts.
    Every debit and credit line in the system references one of these accounts.
    """
    __tablename__ = "chart_of_accounts"

    id           = db.Column(db.Integer, primary_key=True)
    account_code = db.Column(db.String(20),  nullable=False, unique=True)
    account_name = db.Column(db.String(200), nullable=False)
    account_type = db.Column(db.String(20),  nullable=False)
                   # asset | liability | equity | revenue | expense
    parent_id    = db.Column(db.Integer, db.ForeignKey("chart_of_accounts.id"), nullable=True)
    is_active    = db.Column(db.Boolean, nullable=False, default=True)
    description  = db.Column(db.Text)
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    children     = db.relationship("ChartOfAccount", backref=db.backref("parent", remote_side=[id]))
    entry_lines  = db.relationship("JournalEntryLine", back_populates="account", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id":           self.id,
            "account_code": self.account_code,
            "account_name": self.account_name,
            "account_type": self.account_type,
            "parent_id":    self.parent_id,
            "is_active":    self.is_active,
            "description":  self.description,
        }

    def __repr__(self) -> str:
        return f"<Account {self.account_code} — {self.account_name}>"


class JournalEntry(db.Model):
    """
    Header record for one accounting event.
    Each financial transaction (invoice issued, payment received, etc.)
    creates exactly one JournalEntry with two or more JournalEntryLines.
    """
    __tablename__ = "journal_entries"

    id              = db.Column(db.Integer, primary_key=True)
    entry_reference = db.Column(db.String(50), nullable=False, unique=True)
                      # e.g. JE-2026-001
    entry_date      = db.Column(db.Date, nullable=False,
                                default=lambda: datetime.now(timezone.utc).date())
    description     = db.Column(db.Text, nullable=False)
    source_type     = db.Column(db.String(30))
                      # invoice | payment | vendor_bill | vendor_payment | expense | manual
    source_id       = db.Column(db.Integer)   # FK to the source table row
    is_posted       = db.Column(db.Boolean, nullable=False, default=True)
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    lines   = db.relationship("JournalEntryLine", back_populates="entry",
                              cascade="all, delete-orphan", lazy="select")
    creator = db.relationship("User", foreign_keys=[created_by])

    def total_debits(self) -> float:
        return round(sum(line.debit for line in self.lines), 2)

    def total_credits(self) -> float:
        return round(sum(line.credit for line in self.lines), 2)

    def is_balanced(self) -> bool:
        return abs(self.total_debits() - self.total_credits()) < 0.01

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "entry_reference": self.entry_reference,
            "entry_date":      self.entry_date.isoformat() if self.entry_date else None,
            "description":     self.description,
            "source_type":     self.source_type,
            "source_id":       self.source_id,
            "is_posted":       self.is_posted,
            "total_debits":    self.total_debits(),
            "total_credits":   self.total_credits(),
            "is_balanced":     self.is_balanced(),
            "lines":           [line.to_dict() for line in self.lines],
            "created_at":      self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<JournalEntry {self.entry_reference}>"


class JournalEntryLine(db.Model):
    """
    One debit or credit line within a journal entry.
    Each line is either a debit (debit > 0, credit = 0) or
    a credit (credit > 0, debit = 0) — never both.
    """
    __tablename__ = "journal_entry_lines"

    id               = db.Column(db.Integer, primary_key=True)
    journal_entry_id = db.Column(db.Integer, db.ForeignKey("journal_entries.id",
                                 ondelete="CASCADE"), nullable=False)
    account_id       = db.Column(db.Integer, db.ForeignKey("chart_of_accounts.id"), nullable=False)
    debit            = db.Column(db.Float, nullable=False, default=0.0)
    credit           = db.Column(db.Float, nullable=False, default=0.0)
    description      = db.Column(db.Text)
    created_at       = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    entry   = db.relationship("JournalEntry",   back_populates="lines")
    account = db.relationship("ChartOfAccount", back_populates="entry_lines")

    def to_dict(self) -> dict:
        return {
            "id":               self.id,
            "journal_entry_id": self.journal_entry_id,
            "account_id":       self.account_id,
            "account_code":     self.account.account_code if self.account else None,
            "account_name":     self.account.account_name if self.account else None,
            "debit":            self.debit,
            "credit":           self.credit,
            "description":      self.description,
        }
