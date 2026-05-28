"""
models/booking.py — Booking and BookingItem models.

A Booking is the master record for a customer's trip.
A BookingItem is one service within that trip (flight, hotel, visa, etc.).
"""

from datetime import datetime, timezone
from ..extensions import db


class Booking(db.Model):
    __tablename__ = "bookings"

    id                = db.Column(db.Integer, primary_key=True)
    booking_reference = db.Column(db.String(50), nullable=False, unique=True)
                        # e.g. BK-2026-001 — auto-generated
    customer_id       = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    traveler_name     = db.Column(db.String(200))
    destination       = db.Column(db.String(255))
    travel_date       = db.Column(db.Date)
    return_date       = db.Column(db.Date)
    status            = db.Column(db.String(20), nullable=False, default="pending")
                        # pending | confirmed | cancelled | completed
    notes             = db.Column(db.Text)
    created_by        = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at        = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                  onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    customer     = db.relationship("Customer",    back_populates="bookings")
    creator      = db.relationship("User",        foreign_keys=[created_by])
    items        = db.relationship("BookingItem", back_populates="booking",
                                   cascade="all, delete-orphan", lazy="select")
    invoices     = db.relationship("Invoice",     back_populates="booking",  lazy="dynamic")
    vendor_bills = db.relationship("VendorBill",  back_populates="booking",  lazy="dynamic")

    def total_selling_price(self) -> float:
        return round(sum(item.selling_price for item in self.items), 2)

    def total_vendor_cost(self) -> float:
        return round(sum(item.vendor_cost for item in self.items), 2)

    def total_profit(self) -> float:
        return round(self.total_selling_price() - self.total_vendor_cost(), 2)

    def to_dict(self, include_items: bool = True) -> dict:
        data = {
            "id":                self.id,
            "booking_reference": self.booking_reference,
            "customer_id":       self.customer_id,
            "customer_name":     self.customer.name if self.customer else None,
            "traveler_name":     self.traveler_name,
            "destination":       self.destination,
            "travel_date":       self.travel_date.isoformat() if self.travel_date else None,
            "return_date":       self.return_date.isoformat() if self.return_date else None,
            "status":            self.status,
            "notes":             self.notes,
            "created_by":        self.created_by,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
            "updated_at":        self.updated_at.isoformat() if self.updated_at else None,
            "total_selling_price": self.total_selling_price(),
            "total_vendor_cost":   self.total_vendor_cost(),
            "total_profit":        self.total_profit(),
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data

    def __repr__(self) -> str:
        return f"<Booking {self.booking_reference}>"


class BookingItem(db.Model):
    __tablename__ = "booking_items"

    id            = db.Column(db.Integer, primary_key=True)
    booking_id    = db.Column(db.Integer, db.ForeignKey("bookings.id",  ondelete="CASCADE"), nullable=False)
    service_type  = db.Column(db.String(50), nullable=False)
                   # flight | hotel | visa | tour_package | insurance | other
    vendor_id     = db.Column(db.Integer, db.ForeignKey("vendors.id"),   nullable=True)
    airline_id    = db.Column(db.Integer, db.ForeignKey("airlines.id"),  nullable=True)
    ticket_number = db.Column(db.String(100))
    description   = db.Column(db.Text)
    selling_price = db.Column(db.Float, nullable=False, default=0.0)
    vendor_cost   = db.Column(db.Float, nullable=False, default=0.0)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    booking = db.relationship("Booking", back_populates="items")
    vendor  = db.relationship("Vendor",  foreign_keys=[vendor_id])
    airline = db.relationship("Airline", foreign_keys=[airline_id])

    @property
    def profit_margin(self) -> float:
        return round(self.selling_price - self.vendor_cost, 2)

    # Maps service type → default COGS account code
    COGS_ACCOUNT_MAP = {
        "flight":       "5000",
        "hotel":        "5010",
        "visa":         "5020",
        "tour_package": "5030",
        "insurance":    "5040",
        "other":        "5000",
    }

    def get_cogs_account_code(self) -> str:
        return self.COGS_ACCOUNT_MAP.get(self.service_type, "5000")

    def to_dict(self) -> dict:
        return {
            "id":            self.id,
            "booking_id":    self.booking_id,
            "service_type":  self.service_type,
            "vendor_id":     self.vendor_id,
            "vendor_name":   self.vendor.name    if self.vendor   else None,
            "airline_id":    self.airline_id,
            "airline_name":  self.airline.name   if self.airline  else None,
            "ticket_number": self.ticket_number,
            "description":   self.description,
            "selling_price": self.selling_price,
            "profit_margin": self.profit_margin,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }

