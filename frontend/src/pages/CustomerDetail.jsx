/**
 * pages/CustomerDetail.jsx — Customer AR Account (Accounts Receivable Subledger)
 *
 * Route: /customers/:id
 *
 * Behaves like a real AR subledger (QuickBooks / Sage / SAP style):
 *   Outstanding Balance = MAX(Total Invoiced - Total Received, 0)  ← never negative
 *   Advance Credit      = MAX(Total Received - Total Invoiced, 0)  ← only when overpaid
 *
 * Tabs:
 *   Ledger   — full AR subledger with running balance
 *   Overview — customer profile card
 *   Bookings — booking history
 */

import React, { useEffect, useState } from 'react'
import { useParams, Link }             from 'react-router-dom'
import client                          from '../api/client'
import { customerService }             from '../services/customerService'
import { useToast }                    from '../components/ui/Toast'
import { PageSpinner }                 from '../components/ui/LoadingSpinner'
import CustomerBulkPayModal            from './CustomerBulkPayModal'
import CustomerAdvanceModal            from './CustomerAdvanceModal'
import ApplyCreditModal                from './ApplyCreditModal'

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—'

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_ICONS = {
  flight:       '✈',
  hotel:        '🏨',
  tour_package: '🗺',
  visa:         '📋',
  insurance:    '🛡',
  other:        '📦',
}

const ICONS = {
  user:     'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  phone:    'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  mail:     'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  passport: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  globe:    'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  edit:     'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  plus:     'M12 4v16m8-8H4',
  invoice:  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  payment:  'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  print:    'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24"
           stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 font-medium">{value}</p>
      </div>
    </div>
  )
}

function ARCard({ label, value, sub, color, tag }) {
  const styles = {
    indigo:  'bg-indigo-50 border-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    violet:  'bg-violet-50 border-violet-200 text-violet-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-400',
  }
  const isZero = value === '$0.00'
  return (
    <div className={`rounded-xl border p-4 ${styles[color]}`}>
      <p className="text-xs opacity-60 mb-1 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${isZero ? 'opacity-35' : ''}`}>{value}</p>
      {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
      {tag && !isZero && (
        <span className={`inline-block mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full
          ${color === 'red'    ? 'bg-red-100 text-red-700'
          : color === 'violet' ? 'bg-violet-100 text-violet-700'
          :                      'bg-emerald-100 text-emerald-700'}`}>
          {tag}
        </span>
      )}
    </div>
  )
}

function InvoiceStatusBadge({ status }) {
  const map = {
    paid:           { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'PAID' },
    partially_paid: { cls: 'bg-amber-100 text-amber-700 border-amber-200',      label: 'PARTIAL' },
    overdue:        { cls: 'bg-red-100 text-red-700 border-red-200',            label: 'OVERDUE' },
    issued:         { cls: 'bg-blue-100 text-blue-700 border-blue-200',         label: 'ISSUED' },
    draft:          { cls: 'bg-slate-100 text-slate-500 border-slate-200',      label: 'DRAFT' },
  }
  const s = map[status] || map['issued']
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full border ${s.cls}`}>
      {s.label}
    </span>
  )
}

function TxnTypeBadge({ type }) {
  if (type === 'invoice') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold
                     text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.invoice} />
      </svg>
      Invoice
    </span>
  )
  if (type === 'invoice_payment') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold
                     text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.payment} />
      </svg>
      Payment
    </span>
  )
  if (type === 'credit_application') return (
    <span className="text-xs font-semibold text-violet-800 bg-violet-100 border border-violet-300 rounded-full px-2 py-0.5">
      💳 Credit Applied
    </span>
  )
  if (type === 'advance_deposit') return (
    <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
      💳 Advance
    </span>
  )
  if (type === 'credit_memo') return (
    <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
      📝 Credit Memo
    </span>
  )
  if (type === 'refund') return (
    <span className="text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
      ↩ Refund
    </span>
  )
  if (type === 'write_off') return (
    <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
      ✗ Write-Off
    </span>
  )
  if (type === 'adjustment') return (
    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
      ⚙ Adjustment
    </span>
  )
  // Fallback — payment
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold
                     text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.payment} />
      </svg>
      Payment
    </span>
  )
}

function BalanceCell({ balance }) {
  if (balance > 0.005) return (
    <div className="text-right">
      <span className="font-bold text-sm text-red-600">{fmt(balance)}</span>
      <span className="ml-1 text-xs font-bold text-red-500 bg-red-50 border border-red-100
                       rounded px-1 py-0.5">DR</span>
    </div>
  )
  if (balance < -0.005) return (
    <div className="text-right">
      <span className="font-bold text-sm text-violet-600">{fmt(Math.abs(balance))}</span>
      <span className="ml-1 text-xs font-bold text-violet-500 bg-violet-50 border border-violet-100
                       rounded px-1 py-0.5">CR</span>
    </div>
  )
  return (
    <div className="text-right">
      <span className="text-sm font-semibold text-emerald-600">Settled</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ['Ledger', 'Overview', 'Bookings']

export default function CustomerDetail() {
  const { id } = useParams()
  const toast  = useToast()

  const [customer,      setCustomer]     = useState(null)
  const [statement,     setStatement]    = useState(null)
  const [bookings,      setBookings]     = useState([])
  const [loading,       setLoading]      = useState(true)
  const [tab,           setTab]          = useState('Ledger')
  const [applyingCredit,  setApplyingCredit] = useState(null)  // payment row to apply to an invoice
  const [showBulkPay,     setShowBulkPay]    = useState(false)
  const [showAdvance,     setShowAdvance]    = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      client.get(`/customers/${id}/statement`),
      customerService.getBookings(id),
    ])
      .then(([stmtRes, bkgRes]) => {
        const data = stmtRes.data?.data
        setCustomer(data?.customer)
        setStatement({ summary: data?.summary, entries: data?.entries || [] })
        const bkgs = bkgRes?.bookings ?? bkgRes?.data ?? bkgRes ?? []
        setBookings(Array.isArray(bkgs) ? bkgs : [])
      })
      .catch(() => toast.error('Could not load customer account.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  if (loading) return <PageSpinner />
  if (!customer) return (
    <div className="text-center py-20">
      <p className="text-slate-500">Customer not found.</p>
      <Link to="/customers" className="text-indigo-600 text-sm mt-2 inline-block">← Back</Link>
    </div>
  )

  const initials      = customer.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const summary       = statement?.summary || {}
  const entries       = statement?.entries  || []

  // AR key figures — correct applied/unapplied model
  const totalInvoiced   = summary.total_invoiced   ?? 0
  const appliedPayments = summary.applied_payments ?? summary.total_paid ?? 0  // applied to invoices
  const openCredit      = summary.open_credit      ?? summary.advance_credit ?? 0  // unallocated cash
  const netOutstanding  = summary.net_outstanding  ?? summary.outstanding ?? 0  // still owed on invoices
  const totalReceived   = summary.total_received   ?? 0   // total cash in (reference)

  // Aliases for backward-compat with remaining banner/modal code
  const advanceCredit  = openCredit
  const outstanding    = netOutstanding
  const hasCredit      = openCredit     > 0.005
  const hasOutstanding = netOutstanding > 0.005

  const openInvoices = entries.filter(
    e => e.entry_type === 'invoice' && ['issued', 'partially_paid', 'overdue'].includes(e.status)
  )

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/customers" className="hover:text-indigo-600 transition-colors">Customers</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{customer.name}</span>
      </nav>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-indigo-600">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Customer since {fmtDate(customer.created_at)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Link to={`/customers/${id}/edit`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                             font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                       stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.edit} />
                  </svg>
                  Edit
                </Link>
                <Link to={`/bookings/new?customer=${id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                             font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                       stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.plus} />
                  </svg>
                  New Booking
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Advance Credit Alert ─────────────────────────────────────── */}
      {hasCredit && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4
                        flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-2xl shrink-0">💳</span>
            <div>
              <p className="text-sm font-bold text-violet-800">Open Credit on Account</p>
              <p className="text-xs text-violet-600 mt-0.5">
                <strong>{fmt(openCredit)}</strong> received but not yet applied to any invoice.
                {openInvoices.length > 0
                  ? ' Find the OPEN CREDIT row in the ledger and click "Apply to Invoice →".'
                  : ' No open invoices at the moment.'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-violet-700">{fmt(openCredit)}</p>
            <p className="text-xs text-violet-500 font-semibold uppercase tracking-wide mt-0.5">OPEN CREDIT</p>
          </div>
        </div>
      )}

      {/* ── Outstanding Alert ────────────────────────────────────────── */}
      {hasOutstanding && !hasCredit && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4
                        flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-2xl shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-800">Outstanding balance pending collection</p>
              <p className="text-xs text-red-600 mt-0.5">
                {fmt(outstanding)} is owed across {openInvoices.length} open invoice(s).
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-red-700">{fmt(outstanding)}</p>
            <p className="text-xs text-red-500 font-semibold uppercase tracking-wide mt-0.5">Outstanding (DR)</p>
          </div>
        </div>
      )}

      {/* ── 4 AR Summary Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ARCard label="Total Invoiced"
                value={fmt(totalInvoiced)}
                sub={`${summary.invoice_count ?? 0} invoice(s)`}
                color="indigo" />
        <ARCard label="Applied Payments"
                value={fmt(appliedPayments)}
                sub="Cash applied to invoices"
                color="emerald" />
        <ARCard label="Net Outstanding"
                value={fmt(netOutstanding)}
                sub={netOutstanding > 0 ? 'Still owed on invoices' : 'All invoices settled'}
                color={netOutstanding > 0 ? 'red' : 'slate'}
                tag={netOutstanding > 0 ? 'DR' : null} />
        <ARCard label="Open Credit"
                value={fmt(openCredit)}
                sub={openCredit > 0 ? 'Unallocated cash — apply to invoice' : 'No open credit'}
                color={openCredit > 0 ? 'violet' : 'slate'}
                tag={openCredit > 0 ? 'OPEN' : null} />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-slate-200">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
            {t === 'Ledger' && entries.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
                {entries.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB: LEDGER — AR Subledger
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'Ledger' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Accounts Receivable Ledger</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Chronological record — invoices (DR), payments &amp; credits (CR), running balance
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Balance pill */}
              {hasCredit ? (
                <span className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200
                                 rounded-full px-3 py-1">
                  💳 {fmt(advanceCredit)} CR
                </span>
              ) : hasOutstanding ? (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100
                                 rounded-full px-3 py-1">
                  ⚠ {fmt(outstanding)} DR
                </span>
              ) : entries.length > 0 ? (
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100
                                 rounded-full px-3 py-1">
                  ✓ Account Settled
                </span>
              ) : null}

              <button onClick={() => setShowAdvance(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                     stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M12 4v16m8-8H4" />
                </svg>
                Record Advance
              </button>

              <button onClick={() => setShowBulkPay(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                     stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Pay Here
              </button>

              <button onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           font-medium border border-slate-200 text-slate-600 hover:bg-slate-50">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                     stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Statement
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-10 h-10 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.invoice} />
              </svg>
              <p className="text-sm text-slate-400">No transactions on this account yet.</p>
              <Link to={`/bookings/new?customer=${id}`}
                className="inline-block mt-2 text-xs text-indigo-600 hover:underline">
                Create first booking →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Date','Type','Reference','Service / Method','Description',
                      'Debit (DR)','Credit (CR)','Running Balance','Status / Action'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-500
                                              uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((entry, idx) => {
                    const isInv    = entry.entry_type === 'invoice'
                    const isCredit = ['advance_deposit','credit_memo','refund'].includes(entry.entry_type)
                    const bal      = entry.running_balance

                    const rowBg = isInv
                      ? 'hover:bg-blue-50/40'
                      : isCredit
                        ? 'bg-violet-50/20 hover:bg-violet-50/50'
                        : 'bg-emerald-50/10 hover:bg-emerald-50/40'

                    return (
                      <tr key={idx} className={`transition-colors ${rowBg}`}>

                        {/* Date */}
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {fmtDate(entry.date)}
                        </td>

                        {/* Type badge */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <TxnTypeBadge type={entry.entry_type} />
                        </td>

                        {/* Reference */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {isInv ? (
                            <Link to={`/invoices/${entry.invoice_id}`}
                              className="font-mono text-xs font-semibold text-indigo-600 hover:underline">
                              {entry.reference}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs text-slate-600">{entry.reference}</span>
                          )}
                        </td>

                        {/* Service / Method */}
                        <td className="px-3 py-3">
                          {isInv && entry.service_types?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {entry.service_types.map(st => (
                                <span key={st} className="text-xs whitespace-nowrap">
                                  {SERVICE_ICONS[st] || '📦'}{' '}
                                  <span className="text-slate-500 capitalize">
                                    {st.replace(/_/g,' ')}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : entry.payment_method ? (
                            <span className="text-xs text-slate-500 capitalize">
                              {entry.payment_method.replace(/_/g,' ')}
                            </span>
                          ) : <span className="text-slate-200 text-xs">—</span>}
                        </td>

                        {/* Description */}
                        <td className={`px-3 py-3 text-xs max-w-xs truncate ${
                          isCredit ? 'text-violet-600 italic' : 'text-slate-600'
                        }`}>
                          {entry.description}
                          {/* Show split only when partially applied (some applied, some not) */}
                          {!isInv && (entry.amount_applied ?? 0) > 0.005 &&
                           (entry.unapplied_amount ?? 0) > 0.005 && (
                            <div className="mt-0.5 text-violet-500">
                              Applied: {fmt(entry.amount_applied)} · Remaining: {fmt(entry.unapplied_amount)}
                            </div>
                          )}
                        </td>

                        {/* Debit (DR) */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {entry.debit > 0 ? (
                            <div>
                              <span className="font-semibold text-slate-800">{fmt(entry.debit)}</span>
                              {isInv && entry.invoice_paid > 0 && (
                                <div className="text-xs text-slate-400 mt-0.5">
                                  Paid: {fmt(entry.invoice_paid)}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-slate-200">—</span>}
                        </td>

                        {/* Credit (CR) */}
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {entry.credit > 0 ? (
                            <span className={`font-semibold ${
                              isCredit ? 'text-violet-600' : 'text-emerald-600'
                            }`}>
                              {fmt(entry.credit)}
                            </span>
                          ) : <span className="text-slate-200">—</span>}
                        </td>

                        {/* Running balance */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <BalanceCell balance={bal} />
                        </td>

                        {/* Status / Action */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {isInv ? (
                            /* Invoice row — status badge only; payments go via Bulk Payment */
                            <InvoiceStatusBadge status={entry.status} />
                          ) : entry.payment_status === 'open_credit' ? (
                            /* ── OPEN CREDIT — nothing applied yet ── */
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-bold text-violet-700 bg-violet-100
                                               border border-violet-200 rounded-full px-2 py-0.5
                                               whitespace-nowrap">
                                OPEN CREDIT
                              </span>
                              {openInvoices.length > 0 && (
                                <button
                                  onClick={() => setApplyingCredit(entry)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                             text-xs font-semibold bg-violet-600 hover:bg-violet-700
                                             text-white transition-colors shadow-sm whitespace-nowrap"
                                >
                                  💳 Apply to Invoice →
                                </button>
                              )}
                            </div>

                          ) : entry.payment_status === 'partially_applied' ? (
                            /* ── PARTIALLY APPLIED — some applied, some still open ── */
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-bold text-amber-700 bg-amber-50
                                               border border-amber-200 rounded-full px-2 py-0.5
                                               whitespace-nowrap">
                                PARTIAL · {fmt(entry.unapplied_amount)} open
                              </span>
                              {openInvoices.length > 0 && (
                                <button
                                  onClick={() => setApplyingCredit(entry)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                             text-xs font-semibold bg-amber-600 hover:bg-amber-700
                                             text-white transition-colors shadow-sm whitespace-nowrap"
                                >
                                  💳 Apply Remainder →
                                </button>
                              )}
                            </div>

                          ) : (
                            /* ── FULLY APPLIED or credit_application ── */
                            <span className="text-xs font-medium text-emerald-600">
                              {entry.payment_status === 'applied' ? '↳ Applied' : '✓ Fully Applied'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={4} className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Account Totals
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Invoiced</span>
                      <div className="font-bold text-slate-800 whitespace-nowrap">{fmt(totalInvoiced)}</div>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="font-bold text-emerald-600">{fmt(appliedPayments)}</span>
                      <div className="text-xs text-slate-400">Applied</div>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {hasCredit ? (
                        <div>
                          <span className="font-bold text-base text-violet-700">{fmt(openCredit)}</span>
                          <span className="ml-1 text-xs font-bold text-violet-500 bg-violet-100
                                           rounded px-1 py-0.5">OPEN</span>
                          <div className="text-xs text-violet-500 mt-0.5">Unallocated credit</div>
                        </div>
                      ) : hasOutstanding ? (
                        <div>
                          <span className="font-bold text-base text-red-700">{fmt(netOutstanding)}</span>
                          <span className="ml-1 text-xs font-bold text-red-500 bg-red-100
                                           rounded px-1 py-0.5">DR</span>
                          <div className="text-xs text-red-500 mt-0.5">Net Outstanding</div>
                        </div>
                      ) : (
                        <div>
                          <span className="font-bold text-base text-emerald-600">$0.00</span>
                          <div className="text-xs text-emerald-500 mt-0.5">Settled</div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'Overview' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Customer Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow icon={ICONS.phone}    label="Phone"       value={customer.phone} />
            <InfoRow icon={ICONS.mail}     label="Email"       value={customer.email} />
            <InfoRow icon={ICONS.passport} label="Passport"    value={customer.passport_number} />
            <InfoRow icon={ICONS.globe}    label="Nationality" value={customer.nationality} />
          </div>
          {customer.notes && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-400 mb-0.5">Notes</p>
              <p className="text-sm text-slate-600">{customer.notes}</p>
            </div>
          )}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">AR Account Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Invoiced</span>
                <span className="font-semibold text-slate-800">{fmt(totalInvoiced)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Applied Payments</span>
                <span className="font-semibold text-emerald-700">{fmt(appliedPayments)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-500">Net Outstanding (DR)</span>
                <span className={`font-bold ${netOutstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {fmt(netOutstanding)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Open Credit (Unallocated)</span>
                <span className={`font-bold ${openCredit > 0 ? 'text-violet-600' : 'text-slate-400'}`}>
                  {fmt(openCredit)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: BOOKINGS
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'Bookings' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Booking History</h2>
            <Link to={`/bookings/new?customer=${id}`}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              + New Booking
            </Link>
          </div>
          {bookings.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400">No bookings yet.</p>
              <Link to={`/bookings/new?customer=${id}`}
                className="inline-block mt-2 text-xs text-indigo-600 hover:underline">
                Create first booking →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Booking Ref','Service','Destination','Travel Date',
                      'Selling Price','Vendor Cost','Profit','Status',''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500
                                              uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bookings.map(b => {
                    const sp     = b.total_selling_price ?? b.selling_price ?? 0
                    const vc     = b.total_vendor_cost   ?? b.vendor_cost   ?? 0
                    const profit = b.total_profit ?? (sp - vc)
                    const svcs   = b.items?.map(i => i.service_type) ?? []
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-xs font-semibold text-indigo-600 whitespace-nowrap">
                          {b.booking_reference}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {svcs.length > 0 ? svcs.map(st => (
                              <span key={st} className="text-xs whitespace-nowrap">
                                {SERVICE_ICONS[st] || '📦'}{' '}
                                <span className="text-slate-500 capitalize">{st.replace(/_/g,' ')}</span>
                              </span>
                            )) : <span className="text-xs text-slate-400">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 text-xs">{b.destination || '—'}</td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {fmtDate(b.travel_date)}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 whitespace-nowrap">
                          {fmt(sp)}
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{fmt(vc)}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {fmt(profit)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700'
                            : b.status === 'cancelled' ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>{b.status}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Link to={`/bookings/${b.id}`}
                            className="text-xs text-indigo-600 hover:underline">View</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showBulkPay && (
        <CustomerBulkPayModal
          customerId={id}
          customerName={customer.name}
          invoices={openInvoices.map(e => ({
            id:             e.invoice_id,
            invoice_number: e.reference,
            balance_due:    e.invoice_balance ?? e.debit,
            status:         e.status,
          }))}
          onClose={() => setShowBulkPay(false)}
          onSuccess={() => { setShowBulkPay(false); load() }}
        />
      )}

      {showAdvance && (
        <CustomerAdvanceModal
          customerId={id}
          customerName={customer.name}
          currentCredit={advanceCredit}
          onClose={() => setShowAdvance(false)}
          onSuccess={() => { setShowAdvance(false); load() }}
        />
      )}

      {applyingCredit && (
        <ApplyCreditModal
          customerId={id}
          customerName={customer.name}
          sourcePayment={{
            payment_id:       applyingCredit.payment_id ?? applyingCredit.id,
            reference:        applyingCredit.reference,
            unapplied_amount: applyingCredit.unapplied_amount,
            payment_method:   applyingCredit.payment_method,
            date:             applyingCredit.date,
            description:      applyingCredit.description,
          }}
          openInvoices={openInvoices}
          onClose={() => setApplyingCredit(null)}
          onSuccess={() => { setApplyingCredit(null); load() }}
        />
      )}

    </div>
  )
}
