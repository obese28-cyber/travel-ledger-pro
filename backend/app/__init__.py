"""
app/__init__.py -- Application factory.
"""

import os
from flask import Flask
from flask_cors import CORS

from .config import config_map
from .extensions import db, jwt


def _run_migrations(app):
    """
    Run lightweight migrations on startup.
    Safe to run multiple times -- skips objects that already exist.
    """
    with app.app_context():
        from sqlalchemy import text, inspect
        inspector = inspect(db.engine)

        # -- invoice_items: supplier/markup columns (introduced v1.1) --
        existing = {c["name"] for c in inspector.get_columns("invoice_items")}
        inv_cols = [
            ("supplier_id",   "INTEGER REFERENCES vendors(id)"),
            ("supplier_cost", "REAL NOT NULL DEFAULT 0.0"),
            ("markup_amount", "REAL NOT NULL DEFAULT 0.0"),
            ("show_markup",   "INTEGER NOT NULL DEFAULT 0"),
        ]
        with db.engine.connect() as conn:
            for col, defn in inv_cols:
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE invoice_items ADD COLUMN {col} {defn}"))
                    conn.commit()
                    print(f"[migration] Added invoice_items.{col}")

        # -- vendors: default_service_type column (introduced v1.2) --
        vendor_cols_existing = {c["name"] for c in inspector.get_columns("vendors")}
        if "default_service_type" not in vendor_cols_existing:
            with db.engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE vendors ADD COLUMN default_service_type VARCHAR(50)"
                ))
                conn.commit()
                print("[migration] Added vendors.default_service_type")

            type_map = {
                "airline":   "flight",
                "hotel":     "hotel",
                "tour":      "tour_package",
                "visa":      "visa",
                "insurance": "insurance",
                "other":     "other",
            }
            with db.engine.connect() as conn:
                for v_type, svc_type in type_map.items():
                    conn.execute(text(
                        "UPDATE vendors SET default_service_type = :svc "
                        "WHERE type = :vtype AND default_service_type IS NULL"
                    ), {"svc": svc_type, "vtype": v_type})
                conn.commit()
                print("[migration] Back-filled vendors.default_service_type from type")

        # -- trial_balance_entries: new table (introduced v1.3) --
        existing_tables = inspector.get_table_names()
        if "trial_balance_entries" not in existing_tables:
            with db.engine.connect() as conn:
                conn.execute(text("""
                    CREATE TABLE trial_balance_entries (
                        id           INTEGER PRIMARY KEY AUTOINCREMENT,
                        period_year  INTEGER NOT NULL,
                        period_month INTEGER NOT NULL DEFAULT 0,
                        category_key VARCHAR(60) NOT NULL,
                        amount       REAL NOT NULL DEFAULT 0.0,
                        notes        TEXT,
                        created_by   INTEGER REFERENCES users(id),
                        updated_at   DATETIME,
                        CONSTRAINT uq_tbe_period_category
                            UNIQUE (period_year, period_month, category_key)
                    )
                """))
                conn.commit()
                print("[migration] Created trial_balance_entries table")

        # -- expenses: vendor_payee column (introduced v1.4) --
        expense_cols_existing = {c["name"] for c in inspector.get_columns("expenses")}
        if "vendor_payee" not in expense_cols_existing:
            with db.engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE expenses ADD COLUMN vendor_payee VARCHAR(200)"
                ))
                conn.commit()
                print("[migration] Added expenses.vendor_payee")

        # -- vendor_payment_batches table (introduced v1.5) --
        tables = inspector.get_table_names()
        if "vendor_payment_batches" not in tables:
            with db.engine.connect() as conn:
                conn.execute(text("""
                    CREATE TABLE vendor_payment_batches (
                        id                INTEGER PRIMARY KEY AUTOINCREMENT,
                        batch_reference   VARCHAR(50)  NOT NULL UNIQUE,
                        vendor_id         INTEGER      NOT NULL REFERENCES vendors(id),
                        payment_method    VARCHAR(30)  NOT NULL,
                        payment_date      DATE         NOT NULL,
                        payment_reference VARCHAR(100),
                        total_amount      REAL         NOT NULL DEFAULT 0.0,
                        bill_count        INTEGER      NOT NULL DEFAULT 0,
                        notes             TEXT,
                        created_by        INTEGER REFERENCES users(id),
                        created_at        DATETIME
                    )
                """))
                conn.commit()
                print("[migration] Created vendor_payment_batches table")

        # -- vendor_payments: drop UNIQUE on payment_reference, add batch_id --
        vp_cols = {c["name"] for c in inspector.get_columns("vendor_payments")}
        if "batch_id" not in vp_cols:
            with db.engine.connect() as conn:
                conn.execute(text("""
                    CREATE TABLE vendor_payments_v2 (
                        id                INTEGER PRIMARY KEY AUTOINCREMENT,
                        payment_reference VARCHAR(50)  NOT NULL,
                        batch_id          INTEGER      REFERENCES vendor_payment_batches(id),
                        vendor_bill_id    INTEGER      NOT NULL REFERENCES vendor_bills(id),
                        vendor_id         INTEGER      NOT NULL REFERENCES vendors(id),
                        amount            REAL         NOT NULL,
                        payment_date      DATE         NOT NULL,
                        payment_method    VARCHAR(30)  NOT NULL,
                        notes             TEXT,
                        created_by        INTEGER REFERENCES users(id),
                        created_at        DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO vendor_payments_v2
                        (id, payment_reference, batch_id, vendor_bill_id, vendor_id,
                         amount, payment_date, payment_method, notes, created_by, created_at)
                    SELECT
                        id, payment_reference, NULL, vendor_bill_id, vendor_id,
                        amount, payment_date, payment_method, notes, created_by, created_at
                    FROM vendor_payments
                """))
                conn.execute(text("DROP TABLE vendor_payments"))
                conn.execute(text("ALTER TABLE vendor_payments_v2 RENAME TO vendor_payments"))
                conn.commit()
                print("[migration] Rebuilt vendor_payments -- removed UNIQUE, added batch_id")


        # -- airlines table (introduced v1.6) ---------------------------------
        existing_tables = inspector.get_table_names()
        if "airlines" not in existing_tables:
            with db.engine.connect() as conn:
                conn.execute(text("""
                    CREATE TABLE airlines (
                        id         INTEGER PRIMARY KEY AUTOINCREMENT,
                        name       VARCHAR(150) NOT NULL UNIQUE,
                        is_active  INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME
                    )
                """))
                conn.commit()
                print("[migration] Created airlines table")

        # -- bookings: traveler_name free-text field (introduced v2.2) ----------
        bk_cols = {c["name"] for c in inspector.get_columns("bookings")}
        if "traveler_name" not in bk_cols:
            with db.engine.connect() as conn:
                conn.execute(text(
                    "ALTER TABLE bookings ADD COLUMN traveler_name VARCHAR(200)"
                ))
                conn.commit()
                print("[migration] Added bookings.traveler_name")

        # -- booking_items: airline_id + ticket_number (introduced v1.6) ------
        bi_cols = {c["name"] for c in inspector.get_columns("booking_items")}
        with db.engine.connect() as conn:
            if "passenger_name" not in bi_cols:
                conn.execute(text(
                    "ALTER TABLE booking_items ADD COLUMN passenger_name VARCHAR(200)"
                ))
                conn.commit()
                print("[migration] Added booking_items.passenger_name")
            if "airline_id" not in bi_cols:
                conn.execute(text(
                    "ALTER TABLE booking_items ADD COLUMN airline_id INTEGER REFERENCES airlines(id)"
                ))
                conn.commit()
                print("[migration] Added booking_items.airline_id")
            if "ticket_number" not in bi_cols:
                conn.execute(text(
                    "ALTER TABLE booking_items ADD COLUMN ticket_number VARCHAR(100)"
                ))
                conn.commit()
                print("[migration] Added booking_items.ticket_number")

        # -- payments: AR subledger columns (introduced v2.0) --
        pmt_cols_existing = {c["name"] for c in inspector.get_columns("payments")}
        with db.engine.connect() as conn:
            if "transaction_type" not in pmt_cols_existing:
                conn.execute(text(
                    "ALTER TABLE payments ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'invoice_payment'"
                ))
                conn.commit()
                print("[migration] Added payments.transaction_type")
            if "amount_applied" not in pmt_cols_existing:
                conn.execute(text(
                    "ALTER TABLE payments ADD COLUMN amount_applied REAL NOT NULL DEFAULT 0.0"
                ))
                conn.commit()
                print("[migration] Added payments.amount_applied")
            if "unapplied_amount" not in pmt_cols_existing:
                conn.execute(text(
                    "ALTER TABLE payments ADD COLUMN unapplied_amount REAL NOT NULL DEFAULT 0.0"
                ))
                conn.commit()
                print("[migration] Added payments.unapplied_amount")
            # Backfill: set transaction_type and mark all existing rows as fully applied
            conn.execute(text("""
                UPDATE payments
                SET transaction_type = CASE
                        WHEN notes LIKE '[ADVANCE]%' THEN 'advance_deposit'
                        ELSE 'invoice_payment'
                    END,
                    amount_applied   = COALESCE(amount, 0.0),
                    unapplied_amount = 0.0
                WHERE amount_applied = 0.0 AND amount > 0
            """))
            conn.commit()

        # -- payments: v2.1 — fix unapplied_amount for existing records --
        # The v2.0 backfill incorrectly set amount_applied=amount, unapplied_amount=0
        # for ALL rows.  This corrects:
        #
        #   (a) Advance deposits (invoice_id IS NULL):
        #       The full amount is unallocated — nothing has been applied to any invoice.
        #       Fix: amount_applied=0, unapplied_amount=amount
        #
        #   (b) Invoice-linked overpayments (payment.amount > invoice.total_amount):
        #       Only invoice.total_amount can be applied; the excess is open credit.
        #       Fix: amount_applied=invoice.total_amount,
        #            unapplied_amount=payment.amount - invoice.total_amount
        #
        # The condition "unapplied_amount = 0.0" guards against re-running on rows
        # that were already correctly set (new payments or previous fix runs).
        with db.engine.connect() as conn:
            # (a) Advance deposits not tied to any invoice
            conn.execute(text("""
                UPDATE payments
                SET amount_applied   = 0.0,
                    unapplied_amount = amount
                WHERE invoice_id IS NULL
                  AND transaction_type IN ('advance_deposit', 'invoice_payment')
                  AND unapplied_amount = 0.0
                  AND amount > 0
            """))
            conn.commit()

            # (b) Invoice-linked payments where the amount exceeds the invoice total
            conn.execute(text("""
                UPDATE payments
                SET amount_applied   = (
                        SELECT COALESCE(i.total_amount, payments.amount)
                        FROM invoices i WHERE i.id = payments.invoice_id
                    ),
                    unapplied_amount = amount - (
                        SELECT COALESCE(i.total_amount, payments.amount)
                        FROM invoices i WHERE i.id = payments.invoice_id
                    )
                WHERE invoice_id IS NOT NULL
                  AND transaction_type NOT IN ('credit_application')
                  AND unapplied_amount = 0.0
                  AND amount > (
                        SELECT COALESCE(i.total_amount, 0)
                        FROM invoices i WHERE i.id = payments.invoice_id
                    )
            """))
            conn.commit()
            print("[migration v2.1] Corrected amount_applied / unapplied_amount for existing payments")

        # -- payments: make invoice_id nullable (introduced v2.2) --
        # SQLite cannot ALTER COLUMN, so we rebuild the table.
        pmt_cols_info = inspector.get_columns("payments")
        invoice_id_col = next((c for c in pmt_cols_info if c["name"] == "invoice_id"), None)
        if invoice_id_col and not invoice_id_col.get("nullable", True):
            with db.engine.connect() as conn:
                conn.execute(text("""
                    CREATE TABLE payments_v3 (
                        id                INTEGER PRIMARY KEY AUTOINCREMENT,
                        payment_reference VARCHAR(50)  NOT NULL UNIQUE,
                        invoice_id        INTEGER      REFERENCES invoices(id),
                        customer_id       INTEGER      NOT NULL REFERENCES customers(id),
                        transaction_type  TEXT         NOT NULL DEFAULT 'invoice_payment',
                        amount            REAL         NOT NULL,
                        amount_applied    REAL         NOT NULL DEFAULT 0.0,
                        unapplied_amount  REAL         NOT NULL DEFAULT 0.0,
                        payment_date      DATE         NOT NULL,
                        payment_method    VARCHAR(30)  NOT NULL,
                        notes             TEXT,
                        created_by        INTEGER REFERENCES users(id),
                        created_at        DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO payments_v3
                        (id, payment_reference, invoice_id, customer_id, transaction_type,
                         amount, amount_applied, unapplied_amount, payment_date,
                         payment_method, notes, created_by, created_at)
                    SELECT
                        id, payment_reference, invoice_id, customer_id, transaction_type,
                        amount, amount_applied, unapplied_amount, payment_date,
                        payment_method, notes, created_by, created_at
                    FROM payments
                """))
                conn.execute(text("DROP TABLE payments"))
                conn.execute(text("ALTER TABLE payments_v3 RENAME TO payments"))
                conn.commit()
                print("[migration v2.2] Rebuilt payments table -- invoice_id is now nullable")

        # -- chart_of_accounts: seed expense accounts (introduced v1.4) --
        from .models.expense import EXPENSE_CATEGORIES
        with db.engine.connect() as conn:
            for key, code, name in EXPENSE_CATEGORIES:
                existing_acct = conn.execute(
                    text("SELECT id FROM chart_of_accounts WHERE account_code = :code"),
                    {"code": code}
                ).fetchone()
                if not existing_acct:
                    conn.execute(text("""
                        INSERT INTO chart_of_accounts
                            (account_code, account_name, account_type, is_active, description)
                        VALUES (:code, :name, 'expense', 1, :desc)
                    """), {
                        "code": code,
                        "name": name,
                        "desc": f"Operating expense -- {name}",
                    })
                    conn.commit()
                    print(f"[migration] Seeded chart_of_accounts: {name}")


def create_app(env: str = "development") -> "Flask":
    """
    Application factory.  Pass env='testing' in unit tests.
    """
    app = Flask(__name__)

    # ── Config ──────────────────────────────────────────────────────────────
    cfg = config_map.get(env, config_map["development"])
    app.config.from_object(cfg)

    # ── Extensions ──────────────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})

    # ── Import all models so db.create_all() knows about every table ────────
    from .models import (user, customer, booking, invoice, payment,       # noqa: F401
                         vendor, vendor_bill, expense, accounting,
                         audit, airline, trial_balance)

    # ── Create tables & run migrations ──────────────────────────────────────
    with app.app_context():
        db.create_all()
    _run_migrations(app)

    # ── Register blueprints ──────────────────────────────────────────────────
    from .routes.auth         import auth_bp
    from .routes.customers    import customers_bp
    from .routes.bookings     import bookings_bp
    from .routes.invoices     import invoices_bp
    from .routes.payments     import payments_bp
    from .routes.vendors      import vendors_bp
    from .routes.vendor_bills import vendor_bills_bp
    from .routes.expenses     import expenses_bp
    from .routes.reports      import reports_bp
    from .routes.airlines     import airlines_bp
    from .routes.admin        import admin_bp

    # ── Load agency profile into config ────────────────────────────────────────
    try:
        import sys, os
        _backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _backend_dir not in sys.path:
            sys.path.insert(0, _backend_dir)
        from agency_profile import AGENCY_PROFILE
        app.config["AGENCY_PROFILE"] = AGENCY_PROFILE
        print(f"[agency] Loaded profile: {AGENCY_PROFILE.get('name')}")
    except Exception as e:
        print(f"[agency] Could not load agency_profile.py: {e}")

    app.register_blueprint(auth_bp,         url_prefix="/api/auth")
    app.register_blueprint(customers_bp,    url_prefix="/api/customers")
    app.register_blueprint(bookings_bp,     url_prefix="/api/bookings")
    app.register_blueprint(invoices_bp,     url_prefix="/api/invoices")
    app.register_blueprint(payments_bp,     url_prefix="/api/payments")
    app.register_blueprint(vendors_bp,      url_prefix="/api/vendors")
    app.register_blueprint(vendor_bills_bp, url_prefix="/api/vendor-bills")
    app.register_blueprint(expenses_bp,     url_prefix="/api/expenses")
    app.register_blueprint(reports_bp,      url_prefix="/api/reports")
    app.register_blueprint(airlines_bp,     url_prefix="/api/airlines")
    app.register_blueprint(admin_bp,        url_prefix="/api/admin")

    return app
