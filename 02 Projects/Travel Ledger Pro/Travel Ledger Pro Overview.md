---
type: problems
date: 2026-05-11
project: Travel Ledger Pro
---

## Goal
Build a simple cloud-based accounting and management system that helps travel and tour agencies manage customers, bookings, invoices, payments, vendor costs, expenses, and financial reports in one dashboard.

## Why
To replace manual spreadsheets and scattered records with a professional system that makes it easier to run a travel agency, track profit, manage customers, and control business finances.

## Tangible Outcomes
- Working login system with admin and staff access
- Dashboard showing sales, expenses, profit, and outstanding balances
- Customer management with booking history
- Booking management for flights, hotels, visas, tours, and insurance
- Invoices, receipts, and PDF/Excel export
- Payment tracking (partial, full, outstanding balances)
- Vendor management and vendor cost tracking
- Accounting records (income, expenses, cash, bank, payables, receivables)
- Financial reports: P&L, daily sales, monthly revenue, expense, cash flow
- Backup and restore functionality
- Clean, responsive design (desktop and mobile)

Successful workflow: Customer → Booking → Invoice → Payment → Vendor Cost → Profit Calculation → Reports

## Open Problems
1. Designing the accounting workflow correctly so every transaction automatically affects the right accounts (sales, receivables, vendor payables, cash, expenses, profit).
2. Making the system simple for non-accounting staff while still keeping professional accounting accuracy.
3. Building invoice, receipt, and reporting modules that are printable and export cleanly to PDF and Excel.
4. Managing partial payments, outstanding balances, and vendor settlements without creating accounting errors.
5. Keeping the UI modern and easy to navigate on both desktop and mobile devices.
6. Structuring the database so the system can later upgrade from SQLite to PostgreSQL without major changes.
7. Preparing the architecture for future features like multi-currency, multi-branch operations, WhatsApp invoice sending, and airline API integrations.
8. Ensuring data backup, recovery, and security for business records.
9. Balancing speed of development with long-term scalability and maintainability.
10. The biggest challenge: building a system that feels simple to use but still behaves like a real accounting platform behind the scenes.
