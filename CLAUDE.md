# Travel Ledger Pro — Workspace

This is the workspace for Travel Ledger Pro, a cloud-based accounting and management system for travel and tour agencies.

## Folder Structure

```
Travel Ledger Pro/
├── CLAUDE.md                          ← you are here
└── 02 Projects/
    └── Travel Ledger Pro/
        └── Travel Ledger Pro Overview.md
```

## Active Projects

### Travel Ledger Pro
**Goal:** Build a simple cloud-based accounting and management system that helps travel and tour agencies manage customers, bookings, invoices, payments, vendor costs, expenses, and financial reports in one dashboard.
**Why:** To replace manual spreadsheets and scattered records with a professional system that makes it easier to run a travel agency, track profit, manage customers, and control business finances.
**Key file:** `02 Projects/Travel Ledger Pro/Travel Ledger Pro Overview.md`
**Open problems:**
1. Designing the accounting workflow so every transaction hits the right accounts automatically
2. Keeping the UI simple for staff while maintaining real accounting accuracy behind the scenes
3. Building printable invoices/receipts and clean PDF/Excel exports
4. Handling partial payments, outstanding balances, and vendor settlements without errors
5. Making the database architecture upgradeable from SQLite to PostgreSQL
6. Preparing for future: multi-currency, multi-branch, WhatsApp invoicing, airline API
7. Balancing rapid development with long-term scalability

## Tech Stack
- Frontend: React.js + Tailwind CSS
- Backend: Node.js or Python Flask
- Database: SQLite (starter) → PostgreSQL (later)

## Workflow
Customer → Booking → Invoice → Payment → Vendor Cost → Profit Calculation → Reports
