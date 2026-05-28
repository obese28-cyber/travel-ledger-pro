"""
models/invoice.py -- Invoice and InvoiceItem models.

An Invoice is the formal billing document sent to the customer.
InvoiceItems are the line items that appear on the printed invoice.

Each InvoiceItem now tracks:
  - supplier_id    : which vendor/supplier provides this service (required)
  - supplier_cost  : what the agency pays the supplier
  - markup_amount  : agency profit on this line (selling_price - supplier_cost)
  - show_markup    : if True, the markup is shown on the customer-facing invoice
"""

from datetime import datetime, timezone
from ..extensions import db


class Invoice(db.Model):
    __tablename__ = "invoices"

    id             = db.Column(db.Integer, primary_key=True)
    invoice_number = db.Column(db.String(50), nullable=False, unique=True)
    booking_id     = db.Column(db.Integer, db.ForeignKey("bookings.id"),  nullable=False)
    customer_id    = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    issue_date     = db.Column(db.Date, nullable=False,
                               default=lambda: datetime.now(timezone.utc).date())
    due_date       = db.Column(db.Date)
    subtotal       = db.Column(db.Float, nullable=False, default=0.0)
    tax_amount     = db.Column(db.Float, nullable=False, default=0.0)
    total_amount   = db.Column(db.Float, nullable=False, default=0.0)
    amount_paid    = db.Column(db.Float, nullable=False, default=0.0)
    status         = db.Column(db.String(20), nullable=False, default="draft")
                     # draft | issued | partially_paid | paid | overdue | cancelled
    notes          = db.Column(db.Text)
    created_by     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at     = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                               onupdate=lambda: datetime.now(timezone.utc))

    booking  = db.relationship("Booking",     back_populates="invoices")
    customer = db.relationship("Customer",    back_populates="invoices")
    creator  = db.relationship("User",        foreign_keys=[created_by])
    items    = db.relationship("InvoiceItem", back_populates="invoice",
                               cascade="all, delete-orphan", lazy="select")
    payments = db.relationship("Payment",     back_populates="invoice", lazy="dynamic")

    @property
    def balance_due(self) -> float:
        return round(self.total_amount - self.amount_paid, 2)

    @property
    def total_supplier_cost(self) -> float:
        return round(sum(item.supplier_cost or 0 for item in self.items), 2)

    @property
    def total_markup(self) -> float:
        return round(sum(item.markup_amount or 0 for item in self.items), 2)

    def recalculate_status(self) -> None:
        if self.status == "cancelled":
            return
        if self.amount_paid <= 0:
            self.status = "issued"
        elif self.amount_paid >= self.total_amount:
            self.status = "paid"
        else:
            self.status = "partially_paid"

    def to_dict(self, include_items: bool = True) -> dict:
        data = {
            "id":                  self.id,
            "invoice_number":      self.invoice_number,
            "booking_id":          self.booking_id,
            "booking_ref":         self.booking.booking_reference if self.booking else None,
            "customer_id":         self.customer_id,
            "customer_name":       self.customer.name  if self.customer else None,
            "customer_email":      self.customer.email if self.customer else None,
            "customer_phone":      self.customer.phone if self.customer else None,
            "issue_date":          self.issue_date.isoformat() if self.issue_date else None,
            "due_date":            self.due_date.isoformat()   if self.due_date   else None,
            "subtotal":            self.subtotal,
            "tax_amount":          self.tax_amount,
            "total_amount":        self.total_amount,
            "total_supplier_cost": self.total_supplier_cost,
            "total_markup":        self.total_markup,
            "amount_paid":         self.amount_paid,
            "balance_due":         self.balance_due,
            "status":              self.status,
            "notes":               self.notes,
            "created_by":          self.created_by,
            "created_at":          self.created_at.isoformat() if self.created_at else None,
            "updated_at":          self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} -- {self.status}>"


class InvoiceItem(db.Model):
    __tablename__ = "invoice_items"

    id              = db.Column(db.Integer, primary_key=True)
    invoice_id      = db.Column(db.Integer, db.ForeignKey("invoices.id",      ondelete="CASCADE"), nullable=False)
    booking_item_id = db.Column(db.Integer, db.ForeignKey("booking_items.id"), nullable=True)

    # Who provides this service
    supplier_id     = db.Column(db.Integer, db.ForeignKey("vendors.id"), nullable=True)

    description     = db.Column(db.Text, nullable=False)
    quantity        = db.Column(db.Float, nullable=False, default=1.0)

    # Cost side (what agency pays the supplier)
    supplier_cost   = db.Column(db.Float, nullable=False, default=0.0)

    # Revenue side (what customer pays the agency)
    unit_price      = db.Column(db.Float, nullable=False)   # = supplier_cost + markup
    total_price     = db.Column(db.Float, nullable=False)   # = unit_price * quantity

    # Markup = unit_price - supplier_cost
    markup_amount   = db.Column(db.Float, nullable=False, default=0.0)

    # Whether to show the markup breakdown on the customer-facing invoice
    show_markup     = db.Column(db.Boolean, nullable=False, default=False)

    created_at      = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    invoice      = db.relationship("Invoice",     back_populates="items")
    booking_item = db.relationship("BookingItem")
    supplier     = db.relationship("Vendor", foreign_keys=[supplier_id])

    def to_dict(self) -> dict:
        # Pull airline info from the linked booking item (if any)
        bi = self.booking_item
        airline_name   = bi.airline.name   if bi and bi.airline   else None
        ticket_number  = bi.ticket_number  if bi                  else None

        return {
            "id":              self.id,
            "invoice_id":      self.invoice_id,
            "booking_item_id": self.booking_item_id,
            "supplier_id":     self.supplier_id,
            "supplier_name":   self.supplier.name if self.supplier else None,
            "description":     self.description,
            "quantity":        self.quantity,
            "supplier_cost":   self.supplier_cost,
            "unit_price":      self.unit_price,
            "total_price":     self.total_price,
            "markup_amount":   self.markup_amount,
            "show_markup":     self.show_markup,
            "airline_name":    airline_name,
            "ticket_number":   ticket_number,
            "created_at":      self.created_at.isoformat() if self.created_at else None,
        }
