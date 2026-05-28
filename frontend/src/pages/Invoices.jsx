/**
 * pages/Invoices.jsx — Invoice list with status filter.
 *
 * Connects to: GET /api/invoices/?status=&page=
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { invoiceService } from '../services/invoiceService'
import Badge               from '../components/ui/Badge'
import { PageSpinner }     from '../components/ui/LoadingSpinner'
import EmptyState          from '../components/ui/EmptyState'

const STATUSES = ['all', 'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled']

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const DOC_ICON = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [status,   setStatus]   = useState('all')
  const [page,     setPage]     = useState(1)

  const PER_PAGE = 20

  const load = useCallback(async (s, p) => {
    setLoading(true)
    try {
      const params = { page: p, per_page: PER_PAGE }
      if (s && s !== 'all') params.status = s
      const res = await invoiceService.list(params)
      setInvoices(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(status, page) }, [])

  function handleStatusChange(s) {
    setStatus(s)
    setPage(1)
    load(s, 1)
  }

  function handlePageChange(p) {
    setPage(p)
    load(status, p)
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  // Summary counts by status for the quick-filter bar
  const statusColor = {
    draft:          'text-slate-400',
    issued:         'text-blue-600',
    partially_paid: 'text-amber-600',
    paid:           'text-emerald-600',
    overdue:        'text-red-600',
    cancelled:      'text-slate-400',
  }

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Status filter tabs ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              status === s
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {s === 'all' ? 'All Invoices' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${total} invoice${total !== 1 ? 's' : ''}`}
          </p>
          <Link
            to="/bookings/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            + New Booking &amp; Invoice
          </Link>
        </div>

        {loading ? (
          <PageSpinner />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={DOC_ICON}
            title="No invoices found"
            message={status !== 'all'
              ? `No ${status.replace(/_/g, ' ')} invoices.`
              : 'Invoices are generated from bookings.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Invoice #', 'Customer', 'Booking', 'Issue Date', 'Total', 'Paid', 'Balance', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Invoice number */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-indigo-600">
                          {inv.invoice_number}
                        </span>
                      </td>
                      {/* Customer */}
                      <td className="px-4 py-3.5 text-slate-700 font-medium">
                        {inv.customer_name}
                      </td>
                      {/* Booking ref */}
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                        {inv.booking_ref || '—'}
                      </td>
                      {/* Issue date */}
                      <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(inv.issue_date)}
                      </td>
                      {/* Total */}
                      <td className="px-4 py-3.5 font-semibold text-slate-800 whitespace-nowrap">
                        {fmt(inv.total_amount)}
                      </td>
                      {/* Amount paid */}
                      <td className="px-4 py-3.5 text-emerald-600 whitespace-nowrap">
                        {fmt(inv.amount_paid)}
                      </td>
                      {/* Balance due */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`font-semibold ${(inv.balance_due ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {fmt(inv.balance_due)}
                        </span>
                      </td>
                      {/* Status badge */}
                      <td className="px-4 py-3.5">
                        <Badge label={inv.status} />
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          to={`/invoices/${inv.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals row */}
            {invoices.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-6 text-xs text-slate-500">
                <span>
                  Total invoiced:{' '}
                  <strong className="text-slate-700">
                    {fmt(invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0))}
                  </strong>
                </span>
                <span>
                  Total collected:{' '}
                  <strong className="text-emerald-700">
                    {fmt(invoices.reduce((s, i) => s + (i.amount_paid ?? 0), 0))}
                  </strong>
                </span>
                <span>
                  Total outstanding:{' '}
                  <strong className="text-red-600">
                    {fmt(invoices.reduce((s, i) => s + (i.balance_due ?? 0), 0))}
                  </strong>
                </span>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  >← Prev</button>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  >Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
