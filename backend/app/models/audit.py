"""
models/audit.py — Audit trail model.

An immutable log of every significant action in the system.
The audit trail is append-only — records are never updated or deleted.
"""

import json
from datetime import datetime, timezone
from ..extensions import db


class AuditTrail(db.Model):
    __tablename__ = "audit_trail"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    action     = db.Column(db.String(20), nullable=False)
                 # CREATE | UPDATE | DELETE
    table_name = db.Column(db.String(100), nullable=False)
    record_id  = db.Column(db.Integer)
    old_values = db.Column(db.Text)   # JSON string of previous state
    new_values = db.Column(db.Text)   # JSON string of new state
    ip_address = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "user_name":  self.user.name if self.user else "System",
            "action":     self.action,
            "table_name": self.table_name,
            "record_id":  self.record_id,
            "old_values": json.loads(self.old_values) if self.old_values else None,
            "new_values": json.loads(self.new_values) if self.new_values else None,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
