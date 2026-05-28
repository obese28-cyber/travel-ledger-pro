"""
services/audit_service.py — Helpers for writing audit trail records.
"""

import json
from flask import request
from ..extensions import db
from ..models.audit import AuditTrail


def log(
    action:     str,
    table_name: str,
    record_id:  int,
    user_id:    int = None,
    old_values: dict = None,
    new_values: dict = None,
) -> None:
    """
    Append an audit trail entry. Call this after any CREATE, UPDATE, or DELETE.

    Args:
        action:     'CREATE', 'UPDATE', or 'DELETE'
        table_name: name of the affected table (e.g. 'invoices')
        record_id:  primary key of the affected row
        user_id:    ID of the user who performed the action
        old_values: dict of the record's state BEFORE the change (UPDATE/DELETE)
        new_values: dict of the record's state AFTER the change  (CREATE/UPDATE)
    """
    trail = AuditTrail(
        user_id    = user_id,
        action     = action,
        table_name = table_name,
        record_id  = record_id,
        old_values = json.dumps(old_values) if old_values else None,
        new_values = json.dumps(new_values) if new_values else None,
        ip_address = request.remote_addr if request else None,
    )
    db.session.add(trail)
    # Note: do NOT commit here — let the calling route commit everything together.
