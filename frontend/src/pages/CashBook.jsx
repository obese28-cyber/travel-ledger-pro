/**
 * pages/CashBook.jsx — Unified cash ledger.
 *
 * Shows every cash movement in one place:
 *   INFLOWS  — payments received from customers (green)
 *   OUTFLOWS — payments made to suppliers      (red)
 *
 * Running balance column shows the cumulative net cash position after each row.
 *
 * Route: /cash-book
 * API:   GET /api/reports/cash-book
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Link }   from 'react-router-dom'
import client     from '../api/client'
import { useToast } from '../components/ui/Toast'
import { PageSpinner } from '../components/ui/LoadingSpinner'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—'

// First day of current month
function firstOfMonth() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

const METHOD_COLORS = {
  cash:          'bg-emerald-100 text-emerald-700',
  bank_transfer: 'bg-sky-100 text-sky-700',
  credit_card:   'bg-violet-100 text-violet-700',
  mobile_money:  'bg-amber-100 text-amber-700',
}
const METHOD_LABELS = {
  cash:          '💵 Cash',
  bank_transfer: '🏦 Bank Transfer',
  credit_card:   '💳 Credit Card',
  mobile_money:  '📱 Mobile Money',
}

const ICONS = {
  inflow:  'M7 16V12m0 0V8m0 4h4m4 0h4M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
  outflow: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  filter:  'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
  export:  'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
}

function SummaryCard({ label, value, sub, color, icon }) {
  const styles = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-700',
  }
  return (
    <div className={`rounded-xl border p-5 ${styles[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium opacity-60 mb-1">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs opacity-50 mt-1">{sub}</p>}
        </div>
        <svg className="w-6 h-6 opacity-30" fill="none" viewBox="0 0 24 24"
             stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
    </div>
  )
}

export default function CashBook() {
  const toast = useToast()

  const [entries,  setEntries]  = useState([])
  const [summary,  setSummary]  = useState({})
  const [loading,  setLoading]  = useState(true)
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo,   setDateTo]   = useState(today())
  const [method,   setMethod]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      if (method) params.append('payment_method', method)
      const res = await client.get(`/reports/cash-book?${params}`)
      const data = res.data?.data
      setEntries(data?.entries  || [])
      setSummary(data?.summary  || {})
    } catch {
      toast.error('Could not load cash book.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, method])

  useEffect(() => { load() }, [load])

  const net = summary.net_cash ?? 0

  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cash Book</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All cash inflows and outflows — customers paying us and us paying suppliers.
          </p>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Cash In"
          value={fmt(summary.total_inflow ?? 0)}
          sub={`${summary.inflow_count ?? 0} receipt(s) from customers`}
          color="emerald"
          icon={ICONS.inflow}
        />
        <SummaryCard
          label="Total Cash Out"
          value={fmt(summary.total_outflow ?? 0)}
          sub={`${summary.outflow_count ?? 0} payment(s) to suppliers`}
          color="red"
          icon={ICONS.outflow}
        />
        <SummaryCard
          label="Net Cash Position"
          value={fmt(net)}
          sub={net >= 0 ? 'Positive cash flow' : 'Negative — more paid out than received'}
          color={net >= 0 ? 'indigo' : 'red'}
          icon={ICONS.filter}
        />
        <SummaryCard
          label="Total Transactions"
          value={(summary.inflow_count ?? 0) + (summary.outflow_count ?? 0)}
          sub={`${dateFrom} → ${dateTo}`}
          color="slate"
          icon={ICONS.export}
        />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Payment Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500">
              <option value="">All Methods</option>
              <option value="cash">💵 Cash</option>
              <option value="bank_transfer">🏦 Bank Transfer</option>
              <option value="credit_card">💳 Credit Card</option>
              <option value="mobile_money">📱 Mobile Money</option>
            </select>
          </div>
          <button onClick={load}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg
                       hover:bg-indigo-700 transition-colors shadow-sm">
            Apply
          </button>
          <button onClick={() => { setDateFrom(firstOfMonth()); setDateTo(today()); setMethod('') }}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200
                       rounded-lg hover:bg-slate-50 transition-colors">
            Reset
          </button>
        </div>
      </div>

      {/* ── Cash Book Table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Cash Transactions</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Green = money received · Red = money paid out · Balance = running net
            </p>
          </div>
          {entries.length > 0 && (
            <span className="text-xs text-slate-400">{entries.length} transactions</span>
          )}
        </div>

        {loading ? (
          <div className="py-20"><PageSpinner /></div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-400 text-sm">No cash transactions found for this period.</p>
            <p className="text-slate-300 text-xs mt-1">Try adjusting the date range or filters above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Date','Type','Reference','Party','Booking','Method','Inflow ↓','Outflow ↑','Balance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500
                                            uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {entries.map((e, idx) => {
                  const isIn  = e.entry_type === 'inflow'
                  const bal   = e.running_balance

                  return (
                    <tr key={idx}
                      className={`transition-colors ${
                        isIn
                          ? 'hover:bg-emerald-50/50'
                          : 'hover:bg-red-50/50 bg-red-50/20'
                      }`}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(e.date)}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isIn ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold
                                           text-emerald-700 bg-emerald-50 border border-emerald-200
                                           rounded-full px-2.5 py-1">
                            ↓ Cash In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold
                                           text-red-700 bg-red-50 border border-red-200
                                           rounded-full px-2.5 py-1">
                            ↑ Cash Out
                          </span>
                        )}
                      </td>

                      {/* Reference */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-600">{e.reference}</span>
                      </td>

                      {/* Party */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isIn ? (
                          <Link to={`/customers/${e.party_id}`}
                            className="text-sm font-medium text-indigo-600 hover:underline">
                            {e.party_name}
                          </Link>
                        ) : (
                          <Link to={`/vendors/${e.party_id}`}
                            className="text-sm font-medium text-slate-700 hover:text-indigo-600 hover:underline">
                            {e.party_name}
                          </Link>
                        )}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {isIn ? 'Customer' : 'Supplier'}
                          {isIn && e.invoice_number && (
                            <> · <Link to={`/invoices/${e.invoice_id}`}
                              className="text-indigo-400 hover:underline">{e.invoice_number}</Link></>
                          )}
                          {!isIn && e.bill_reference && (
                            <> · <span className="text-slate-400">{e.bill_reference}</span></>
                          )}
                        </p>
                      </td>

                      {/* Booking */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {e.booking_ref ? (
                          <Link to={`/bookings/${e.booking_id}`}
                            className="font-mono text-xs text-indigo-500 hover:underline">
                            {e.booking_ref}
                          </Link>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Method */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          METHOD_COLORS[e.payment_method] || 'bg-slate-100 text-slate-600'
                        }`}>
                          {METHOD_LABELS[e.payment_method] || e.payment_method}
                        </span>
                      </td>

                      {/* Inflow */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {e.inflow > 0 ? (
                          <span className="font-semibold text-emerald-600">{fmt(e.inflow)}</span>
                        ) : (
                          <span className="text-slate-200">—</span>
                        )}
                      </td>

                      {/* Outflow */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {e.outflow > 0 ? (
                          <span className="font-semibold text-red-600">{fmt(e.outflow)}</span>
                        ) : (
                          <span className="text-slate-200">—</span>
                        )}
                      </td>

                      {/* Running Balance */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`font-bold text-sm ${
                          bal > 0 ? 'text-indigo-700'
                          : bal < 0 ? 'text-red-600'
                          : 'text-slate-400'
                        }`}>
                          {fmt(bal)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-slate-500
                                              uppercase tracking-wide">
                    Period Totals
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                    {fmt(summary.total_inflow ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600 whitespace-nowrap">
                    {fmt(summary.total_outflow ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className={`font-bold text-base ${
                      net > 0 ? 'text-indigo-700' : net < 0 ? 'text-red-600' : 'text-slate-400'
                    }`}>
                      {fmt(net)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick action links ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Record Customer Payment</h3>
          <p className="text-xs text-slate-400 mb-3">
            To record a customer payment, open the invoice and click "Record Payment."
          </p>
          <Link to="/invoices"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                       bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
            Go to Invoices →
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Pay a Supplier</h3>
          <p className="text-xs text-slate-400 mb-3">
            To pay a supplier, open the supplier invoice and click "Pay Now."
          </p>
          <Link to="/bills"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                       bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Go to Supplier Invoices →
          </Link>
        </div>
      </div>

    </div>
  )
}
