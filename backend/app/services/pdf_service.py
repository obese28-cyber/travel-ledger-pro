"""
services/pdf_service.py — Travel agency invoice PDF generation.

Layout matches the standard agency invoice format:
  - Agency header (logo + name + contacts)
  - TO / DATE / INVOICE NO. / FOR block
  - Large centred INVOICE title
  - Passenger table (NAME | ROUTING | AIRLINE | DEPARTURE | RETURN | CLASS | TICKET# | AMOUNT)
  - TOTAL row
  - Signatory block
  - Services footer
"""

import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


# ── Colour palette ────────────────────────────────────────────────────────────
DARK_RED    = colors.HexColor("#8B0000")
DARK_GREY   = colors.HexColor("#333333")
MID_GREY    = colors.HexColor("#666666")
LIGHT_GREY  = colors.HexColor("#CCCCCC")
BLACK       = colors.HexColor("#000000")
TABLE_HEAD  = colors.HexColor("#222222")
TABLE_FILL  = colors.HexColor("#F7F7F7")

PAGE_W, PAGE_H = A4          # 595.28 x 841.89 pt
LM  = 15 * mm                # left margin
RM  = PAGE_W - 15 * mm       # right margin
CONTENT_W = RM - LM


def _fmt(n):
    try:
        return f"{float(n):,.2f}"
    except (TypeError, ValueError):
        return "—"


def _wrap(text, font, size, max_w):
    """Split `text` into lines that each fit within `max_w` points."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    words = str(text).split()
    lines, current = [], ""
    for word in words:
        test = (current + " " + word).strip()
        if stringWidth(test, font, size) <= max_w:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _date(d):
    if not d:
        return "—"
    if isinstance(d, str):
        try:
            d = datetime.fromisoformat(d.replace("Z", "+00:00"))
        except ValueError:
            return d
    return d.strftime("%d %B %Y") if hasattr(d, "strftime") else str(d)


def _line(c, x1, y1, x2, lw=0.5, color=None, dash=None, y2=None):
    c.setStrokeColor(color or LIGHT_GREY)
    c.setLineWidth(lw)
    if dash:
        c.setDash(*dash)
    c.line(x1, y1, x2, y2 if y2 is not None else y1)
    if dash:
        c.setDash()


def _text(c, x, y, txt, font="Helvetica", size=9, color=None, align="left"):
    c.setFont(font, size)
    c.setFillColor(color or DARK_GREY)
    txt = str(txt)
    if align == "right":
        c.drawRightString(x, y, txt)
    elif align == "center":
        c.drawCentredString(x, y, txt)
    else:
        c.drawString(x, y, txt)


def generate_invoice_pdf(invoice_data: dict, agency: dict | None = None) -> bytes:
    """Return PDF bytes for the given invoice."""
    if agency is None:
        agency = {}
    buf = io.BytesIO()
    cv = canvas.Canvas(buf, pagesize=A4)
    cv.setTitle(f"Invoice {invoice_data.get('invoice_number', '')}")
    _draw_page(cv, invoice_data, agency)
    cv.save()
    buf.seek(0)
    return buf.read()


def _draw_page(cv, inv, agency):
    y = PAGE_H - 10 * mm
    y = _draw_agency_header(cv, y, agency)
    y = _draw_invoice_meta(cv, y, inv, agency)
    y = _draw_invoice_title(cv, y)
    y = _draw_passenger_table(cv, y, inv, agency)
    _draw_signatory(cv, y, agency)
    _draw_footer(cv, agency)


# ── 1. Agency header ──────────────────────────────────────────────────────────
def _draw_agency_header(cv, y, agency):
    logo_w = 42 * mm
    logo_h = 22 * mm
    logo_path = agency.get("logo_path")

    logo_ok = False
    if logo_path:
        try:
            import os
            if os.path.exists(logo_path):
                img = ImageReader(logo_path)
                cv.drawImage(img, LM, y - logo_h, width=logo_w, height=logo_h,
                             preserveAspectRatio=True, mask="auto")
                logo_ok = True
        except Exception:
            pass
    if not logo_ok:
        _placeholder_logo(cv, LM, y - logo_h, logo_w, logo_h)

    info_x = LM + logo_w + 5 * mm
    right_col = LM + CONTENT_W * 0.62  # second column for phones/emails

    # Company name
    name = agency.get("name", "TRAVEL LEDGER PRO")
    _text(cv, info_x, y - 5 * mm, name.upper(),
          font="Helvetica-Bold", size=12, color=DARK_RED)

    # Address lines (compact)
    ay = y - 9.5 * mm
    for line in agency.get("address_lines", ["Your Agency Address", "City, Country"]):
        _text(cv, info_x, ay, line, size=7.5, color=MID_GREY)
        ay -= 3.8 * mm

    # Phones (left sub-column) and emails (right sub-column) on same rows
    phones = agency.get("phones", [])
    emails = agency.get("emails", [])
    max_rows = max(len(phones), len(emails))
    py = ay - 1 * mm
    for i in range(min(max_rows, 3)):
        if i < len(phones):
            _text(cv, info_x, py, phones[i], size=7.5, color=DARK_GREY)
        if i < len(emails):
            _text(cv, right_col, py, emails[i], size=7.5, color=DARK_GREY)
        py -= 3.8 * mm

    # Separator — below the tallest of logo or text content
    content_bottom = py - 1 * mm
    logo_bottom    = y - logo_h - 2 * mm
    bottom = min(content_bottom, logo_bottom)  # whichever is lower
    _line(cv, LM, bottom, RM, lw=1.2, color=BLACK)
    return bottom - 4 * mm


def _placeholder_logo(cv, x, y, w, h):
    cv.setStrokeColor(LIGHT_GREY)
    cv.setFillColor(colors.HexColor("#F0F0F0"))
    cv.setLineWidth(0.5)
    cv.rect(x, y, w, h, fill=1, stroke=1)
    cv.setFillColor(LIGHT_GREY)
    cv.setFont("Helvetica", 7)
    cv.drawCentredString(x + w / 2, y + h / 2 - 3, "AGENCY LOGO")


# ── 2. Invoice meta block (TO / DATE / INVOICE NO / FOR) ─────────────────────
def _draw_invoice_meta(cv, y, inv, agency):
    lh = 6 * mm

    # All three values start at the same x — wide enough for "INVOICE NO.:"
    VAL_X = LM + 34 * mm

    # TO:  [customer name / company]
    to_name = inv.get("customer_name") or "—"
    _text(cv, LM,   y, "TO:",   font="Helvetica-Bold", size=10, color=BLACK)
    _text(cv, VAL_X, y, to_name.upper(), font="Helvetica-Bold", size=10, color=BLACK)
    # Date on the right
    _text(cv, RM, y, _date(inv.get("issue_date")),
          font="Helvetica", size=10, color=DARK_GREY, align="right")
    y -= lh

    # INVOICE NO.:
    inv_num = inv.get("invoice_number") or "—"
    _text(cv, LM,   y, "INVOICE NO.:", font="Helvetica-Bold", size=10, color=BLACK)
    _text(cv, VAL_X, y, inv_num, font="Helvetica-Bold", size=10, color=BLACK)
    y -= lh

    # FOR:
    items = inv.get("items") or []
    service_types = []
    for item in items:
        st = (item.get("service_type") or "").replace("_", " ").upper()
        if st and st not in service_types:
            service_types.append(st)
    for_text = ", ".join(service_types) if service_types else "TRAVEL SERVICES"
    _text(cv, LM,   y, "FOR:", font="Helvetica-Bold", size=10, color=BLACK)
    _text(cv, VAL_X, y, for_text, font="Helvetica-Bold", size=10, color=BLACK)
    y -= lh + 2 * mm

    return y


# ── 3. "INVOICE" title ────────────────────────────────────────────────────────
def _draw_invoice_title(cv, y):
    cx = LM + CONTENT_W / 2
    _text(cv, cx, y, "INVOICE", font="Helvetica-Bold", size=18, color=BLACK, align="center")
    # underline
    tw = cv.stringWidth("INVOICE", "Helvetica-Bold", 18)
    _line(cv, cx - tw / 2, y - 1.5, cx + tw / 2, lw=1.2, color=BLACK)
    return y - 8 * mm


# ── 4. Passenger table ────────────────────────────────────────────────────────
# Columns: #/NAME | ROUTING | AIRLINE | DEPART | RETURN | CLASS | TICKET# | AMOUNT
COL_NAME    = 40 * mm
COL_ROUTING = 22 * mm
COL_AIRLINE = 16 * mm
COL_DEPART  = 18 * mm
COL_RETURN  = 18 * mm
COL_CLASS   = 20 * mm
COL_TICKET  = 28 * mm   # wider — ticket numbers are long
# AMOUNT fills the rest
COL_AMOUNT  = CONTENT_W - COL_NAME - COL_ROUTING - COL_AIRLINE - COL_DEPART - COL_RETURN - COL_CLASS - COL_TICKET

ROW_H  = 7.5 * mm
HEAD_H = 8 * mm


def _col_xs():
    """Return left x-coordinate for each column."""
    xs = [LM]
    for w in [COL_NAME, COL_ROUTING, COL_AIRLINE, COL_DEPART, COL_RETURN, COL_CLASS, COL_TICKET]:
        xs.append(xs[-1] + w)
    return xs  # 8 values; xs[7] is start of AMOUNT col


def _draw_passenger_table(cv, y, inv, agency):
    items    = inv.get("items") or []
    xs       = _col_xs()
    amt_x    = RM
    currency = agency.get("currency", "USD")

    # usable widths per column (minus 4pt padding)
    col_max_w = [
        COL_NAME    - 4,
        COL_ROUTING - 4,
        COL_AIRLINE - 4,
        COL_DEPART  - 4,
        COL_RETURN  - 4,
        COL_CLASS   - 4,
        COL_TICKET  - 4,
        COL_AMOUNT  - 4,
    ]

    LINE_H  = 3.8 * mm   # height per text line inside a row
    PAD_V   = 3.0 * mm   # top + bottom padding per row (total)
    MIN_ROW = 7.5 * mm   # minimum row height

    def row_lines(item, idx):
        """Return the wrapped lines for each column of this item."""
        pax_name = item.get("passenger_name") or item.get("description") or f"Passenger {idx+1}"
        routing  = item.get("routing") or item.get("destination") or "—"
        airline  = item.get("airline_name") or item.get("supplier_name") or "—"
        dep      = _date(item.get("travel_date") or item.get("departure_date") or "")
        ret      = _date(item.get("return_date") or "")
        cls      = item.get("travel_class") or item.get("service_class") or "Economy Class"
        ticket   = item.get("ticket_number") or ""
        price    = float(item.get("selling_price") or item.get("unit_price") or 0)
        qty      = float(item.get("quantity") or 1)
        amount   = price * qty

        return [
            _wrap(f"{idx+1}.  {pax_name.upper()}", "Helvetica-Bold", 8, col_max_w[0]),
            _wrap(routing.upper(),  "Helvetica-Bold", 8, col_max_w[1]),
            _wrap(airline.upper(),  "Helvetica-Bold", 8, col_max_w[2]),
            _wrap(dep if dep != "—" else "", "Helvetica", 7.5, col_max_w[3]),
            _wrap(ret if ret != "—" else "", "Helvetica", 7.5, col_max_w[4]),
            _wrap(cls.title(),      "Helvetica", 7.5, col_max_w[5]),
            _wrap(ticket,           "Helvetica", 7.5, col_max_w[6]),
            [_fmt(amount)],   # currency shown in header — no prefix per row
        ]

    # Pre-compute all rows so we know heights before drawing
    all_row_lines = [row_lines(item, idx) for idx, item in enumerate(items)]
    row_heights   = [
        max(MIN_ROW, max(len(cols) for cols in cols_list) * LINE_H + PAD_V)
        for cols_list in all_row_lines
    ]

    table_top = y

    # ── Header row ────────────────────────────────────────────────────────────
    cv.setFillColor(TABLE_HEAD)
    cv.rect(LM, table_top - HEAD_H, CONTENT_W, HEAD_H, fill=1, stroke=0)

    headers = ["NAME OF PASSENGER", "ROUTING", "AIRLINE",
               "DEPARTURE\nDATE", "RETURN\nDATE", "CLASS", "TICKET #",
               f"AMOUNT\n({currency})"]

    for i, (hdr, xc) in enumerate(zip(headers, xs)):
        lines = hdr.split("\n")
        if len(lines) == 2:
            _text(cv, xc + 2, table_top - 4.5 * mm, lines[0],
                  font="Helvetica-Bold", size=6.5, color=colors.white)
            _text(cv, xc + 2, table_top - 7 * mm, lines[1],
                  font="Helvetica-Bold", size=6.5, color=colors.white)
        else:
            if i == len(headers) - 1:
                _text(cv, amt_x - 2, table_top - 5.5 * mm, hdr,
                      font="Helvetica-Bold", size=6.5, color=colors.white, align="right")
            else:
                _text(cv, xc + 2, table_top - 5.5 * mm, hdr,
                      font="Helvetica-Bold", size=6.5, color=colors.white)

    ry = table_top - HEAD_H

    # ── Item rows ─────────────────────────────────────────────────────────────
    total_amount = 0.0

    for idx, (item, cols_list, rh) in enumerate(zip(items, all_row_lines, row_heights)):
        row_bot = ry - rh

        # alternating fill
        if idx % 2 == 0:
            cv.setFillColor(TABLE_FILL)
            cv.rect(LM, row_bot, CONTENT_W, rh, fill=1, stroke=0)

        # draw each column — vertically centred in the row
        for col_i, (col_lines, xc) in enumerate(zip(cols_list, xs)):
            n_lines   = len(col_lines)
            # Centre the text block: mid of row, offset up by half the block height
            block_h   = n_lines * LINE_H
            first_y   = row_bot + rh / 2 + block_h / 2 - LINE_H * 0.72

            if col_i == 7:  # amount — right-aligned, vertically centred
                cy = row_bot + rh / 2 - LINE_H * 0.3
                _text(cv, amt_x - 2, cy, col_lines[0],
                      font="Helvetica-Bold", size=8.5, color=BLACK, align="right")
            else:
                f   = "Helvetica-Bold" if col_i in (0, 1, 2) else "Helvetica"
                sz  = 8 if col_i in (0, 1, 2) else 7.5
                clr = BLACK if col_i in (0, 1, 2) else DARK_GREY
                ty  = first_y
                for line in col_lines:
                    _text(cv, xc + 2, ty, line, font=f, size=sz, color=clr)
                    ty -= LINE_H

        # accumulate total
        price  = float(item.get("selling_price") or item.get("unit_price") or 0)
        qty    = float(item.get("quantity") or 1)
        total_amount += price * qty

        _line(cv, LM, row_bot, RM, lw=0.3, color=LIGHT_GREY)
        ry = row_bot

    # ── 4 empty spacer rows (lines only, no content) ──────────────────────────
    EMPTY_ROW_H = 7 * mm
    for _ in range(4):
        empty_bot = ry - EMPTY_ROW_H
        _line(cv, LM, empty_bot, RM, lw=0.3, color=LIGHT_GREY)
        ry = empty_bot

    # ── TOTAL row — gap then dark striking bar ────────────────────────────────
    TOTAL_H     = 9 * mm
    total_row_y = ry - TOTAL_H

    # Dark background across full width
    cv.setFillColor(DARK_RED)
    cv.rect(LM, total_row_y, CONTENT_W, TOTAL_H, fill=1, stroke=0)

    inv_total = float(inv.get("total_amount") or total_amount)

    # "TOTAL" label centred in the left-side columns
    mid_label_x = LM + (xs[7] - LM) / 2
    _text(cv, mid_label_x, total_row_y + 3 * mm, "TOTAL",
          font="Helvetica-Bold", size=11, color=colors.white, align="center")

    # Amount right-aligned — large and prominent
    _text(cv, amt_x - 3, total_row_y + 3 * mm,
          _fmt(inv_total),
          font="Helvetica-Bold", size=12, color=colors.white, align="right")

    # outer border of entire table (including total)
    cv.setStrokeColor(DARK_GREY)
    cv.setLineWidth(0.8)
    cv.rect(LM, total_row_y, CONTENT_W, table_top - total_row_y, fill=0, stroke=1)

    # vertical column dividers (data + empty rows, not total)
    cv.setLineWidth(0.4)
    cv.setStrokeColor(colors.HexColor("#BBBBBB"))
    for xc in xs[1:]:
        cv.line(xc, table_top - HEAD_H, xc, total_row_y)

    # header bottom separator
    _line(cv, LM, table_top - HEAD_H, RM, lw=0.8, color=DARK_GREY)

    bottom_y = total_row_y - 5 * mm

    # Payment summary if partially paid
    amount_paid = float(inv.get("amount_paid") or 0)
    balance_due = float(inv.get("balance_due") or max(0, inv_total - amount_paid))
    if amount_paid > 0:
        _text(cv, RM, bottom_y,
              f"Amount Paid:   {_fmt(amount_paid)}",
              size=9, color=MID_GREY, align="right")
        bottom_y -= 5.5 * mm
        bal_color = colors.HexColor("#8B0000") if balance_due > 0.005 else colors.HexColor("#006400")
        _text(cv, RM, bottom_y,
              f"Balance Due:   {_fmt(balance_due)}",
              font="Helvetica-Bold", size=10, color=bal_color, align="right")
        bottom_y -= 4 * mm

    return bottom_y - 4 * mm


# ── 5. Signatory + Banking — fixed near footer ────────────────────────────────
def _draw_signatory(cv, y, agency):
    """
    Draws banking details (left) and signature block (right) at a fixed
    position just above the footer bar, regardless of table length.
    """
    footer_top  = 8 * mm + 11 * mm          # top of footer bar
    block_h     = 32 * mm                   # height of this section
    section_top = footer_top + block_h      # where the section starts

    # ── full-width separator line above the block ─────────────────────────
    _line(cv, LM, section_top, RM, lw=1.0, color=BLACK)

    # ── LEFT — Banking details ────────────────────────────────────────────
    banks = agency.get("bank_accounts", [])
    if banks:
        bx = LM
        by = section_top - 5 * mm

        # "BANKING DETAILS" header with small red accent bar
        cv.setFillColor(DARK_RED)
        cv.rect(bx, by + 1 * mm, 2 * mm, 4 * mm, fill=1, stroke=0)
        _text(cv, bx + 3.5 * mm, by + 1.5 * mm, "BANKING DETAILS",
              font="Helvetica-Bold", size=9, color=BLACK)
        by -= 6 * mm

        col_w   = CONTENT_W * 0.5 / max(len(banks[:2]), 1)
        for bi, bk in enumerate(banks[:2]):
            bkx = LM + bi * col_w
            bky = by
            # bank name
            _text(cv, bkx, bky, bk.get("bank", ""),
                  font="Helvetica-Bold", size=8, color=BLACK)
            bky -= 4.2 * mm
            # account number
            _text(cv, bkx, bky, f"A/C:  {bk.get('account', '')}",
                  size=8, color=DARK_GREY)
            bky -= 4 * mm
            # label (GHS / USD)
            if bk.get("label"):
                _text(cv, bkx, bky, bk.get("label"),
                      font="Helvetica-Bold", size=7.5, color=DARK_RED)

    # ── RIGHT — Signature block ───────────────────────────────────────────
    sig_title = agency.get("signatory_title", "Reservations Manager")
    sig_name  = agency.get("signatory_name", "")

    sig_left  = LM + CONTENT_W * 0.6
    sig_right = RM
    sig_cx    = (sig_left + sig_right) / 2

    # "Authorised Signatory" label
    sig_label_y = section_top - 5 * mm
    _text(cv, sig_cx, sig_label_y, "Authorised Signatory",
          font="Helvetica-Bold", size=8, color=DARK_GREY, align="center")

    # signature space
    sig_line_y = footer_top + 10 * mm
    _line(cv, sig_left + 5 * mm, sig_line_y, sig_right - 5 * mm,
          lw=0.8, color=DARK_GREY, dash=(3, 2))

    # name + title below line
    name_y = sig_line_y - 4.5 * mm
    if sig_name:
        _text(cv, sig_cx, name_y, sig_name,
              font="Helvetica-Bold", size=9, color=BLACK, align="center")
        name_y -= 4.5 * mm
    _text(cv, sig_cx, name_y, sig_title,
          font="Helvetica", size=8.5, color=MID_GREY, align="center")

    # vertical divider between banking and signature
    mid_x = LM + CONTENT_W * 0.55
    cv.setStrokeColor(LIGHT_GREY)
    cv.setLineWidth(0.5)
    cv.line(mid_x, footer_top + 2 * mm, mid_x, section_top - 2 * mm)


# ── 6. Services footer ────────────────────────────────────────────────────────
def _draw_footer(cv, agency):
    bar_h = 11 * mm
    bar_y = 8 * mm

    cv.setFillColor(colors.HexColor("#222222"))
    cv.rect(LM, bar_y, CONTENT_W, bar_h, fill=1, stroke=0)

    services = agency.get("services", [
        "AIR TICKETS & RESERVATIONS",
        "VISA ASSISTANCE",
        "HOTEL RESERVATIONS",
        "IMMIGRATION SERVICES",
        "CAR RENTALS",
        "TOUR PACKAGES",
        "TRAVEL INSURANCE",
    ])

    col_count = 3
    col_w = CONTENT_W / col_count
    for i, svc in enumerate(services[:9]):
        ci = i % col_count
        ri = i // col_count
        cx = LM + ci * col_w + 3 * mm
        cy = bar_y + bar_h - 4 * mm - ri * 3.8 * mm
        cv.setFont("Helvetica", 6.5)
        cv.setFillColor(colors.white)
        cv.drawString(cx, cy, f"✦  {svc}")
