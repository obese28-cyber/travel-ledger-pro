"""
AGENCY PROFILE -- Edit this file or use Admin > Settings in the app.
Restart the backend after direct file edits.
"""

import os

AGENCY_NAME = "AXUM TRAVEL AND TOURS"

AGENCY_ADDRESS_LINES = [
    "Ground Floor, 35 Aseda House, 5th Crescent",
    "Anyemi Kpakpa Road, Asylum Down, Accra, Ghana",
    "GA-027-9732  |  P.O. Box YK 270 Kanda, Accra",
]

AGENCY_PHONES = [
    "Tel: +233 302 245 747",
    "Mob: +233 24 004 4001",
    "Mob: +233 50 557 6664",
]

AGENCY_EMAILS = [
    "info@axumtravels.com",
    "sales@axumtravels.com",
    "www.axumtravels.com",
]

# Logo path — place your logo.jpg in backend/static/
_BASE = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(_BASE, "static", "logo.jpg")

BANK_ACCOUNTS = [
    {
        "bank":    "GCB Bank Limited",
        "account": "1011 2345 6789 01",
        "label":   "GHS Account",
    },
    {
        "bank":    "GCB Bank Limited",
        "account": "1011 2345 6789 02",
        "label":   "USD Account",
    },
]

SIGNATORY_TITLE = "Reservations Manager"
SIGNATORY_NAME  = ""

SERVICES = [
    "AIR TICKETS & RESERVATIONS",
    "VISA ASSISTANCE",
    "HOTEL RESERVATIONS",
    "IMMIGRATION SERVICES",
    "CAR RENTALS",
    "TOUR PACKAGES",
    "TRAVEL INSURANCE",
]

AGENCY_PROFILE = {
    "name":             AGENCY_NAME,
    "address_lines":    AGENCY_ADDRESS_LINES,
    "phones":           AGENCY_PHONES,
    "emails":           AGENCY_EMAILS,
    "logo_path":        LOGO_PATH,
    "bank_accounts":    BANK_ACCOUNTS,
    "signatory_title":  SIGNATORY_TITLE,
    "signatory_name":   SIGNATORY_NAME,
    "services":         SERVICES,
    "currency":         "GHS",
}
