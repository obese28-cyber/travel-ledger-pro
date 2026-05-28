"""
routes/admin.py — Admin-only system management endpoints.

POST /api/admin/reset   -> wipe all demo/transactional data (admin only)
GET  /api/admin/reset   -> dry-run: return row counts without deleting

SECURITY
--------
Both endpoints require a valid JWT AND the calling user must have role="admin".
A non-admin staff token will receive HTTP 403.

WHAT IS DELETED (in FK-safe order)
-----------------------------------
  audit_trail, vendor_payments, journal_entry_lines, journal_entries,
  trial_balance_entries, payments, invoice_items, invoices, vendor_bills,
  booking_items, bookings, customers, vendors, expenses

WHAT IS KEPT
------------
  users, chart_of_accounts — and the entire schema structure.
"""

import os
import shutil
from datetime import datetime

from flask                import Blueprint, request
from flask_jwt_extended   import jwt_required, get_jwt_identity
from sqlalchemy           import text

from ..extensions         import db
from ..models.user        import User
from ..utils.responses    import success, error, forbidden

admin_bp = Blueprint("admin", __name__)

# ── Ordered list of tables to clear ─────────────────────────────────────────
TABLES_TO_CLEAR = [
    "audit_trail",
    "vendor_payments",
    "journal_entry_lines",
    "journal_entries",
    "trial_balance_entries",
    "payments",
    "invoice_items",
    "invoices",
    "vendor_bills",
    "booking_items",
    "bookings",
    "customers",
    "vendors",
    "expenses",
]

PROTECTED_TABLES = {"users", "chart_of_accounts"}


def _require_admin():
    """Return the User object if caller is admin, else raise."""
    user_id = int(get_jwt_identity())
    user    = User.query.get(user_id)
    if not user or user.role != "admin":
        return None, forbidden("Admin access required.")
    return user, None


def _count_rows() -> dict:
    """Return {table_name: row_count} for every table we manage."""
    counts = {}
    with db.engine.connect() as conn:
        for table in TABLES_TO_CLEAR:
            try:
                n = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
                counts[table] = n
            except Exception:
                counts[table] = 0
    return counts


def _backup_db(app) -> str | None:
    """
    Copy the SQLite file to instance/backups/ with a timestamp.
    Returns the backup path, or None if the DB is not a local SQLite file.
    """
    uri = app.config.get("SQLALCHEMY_DATABASE_URI", "")
    if not uri.startswith("sqlite:///"):
        return None

    raw = uri[len("sqlite:///"):]
    if not os.path.isabs(raw):
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        raw = os.path.join(backend_dir, raw)
    db_path = os.path.normpath(raw)

    if not os.path.exists(db_path):
        return None

    backup_dir = os.path.join(os.path.dirname(db_path), "backups")
    os.makedirs(backup_dir, exist_ok=True)
    ts          = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"travel_ledger_backup_{ts}.db")
    shutil.copy2(db_path, backup_path)
    return backup_path


# ── GET /api/admin/reset  →  dry-run: counts only ───────────────────────────

@admin_bp.get("/reset", strict_slashes=False)
@jwt_required()
def reset_preview():
    """
    Return row counts for every table that would be cleared.
    Safe read-only — nothing is deleted.
    """
    user, err_resp = _require_admin()
    if err_resp:
        return err_resp

    counts = _count_rows()
    total  = sum(counts.values())

    rows = [{"table": t, "rows": counts[t]} for t in TABLES_TO_CLEAR]
    return success({
        "mode":          "dry_run",
        "total_rows":    total,
        "tables":        rows,
        "message":       (
            f"POST to this endpoint to permanently delete {total} demo rows. "
            "A backup will be created automatically."
        ),
    })


# ── POST /api/admin/reset  →  perform the wipe ──────────────────────────────

@admin_bp.post("/reset", strict_slashes=False)
@jwt_required()
def reset_demo_data():
    """
    Wipe all transactional / demo data.

    Steps:
      1. Verify caller is admin
      2. Backup the SQLite file
      3. DELETE every managed table in FK-safe order (FK checks disabled)
      4. Reset SQLite autoincrement sequences
      5. Re-enable FK checks
      6. Return a summary of what was deleted
    """
    from flask import current_app

    user, err_resp = _require_admin()
    if err_resp:
        return err_resp

    # Optional confirmation header to prevent accidental calls
    confirm = request.headers.get("X-Confirm-Reset", "")
    if confirm.upper() != "YES":
        return error(
            "Add header  X-Confirm-Reset: YES  to confirm this destructive operation.",
            400,
        )

    # ── Snapshot counts before deletion ──────────────────────────────────
    counts_before = _count_rows()
    total_before  = sum(counts_before.values())

    # ── Backup ────────────────────────────────────────────────────────────
    backup_path = _backup_db(current_app)

    # ── Delete in FK-safe order ───────────────────────────────────────────
    deleted  = {}
    errors   = {}

    try:
        with db.engine.begin() as conn:
            conn.execute(text("PRAGMA foreign_keys = OFF"))

            for table in TABLES_TO_CLEAR:
                if table in PROTECTED_TABLES:
                    continue
                try:
                    conn.execute(text(f"DELETE FROM {table}"))
                    # Reset autoincrement so new IDs start from 1
                    conn.execute(text(
                        f"DELETE FROM sqlite_sequence WHERE name = :t"
                    ), {"t": table})
                    deleted[table] = counts_before.get(table, 0)
                except Exception as e:
                    errors[table] = str(e)

            conn.execute(text("PRAGMA foreign_keys = ON"))

    except Exception as e:
        return error(f"Reset failed during transaction: {str(e)}", 500)

    # ── Verify protected tables still have data ───────────────────────────
    with db.engine.connect() as conn:
        users_count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0
        coa_count   = conn.execute(text("SELECT COUNT(*) FROM chart_of_accounts")).scalar() or 0

    total_deleted = sum(deleted.values())

    return success({
        "status":           "complete",
        "total_deleted":    total_deleted,
        "backup":           backup_path or "not_applicable_(non-sqlite)",
        "deleted_by_table": [
            {"table": t, "rows_deleted": deleted.get(t, 0)}
            for t in TABLES_TO_CLEAR
        ],
        "errors":           errors,
        "protected_tables": {
            "users":              users_count,
            "chart_of_accounts":  coa_count,
        },
        "message": (
            f"Reset complete. {total_deleted} demo rows removed. "
            f"Users ({users_count}) and Chart of Accounts ({coa_count} accounts) are intact."
        ),
    })


# ── GET /api/admin/agency-profile  →  return current profile ─────────────────

@admin_bp.get("/agency-profile", strict_slashes=False)
@jwt_required()
def get_agency_profile():
    """Return the current agency profile (readable by any authenticated user)."""
    from flask import current_app
    profile = current_app.config.get("AGENCY_PROFILE", {})
    return success({"profile": profile})


# ── PUT /api/admin/agency-profile  →  save & reload profile ──────────────────

@admin_bp.put("/agency-profile", strict_slashes=False)
@jwt_required()
def save_agency_profile():
    """
    Overwrite agency_profile.py with the submitted values, then reload into
    Flask config so the next PDF generation picks them up immediately.
    Admin only.
    """
    import pathlib, json
    from flask import current_app

    user, err_resp = _require_admin()
    if err_resp:
        return err_resp

    data = request.get_json(force=True, silent=True) or {}
    p = data.get("profile", data)  # accept {profile: {...}} or flat dict

    name           = str(p.get("name", "")).strip()
    address_lines  = [str(x).strip() for x in p.get("address_lines", []) if str(x).strip()]
    phones         = [str(x).strip() for x in p.get("phones", [])         if str(x).strip()]
    emails         = [str(x).strip() for x in p.get("emails", [])         if str(x).strip()]
    logo_path      = p.get("logo_path") or None
    bank_accounts  = p.get("bank_accounts", [])
    signatory_left  = p.get("signatory_left",  {})
    signatory_right = p.get("signatory_right", {})
    services        = [str(x).strip() for x in p.get("services", []) if str(x).strip()]

    def _py_str(v):
        return json.dumps(v, ensure_ascii=False)

    def _py_list(lst):
        lines = ",\n    ".join(_py_str(x) for x in lst)
        return f"[\n    {lines},\n]" if lst else "[]"

    def _py_dict(d):
        items = ",\n    ".join(f'"{k}": {_py_str(v)}' for k, v in d.items())
        return "{\n    " + items + ",\n}" if d else "{}"

    def _py_banks(banks):
        parts = []
        for b in banks:
            parts.append(
                '    {\n'
                f'        "bank":    {_py_str(b.get("bank",""))},\n'
                f'        "account": {_py_str(b.get("account",""))},\n'
                f'        "label":   {_py_str(b.get("label",""))},\n'
                '    }'
            )
        return "[\n" + ",\n".join(parts) + "\n]" if parts else "[]"

    content = f'''"""
AGENCY PROFILE -- auto-generated by Travel Ledger Pro Admin Settings.
Edit via Admin > Settings in the application, or edit this file directly.
Restart the backend after direct file edits for changes to take effect.
"""

AGENCY_NAME = {_py_str(name)}

AGENCY_ADDRESS_LINES = {_py_list(address_lines)}

AGENCY_PHONES = {_py_list(phones)}

AGENCY_EMAILS = {_py_list(emails)}

LOGO_PATH = {repr(logo_path)}

BANK_ACCOUNTS = {_py_banks(bank_accounts)}

SIGNATORY_LEFT = {_py_dict(signatory_left)}

SIGNATORY_RIGHT = {_py_dict(signatory_right)}

SERVICES = {_py_list(services)}


# =============================================================================
#  DO NOT EDIT BELOW THIS LINE
# =============================================================================

AGENCY_PROFILE = {{
    "name":            AGENCY_NAME,
    "address_lines":   AGENCY_ADDRESS_LINES,
    "phones":          AGENCY_PHONES,
    "emails":          AGENCY_EMAILS,
    "logo_path":       LOGO_PATH,
    "bank_accounts":   BANK_ACCOUNTS,
    "signatory_left":  SIGNATORY_LEFT,
    "signatory_right": SIGNATORY_RIGHT,
    "services":        SERVICES,
}}
'''

    profile_path = pathlib.Path(__file__).parent.parent.parent / "agency_profile.py"
    profile_path.write_text(content, encoding="utf-8")

    # Hot-reload into Flask config
    new_profile = {
        "name":            name,
        "address_lines":   address_lines,
        "phones":          phones,
        "emails":          emails,
        "logo_path":       logo_path,
        "bank_accounts":   bank_accounts,
        "signatory_left":  signatory_left,
        "signatory_right": signatory_right,
        "services":        services,
    }
    current_app.config["AGENCY_PROFILE"] = new_profile

    return success({
        "message": "Agency profile saved and reloaded.",
        "profile": new_profile,
    })


# ── POST /api/admin/upload-logo  →  save logo file, return its path ──────────

@admin_bp.post("/upload-logo", strict_slashes=False)
@jwt_required()
def upload_logo():
    """
    Accept a PNG/JPG upload, save it to backend/static/logo.<ext>,
    and return the absolute file path so agency_profile.py can store it.
    Admin only.
    """
    import pathlib
    from flask import current_app
    from werkzeug.utils import secure_filename

    user, err_resp = _require_admin()
    if err_resp:
        return err_resp

    if "logo" not in request.files:
        return error("No file attached. Send the image as form-data field 'logo'.", 400)

    file = request.files["logo"]
    if not file or file.filename == "":
        return error("Empty filename.", 400)

    ext = pathlib.Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        return error("Only PNG, JPG, GIF, or WEBP files are accepted.", 400)

    # Save to backend/static/  (create folder if needed)
    backend_dir  = pathlib.Path(__file__).parent.parent.parent   # …/backend/
    static_dir   = backend_dir / "static"
    static_dir.mkdir(exist_ok=True)

    dest = static_dir / f"logo{ext}"
    file.save(str(dest))

    abs_path = str(dest.resolve())
    print(f"[admin] Logo saved to {abs_path}")

    return success({
        "message":   "Logo uploaded successfully.",
        "logo_path": abs_path,
    })


# ── GET /api/admin/logo-preview  →  serve the uploaded logo image ─────────────

@admin_bp.get("/logo-preview", strict_slashes=False)
def logo_preview():
    """
    Serve the agency logo file for preview in the Settings page.
    No auth required (it's just an image, not sensitive data).
    """
    import pathlib
    from flask import send_file, current_app

    # First check agency profile for a custom path
    profile   = current_app.config.get("AGENCY_PROFILE", {})
    logo_path = profile.get("logo_path")

    if logo_path and pathlib.Path(logo_path).exists():
        return send_file(logo_path, mimetype="image/png")

    # Fall back: look for logo.* in backend/static/
    backend_dir = pathlib.Path(__file__).parent.parent.parent
    static_dir  = backend_dir / "static"
    for ext in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        candidate = static_dir / f"logo{ext}"
        if candidate.exists():
            return send_file(str(candidate))

    return error("No logo file found.", 404)
