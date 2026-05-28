"""
services/pdf_service.py — Travel agency invoice PDF generation.

Produces a professional A4 invoice matching the agency's standard layout:
  - Company header (logo + name + address)
  - Invoice number & title
  - Passenger / service details
  - Fare breakdown table
  - Signature block
  - Bank account details
  - Services footer

Uses ReportLab canvas for pixel-precise layout.
"""

import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


# ── Colour palette ────────────────────────────────────────────────────────────
DARK_RED   = colors.HexColor("#8B0000")
DARK_GREY  = colors.HexColor("#333333")
MID_GREY   = colors.HexColor("#666666")
LIGHT_GREY = colors.HexColor("#CCCCCC")
TABLE_BORDER = colors.HexColor("#444444")
HEADER_FILL  = colors.HexColor("#F5F5F5")

PAGE_W, PAGE_H = A4   # 595.28 x 841.89 pt
LM = 18 * mm          # left margin
RM = PAGE_W - 18 * mm  # right margin
CONTENT_W = RM - LM


def _fmt(n):
    """Format a number as comma-separated with 2 decimal places."""
    try:
        return f"{float(n):,.2f}"
    except (TypeError, ValueError):
        return "—"


def _date(d):
    if not d:
        return "—"
    if isinstance(d, str):
        try:
            d = datetime.fromisoformat(d.replace("Z", "+00:00"))
        except ValueError:
            return d
    return d.strftime("%d/%m/%Y") if hasattr(d, "strftime") else str(d)


def _draw_hline(c, x1, y, x2, width=0.5, color=None):
    c.setStrokeColor(color or LIGHT_GREY)
    c.setLineWidth(width)
    c.line(x1, y, x2, y)


def _text(c, x, y, txt, font="Helvetica", size=9, color=None, align="left"):
    c.setFont(font, size)
    c.setFillColor(color or DARK_GREY)
    if align == "right":
        c.drawRightString(x, y, str(txt))
    elif align == "center":
        c.drawCentredString(x, y, str(txt))
    else:
        c.drawString(x, y, str(txt))


def generate_invoice_pdf(invoice_data: dict, agency: dict | None = None) -> bytes:
    """
    Generate a PDF invoice and return as bytes.

    invoice_data — dict from Invoice.to_dict() + payments list
    agency       — optional dict with agency branding info:
                   name, address_lines (list), phones (list), emails (list),
                   website, bank_accounts (list of {bank, account, label}),
                   services (list of strings), logo_path (file path or None)
    """
    if agency is None:
        agency = {}

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Invoice {invoice_data.get('invoice_number', '')}")

    _draw_page(c, invoice_data, agency)

    c.save()
    buf.seek(0)
    return buf.read()


def _draw_page(c, inv, agency):
    y = PAGE_H - 12 * mm   # start near top

    # ── 1. Company header ─────────────────────────────────────────────────────
    y = _draw_header(c, y, agency)

    # ── 2. Invoice number + title ─────────────────────────────────────────────
    y = _draw_invoice_title(c, y, inv)

    # ── 3. Passenger / service details ────────────────────────────────────────
    y = _draw_details(c, y, inv)

    # ── 4. Fare breakdown table ───────────────────────────────────────────────
    y = _draw_fare_table(c, y, inv)

    # ── 5. Signature block ────────────────────────────────────────────────────
    y = _draw_signatures(c, y, agency)

    # ── 6. Footer services bar ────────────────────────────────────────────────
    _draw_footer(c, agency)


# ── Header ────────────────────────────────────────────────────────────────────
def _draw_header(c, y, agency):
    logo_area_w = 52 * mm
    info_x = LM + logo_area_w + 6 * mm
    top = y

    # Logo box (placeholder or real image)
    logo_path = agency.get("logo_path")
    if logo_path:
        try:
            img = ImageReader(logo_path)
            c.drawImage(img, LM, top - 28 * mm, width=48 * mm, height=28 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            _draw_logo_placeholder(c, LM, top - 28 * mm, 48 * mm, 28 * mm)
    else:
        _draw_logo_placeholder(c, LM, top - 28 * mm, 48 * mm, 28 * mm)

    # Company name (bold, dark red)
    name = agency.get("name", "TRAVEL LEDGER PRO")
    _text(c, info_x, top - 6 * mm, name.upper(),
          font="Helvetica-Bold", size=13, color=DARK_RED)

    # Address lines
    addr_lines = agency.get("address_lines", [
        "Your Agency Address Line 1",
        "City, Country",
    ])
    ay = top - 11 * mm
    for line in addr_lines:
        _text(c, info_x, ay, line, size=8, color=MID_GREY)
        ay -= 4 * mm

    # Phones + emails side by side
    phones = agency.get("phones", [])
    emails = agency.get("emails", [])
    py = ay - 2 * mm
    for i, ph in enumerate(phones[:3]):
        _text(c, info_x, py - i * 4 * mm, ph, size=8, color=DARK_GREY)
    for i, em in enumerate(emails[:3]):
        _text(c, info_x + 38 * mm, py - i * 4 * mm, em, size=8, color=DARK_GREY)

    # Vertical separator line
    c.setStrokeColor(DARK_GREY)
    c.setLineWidth(1)
    c.line(info_x - 3 * mm, top - 2 * mm, info_x - 3 * mm, top - 32 * mm)

    return top - 36 * mm


def _draw_logo_placeholder(c, x, y, w, h):
    """Draw a simple placeholder box when no logo is set."""
    c.setStrokeColor(LIGHT_GREY)
    c.setFillColor(colors.HexColor("#F0F0F0"))
    c.setLineWidth(0.5)
    c.rect(x, y, w, h, fill=1, stroke=1)
    c.setFillColor(LIGHT_GREY)
    c.setFont("Helvetica", 7)
    c.drawCentredString(x + w / 2, y + h / 2 - 3, "AGENCY LOGO")


# ── Invoice number + title ────────────────────────────────────────────────────
def _draw_invoice_title(c, y, inv):
    _draw_hline(c, LM, y, RM, width=0.8, color=DARK_GREY)
    y -= 5 * mm

    inv_num = inv.get("invoice_number", "—")
    _text(c, RM, y, f"INVOICE NO:   {inv_num}",
          font="Helvetica-Bold", size=10, color=DARK_GREY, align="right")
    y -= 7 * mm

    # Title — use service type from first item if available
    items = inv.get("items") or []
    service_desc = ""
    if items:
        first = items[0]
        st = (first.get("service_type") or "").replace("_", " ").upper()
        desc = first.get("description") or ""
        service_desc = st or desc[:40]

    title = service_desc or "TRAVEL SERVICE INVOICE"
    cx = LM + CONTENT_W / 2

    # Underline + bold title
    c.setFont("Helvetica-Bold", 12)
    title_w = c.stringWidth(title, "Helvetica-Bold", 12)
    c.setFillColor(DARK_GREY)
    c.drawCentredString(cx, y, title)
    c.setLineWidth(0.8)
    c.setStrokeColor(DARK_GREY)
    c.line(cx - title_w / 2, y - 1, cx + title_w / 2, y - 1)

    y -= 7 * mm
    _draw_hline(c, LM, y, RM, width=0.5)
    return y - 5 * mm


# ── Detail rows ───────────────────────────────────────────────────────────────
def _bold_label(c, x, y, label, value, value_font="Helvetica", lsize=9, vsize=9):
    """Draw 'LABEL: value' with label in bold-underline style."""
    c.setFont("Helvetica-Bold", lsize)
    c.setFillColor(DARK_GREY)
    label_str = f"{label}:"
    lw = c.stringWidth(label_str, "Helvetica-Bold", lsize)
    c.drawString(x, y, label_str)
    # underline the label
    c.setLineWidth(0.5)
    c.setStrokeColor(DARK_GREY)
    c.line(x, y - 1, x + lw, y - 1)
    # value
    vx = x + lw + 3
    c.setFont(value_font, vsize)
    c.setFillColor(DARK_GREY)
    c.drawString(vx, y, str(value) if value else "—")
    return lw + 3 + c.stringWidth(str(value or "—"), value_font, vsize)


def _draw_details(c, y, inv):
    lh = 6.5 * mm   # line height

    # NAME OF PASSENGER
    pax = inv.get("customer_name") or "—"
    _bold_label(c, LM, y, "NAME OF PASSENGER", f"  1.  {pax.upper()}", lsize=9, vsize=9)
    y -= lh

    # NAME OF COMPANY + DATE OF ISSUE (same line)
    company = inv.get("customer_company") or inv.get("customer_nationality") or "—"
    w = _bold_label(c, LM, y, "NAME OF COMPANY", company.upper(), lsize=9)
    date_x = LM + 85 * mm
    _bold_label(c, date_x, y, "DATE OF ISSUE", _date(inv.get("issue_date")), lsize=9)
    y -= lh

    # Items detail rows (airline, ticket number, PNR etc. from first item)
    items = inv.get("items") or []
    booking_ref = inv.get("booking_ref") or "—"

    if items:
        first = items[0]
        # Prefer airline_name (from flight booking) over generic supplier_name
        airline_name = first.get("airline_name")
        supplier     = airline_name or first.get("supplier_name") or "—"
        label        = "AIRLINE" if airline_name else "SUPPLIER / AIRLINE"
        _bold_label(c, LM, y, label, supplier.upper(), lsize=9)

        # Show ticket number on same line (right half) if available
        ticket = first.get("ticket_number")
        if ticket:
            ticket_x = LM + 90 * mm
            _bold_label(c, ticket_x, y, "TICKET NO.", ticket, lsize=9)
        y -= lh

    # Booking reference
    _bold_label(c, LM, y, "BOOKING REFERENCE", booking_ref, lsize=9)
    y -= lh

    # Invoice notes (PNR / extra info)
    notes = inv.get("notes") or ""
    if notes:
        _bold_label(c, LM, y, "NOTES", notes, lsize=9)
        y -= lh

    y -= 2 * mm
    return y


# ── Fare Breakdown Table ──────────────────────────────────────────────────────
def _draw_fare_table(c, y, inv):
    items = inv.get("items") or []

    # Column widths (total = CONTENT_W ~159mm)
    col_label_w = 38 * mm    # "FARE BREAKDOWN"
    col_desc_w  = 60 * mm    # description / item name
    col_amount_w= 36 * mm    # amount
    col_extra_w = CONTENT_W - col_label_w - col_desc_w - col_amount_w

    row_h = 7 * mm
    header_h = 7 * mm

    # All rows: (left_label, description, amount)
    rows = []
    for item in items:
        qty    = item.get("quantity") or 1
        price  = item.get("unit_price") or item.get("selling_price") or 0
        desc   = item.get("description") or item.get("service_type") or ""
        # Append airline + ticket number to description for flight items
        airline = item.get("airline_name")
        ticket  = item.get("ticket_number")
        if airline:
            desc = f"{desc}  |  {airline}"
        if ticket:
            desc = f"{desc}  ({ticket})"
        rows.append(("", desc, f"{_fmt(price * qty)}"))

    # Standard breakdown rows
    subtotal    = inv.get("subtotal") or inv.get("total_amount") or 0
    tax_amount  = inv.get("tax_amount") or 0
    total       = inv.get("total_amount") or 0
    amount_paid = inv.get("amount_paid") or 0
    balance_due = inv.get("balance_due") or 0

    # Add totals section
    rows.append(("", "SUM TOTAL",  _fmt(subtotal)))
    if tax_amount:
        rows.append(("", f"TAX ({tax_amount})", ""))
    rows.append(("GRAND TOTAL", "", _fmt(total)))

    table_h = header_h + row_h * len(rows) + 2 * mm
    table_top = y
    table_bottom = table_top - table_h

    # Outer border
    c.setStrokeColor(TABLE_BORDER)
    c.setLineWidth(0.8)
    c.rect(LM, table_bottom, CONTENT_W, table_h, fill=0, stroke=1)

    # Header row background
    c.setFillColor(HEADER_FILL)
    c.rect(LM, table_top - header_h, CONTENT_W, header_h, fill=1, stroke=0)

    # Header text
    _text(c, LM + 3, table_top - header_h + 2 * mm,
          "FARE BREAKDOWN", font="Helvetica-Bold", size=8, color=DARK_GREY)
    _text(c, LM + col_label_w + 3, table_top - header_h + 2 * mm,
          "DESCRIPTION", font="Helvetica-Bold", size=8, color=DARK_GREY)
    _text(c, RM - col_extra_w - 3, table_top - header_h + 2 * mm,
          "AMOUNT", font="Helvetica-Bold", size=8, color=DARK_GREY, align="right")

    # Header separator
    hy = table_top - header_h
    _draw_hline(c, LM, hy, RM, width=0.8, color=TABLE_BORDER)

    # Rows
    ry = hy
    for i, (lbl, desc, amt) in enumerate(rows):
        ry -= row_h
        # alternating light bg
        if i % 2 == 0:
            c.setFillColor(colors.HexColor("#FAFAFA"))
            c.rect(LM + 0.4, ry, CONTENT_W - 0.8, row_h, fill=1, stroke=0)

        is_grand = lbl == "GRAND TOTAL"
        font = "Helvetica-Bold" if is_grand else "Helvetica"
        size = 9 if is_grand else 8.5

        # Left label (only on first item row or grand total)
        if i == 0:
            _text(c, LM + 3, ry + 2 * mm, "FARE BREAKDOWN",
                  font="Helvetica-Bold", size=8, color=DARK_GREY)
        elif is_grand:
            _text(c, LM + 3, ry + 2 * mm, "GRAND TOTAL",
                  font="Helvetica-Bold", size=9, color=DARK_GREY)

        # Description
        _text(c, LM + col_label_w + 3, ry + 2 * mm, desc,
              font=font, size=size, color=DARK_GREY)

        # Amount (right-aligned in amount column)
        amt_x = LM + col_label_w + col_desc_w + col_amount_w - 3
        if amt:
            _text(c, amt_x, ry + 2 * mm, amt,
                  font=font, size=size, color=DARK_GREY, align="right")

        # Row separator
        _draw_hline(c, LM, ry, RM, width=0.3, color=LIGHT_GREY)

    # Vertical column dividers
    c.setStrokeColor(TABLE_BORDER)
    c.setLineWidth(0.5)
    x1 = LM + col_label_w
    x2 = LM + col_label_w + col_desc_w
    c.line(x1, table_top, x1, table_bottom)
    c.line(x2, table_top, x2, table_bottom)

    y = table_bottom - 4 * mm

    # Payment summary below table
    if amount_paid > 0:
        _text(c, RM, y, f"Amount Paid:   {_fmt(amount_paid)}",
              font="Helvetica", size=9, color=MID_GREY, align="right")
        y -= 5 * mm
        bal_color = colors.HexColor("#8B0000") if balance_due > 0 else colors.HexColor("#006400")
        _text(c, RM, y, f"Balance Due:   {_fmt(balance_due)}",
              font="Helvetica-Bold", size=10, color=bal_color, align="right")
        y -= 4 * mm

    return y - 6 * mm


# ── Signature block ───────────────────────────────────────────────────────────
def _draw_signatures(c, y, agency):
    sig_y = y
    mid = LM + CONTENT_W / 2

    # Checked By
    _text(c, LM, sig_y, "CHECKED BY:", font="Helvetica-Bold", size=9)
    c.setLineWidth(0.5)
    c.setDash(3, 2)
    c.line(LM + 28 * mm, sig_y + 1, mid - 5 * mm, sig_y + 1)
    c.setDash()

    # Approved By
    _text(c, mid + 5 * mm, sig_y, "APPROVED BY:", font="Helvetica-Bold", size=9)
    c.setDash(3, 2)
    c.line(mid + 35 * mm, sig_y + 1, RM, sig_y + 1)
    c.setDash()

    sig_y -= 5 * mm

    # Name + bank details (left column)
    signatory_left  = agency.get("signatory_left",  {"name": "NAME : ..............................", "title": ""})
    signatory_right = agency.get("signatory_right", {"name": "NAME : ..............................", "title": ""})

    _text(c, LM, sig_y, signatory_left.get("name", ""), font="Helvetica-Bold", size=8.5)
    _text(c, mid + 5 * mm, sig_y, signatory_right.get("name", ""), font="Helvetica-Bold", size=8.5)
    sig_y -= 4 * mm

    agency_name = agency.get("name", "Travel Agency")
    _text(c, LM, sig_y, agency_name, size=8, color=MID_GREY)
    _text(c, mid + 5 * mm, sig_y, agency_name, size=8, color=MID_GREY)
    sig_y -= 4 * mm

    # Bank accounts
    banks = agency.get("bank_accounts", [])
    left_banks  = banks[::2]   # even indices  → left column
    right_banks = banks[1::2]  # odd indices   → right column

    for i, bk in enumerate(left_banks[:2]):
        _text(c, LM, sig_y - i * 4 * mm, bk.get("bank", ""), size=8, color=DARK_GREY)
    for i, bk in enumerate(right_banks[:2]):
        _text(c, mid + 5 * mm, sig_y - i * 4 * mm, bk.get("bank", ""), size=8, color=DARK_GREY)
    sig_y -= 4 * mm

    for i, bk in enumerate(left_banks[:2]):
        _text(c, LM, sig_y - i * 4 * mm, bk.get("account", ""), size=8, color=DARK_GREY)
    for i, bk in enumerate(right_banks[:2]):
        _text(c, mid + 5 * mm, sig_y - i * 4 * mm, bk.get("account", ""), size=8, color=DARK_GREY)
    sig_y -= 4 * mm

    for i, bk in enumerate(left_banks[:2]):
        _text(c, LM, sig_y - i * 4 * mm, bk.get("label", ""), size=8, color=MID_GREY)
    for i, bk in enumerate(right_banks[:2]):
        _text(c, mid + 5 * mm, sig_y - i * 4 * mm, bk.get("label", ""), size=8, color=MID_GREY)

    return sig_y - 12 * mm


# ── Footer services bar ───────────────────────────────────────────────────────
def _draw_footer(c, agency):
    bar_h = 12 * mm
    bar_y = 10 * mm

    c.setFillColor(colors.HexColor("#EEEEEE"))
    c.setStrokeColor(LIGHT_GREY)
    c.setLineWidth(0.5)
    c.rect(LM, bar_y, CONTENT_W, bar_h, fill=1, stroke=1)

    services = agency.get("services", [
        "AIR TICKETS & RESERVATIONS",
        "VISA ASSISTANCE",
        "HOTEL RESERVATIONS",
        "IMMIGRATION SERVICES",
        "CAR RENTALS",
        "TOUR PACKAGES",
        "TRAVEL INSURANCE",
    ])

    # Lay out in up to 3 columns
    col_count = 3
    col_w = CONTENT_W / col_count
    col_items = [[] for _ in range(col_count)]
    for i, svc in enumerate(services):
        col_items[i % col_count].append(svc)

    for ci, col in enumerate(col_items):
        cx = LM + ci * col_w + 4 * mm
        for ri, svc in enumerate(col):
            cy = bar_y + bar_h - 4 * mm - ri * 4 * mm
            c.setFont("Helvetica", 7)
            c.setFillColor(DARK_GREY)
            c.drawString(cx, cy, f"- {svc}")

