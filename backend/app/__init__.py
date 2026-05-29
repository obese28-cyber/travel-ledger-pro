"""
app/__init__.py -- Application factory.
"""

import os
from flask import Flask
from flask_cors import CORS

from .config import config_map
from .extensions import db, jwt


# -----------------------------
# SAFE MIGRATIONS (NO CRASHES)
# -----------------------------
def _run_migrations(app):
    """
    Safe startup migrations.
    Will NEVER crash the server on Render.
    """
    try:
        with app.app_context():
            from sqlalchemy import text, inspect

            inspector = inspect(db.engine)

            def table_exists(name):
                try:
                    return name in inspector.get_table_names()
                except Exception:
                    return False

            def columns_safe(table):
                try:
                    if table_exists(table):
                        return {c["name"] for c in inspector.get_columns(table)}
                except Exception:
                    pass
                return set()

            with db.engine.connect() as conn:

                # ---------------- invoice_items ----------------
                if table_exists("invoice_items"):
                    existing = columns_safe("invoice_items")

                    if "supplier_id" not in existing:
                        conn.execute(text("ALTER TABLE invoice_items ADD COLUMN supplier_id INTEGER"))
                    if "supplier_cost" not in existing:
                        conn.execute(text("ALTER TABLE invoice_items ADD COLUMN supplier_cost REAL DEFAULT 0"))
                    if "markup_amount" not in existing:
                        conn.execute(text("ALTER TABLE invoice_items ADD COLUMN markup_amount REAL DEFAULT 0"))
                    if "show_markup" not in existing:
                        conn.execute(text("ALTER TABLE invoice_items ADD COLUMN show_markup INTEGER DEFAULT 0"))

                    conn.commit()

                # ---------------- vendors ----------------
                if table_exists("vendors"):
                    existing = columns_safe("vendors")

                    if "default_service_type" not in existing:
                        conn.execute(text(
                            "ALTER TABLE vendors ADD COLUMN default_service_type VARCHAR(50)"
                        ))
                        conn.commit()

                # ---------------- expenses ----------------
                if table_exists("expenses"):
                    existing = columns_safe("expenses")

                    if "vendor_payee" not in existing:
                        conn.execute(text(
                            "ALTER TABLE expenses ADD COLUMN vendor_payee VARCHAR(200)"
                        ))
                        conn.commit()

                # ---------------- bookings ----------------
                if table_exists("bookings"):
                    existing = columns_safe("bookings")

                    if "traveler_name" not in existing:
                        conn.execute(text(
                            "ALTER TABLE bookings ADD COLUMN traveler_name VARCHAR(200)"
                        ))
                        conn.commit()

                # ---------------- booking_items ----------------
                if table_exists("booking_items"):
                    existing = columns_safe("booking_items")

                    if "passenger_name" not in existing:
                        conn.execute(text("ALTER TABLE booking_items ADD COLUMN passenger_name VARCHAR(200)"))
                    if "airline_id" not in existing:
                        conn.execute(text("ALTER TABLE booking_items ADD COLUMN airline_id INTEGER"))
                    if "ticket_number" not in existing:
                        conn.execute(text("ALTER TABLE booking_items ADD COLUMN ticket_number VARCHAR(100)"))

                    conn.commit()

    except Exception as e:
        print("[migration warn]", str(e))


# -----------------------------
# CREATE APP
# -----------------------------
def create_app(env: str = "development"):
    app = Flask(__name__)

    cfg = config_map.get(env, config_map["development"])
    app.config.from_object(cfg)

    # Extensions
    db.init_app(app)
    jwt.init_app(app)

    # CORS — allow local dev + Cloudflare Pages production
    default_origins = ",".join([
        "http://localhost:3000",
        "http://localhost:5173",
        "https://travel-ledger-pro.pages.dev",
    ])
    allowed_origins = os.environ.get("CORS_ORIGINS", default_origins).split(",")
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # Import models
    from .models import (
        user, customer, booking, invoice, payment,
        vendor, vendor_bill, expense, accounting,
        audit, airline, trial_balance
    )

    # -----------------------------
    # SAFE DB INIT (NO CRASH)
    # -----------------------------
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            print("[db warn]", str(e))

    # migrations
    _run_migrations(app)

    # -----------------------------
    # AGENCY PROFILE
    # -----------------------------
    try:
        from agency_profile import AGENCY_PROFILE
        app.config["AGENCY_PROFILE"] = AGENCY_PROFILE
    except Exception as e:
        print("[warn] agency_profile.py not loaded:", str(e))

    # -----------------------------
    # BLUEPRINTS
    # -----------------------------
    from .routes.auth import auth_bp
    from .routes.customers import customers_bp
    from .routes.bookings import bookings_bp
    from .routes.invoices import invoices_bp
    from .routes.payments import payments_bp
    from .routes.vendors import vendors_bp
    from .routes.vendor_bills import vendor_bills_bp
    from .routes.expenses import expenses_bp
    from .routes.reports import reports_bp
    from .routes.airlines import airlines_bp
    from .routes.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(customers_bp, url_prefix="/api/customers")
    app.register_blueprint(bookings_bp, url_prefix="/api/bookings")
    app.register_blueprint(invoices_bp, url_prefix="/api/invoices")
    app.register_blueprint(payments_bp, url_prefix="/api/payments")
    app.register_blueprint(vendors_bp, url_prefix="/api/vendors")
    app.register_blueprint(vendor_bills_bp, url_prefix="/api/vendor-bills")
    app.register_blueprint(expenses_bp, url_prefix="/api/expenses")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(airlines_bp, url_prefix="/api/airlines")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")

    return app