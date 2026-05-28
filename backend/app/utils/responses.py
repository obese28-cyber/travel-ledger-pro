"""
utils/responses.py — Standardized JSON response helpers.

Every API endpoint returns a consistent shape:
  Success:  { "success": true,  "data": ... }
  Error:    { "success": false, "error": "message" }
  List:     { "success": true,  "data": [...], "total": N, "page": N, "per_page": N }
"""

from flask import jsonify


def success(data=None, status_code: int = 200):
    """Return a successful response with optional data payload."""
    return jsonify({"success": True, "data": data}), status_code


def created(data=None):
    """Return a 201 Created response."""
    return success(data, 201)


def paginated(items: list, total: int, page: int, per_page: int):
    """Return a paginated list response."""
    return jsonify({
        "success":  True,
        "data":     items,
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    (total + per_page - 1) // per_page,
    }), 200


def error(message: str, status_code: int = 400):
    """Return an error response."""
    return jsonify({"success": False, "error": message}), status_code


def not_found(resource: str = "Record"):
    return error(f"{resource} not found.", 404)


def unauthorized(message: str = "Authentication required."):
    return error(message, 401)


def forbidden(message: str = "You do not have permission to do this."):
    return error(message, 403)


def server_error(message: str = "An unexpected error occurred."):
    return error(message, 500)
