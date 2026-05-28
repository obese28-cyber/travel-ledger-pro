/**
 * pages/Payments.jsx -- Customer payments list with filters.
 *
 * Route: /payments
 *
 * Connects to:
 *   GET /api/payments/  -> paginated payments list
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams }                    from 'react-router-dom'
import { paymentService } from '../services/paymentService'
import { useToast }       from '../components/ui/Toast'
import { PageSpinner }    from '../components/ui/LoadingSpinner'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'

const METHOD_LABELS = {
  cash:           'Cash',
  bank_transfer:  'Bank Transfer',
  credit_card:    'Credit Card',
  mobile_money:   'Mobile Money',
}

const METHOD_COLORS = {
  cash:           'bg-emerald-100 text-emerald-700',
  bank_transfer:  'bg-sky-100 text-sky-700',
  credit_card:    'bg-violet-100 text-violet-700',
  mobile_money:   'bg-amber-100 text-amber-700',
}

const ICON_CARD = 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z'
const ICON_SEARCH = 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
const ICON_FILTER = 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z'

const PAYMENT_METHODS = [
  { value: '',               label: 'All Methods' },
  { value: 'cash',           label: 'Cash' },
  { value: 'bank_transfer',  label: 'Bank Transfer' },
  { value: 'credit_card',    label: 'Credit Card' },
  { value: 'mobile_money',   label: 'Mobile Money' },
]

export default function Payments() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [payments, setPayments] = useState([])
  const [meta,     setMeta]     = useState({ total: 0, page: 1, pages: 1 })
  const [loading,  setLoading]  = useState(true)

  const [search,  setSearch]  = useState(searchParams.get('search') || '')
  const [method,  setMethod]  = useState(searchParams.get('method') || '')
  const [page,    setPage]    = useState(Number(searchParams.get('page')) || 1)

  // Summary totals (computed from current page -- full totals need a separate API call)
  const pageTotal = payments.reduce((s, p) => s + (p.amount || 0), 0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: 20 }
      if (search.trim()) params.search         = search.trim()
      if (method)        params.payment_method = method

      const data = await paymentService.list(params)
      setPayments(data.data   || [])
      setMeta({
        total:    data.total  || 0,
        page:     data.page   || 1,
        pages:    data.pages  || 1,
      })
    } catch {
      toast.error('Failed to load payments.')
    } finally {
      setLoading(false)
    }
  }, [page, search, method])

  useEffect(() => { load() }, [load])

  function handleSearch(e) {
    setSearch(e.target.value)
    setPage(1)
  }

  function handleMethod(e) {
    setMethod(e.target.value)
    setPage(1)
  }

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Customer Payments</h1>
          <p className="text-sm text-slate-500 mt-0.5">All payments received from customers.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_CARD} />
          </svg>
          <span className="font-semibold text-slate-700">{meta.total}</span> total records
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none"
               viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_SEARCH} />
          </svg>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search by reference, customer..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
        </div>
        <select
          value={method}
          onChange={handleMethod}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white"
        >
          {PAYMENT_METHODS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20"><PageSpinner /></div>
        ) : payments.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_CARD} />
            </svg>
            <p className="font-medium">No payments found</p>
            <p className="text-sm mt-1">Payments will appear here after customers pay their invoices.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {payments.map((pmt) => {
                    const methodColor = METHOD_COLORS[pmt.payment_method] || 'bg-slate-100 text-slate-600'
                    const methodLabel = METHOD_LABELS[pmt.payment_method] || pmt.payment_method || '--'
                    return (
                      <tr key={pmt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                          {fmtDate(pmt.payment_date)}
                        </td>
                        <td className="px-5 py-3.5">
                          {pmt.customer_name ? (
                            <Link
                              to={`/customers/${pmt.customer_id}`}
                              className="text-indigo-600 hover:underline font-medium"
                            >
                              {pmt.customer_name}
                            </Link>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {pmt.invoice_id ? (
                            <Link
                              to={`/invoices/${pmt.invoice_id}`}
                              className="text-indigo-600 hover:underline font-medium"
                            >
                              {pmt.invoice_number || `INV-${pmt.invoice_id}`}
                            </Link>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${methodColor}`}>
                            {methodLabel}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                          {pmt.reference_number || '--'}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-emerald-600 whitespace-nowrap">
                          {fmt(pmt.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Page total ({payments.length} records)
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800">
                      {fmt(pageTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            {meta.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Page {meta.page} of {meta.pages} ({meta.total} total)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={meta.page <= 1}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
                    disabled={meta.page >= meta.pages}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
