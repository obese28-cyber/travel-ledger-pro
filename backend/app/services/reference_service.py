"""
services/reference_service.py — Auto-generates human-readable reference numbers.

Examples:
  BK-2026-001   BK-2026-002   BK-2026-003
  INV-2026-001  PAY-2026-001  VB-2026-001

References are unique per prefix per year and reset each year.
"""

from datetime import datetime, timezone
from ..extensions import db


def _next_sequence(model_class, ref_column, prefix: str, year: int) -> int:
    """
    Count existing records with references matching 'PREFIX-YEAR-*'
    and return the next sequence number.
    """
    like_pattern = f"{prefix}-{year}-%"
    count = db.session.query(model_class).filter(
        ref_column.like(like_pattern)
    ).count()
    return count + 1


def _make_ref(prefix: str, year: int, seq: int) -> str:
    return f"{prefix}-{year}-{seq:03d}"


def generate_booking_ref() -> str:
    from ..models.booking import Booking
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(Booking, Booking.booking_reference, "BK", year)
    return _make_ref("BK", year, seq)


def generate_invoice_number() -> str:
    from ..models.invoice import Invoice
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(Invoice, Invoice.invoice_number, "INV", year)
    return _make_ref("INV", year, seq)


def generate_payment_reference() -> str:
    from ..models.payment import Payment
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(Payment, Payment.payment_reference, "PAY", year)
    return _make_ref("PAY", year, seq)


def generate_vendor_bill_reference() -> str:
    from ..models.vendor_bill import VendorBill
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(VendorBill, VendorBill.bill_reference, "VB", year)
    return _make_ref("VB", year, seq)


def generate_vendor_payment_reference() -> str:
    from ..models.vendor_bill import VendorPayment
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(VendorPayment, VendorPayment.payment_reference, "VP", year)
    return _make_ref("VP", year, seq)


def generate_expense_reference() -> str:
    from ..models.expense import Expense
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(Expense, Expense.expense_reference, "EXP", year)
    return _make_ref("EXP", year, seq)


def generate_vendor_batch_reference() -> str:
    from ..models.vendor_bill import VendorPaymentBatch
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(VendorPaymentBatch, VendorPaymentBatch.batch_reference, "BATCH", year)
    return _make_ref("BATCH", year, seq)


def generate_journal_entry_reference() -> str:
    from ..models.accounting import JournalEntry
    year = datetime.now(timezone.utc).year
    seq  = _next_sequence(JournalEntry, JournalEntry.entry_reference, "JE", year)
    return _make_ref("JE", year, seq)
