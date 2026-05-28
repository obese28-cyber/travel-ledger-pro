"""
services/accounting_service.py — Automatic journal entry creation.

This is the heart of the accounting system.
Every financial event calls one of these functions, which:
  1. Looks up the relevant account codes from chart_of_accounts
  2. Creates a JournalEntry header record
  3. Creates the matching debit and credit JournalEntryLine records
  4. Verifies the entry balances (total debits = total credits)

JOURNAL ENTRY RULES:
  - Issuing an invoice:     DR Accounts Receivable  / CR Sales Revenue
  - Customer pays:          DR Cash or Bank         / CR Accounts Receivable
  - Recording vendor cost:  DR Cost of Sales (COGS) / CR Accounts Payable
  - Paying a vendor:        DR Accounts Payable      / CR Cash or Bank
  - Recording an expense:   DR Expense Account       / CR Cash or Bank
"""

from datetime import datetime, timezone
from ..extensions import db
from ..models.accounting import ChartOfAccount, JournalEntry, JournalEntryLine
from .reference_service import generate_journal_entry_reference


def _get_account(code: str) -> ChartOfAccount:
    """
    Look up an account by its code. Raises ValueError if not found.
    This ensures misconfigured accounts fail loudly, not silently.
    """
    account = ChartOfAccount.query.filter_by(account_code=code, is_active=True).first()
    if not account:
        raise ValueError(f"Chart of accounts: account code '{code}' not found or inactive.")
    return account


def _create_entry(
    description:  str,
    source_type:  str,
    source_id:    int,
    lines:        list,       # list of (account_code, debit_amount, credit_amount, line_description)
    created_by:   int = None,
    entry_date=None,
) -> JournalEntry:
    """
    Internal helper — create a JournalEntry and its lines, then validate balance.

    Args:
        lines: list of tuples (account_code, debit, credit, description)
    """
    entry = JournalEntry(
        entry_reference = generate_journal_entry_reference(),
        entry_date      = entry_date or datetime.now(timezone.utc).date(),
        description     = description,
        source_type     = source_type,
        source_id       = source_id,
        is_posted       = True,
        created_by      = created_by,
    )
    db.session.add(entry)
    db.session.flush()  # get the entry.id without full commit

    total_debit  = 0.0
    total_credit = 0.0

    for account_code, debit, credit, line_desc in lines:
        account = _get_account(account_code)
        line = JournalEntryLine(
            journal_entry_id = entry.id,
            account_id       = account.id,
            debit            = round(debit, 2),
            credit           = round(credit, 2),
            description      = line_desc,
        )
        db.session.add(line)
        total_debit  += debit
        total_credit += credit

    # Sanity check: debits must equal credits
    if abs(total_debit - total_credit) > 0.01:
        raise ValueError(
            f"Journal entry is unbalanced: debits={total_debit:.2f}, credits={total_credit:.2f}"
        )

    return entry


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC FUNCTIONS — one per financial event
# ─────────────────────────────────────────────────────────────────────────────

def record_invoice_issued(invoice, created_by: int = None) -> JournalEntry:
    """
    When an invoice is ISSUED to a customer:
      DR  1100  Accounts Receivable     [invoice.total_amount]
      CR  4000  Sales Revenue           [invoice.total_amount]
    """
    amount = invoice.total_amount
    return _create_entry(
        description = f"Invoice {invoice.invoice_number} issued to {invoice.customer.name}",
        source_type = "invoice",
        source_id   = invoice.id,
        lines       = [
            ("1100", amount, 0,      f"Receivable — {invoice.customer.name}"),
            ("4000", 0,      amount, f"Revenue — {invoice.invoice_number}"),
        ],
        created_by  = created_by,
        entry_date  = invoice.issue_date,
    )


def record_customer_payment(payment, created_by: int = None) -> JournalEntry:
    """
    When a customer makes a payment or advance deposit:
      DR  1000/1010  Cash or Bank          [payment.amount]
      CR  1100       Accounts Receivable   [payment.amount]

    For advance deposits (invoice_id is None), the credit goes to AR as a
    pre-payment credit — the running balance goes negative (shown as CR) until
    the credit is applied to a future invoice.
    """
    amount       = payment.amount
    bank_account = payment.get_account_code()  # 1000 cash or 1010 bank

    txn_type = getattr(payment, "transaction_type", None) or "invoice_payment"
    is_advance = txn_type in ("advance_deposit", "credit_memo") or payment.invoice_id is None

    if is_advance:
        entry_desc = (
            f"Advance deposit {payment.payment_reference} from "
            f"{payment.customer.name} — {payment.payment_method}"
        )
        cr_desc = f"Advance deposit — {payment.customer.name}"
    else:
        inv_ref    = payment.invoice.invoice_number if payment.invoice else "N/A"
        entry_desc = (
            f"Payment {payment.payment_reference} received from "
            f"{payment.customer.name} — {payment.payment_method}"
        )
        cr_desc = f"Receivable cleared — {inv_ref}"

    return _create_entry(
        description = entry_desc,
        source_type = "payment",
        source_id   = payment.id,
        lines       = [
            (bank_account, amount, 0,      f"Received — {payment.customer.name}"),
            ("1100",       0,      amount, cr_desc),
        ],
        created_by  = created_by,
        entry_date  = payment.payment_date,
    )


def record_vendor_bill(vendor_bill, cogs_account_code: str = "5000",
                       created_by: int = None) -> JournalEntry:
    """
    When a vendor bill (cost) is recorded:
      DR  5000/5010/...  Cost of Sales     [vendor_bill.amount]
      CR  2000           Accounts Payable  [vendor_bill.amount]

    The COGS account code varies by service type (flight=5000, hotel=5010, etc.)
    Pass the correct code from BookingItem.get_cogs_account_code().
    """
    amount = vendor_bill.amount
    return _create_entry(
        description = (
            f"Vendor bill {vendor_bill.bill_reference} — "
            f"{vendor_bill.vendor.name}"
        ),
        source_type = "vendor_bill",
        source_id   = vendor_bill.id,
        lines       = [
            (cogs_account_code, amount, 0,      f"COGS — {vendor_bill.vendor.name}"),
            ("2000",            0,      amount, f"Payable — {vendor_bill.vendor.name}"),
        ],
        created_by  = created_by,
        entry_date  = vendor_bill.bill_date,
    )


def record_vendor_payment(vendor_payment, created_by: int = None) -> JournalEntry:
    """
    When a vendor is paid:
      DR  2000       Accounts Payable   [vendor_payment.amount]
      CR  1000/1010  Cash or Bank       [vendor_payment.amount]
    """
    amount       = vendor_payment.amount
    bank_account = vendor_payment.get_account_code()
    return _create_entry(
        description = (
            f"Vendor payment {vendor_payment.payment_reference} — "
            f"{vendor_payment.vendor.name}"
        ),
        source_type = "vendor_payment",
        source_id   = vendor_payment.id,
        lines       = [
            ("2000",       amount, 0,      f"Payable cleared — {vendor_payment.vendor.name}"),
            (bank_account, 0,      amount, f"Paid — {vendor_payment.vendor.name}"),
        ],
        created_by  = created_by,
        entry_date  = vendor_payment.payment_date,
    )


def record_expense(expense, created_by: int = None) -> JournalEntry:
    """
    When an operating expense is recorded:
      DR  6100/6200/...  Expense Account   [expense.amount]
      CR  1000/1010      Cash or Bank      [expense.amount]
    """
    amount         = expense.amount
    expense_code   = expense.account.account_code
    payment_code   = expense.get_payment_account_code()
    return _create_entry(
        description = f"Expense {expense.expense_reference} — {expense.description}",
        source_type = "expense",
        source_id   = expense.id,
        lines       = [
            (expense_code, amount, 0,      expense.description),
            (payment_code, 0,      amount, f"Paid via {expense.payment_method}"),
        ],
        created_by  = created_by,
        entry_date  = expense.expense_date,
    )
