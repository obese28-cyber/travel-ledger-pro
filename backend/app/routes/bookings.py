"""
routes/bookings.py — Booking management endpoints.

GET   /api/bookings              -> list bookings
POST  /api/bookings              -> create booking (with items)
GET   /api/bookings/<id>         -> booking detail
PATCH /api/bookings/<id>/status  -> update booking status
PUT   /api/bookings/<id>         -> update booking details

Business rules:
  - Every booking MUST have a customer (customer_id required)
  - Every booking item MUST have a vendor/supplier (vendor_id required)
  - Every booking item MUST have a service_type
  - Selling price and vendor cost are required per item
  - Gross profit = selling_price - vendor_cost per item
"""

from datetime import date
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.booking import Booking, BookingItem
from ..models.customer import Customer
from ..models.vendor import Vendor
from ..utils.responses import success, created, paginated, error, not_found
from ..services import audit_service
from ..services.reference_service import generate_booking_ref

bookings_bp = Blueprint("bookings", __name__)

VALID_STATUSES = {"pending", "confirmed", "cancelled", "completed"}
VALID_SERVICES = {"flight", "hotel", "visa", "tour_package", "insurance", "other"}


def _parse_date(value):
    """Convert a YYYY-MM-DD string to a Python date object, or return None."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _validate_items(items_data) -> list:
    """
    Validate and normalise the booking items list.
    Returns list of errors (empty list means valid).
    """
    errs = []
    for i, item in enumerate(items_data):
        n = i + 1
        if not item.get("vendor_id"):
            errs.append(f"Item {n}: vendor_id is required. Every service must have a supplier.")
        if item.get("service_type") not in VALID_SERVICES:
            errs.append(f"Item {n}: service_type must be one of: {', '.join(sorted(VALID_SERVICES))}.")
        if item.get("selling_price") is None:
            errs.append(f"Item {n}: selling_price is required.")
        if item.get("vendor_cost") is None:
            errs.append(f"Item {n}: vendor_cost is required.")
    return errs


@bookings_bp.get("/")
@jwt_required()
def list_bookings():
    """
    List all bookings. Supports filtering and pagination.

    Query params:
        status      — filter by status (pending|confirmed|cancelled|completed)
        customer_id — filter by customer
        search      — search by destination or booking reference
        page / per_page
    """
    status      = request.args.get("status", "").strip()
    customer_id = request.args.get("customer_id", type=int)
    search      = request.args.get("search", "").strip()
    page        = int(request.args.get("page", 1))
    per_page    = int(request.args.get("per_page", 20))

    query = Booking.query

    if status:
        query = query.filter_by(status=status)
    if customer_id:
        query = query.filter_by(customer_id=customer_id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            db.or_(
                Booking.booking_reference.ilike(like),
                Booking.destination.ilike(like),
            )
        )

    query    = query.order_by(Booking.created_at.desc())
    total    = query.count()
    bookings = query.offset((page - 1) * per_page).limit(per_page).all()

    return paginated(
        items    = [b.to_dict(include_items=False) for b in bookings],
        total    = total,
        page     = page,
        per_page = per_page,
    )


@bookings_bp.post("/")
@jwt_required()
def create_booking():
    """
    Create a new booking with one or more service items.

    Required fields: customer_id, items[]
    Each item requires: service_type, vendor_id, selling_price, vendor_cost

    Example:
    {
      "customer_id": 1,
      "destination": "Dubai, UAE",
      "travel_date": "2026-06-10",
      "return_date": "2026-06-17",
      "items": [
        {
          "service_type":  "flight",
          "vendor_id":     1,
          "description":   "Emirates EK 722 Return",
          "selling_price": 1200.00,
          "vendor_cost":   900.00
        }
      ]
    }
    """
    user_id = int(get_jwt_identity())
    data    = request.get_json()
    if not data:
        return error("Request body must be JSON.")

    # ── Validate customer ──────────────────────────────────────────────────────
    customer_id = data.get("customer_id")
    if not customer_id:
        return error("customer_id is required. Please select a customer for this booking.")
    customer = Customer.query.get(customer_id)
    if not customer:
        return not_found("Customer")

    # ── Validate items ─────────────────────────────────────────────────────────
    items_data = data.get("items") or []
    if not items_data:
        return error("At least one booking item (service) is required.")

    item_errors = _validate_items(items_data)
    if item_errors:
        return error(" | ".join(item_errors))

    # Verify all vendor_ids exist
    for i, item_data in enumerate(items_data):
        vid = item_data.get("vendor_id")
        if vid:
            vendor = Vendor.query.get(vid)
            if not vendor:
                return error(f"Item {i+1}: Vendor/supplier ID {vid} not found.")
            if not vendor.is_active:
                return error(f"Item {i+1}: Vendor \"{vendor.name}\" is inactive.")

    # ── Create booking header ──────────────────────────────────────────────────
    booking = Booking(
        booking_reference = generate_booking_ref(),
        customer_id       = customer_id,
        traveler_name     = (data.get("traveler_name") or "").strip() or None,
        destination       = data.get("destination"),
        travel_date       = _parse_date(data.get("travel_date")),
        return_date       = _parse_date(data.get("return_date")),
        status            = "pending",
        notes             = data.get("notes"),
        created_by        = user_id,
    )
    db.session.add(booking)
    db.session.flush()  # get booking.id

    # ── Create booking items ───────────────────────────────────────────────────
    for item_data in items_data:
        item = BookingItem(
            booking_id    = booking.id,
            service_type  = item_data["service_type"],
            vendor_id     = item_data["vendor_id"],          # required
            description   = item_data.get("description"),
            selling_price = float(item_data["selling_price"]),
            vendor_cost   = float(item_data["vendor_cost"]),
        )
        db.session.add(item)

    audit_service.log("CREATE", "bookings", booking.id, user_id,
                      new_values={"booking_reference": booking.booking_reference,
                                  "customer_id": customer_id})
    db.session.commit()

    # Reload to get all relationships
    db.session.refresh(booking)
    return created(booking.to_dict())


@bookings_bp.get("/<int:booking_id>")
@jwt_required()
def get_booking(booking_id: int):
    """Return full booking detail including all items and linked invoices."""
    booking = Booking.query.get(booking_id)
    if not booking:
        return not_found("Booking")

    data = booking.to_dict()
    # Also include linked invoices
    data["invoices"] = [inv.to_dict(include_items=False) for inv in booking.invoices]
    return success(data)


@bookings_bp.put("/<int:booking_id>")
@jwt_required()
def update_booking(booking_id: int):
    """
    Update booking details (destination, travel dates, notes).
    Items cannot be changed after booking creation — cancel and re-book.
    """
    user_id = int(get_jwt_identity())
    booking = Booking.query.get(booking_id)
    if not booking:
        return not_found("Booking")

    if booking.status == "cancelled":
        return error("Cannot update a cancelled booking.")

    data = request.get_json() or {}
    old  = {"destination": booking.destination,
            "travel_date": str(booking.travel_date),
            "notes":       booking.notes}

    if "traveler_name" in data: booking.traveler_name = (data["traveler_name"] or "").strip() or None
    if "destination"  in data: booking.destination  = data["destination"]
    if "travel_date"  in data: booking.travel_date  = _parse_date(data["travel_date"])
    if "return_date"  in data: booking.return_date  = _parse_date(data["return_date"])
    if "notes"        in data: booking.notes        = data["notes"]

    audit_service.log("UPDATE", "bookings", booking.id, user_id,
                      old_values=old, new_values=data)
    db.session.commit()

    db.session.refresh(booking)
    data_out = booking.to_dict()
    data_out["invoices"] = [inv.to_dict(include_items=False) for inv in booking.invoices]
    return success(data_out)


@bookings_bp.patch("/<int:booking_id>/status")
@jwt_required()
def update_booking_status(booking_id: int):
    """
    Update a booking's status.

    Body: { "status": "confirmed" }
    Valid statuses: pending, confirmed, cancelled, completed
    """
    user_id = int(get_jwt_identity())
    booking = Booking.query.get(booking_id)
    if not booking:
        return not_found("Booking")

    data = request.get_json()
    new_status = (data or {}).get("status", "").strip()

    if new_status not in VALID_STATUSES:
        return error(f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}")

    old_status = booking.status
    booking.status = new_status

    audit_service.log("UPDATE", "bookings", booking.id, user_id,
                      old_values={"status": old_status},
                      new_values={"status": new_status})
    db.session.commit()

    return success({"id": booking.id, "status": booking.status})
