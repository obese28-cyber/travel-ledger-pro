/**
 * pages/Reports.jsx -- Financial reports dashboard.
 *
 * Route: /reports
 *
 * Tabs:
 *   1. Profit & Loss
 *   2. Daily Sales
 *   3. Customer Balances
 *   4. Vendor Balances
 *
 * Connects to:
 *   GET /api/reports/profit-loss
 *   GET /api/reports/daily-sales
 *   GET /api/reports/customer-balances
 *   GET /api/reports/vendor-balances
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Link }           from 'react-router-dom'
import { reportService }  from '../services/reportService'
import { useToast }       from '../components/ui/Toast'
import { PageSpinner }    from '../components/ui/LoadingSpinner'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'

function getDefaultDates() {
  const now   = new Date()
  const from  = new Date(now.getFullYear(), now.getMonth(), 1)
  const to    = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}

// ── Shared sub-components ──────────────────────────────────────────────────────
function SectionCard({ title, children, action }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="px-5 py-12 text-center text-slate-400 text-sm">{message}</div>
  )
}

// ── TAB 1: Profit & Loss ───────────────────────────────────────────────────────
function ProfitLossTab({ dateFrom, dateTo }) {
  const toast  = useToast()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reportService.getProfitLoss({ date_from: dateFrom, date_to: dateTo })
      setData(res)
    } catch {
      toast.error('Failed to load Profit & Loss report.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16"><PageSpinner /></div>
  if (!data)   return <EmptyState message="No data available." />

  const revenue   = data.revenue            || 0
  const cogs      = data.cogs?.total        || 0
  const grossProfit = data.gross_profit     || 0
  const opex      = data.operating_expenses?.total || 0
  const netProfit = data.net_profit         || 0

  const cogsBreakdown  = data.cogs?.breakdown              || []
  const opexBreakdown  = data.operating_expenses?.breakdown || []

  const marginPct = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-4">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Revenue',       value: fmt(revenue),    color: 'indigo' },
          { label: 'Gross Profit',  value: fmt(grossProfit),color: grossProfit >= 0 ? 'emerald' : 'red' },
          { label: 'Net Profit',    value: fmt(netProfit),  color: netProfit >= 0 ? 'emerald' : 'red' },
          { label: 'Net Margin',    value: `${marginPct}%`, color: Number(marginPct) >= 0 ? 'slate' : 'red' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-4 ${
            k.color === 'indigo'  ? 'bg-indigo-50 text-indigo-700'  :
            k.color === 'emerald' ? 'bg-emerald-50 text-emerald-700' :
            k.color === 'red'     ? 'bg-red-50 text-red-700'        :
                                    'bg-slate-50 text-slate-700'
          }`}>
            <p className="text-xs opacity-70">{k.label}</p>
            <p className="text-xl font-bold mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue line */}
        <SectionCard title="Revenue">
          <div className="p-5">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Total Revenue</span>
              <span className="text-sm font-semibold text-indigo-600">{fmt(revenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Cost of Sales (COGS)</span>
              <span className="text-sm font-semibold text-red-500">- {fmt(cogs)}</span>
            </div>
            <div className="flex justify-between items-center pt-3">
              <span className="text-sm font-bold text-slate-800">Gross Profit</span>
              <span className={`text-sm font-bold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmt(grossProfit)}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* Operating Expenses */}
        <SectionCard title="Operating Expenses">
          {opexBreakdown.length === 0 ? (
            <EmptyState message="No operating expenses recorded." />
          ) : (
            <div className="divide-y divide-slate-50">
              {opexBreakdown.map((item, i) => (
                <div key={i} className="flex justify-between items-center px-5 py-3">
                  <span className="text-sm text-slate-600">
                    {item.account_name || item.account_code || 'Expense'}
                  </span>
                  <span className="text-sm font-medium text-red-500">- {fmt(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-5 py-3 bg-slate-50">
                <span className="text-sm font-bold text-slate-800">Total OpEx</span>
                <span className="text-sm font-bold text-red-600">- {fmt(opex)}</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* COGS breakdown */}
      <SectionCard title="Cost of Sales Breakdown">
        {cogsBreakdown.filter(i => i.amount > 0).length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-slate-400">No vendor costs recorded for this period.</p>
            <p className="text-xs text-slate-300 mt-1">
              Create vendor bills on a booking to track cost of sales.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {cogsBreakdown.filter(i => i.amount > 0).map((item, i) => (
              <div key={i} className="flex justify-between items-center px-5 py-3">
                <div>
                  <span className="text-sm text-slate-700">
                    {item.account_name || item.account_code || 'Vendor Cost'}
                  </span>
                  {item.source === 'booking_estimate' && (
                    <span className="ml-2 text-xs text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
                      estimated
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-700">{fmt(item.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center px-5 py-3 bg-slate-50">
              <span className="text-sm font-bold text-slate-800">Total COGS</span>
              <span className="text-sm font-bold text-red-600">- {fmt(cogs)}</span>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Net Profit summary */}
      <div className={`rounded-2xl p-5 flex justify-between items-center ${
        netProfit >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
      }`}>
        <div>
          <p className={`text-sm font-semibold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            Net Profit / Loss
          </p>
          <p className={`text-xs mt-0.5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            Gross Profit minus all Operating Expenses
          </p>
        </div>
        <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {fmt(netProfit)}
        </p>
      </div>
    </div>
  )
}

// ── TAB 2: Daily Sales ─────────────────────────────────────────────────────────
function DailySalesTab({ dateFrom, dateTo }) {
  const toast  = useToast()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reportService.getDailySales({ date_from: dateFrom, date_to: dateTo })
      setData(res)
    } catch {
      toast.error('Failed to load daily sales report.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-16"><PageSpinner /></div>
  if (!data)   return <EmptyState message="No data available." />

  const daily  = data.daily   || []
  const totals = data.totals  || {}

  const totalInvoiced  = totals.invoiced  || daily.reduce((s, d) => s + (d.invoiced  || 0), 0)
  const totalCollected = totals.collected || daily.reduce((s, d) => s + (d.collected || 0), 0)
  const collectionRate = totalInvoiced > 0
    ? ((totalCollected / totalInvoiced) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-indigo-50 text-indigo-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Total Invoiced</p>
          <p className="text-xl font-bold mt-1">{fmt(totalInvoiced)}</p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Total Collected</p>
          <p className="text-xl font-bold mt-1">{fmt(totalCollected)}</p>
        </div>
        <div className="bg-slate-50 text-slate-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Collection Rate</p>
          <p className="text-xl font-bold mt-1">{collectionRate}%</p>
        </div>
      </div>

      {/* Daily table */}
      <SectionCard title="Daily Breakdown">
        {daily.length === 0 ? (
          <EmptyState message="No sales data for this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoiced</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Collected</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {daily.map((row, i) => {
                  const outstanding = (row.invoiced || 0) - (row.collected || 0)
                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="px-5 py-3 text-right text-indigo-600 font-medium">{fmt(row.invoiced)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600 font-medium">{fmt(row.collected)}</td>
                      <td className="px-5 py-3 text-right font-medium">
                        <span className={outstanding > 0 ? 'text-amber-600' : 'text-slate-400'}>
                          {fmt(outstanding)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td className="px-5 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">Totals</td>
                  <td className="px-5 py-3 text-right font-bold text-indigo-600">{fmt(totalInvoiced)}</td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-600">{fmt(totalCollected)}</td>
                  <td className="px-5 py-3 text-right font-bold text-amber-600">{fmt(totalInvoiced - totalCollected)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── TAB 3: Customer Balances ───────────────────────────────────────────────────
function CustomerBalancesTab() {
  const toast  = useToast()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    reportService.getCustomerBalances()
      .then(res => setData(res))
      .catch(() => toast.error('Failed to load customer balances.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16"><PageSpinner /></div>
  if (!data)   return <EmptyState message="No data available." />

  const customers     = data.customers         || []
  const totalOutstanding = data.total_outstanding ?? customers.reduce((s, c) => s + (c.total_outstanding || 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-red-50 text-red-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Total Outstanding</p>
          <p className="text-xl font-bold mt-1">{fmt(totalOutstanding)}</p>
        </div>
        <div className="bg-slate-50 text-slate-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Customers with Balance</p>
          <p className="text-xl font-bold mt-1">{customers.filter(c => c.total_outstanding > 0).length}</p>
        </div>
      </div>

      <SectionCard title="Customer Balances">
        {customers.length === 0 ? (
          <EmptyState message="All customers are fully paid up." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Open Invoices</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {customers.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/customers/${row.customer_id}`}
                        className="text-indigo-600 hover:underline font-medium"
                      >
                        {row.customer_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-600">{row.open_invoices ?? '--'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold">
                      <span className={row.total_outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}>
                        {fmt(row.total_outstanding)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/customers/${row.customer_id}`}
                        className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={2} className="px-5 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">
                    Total Outstanding
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-red-600">{fmt(totalOutstanding)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ── TAB 4: Vendor Balances ─────────────────────────────────────────────────────
function VendorBalancesTab() {
  const toast  = useToast()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    reportService.getVendorBalances()
      .then(res => setData(res))
      .catch(() => toast.error('Failed to load vendor balances.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16"><PageSpinner /></div>
  if (!data)   return <EmptyState message="No data available." />

  const vendors       = data.vendors          || []
  const totalOutstanding = data.total_outstanding ?? vendors.reduce((s, v) => s + (v.total_outstanding || 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-red-50 text-red-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Total Owed to Vendors</p>
          <p className="text-xl font-bold mt-1">{fmt(totalOutstanding)}</p>
        </div>
        <div className="bg-slate-50 text-slate-700 rounded-xl p-4">
          <p className="text-xs opacity-70">Vendors with Open Bills</p>
          <p className="text-xl font-bold mt-1">{vendors.filter(v => v.total_outstanding > 0).length}</p>
        </div>
      </div>

      <SectionCard title="Vendor Balances">
        {vendors.length === 0 ? (
          <EmptyState message="No outstanding vendor balances." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Open Bills</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vendors.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/vendors/${row.vendor_id}`}
                        className="text-indigo-600 hover:underline font-medium"
                      >
                        {row.vendor_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 capitalize text-slate-500 text-xs">
                      {row.vendor_type?.replace(/_/g, ' ') || '--'}
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-600">{row.open_bills ?? '--'}</td>
                    <td className="px-5 py-3.5 text-right font-semibold">
                      <span className={row.total_outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}>
                        {fmt(row.total_outstanding)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/bills?vendor=${row.vendor_id}`}
                        className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        Bills
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">
                    Total Owed
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-red-600">{fmt(totalOutstanding)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}


// ── TAB 5: Trial Balance ───────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { key: "staff_cost",          label: "Staff Cost" },
  { key: "fuel_lubricant",      label: "Fuel & Lubricant" },
  { key: "rent",                label: "Rent" },
  { key: "periodicals",         label: "Periodicals" },
  { key: "audit_fees",          label: "Audit Fees" },
  { key: "legal_fees",          label: "Legal Fees" },
  { key: "travel_transport",    label: "Travel & Transportation" },
  { key: "electricity_water",   label: "Electricity and Water" },
  { key: "communication",       label: "Communication & Broadband" },
  { key: "license_guarantee",   label: "License & Guarantee" },
  { key: "bank_charges",        label: "Bank Charges" },
  { key: "office_expense",      label: "Office Expense" },
  { key: "printing_stationery", label: "Printing & Stationery" },
  { key: "repairs_vehicles",    label: "Repairs - Motor Vehicles" },
  { key: "repairs_fixtures",    label: "Repairs - Fixtures & Fittings" },
  { key: "cleaning_sanitation", label: "Cleaning & Sanitation" },
  { key: "bad_debt",            label: "Bad Debt" },
  { key: "depreciation",        label: "Depreciation" },
  { key: "insurance",           label: "Insurance" },
  { key: "selling_distribution",label: "Selling and Distribution" },
  { key: "finance_cost",        label: "Finance Cost" },
]

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" },   { value: 4, label: "April" },
  { value: 5, label: "May" },     { value: 6, label: "June" },
  { value: 7, label: "July" },    { value: 8, label: "August" },
  { value: 9, label: "September"},{ value: 10, label: "October" },
  { value: 11, label: "November"},{ value: 12, label: "December" },
]

function TrialBalanceTab() {
  const toast = useToast()

  const now   = new Date()
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [year,    setYear]    = useState(now.getFullYear())
  const [data,    setData]    = useState(null)
  const [amounts, setAmounts] = useState({})   // { category_key: string }
  const [notes,   setNotes]   = useState({})   // { category_key: string }
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [dirty,   setDirty]   = useState(false)

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i)

  // Load data for selected period
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reportService.getTrialBalance(month, year)
      setData(res)
      // Seed editable amounts from saved entries
      const amtMap  = {}
      const noteMap = {}
      ;(res.expenses || []).forEach(e => {
        amtMap[e.category_key]  = e.amount > 0 ? String(e.amount.toFixed(2)) : ''
        noteMap[e.category_key] = e.notes || ''
      })
      setAmounts(amtMap)
      setNotes(noteMap)
      setDirty(false)
    } catch {
      toast.error('Failed to load trial balance.')
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { load() }, [load])

  function handleAmountChange(key, val) {
    setAmounts(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }
  function handleNotesChange(key, val) {
    setNotes(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const entries = EXPENSE_CATEGORIES.map(cat => ({
        category_key: cat.key,
        amount:       parseFloat(amounts[cat.key]) || 0,
        notes:        notes[cat.key]?.trim() || null,
      }))
      await reportService.saveTrialBalanceExpenses(year, month, entries)
      toast.success('Trial balance saved.')
      load()
    } catch {
      toast.error('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  // Live totals from current input (before save)
  const totalOpex = EXPENSE_CATEGORIES.reduce((s, c) => s + (parseFloat(amounts[c.key]) || 0), 0)
  const revenue     = data?.revenue     ?? 0
  const cogs        = data?.cogs        ?? 0
  const grossProfit = revenue - cogs
  const netProfit   = grossProfit - totalOpex

  const monthLabel = MONTHS.find(m => m.value === month)?.label || ''

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white">
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white">
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        {dirty && (
          <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                     bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg
                     transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? 'Saving…' : 'Save Trial Balance'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Expense entry table ── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              GENERAL, SELLING &amp; ADMIN EXPENSES — {monthLabel} {year}
            </p>
          </div>

          {loading ? (
            <div className="py-12"><PageSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Expense Category</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount (USD)</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {EXPENSE_CATEGORIES.map((cat, idx) => {
                    const val = amounts[cat.key] ?? ''
                    const amt = parseFloat(val) || 0
                    return (
                      <tr key={cat.key} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-2.5 text-xs text-slate-400 w-8">{idx + 1}</td>
                        <td className="px-5 py-2.5 text-sm text-slate-700 font-medium whitespace-nowrap">
                          {cat.label}
                        </td>
                        <td className="px-5 py-2 text-right w-36">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={val}
                            onChange={e => handleAmountChange(cat.key, e.target.value)}
                            placeholder="0.00"
                            className="w-full text-right px-2.5 py-1.5 text-sm border border-slate-200
                                       rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30
                                       focus:border-indigo-500 bg-white"
                          />
                        </td>
                        <td className="px-5 py-2 w-52">
                          <input
                            type="text"
                            value={notes[cat.key] ?? ''}
                            onChange={e => handleNotesChange(cat.key, e.target.value)}
                            placeholder="Optional note"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200
                                       rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30
                                       focus:border-indigo-500 text-slate-500"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={2} className="px-5 py-3 text-sm font-bold text-slate-700">
                      Total Operating Expenses
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-slate-800 whitespace-nowrap">
                      {fmt(totalOpex)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Right: Summary panel ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Summary — {monthLabel} {year}
              </p>
            </div>
            <div className="p-5 space-y-0">
              {[
                { label: 'Total Revenue',          value: revenue,     cls: 'text-slate-800' },
                { label: 'Cost of Sales (COGS)',    value: cogs,        cls: 'text-slate-500', sub: true },
              ].map(r => (
                <div key={r.label} className={`flex justify-between items-center py-2.5 border-b border-slate-50 ${r.sub ? 'pl-4' : ''}`}>
                  <span className="text-sm text-slate-500">{r.label}</span>
                  <span className={`text-sm font-semibold ${r.cls}`}>{fmt(r.value)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-200">
                <span className="text-sm font-semibold text-slate-700">Gross Profit</span>
                <span className={`text-sm font-bold ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmt(grossProfit)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-slate-50 pl-4">
                <span className="text-sm text-slate-500">General, Selling &amp; Admin</span>
                <span className="text-sm font-semibold text-slate-700">{fmt(totalOpex)}</span>
              </div>
              <div className="flex justify-between items-center pt-3">
                <span className="text-base font-bold text-slate-800">Net Profit / (Loss)</span>
                <span className={`text-base font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmt(netProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Gross margin card */}
          <div className={`rounded-xl border p-5 ${netProfit >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
            <p className="text-xs font-medium opacity-60 mb-1">Net Margin</p>
            <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0'}%
            </p>
            <p className="text-xs opacity-50 mt-1">Net profit as % of revenue</p>
          </div>

          {/* Opex breakdown mini-table */}
          {totalOpex > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase">Top Expenses</p>
              </div>
              <div className="p-3 space-y-1">
                {EXPENSE_CATEGORIES
                  .filter(c => parseFloat(amounts[c.key]) > 0)
                  .sort((a, b) => (parseFloat(amounts[b.key]) || 0) - (parseFloat(amounts[a.key]) || 0))
                  .slice(0, 6)
                  .map(c => {
                    const amt = parseFloat(amounts[c.key]) || 0
                    const pct = totalOpex > 0 ? (amt / totalOpex * 100).toFixed(0) : 0
                    return (
                      <div key={c.key}>
                        <div className="flex justify-between items-center text-xs mb-0.5">
                          <span className="text-slate-600 truncate">{c.label}</span>
                          <span className="font-semibold text-slate-700 ml-2 shrink-0">{fmt(amt)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-400 rounded-full"
                               style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Reports Page ──────────────────────────────────────────────────────────
const TABS = [
  { id: 'pl',       label: 'Profit & Loss',      hasDateRange: true },
  { id: 'sales',    label: 'Daily Sales',         hasDateRange: true },
  { id: 'customers',label: 'Customer Balances',   hasDateRange: false },
  { id: 'vendors',  label: 'Vendor Balances',     hasDateRange: false },
  { id: 'trial',    label: 'Trial Balance',        hasDateRange: false },
]

const ICON_PRINT = 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z'

export default function Reports() {
  const [activeTab, setActiveTab] = useState('pl')
  const defaults = getDefaultDates()
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo,   setDateTo]   = useState(defaults.to)

  const currentTab = TABS.find(t => t.id === activeTab)

  function handlePrint() {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Financial reports and business analytics.</p>
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PRINT} />
          </svg>
          Print
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 p-1 flex flex-wrap gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Range (only for date-sensitive tabs) */}
      {currentTab?.hasDateRange && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
          {/* Quick presets */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'This Month', fn: () => {
                  const n = new Date()
                  setDateFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10))
                  setDateTo(new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10))
              }},
              { label: 'Last Month', fn: () => {
                  const n = new Date()
                  setDateFrom(new Date(n.getFullYear(), n.getMonth() - 1, 1).toISOString().slice(0, 10))
                  setDateTo(new Date(n.getFullYear(), n.getMonth(), 0).toISOString().slice(0, 10))
              }},
              { label: 'This Year', fn: () => {
                  const n = new Date()
                  setDateFrom(`${n.getFullYear()}-01-01`)
                  setDateTo(`${n.getFullYear()}-12-31`)
              }},
            ].map(p => (
              <button
                key={p.label}
                onClick={p.fn}
                className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'pl'        && <ProfitLossTab      dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'sales'     && <DailySalesTab      dateFrom={dateFrom} dateTo={dateTo} />}
      {activeTab === 'customers' && <CustomerBalancesTab />}
      {activeTab === 'vendors'   && <VendorBalancesTab  />}
      {activeTab === 'trial'     && <TrialBalanceTab    />}
    </div>
  )
}
