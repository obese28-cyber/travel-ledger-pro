"""
routes/airlines.py -- Airline CRUD endpoints.

GET    /api/airlines          list all active airlines
GET    /api/airlines/all      list all including inactive (admin)
POST   /api/airlines          create
PUT    /api/airlines/<id>     update name or is_active
DELETE /api/airlines/<id>     deactivate (soft delete)
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ..extensions import db
from ..models.airline import Airline
from ..models.user import User
from ..utils.responses import success, error, not_found

airlines_bp = Blueprint("airlines", __name__)


def _is_admin():
    try:
        uid = int(get_jwt_identity())
        u = User.query.get(uid)
        return u and u.role == "admin"
    except Exception:
        return False


@airlines_bp.get("", strict_slashes=False)
@jwt_required()
def list_airlines():
    """Return active airlines (for dropdowns)."""
    rows = Airline.query.filter_by(is_active=True).order_by(Airline.name).all()
    return success({"airlines": [r.to_dict() for r in rows], "total": len(rows)})


@airlines_bp.get("/all", strict_slashes=False)
@jwt_required()
def list_all_airlines():
    """Return all airlines including inactive (for management page)."""
    rows = Airline.query.order_by(Airline.name).all()
    return success({"airlines": [r.to_dict() for r in rows], "total": len(rows)})


@airlines_bp.post("", strict_slashes=False)
@jwt_required()
def create_airline():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return error("Airline name is required.", 400)

    if Airline.query.filter(db.func.lower(Airline.name) == name.lower()).first():
        return error(f"An airline named '{name}' already exists.", 409)

    airline = Airline(name=name)
    db.session.add(airline)
    db.session.commit()
    return success({"airline": airline.to_dict(), "message": f"Airline '{name}' created."}), 201


@airlines_bp.put("/<int:airline_id>", strict_slashes=False)
@jwt_required()
def update_airline(airline_id: int):
    airline = Airline.query.get(airline_id)
    if not airline:
        return not_found("Airline")

    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()

    if name and name != airline.name:
        clash = Airline.query.filter(
            db.func.lower(Airline.name) == name.lower(),
            Airline.id != airline_id
        ).first()
        if clash:
            return error(f"An airline named '{name}' already exists.", 409)
        airline.name = name

    if "is_active" in data:
        airline.is_active = bool(data["is_active"])

    db.session.commit()
    return success({"airline": airline.to_dict(), "message": "Airline updated."})


@airlines_bp.delete("/<int:airline_id>", strict_slashes=False)
@jwt_required()
def deactivate_airline(airline_id: int):
    airline = Airline.query.get(airline_id)
    if not airline:
        return not_found("Airline")
    airline.is_active = False
    db.session.commit()
    return success({"message": f"Airline '{airline.name}' deactivated."})
