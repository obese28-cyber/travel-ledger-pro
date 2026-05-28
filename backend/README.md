# Travel Ledger Pro — Backend API

Python Flask REST API for the Travel Ledger Pro accounting system.

## Quick Start

### 1. Set up your Python environment

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac / Linux
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set a strong JWT_SECRET_KEY
```

### 4. Initialize the database

```bash
# Creates tables, chart of accounts, and default admin user
python init_db.py

# Also loads sample customers, vendors, and bookings
python init_db.py --sample
```

### 5. Start the server

```bash
python run.py
```

API runs at `http://localhost:5000`

---

## Default Login Credentials

| Role  | Email                         | Password    |
|-------|-------------------------------|-------------|
| Admin | admin@travelledgerpro.com     | Admin@1234  |
| Staff | sarah@travelledgerpro.com     | Staff@1234  |

> **Change these passwords immediately after first login.**

---

## API Reference

### Authentication
| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/auth/login` | Login and receive JWT token |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### Customers
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/customers/` | List customers (supports `?search=`) |
| POST | `/api/customers/` | Create customer |
| GET | `/api/customers/<id>` | Customer detail + balance |
| PUT | `/api/customers/<id>` | Update customer |
| GET | `/api/customers/<id>/bookings` | Customer's bookings |

### Vendors
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/vendors/` | List vendors (supports `?type=airline`) |
| POST | `/api/vendors/` | Create vendor |
| GET | `/api/vendors/<id>` | Vendor detail + balance |
| PUT | `/api/vendors/<id>` | Update vendor |
| GET | `/api/vendors/<id>/balance` | Full balance breakdown |

### Bookings
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/bookings/` | List bookings |
| POST | `/api/bookings/` | Create booking with items |
| GET | `/api/bookings/<id>` | Booking detail |
| PATCH | `/api/bookings/<id>/status` | Update status |

### Invoices
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/invoices/` | List invoices |
| POST | `/api/invoices/from-booking/<id>` | Generate invoice from booking |
| GET | `/api/invoices/<id>` | Invoice detail |
| PATCH | `/api/invoices/<id>/issue` | Issue invoice → creates journal entry |
| PATCH | `/api/invoices/<id>/cancel` | Cancel invoice |

### Payments
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/payments/` | List payments |
| POST | `/api/payments/` | Record customer payment → journal entry |
| GET | `/api/payments/<id>` | Payment detail |

### Vendor Bills & Payments
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/vendor-bills/` | List vendor bills |
| POST | `/api/vendor-bills/` | Record vendor cost → journal entry |
| GET | `/api/vendor-bills/<id>` | Bill detail |
| POST | `/api/vendor-bills/<id>/payments` | Pay vendor → journal entry |

### Reports
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/reports/dashboard` | Dashboard summary |
| GET | `/api/reports/profit-loss` | P&L statement |
| GET | `/api/reports/daily-sales` | Daily sales report |
| GET | `/api/reports/customer-balances` | Outstanding customer balances |
| GET | `/api/reports/vendor-balances` | Outstanding vendor balances |

All report endpoints accept `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`.

---

## Typical API Workflow

```
1. POST /api/auth/login                        → get token
2. POST /api/customers/                        → create customer
3. POST /api/bookings/                         → create booking with items
4. POST /api/invoices/from-booking/<id>        → generate invoice (draft)
5. PATCH /api/invoices/<id>/issue              → issue invoice (journal entry created)
6. POST /api/payments/                         → record customer payment
7. POST /api/vendor-bills/                     → record vendor cost
8. POST /api/vendor-bills/<id>/payments        → pay vendor
9. GET  /api/reports/profit-loss               → view P&L
```

---

## Authentication

All endpoints (except `/api/auth/login` and `/api/health`) require a JWT token.

Include the token in the `Authorization` header:
```
Authorization: Bearer <your-token-here>
```

---

## Upgrading to PostgreSQL

1. Install `psycopg2-binary`: `pip install psycopg2-binary`
2. Update `.env`:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/travel_ledger
   ```
3. In SQLAlchemy models, `Float` columns should be changed to `Numeric(15, 2)` for production-grade money handling.
4. Run `python init_db.py` against the new database.

---

## Project Structure

```
backend/
├── app/
│   ├── __init__.py           # App factory
│   ├── config.py             # Dev / Test / Prod config
│   ├── extensions.py         # db, jwt, cors instances
│   ├── models/               # SQLAlchemy ORM models (15 tables)
│   │   ├── user.py
│   │   ├── customer.py
│   │   ├── vendor.py
│   │   ├── booking.py
│   │   ├── invoice.py
│   │   ├── payment.py
│   │   ├── vendor_bill.py
│   │   ├── expense.py
│   │   ├── accounting.py     # Chart of accounts + journal entries
│   │   └── audit.py
│   ├── routes/               # API blueprints (one file per module)
│   │   ├── auth.py
│   │   ├── customers.py
│   │   ├── vendors.py
│   │   ├── bookings.py
│   │   ├── invoices.py
│   │   ├── payments.py
│   │   ├── vendor_bills.py
│   │   └── reports.py
│   ├── services/             # Business logic
│   │   ├── accounting_service.py   # Auto journal entry creation
│   │   ├── reference_service.py    # BK-2026-001 style IDs
│   │   └── audit_service.py        # Audit trail logging
│   └── utils/
│       ├── responses.py      # Standardized JSON responses
│       └── decorators.py     # @admin_required
├── instance/
│   └── travel_ledger.db      # SQLite database (auto-created)
├── init_db.py                # Database setup script
├── run.py                    # Dev server entry point
├── requirements.txt
└── .env.example
```
