"""
config.py — Application configuration.

Three environments are supported:
  - DevelopmentConfig  (default)
  - TestingConfig      (for future automated tests)
  - ProductionConfig   (for deployment)

PostgreSQL upgrade: change SQLALCHEMY_DATABASE_URI to your Postgres connection string.
  Example: postgresql://user:password@localhost:5432/travel_ledger
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

# Load variables from .env file (if it exists)
load_dotenv()

# Absolute path to the backend/ folder (the folder that contains this config.py's parent)
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_INSTANCE_DIR = os.path.join(_BACKEND_DIR, "instance")
os.makedirs(_INSTANCE_DIR, exist_ok=True)

# Build a valid SQLite URL that works on Windows paths containing spaces.
# SQLAlchemy requires forward slashes and NO percent-encoding for file paths.
# For an absolute path use 4 slashes: sqlite:////absolute/path/file.db
_DB_PATH = os.path.join(_INSTANCE_DIR, "travel_ledger.db").replace("\\", "/")
_DEFAULT_DB = "sqlite:///" + _DB_PATH


class BaseConfig:
    """Settings shared by all environments."""

    # ── Security ────────────────────────────────────────────────────────────
    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")
    JWT_SECRET_KEY = SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)   # tokens expire after 8 hours
    JWT_TOKEN_LOCATION = ["headers", "query_string"] # token in header OR ?token= query param
    JWT_QUERY_STRING_NAME = "token"

    # ── Database ────────────────────────────────────────────────────────────
    SQLALCHEMY_TRACK_MODIFICATIONS = False           # suppress deprecation warning
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", _DEFAULT_DB)
    # PostgreSQL upgrade tip:
    # Set DATABASE_URL=postgresql://user:pass@host:5432/dbname in your .env

    # ── CORS ────────────────────────────────────────────────────────────────
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")


class DevelopmentConfig(BaseConfig):
    """Development settings — verbose errors, no caching."""
    DEBUG = True
    SQLALCHEMY_ECHO = False   # set True to print every SQL query to the console
    # Keep CORS headers on error responses even in debug mode.
    # Without this, Werkzeug re-raises exceptions and bypasses after_request hooks.
    PROPAGATE_EXCEPTIONS = False


class TestingConfig(BaseConfig):
    """Testing settings — use an in-memory database."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)


class ProductionConfig(BaseConfig):
    """Production settings — strict security."""
    DEBUG = False
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=4)


# Map environment name → config class
config_map = {
    "development": DevelopmentConfig,
    "testing":     TestingConfig,
    "production":  ProductionConfig,
}
