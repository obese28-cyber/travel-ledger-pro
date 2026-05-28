"""
models/vendor.py — Vendor/supplier model (airlines, hotels, tour operators, etc.).

Each vendor has a default_service_type that auto-fills the service type when
a booking item is created for that vendor, preventing mismatches.
"""

from datetime import datetime, timezone
from ..extensions import db

# Maps vendor.type → default booking service_type
VENDOR_TYPE_TO_SERVICE = {
    "airline":   "flight",
    "hotel":     "hotel",
    "tour":      "tour_package",
    "visa":      "visa",
    "insurance": "insurance",
    "other":     "other",
}


class Vendor(db.Model):
    __tablename__ = "vendors"

    id                   = db.Column(db.Integer, primary_key=True)
    name                 = db.Column(db.String(200), nullable=False)
    type                 = db.Column(db.String(50),  nullable=False, default="other")
                          # airline | hotel | tour | visa | insurance | other
    default_service_type = db.Column(db.String(50),  nullable=True)
                          # flight | hotel | tour_package | visa | insurance | other
                          # Auto-set from type; drives service_type auto-fill on booking forms
    contact_name         = db.Column(db.String(150))
    phone                = db.Column(db.String(50))
    email                = db.Column(db.String(255))
    notes                = db.Column(db.Text)
    is_active            = db.Column(db.Boolean, nullable=False, default=True)
    created_at           = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at           = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                                     onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    bills    = db.relationship("VendorBill",    back_populates="vendor", lazy="dynamic")
    payments = db.relationship("VendorPayment", back_populates="vendor", lazy="dynamic")

    def get_balance(self) -> float:
        """Return total amount currently owed to this vendor (unpaid bills)."""
        from ..extensions import db as _db
        from .vendor_bill import VendorBill
        result = _db.session.query(
            _db.func.sum(VendorBill.amount - VendorBill.amount_paid)
        ).filter(
            VendorBill.vendor_id == self.id,
            VendorBill.status.notin_(["paid"])
        ).scalar()
        return round(result or 0.0, 2)

    def get_default_service_type(self) -> str:
        """
        Return the effective default service type:
        1. Use explicit default_service_type if set
        2. Fall back to deriving from vendor type
        """
        if self.default_service_type:
            return self.default_service_type
        return VENDOR_TYPE_TO_SERVICE.get(self.type, "other")

    def to_dict(self, include_balance: bool = False) -> dict:
        data = {
            "id":                   self.id,
            "name":                 self.name,
            "type":                 self.type,
            "default_service_type": self.get_default_service_type(),
            "contact_name":         self.contact_name,
            "phone":                self.phone,
            "email":                self.email,
            "notes":                self.notes,
            "is_active":            self.is_active,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
            "updated_at":           self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_balance:
            data["outstanding_balance"] = self.get_balance()
        return data

    def __repr__(self) -> str:
        return f"<Vendor {self.name} ({self.type})>"
