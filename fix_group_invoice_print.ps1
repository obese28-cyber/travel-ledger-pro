$ErrorActionPreference = "Stop"

$repo = "C:\Users\HomePC\travel-ledger-pro-v2"
$bookingPath = Join-Path $repo "frontend\src\pages\Bookings.jsx"
$customerPath = Join-Path $repo "frontend\src\pages\Customers.jsx"

if (!(Test-Path $bookingPath)) { throw "Bookings.jsx not found at $bookingPath" }
if (!(Test-Path $customerPath)) { throw "Customers.jsx not found at $customerPath" }

# Patch Bookings page print buttons so a group invoice prints all linked bookings.
$text = Get-Content -Raw -Path $bookingPath
if ($text -notmatch 'const printSelectedInvoice = \(printer\) =>') {
  $needle = @'
  const getBookingInvoiceTotal = (booking) => {
    const inv = getInvoiceForBooking(booking.booking_id);
    return inv?.invoice_total ?? booking.total_amount ?? 0;
  };
'@
  $insert = @'
  const getBookingInvoiceTotal = (booking) => {
    const inv = getInvoiceForBooking(booking.booking_id);
    return inv?.invoice_total ?? booking.total_amount ?? 0;
  };

  const groupBookingIdsForInvoice = (inv) => String(inv?.group_booking_ids || inv?.booking_id || "")
    .split(",")
    .map(v => parseInt(v, 10))
    .filter(Boolean);

  const getBookingsForInvoice = (inv, fallbackBooking) => {
    const ids = groupBookingIdsForInvoice(inv);
    const linked = bookings.filter(b => ids.includes(b.booking_id));
    return linked.length ? linked : (fallbackBooking ? [fallbackBooking] : []);
  };

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
  if (!$text.Contains($needle)) { throw "Could not find Bookings.jsx insertion point." }
  $text = $text.Replace($needle, $insert)
}
$text = $text.Replace('onClick={() => { downloadInvoice(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoice)}')
$text = $text.Replace('onClick={() => { downloadInvoice2(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoice2)}')
$text = $text.Replace('onClick={() => { downloadInvoiceV3(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoiceV3)}')
$text = $text.Replace('onClick={() => { downloadInvoiceV4(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoiceV4)}')
$text = $text.Replace('onClick={() => { downloadInvoiceV5(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoiceV5)}')
Set-Content -Path $bookingPath -Value $text -Encoding UTF8

# Patch Customers page the same way.
$text = Get-Content -Raw -Path $customerPath
$text = $text.Replace('import { downloadInvoiceV3, downloadInvoiceV4, downloadInvoiceV5 } from "../utils/downloadInvoiceV3";','import { downloadInvoiceV3, downloadGroupInvoiceV3, downloadInvoiceV4, downloadInvoiceV5 } from "../utils/downloadInvoiceV3";')

if ($text -notmatch 'const printSelectedInvoice = \(printer\) =>') {
  $needle = '  const getBookingForInvoice = (inv) => bookings.find(b => b.booking_id === inv.booking_id);'
  $insert = @'
  const splitInvoiceList = (value) => String(value || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const getInvoiceBookingIds = (inv) => splitInvoiceList(inv?.group_booking_ids)
    .map(v => parseInt(v, 10))
    .filter(Boolean);

  const getBookingsForInvoice = (inv) => {
    const ids = getInvoiceBookingIds(inv);
    let linked = ids.length ? bookings.filter(b => ids.includes(b.booking_id)) : [];
    if (!linked.length && inv?.ticket_number) {
      const tickets = splitInvoiceList(inv.ticket_number);
      linked = bookings.filter(b => tickets.includes(String(b.ticket_number || "")));
    }
    if (!linked.length && inv?.booking_id) {
      linked = bookings.filter(b => b.booking_id === inv.booking_id);
    }
    return linked;
  };

  const getBookingForInvoice = (inv) => getBookingsForInvoice(inv)[0];

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
  if (!$text.Contains($needle)) { throw "Could not find Customers.jsx insertion point." }
  $text = $text.Replace($needle, $insert)
}
$text = $text.Replace('onClick={() => { downloadInvoice(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoice)}')
$text = $text.Replace('onClick={() => { downloadInvoice2(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoice2)}')
$text = $text.Replace('onClick={() => { downloadInvoiceV3(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoiceV3)}')
$text = $text.Replace('onClick={() => { downloadInvoiceV4(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoiceV4)}')
$text = $text.Replace('onClick={() => { downloadInvoiceV5(invoiceSelector.inv, invoiceSelector.customer, invoiceSelector.booking); setInvoiceSelector(null); }}','onClick={() => printSelectedInvoice(downloadInvoiceV5)}')
Set-Content -Path $customerPath -Value $text -Encoding UTF8

Push-Location $repo
try {
  git diff -- frontend/src/pages/Bookings.jsx frontend/src/pages/Customers.jsx
  Write-Host ""
  Write-Host "Done. Group invoice print buttons now route to the group invoice printer." -ForegroundColor Green
  Write-Host "Next: run npm build, commit, push, then pull/build on the server." -ForegroundColor Yellow
} finally {
  Pop-Location
}
