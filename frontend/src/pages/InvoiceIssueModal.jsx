/**
 * InvoiceIssueModal.jsx — Guided 3-step invoice generation and issuance workflow.
 *
 * Two modes:
 *   'generate' — Triggered from BookingDetail. Validates booking fields,
 *                shows a professional invoice preview, then creates + issues
 *                the invoice in one atomic step.
 *   'issue'    — Triggered from InvoiceDetail. Reviews the existing draft,
 *                shows a preview, then issues it.
 *
 * Props:
 *   mode:      'generate' | 'issue'
 *   booking:   booking object        (required when mode='generate')
 *   invoice:   draft invoice object  (required when mode='issue')
 *   onClose:   () => void
 *   onSuccess: (issuedInvoice) => void
 */

import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { invoiceService } from '../services/invoiceService'
import { useToast } from '../components/ui/Toast'
import { ButtonSpinner } from '../components/ui/LoadingSpinner'

/* ─── Formatters ─────────────────────────────────────────────────────────── */

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) => {
  if (!d) return '—'
  const parts = d.split('T')[0].split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const fmtLocal = (d) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/* ─── Validation (generate mode only) ───────────────────────────────────── */

function validateBooking(booking) {
  const errors = []
  const warnings = []
  const items = booking.items ?? []

  if (!booking.customer_id)   errors.push({ field: 'customer',       message: 'Customer is required' })
  if (!booking.service_type)  errors.push({ field: 'service_type',   message: 'Service type is required' })
  if (!booking.payment_status) errors.push({ field: 'payment_status', message: 'Payment status is required' })

  const totalSelling = items.reduce((s, i) => s + (i.selling_price ?? 0) * (i.quantity ?? 1), 0)
  const totalCost    = items.reduce((s, i) => s + (i.vendor_cost   ?? 0) * (i.quantity ?? 1), 0)

  if (items.length === 0) {
    errors.push({ field: 'items', message: 'Booking has no service items' })
  } else {
    if (totalSelling <= 0)
      errors.push({ field: 'selling_price', message: 'Total selling price must be greater than $0' })
    if (totalCost <= 0)
      errors.push({ field: 'vendor_cost', message: 'Total vendor cost must be greater than $0' })

    const noVendor = items.filter((i) => !i.vendor_id).length
    if (noVendor > 0)
      errors.push({ field: 'vendor', message: `${noVendor} item${noVendor > 1 ? 's' : ''} missing a vendor / supplier` })

    const noDesc = items.filter((i) => !i.description?.trim()).length
    if (noDesc > 0)
      errors.push({ field: 'description', message: `${noDesc} item${noDesc > 1 ? 's' : ''} missing a description` })
  }

  if (!booking.travel_date)
    warnings.push('Travel date is not set — consider adding it for accurate records')

  if (totalSelling > 0 && totalSelling < totalCost)
    warnings.push(
      `Selling price (${fmt(totalSelling)}) is less than vendor cost (${fmt(totalCost)}) — this booking will generate a loss`
    )

  return { errors, warnings, totalSelling, totalCost }
}

/* ─── Invoice Preview ────────────────────────────────────────────────────── */

function InvoicePreview({ data }) {
  // Use the fixed issue date passed from the parent (captured once at modal open).
  // This date never auto-updates — it is the permanent date of issue.
  const today = data.issueDate instanceof Date ? data.issueDate : new Date()
  const due   = new Date(today)
  due.setDate(due.getDate() + 30)

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm text-sm">

      {/* Header band */}
      <div className="bg-indigo-600 text-white px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-base tracking-wide">TRAVEL LEDGER PRO</p>
            <p className="text-indigo-200 text-xs mt-0.5">Professional Travel Services</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-xl tracking-wider">INVOICE</p>
            <p className="text-indigo-200 text-xs mt-0.5 font-mono">
              {data.invoiceNumber || 'AUTO-ASSIGNED ON ISSUE'}
            </p>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wide">Bill To</p>
          <p className="font-semibold text-slate-800">{data.customer?.name || '—'}</p>
          {data.customer?.email    && <p className="text-xs text-slate-500">{data.customer.email}</p>}
          {data.customer?.phone    && <p className="text-xs text-slate-500">{data.customer.phone}</p>}
          {data.customer?.passport && (
            <p className="text-xs text-slate-400 font-mono">Passport: {data.customer.passport}</p>
          )}
        </div>
        <div className="text-right space-y-1.5">
          <div className="text-xs">
            <span className="text-slate-400">Invoice Date: </span>
            <span className="font-medium text-slate-700">{fmtLocal(today)}</span>
          </div>
          <div className="text-xs">
            <span className="text-slate-400">Due Date: </span>
            <span className="font-medium text-slate-700">{fmtLocal(due)}</span>
          </div>
          {data.bookingRef && (
            <div className="text-xs">
              <span className="text-slate-400">Booking Ref: </span>
              <span className="font-mono font-semibold text-indigo-600">{data.bookingRef}</span>
            </div>
          )}
          {data.travelDate && (
            <div className="text-xs">
              <span className="text-slate-400">Travel Date: </span>
              <span className="font-medium text-slate-700">{fmtDate(data.travelDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items table */}
      <div className="px-6 pt-4 pb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="pb-2 text-left text-slate-500 font-semibold">Description</th>
              <th className="pb-2 text-left text-slate-500 font-semibold">Supplier</th>
              <th className="pb-2 text-center text-slate-500 font-semibold w-10">Qty</th>
              <th className="pb-2 text-right text-slate-500 font-semibold">Unit Price</th>
              <th className="pb-2 text-right text-slate-500 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.items.map((item, i) => {
              const qty       = item.quantity ?? 1
              const unitPrice = item.selling_price ?? item.unit_price ?? 0
              return (
                <tr key={i} className="text-slate-700">
                  <td className="py-2.5 pr-3">{item.description || `Service ${i + 1}`}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{item.vendor_name || item.supplier_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-center text-slate-600">{qty}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-600">{fmt(unitPrice)}</td>
                  <td className="py-2.5 text-right font-semibold">{fmt(unitPrice * qty)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-6 pb-4 flex justify-end">
        <div className="w-52 space-y-1 border-t-2 border-slate-200 pt-2.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-700">{fmt(data.total)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-1.5 mt-1">
            <span className="text-slate-900">TOTAL DUE</span>
            <span className="text-indigo-700">{fmt(data.total)}</span>
          </div>
        </div>
      </div>

      {/* Internal profit strip — not shown to customer */}
      <div className="mx-6 mb-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-4 py-2.5">
        <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">
          Internal Summary — Not shown to customer
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <div>
            <span className="text-slate-400">Supplier Cost: </span>
            <span className="font-semibold text-slate-600">{fmt(data.supplierCost)}</span>
          </div>
          <div>
            <span className="text-slate-400">Gross Profit: </span>
            <span className={`font-semibold ${data.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {fmt(data.grossProfit)}
            </span>
          </div>
          {data.total > 0 && (
            <div>
              <span className="text-slate-400">Margin: </span>
              <span className={`font-semibold ${data.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {((data.grossProfit / data.total) * 100).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Step Indicator ─────────────────────────────────────────────────────── */

function StepIndicator({ step, labels }) {
  return (
    <div className="px-6 py-3 border-b border-slate-50 flex items-center gap-2">
      {labels.map((label, i) => {
        const stepNum    = i + 1
        const isActive   = step === stepNum
        const isComplete = step > stepNum
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
              >
                {isComplete ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : stepNum}
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive ? 'text-indigo-700' : isComplete ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && <div className="flex-1 h-px bg-slate-100 mx-1" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ─── Main Modal ─────────────────────────────────────────────────────────── */

export default function InvoiceIssueModal({ mode = 'issue', booking, invoice, onClose, onSuccess }) {
  const toast = useToast()

  const [step,       setStep]       = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [result,     setResult]     = useState(null)

  // Capture the issue date ONCE when the modal opens — never auto-update.
  // For 'generate' mode: today is the issue date (new invoice will be issued now).
  // For 'issue' mode:    use the stored draft date if present, else today.
  const [modalIssueDate] = useState(() => {
    if (mode === 'issue' && invoice?.issue_date) {
      const parts = invoice.issue_date.split('T')[0].split('-').map(Number)
      return new Date(parts[0], parts[1] - 1, parts[2])
    }
    return new Date()
  })

  const isGenerate = mode === 'generate'

  /* ── Derived totals ──────────────────────────────────────────────────── */
  const bookingItems   = booking?.items ?? []
  const totalSelling   = bookingItems.reduce((s, i) => s + (i.selling_price ?? 0) * (i.quantity ?? 1), 0)
  const totalCost      = bookingItems.reduce((s, i) => s + (i.vendor_cost   ?? 0) * (i.quantity ?? 1), 0)
  const validation     = isGenerate ? validateBooking(booking) : { errors: [], warnings: [] }
  const canProceed     = validation.errors.length === 0

  const invItems       = invoice?.items ?? []
  const invTotal       = invoice?.total_amount ?? 0
  const invCost        = invoice?.total_supplier_cost
    ?? invItems.reduce((s, i) => s + (i.supplier_cost ?? 0) * (i.quantity ?? 1), 0)
  const invProfit      = invTotal - invCost

  /* ── Preview data ────────────────────────────────────────────────────── */
  const previewData = isGenerate
    ? {
        customer:     { name: booking.customer_name, email: booking.customer_email, phone: booking.customer_phone },
        items:        bookingItems,
        total:        totalSelling,
        supplierCost: totalCost,
        grossProfit:  totalSelling - totalCost,
        bookingRef:   booking.booking_ref,
        travelDate:   booking.travel_date,
        invoiceNumber: null,
        issueDate:    modalIssueDate,
      }
    : {
        customer:     { name: invoice.customer_name, email: invoice.customer_email, phone: invoice.customer_phone },
        items:        invItems.map((i) => ({
          description:   i.description,
          vendor_name:   i.supplier_name,
          quantity:      i.quantity,
          selling_price: i.unit_price,
        })),
        total:        invTotal,
        supplierCost: invCost,
        grossProfit:  invProfit,
        bookingRef:   invoice.booking_ref,
        travelDate:   null,
        invoiceNumber: invoice.invoice_number,
        issueDate:    modalIssueDate,
      }

  /* ── Submit ──────────────────────────────────────────────────────────── */
  async function handleSubmit() {
    setSubmitting(true)
    try {
      let issued
      if (isGenerate) {
        const created = await invoiceService.createFromBooking(booking.id, {})
        issued = await invoiceService.issue(created.id)
      } else {
        issued = await invoiceService.issue(invoice.id)
      }
      setResult(issued)
      setStep(3)
      onSuccess?.(issued)
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to issue invoice.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Step labels ─────────────────────────────────────────────────────── */
  const stepLabels = isGenerate
    ? ['Validate', 'Preview', 'Issued']
    : ['Review', 'Preview', 'Issued']

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isGenerate ? 'Generate & Issue Invoice' : 'Issue Invoice'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isGenerate ? `Booking ${booking?.booking_ref}` : `Draft ${invoice?.invoice_number}`}
            </p>
          </div>
          {step < 3 && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Step indicator */}
        {step < 3 && <StepIndicator step={step} labels={stepLabels} />}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Validate / Review ─────────────────────────── */}
          {step === 1 && (
            <div className="p-6 space-y-5">

              {isGenerate ? (
                <>
                  {/* Field summary grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        label: 'Customer',
                        value: booking.customer_name,
                        missing: !booking.customer_id,
                      },
                      {
                        label: 'Service Type',
                        value: booking.service_type?.replace(/_/g, ' '),
                        missing: !booking.service_type,
                      },
                      {
                        label: 'Selling Price (Total)',
                        value: totalSelling > 0 ? fmt(totalSelling) : null,
                        missing: totalSelling <= 0,
                        missingText: '$0.00 — must be > $0',
                      },
                      {
                        label: 'Vendor Cost (Total)',
                        value: totalCost > 0 ? fmt(totalCost) : null,
                        missing: totalCost <= 0,
                        missingText: '$0.00 — must be > $0',
                        valueClass: 'text-slate-500',
                      },
                      {
                        label: 'Travel Date',
                        value: booking.travel_date ? fmtDate(booking.travel_date) : null,
                        warn: !booking.travel_date,
                        warnText: 'Not set',
                      },
                      {
                        label: 'Payment Status',
                        value: booking.payment_status?.replace(/_/g, ' '),
                        missing: !booking.payment_status,
                      },
                    ].map(({ label, value, missing, missingText, warn, warnText, valueClass }) => (
                      <div
                        key={label}
                        className={`rounded-lg px-4 py-3 border ${
                          missing
                            ? 'bg-red-50 border-red-200'
                            : warn
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-50 border-slate-100'
                        }`}
                      >
                        <p className="text-xs text-slate-400 mb-1">{label}</p>
                        <p
                          className={`text-sm font-medium ${
                            missing
                              ? 'text-red-600'
                              : warn
                              ? 'text-amber-600'
                              : valueClass || 'text-slate-800'
                          }`}
                        >
                          {missing
                            ? (missingText || 'Missing ✗')
                            : warn
                            ? (warnText || '—')
                            : (value || '—')}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Items checklist */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Service Items ({bookingItems.length})
                    </p>
                    {bookingItems.length === 0 ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                        No service items found on this booking.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {bookingItems.map((item, i) => {
                          const hasVendor = Boolean(item.vendor_id)
                          const hasDesc   = Boolean(item.description?.trim())
                          const hasPrice  = (item.selling_price ?? 0) > 0
                          const itemOk    = hasVendor && hasDesc && hasPrice
                          return (
                            <div
                              key={i}
                              className={`flex items-start justify-between px-4 py-2.5 ${itemOk ? 'bg-white' : 'bg-red-50'}`}
                            >
                              <div className="min-w-0">
                                <p className={`text-xs font-medium truncate ${hasDesc ? 'text-slate-700' : 'text-red-600'}`}>
                                  {item.description || '(No description) ✗'}
                                </p>
                                <p className={`text-xs mt-0.5 ${hasVendor ? 'text-slate-400' : 'text-red-500 font-medium'}`}>
                                  {hasVendor ? item.vendor_name : '⚠ No vendor assigned'}
                                </p>
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                <p className={`text-xs font-semibold ${hasPrice ? 'text-slate-800' : 'text-red-600'}`}>
                                  {fmt(item.selling_price)}
                                </p>
                                <p className="text-xs text-slate-400">Cost: {fmt(item.vendor_cost)}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Errors */}
                  {validation.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-300 rounded-xl p-4">
                      <p className="text-sm font-semibold text-red-700 mb-2">
                        {validation.errors.length} issue{validation.errors.length > 1 ? 's' : ''} must be fixed first:
                      </p>
                      <ul className="space-y-1.5">
                        {validation.errors.map((e, i) => (
                          <li key={i} className="text-xs text-red-600 flex items-start gap-2">
                            <span className="shrink-0 mt-0.5 font-bold">✗</span>
                            {e.message}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-red-400 mt-3 border-t border-red-200 pt-2">
                        Return to the booking and fix these issues, then come back to generate the invoice.
                      </p>
                    </div>
                  )}

                  {/* Warnings */}
                  {validation.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-amber-700 mb-2">
                        Warnings — you may still proceed:
                      </p>
                      <ul className="space-y-1.5">
                        {validation.warnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-700 flex items-start gap-2">
                            <span className="shrink-0 mt-0.5">⚠</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* All good */}
                  {validation.errors.length === 0 && validation.warnings.length === 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                      <svg
                        className="w-5 h-5 text-emerald-500 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-emerald-700 font-medium">
                        All required fields are present. Ready to preview.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                /* ── Issue mode: Review existing draft ──────────────── */
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                      <p className="text-xs text-slate-400 mb-1">Invoice Number</p>
                      <p className="font-mono font-semibold text-indigo-600">{invoice.invoice_number}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                      <p className="text-xs text-slate-400 mb-1">Customer</p>
                      <p className="text-sm font-medium text-slate-800">{invoice.customer_name || '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg border border-slate-100 px-4 py-3">
                      <p className="text-xs text-slate-400 mb-1">Invoice Total</p>
                      <p className="text-sm font-semibold text-slate-800">{fmt(invTotal)}</p>
                    </div>
                    <div className={`rounded-lg border px-4 py-3 ${invProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                      <p className="text-xs text-slate-400 mb-1">Gross Profit</p>
                      <p className={`text-sm font-semibold ${invProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {fmt(invProfit)}
                      </p>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-indigo-800 mb-2">
                      What happens when you issue this invoice?
                    </p>
                    <ul className="space-y-1.5 text-xs text-indigo-700">
                      {[
                        `Revenue of ${fmt(invTotal)} is recognised in the accounting ledger`,
                        `Customer receivable created — balance due: ${fmt(invTotal)}`,
                        'Supplier invoices auto-created for each service item',
                        'Invoice status changes from Draft → Issued',
                        'This action cannot be undone',
                      ].map((line, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="shrink-0 mt-0.5 text-indigo-400">→</span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Professional Invoice Preview ──────────── */}
          {step === 2 && (
            <div className="p-6">
              <p className="text-xs text-slate-400 mb-4 text-center">
                Review the invoice below. This is exactly what will be recorded once you confirm.
              </p>
              <InvoicePreview data={previewData} />
            </div>
          )}

          {/* ── Step 3: Success ────────────────────────────────── */}
          {step === 3 && result && (
            <div className="p-10 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg
                  className="w-8 h-8 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div>
                <p className="text-xl font-bold text-slate-900">Invoice Issued Successfully</p>
                <p className="font-mono text-base font-semibold text-indigo-600 mt-1">{result.invoice_number}</p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left space-y-2 max-w-xs mx-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium text-slate-800">{result.customer_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="font-semibold text-slate-800">{fmt(result.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                  <span className="text-slate-500">Balance Due</span>
                  <span className="font-bold text-red-600">{fmt(result.balance_due)}</span>
                </div>
              </div>

              {(result.supplier_bills_created ?? []).length > 0 && (
                <p className="text-xs text-slate-400">
                  {result.supplier_bills_created.length} supplier invoice
                  {result.supplier_bills_created.length > 1 ? 's' : ''} auto-created:{' '}
                  {result.supplier_bills_created.join(', ')}
                </p>
              )}

              <div className="flex gap-3 justify-center pt-2">
                <Link
                  to={`/invoices/${result.id}`}
                  onClick={onClose}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  View Invoice →
                </Link>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 3 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
            <button
              onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
              className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
              disabled={submitting}
            >
              {step === 1 ? 'Cancel' : '← Back'}
            </button>

            <div className="flex items-center gap-3">
              {step === 1 && (
                <button
                  onClick={() => setStep(2)}
                  disabled={!canProceed}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                             disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl
                             transition-colors shadow-sm"
                >
                  Preview Invoice →
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700
                             text-white text-sm font-semibold rounded-xl transition-colors shadow-sm
                             disabled:opacity-50"
                >
                  {submitting && <ButtonSpinner />}
                  {submitting ? 'Issuing…' : '✓ Confirm & Issue Invoice'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
