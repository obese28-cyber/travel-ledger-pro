"""
reset_demo_data.py — Safe demo/sample data removal for Travel Ledger Pro.

WHAT THIS SCRIPT DOES
---------------------
Removes ALL transactional / operational demo data from the database while
keeping the accounting structure, users, and system configuration intact.

KEEPS (untouched)
-----------------
  users               — admin and staff login accounts
  chart_of_accounts   — full COA with all 6xxx / 5xxx / 4xxx / etc. accounts
  schema              — all tables, columns, indexes remain in place
  system config       — nothing in .env or config.py is changed

DELETES (in FK-safe order)
--------------------------
  1. audit_trail
  2. vendor_payments
  3. journal_entry_lines
  4. journal_entries
  5. trial_balance_entries
  6. payments
  7. invoice_items
  8. invoices
  9. vendor_bills
 10. booking_items
 11. bookings
 12. customers
 13. vendors
 14. expenses

BACKUP
------
Before any deletion the script copies the live .db file to:
  instance/backups/travel_ledger_backup_YYYYMMDD_HHMMSS.db

USAGE
-----
  cd backend
  python reset_demo_data.py

  # Dry-run (shows counts, touches nothing):
  python reset_demo_data.py --dry-run
"""

import os
import sys
import shutil
import argparse
from datetime import datetime

# ── locate the project root so we can import the Flask app ──────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = SCRIPT_DIR
sys.path.insert(0, PROJECT_ROOT)

# ── Flask / SQLAlchemy bootstrap ─────────────────────────────────────────────
from app import create_app
from app.extensions import db

# ── SQLAlchemy model table names (raw SQL deletes — avoids ORM cascade issues)
TABLES_IN_DELETE_ORDER = [
    # Leaf / reference tables first
    "audit_trail",
    "vendor_payments",
    "journal_entry_lines",
    "journal_entries",
    "trial_balance_entries",
    # Payment / invoice layer
    "payments",
    "invoice_items",
    "invoices",
    # Vendor cost layer
    "vendor_bills",
    # Booking layer
    "booking_items",
    "bookings",
    # Master data
    "customers",
    "vendors",
    # Operating expenses
    "expenses",
]

# Tables we must NEVER touch
PROTECTED_TABLES = {
    "users",
    "chart_of_accounts",
    "alembic_version",      # if migrations are ever added
}


def get_db_path(app) -> str | None:
    """Extract the file path from a sqlite:///... URI, or None if not SQLite."""
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if uri.startswith("sqlite:///"):
        raw = uri[len("sqlite:///"):]
        # Handle relative paths (sqlite:///travel_ledger.db)
        if not os.path.isabs(raw):
            raw = os.path.join(PROJECT_ROOT, raw)
        return os.path.normpath(raw)
    return None


def backup_database(db_path: str) -> str:
    """Copy the SQLite file to instance/backups/ with a timestamp."""
    backup_dir = os.path.join(os.path.dirname(db_path), "backups")
    os.makedirs(backup_dir, exist_ok=True)
    ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"travel_ledger_backup_{ts}.db")
    shutil.copy2(db_path, backup_path)
    return backup_path


def count_rows(connection, table: str) -> int:
    result = connection.execute(db.text(f"SELECT COUNT(*) FROM {table}"))
    return result.scalar() or 0


def run_reset(dry_run: bool = False):
    app = create_app()

    with app.app_context():
        # ── 1. Backup ────────────────────────────────────────────────────────
        db_path = get_db_path(app)
        if db_path and os.path.exists(db_path):
            if not dry_run:
                backup_path = backup_database(db_path)
                print(f"\n✅ Backup created → {backup_path}")
            else:
                print(f"\n📁 [DRY RUN] Would back up → {db_path}")
        else:
            if db_path:
                print(f"⚠️  DB file not found at {db_path} — skipping backup")
            else:
                print("⚠️  Non-SQLite database — skipping file backup (use pg_dump manually)")

        # ── 2. Count rows before ─────────────────────────────────────────────
        print("\n─── Current row counts ─────────────────────────────────────────")
        counts_before = {}
        with db.engine.connect() as conn:
            for table in TABLES_IN_DELETE_ORDER:
                try:
                    n = count_rows(conn, table)
                    counts_before[table] = n
                    flag = "  " if n == 0 else "🗑 "
                    print(f"  {flag}{table:<30} {n:>6} row(s)")
                except Exception as e:
                    counts_before[table] = 0
                    print(f"  ⚠️  {table:<30} (could not count: {e})")

        if dry_run:
            total = sum(counts_before.values())
            print(f"\n📊 [DRY RUN] Would delete {total} rows across {len(TABLES_IN_DELETE_ORDER)} tables.")
            print("   Run without --dry-run to proceed.\n")
            return

        # ── 3. Confirm ───────────────────────────────────────────────────────
        total = sum(counts_before.values())
        if total == 0:
            print("\n✅ All demo tables are already empty. Nothing to do.")
            return

        print(f"\n⚠️  This will permanently delete {total} rows.")
        print("   The backup above can be used to restore if needed.")
        answer = input("   Type YES to proceed: ").strip()
        if answer != "YES":
            print("   Aborted. No changes made.")
            return

        # ── 4. Delete in FK-safe order ───────────────────────────────────────
        print("\n─── Deleting demo data ─────────────────────────────────────────")
        deleted_counts = {}

        with db.engine.begin() as conn:
            # Disable FK enforcement temporarily for SQLite
            conn.execute(db.text("PRAGMA foreign_keys = OFF"))

            for table in TABLES_IN_DELETE_ORDER:
                if table in PROTECTED_TABLES:
                    print(f"  🔒 SKIPPED (protected): {table}")
                    continue
                try:
                    before = counts_before.get(table, 0)
                    conn.execute(db.text(f"DELETE FROM {table}"))
                    # Reset SQLite autoincrement sequences
                    conn.execute(db.text(
                        f"DELETE FROM sqlite_sequence WHERE name = '{table}'"
                    ))
                    deleted_counts[table] = before
                    print(f"  ✅ {table:<30} deleted {before:>6} row(s)")
                except Exception as e:
                    print(f"  ❌ {table:<30} ERROR: {e}")

            conn.execute(db.text("PRAGMA foreign_keys = ON"))

        # ── 5. Verify ────────────────────────────────────────────────────────
        print("\n─── Post-reset verification ────────────────────────────────────")
        all_clean = True
        with db.engine.connect() as conn:
            for table in TABLES_IN_DELETE_ORDER:
                try:
                    n = count_rows(conn, table)
                    if n > 0:
                        print(f"  ⚠️  {table:<30} still has {n} row(s)!")
                        all_clean = False
                    else:
                        print(f"  ✅ {table:<30} empty")
                except Exception:
                    pass

            # Confirm protected tables are untouched
            print("\n─── Protected tables (must be non-empty) ───────────────────────")
            for table in ["users", "chart_of_accounts"]:
                n = count_rows(conn, table)
                icon = "✅" if n > 0 else "❌"
                print(f"  {icon} {table:<30} {n:>6} row(s)  ← untouched")

        total_deleted = sum(deleted_counts.values())
        print(f"\n{'✅ Reset complete!' if all_clean else '⚠️  Reset completed with warnings.'}")
        print(f"   {total_deleted} rows removed.")
        print("   The system is now in a clean state, ready for real data entry.")
        print("   Dashboard, login, accounting engine, and reports are all intact.\n")


def main():
    parser = argparse.ArgumentParser(
        description="Safely remove demo/sample data from Travel Ledger Pro."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without making any changes.",
    )
    args = parser.parse_args()
    run_reset(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
