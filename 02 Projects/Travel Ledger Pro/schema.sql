-- =============================================================
-- Travel Ledger Pro — Database Schema
-- Version: MVP v1.0
-- Database: SQLite (designed for easy upgrade to PostgreSQL)
-- Date: 2026-05-11
-- =============================================================
-- PostgreSQL upgrade notes are included as comments throughout.
-- Search for "-- PG:" to find all migration notes.
-- =============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;


-- -------------------------------------------------------------
-- 1. USERS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT, -- PG: SERIAL PRIMARY KEY
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password_hash TEXT  NOT NULL,                  -- bcrypt hash
    role        TEXT    NOT NULL DEFAULT 'staff'
                CHECK (role IN ('admin', 'staff')),
    is_active   INTEGER NOT NULL DEFAULT 1          -- PG: BOOLEAN DEFAULT TRUE
                CHECK (is_active IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')), -- PG: TIMESTAMPTZ DEFAULT now()
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- -------------------------------------------------------------
-- 2. CUSTOMERS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT,
    phone           TEXT,
    passport_number TEXT,
    nationality     TEXT,
    notes           TEXT,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);


-- -------------------------------------------------------------
-- 3. VENDORS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'other'
                 CHECK (type IN ('airline', 'hotel', 'tour', 'visa', 'insurance', 'other')),
    contact_name TEXT,
    phone        TEXT,
    email        TEXT,
    notes        TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1
                 CHECK (is_active IN (0, 1)),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(type);


-- -------------------------------------------------------------
-- 4. CHART OF ACCOUNTS
-- (Created before bookings so other tables can reference it)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    account_code TEXT    NOT NULL UNIQUE,          -- e.g. '1100'
    account_name TEXT    NOT NULL,                 -- e.g. 'Accounts Receivable'
    account_type TEXT    NOT NULL
                 CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_id    INTEGER REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    is_active    INTEGER NOT NULL DEFAULT 1
                 CHECK (is_active IN (0, 1)),
    description  TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coa_code ON chart_of_accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);


-- -------------------------------------------------------------
-- 5. BOOKINGS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_reference  TEXT    NOT NULL UNIQUE,    -- e.g. 'BK-2026-001'
    customer_id        INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    destination        TEXT,
    travel_date        TEXT,                        -- PG: DATE
    return_date        TEXT,                        -- PG: DATE (nullable)
    status             TEXT    NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes              TEXT,
    created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_customer    ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status      ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_travel_date ON bookings(travel_date);


-- -------------------------------------------------------------
-- 6. BOOKING ITEMS
-- Each line within a booking (flight, hotel, visa, etc.)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id    INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    service_type  TEXT    NOT NULL
                  CHECK (service_type IN ('flight', 'hotel', 'visa', 'tour_package', 'insurance', 'other')),
    vendor_id     INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    description   TEXT,
    selling_price REAL    NOT NULL DEFAULT 0,       -- PG: NUMERIC(15,2) NOT NULL DEFAULT 0
    vendor_cost   REAL    NOT NULL DEFAULT 0,       -- PG: NUMERIC(15,2) NOT NULL DEFAULT 0
    -- profit_margin is computed: selling_price - vendor_cost
    -- SQLite computed columns (SQLite 3.31+):
    profit_margin REAL    GENERATED ALWAYS AS (selling_price - vendor_cost) VIRTUAL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- PG note: Replace the GENERATED column with:
-- profit_margin NUMERIC(15,2) GENERATED ALWAYS AS (selling_price - vendor_cost) STORED

CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_vendor  ON booking_items(vendor_id);


-- -------------------------------------------------------------
-- 7. INVOICES
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT    NOT NULL UNIQUE,         -- e.g. 'INV-2026-001'
    booking_id     INTEGER NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    issue_date     TEXT    NOT NULL DEFAULT (date('now')), -- PG: DATE DEFAULT CURRENT_DATE
    due_date       TEXT,
    subtotal       REAL    NOT NULL DEFAULT 0,       -- PG: NUMERIC(15,2)
    tax_amount     REAL    NOT NULL DEFAULT 0,       -- PG: NUMERIC(15,2)
    total_amount   REAL    NOT NULL DEFAULT 0,       -- PG: NUMERIC(15,2)
    amount_paid    REAL    NOT NULL DEFAULT 0,       -- PG: NUMERIC(15,2)
    -- balance_due is computed
    balance_due    REAL    GENERATED ALWAYS AS (total_amount - amount_paid) VIRTUAL,
    status         TEXT    NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled')),
    notes          TEXT,
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking  ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);


-- -------------------------------------------------------------
-- 8. INVOICE ITEMS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    booking_item_id INTEGER REFERENCES booking_items(id) ON DELETE SET NULL,
    description     TEXT    NOT NULL,
    quantity        REAL    NOT NULL DEFAULT 1,      -- PG: NUMERIC(10,2)
    unit_price      REAL    NOT NULL,               -- PG: NUMERIC(15,2)
    total_price     REAL    NOT NULL,               -- PG: NUMERIC(15,2)
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);


-- -------------------------------------------------------------
-- 9. PAYMENTS (Customer → Agency)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_reference TEXT    NOT NULL UNIQUE,      -- e.g. 'PAY-2026-001'
    invoice_id        INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    amount            REAL    NOT NULL,              -- PG: NUMERIC(15,2)
    payment_date      TEXT    NOT NULL DEFAULT (date('now')),
    payment_method    TEXT    NOT NULL
                      CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'mobile_money')),
    notes             TEXT,
    created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice  ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date     ON payments(payment_date);


-- -------------------------------------------------------------
-- 10. VENDOR BILLS (Agency owes Vendor)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_bills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_reference  TEXT    NOT NULL UNIQUE,        -- e.g. 'VB-2026-001'
    vendor_id       INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    booking_id      INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    booking_item_id INTEGER REFERENCES booking_items(id) ON DELETE SET NULL,
    description     TEXT,
    amount          REAL    NOT NULL,               -- PG: NUMERIC(15,2)
    bill_date       TEXT    NOT NULL DEFAULT (date('now')),
    due_date        TEXT,
    amount_paid     REAL    NOT NULL DEFAULT 0,     -- PG: NUMERIC(15,2)
    balance_due     REAL    GENERATED ALWAYS AS (amount - amount_paid) VIRTUAL,
    status          TEXT    NOT NULL DEFAULT 'unpaid'
                    CHECK (status IN ('unpaid', 'partially_paid', 'paid')),
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_bills_vendor  ON vendor_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_booking ON vendor_bills(booking_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bills_status  ON vendor_bills(status);


-- -------------------------------------------------------------
-- 11. VENDOR PAYMENTS (Agency → Vendor)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_payments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_reference TEXT    NOT NULL UNIQUE,      -- e.g. 'VP-2026-001'
    vendor_bill_id    INTEGER NOT NULL REFERENCES vendor_bills(id) ON DELETE RESTRICT,
    vendor_id         INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    amount            REAL    NOT NULL,              -- PG: NUMERIC(15,2)
    payment_date      TEXT    NOT NULL DEFAULT (date('now')),
    payment_method    TEXT    NOT NULL
                      CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'mobile_money')),
    notes             TEXT,
    created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_bill   ON vendor_payments(vendor_bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date   ON vendor_payments(payment_date);


-- -------------------------------------------------------------
-- 12. EXPENSES (General operating costs)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_reference  TEXT    NOT NULL UNIQUE,     -- e.g. 'EXP-2026-001'
    category           TEXT    NOT NULL
                       CHECK (category IN (
                           'airline_payment', 'hotel_payment', 'staff_salary',
                           'office_rent', 'fuel', 'marketing', 'utilities', 'miscellaneous'
                       )),
    account_id         INTEGER NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    description        TEXT    NOT NULL,
    amount             REAL    NOT NULL,             -- PG: NUMERIC(15,2)
    expense_date       TEXT    NOT NULL DEFAULT (date('now')),
    payment_method     TEXT
                       CHECK (payment_method IN ('cash', 'bank_transfer', 'credit_card', 'mobile_money')),
    receipt_number     TEXT,
    notes              TEXT,
    created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(expense_date);


-- -------------------------------------------------------------
-- 13. JOURNAL ENTRIES (Double-entry bookkeeping header)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_reference TEXT    NOT NULL UNIQUE,        -- e.g. 'JE-2026-001'
    entry_date      TEXT    NOT NULL DEFAULT (date('now')),
    description     TEXT    NOT NULL,
    source_type     TEXT
                    CHECK (source_type IN (
                        'invoice', 'payment', 'vendor_bill',
                        'vendor_payment', 'expense', 'manual'
                    )),
    source_id       INTEGER,                        -- FK to the source table's PK
    is_posted       INTEGER NOT NULL DEFAULT 1      -- PG: BOOLEAN DEFAULT TRUE
                    CHECK (is_posted IN (0, 1)),    -- 0 = draft, 1 = posted
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_je_date        ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_je_source      ON journal_entries(source_type, source_id);


-- -------------------------------------------------------------
-- 14. JOURNAL ENTRY LINES (Debit / Credit lines)
-- Rule: SUM(debit) = SUM(credit) for every journal_entry_id
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id       INTEGER NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    debit            REAL    NOT NULL DEFAULT 0,    -- PG: NUMERIC(15,2)
    credit           REAL    NOT NULL DEFAULT 0,    -- PG: NUMERIC(15,2)
    description      TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (debit >= 0 AND credit >= 0),
    CHECK (NOT (debit > 0 AND credit > 0))          -- A line is either debit OR credit, not both
);

CREATE INDEX IF NOT EXISTS idx_jel_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id);


-- -------------------------------------------------------------
-- 15. AUDIT TRAIL
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_trail (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT    NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    table_name TEXT    NOT NULL,
    record_id  INTEGER,
    old_values TEXT,                                -- JSON string. PG: JSONB
    new_values TEXT,                                -- JSON string. PG: JSONB
    ip_address TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_table  ON audit_trail(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date   ON audit_trail(created_at);
