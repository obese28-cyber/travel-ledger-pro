"""
run.py -- Entry point for Travel Ledger Pro backend.

To start the development server:
    python run.py
"""

from app import create_app

app = create_app()


class CORSMiddleware:
    """
    WSGI middleware that injects Access-Control-Allow-Origin on EVERY response,
    including Werkzeug debugger pages, unhandled-exception 500s, and anything
    else that bypasses Flask's after_request hooks.
    """
    ORIGIN  = "http://localhost:3000"
    HEADERS = "Content-Type, Authorization"
    METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # Handle preflight at WSGI level so it never fails
        if environ.get("REQUEST_METHOD") == "OPTIONS":
            headers = [
                ("Access-Control-Allow-Origin",  self.ORIGIN),
                ("Access-Control-Allow-Headers", self.HEADERS),
                ("Access-Control-Allow-Methods", self.METHODS),
                ("Access-Control-Max-Age",        "600"),
                ("Content-Length", "0"),
            ]
            start_response("204 No Content", headers)
            return [b""]

        def cors_start_response(status, headers, exc_info=None):
            # Inject / overwrite CORS headers on every response
            filtered = [
                (k, v) for k, v in headers
                if k.lower() not in {
                    "access-control-allow-origin",
                    "access-control-allow-headers",
                    "access-control-allow-methods",
                }
            ]
            filtered += [
                ("Access-Control-Allow-Origin",  self.ORIGIN),
                ("Access-Control-Allow-Headers", self.HEADERS),
                ("Access-Control-Allow-Methods", self.METHODS),
            ]
            return start_response(status, filtered, exc_info)

        return self.wsgi_app(environ, cors_start_response)


# Wrap the Flask app — this runs at the WSGI layer, below Flask internals
app.wsgi_app = CORSMiddleware(app.wsgi_app)


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
