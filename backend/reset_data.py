"""
reset_data.py -- Wipe all transaction data without touching users or code.

Usage (from backend folder):
    python reset_data.py

Deletes: customers, bookings, invoices, payments, vendors, expenses, airlines.
Keeps:   users (login accounts), chart_of_accounts.
"""

import os, sys, sqlite3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH    = os.path.join(SCRIPT_DIR, "instance", "travel_ledger.db")

if not os.path.exists(DB_PATH):
    print("[ERROR] Database not found at:", DB_PATH)
    sys.exit(1)

print("Database:", DB_PATH)
print()
answer = input(
    "This will DELETE all customers, bookings, invoices, payments,\n"
    "vendors, expenses, and related data.\n"
    "Users and chart of accounts will NOT be touched.\n\n"
    "Type  YES  to confirm: "
).strip()

if answer != "YES":
    print("Cancelled -- nothing was deleted.")
    sys.exit(0)

conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()
cur.execute("PRAGMA foreign_keys = OFF")

tables = [
    "audit_logs",
    "journal_entries",
    "vendor_payments",
    "vendor_payment_batches",
    "vendor_bills",
    "invoice_items",
    "invoices",
    "payments",
    "booking_items",
    "bookings",
    "customers",
    "expenses",
    "vendors",
    "airlines",
    "trial_balance_entries",
]

print()
for table in tables:
    try:
        cur.execute("DELETE FROM " + table)
        print("  OK  {:<32} {} row(s) deleted".format(table, cur.rowcount))
    except sqlite3.OperationalError as e:
        print("  --  {:<32} skipped ({})".format(table, e))

placeholders = ",".join("'" + t + "'" for t in tables)
cur.execute("DELETE FROM sqlite_sequence WHERE name IN (" + placeholders + ")")

cur.execute("PRAGMA foreign_keys = ON")
conn.commit()
conn.close()

print()
print("Done! All transaction data cleared.")
print("Restart the backend server before continuing.")
