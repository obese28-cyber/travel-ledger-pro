/**
 * Expenses.jsx — Full expense management page.
 *
 * Tabs:
 *   Dashboard   — totals, charts, recent transactions
 *   Transactions — full filterable list
 *   Add Expense  — record a new expense
 *   By Category  — click a category to see its full ledger
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { expenseService } from '../services/expenseService'
import { useToast } from '../components/ui/Toast'

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const fmt = (n) =>
  typeof n === 'number'
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'

const today = () => new Date().toISOString().split('T')[0]
const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card',   label: 'Credit Card' },
  { value: 'mobile_money',  label: 'Mobile Money' },
]

const EXPENSE_CATEGORIES = [
  { key: 'staff_cost',           label: 'Staff Cost' },
  { key: 'fuel_lubricant',       label: 'Fuel & Lubricant' },
  { key: 'rent',                 label: 'Rent' },
  { key: 'periodicals',          label: 'Periodicals' },
  { key: 'audit_fees',           label: 'Audit Fees' },
  { key: 'legal_fees',           label: 'Legal Fees' },
  { key: 'travel_transport',     label: 'Travel & Transportation' },
  { key: 'electricity_water',    label: 'Electricity and Water' },
  { key: 'communication',        label: 'Communication & Broadband' },
  { key: 'license_guarantee',    label: 'License & Guarantee' },
  { key: 'bank_charges',         label: 'Bank Charges' },
  { key: 'office_expense',       label: 'Office Expense' },
  { key: 'printing_stationery',  label: 'Printing & Stationery' },
  { key: 'repairs_vehicles',     label: 'Repairs – Motor Vehicles' },
  { key: 'repairs_fixtures',     label: 'Repairs – Fixtures & Fittings' },
  { key: 'cleaning_sanitation',  label: 'Cleaning & Sanitation' },
  { key: 'bad_debt',             label: 'Bad Debt' },
  { key: 'depreciation',         label: 'Depreciation' },
  { key: 'insurance',            label: 'Insurance' },
  { key: 'selling_distribution', label: 'Selling & Distribution' },
  { key: 'finance_cost',         label: 'Finance Cost' },
]

const CATEGORY_COLORS = [
  '#6366f1','#f59e0b','#10b981','#3b82f6','#ef4444',
  '#8b5cf6','#14b8a6','#f97316','#ec4899','#84cc16',
  '#06b6d4','#a78bfa','#fb7185','#34d399','#fbbf24',
  '#38bdf8','#c084fc','#f87171','#4ade80','#e879f9','#22d3ee',
]

function Badge({ label, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-100 text-indigo-700',
    green:  'bg-emerald-100 text-emerald-700',
    yellow: 'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    slate:  'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[color] || colors.slate}`}>
      {label}
    </span>
  )
}

function MethodBadge({ method }) {
  const map = {
    cash:          { label: 'Cash',          color: 'green' },
    bank_transfer: { label: 'Bank Transfer', color: 'indigo' },
    credit_card:   { label: 'Credit Card',   color: 'yellow' },
    mobile_money:  { label: 'Mobile Money',  color: 'slate' },
  }
  const m = map[method] || { label: method, color: 'slate' }
  return <Badge label={m.label} color={m.color} />
}

// ─── Mini bar chart (CSS-only) ────────────────────────────────────────────────
function MiniBarChart({ data, labelKey, valueKey, color = '#6366f1' }) {
  if (!data || !data.length) return <p className="text-sm text-slate-400 py-4 text-center">No data</p>
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1)
  return (
    <div className="space-y-2">
      {data.map((row, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-36 truncate text-slate-500 shrink-0">{row[labelKey]}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.max((row[valueKey] / max) * 100, 2)}%`, backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
            />
          </div>
          <span className="w-20 text-right font-medium text-slate-700 shrink-0">
            {fmt(row[valueKey])}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ title, value, sub, icon, colorClass = 'text-indigo-600', bgClass = 'bg-indigo-50' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex gap-4 items-start">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bgClass}`}>
        <svg className={`w-5 h-5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{title}</p>
        <p className="text-xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── DASHBOARD TAB ────────────────────────────────────────────────────────────
function DashboardTab({ dateFrom, dateTo, onCategoryClick }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    setLoading(true)
    expenseService.getSummary({ date_from: dateFrom, date_to: dateTo })
      .then(setData)
      .catch(() => toast.error('Failed to load expense summary'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!data) return null

  const topCategories = [...(data.by_category || [])]
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Expenses"
          value={`$${fmt(data.total)}`}
          sub={`${dateFrom} – ${dateTo}`}
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          colorClass="text-red-600" bgClass="bg-red-50"
        />
        <StatCard
          title="Cash Outflow"
          value={`$${fmt(data.cash_outflow)}`}
          sub="Paid by cash"
          icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          colorClass="text-amber-600" bgClass="bg-amber-50"
        />
        <StatCard
          title="Bank Outflow"
          value={`$${fmt(data.bank_outflow)}`}
          sub="Paid by bank/card"
          icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          colorClass="text-blue-600" bgClass="bg-blue-50"
        />
        <StatCard
          title="Categories Used"
          value={(data.by_category || []).filter(c => c.total > 0).length}
          sub={`of ${EXPENSE_CATEGORIES.length} categories`}
          icon="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          colorClass="text-indigo-600" bgClass="bg-indigo-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top categories bar chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Expenses by Category</h3>
          {topCategories.length > 0 ? (
            <div className="space-y-3">
              {topCategories.map((cat, i) => {
                const pct = data.total > 0 ? ((cat.total / data.total) * 100).toFixed(1) : 0
                return (
                  <div
                    key={cat.key}
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                    onClick={() => onCategoryClick(cat.key)}
                  >
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600 truncate">{cat.label}</span>
                        <span className="text-slate-500 ml-2 shrink-0">{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 w-20 text-right shrink-0">
                      ${fmt(cat.total)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">No expenses recorded for this period.</p>
          )}
        </div>

        {/* Monthly trend */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Monthly Trend</h3>
          {(data.monthly || []).length > 0 ? (
            <MiniBarChart
              data={data.monthly}
              labelKey="month"
              valueKey="total"
            />
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">No monthly data available.</p>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-700 mb-4">Recent Expenses</h3>
        {(data.recent || []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Reference</th>
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pr-4 font-medium">Method</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recent.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{exp.expense_date}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">{exp.expense_reference}</td>
                    <td className="py-2 pr-4">
                      <Badge label={exp.category_label} color="indigo" />
                    </td>
                    <td className="py-2 pr-4 text-slate-600 max-w-[200px] truncate">{exp.description}</td>
                    <td className="py-2 pr-4"><MethodBadge method={exp.payment_method} /></td>
                    <td className="py-2 text-right font-semibold text-red-600">${fmt(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">No recent expenses.</p>
        )}
      </div>
    </div>
  )
}

// ─── TRANSACTIONS TAB ─────────────────────────────────────────────────────────
function TransactionsTab({ dateFrom, dateTo, onCategoryClick }) {
  const [items, setItems]       = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [category, setCategory] = useState('')
  const [method, setMethod]     = useState('')
  const [search, setSearch]     = useState('')
  const toast = useToast()

  const load = useCallback(() => {
    setLoading(true)
    expenseService.list({
      date_from: dateFrom,
      date_to: dateTo,
      category: category || undefined,
      payment_method: method || undefined,
      search: search || undefined,
      page,
      per_page: 50,
    }).then(res => {
      setItems(res.data || [])
      setTotal(res.total || 0)
    }).catch(() => toast.error('Failed to load expenses'))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, category, method, search, page])

  useEffect(() => { load() }, [load])

  const totalAmt = items.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search description or payee…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
          />
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1) }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Categories</option>
            {EXPENSE_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <select
            value={method}
            onChange={e => { setMethod(e.target.value); setPage(1) }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Methods</option>
            {PAYMENT_METHODS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No expenses found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Vendor / Payee</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">A/C Code</th>
                  <th className="px-4 py-3 font-medium">Created By</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{exp.expense_date}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{exp.expense_reference}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onCategoryClick(exp.category)}
                        className="text-indigo-600 hover:underline text-left"
                      >
                        <Badge label={exp.category_label} color="indigo" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                      <span className="block truncate">{exp.description}</span>
                      {exp.notes && <span className="text-xs text-slate-400 block truncate">{exp.notes}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{exp.vendor_payee || '—'}</td>
                    <td className="px-4 py-3"><MethodBadge method={exp.payment_method} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{exp.account_code}</td>
                    <td className="px-4 py-3 text-slate-500">{exp.created_by_name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600 whitespace-nowrap">
                      ${fmt(exp.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={8} className="px-4 py-3 text-sm text-slate-500">
                    Showing {items.length} of {total} records
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">
                    ${fmt(totalAmt)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {page} of {Math.ceil(total / 50)}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 50 >= total}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ADD EXPENSE TAB ──────────────────────────────────────────────────────────
function AddExpenseTab({ onSuccess }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    category:       '',
    description:    '',
    vendor_payee:   '',
    amount:         '',
    payment_method: 'bank_transfer',
    expense_date:   today(),
    receipt_number: '',
    notes:          '',
  })
  const [errors, setErrors] = useState({})

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.category)    e.category    = 'Category is required'
    if (!form.description) e.description = 'Description is required'
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0)
      e.amount = 'Enter a valid amount greater than zero'
    if (!form.payment_method) e.payment_method = 'Payment method is required'
    if (!form.expense_date)   e.expense_date   = 'Date is required'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      await expenseService.create({
        ...form,
        amount: parseFloat(form.amount),
      })
      toast.success('Expense recorded successfully')
      onSuccess()
      setForm({
        category: '', description: '', vendor_payee: '', amount: '',
        payment_method: 'bank_transfer', expense_date: today(),
        receipt_number: '', notes: '',
      })
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to save expense'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // Selected category info
  const selectedCat = EXPENSE_CATEGORIES.find(c => c.key === form.category)
  const accountCodeMap = {
    staff_cost: '6100', fuel_lubricant: '6110', rent: '6120',
    periodicals: '6130', audit_fees: '6140', legal_fees: '6150',
    travel_transport: '6160', electricity_water: '6170', communication: '6180',
    license_guarantee: '6190', bank_charges: '6200', office_expense: '6210',
    printing_stationery: '6220', repairs_vehicles: '6230', repairs_fixtures: '6240',
    cleaning_sanitation: '6250', bad_debt: '6260', depreciation: '6270',
    insurance: '6280', selling_distribution: '6290', finance_cost: '6300',
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-1">Record New Expense</h3>
        <p className="text-sm text-slate-500 mb-6">
          This will automatically create a double-entry journal:
          {' '}<strong>DR Expense Account → CR {form.payment_method === 'cash' ? 'Cash (1000)' : 'Bank (1010)'}</strong>
        </p>

        {/* Accounting preview */}
        {form.category && form.amount && (
          <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm">
            <p className="font-semibold text-indigo-700 mb-2">Journal Entry Preview</p>
            <div className="font-mono text-xs space-y-1">
              <div className="flex gap-4">
                <span className="w-20 text-indigo-600">DR {accountCodeMap[form.category] || '6xxx'}</span>
                <span className="flex-1 text-slate-600">{selectedCat?.label}</span>
                <span className="text-slate-700 font-semibold">${fmt(parseFloat(form.amount) || 0)}</span>
              </div>
              <div className="flex gap-4">
                <span className="w-20 text-emerald-600">CR {form.payment_method === 'cash' ? '1000' : '1010'}</span>
                <span className="flex-1 text-slate-600">{form.payment_method === 'cash' ? 'Cash' : 'Bank'}</span>
                <span className="text-slate-700 font-semibold">${fmt(parseFloat(form.amount) || 0)}</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Expense Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.category ? 'border-red-400' : 'border-slate-200'}`}
              >
                <option value="">Select a category…</option>
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="e.g. Office electricity bill — May 2026"
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.description ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
            </div>

            {/* Vendor/Payee */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vendor / Payee</label>
              <input
                type="text"
                value={form.vendor_payee}
                onChange={e => set('vendor_payee', e.target.value)}
                placeholder="e.g. City Power Co."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Receipt Number */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Receipt / Ref Number</label>
              <input
                type="text"
                value={form.receipt_number}
                onChange={e => set('receipt_number', e.target.value)}
                placeholder="e.g. REC-001"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                  className={`w-full border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.amount ? 'border-red-400' : 'border-slate-200'}`}
                />
              </div>
              {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
            </div>

            {/* Expense Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.expense_date}
                onChange={e => set('expense_date', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.expense_date ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.expense_date && <p className="text-xs text-red-500 mt-1">{errors.expense_date}</p>}
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={form.payment_method}
                onChange={e => set('payment_method', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.payment_method ? 'border-red-400' : 'border-slate-200'}`}
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {form.payment_method === 'cash' ? '→ Credits Cash account (1000)' : '→ Credits Bank account (1010)'}
              </p>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                placeholder="Additional details…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {saving ? 'Saving…' : 'Record Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── BY CATEGORY TAB ─────────────────────────────────────────────────────────
function ByCategoryTab({ dateFrom, dateTo, initialKey, onCategoryClick }) {
  const [categories, setCategories] = useState([])
  const [selected, setSelected]     = useState(initialKey || null)
  const [ledger, setLedger]         = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    expenseService.getCategories()
      .then(setCategories)
      .catch(() => toast.error('Failed to load categories'))
  }, [])

  useEffect(() => {
    if (initialKey) setSelected(initialKey)
  }, [initialKey])

  useEffect(() => {
    if (!selected) return
    setLedgerLoading(true)
    expenseService.getCategoryLedger(selected, { date_from: dateFrom, date_to: dateTo })
      .then(setLedger)
      .catch(() => toast.error('Failed to load category ledger'))
      .finally(() => setLedgerLoading(false))
  }, [selected, dateFrom, dateTo])

  return (
    <div className="flex gap-6">
      {/* Category list (left panel) */}
      <div className="w-64 shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Categories</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {categories.map((cat, i) => (
              <button
                key={cat.key}
                onClick={() => setSelected(cat.key)}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50 transition-colors text-left ${selected === cat.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                  />
                  <span className="truncate">{cat.label}</span>
                </div>
                {cat.total_spent > 0 && (
                  <span className={`text-xs ml-2 shrink-0 ${selected === cat.key ? 'text-indigo-600' : 'text-slate-400'}`}>
                    ${fmt(cat.total_spent)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ledger (right panel) */}
      <div className="flex-1 min-w-0">
        {!selected ? (
          <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-64">
            <p className="text-slate-400 text-sm">← Select a category to view its ledger</p>
          </div>
        ) : ledgerLoading ? (
          <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ledger ? (
          <div className="space-y-4">
            {/* Category header */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Category Ledger</p>
                  <h3 className="text-lg font-bold text-slate-800">{ledger.category.label}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Account Code: {ledger.category.account_code}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-0.5">{ledger.count} transactions</p>
                  <p className="text-2xl font-bold text-red-600">${fmt(ledger.total)}</p>
                  <p className="text-xs text-slate-400">{dateFrom} – {dateTo}</p>
                </div>
              </div>
            </div>

            {/* Monthly breakdown */}
            {(ledger.monthly || []).length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="font-medium text-slate-700 mb-3 text-sm">Monthly Breakdown</h4>
                <MiniBarChart data={ledger.monthly} labelKey="month" valueKey="total" />
              </div>
            )}

            {/* Transactions */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {(ledger.entries || []).length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No {ledger.category.label} expenses for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-left text-xs text-slate-500">
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Reference</th>
                        <th className="px-4 py-3 font-medium">Description</th>
                        <th className="px-4 py-3 font-medium">Payee</th>
                        <th className="px-4 py-3 font-medium">Method</th>
                        <th className="px-4 py-3 text-right font-medium">Amount</th>
                        <th className="px-4 py-3 text-right font-medium">Running Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledger.entries.map(exp => (
                        <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{exp.expense_date}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{exp.expense_reference}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                            <span className="block truncate">{exp.description}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{exp.vendor_payee || '—'}</td>
                          <td className="px-4 py-3"><MethodBadge method={exp.payment_method} /></td>
                          <td className="px-4 py-3 text-right font-medium text-red-600">${fmt(exp.amount)}</td>
                          <td className="px-4 py-3 text-right text-slate-500">${fmt(exp.running_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-sm text-slate-500">
                          {ledger.count} transactions
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-700">${fmt(ledger.total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'add',          label: '+ Add Expense' },
  { id: 'categories',   label: 'By Category' },
]

export default function Expenses() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab]           = useState('dashboard')
  const [dateFrom, setDateFrom] = useState(firstOfMonth())
  const [dateTo, setDateTo]     = useState(today())
  const [drillCategory, setDrillCategory] = useState(null)

  const handleCategoryClick = (key) => {
    setDrillCategory(key)
    setTab('categories')
  }

  const handleAddSuccess = () => {
    setTab('transactions')
  }

  const switchTab = (id) => {
    setTab(id)
    if (id !== 'categories') setDrillCategory(null)
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Operating expense ledger — all outflows with double-entry accounting
          </p>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm text-slate-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="text-sm text-slate-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && (
        <DashboardTab dateFrom={dateFrom} dateTo={dateTo} onCategoryClick={handleCategoryClick} />
      )}
      {tab === 'transactions' && (
        <TransactionsTab dateFrom={dateFrom} dateTo={dateTo} onCategoryClick={handleCategoryClick} />
      )}
      {tab === 'add' && (
        <AddExpenseTab onSuccess={handleAddSuccess} />
      )}
      {tab === 'categories' && (
        <ByCategoryTab
          dateFrom={dateFrom}
          dateTo={dateTo}
          initialKey={drillCategory}
          onCategoryClick={handleCategoryClick}
        />
      )}
    </div>
  )
}
