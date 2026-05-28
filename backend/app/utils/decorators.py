"""
utils/decorators.py — Custom route decorators.

@admin_required — restricts an endpoint to admin users only.
"""

from functools import wraps
from flask_jwt_extended import get_jwt_identity
from .responses import forbidden
from ..models.user import User


def admin_required(fn):
    """
    Decorator that checks the current user has the 'admin' role.
    Must be used AFTER @jwt_required().

    Usage:
        @app.route("/admin-only")
        @jwt_required()
        @admin_required
        def admin_only_view():
            ...
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user or user.role != "admin":
            return forbidden("Admin access required.")
        return fn(*args, **kwargs)
    return wrapper
