/**
 * pages/VendorBills.jsx -- Supplier Invoices list.
 * (file kept as VendorBills.jsx; UI shows "Supplier Invoices" terminology)
 *
 * Route: /bills
 *
 * Connects to:
 *   GET  /api/vendor-bills/             -> list supplier invoices
 *   POST /api/vendor-bills/             -> create supplier invoice
 *   POST /api/vendor-bills/:id/payments -> record payment against a supplier invoice
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams }                    from 'react-router-dom'
import { vendorBillService } from '../services/vendorBillService'
import { vendorService }     from '../services/vendorService'
import { useToast }          from '../components/ui/Toast'
import Modal                 from '../components/ui/Modal'
import FormInput             from '../components/ui/FormInput'
import FormSelect            from '../components/ui/FormSelect'
import FormTextarea          from '../components/ui/FormTextarea'
import { PageSpinner, ButtonSpinner } from '../components/ui/LoadingSpinner'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'

const STATUS_COLORS = {
  unpaid:         'bg-red-100 text-red-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-emerald-100 text-emerald-700',
}

const STATUS_OPTIONS = [
  { value: '',               label: 'All Statuses' },
  { value: 'unpaid',         label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid',           label: 'Paid' },
]

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card',   label: 'Credit Card' },
  { value: 'mobile_money',  label: 'Mobile Money' },
]

// ── Pay Supplier Invoice Modal ─────────────────────────────────────────────────
export function PayBillModal({ bill, onClose, onSuccess }) {
  const toast = useToast()
  const [form, setForm] = useState({
    amount:         String(bill.balance_due ?? ''),
    payment_method: 'bank_transfer',
    payment_date:   new Date().toISOString().slice(0, 10),
    notes:          '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const balanceDue = bill.balance_due ?? (bill.amount - bill.amount_paid)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(er => ({ ...er, [name]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    const amt = parseFloat(form.amount)
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = 'Enter a valid amount.'
    if (amt > balanceDue + 0.01)               errs.amount = `Max payable is ${fmt(balanceDue)}.`
    if (!form.payment_method)                  errs.payment_method = 'Select a payment method.'
    if (!form.payment_date)                    errs.payment_date = 'Payment date is required.'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      await vendorBillService.pay(bill.id, {
        amount:         amt,
        payment_method: form.payment_method,
        payment_date:   form.payment_date,
        notes:          form.notes.trim() || null,
      })
      toast.success('Payment recorded.')
      onSuccess()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Pay Supplier Invoice" size="md">
      <div className="bg-slate-50 rounded-xl p-4 mb-5">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold text-slate-700 font-mono">{bill.bill_reference}</p>
            <p className="text-xs text-slate-500 mt-0.5">{bill.vendor_name}</p>
            {bill.booking_ref && (
              <p className="text-xs text-indigo-600 mt-0.5">Booking: {bill.booking_ref}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Balance Due</p>
            <p className="text-lg font-bold text-red-600">{fmt(balanceDue)}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Amount" name="amount" type="number" step="0.01" min="0.01"
            value={form.amount} onChange={handleChange} placeholder="0.00"
            required error={errors.amount} hint={`Max: ${fmt(balanceDue)}`} />
          <FormInput label="Payment Date" name="payment_date" type="date"
            value={form.payment_date} onChange={handleChange} required error={errors.payment_date} />
        </div>
        <FormSelect label="Payment Method" name="payment_method" value={form.payment_method}
          onChange={handleChange} options={PAYMENT_METHOD_OPTIONS} required error={errors.payment_method} />
        <FormTextarea label="Notes" name="notes" value={form.notes}
          onChange={handleChange} rows={2} placeholder="Optional notes" />
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {saving && <ButtonSpinner />} Record Payment
          </button>
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── New Supplier Invoice Modal ─────────────────────────────────────────────────
export function NewBillModal({ onClose, onSuccess, preselectedVendorId, preselectedBookingId, preselectedBookingRef }) {
  const toast = useToast()
  const [vendors, setVendors] = useState([])
  const [form, setForm] = useState({
    vendor_id:   preselectedVendorId || '',
    bill_date:   new Date().toISOString().slice(0, 10),
    due_date:    '',
    amount:      '',
    description: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    vendorService.list({ per_page: 200 }).then(d => setVendors(d.data || [])).catch(() => {})
  }, [])

  const vendorOptions = vendors.map(v => ({ value: String(v.id), label: v.name }))

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(er => ({ ...er, [name]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.vendor_id) errs.vendor_id = 'Select a supplier.'
    if (!form.bill_date) errs.bill_date = 'Invoice date is required.'
    const amt = parseFloat(form.amount)
    if (!form.amount || isNaN(amt) || amt <= 0) errs.amount = 'Enter a valid amount.'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      await vendorBillService.create({
        vendor_id:   Number(form.vendor_id),
        bill_date:   form.bill_date,
        due_date:    form.due_date || null,
        amount:      amt,
        description: form.description.trim() || null,
        booking_id:  preselectedBookingId ? Number(preselectedBookingId) : null,
      })
      toast.success('Supplier invoice created.')
      onSuccess()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create supplier invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="New Supplier Invoice" size="md">
      {preselectedBookingRef && (
        <div className="mb-4 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 font-medium">
          Linked to booking: <span className="font-mono">{preselectedBookingRef}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormSelect label="Supplier" name="vendor_id" value={form.vendor_id}
          onChange={handleChange} options={vendorOptions} placeholder="Select supplier"
          required error={errors.vendor_id} />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Amount Owed" name="amount" type="number" step="0.01" min="0.01"
            value={form.amount} onChange={handleChange} placeholder="0.00" required error={errors.amount} />
          <FormInput label="Invoice Date" name="bill_date" type="date"
            value={form.bill_date} onChange={handleChange} required error={errors.bill_date} />
        </div>
        <FormInput label="Due Date" name="due_date" type="date"
          value={form.due_date} onChange={handleChange} />
        <FormTextarea label="Description" name="description" value={form.description}
          onChange={handleChange} rows={2} placeholder="What this invoice is for" />
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
            {saving && <ButtonSpinner />} Create Invoice
          </button>
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}


// ── Bulk Pay Modal ─────────────────────────────────────────────────────────────
// Cash-first bulk payment: enter available cash, select invoices, system
// allocates top-to-bottom — first bills paid in full, last absorbs any shortfall.
export function BulkPayModal({ vendorId, vendorName, onClose, onSuccess }) {
  const toast        = useToast()
  const [bills,      setBills]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [cashAmount, setCashAmount] = useState('')          // total cash available
  const [selectedIds, setSelectedIds] = useState(new Set()) // Set of bill ids
  const [form,       setForm]       = useState({
    payment_method:    'bank_transfer',
    payment_date:      new Date().toISOString().slice(0, 10),
    payment_reference: '',
    notes:             '',
  })
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    Promise.all([
      vendorBillService.list({ vendor_id: vendorId, status: 'unpaid',         per_page: 200 }),
      vendorBillService.list({ vendor_id: vendorId, status: 'partially_paid', per_page: 200 }),
    ])
      .then(([u, p]) => setBills([...(u.data || []), ...(p.data || [])]))
      .catch(() => toast.error('Could not load bills.'))
      .finally(() => setLoading(false))
  }, [vendorId])

  // ── Allocation engine ───────────────────────────────────────────────────────
  // Distribute cash top-to-bottom: full payment for each bill until cash runs
  // out; the last selected bill absorbs any partial remainder.
  function computeAllocations() {
    const cash = parseFloat(cashAmount) || 0
    let remaining = cash
    const allocs = {}
    for (const bill of bills) {
      if (!selectedIds.has(bill.id)) continue
      const due = bill.balance_due ?? 0
      const pay = Math.min(due, remaining)
      allocs[bill.id] = parseFloat(pay.toFixed(2))
      remaining = parseFloat((remaining - pay).toFixed(2))
    }
    return { allocs, cashUsed: parseFloat((cash - remaining).toFixed(2)), cashLeft: parseFloat(remaining.toFixed(2)) }
  }

  const cash            = parseFloat(cashAmount) || 0
  const selectedBills   = bills.filter(b => selectedIds.has(b.id))
  const totalSelected   = selectedBills.reduce((s, b) => s + (b.balance_due ?? 0), 0)
  const { allocs, cashUsed, cashLeft } = computeAllocations()
  const isShortfall     = cash > 0 && totalSelected > cash
  const isExcess        = cash > 0 && totalSelected > 0 && cash > totalSelected

  function toggleBill(bill) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(bill.id) ? next.delete(bill.id) : next.add(bill.id)
      return next
    })
    if (errors.bills) setErrors(e => ({ ...e, bills: undefined }))
  }

  function toggleAll() {
    if (selectedIds.size === bills.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bills.map(b => b.id)))
    }
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(er => ({ ...er, [name]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!cashAmount || cash <= 0)  errs.cashAmount     = 'Enter the cash amount available.'
    if (!form.payment_method)      errs.payment_method = 'Select a method.'
    if (!form.payment_date)        errs.payment_date   = 'Date is required.'
    if (selectedIds.size === 0)    errs.bills          = 'Select at least one invoice to pay.'

    if (Object.keys(errs).length) { setErrors(errs); return }

    const billPayments = selectedBills
      .map(b => ({ bill_id: b.id, amount: allocs[b.id] ?? 0 }))
      .filter(b => b.amount > 0)

    if (billPayments.length === 0) {
      setErrors({ bills: 'No cash left to allocate. Increase the cash amount.' })
      return
    }

    setSaving(true)
    try {
      await vendorBillService.bulkPay({
        vendor_id:         vendorId,
        payment_method:    form.payment_method,
        payment_date:      form.payment_date,
        payment_reference: form.payment_reference.trim() || null,
        notes:             form.notes.trim() || null,
        bills:             billPayments,
      })
      toast.success(`Payment recorded — ${billPayments.length} invoice(s), ${fmt(cashUsed)} applied.`)
      onSuccess()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Bulk payment failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Bulk Payment" size="lg">
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-700">{vendorName}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Enter available cash, then select which invoices to pay. Cash is applied top-to-bottom.
        </p>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading invoices…</div>
      ) : bills.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">No outstanding invoices for this supplier.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>

          {/* ── Step 1: Cash amount ─────────────────────────── */}
          <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Step 1 — Cash Available
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cashAmount}
                  onChange={e => { setCashAmount(e.target.value); if (errors.cashAmount) setErrors(er => ({ ...er, cashAmount: undefined })) }}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2.5 text-lg font-semibold border rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500
                    ${errors.cashAmount ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                />
              </div>
              {cash > 0 && selectedIds.size > 0 && (
                <div className={`flex-1 text-right text-sm font-medium
                  ${isShortfall ? 'text-amber-600' : isExcess ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {isShortfall && `⚠ $${(totalSelected - cash).toFixed(2)} short — last invoice gets partial`}
                  {isExcess    && `$${(cash - totalSelected).toFixed(2)} will remain unspent`}
                  {!isShortfall && !isExcess && 'Exact match ✓'}
                </div>
              )}
            </div>
            {errors.cashAmount && <p className="text-xs text-red-500 mt-1">{errors.cashAmount}</p>}
          </div>

          {/* ── Step 2: Select invoices ─────────────────────── */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Step 2 — Select Invoices to Pay
            </label>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2.5 text-left">
                      <input type="checkbox"
                        checked={selectedIds.size === bills.length && bills.length > 0}
                        onChange={toggleAll}
                        className="rounded border-slate-300 text-indigo-600" />
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Invoice</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Description</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Balance Due</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Will Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bills.map(bill => {
                    const isChecked  = selectedIds.has(bill.id)
                    const allocated  = isChecked ? (allocs[bill.id] ?? 0) : null
                    const isPartial  = allocated !== null && allocated < (bill.balance_due ?? 0)
                    const isZero     = allocated !== null && allocated === 0
                    return (
                      <tr key={bill.id} className={`transition-colors ${isChecked ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                        <td className="px-3 py-3">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleBill(bill)}
                            className="rounded border-slate-300 text-indigo-600" />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-slate-700">{bill.bill_reference}</p>
                          {bill.due_date && <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(bill.due_date)}</p>}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 max-w-[140px] truncate">
                          {bill.description || '—'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm font-semibold text-red-600">{fmt(bill.balance_due)}</span>
                          {bill.status === 'partially_paid' && (
                            <p className="text-xs text-amber-500 mt-0.5">Partial</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {!isChecked ? (
                            <span className="text-xs text-slate-300">—</span>
                          ) : isZero ? (
                            <span className="text-xs text-slate-400 italic">No cash left</span>
                          ) : (
                            <div>
                              <span className={`text-sm font-bold ${isPartial ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {fmt(allocated)}
                              </span>
                              {isPartial && (
                                <p className="text-xs text-amber-500 mt-0.5">
                                  Partial — {fmt((bill.balance_due ?? 0) - allocated)} remains
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-slate-500">
                      {selectedIds.size} of {bills.length} selected
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500">
                      {fmt(totalSelected)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-indigo-600">
                      {cash > 0 && selectedIds.size > 0 ? fmt(cashUsed) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {errors.bills && <p className="text-xs text-red-500 mt-2">{errors.bills}</p>}
          </div>

          {/* ── Cash summary bar ────────────────────────────── */}
          {cash > 0 && selectedIds.size > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <p className="text-xs text-slate-400">Cash Available</p>
                <p className="text-sm font-bold text-slate-700">{fmt(cash)}</p>
              </div>
              <div className="bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-100">
                <p className="text-xs text-slate-400">Will Be Applied</p>
                <p className="text-sm font-bold text-indigo-700">{fmt(cashUsed)}</p>
              </div>
              <div className={`rounded-lg px-3 py-2 border ${cashLeft > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-xs text-slate-400">Cash Remaining</p>
                <p className={`text-sm font-bold ${cashLeft > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{fmt(cashLeft)}</p>
              </div>
            </div>
          )}

          {/* ── Payment details ──────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <FormSelect label="Payment Method" name="payment_method" value={form.payment_method}
              onChange={handleFormChange} options={PAYMENT_METHOD_OPTIONS}
              required error={errors.payment_method} />
            <FormInput label="Payment Date" name="payment_date" type="date"
              value={form.payment_date} onChange={handleFormChange}
              required error={errors.payment_date} />
          </div>
          <FormInput
            label="Cheque / Reference Number"
            name="payment_reference"
            value={form.payment_reference}
            onChange={handleFormChange}
            placeholder="e.g. CHQ-00123"
            hint="Shared reference for all invoices in this batch"
          />
          <div className="mt-4">
            <FormTextarea label="Notes" name="notes" value={form.notes}
              onChange={handleFormChange} rows={2} placeholder="Optional notes" />
          </div>

          {/* ── Actions ─────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
            <button type="submit"
              disabled={saving || selectedIds.size === 0 || cash <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700
                         text-white text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {saving && <ButtonSpinner />}
              {saving ? 'Recording…' : `Confirm Payment — ${fmt(cashUsed)}`}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200
                         rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VendorBills() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [bills,        setBills]        = useState([])
  const [meta,         setMeta]         = useState({ total: 0, page: 1, pages: 1 })
  const [loading,      setLoading]      = useState(true)
  const [status,       setStatus]       = useState('')
  const [page,         setPage]         = useState(1)
  const [payingBill,   setPayingBill]   = useState(null)
  const [showNewBill,  setShowNewBill]  = useState(false)
  const [vendors,      setVendors]      = useState([])
  const [selectedVendorId,   setSelectedVendorId]   = useState(searchParams.get('vendor') || '')
  const [selectedVendorName, setSelectedVendorName] = useState('')
  const [showBulkPay,  setShowBulkPay]  = useState(false)

  // Load vendor list for the dropdown filter
  useEffect(() => {
    vendorService.list({ per_page: 200 })
      .then(d => {
        const list = d.data || []
        setVendors(list)
        // Pre-fill name if coming from a vendor deep-link
        const urlVendorId = searchParams.get('vendor') || ''
        if (urlVendorId) {
          const found = list.find(v => String(v.id) === urlVendorId)
          if (found) setSelectedVendorName(found.name)
        }
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: 20 }
      if (status)           params.status    = status
      if (selectedVendorId) params.vendor_id = selectedVendorId
      const data = await vendorBillService.list(params)
      setBills(data.data || [])
      setMeta({ total: data.total || 0, page: data.page || 1, pages: data.pages || 1 })
    } catch {
      toast.error('Failed to load supplier invoices.')
    } finally {
      setLoading(false)
    }
  }, [page, status, selectedVendorId])

  useEffect(() => { load() }, [load])

  const totalOutstanding = bills
    .filter(b => b.status !== 'paid')
    .reduce((s, b) => s + (b.balance_due ?? 0), 0)

  return (
    <div className="space-y-6">
      {payingBill && (
        <PayBillModal bill={payingBill} onClose={() => setPayingBill(null)}
          onSuccess={() => { setPayingBill(null); load() }} />
      )}
      {showNewBill && (
        <NewBillModal preselectedVendorId={selectedVendorId}
          onClose={() => setShowNewBill(false)}
          onSuccess={() => { setShowNewBill(false); load() }} />
      )}
      {showBulkPay && selectedVendorId && (
        <BulkPayModal
          vendorId={selectedVendorId}
          vendorName={selectedVendorName}
          onClose={() => setShowBulkPay(false)}
          onSuccess={() => { setShowBulkPay(false); load() }}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Supplier Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Invoices from suppliers — track what you owe and record payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedVendorId && (
            <button
              onClick={() => setShowBulkPay(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm">
              💳 Bulk Pay
            </button>
          )}
          <button onClick={() => setShowNewBill(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Supplier Invoice
          </button>
        </div>
      </div>

      {totalOutstanding > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-red-700">Total Outstanding to Suppliers</p>
            <p className="text-xs text-red-500 mt-0.5">
              Across {bills.filter(b => b.status !== 'paid').length} unpaid invoices on this page
            </p>
          </div>
          <p className="text-2xl font-bold text-red-700">{fmt(totalOutstanding)}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        {/* Vendor filter */}
        <select
          value={selectedVendorId}
          onChange={e => {
            const id = e.target.value
            const found = vendors.find(v => String(v.id) === id)
            setSelectedVendorId(id)
            setSelectedVendorName(found ? found.name : '')
            setPage(1)
          }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white min-w-[180px]">
          <option value="">All Suppliers</option>
          {vendors.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
        </select>

        {/* Status filter */}
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Bulk Pay hint when no vendor selected */}
        {!selectedVendorId && (
          <p className="text-xs text-slate-400 ml-1">Select a supplier to enable Bulk Pay</p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20"><PageSpinner /></div>
        ) : bills.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium">No supplier invoices found</p>
            <p className="text-sm mt-1">Supplier invoices are created automatically when you issue a customer invoice.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Invoice #', 'Supplier', 'Booking', 'Date', 'Due Date', 'Amount', 'Paid', 'Balance Due', 'Status', ''].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === 'Amount' || h === 'Paid' || h === 'Balance Due' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map(bill => {
                    const isOverdue = bill.due_date && new Date(bill.due_date) < new Date() && bill.status !== 'paid'
                    return (
                      <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-600">{bill.bill_reference}</td>
                        <td className="px-5 py-4">
                          {bill.vendor_id ? (
                            <a href={`/vendors/${bill.vendor_id}`} className="text-indigo-600 hover:underline font-medium text-sm">
                              {bill.vendor_name}
                            </a>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          {bill.booking_id ? (
                            <a href={`/bookings/${bill.booking_id}`} className="text-xs font-mono text-indigo-600 hover:underline">
                              {bill.booking_ref || `#${bill.booking_id}`}
                            </a>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-500">{fmtDate(bill.bill_date)}</td>
                        <td className="px-5 py-4">
                          <span className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                            {bill.due_date ? fmtDate(bill.due_date) : '—'}
                          </span>
                          {isOverdue && <span className="ml-1 text-xs text-red-500">Overdue</span>}
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-slate-700">{fmt(bill.amount)}</td>
                        <td className="px-5 py-4 text-right -medium">{fmt(bill.amount_paid)}</td>
                        <td className="px-5 py-4 text-right font-bold text-red-600">{fmt(bill.balance_due)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                            ${bill.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              bill.status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'}`}>
                            {bill.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {bill.status !== 'paid' && (
                            <button onClick={() => setPayingBill(bill)}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
                              Pay →
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.pages > 1 && (
              <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between text-sm">
                <p className="text-slate-500">
                  Page {meta.page} of {meta.pages} · {meta.total} invoices
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                    ← Prev
                  </button>
                  <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={meta.page >= meta.pages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                    Next →
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
