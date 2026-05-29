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