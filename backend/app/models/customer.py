"""
models/customer.py — Customer profile model.
"""

from datetime import datetime, timezone
from ..extensions import db


class Customer(db.Model):
    __tablename__ = "customers"

    id              = db.Column(db.Integer, primary_key=True)
    name            = db.Column(db.String(200), nullable=False)
    email           = db.Column(db.String(255))
    phone           = db.Column(db.String(50))
    passport_number = db.Column(db.String(50))
    nationality     = db.Column(db.String(100))
    notes           = db.Column(db.Text)
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    creator  = db.relationship("User", foreign_keys=[created_by])
    bookings = db.relationship("Booking", back_populates="customer", lazy="dynamic")
    invoices = db.relationship("Invoice", back_populates="customer", lazy="dynamic")
    payments = db.relationship("Payment", back_populates="customer", lazy="dynamic")

    def to_dict(self, include_stats: bool = False) -> dict:
        data = {
            "id":              self.id,
            "name":            self.name,
            "email":           self.email,
            "phone":           self.phone,
            "passport_number": self.passport_number,
            "nationality":     self.nationality,
            "notes":           self.notes,
            "created_by":      self.created_by,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
            "updated_at":      self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_stats:
            from .invoice import Invoice
            from .payment import Payment
            from ..extensions import db as _db

            # Total invoiced (non-cancelled)
            total_invoiced = round(float(
                _db.session.query(
                    _db.func.coalesce(_db.func.sum(Invoice.total_amount), 0.0)
                ).filter(
                    Invoice.customer_id == self.id,
                    Invoice.status != "cancelled",
                ).scalar() or 0.0
            ), 2)

            # Applied to invoices: use invoice.amount_paid as source of truth.
            # This captures both regular payments AND credit applications.
            applied_payments = round(float(
                _db.session.query(
                    _db.func.coalesce(_db.func.sum(Invoice.amount_paid), 0.0)
                ).filter(
                    Invoice.customer_id == self.id,
                    Invoice.status != "cancelled",
                ).scalar() or 0.0
            ), 2)

            # Unallocated cash (OPEN CREDIT) — cash received but not yet applied to any invoice
            open_credit = round(float(
                _db.session.query(
                    _db.func.coalesce(_db.func.sum(Payment.unapplied_amount), 0.0)
                ).filter(
                    Payment.customer_id == self.id,
                    Payment.transaction_type != "credit_application",
                ).scalar() or 0.0
            ), 2)

            # Total cash received (for reference)
            total_received = round(float(
                _db.session.query(
                    _db.func.coalesce(_db.func.sum(Payment.amount), 0.0)
                ).filter(
                    Payment.customer_id == self.id,
                    Payment.transaction_type != "credit_application",
                ).scalar() or 0.0
            ), 2)

            net_outstanding = max(round(total_invoiced - applied_payments, 2), 0.0)

            # New correct fields
            data["total_invoiced"]   = total_invoiced
            data["applied_payments"] = applied_payments
            data["open_credit"]      = open_credit
            data["net_outstanding"]  = net_outstanding
            data["total_received"]   = total_received

            # Legacy aliases for backwards compatibility
            data["total_paid"]          = applied_payments
            data["outstanding"]         = net_outstanding
            data["outstanding_balance"] = net_outstanding
            data["advance_credit"]      = open_credit
            data["credit_balance"]      = open_credit
            data["net_balance"]         = round(total_invoiced - applied_payments, 2)
            data["has_credit"]          = open_credit      > 0.005
            data["has_outstanding"]     = net_outstanding  > 0.005
            data["total_bookings"]      = self.bookings.count()
        return data

    def __repr__(self) -> str:
        return f"<Customer {self.name}>"
