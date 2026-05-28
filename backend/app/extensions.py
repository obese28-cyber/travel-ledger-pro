"""
extensions.py — Flask extension instances.

We create extension objects here (without attaching them to an app yet),
then call .init_app(app) inside the app factory. This pattern is called
"application factory" and is the Flask-recommended way to avoid circular imports.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS

# Database ORM — used everywhere to define models and run queries
db = SQLAlchemy()

# JWT authentication manager
jwt = JWTManager()

# Cross-Origin Resource Sharing — lets the React frontend talk to this API
cors = CORS()
