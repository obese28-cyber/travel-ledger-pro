/**
 * pages/InvoiceDetail.jsx -- Invoice view with supplier cost + markup breakdown.
 *
 * Each line item shows:
 *   - Description
 *   - Supplier name (linked)
 *   - Supplier Cost  (internal — always visible to staff)
 *   - Markup         (shown/hidden on customer invoice based on show_markup flag)
 *   - Selling Price
 *   - Amount
 *
 * Route: /invoices/:id
 */

import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { invoiceService }   from '../services/invoiceService'
import { useToast }         from '../components/ui/Toast'
import Badge                from '../components/ui/Badge'
import { PageSpinner, ButtonSpinner } from '../components/ui/LoadingSpinner'
import InvoiceIssueModal    from './InvoiceIssueModal'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n ?? 0)

// Parse date strings as LOCAL time (not UTC) to prevent timezone day-shift.
// "2026-05-17" must always display as May 17, never May 16 due to UTC offset.
const fmtDate = (d) => {
  if (!d) return '—'
  const parts = String(d).split('T')[0].split('-').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return '—'
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Row({ label, value, bold = false, color = '' }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-slate-50 last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm ${color || (bold ? 'text-slate-900' : 'text-slate-700')}`}>{value}</span>
    </div>
  )
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const toast  = useToast()

  const [invoice,        setInvoice]        = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [showIssueModal, setShowIssueModal] = useState(false)

  const load = () => {
    invoiceService.get(id)
      .then(setInvoice)
      .catch(() => toast.error('Could not load invoice.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  function handleIssueSuccess(updatedInvoice) {
    setInvoice(updatedInvoice)
    setShowIssueModal(false)
  }

  function handleDownloadPdf() {
    // Open PDF directly in a new tab using token as query param.
    // This avoids IDM / download-manager extensions intercepting XHR blob requests.
    const token   = localStorage.getItem('tlp_token') || ''
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
    const url     = `${baseURL}/invoices/${id}/pdf?token=${encodeURIComponent(token)}`
    window.open(url, '_blank')
  }

  if (loading) return <PageSpinner />
  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Invoice not found.</p>
        <Link to="/invoices" className="text-indigo-600 text-sm mt-2 inline-block">← Back to Invoices</Link>
      </div>
    )
  }

  const isDraft    = invoice.status === 'draft'
  const isIssued   = ['issued', 'partially_paid', 'overdue'].includes(invoice.status)
  const isPaid     = invoice.status === 'paid'
  const balanceDue = invoice.balance_due ?? 0
  const items      = invoice.items ?? []

  // Totals
  const totalCost   = invoice.total_supplier_cost ?? items.reduce((s, i) => s + (i.supplier_cost ?? 0) * (i.quantity ?? 1), 0)
  const totalMarkup = invoice.total_markup        ?? items.reduce((s, i) => s + (i.markup_amount ?? 0) * (i.quantity ?? 1), 0)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/invoices" className="hover:text-indigo-600 transition-colors">Invoices</Link>
        <span>/</span>
        <span className="text-slate-700 font-mono font-medium">{invoice.invoice_number}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Invoice card ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Invoice</p>
                <p className="font-mono text-2xl font-bold text-slate-900">{invoice.invoice_number}</p>
                <p className="text-sm text-slate-500 mt-1">
                  Issued: {fmtDate(invoice.issue_date)} · Due: {fmtDate(invoice.due_date)}
                </p>
              </div>
              <Badge label={invoice.status} />
            </div>

            {/* Customer & Booking */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4 border-t border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-400 mb-1">Bill To</p>
                <p className="font-semibold text-slate-800">{invoice.customer_name}</p>
                {invoice.customer_email && <p className="text-sm text-slate-500">{invoice.customer_email}</p>}
                {invoice.customer_phone && <p className="text-sm text-slate-500">{invoice.customer_phone}</p>}
              </div>
              {invoice.booking_ref && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Booking Reference</p>
                  <Link to={`/bookings/${invoice.booking_id}`}
                    className="font-mono text-sm font-semibold text-indigo-600 hover:underline">
                    {invoice.booking_ref}
                  </Link>
                </div>
              )}
            </div>

            {/* ── Line Items ───────────────────────────────── */}
            {items.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Services
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-2 text-left text-xs text-slate-400 font-medium">Description</th>
                        <th className="pb-2 text-left text-xs text-slate-400 font-medium">Supplier</th>
                        <th className="pb-2 text-right text-xs text-slate-400 font-medium">Cost</th>
                        <th className="pb-2 text-right text-xs text-slate-400 font-medium">Markup</th>
                        <th className="pb-2 text-right text-xs text-slate-400 font-medium">Qty</th>
                        <th className="pb-2 text-right text-xs text-slate-400 font-medium">Unit Price</th>
                        <th className="pb-2 text-right text-xs text-slate-400 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {items.map((item, i) => {
                        const qty       = item.quantity ?? 1
                        const unitPrice = item.unit_price ?? 0
                        const cost      = item.supplier_cost ?? 0
                        const markup    = item.markup_amount ?? 0
                        return (
                          <tr key={i} className="text-slate-700">
                            <td className="py-2.5 pr-3 max-w-[220px]">
                              <span>{item.description}</span>
                              {item.airline_name && (
                                <div className="mt-0.5">
                                  <span className="text-xs text-indigo-600 font-medium">✈ {item.airline_name}</span>
                                  {item.ticket_number && (
                                    <span className="ml-2 text-xs font-mono text-slate-400">{item.ticket_number}</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 pr-3">
                              {item.supplier_id ? (
                                <Link to={`/vendors/${item.supplier_id}`}
                                  className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                                  {item.supplier_name || 'Supplier'}
                                </Link>
                              ) : (
                                <span className="text-xs text-amber-500">No supplier</span>
                              )}
                            </td>
                            {/* Supplier cost — internal view */}
                            <td className="py-2.5 pr-3 text-right text-slate-400 text-xs">{fmt(cost)}</td>
                            {/* Markup — with show/hide indicator */}
                            <td className="py-2.5 pr-3 text-right">
                              <span className={`text-xs font-medium ${markup > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                {fmt(markup)}
                              </span>
                              {markup > 0 && (
                                <span className={`ml-1 text-xs px-1 rounded ${item.show_markup ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                                  title={item.show_markup ? 'Visible on customer invoice' : 'Hidden from customer'}>
                                  {item.show_markup ? 'shown' : 'hidden'}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-right text-slate-500">{qty}</td>
                            <td className="py-2.5 pr-3 text-right font-medium">{fmt(unitPrice)}</td>
                            <td className="py-2.5 text-right font-semibold">{fmt(unitPrice * qty)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Internal profit summary */}
                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-xs text-slate-400">Supplier Cost</p>
                    <p className="text-sm font-semibold text-slate-600">{fmt(totalCost)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2">
                    <p className="text-xs text-slate-400">Total Markup</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmt(totalMarkup)}</p>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-2">
                    <p className="text-xs text-slate-400">Invoice Total</p>
                    <p className="text-sm font-semibold text-indigo-600">{fmt(invoice.total_amount)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 max-w-xs ml-auto">
              <Row label="Subtotal"    value={fmt(invoice.subtotal ?? invoice.total_amount)} />
              {(invoice.tax_amount ?? 0) > 0 && (
                <Row label="Tax"       value={fmt(invoice.tax_amount)} />
              )}
              <Row label="Total"       value={fmt(invoice.total_amount)} bold />
              <Row label="Amount Paid" value={fmt(invoice.amount_paid)} color="text-emerald-600" />
              <Row
                label="Balance Due"
                value={fmt(balanceDue)}
                bold
                color={balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}
              />
            </div>

            {invoice.notes && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Notes</p>
                <p className="text-sm text-slate-600">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Actions ───────────────────────────────── */}
        <div className="space-y-4">

          {/* Balance card */}
          <div className={`rounded-xl border p-4 ${
            isPaid ? 'bg-emerald-50 border-emerald-200' :
            balanceDue > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <p className="text-xs text-slate-500 mb-1">Balance Due</p>
            <p className={`text-3xl font-bold ${isPaid ? 'text-emerald-700' : balanceDue > 0 ? 'text-red-700' : 'text-slate-600'}`}>
              {fmt(balanceDue)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${invoice.total_amount > 0 ? Math.min(100, (invoice.amount_paid / invoice.total_amount) * 100) : 0}%` }} />
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {invoice.total_amount > 0 ? `${Math.round((invoice.amount_paid / invoice.total_amount) * 100)}% paid` : '0% paid'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Actions</p>

            {isDraft && (
              <button onClick={() => setShowIssueModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                           text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white
                           transition-colors shadow-sm">
                📤 Issue Invoice
              </button>
            )}

            {isDraft && (
              <p className="text-xs text-slate-400 text-center">
                Issuing will auto-create supplier invoices and post all accounting entries.
              </p>
            )}

            {invoice.booking_id && (
              <Link to={`/bookings/${invoice.booking_id}`}
                className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg
                           text-sm font-medium border border-slate-200 text-slate-600
                           hover:bg-slate-50 transition-colors">
                View Booking →
              </Link>
            )}

            {invoice.customer_id && (
              <Link to={`/customers/${invoice.customer_id}`}
                className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg
                           text-sm font-medium border border-slate-200 text-slate-600
                           hover:bg-slate-50 transition-colors">
                View Customer →
              </Link>
            )}

            {/* Download PDF — always available */}
            <div className="pt-1 border-t border-slate-100">
              <button
                onClick={handleDownloadPdf}

                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5
                           rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-900
                           text-white transition-colors shadow-sm disabled:opacity-50">
                🖨️ Download Invoice PDF
              </button>
            </div>
          </div>

          {/* Payment history */}
          {(invoice.payments ?? []).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">Payment History</p>
              </div>
              <div className="divide-y divide-slate-50">
                {invoice.payments.map(p => (
                  <div key={p.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold text-emerald-700">{fmt(p.amount)}</span>
                      <span className="text-xs text-slate-400">{fmtDate(p.payment_date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge label={p.payment_method?.replace(/_/g, ' ')} />
                      {p.payment_reference && (
                        <span className="text-xs font-mono text-slate-400">{p.payment_reference}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {showIssueModal && invoice && (
        <InvoiceIssueModal
          mode="issue"
          invoice={invoice}
          onClose={() => setShowIssueModal(false)}
          onSuccess={handleIssueSuccess}
        />
      )}

    </div>
  )
}
