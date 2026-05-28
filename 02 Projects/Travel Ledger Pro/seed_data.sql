-- =============================================================
-- Travel Ledger Pro — Seed Data
-- Run AFTER schema.sql
-- =============================================================

-- -------------------------------------------------------------
-- USERS (1 admin + 1 staff)
-- Passwords are bcrypt hashes of 'password123' (change in production!)
-- -------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role) VALUES
('Admin User',   'admin@travelledgerpro.com', '$2b$12$placeholder_admin_hash',  'admin'),
('Sarah Kamau',  'sarah@travelledgerpro.com', '$2b$12$placeholder_staff_hash',  'staff');


-- -------------------------------------------------------------
-- CHART OF ACCOUNTS
-- -------------------------------------------------------------

-- ASSETS
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
('1000', 'Cash on Hand',                  'asset', 'Physical cash in the office'),
('1010', 'Bank Account — Main',           'asset', 'Primary business bank account'),
('1020', 'Bank Account — USD',            'asset', 'USD foreign currency account (future)'),
('1100', 'Accounts Receivable',           'asset', 'Money owed by customers');

-- LIABILITIES
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
('2000', 'Accounts Payable — Vendors',    'liability', 'Money owed to suppliers and vendors'),
('2100', 'Tax Payable',                   'liability', 'VAT or sales tax owed to government');

-- EQUITY
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
('3000', 'Owner''s Equity',              'equity', 'Owner''s investment in the business'),
('3100', 'Retained Earnings',            'equity', 'Accumulated profits kept in business');

-- REVENUE
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
('4000', 'Sales Revenue — Travel Services', 'revenue', 'Income from travel bookings and packages'),
('4100', 'Commission Income',            'revenue', 'Commission earned from partner agencies (future)');

-- COST OF SALES
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
('5000', 'Cost of Sales — Airline Tickets',  'expense', 'Cost paid to airlines for flight tickets'),
('5010', 'Cost of Sales — Hotel',            'expense', 'Cost paid to hotels for accommodation'),
('5020', 'Cost of Sales — Visa Services',    'expense', 'Cost paid for visa processing'),
('5030', 'Cost of Sales — Tour Packages',    'expense', 'Cost paid to tour operators'),
('5040', 'Cost of Sales — Insurance',        'expense', 'Cost paid for travel insurance');

-- OPERATING EXPENSES
INSERT INTO chart_of_accounts (account_code, account_name, account_type, description) VALUES
('6000', 'Operating Expenses',           'expense', 'Parent account for all operating costs'),
('6100', 'Staff Salaries',               'expense', 'Monthly staff wages and salaries'),
('6200', 'Office Rent',                  'expense', 'Monthly office rent payment'),
('6300', 'Fuel & Transport',             'expense', 'Fuel, vehicle costs, and transport'),
('6400', 'Marketing & Advertising',      'expense', 'Ads, promotions, and marketing spend'),
('6500', 'Utilities',                    'expense', 'Electricity, internet, water, phone'),
('6900', 'Miscellaneous Expenses',       'expense', 'Other expenses not listed above');

-- Set parent accounts for sub-accounts
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE account_code = '6000')
WHERE account_code IN ('6100','6200','6300','6400','6500','6900');


-- -------------------------------------------------------------
-- VENDORS (sample)
-- -------------------------------------------------------------
INSERT INTO vendors (name, type, contact_name, phone, email) VALUES
('Emirates Airlines',       'airline',   'Reservations Desk', '+971-4-708-1111', 'reservations@emirates.com'),
('Kenya Airways',           'airline',   'Trade Desk',        '+254-20-327-4747', 'trade@kenya-airways.com'),
('Hilton Dubai Creek',      'hotel',     'Ayesha Mohamed',    '+971-4-227-1111', 'reservations.dubai@hilton.com'),
('Serena Hotels Kenya',     'hotel',     'Sales Team',        '+254-20-282-2000', 'sales@serenahotels.com'),
('Dubai Visa Center',       'visa',      'Processing Desk',   '+971-4-xxx-xxxx',  'info@dubaivisacenter.ae'),
('Africa Safaris Ltd',      'tour',      'James Mwangi',      '+254-722-100-200', 'james@africasafaris.co.ke'),
('AXA Travel Insurance',    'insurance', 'Corporate Desk',    '+44-20-7003-2345', 'corporate@axa.com');


-- -------------------------------------------------------------
-- CUSTOMERS (sample)
-- -------------------------------------------------------------
INSERT INTO customers (name, email, phone, passport_number, nationality, created_by) VALUES
('Ahmed Al-Rashid',   'ahmed@email.com',    '+971-50-111-2222', 'A12345678', 'UAE',      1),
('Mary Wanjiku',      'mary@email.com',     '+254-722-333-444', 'KE8765432', 'Kenyan',   1),
('John Osei Bonsu',   'john@email.com',     '+233-24-555-6666', 'GH4561237', 'Ghanaian', 2),
('Fatima Al-Zahraa',  'fatima@email.com',   '+966-55-777-8888', 'SA9871234', 'Saudi',    2),
('David Kimani',      'david@email.com',    '+254-733-999-000', 'KE2345678', 'Kenyan',   2);


-- -------------------------------------------------------------
-- BOOKINGS (sample)
-- -------------------------------------------------------------
INSERT INTO bookings (booking_reference, customer_id, destination, travel_date, return_date, status, created_by) VALUES
('BK-2026-001', 1, 'Dubai, UAE',           '2026-06-10', '2026-06-17', 'confirmed', 2),
('BK-2026-002', 2, 'London, UK',           '2026-07-01', '2026-07-14', 'confirmed', 2),
('BK-2026-003', 3, 'Nairobi Safari, Kenya','2026-06-20', '2026-06-25', 'pending',   2),
('BK-2026-004', 4, 'Istanbul, Turkey',     '2026-08-15', '2026-08-22', 'confirmed', 1),
('BK-2026-005', 5, 'Cape Town, South Africa','2026-09-01','2026-09-08','pending',   2);


-- -------------------------------------------------------------
-- BOOKING ITEMS (sample — mix of services per booking)
-- -------------------------------------------------------------
-- BK-2026-001: Ahmed to Dubai (flight + hotel + visa)
INSERT INTO booking_items (booking_id, service_type, vendor_id, description, selling_price, vendor_cost) VALUES
(1, 'flight',  1, 'Emirates EK 722 NBO-DXB Return',     1200.00,  900.00),
(1, 'hotel',   3, 'Hilton Dubai Creek — 7 nights',       980.00,  700.00),
(1, 'visa',    5, 'UAE Tourist Visa — Single Entry',       80.00,   50.00);

-- BK-2026-002: Mary to London (flight + hotel + insurance)
INSERT INTO booking_items (booking_id, service_type, vendor_id, description, selling_price, vendor_cost) VALUES
(2, 'flight',  2, 'Kenya Airways KQ 100 NBO-LHR Return', 1800.00, 1400.00),
(2, 'hotel',   NULL, 'Premier Inn London — 14 nights',    1400.00, 1050.00),
(2, 'insurance', 7, 'AXA Travel Insurance — 14 days',      120.00,   80.00);

-- BK-2026-003: John — Nairobi Safari (tour package)
INSERT INTO booking_items (booking_id, service_type, vendor_id, description, selling_price, vendor_cost) VALUES
(3, 'tour_package', 6, 'Masai Mara 5-Day Safari — All Inclusive', 2500.00, 1800.00);


-- -------------------------------------------------------------
-- INVOICES (sample)
-- -------------------------------------------------------------
-- Invoice for BK-2026-001 (Ahmed — Dubai)
INSERT INTO invoices (invoice_number, booking_id, customer_id, issue_date, due_date,
                      subtotal, tax_amount, total_amount, amount_paid, status, created_by)
VALUES ('INV-2026-001', 1, 1, '2026-05-11', '2026-05-25',
        2260.00, 0.00, 2260.00, 800.00, 'partially_paid', 2);

-- Invoice for BK-2026-002 (Mary — London)
INSERT INTO invoices (invoice_number, booking_id, customer_id, issue_date, due_date,
                      subtotal, tax_amount, total_amount, amount_paid, status, created_by)
VALUES ('INV-2026-002', 2, 2, '2026-05-11', '2026-06-01',
        3320.00, 0.00, 3320.00, 3320.00, 'paid', 2);

-- Invoice for BK-2026-003 (John — Safari)
INSERT INTO invoices (invoice_number, booking_id, customer_id, issue_date, due_date,
                      subtotal, tax_amount, total_amount, amount_paid, status, created_by)
VALUES ('INV-2026-003', 3, 3, '2026-05-11', '2026-06-05',
        2500.00, 0.00, 2500.00, 0.00, 'issued', 2);


-- -------------------------------------------------------------
-- INVOICE ITEMS (line items for each invoice)
-- -------------------------------------------------------------
-- INV-2026-001 lines
INSERT INTO invoice_items (invoice_id, booking_item_id, description, quantity, unit_price, total_price) VALUES
(1, 1, 'Emirates EK 722 NBO-DXB Return',     1, 1200.00, 1200.00),
(1, 2, 'Hilton Dubai Creek — 7 nights',       1,  980.00,  980.00),
(1, 3, 'UAE Tourist Visa — Single Entry',     1,   80.00,   80.00);

-- INV-2026-002 lines
INSERT INTO invoice_items (invoice_id, booking_item_id, description, quantity, unit_price, total_price) VALUES
(2, 4, 'Kenya Airways KQ 100 NBO-LHR Return', 1, 1800.00, 1800.00),
(2, 5, 'Premier Inn London — 14 nights',       1, 1400.00, 1400.00),
(2, 6, 'AXA Travel Insurance — 14 days',       1,  120.00,  120.00);

-- INV-2026-003 lines
INSERT INTO invoice_items (invoice_id, booking_item_id, description, quantity, unit_price, total_price) VALUES
(3, 7, 'Masai Mara 5-Day Safari — All Inclusive', 1, 2500.00, 2500.00);


-- -------------------------------------------------------------
-- PAYMENTS (sample)
-- -------------------------------------------------------------
-- Ahmed partial payment on INV-2026-001
INSERT INTO payments (payment_reference, invoice_id, customer_id, amount, payment_date, payment_method, notes, created_by)
VALUES ('PAY-2026-001', 1, 1, 800.00, '2026-05-12', 'bank_transfer', 'Bank ref: TXN-8823-A', 2);

-- Mary full payment on INV-2026-002
INSERT INTO payments (payment_reference, invoice_id, customer_id, amount, payment_date, payment_method, created_by)
VALUES ('PAY-2026-002', 2, 2, 3320.00, '2026-05-11', 'mobile_money', 2);


-- -------------------------------------------------------------
-- VENDOR BILLS (sample)
-- -------------------------------------------------------------
-- Bills for BK-2026-001 (Ahmed — Dubai)
INSERT INTO vendor_bills (bill_reference, vendor_id, booking_id, booking_item_id, description, amount, bill_date, due_date, amount_paid, status, created_by)
VALUES
('VB-2026-001', 1, 1, 1, 'Emirates EK 722 — Ahmed Al-Rashid',     900.00, '2026-05-11', '2026-05-31', 900.00, 'paid',   1),
('VB-2026-002', 3, 1, 2, 'Hilton Dubai Creek — 7 nights Ahmed',   700.00, '2026-05-11', '2026-06-01',   0.00, 'unpaid', 1),
('VB-2026-003', 5, 1, 3, 'UAE Visa — Ahmed Al-Rashid',             50.00, '2026-05-11', '2026-05-20',  50.00, 'paid',   1);

-- Bills for BK-2026-002 (Mary — London)
INSERT INTO vendor_bills (bill_reference, vendor_id, booking_id, booking_item_id, description, amount, bill_date, due_date, amount_paid, status, created_by)
VALUES
('VB-2026-004', 2, 2, 4, 'KQ 100 NBO-LHR — Mary Wanjiku',       1400.00, '2026-05-11', '2026-05-31', 1400.00, 'paid',   1),
('VB-2026-005', NULL, 2, 5, 'Premier Inn London — Mary Wanjiku', 1050.00, '2026-05-11', '2026-06-01',    0.00, 'unpaid', 1),
('VB-2026-006', 7, 2, 6, 'AXA Insurance — Mary Wanjiku',           80.00, '2026-05-11', '2026-05-25',   80.00, 'paid',   1);


-- -------------------------------------------------------------
-- VENDOR PAYMENTS (sample)
-- -------------------------------------------------------------
INSERT INTO vendor_payments (payment_reference, vendor_bill_id, vendor_id, amount, payment_date, payment_method, notes, created_by)
VALUES
('VP-2026-001', 1, 1, 900.00,  '2026-05-12', 'bank_transfer', 'Emirates IATA settlement',  1),
('VP-2026-002', 3, 5, 50.00,   '2026-05-12', 'bank_transfer', 'Dubai Visa Center payment', 1),
('VP-2026-003', 4, 2, 1400.00, '2026-05-12', 'bank_transfer', 'KQ IATA settlement',        1),
('VP-2026-004', 6, 7, 80.00,   '2026-05-12', 'bank_transfer', 'AXA insurance payment',     1);


-- -------------------------------------------------------------
-- EXPENSES (sample operating costs)
-- -------------------------------------------------------------
INSERT INTO expenses (expense_reference, category, account_id, description, amount, expense_date, payment_method, created_by)
VALUES
('EXP-2026-001', 'office_rent',   (SELECT id FROM chart_of_accounts WHERE account_code = '6200'), 'May 2026 Office Rent',                 1200.00, '2026-05-01', 'bank_transfer', 1),
('EXP-2026-002', 'staff_salary',  (SELECT id FROM chart_of_accounts WHERE account_code = '6100'), 'Sarah Kamau — May 2026 Salary',        1500.00, '2026-05-01', 'bank_transfer', 1),
('EXP-2026-003', 'utilities',     (SELECT id FROM chart_of_accounts WHERE account_code = '6500'), 'Electricity & Internet — May 2026',     200.00, '2026-05-05', 'cash',          1),
('EXP-2026-004', 'marketing',     (SELECT id FROM chart_of_accounts WHERE account_code = '6400'), 'Facebook & Instagram Ads — May 2026',   300.00, '2026-05-10', 'credit_card',   1),
('EXP-2026-005', 'miscellaneous', (SELECT id FROM chart_of_accounts WHERE account_code = '6900'), 'Office supplies and stationery',         50.00, '2026-05-11', 'cash',          1);


-- -------------------------------------------------------------
-- JOURNAL ENTRIES (the accounting entries for all above events)
-- -------------------------------------------------------------

-- JE-001: Invoice INV-2026-001 issued to Ahmed ($2,260)
INSERT INTO journal_entries (entry_reference, entry_date, description, source_type, source_id, created_by)
VALUES ('JE-2026-001', '2026-05-11', 'Invoice INV-2026-001 — Ahmed Al-Rashid — Dubai Trip', 'invoice', 1, 2);

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
VALUES
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-001'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 2260.00, 0.00, 'Accounts Receivable — Ahmed Al-Rashid'),
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-001'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '4000'), 0.00, 2260.00, 'Sales Revenue — Dubai Trip');

-- JE-002: Partial payment PAY-2026-001 from Ahmed ($800)
INSERT INTO journal_entries (entry_reference, entry_date, description, source_type, source_id, created_by)
VALUES ('JE-2026-002', '2026-05-12', 'Payment PAY-2026-001 — Ahmed Al-Rashid — $800 partial', 'payment', 1, 2);

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
VALUES
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-002'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1010'), 800.00, 0.00, 'Bank — received from Ahmed Al-Rashid'),
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-002'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1100'), 0.00, 800.00, 'Accounts Receivable — Ahmed Al-Rashid');

-- JE-003: Vendor bill VB-2026-001 — Emirates ($900)
INSERT INTO journal_entries (entry_reference, entry_date, description, source_type, source_id, created_by)
VALUES ('JE-2026-003', '2026-05-11', 'Vendor bill VB-2026-001 — Emirates Airlines — Ahmed Dubai flight', 'vendor_bill', 1, 1);

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
VALUES
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-003'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '5000'), 900.00, 0.00, 'COGS — Airline — Ahmed Dubai flight'),
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-003'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '2000'), 0.00, 900.00, 'Accounts Payable — Emirates Airlines');

-- JE-004: Vendor payment VP-2026-001 — paid Emirates ($900)
INSERT INTO journal_entries (entry_reference, entry_date, description, source_type, source_id, created_by)
VALUES ('JE-2026-004', '2026-05-12', 'Vendor payment VP-2026-001 — Emirates Airlines — $900 settled', 'vendor_payment', 1, 1);

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
VALUES
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-004'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '2000'), 900.00, 0.00, 'Accounts Payable — Emirates Airlines cleared'),
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-004'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1010'), 0.00, 900.00, 'Bank — payment to Emirates Airlines');

-- JE-005: Expense EXP-2026-001 — Office Rent ($1,200)
INSERT INTO journal_entries (entry_reference, entry_date, description, source_type, source_id, created_by)
VALUES ('JE-2026-005', '2026-05-01', 'Expense EXP-2026-001 — May 2026 Office Rent', 'expense', 1, 1);

INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
VALUES
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-005'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '6200'), 1200.00, 0.00, 'Office Rent — May 2026'),
((SELECT id FROM journal_entries WHERE entry_reference = 'JE-2026-005'),
 (SELECT id FROM chart_of_accounts WHERE account_code = '1010'), 0.00, 1200.00, 'Bank — rent payment');
