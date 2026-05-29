"""
run.py -- Entry point for Travel Ledger Pro backend.

To start the development server:
    python run.py
"""

from app import create_app

app = create_app()


class CORSMiddleware:
    """
    WSGI middleware that injects CORS headers on every response,
    including errors and Werkzeug pages.
    """
    ORIGIN = "*"
    HEADERS = "Content-Type, Authorization"
    METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):

        # Handle preflight requests
        if environ.get("REQUEST_METHOD") == "OPTIONS":
            headers = [
                ("Access-Control-Allow-Origin", self.ORIGIN),
                ("Access-Control-Allow-Headers", self.HEADERS),
                ("Access-Control-Allow-Methods", self.METHODS),
                ("Access-Control-Max-Age", "600"),
                ("Content-Length", "0"),
            ]
            start_response("204 No Content", headers)
            return [b""]

        def cors_start_response(status, headers, exc_info=None):
            filtered = [
                (k, v) for k, v in headers
                if k.lower() not in {
                    "access-control-allow-origin",
                    "access-control-allow-headers",
                    "access-control-allow-methods",
                }
            ]

            filtered += [
                ("Access-Control-Allow-Origin", self.ORIGIN),
                ("Access-Control-Allow-Headers", self.HEADERS),
                ("Access-Control-Allow-Methods", self.METHODS),
            ]

            return start_response(status, filtered, exc_info)

        return self.wsgi_app(environ, cors_start_response)


# Wrap app with CORS middleware
app.wsgi_app = CORSMiddleware(app.wsgi_app)


def _seed_admin():
    """
    Create default admin user if none exists.
    SAFE: wrapped to avoid Render crash.
    """
    try:
        with app.app_context():
            from app.models.user import User
            from app.extensions import db

            if not User.query.first():
                admin = User(
                    name="Admin",
                    email="admin@travelledgerpro.com",
                    role="admin",
                    is_active=True,
                )
                admin.set_password("Admin@1234")

                db.session.add(admin)
                db.session.commit()

                print("[init] Default admin created: admin@travelledgerpro.com / Admin@1234")

    except Exception as e:
        print("[WARN] Admin seed skipped:", str(e))


_seed_admin()


def _seed_coa():
    """
    Seed the chart of accounts if the table is empty.
    SAFE: wrapped to avoid Render crash.
    """
    try:
        with app.app_context():
            from app.models.accounting import ChartOfAccount
            from app.extensions import db

            if ChartOfAccount.query.first():
                return  # already seeded

            accounts = [
                # code,   name,                              type,        description
                ("1000", "Cash on Hand",                    "asset",     "Physical cash in the office"),
                ("1010", "Bank Account — Main",              "asset",     "Primary business bank account"),
                ("1020", "Bank Account — USD",               "asset",     "USD foreign currency account"),
                ("1100", "Accounts Receivable",              "asset",     "Money owed by customers"),
                ("2000", "Accounts Payable — Vendors",       "liability", "Money owed to suppliers"),
                ("2100", "Tax Payable",                      "liability", "VAT or tax owed to government"),
                ("3000", "Owner's Equity",                   "equity",    "Owner's investment in the business"),
                ("3100", "Retained Earnings",                "equity",    "Accumulated profits"),
                ("4000", "Sales Revenue — Travel Services",  "revenue",   "Income from bookings"),
                ("4100", "Commission Income",                "revenue",   "Commission from partners"),
                ("5000", "Cost of Sales — Airline Tickets",  "expense",   "Airline ticket costs"),
                ("5010", "Cost of Sales — Hotel",            "expense",   "Hotel accommodation costs"),
                ("5020", "Cost of Sales — Visa Services",    "expense",   "Visa processing costs"),
                ("5030", "Cost of Sales — Tour Packages",    "expense",   "Tour operator costs"),
                ("5040", "Cost of Sales — Insurance",        "expense",   "Travel insurance costs"),
                ("6000", "Operating Expenses",               "expense",   "Parent: all operating costs"),
                ("6100", "Staff Salaries",                   "expense",   "Monthly staff wages"),
                ("6200", "Office Rent",                      "expense",   "Monthly office rent"),
                ("6300", "Fuel & Transport",                 "expense",   "Vehicle and transport costs"),
                ("6400", "Marketing & Advertising",          "expense",   "Ads, promotions, marketing"),
                ("6500", "Utilities",                        "expense",   "Electricity, internet, water"),
                ("6900", "Miscellaneous Expenses",           "expense",   "Other operating expenses"),
            ]

            parent_6000_id = None
            for code, name, acct_type, desc in accounts:
                if ChartOfAccount.query.filter_by(account_code=code).first():
                    continue
                acct = ChartOfAccount(
                    account_code=code,
                    account_name=name,
                    account_type=acct_type,
                    description=desc,
                    is_active=True,
                )
                db.session.add(acct)
                db.session.flush()
                if code == "6000":
                    parent_6000_id = acct.id

            if parent_6000_id:
                db.session.flush()
                for code in ["6100", "6200", "6300", "6400", "6500", "6900"]:
                    acct = ChartOfAccount.query.filter_by(account_code=code).first()
                    if acct and acct.parent_id is None:
                        acct.parent_id = parent_6000_id

            db.session.commit()
            print("[init] Chart of accounts seeded (22 accounts)")

    except Exception as e:
        print("[WARN] COA seed skipped:", str(e))


_seed_coa()


def _ensure_tables():
    """
    Prevent Render crash: auto-create missing DB tables.
    """
    try:
        with app.app_context():
            from app.extensions import db
            db.create_all()
            print("[init] Database tables ensured")
    except Exception as e:
        print("[WARN] DB init skipped:", str(e))


_ensure_tables()


if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"

    app.run(
        host="0.0.0.0",
        port=port,
        debug=debug
    )