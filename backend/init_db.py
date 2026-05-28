"""
init_db.py — Database initialization script.

Run this ONCE to:
  1. Create all database tables
  2. Seed the chart of accounts
  3. Create the default admin user
  4. Optionally load sample data

Usage:
    python init_db.py              # creates tables + chart of accounts + admin user
    python init_db.py --sample     # also loads sample customers, vendors, bookings
    python init_db.py --reset      # drops all tables first (WARNING: destroys all data!)
"""

import sys
from app import create_app
from app.extensions import db
from app.models import *      # imports all models so SQLAlchemy knows about them


def create_chart_of_accounts():
    """Seed the default chart of accounts for a travel agency."""
    print("  Seeding chart of accounts...")

    accounts = [
        # code,   name,                              type,        description
        # ASSETS
        ("1000", "Cash on Hand",                    "asset",     "Physical cash in the office"),
        ("1010", "Bank Account — Main",              "asset",     "Primary business bank account"),
        ("1020", "Bank Account — USD",               "asset",     "USD foreign currency account"),
        ("1100", "Accounts Receivable",              "asset",     "Money owed by customers"),
        # LIABILITIES
        ("2000", "Accounts Payable — Vendors",       "liability", "Money owed to suppliers"),
        ("2100", "Tax Payable",                      "liability", "VAT or tax owed to government"),
        # EQUITY
        ("3000", "Owner's Equity",                   "equity",    "Owner's investment in the business"),
        ("3100", "Retained Earnings",                "equity",    "Accumulated profits"),
        # REVENUE
        ("4000", "Sales Revenue — Travel Services",  "revenue",   "Income from bookings"),
        ("4100", "Commission Income",                "revenue",   "Commission from partners"),
        # COST OF SALES
        ("5000", "Cost of Sales — Airline Tickets",  "expense",   "Airline ticket costs"),
        ("5010", "Cost of Sales — Hotel",            "expense",   "Hotel accommodation costs"),
        ("5020", "Cost of Sales — Visa Services",    "expense",   "Visa processing costs"),
        ("5030", "Cost of Sales — Tour Packages",    "expense",   "Tour operator costs"),
        ("5040", "Cost of Sales — Insurance",        "expense",   "Travel insurance costs"),
        # OPERATING EXPENSES
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
            continue   # skip if already exists
        acct = ChartOfAccount(
            account_code = code,
            account_name = name,
            account_type = acct_type,
            description  = desc,
            is_active    = True,
        )
        db.session.add(acct)
        db.session.flush()
        if code == "6000":
            parent_6000_id = acct.id

    # Set 6100-6900 as children of 6000
    if parent_6000_id:
        db.session.flush()
        sub_expense_codes = ["6100", "6200", "6300", "6400", "6500", "6900"]
        for code in sub_expense_codes:
            acct = ChartOfAccount.query.filter_by(account_code=code).first()
            if acct and acct.parent_id is None:
                acct.parent_id = parent_6000_id

    db.session.commit()
    print(f"  ✓ {len(accounts)} accounts seeded.")


def create_admin_user():
    """Create the default admin user."""
    print("  Creating admin user...")

    if User.query.filter_by(email="admin@travelledgerpro.com").first():
        print("  ✓ Admin user already exists. Skipping.")
        return

    admin = User(
        name      = "Admin",
        email     = "admin@travelledgerpro.com",
        role      = "admin",
        is_active = True,
    )
    admin.set_password("Admin@1234")   # CHANGE THIS IN PRODUCTION!
    db.session.add(admin)

    # Also create a sample staff user
    staff = User(
        name      = "Sarah Kamau",
        email     = "sarah@travelledgerpro.com",
        role      = "staff",
        is_active = True,
    )
    staff.set_password("Staff@1234")   # CHANGE THIS IN PRODUCTION!
    db.session.add(staff)

    db.session.commit()
    print("  ✓ Admin user created: admin@travelledgerpro.com / Admin@1234")
    print("  ✓ Staff user created: sarah@travelledgerpro.com / Staff@1234")
    print("  ⚠️  Change these passwords immediately after first login!")


def load_sample_data():
    """Load sample customers, vendors, and one booking for demonstration."""
    print("  Loading sample data...")

    # Sample vendors
    vendors_data = [
        ("Emirates Airlines",    "airline",   "Reservations Desk", "+971-4-708-1111"),
        ("Kenya Airways",        "airline",   "Trade Desk",        "+254-20-327-4747"),
        ("Hilton Dubai Creek",   "hotel",     "Ayesha Mohamed",    "+971-4-227-1111"),
        ("Dubai Visa Center",    "visa",      "Processing Desk",   "+971-4-xxx-xxxx"),
        ("Africa Safaris Ltd",   "tour",      "James Mwangi",      "+254-722-100-200"),
        ("AXA Travel Insurance", "insurance", "Corporate Desk",    "+44-20-7003-2345"),
    ]
    vendor_objects = []
    for name, vtype, contact, phone in vendors_data:
        if not Vendor.query.filter_by(name=name).first():
            v = Vendor(name=name, type=vtype, contact_name=contact, phone=phone)
            db.session.add(v)
            vendor_objects.append(v)
    db.session.flush()

    # Sample customers
    customers_data = [
        ("Ahmed Al-Rashid",  "ahmed@email.com",  "+971-50-111-2222", "A12345678", "UAE"),
        ("Mary Wanjiku",     "mary@email.com",   "+254-722-333-444", "KE8765432", "Kenyan"),
        ("John Osei Bonsu",  "john@email.com",   "+233-24-555-6666", "GH4561237", "Ghanaian"),
    ]
    for name, email, phone, passport, nationality in customers_data:
        if not Customer.query.filter_by(email=email).first():
            c = Customer(name=name, email=email, phone=phone,
                         passport_number=passport, nationality=nationality)
            db.session.add(c)

    db.session.commit()
    print("  ✓ Sample vendors and customers created.")
    print("  Tip: Use the API to create bookings and invoices from here.")


def init_db(load_samples: bool = False, reset: bool = False):
    app = create_app()
    with app.app_context():
        if reset:
            print("⚠️  Dropping all tables...")
            db.drop_all()
            print("  ✓ Tables dropped.")

        print("Creating database tables...")
        db.create_all()
        print("  ✓ Tables created.")

        print("Seeding reference data...")
        create_chart_of_accounts()
        create_admin_user()

        if load_samples:
            print("Loading sample data...")
            load_sample_data()

        print("\n✅  Database initialized successfully!")
        print(f"   Database: {app.config['SQLALCHEMY_DATABASE_URI']}")


if __name__ == "__main__":
    load_samples = "--sample" in sys.argv
    reset        = "--reset"  in sys.argv

    if reset:
        confirm = input("⚠️  This will DELETE ALL DATA. Type 'yes' to confirm: ")
        if confirm.lower() != "yes":
            print("Aborted.")
            sys.exit(0)

    init_db(load_samples=load_samples, reset=reset)
