$ErrorActionPreference = "Stop"

$repo = "C:\Users\HomePC\travel-ledger-pro-v2"
$bookingPath = Join-Path $repo "frontend\src\pages\Bookings.jsx"
$customerPath = Join-Path $repo "frontend\src\pages\Customers.jsx"
$invoiceUtilPath = Join-Path $repo "frontend\src\utils\downloadInvoiceV3.js"

if (!(Test-Path $bookingPath)) { throw "Bookings.jsx not found at $bookingPath" }
if (!(Test-Path $customerPath)) { throw "Customers.jsx not found at $customerPath" }
if (!(Test-Path $invoiceUtilPath)) { throw "downloadInvoiceV3.js not found at $invoiceUtilPath" }

# Make the page print handler keep V5 as V5, but pass all linked bookings into it.
function Patch-PrintHandler($path, $customerMode) {
  $text = Get-Content -Raw -Path $path

  $oldBookingHandler = @'
  const printSelectedInvoice = (printer) => {
    const { inv, customer, booking } = invoiceSelector;
    const linkedBookings = getBookingsForInvoice(inv, booking);
    if (inv?.is_group_invoice || linkedBookings.length > 1) {
      downloadGroupInvoiceV3(linkedBookings.map(b => ({ booking: b, invoice: inv, customer })));
    } else {
      printer(inv, customer, booking);
    }
    setInvoiceSelector(null);
  };
'@

  $newBookingHandler = @'
  const printSelectedInvoice = (printer) => {
    const { inv, customer, booking } = invoiceSelector;
    const linkedBookings = getBookingsForInvoice(inv, booking);
    if (inv?.is_group_invoice || linkedBookings.length > 1) {
      if (printer === downloadInvoiceV5) {
        printer(inv, customer, { ...(linkedBookings[0] || booking || {}), group_bookings: linkedBookings });
      } else {
        downloadGroupInvoiceV3(linkedBookings.map(b => ({ booking: b, invoice: inv, customer })));
      }
    } else {
      printer(inv, customer, booking);
    }
    setInvoiceSelector(null);
  };
'@

  $oldCustomerHandler = @'
  const printSelectedInvoice = (printer) => {
    const { inv, customer, booking } = invoiceSelector;
    const linkedBookings = getBookingsForInvoice(inv);
    if (inv?.is_group_invoice || linkedBookings.length > 1) {
      downloadGroupInvoiceV3((linkedBookings.length ? linkedBookings : [booking]).filter(Boolean).map(b => ({ booking: b, invoice: inv, customer })));
    } else {
      printer(inv, customer, booking);
    }
    setInvoiceSelector(null);
  };
'@

  $newCustomerHandler = @'
  const printSelectedInvoice = (printer) => {
    const { inv, customer, booking } = invoiceSelector;
    const linkedBookings = getBookingsForInvoice(inv);
    const groupBookings = (linkedBookings.length ? linkedBookings : [booking]).filter(Boolean);
    if (inv?.is_group_invoice || groupBookings.length > 1) {
      if (printer === downloadInvoiceV5) {
        printer(inv, customer, { ...(groupBookings[0] || booking || {}), group_bookings: groupBookings });
      } else {
        downloadGroupInvoiceV3(groupBookings.map(b => ({ booking: b, invoice: inv, customer })));
      }
    } else {
      printer(inv, customer, booking);
    }
    setInvoiceSelector(null);
  };
'@

  if ($customerMode) {
    if ($text.Contains($oldCustomerHandler)) {
      $text = $text.Replace($oldCustomerHandler, $newCustomerHandler)
    } elseif ($text -notmatch 'group_bookings: groupBookings') {
      throw "Customer print handler shape not recognized."
    }
  } else {
    if ($text.Contains($oldBookingHandler)) {
      $text = $text.Replace($oldBookingHandler, $newBookingHandler)
    } elseif ($text -notmatch 'group_bookings: linkedBookings') {
      throw "Booking print handler shape not recognized."
    }
  }

  Set-Content -Path $path -Value $text -Encoding UTF8
}

Patch-PrintHandler $bookingPath $false
Patch-PrintHandler $customerPath $true

# Upgrade V5 so it can print either extra_passengers OR linked group booking rows.
$text = Get-Content -Raw -Path $invoiceUtilPath

$oldBlock = @'
  const baseFare = _parseNum(booking.base_fare) + _parseNum(booking.markup);
  const taxes    = _parseNum(booking.tax) || 0;
  const svc      = _parseNum(booking.fees) || 0;
  const reclaim  = _parseNum(booking.reclaim) || 0;
  const vat      = _parseNum(booking.vat) || 0;
  const perPax   = baseFare + taxes + svc + reclaim + vat;

  let extraPax = [];
  if (booking.extra_passengers) {
    try {
      const p = JSON.parse(booking.extra_passengers);
      extraPax = p.filter(x => x && x.name);
    } catch {
      extraPax = String(booking.extra_passengers).split(",")
        .map(n => ({ name: n.trim(), ticket: "" })).filter(p => p.name);
    }
  }

  const allPax     = [{ name: passengerName, ticket: ticketNumber }, ...extraPax];
  const paxCount   = allPax.length;
  const grandTotal = perPax * paxCount;
'@

$newBlock = @'
  const baseFare = _parseNum(booking.base_fare) + _parseNum(booking.markup);
  const taxes    = _parseNum(booking.tax) || 0;
  const svc      = _parseNum(booking.fees) || 0;
  const reclaim  = _parseNum(booking.reclaim) || 0;
  const vat      = _parseNum(booking.vat) || 0;
  const perPax   = baseFare + taxes + svc + reclaim + vat;

  const linkedBookings = Array.isArray(booking.group_bookings)
    ? booking.group_bookings.filter(Boolean)
    : [];

  let passengerRows = linkedBookings.length > 1
    ? linkedBookings.map(b => {
        const rowBase = _parseNum(b.base_fare) + _parseNum(b.markup);
        const rowTaxes = _parseNum(b.tax) || 0;
        const rowSvc = _parseNum(b.fees) || 0;
        const rowReclaim = _parseNum(b.reclaim) || 0;
        const rowVat = _parseNum(b.vat) || 0;
        return {
          name: b.passenger_name || "",
          ticket: b.ticket_number || "",
          destination: b.routing || b.destination || destination,
          baseFare: rowBase,
          taxes: rowTaxes,
          svc: rowSvc,
          reclaim: rowReclaim,
          vat: rowVat,
          total: rowBase + rowTaxes + rowSvc + rowReclaim + rowVat,
        };
      })
    : [];

  if (!passengerRows.length) {
    let extraPax = [];
    if (booking.extra_passengers) {
      try {
        const p = JSON.parse(booking.extra_passengers);
        extraPax = p.filter(x => x && x.name);
      } catch {
        extraPax = String(booking.extra_passengers).split(",")
          .map(n => ({ name: n.trim(), ticket: "" })).filter(p => p.name);
      }
    }
    passengerRows = [{ name: passengerName, ticket: ticketNumber }, ...extraPax].map(pax => ({
      name: pax.name || "",
      ticket: pax.ticket || "",
      destination,
      baseFare,
      taxes,
      svc,
      reclaim,
      vat,
      total: perPax,
    }));
  }

  const paxCount   = passengerRows.length;
  const grandTotal = _parseNum(inv.invoice_total) || passengerRows.reduce((sum, pax) => sum + _parseNum(pax.total), 0);
'@

if ($text.Contains($oldBlock)) {
  $text = $text.Replace($oldBlock, $newBlock)
} elseif ($text -notmatch 'const linkedBookings = Array\.isArray\(booking\.group_bookings\)') {
  throw "V5 fare/passenger block not found."
}

$oldRows = @'
  const paxRows = allPax.map((pax, i) => `
    <tr>
      <td class="tc num">${i + 1}</td>
      <td class="tl pname">${_safe(pax.name || "")}</td>
      <td class="tc tkt">${_safe(pax.ticket || "")}</td>
      <td class="tc">${_safe(destination)}</td>
      <td class="tr num">${_fmt(baseFare)}</td>
      <td class="tr num">${_fmt(taxes)}</td>
      <td class="tr num">${_fmt(svc)}</td>
      <td class="tr num">${_fmt(reclaim)}</td>
      <td class="tr num">${_fmt(vat)}</td>
      <td class="tr rowtotal">${_fmt(perPax)}</td>
    </tr>`).join("");
'@

$newRows = @'
  const paxRows = passengerRows.map((pax, i) => `
    <tr>
      <td class="tc num">${i + 1}</td>
      <td class="tl pname">${_safe(pax.name || "")}</td>
      <td class="tc tkt">${_safe(pax.ticket || "")}</td>
      <td class="tc">${_safe(pax.destination || destination)}</td>
      <td class="tr num">${_fmt(pax.baseFare)}</td>
      <td class="tr num">${_fmt(pax.taxes)}</td>
      <td class="tr num">${_fmt(pax.svc)}</td>
      <td class="tr num">${_fmt(pax.reclaim)}</td>
      <td class="tr num">${_fmt(pax.vat)}</td>
      <td class="tr rowtotal">${_fmt(pax.total)}</td>
    </tr>`).join("");
'@

if ($text.Contains($oldRows)) {
  $text = $text.Replace($oldRows, $newRows)
} elseif ($text -notmatch 'const paxRows = passengerRows\.map') {
  throw "V5 passenger row block not found."
}

Set-Content -Path $invoiceUtilPath -Value $text -Encoding UTF8

Push-Location $repo
try {
  git diff -- frontend/src/pages/Bookings.jsx frontend/src/pages/Customers.jsx frontend/src/utils/downloadInvoiceV3.js
  Write-Host ""
  Write-Host "Done. V5 now prints linked group passengers as separate names/tickets." -ForegroundColor Green
} finally {
  Pop-Location
}
