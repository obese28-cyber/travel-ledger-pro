"""
models/__init__.py — Import all models so SQLAlchemy can discover them.

When db.create_all() is called, SQLAlchemy needs to have seen all model
classes. Importing them here ensures they are registered with the metadata.
"""

from .user        import User
from .customer    import Customer
from .vendor      import Vendor
from .booking     import Booking, BookingItem
from .invoice     import Invoice, InvoiceItem
from .payment     import Payment
from .vendor_bill import VendorBill, VendorPayment, VendorPaymentBatch
from .expense     import Expense
from .accounting  import ChartOfAccount, JournalEntry, JournalEntryLine
from .audit       import AuditTrail
from .airline     import Airline

__all__ = [
    "User", "Customer", "Vendor",
    "Booking", "BookingItem",
    "Invoice", "InvoiceItem",
    "Payment",
    "VendorBill", "VendorPayment", "VendorPaymentBatch",
    "Expense",
    "ChartOfAccount", "JournalEntry", "JournalEntryLine",
    "AuditTrail",
    "Airline",
]
