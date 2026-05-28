"""
routes/auth.py -- Authentication endpoints.

POST /api/auth/login        -> exchange email+password for a JWT token
POST /api/auth/logout       -> (client-side token discard; server logs it)
GET  /api/auth/me           -> return the current user's profile
"""

from flask import Blueprint, request
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity
)
from ..models.user import User
from ..utils.responses import success, error, not_found, unauthorized

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/login")
def login():
    """
    Authenticate a user and return a JWT access token.

    Request body:
        { "email": "...", "password": "..." }

    Response:
        { "success": true, "data": { "token": "...", "user": {...} } }
    """
    data = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return error("Email and password are required.")

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return unauthorized("Invalid email or password.")

    if not user.is_active:
        return unauthorized("Your account has been deactivated. Contact your admin.")

    # Identity must be a string in Flask-JWT-Extended 4.x
    token = create_access_token(identity=str(user.id))

    return success({
        "token": token,
        "user":  user.to_dict(),
    })


@auth_bp.post("/logout")
@jwt_required()
def logout():
    """
    Logout endpoint. JWT tokens are stateless so the client discards the token.
    """
    return success({"message": "Logged out successfully."})


@auth_bp.get("/me")
@jwt_required()
def get_current_user():
    """Return the profile of the currently authenticated user."""
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return not_found("User")
    return success(user.to_dict())
