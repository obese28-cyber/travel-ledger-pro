# Travel Ledger Pro — Database Schema & Accounting Workflow

**Date:** 2026-05-11  
**Version:** MVP v1.0  
**Database:** SQLite (upgradeable to PostgreSQL)

---

## Overview

The database is built around one central workflow:

```
Customer → Booking → Invoice → Payment → Vendor Cost → Profit Calculation → Reports
```

Every financial event (issuing an invoice, receiving a payment, recording a vendor cost) creates a **journal entry** — a pair of debit and credit lines that keep the books balanced. This is standard double-entry bookkeeping, which means you always know exactly where every dollar came from and where it went.

---

## Table Map (15 Tables)

```
users
  └── creates → customers, bookings, invoices, payments, expenses, vendor_bills, vendor_payments

customers
  └── has many → bookings
                  └── has many → booking_items (each service: flight, hotel, visa...)
                                   └── linked to → vendors
                  └── has many → invoices
                                   └── has many → invoice_items
                                   └── has many → payments

vendors
  └── has many → vendor_bills
                  └── has many → vendor_payments

chart_of_accounts
  └── referenced by → journal_entry_lines, expenses

journal_entries
  └── has many → journal_entry_lines (always balanced: total debits = total credits)

expenses
  └── references → chart_of_accounts

audit_trail
  └── logs all changes by users
```

---

## Table Definitions

### 1. users

Stores login credentials and role-based access.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Full name |
| email | TEXT UNIQUE | Login username |
| password_hash | TEXT | bcrypt hash, never plain text |
| role | TEXT | `admin` or `staff` |
| is_active | INTEGER | 1 = active, 0 = disabled |
| created_at | TEXT | ISO 8601 datetime |
| updated_at | TEXT | ISO 8601 datetime |

**Admin** can do everything. **Staff** can create/edit bookings and invoices but cannot delete records, manage users, or view the full accounting module.

---

### 2. customers

The people who buy travel services.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Full name |
| email | TEXT | Contact email |
| phone | TEXT | Phone number |
| passport_number | TEXT | For visa/flight bookings |
| nationality | TEXT | Country of citizenship |
| notes | TEXT | Any extra info |
| created_by | INTEGER FK → users | Who added this customer |
| created_at | TEXT | |
| updated_at | TEXT | |

**Connects to:** bookings (one customer → many bookings)

---

### 3. vendors

The suppliers you buy services from (airlines, hotels, tour operators).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | Vendor/supplier name |
| type | TEXT | `airline`, `hotel`, `tour`, `visa`, `insurance`, `other` |
| contact_name | TEXT | Person to call |
| phone | TEXT | |
| email | TEXT | |
| notes | TEXT | |
| created_at | TEXT | |
| updated_at | TEXT | |

**Connects to:** booking_items (which vendor provides this service), vendor_bills (what you owe them)

---

### 4. bookings

A booking is the master record for a customer's trip. One booking can include multiple services (flights, hotel, visa, etc.).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| booking_reference | TEXT UNIQUE | e.g. `BK-2026-001` |
| customer_id | INTEGER FK → customers | Who is travelling |
| destination | TEXT | e.g. "Dubai, UAE" |
| travel_date | TEXT | Departure date |
| return_date | TEXT | Return date (nullable) |
| status | TEXT | `pending`, `confirmed`, `cancelled`, `completed` |
| notes | TEXT | |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |
| updated_at | TEXT | |

**Connects to:** booking_items, invoices, vendor_bills

---

### 5. booking_items

Each individual service within a booking. A trip to Dubai might have a flight item, a hotel item, and a visa item — each with its own selling price and vendor cost.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| booking_id | INTEGER FK → bookings | Parent booking |
| service_type | TEXT | `flight`, `hotel`, `visa`, `tour_package`, `insurance`, `other` |
| vendor_id | INTEGER FK → vendors | Which vendor supplies this |
| description | TEXT | e.g. "Emirates EK 384 — Dubai" |
| selling_price | REAL | What you charge the customer |
| vendor_cost | REAL | What you pay the vendor |
| profit_margin | REAL (computed) | `selling_price - vendor_cost` |
| created_at | TEXT | |

**This is where gross profit lives.** Every booking item carries its own margin. The sum of all margins across a booking = the booking's total gross profit.

---

### 6. invoices

An invoice is the formal billing document sent to the customer. It is generated from a booking.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| invoice_number | TEXT UNIQUE | e.g. `INV-2026-001` |
| booking_id | INTEGER FK → bookings | Which booking this bills for |
| customer_id | INTEGER FK → customers | Denormalized for fast lookup |
| issue_date | TEXT | When invoice was created |
| due_date | TEXT | Payment deadline |
| subtotal | REAL | Sum of line items before tax |
| tax_amount | REAL | Tax (0 if not applicable) |
| total_amount | REAL | Amount customer owes |
| amount_paid | REAL | Running total of payments received |
| balance_due | REAL (computed) | `total_amount - amount_paid` |
| status | TEXT | `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `cancelled` |
| notes | TEXT | |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### 7. invoice_items

The line items that appear on a printed invoice.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| invoice_id | INTEGER FK → invoices | Parent invoice |
| booking_item_id | INTEGER FK → booking_items | Which service this line covers |
| description | TEXT | Printed description on invoice |
| quantity | REAL | Usually 1 |
| unit_price | REAL | Per-unit selling price |
| total_price | REAL | `quantity × unit_price` |
| created_at | TEXT | |

---

### 8. payments

Records every payment received from a customer. Supports partial payments.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| payment_reference | TEXT UNIQUE | e.g. `PAY-2026-001` |
| invoice_id | INTEGER FK → invoices | Which invoice this pays toward |
| customer_id | INTEGER FK → customers | Denormalized for fast lookup |
| amount | REAL | Amount received in this payment |
| payment_date | TEXT | Date money was received |
| payment_method | TEXT | `cash`, `bank_transfer`, `credit_card`, `mobile_money` |
| notes | TEXT | e.g. "Bank ref: TXN9823" |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |

**Each payment record triggers an update** to `invoices.amount_paid` and creates a journal entry.

---

### 9. vendor_bills

What your agency owes to vendors for services provided in bookings.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| bill_reference | TEXT UNIQUE | e.g. `VB-2026-001` |
| vendor_id | INTEGER FK → vendors | Which vendor |
| booking_id | INTEGER FK → bookings | Which booking this cost belongs to |
| booking_item_id | INTEGER FK → booking_items | Specific service |
| description | TEXT | |
| amount | REAL | Total amount owed |
| bill_date | TEXT | When the bill was recorded |
| due_date | TEXT | When vendor expects payment |
| amount_paid | REAL | Running total paid so far |
| balance_due | REAL (computed) | `amount - amount_paid` |
| status | TEXT | `unpaid`, `partially_paid`, `paid` |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |
| updated_at | TEXT | |

---

### 10. vendor_payments

Records every payment sent to a vendor.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| payment_reference | TEXT UNIQUE | e.g. `VP-2026-001` |
| vendor_bill_id | INTEGER FK → vendor_bills | Which bill this pays |
| vendor_id | INTEGER FK → vendors | Denormalized |
| amount | REAL | Amount sent |
| payment_date | TEXT | |
| payment_method | TEXT | `cash`, `bank_transfer`, `credit_card`, `mobile_money` |
| notes | TEXT | |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |

---

### 11. expenses

General agency operating costs (not related to specific bookings).

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| expense_reference | TEXT UNIQUE | e.g. `EXP-2026-001` |
| category | TEXT | `staff_salary`, `office_rent`, `fuel`, `marketing`, `utilities`, `miscellaneous` |
| account_id | INTEGER FK → chart_of_accounts | Which expense account |
| description | TEXT | e.g. "May office rent" |
| amount | REAL | |
| expense_date | TEXT | |
| payment_method | TEXT | `cash`, `bank_transfer`, etc. |
| receipt_number | TEXT | Physical receipt reference |
| notes | TEXT | |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |

---

### 12. chart_of_accounts

The master list of all financial accounts. Every debit and credit line references this table.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| account_code | TEXT UNIQUE | e.g. `1100` |
| account_name | TEXT | e.g. `Accounts Receivable` |
| account_type | TEXT | `asset`, `liability`, `equity`, `revenue`, `expense` |
| parent_id | INTEGER FK → self | For sub-accounts (e.g. 6000 → 6100) |
| is_active | INTEGER | 1 = active |
| description | TEXT | |
| created_at | TEXT | |

**Default chart of accounts for a travel agency:**

```
ASSETS (1xxx)
  1000  Cash on Hand
  1010  Bank Account — Main
  1020  Bank Account — USD (future: multi-currency)
  1100  Accounts Receivable — Customers

LIABILITIES (2xxx)
  2000  Accounts Payable — Vendors
  2100  Tax Payable

EQUITY (3xxx)
  3000  Owner's Equity
  3100  Retained Earnings

REVENUE (4xxx)
  4000  Sales Revenue — Travel Services
  4100  Commission Income (future)

COST OF SALES (5xxx)
  5000  Cost of Sales — Airline Tickets
  5010  Cost of Sales — Hotel Reservations
  5020  Cost of Sales — Visa Services
  5030  Cost of Sales — Tour Packages
  5040  Cost of Sales — Insurance

OPERATING EXPENSES (6xxx)
  6100  Staff Salaries
  6200  Office Rent
  6300  Fuel & Transport
  6400  Marketing & Advertising
  6500  Utilities
  6900  Miscellaneous Expenses
```

---

### 13. journal_entries

The header record for each accounting event. Every financial action (invoice, payment, expense) creates exactly one journal entry.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| entry_reference | TEXT UNIQUE | e.g. `JE-2026-001` |
| entry_date | TEXT | Date of the event |
| description | TEXT | Human-readable summary |
| source_type | TEXT | `invoice`, `payment`, `vendor_bill`, `vendor_payment`, `expense`, `manual` |
| source_id | INTEGER | The ID in the source table (e.g. invoice ID 5) |
| created_by | INTEGER FK → users | |
| created_at | TEXT | |

---

### 14. journal_entry_lines

The actual debit and credit lines. Every journal entry must have total debits = total credits.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| journal_entry_id | INTEGER FK → journal_entries | Parent entry |
| account_id | INTEGER FK → chart_of_accounts | Which account |
| debit | REAL | Debit amount (0 if credit line) |
| credit | REAL | Credit amount (0 if debit line) |
| description | TEXT | Line-level note |
| created_at | TEXT | |

**Rule:** For every journal entry, `SUM(debit) = SUM(credit)`. The backend must enforce this before saving.

---

### 15. audit_trail

An immutable log of every significant action in the system.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users | Who did it |
| action | TEXT | `CREATE`, `UPDATE`, `DELETE` |
| table_name | TEXT | Which table was affected |
| record_id | INTEGER | Which row |
| old_values | TEXT | JSON of old state (for UPDATE/DELETE) |
| new_values | TEXT | JSON of new state (for CREATE/UPDATE) |
| ip_address | TEXT | Client IP |
| created_at | TEXT | |

---

## Accounting Entries: The 6 Core Scenarios

### Background: How Double-Entry Works

Every financial event has two sides:

- A **debit** increases assets or expenses; decreases liabilities, equity, or revenue.
- A **credit** increases liabilities, equity, or revenue; decreases assets or expenses.

The golden rule: **every debit must have an equal credit.**

---

### Scenario 1: A Booking Is Created

**No journal entry is created at this stage.**

A booking is just a record of a customer's intent. No money has changed hands, no invoice has been issued. The booking exists in the `bookings` and `booking_items` tables only.

The booking_items record the *expected* selling price and vendor cost — but these don't hit the accounts until an invoice is issued and a vendor bill is recorded.

---

### Scenario 2: An Invoice Is Issued

**Situation:** Customer books a Dubai trip. Total selling price: **$2,000**.

When you click "Issue Invoice," the system creates a journal entry:

```
Journal Entry: JE-2026-001
Date: 2026-05-11
Description: Invoice INV-2026-001 issued to Ahmed Al-Rashid — Dubai Trip

  DEBIT   1100  Accounts Receivable — Customers    $2,000
  CREDIT  4000  Sales Revenue — Travel Services    $2,000
```

**What this means:**
- The customer now **owes** your agency $2,000 (Accounts Receivable goes up)
- Your agency has **earned** $2,000 in revenue (Sales Revenue goes up)
- The invoice balance_due = $2,000

---

### Scenario 3: Customer Makes a Partial Payment

**Situation:** Ahmed pays **$800** by bank transfer, with $1,200 still outstanding.

```
Journal Entry: JE-2026-002
Date: 2026-05-15
Description: Payment PAY-2026-001 received from Ahmed Al-Rashid — $800 partial

  DEBIT   1010  Bank Account — Main               $800
  CREDIT  1100  Accounts Receivable — Customers   $800
```

**What this means:**
- Your bank balance goes up by $800 (Bank Account goes up)
- The amount Ahmed owes goes down by $800 (Accounts Receivable goes down)
- Invoice balance_due = $2,000 - $800 = **$1,200 remaining**

The system also updates:
- `invoices.amount_paid` += $800
- `invoices.status` → `partially_paid`

When Ahmed pays the remaining $1,200 later, another identical-style entry is created, and `invoices.status` → `paid`.

---

### Scenario 4: Vendor Cost Is Recorded

**Situation:** Emirates airline charges your agency **$1,400** for Ahmed's flight (your cost, not the selling price).

```
Journal Entry: JE-2026-003
Date: 2026-05-11
Description: Vendor bill VB-2026-001 — Emirates Airlines — Ahmed Dubai Trip

  DEBIT   5000  Cost of Sales — Airline Tickets   $1,400
  CREDIT  2000  Accounts Payable — Vendors        $1,400
```

**What this means:**
- Your cost of doing business goes up by $1,400 (COGS goes up)
- You now **owe** Emirates $1,400 (Accounts Payable goes up)
- vendor_bills.balance_due = $1,400

---

### Scenario 5: Vendor Is Paid

**Situation:** You pay Emirates **$1,400** by bank transfer.

```
Journal Entry: JE-2026-004
Date: 2026-05-20
Description: Vendor payment VP-2026-001 — Emirates Airlines — $1,400 full settlement

  DEBIT   2000  Accounts Payable — Vendors        $1,400
  CREDIT  1010  Bank Account — Main               $1,400
```

**What this means:**
- The liability to Emirates is cleared (Accounts Payable goes down)
- Your bank balance goes down by $1,400 (Bank Account goes down)
- vendor_bills.status → `paid`

---

### Scenario 6: Profit Is Calculated

**No journal entry is created.** Profit is computed — not recorded.

The system queries the accounts and calculates:

```
Gross Profit (per booking):
  Selling Price (all booking items)     $2,000
  Less: Vendor Cost (all vendor bills)  $1,400
  ─────────────────────────────────────────────
  Gross Profit                            $600   (30% margin)

Net Profit (agency-wide for the period):
  Total Sales Revenue (account 4000)    $X,XXX
  Less: Total Cost of Sales (5xxx)     ($X,XXX)
  ─────────────────────────────────────────────
  Gross Profit                          $X,XXX
  Less: Operating Expenses (6xxx)      ($X,XXX)
    Staff Salaries        $X,XXX
    Office Rent           $X,XXX
    Fuel & Transport      $X,XXX
    Marketing             $X,XXX
    Utilities             $X,XXX
  ─────────────────────────────────────────────
  Net Profit / (Loss)                   $X,XXX
```

This feeds directly into the **Profit & Loss Report** in the Reports module.

---

## Full Workflow Summary (Ahmed's Dubai Booking)

| Event | Journal Entry | Accounts Affected |
|---|---|---|
| Booking created | None | bookings, booking_items |
| Invoice issued ($2,000) | JE-001 | DR Receivable / CR Revenue |
| Customer pays $800 | JE-002 | DR Bank / CR Receivable |
| Vendor bill recorded ($1,400) | JE-003 | DR COGS / CR Payable |
| Vendor paid ($1,400) | JE-004 | DR Payable / CR Bank |
| Customer pays $1,200 | JE-005 | DR Bank / CR Receivable |
| Profit calculated | (query) | Revenue - COGS - Expenses |

**Ending balances after all events:**
- Bank: +$800 +$1,200 -$1,400 = **+$600** (net cash in)
- Accounts Receivable: $0 (fully paid)
- Accounts Payable: $0 (vendor settled)
- Revenue: $2,000
- COGS: $1,400
- **Gross Profit: $600** ✓

---

## PostgreSQL Upgrade Path

The schema is designed to migrate cleanly. The main changes when upgrading:

| SQLite | PostgreSQL equivalent |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` or `BIGSERIAL` |
| `TEXT` (dates stored as strings) | `TIMESTAMP WITH TIME ZONE` |
| `REAL` (floating point) | `NUMERIC(15,2)` (exact decimal — important for money!) |
| `INTEGER` (0/1 booleans) | `BOOLEAN` |
| Generated columns (computed) | Same syntax supported in PG 12+ |
| No native JSON type | `JSONB` for audit_trail columns |

**Important:** When handling money in PostgreSQL, always use `NUMERIC(15,2)` instead of `FLOAT` or `REAL` to avoid floating-point rounding errors. For the SQLite MVP, be aware of this limitation and consider multiplying all amounts by 100 and storing as integers if precision becomes an issue.

---

## Next Steps

With this schema designed, the next steps in order are:

1. **Create schema.sql** — the actual CREATE TABLE statements
2. **Seed the database** — chart of accounts + sample data
3. **Build the backend API** — routes for each table
4. **Build the frontend** — dashboard, forms, reports
5. **Add invoice PDF generation**
6. **Add Excel/PDF report export**
