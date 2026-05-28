/**
 * pages/Dashboard.jsx — Executive CFO dashboard with sparkline analytics.
 *
 * Connects to:
 *   GET /api/reports/dashboard   -> KPI totals for current period
 *   GET /api/reports/sparklines  -> 6-month monthly trend arrays
 *
 * Components:
 *   Sparkline   — pure SVG polyline with gradient area fill (no external library)
 *   KpiCard     — metric card with embedded sparkline + MoM % change badge
 *   PnLRow      — horizontal bar row for the P&L waterfall panel
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { reportService } from '../services/reportService'
import { PageSpinner }    from '../components/ui/LoadingSpinner'
import Badge              from '../components/ui/Badge'

// ── Format helpers ───────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(n ?? 0)

const fmtCompact = (n) => {
  const abs = Math.abs(n ?? 0)
  if (abs >= 1_000_000)
    return (n < 0 ? '-' : '') + '$' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)
    return (n < 0 ? '-' : '') + '$' + (abs / 1_000).toFixed(1) + 'K'
  return fmt(n)
}

const fmtDate = (d) => {
  if (!d) return '—'
  // Parse YYYY-MM-DD as local date (not UTC) to avoid timezone-rollback display bug.
  // new Date("2026-01-01") = UTC midnight = Dec 31 in any UTC-N timezone — wrong.
  const parts = d.split('T')[0].split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtMonthShort = (ym) => {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short' })
}

// ── Sparkline SVG ────────────────────────────────────────────────────────────

let _uid = 0

function Sparkline({ data = [], color = '#6366f1', negColor = '#ef4444', height = 40, width = 100 }) {
  const id   = useRef(`spk${++_uid}`).current
  const nums = (data ?? []).filter(n => typeof n === 'number' && isFinite(n))

  if (nums.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <line x1="2" y1={height / 2} x2={width - 2} y2={height / 2}
              stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
    )
  }

  const lastVal = nums[nums.length - 1]
  const lineClr = lastVal >= 0 ? color : negColor

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const rng = max - min || 1
  const px  = 3
  const W   = width  - px * 2
  const H   = height - px * 2

  const pts = nums.map((v, i) => [
    px + (i / (nums.length - 1)) * W,
    px + H - ((v - min) / rng) * H,
  ])

  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = [
    `M ${pts[0][0].toFixed(1)},${(height - px).toFixed(1)}`,
    ...pts.map(([x, y]) => `L ${x.toFixed(1)},${y.toFixed(1)}`),
    `L ${pts[pts.length - 1][0].toFixed(1)},${(height - px).toFixed(1)} Z`,
  ].join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}
         className="overflow-visible" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={lineClr} stopOpacity="0.20" />
          <stop offset="100%" stopColor={lineClr} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={lineClr}
                strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0].toFixed(1)}
              cy={pts[pts.length - 1][1].toFixed(1)}
              r="2.5" fill={lineClr} />
    </svg>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, value, sparkData = [], color, negColor, subtitle, invertChange = false }) {
  const last = sparkData[sparkData.length - 1] ?? 0
  const prev = sparkData.length >= 2 ? sparkData[sparkData.length - 2] : null

  let pct = null
  let up  = null
  if (prev !== null) {
    if (prev !== 0) {
      pct = ((last - prev) / Math.abs(prev)) * 100
      up  = invertChange ? pct < 0 : pct > 0
    } else if (last > 0) {
      pct = 100; up = !invertChange
    } else if (last < 0) {
      pct = -100; up = invertChange
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 pt-4 pb-4
                    flex flex-col gap-2 hover:shadow-md transition-shadow duration-200">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 min-h-[20px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-400 leading-none">
          {title}
        </span>
        {pct !== null && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold
                            tabular-nums px-1.5 py-0.5 rounded-full leading-none
                            ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Value + sparkline */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[22px] font-bold tabular-nums text-slate-900 leading-none
                        truncate tracking-tight">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-1.5 leading-none truncate">{subtitle}</p>
          )}
        </div>
        <div className="shrink-0 self-end pb-0.5">
          <Sparkline data={sparkData} color={color} negColor={negColor} width={88} height={36} />
        </div>
      </div>
    </div>
  )
}

// ── P&L row ──────────────────────────────────────────────────────────────────

function PnLRow({ label, value, max, barColor, isTotal = false, indent = false }) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max * 100, 100) : 0
  return (
    <div className={`flex items-center gap-3 py-1.5
                     ${isTotal ? 'border-t border-slate-200 mt-1 pt-2.5' : ''}
                     ${indent ? 'pl-3' : ''}`}>
      <span className={`text-xs shrink-0 w-40
                        ${isTotal ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
             style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums w-20 text-right shrink-0
                        ${isTotal ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
        {fmtCompact(value)}
      </span>
    </div>
  )
}

// ── Booking status config ─────────────────────────────────────────────────────

const BOOKING_STATUSES = [
  { key: 'pending',   bar: 'bg-amber-400'   },
  { key: 'confirmed', bar: 'bg-blue-500'    },
  { key: 'completed', bar: 'bg-emerald-500' },
  { key: 'cancelled', bar: 'bg-slate-300'   },
]

// ── Refresh icon ──────────────────────────────────────────────────────────────

function RefreshIcon({ spinning }) {
  return (
    <svg className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
         fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [dash,      setDash]      = useState(null)
  const [sp,        setSp]        = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [err,       setErr]       = useState('')

  const load = useCallback((soft = false) => {
    if (soft) setRefreshing(true)
    else      setLoading(true)
    setErr('')
    Promise.all([reportService.getDashboard(), reportService.getSparklines()])
      .then(([d, s]) => { setDash(d); setSp(s) })
      .catch((e) => {
        const msg = e?.response?.data?.error || e?.message || 'Unknown error'
        setErr(`Dashboard error (HTTP ${e?.response?.status || 'network'}): ${msg}`)
      })
      .finally(() => { setLoading(false); setRefreshing(false) })
  }, [])

  useEffect(() => load(false), [load])

  if (loading) return <PageSpinner />

  if (err) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 mb-2">{err}</p>
          <p className="text-xs text-slate-400 mb-4">
            Check the browser Console tab (F12) and the backend terminal for details.
          </p>
          <button
            onClick={() => load(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg
                       hover:bg-indigo-700 transition-colors">
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const grossProfit   = dash?.gross_profit                ?? 0
  const netProfit     = dash?.net_profit                  ?? 0
  const totalRev      = dash?.total_revenue               ?? 0
  const totalCogs     = dash?.total_cogs                  ?? 0
  const totalOpex     = dash?.total_operating_expenses    ?? 0
  const receivables   = dash?.outstanding_customer_balances ?? 0
  const payables      = dash?.outstanding_vendor_balances ?? 0
  const bookingSum    = dash?.booking_summary             ?? {}
  const totalBookings = Object.values(bookingSum).reduce((a, b) => a + b, 0)
  const pnlMax        = Math.max(totalRev, totalCogs + totalOpex, 1)

  const months        = sp?.months ?? []
  const lastMonth     = months.length ? fmtMonthShort(months[months.length - 1]) : 'this month'

  const grossMargin   = totalRev > 0 ? ((grossProfit / totalRev) * 100).toFixed(1) : '0.0'
  const netMargin     = totalRev > 0 ? ((netProfit   / totalRev) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Period indicator + refresh ─────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {dash?.period && (
          <p className="text-xs text-slate-400 tabular-nums">
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 font-semibold
                            text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full mr-2">
              Year to Date
            </span>
            <span className="font-medium text-slate-600">{fmtDate(dash.period.from)}</span>
            {' – '}
            <span className="font-medium text-slate-600">{fmtDate(dash.period.to)}</span>
          </p>
        )}
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-400
                     hover:text-indigo-600 disabled:opacity-50 transition-colors">
          <RefreshIcon spinning={refreshing} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Row 1: P&L flow — Revenue → COGS → Gross Profit ───────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Revenue"
          value={fmt(totalRev)}
          sparkData={sp?.revenue}
          color="#6366f1"
          negColor="#ef4444"
          subtitle="Invoiced amount (accrual basis)"
        />
        <KpiCard
          title="Cost of Sales (COGS)"
          value={fmt(totalCogs)}
          sparkData={sp?.cogs}
          color="#f97316"
          negColor="#f97316"
          invertChange
          subtitle="Vendor costs on bookings"
        />
        <KpiCard
          title="Gross Profit"
          value={fmt(grossProfit)}
          sparkData={sp?.gross_profit}
          color="#10b981"
          negColor="#ef4444"
          subtitle="Revenue minus COGS"
        />
      </div>

      {/* ── Row 2: OpEx · Net Profit · Receivables · Payables ────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Operating Expenses"
          value={fmt(totalOpex)}
          sparkData={sp?.expenses}
          color="#f59e0b"
          negColor="#f59e0b"
          invertChange
          subtitle={`${lastMonth} — OpEx outflows`}
        />
        <KpiCard
          title="Net Profit"
          value={fmt(netProfit)}
          sparkData={sp?.net_profit}
          color="#3b82f6"
          negColor="#ef4444"
          subtitle="After all expenses"
        />
        <KpiCard
          title="Receivables"
          value={fmt(receivables)}
          sparkData={sp?.receivables}
          color="#ef4444"
          negColor="#ef4444"
          invertChange
          subtitle="Outstanding customer balances"
        />
        <KpiCard
          title="Vendor Payables"
          value={fmt(payables)}
          sparkData={sp?.payables}
          color="#8b5cf6"
          negColor="#8b5cf6"
          invertChange
          subtitle="Amounts owed to vendors"
        />
      </div>

      {/* ── P&L waterfall + Net Profit panel ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* P&L mini waterfall */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-400">
              P&amp;L Breakdown
            </h2>
            <span className="text-[10px] text-slate-400 tabular-nums">
              {fmtDate(dash?.period?.from)} – {fmtDate(dash?.period?.to)}
            </span>
          </div>
          <div className="space-y-0.5">
            <PnLRow label="Total Revenue"        value={totalRev}      max={pnlMax} barColor="bg-indigo-500" />
            <PnLRow label="Cost of Goods (COGS)" value={totalCogs}     max={pnlMax} barColor="bg-amber-400"  indent />
            <PnLRow label="Gross Profit"          value={grossProfit}   max={pnlMax}
                    barColor={grossProfit >= 0 ? 'bg-emerald-500' : 'bg-red-400'} isTotal />
            <PnLRow label="Operating Expenses"   value={totalOpex}     max={pnlMax} barColor="bg-rose-400"   indent />
            <PnLRow label="Net Profit"            value={netProfit}     max={pnlMax}
                    barColor={netProfit >= 0 ? 'bg-blue-500' : 'bg-red-500'} isTotal />
          </div>
        </div>

        {/* Net profit + margin panel */}
        <div className={`lg:col-span-2 rounded-xl border flex flex-col justify-between p-5
                         ${netProfit >= 0 ? 'bg-emerald-50 border-emerald-200'
                                          : 'bg-red-50 border-red-200'}`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-400">
            Net Profit
          </p>
          <div className="mt-2">
            <p className={`text-4xl font-black tabular-nums leading-none tracking-tight
                           ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fmt(netProfit)}
            </p>
            <p className="text-[11px] text-slate-500 mt-2">
              {netProfit >= 0 ? '✓ Profitable this period' : '✕ Loss-making this period'}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200/70 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Gross Margin</p>
              <p className="text-lg font-bold tabular-nums text-slate-800 mt-0.5">{grossMargin}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Net Margin</p>
              <p className="text-lg font-bold tabular-nums text-slate-800 mt-0.5">{netMargin}%</p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Bottom row: recent payments + bookings by status ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent Payments table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-400">
              Recent Payments
            </h2>
          </div>
          {(dash?.recent_payments ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    {['Reference', 'Customer', 'Method', 'Amount', 'Date'].map(h => (
                      <th key={h}
                          className={`px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide
                                     text-slate-400 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dash.recent_payments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-indigo-600">
                        {p.payment_reference}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-700">{p.customer_name}</td>
                      <td className="px-5 py-3">
                        <Badge label={p.payment_method?.replace(/_/g, ' ')} variant="default" />
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-emerald-700">
                        {fmt(p.amount)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-400">{fmtDate(p.payment_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bookings by status */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-400">
              Bookings by Status
            </h2>
          </div>
          <div className="p-5 space-y-3.5">
            {BOOKING_STATUSES.map(({ key, bar }) => {
              const count = bookingSum[key] ?? 0
              const pct   = totalBookings > 0 ? Math.round((count / totalBookings) * 100) : 0
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${bar}`} />
                      <span className="capitalize text-slate-600">{key}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-400 tabular-nums">{pct}%</span>
                      <span className="font-bold tabular-nums text-slate-800 w-5 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${bar}`}
                         style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {totalBookings === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">No bookings yet.</p>
            )}
            {totalBookings > 0 && (
              <div className="pt-3 mt-1 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Total bookings</span>
                <span className="text-sm font-bold tabular-nums text-slate-800">{totalBookings}</span>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  )
}
