"""
models/vendor_bill.py — VendorBill, VendorPaymentBatch, and VendorPayment models.

VendorBill:          What your agency owes a vendor for services in a booking.
VendorPaymentBatch:  One bulk-payment event (one cheque / bank transfer).
                     Holds the single external reference for the entire batch.
VendorPayment:       One payment line per bill — many can belong to the same batch.
"""

from datetime import datetime, timezone
from ..extensions import db


class VendorBill(db.Model):
    __tablename__ = "vendor_bills"

    id              = db.Column(db.Integer, primary_key=True)
    bill_reference  = db.Column(db.String(50), nullable=False, unique=True)
                      # e.g. VB-2026-001
    vendor_id       = db.Column(db.Integer, db.ForeignKey("vendors.id"),       nullable=False)
    booking_id      = db.Column(db.Integer, db.ForeignKey("bookings.id"),      nullable=True)
    booking_item_id = db.Column(db.Integer, db.ForeignKey("booking_items.id"), nullable=True)
    description     = db.Column(db.Text)
    amount          = db.Column(db.Float, nullable=False)
    bill_date       = db.Column(db.Date, nullable=False,
                                default=lambda: datetime.now(timezone.utc).date())
    due_date        = db.Column(db.Date)
    amount_paid     = db.Column(db.Float, nullable=False, default=0.0)
    status          = db.Column(db.String(20), nullable=False, default="unpaid")
                      # unpaid | partially_paid | paid
    created_by      = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    vendor       = db.relationship("Vendor",      back_populates="bills")
    booking      = db.relationship("Booking",     back_populates="vendor_bills")
    booking_item = db.relationship("BookingItem")
    creator      = db.relationship("User",        foreign_keys=[created_by])
    payments     = db.relationship("VendorPayment", back_populates="bill", lazy="dynamic")

    @property
    def balance_due(self) -> float:
        return round(self.amount - self.amount_paid, 2)

    def recalculate_status(self) -> None:
        if self.amount_paid <= 0:
            self.status = "unpaid"
        elif self.amount_paid >= self.amount:
            self.status = "paid"
        else:
            self.status = "partially_paid"

    def to_dict(self) -> dict:
        return {
            "id":             self.id,
            "bill_reference": self.bill_reference,
            "vendor_id":      self.vendor_id,
            "vendor_name":    self.vendor.name if self.vendor else None,
            "booking_id":     self.booking_id,
            "booking_ref":    self.booking.booking_reference if self.booking else None,
            "booking_item_id":self.booking_item_id,
            "description":    self.description,
            "amount":         self.amount,
            "bill_date":      self.bill_date.isoformat() if self.bill_date else None,
            "due_date":       self.due_date.isoformat() if self.due_date else None,
            "amount_paid":    self.amount_paid,
            "balance_due":    self.balance_due,
            "status":         self.status,
            "created_by":     self.created_by,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "updated_at":     self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<VendorBill {self.bill_reference} — {self.status}>"


class VendorPaymentBatch(db.Model):
    """
    One batch = one bulk-payment event (one cheque, one bank transfer, etc.).
    Carries the single external payment reference for the whole batch.
    Multiple VendorPayment rows link here via batch_id.

    batch_reference   — internal system ref (BATCH-2026-001), UNIQUE
    payment_reference — user-supplied external ref (cheque no., transfer ID), NOT unique
    """
    __tablename__ = "vendor_payment_batches"

    id                = db.Column(db.Integer, primary_key=True)
    batch_reference   = db.Column(db.String(50),  nullable=False, unique=True)
    vendor_id         = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=False)
    payment_method    = db.Column(db.String(30),  nullable=False)
    payment_date      = db.Column(db.Date,        nullable=False,
                                  default=lambda: datetime.now(timezone.utc).date())
    payment_reference = db.Column(db.String(100))
    total_amount      = db.Column(db.Float,       nullable=False, default=0.0)
    bill_count        = db.Column(db.Integer,     nullable=False, default=0)
    notes             = db.Column(db.Text)
    created_by        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    vendor   = db.relationship("Vendor")
    creator  = db.relationship("User", foreign_keys=[created_by])
    payments = db.relationship("VendorPayment", back_populates="batch", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "batch_reference":   self.batch_reference,
            "vendor_id":         self.vendor_id,
            "vendor_name":       self.vendor.name if self.vendor else None,
            "payment_method":    self.payment_method,
            "payment_date":      self.payment_date.isoformat() if self.payment_date else None,
            "payment_reference": self.payment_reference,
            "total_amount":      self.total_amount,
            "bill_count":        self.bill_count,
            "notes":             self.notes,
            "created_by":        self.created_by,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<VendorPaymentBatch {self.batch_reference} total={self.total_amount}>"


class VendorPayment(db.Model):
    """
    One payment row per vendor bill.
    For bulk payments, multiple rows share the same batch_id.
    payment_reference is auto-generated (VP-2026-001) and is NOT unique at the DB level.
    """
    __tablename__ = "vendor_payments"

    id                = db.Column(db.Integer, primary_key=True)
    payment_reference = db.Column(db.String(50), nullable=False)
                        # VP-2026-001 etc.  NOT marked unique — DB constraint removed in v1.5
    batch_id          = db.Column(db.Integer, db.ForeignKey("vendor_payment_batches.id"), nullable=True)
                        # NULL for single-bill payments; set for bulk-pay batches
    vendor_bill_id    = db.Column(db.Integer, db.ForeignKey("vendor_bills.id"), nullable=False)
    vendor_id         = db.Column(db.Integer, db.ForeignKey("vendors.id"),      nullable=False)
    amount            = db.Column(db.Float, nullable=False)
    payment_date      = db.Column(db.Date, nullable=False,
                                  default=lambda: datetime.now(timezone.utc).date())
    payment_method    = db.Column(db.String(30), nullable=False)
    notes             = db.Column(db.Text)
    created_by        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    bill    = db.relationship("VendorBill",         back_populates="payments")
    vendor  = db.relationship("Vendor",             back_populates="payments")
    batch   = db.relationship("VendorPaymentBatch", back_populates="payments")
    creator = db.relationship("User",               foreign_keys=[created_by])

    ACCOUNT_MAP = {
        "cash":          "1000",
        "bank_transfer": "1010",
        "credit_card":   "1010",
        "mobile_money":  "1010",
    }

    def get_account_code(self) -> str:
        return self.ACCOUNT_MAP.get(self.payment_method, "1010")

    def to_dict(self) -> dict:
        return {
            "id":                self.id,
            "payment_reference": self.payment_reference,
            "batch_id":          self.batch_id,
            "batch_reference":   self.batch.batch_reference   if self.batch else None,
            "vendor_bill_id":    self.vendor_bill_id,
            "bill_reference":    self.bill.bill_reference     if self.bill  else None,
            "vendor_id":         self.vendor_id,
            "vendor_name":       self.vendor.name             if self.vendor else None,
            "amount":            self.amount,
            "payment_date":      self.payment_date.isoformat() if self.payment_date else None,
            "payment_method":    self.payment_method,
            "notes":             self.notes,
            "created_by":        self.created_by,
            "created_at":        self.created_at.isoformat()  if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<VendorPayment {self.payment_reference} amount={self.amount}>"
