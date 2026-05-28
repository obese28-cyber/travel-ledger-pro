"""
AGENCY PROFILE -- Edit this file or use Admin > Settings in the app.
Restart the backend after direct file edits.
"""

AGENCY_NAME = "AXUM TRAVEL AND TOURS"

AGENCY_ADDRESS_LINES = [
    "Plot 14, Liberation Road",
    "Accra, Ghana",
    "P.O. Box CT 1234, Cantonments",
]

AGENCY_PHONES = [
    "+233 30 000 0000",
    "+233 24 000 0000",
]

AGENCY_EMAILS = [
    "info@axumtravel.com",
    "tickets@axumtravel.com",
    "www.axumtravel.com",
]

LOGO_PATH = None

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

SIGNATORY_LEFT = {
    "name":  "NAME : ..............................",
    "title": "Operations / Ticketing",
}

SIGNATORY_RIGHT = {
    "name":  "NAME : ..............................",
    "title": "Manager / Director",
}

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
    "name":            AGENCY_NAME,
    "address_lines":   AGENCY_ADDRESS_LINES,
    "phones":          AGENCY_PHONES,
    "emails":          AGENCY_EMAILS,
    "logo_path":       LOGO_PATH,
    "bank_accounts":   BANK_ACCOUNTS,
    "signatory_left":  SIGNATORY_LEFT,
    "signatory_right": SIGNATORY_RIGHT,
    "services":        SERVICES,
}
