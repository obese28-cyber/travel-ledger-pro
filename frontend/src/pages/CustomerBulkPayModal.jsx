/**
 * pages/CustomerBulkPayModal.jsx
 *
 * Bulk payment modal for a single customer — mirrors the supplier BulkPayModal.
 *
 * Props:
 *   customerId   — number
 *   customerName — string
 *   onClose      — fn
 *   onSuccess    — fn
 *
 * UX flow:
 *   Step 1 — Enter total cash available
 *   Step 2 — Check which outstanding invoices to settle
 *   Step 3 — Fill payment method + date + reference
 *   → Confirm posts POST /api/payments/bulk
 */

import React, { useEffect, useState } from 'react'
import { invoiceService }  from '../services/invoiceService'
import { paymentService }  from '../services/paymentService'
import { useToast }        from '../components/ui/Toast'
import Modal               from '../components/ui/Modal'
import FormInput           from '../components/ui/FormInput'
import FormSelect          from '../components/ui/FormSelect'
import FormTextarea        from '../components/ui/FormTextarea'
import { ButtonSpinner }   from '../components/ui/LoadingSpinner'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }) : '—'

const PAYMENT_METHODS = [
  { value: 'cash',          label: '💵 Cash' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'credit_card',   label: '💳 Credit / Debit Card' },
  { value: 'mobile_money',  label: '📱 Mobile Money' },
]

export default function CustomerBulkPayModal({ customerId, customerName, onClose, onSuccess }) {
  const toast = useToast()

  const [invoices,     setInvoices]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [cashAmount,   setCashAmount]   = useState('')
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [form,         setForm]         = useState({
    payment_method:    'bank_transfer',
    payment_date:      new Date().toISOString().slice(0, 10),
    payment_reference: '',
    notes:             '',
  })
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)

  // Load outstanding + partially-paid invoices for this customer
  useEffect(() => {
    Promise.all([
      invoiceService.list({ customer_id: customerId, status: 'issued',         per_page: 200 }),
      invoiceService.list({ customer_id: customerId, status: 'partially_paid', per_page: 200 }),
      invoiceService.list({ customer_id: customerId, status: 'overdue',        per_page: 200 }),
    ])
      .then(([issued, partial, overdue]) => {
        const all = [
          ...(issued.data   ?? issued.items   ?? []),
          ...(partial.data  ?? partial.items  ?? []),
          ...(overdue.data  ?? overdue.items  ?? []),
        ]
        // deduplicate by id
        const seen = new Set()
        setInvoices(all.filter(inv => { if (seen.has(inv.id)) return false; seen.add(inv.id); return true }))
      })
      .catch(() => toast.error('Could not load outstanding invoices.'))
      .finally(() => setLoading(false))
  }, [customerId])

  // ── Cash allocation engine ─────────────────────────────────────────────────
  // Distribute available cash top-to-bottom: pay each selected invoice in full
  // until cash runs out; the last selected invoice absorbs any partial remainder.
  function computeAllocations() {
    const cash = parseFloat(cashAmount) || 0
    let remaining = cash
    const allocs = {}
    for (const inv of invoices) {
      if (!selectedIds.has(inv.id)) continue
      const due = inv.balance_due ?? 0
      const pay = Math.min(due, remaining)
      allocs[inv.id] = parseFloat(pay.toFixed(2))
      remaining = parseFloat((remaining - pay).toFixed(2))
    }
    return {
      allocs,
      cashUsed: parseFloat(((parseFloat(cashAmount) || 0) - remaining).toFixed(2)),
      cashLeft: parseFloat(remaining.toFixed(2)),
    }
  }

  const cash          = parseFloat(cashAmount) || 0
  const selectedInvs  = invoices.filter(i => selectedIds.has(i.id))
  const totalSelected = selectedInvs.reduce((s, i) => s + (i.balance_due ?? 0), 0)
  const { allocs, cashUsed, cashLeft } = computeAllocations()
  const isShortfall   = cash > 0 && totalSelected > cash
  const isExcess      = cash > 0 && totalSelected > 0 && cash > totalSelected

  function toggleInvoice(inv) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id)
      return next
    })
    if (errors.invoices) setErrors(e => ({ ...e, invoices: undefined }))
  }

  function toggleAll() {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(invoices.map(i => i.id)))
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
    if (!cashAmount || cash <= 0)  errs.cashAmount      = 'Enter the cash amount available.'
    if (!form.payment_method)      errs.payment_method  = 'Select a payment method.'
    if (!form.payment_date)        errs.payment_date    = 'Payment date is required.'
    if (selectedIds.size === 0)    errs.invoices        = 'Select at least one invoice to receive payment for.'

    if (Object.keys(errs).length) { setErrors(errs); return }

    const invoicePayments = selectedInvs
      .map(i => ({ invoice_id: i.id, amount: allocs[i.id] ?? 0 }))
      .filter(i => i.amount > 0)

    if (invoicePayments.length === 0) {
      setErrors({ invoices: 'No cash to allocate. Increase the cash amount.' })
      return
    }

    setSaving(true)
    try {
      const result = await paymentService.bulkPay({
        payment_method:    form.payment_method,
        payment_date:      form.payment_date,
        payment_reference: form.payment_reference.trim() || null,
        notes:             form.notes.trim() || null,
        invoices:          invoicePayments,
      })
      const count = result?.count ?? invoicePayments.length
      toast.success(`Payment received — ${count} invoice(s), ${fmt(cashUsed)} applied.`)
      onSuccess()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Bulk payment failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Bulk Payment — Customer" size="lg">
      {/* Customer name + subtitle */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-700">{customerName}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Enter the payment amount received, then select which invoices to settle.
          Cash is applied top-to-bottom.
        </p>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading outstanding invoices…</div>
      ) : invoices.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">No outstanding invoices for this customer.</p>
          <p className="text-xs text-slate-400 mt-1">All invoices are fully paid.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>

          {/* ── Step 1: Cash amount ────────────────────────────────────── */}
          <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Step 1 — Amount Received
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cashAmount}
                  onChange={e => {
                    setCashAmount(e.target.value)
                    if (errors.cashAmount) setErrors(er => ({ ...er, cashAmount: undefined }))
                  }}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2.5 text-lg font-semibold border rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500
                    ${errors.cashAmount ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                />
              </div>
              {cash > 0 && selectedIds.size > 0 && (
                <div className={`flex-1 text-right text-sm font-medium
                  ${isShortfall ? 'text-amber-600' : isExcess ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {isShortfall && `⚠ ${fmt(totalSelected - cash)} short — last invoice gets partial`}
                  {isExcess    && `${fmt(cash - totalSelected)} will remain unspent`}
                  {!isShortfall && !isExcess && 'Exact match ✓'}
                </div>
              )}
            </div>
            {errors.cashAmount && (
              <p className="text-xs text-red-500 mt-1">{errors.cashAmount}</p>
            )}
          </div>

          {/* ── Step 2: Select invoices ────────────────────────────────── */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Step 2 — Select Invoices to Settle
            </label>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2.5 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === invoices.length && invoices.length > 0}
                        onChange={toggleAll}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Invoice</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Due Date</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Balance Due</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Will Receive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.map(inv => {
                    const isChecked = selectedIds.has(inv.id)
                    const allocated = isChecked ? (allocs[inv.id] ?? 0) : null
                    const isPartial = allocated !== null && allocated < (inv.balance_due ?? 0)
                    const isZero    = allocated !== null && allocated === 0
                    const isOverdue = inv.due_date && new Date(inv.due_date) < new Date()

                    return (
                      <tr
                        key={inv.id}
                        className={`transition-colors ${isChecked ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleInvoice(inv)}
                            className="rounded border-slate-300 text-indigo-600"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-slate-700">
                            {inv.invoice_number}
                          </p>
                          {inv.booking_ref && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              Booking: {inv.booking_ref}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {inv.due_date ? (
                            <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                              {fmtDate(inv.due_date)}
                              {isOverdue && <span className="ml-1 text-red-400">Overdue</span>}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                            ${inv.status === 'partially_paid' ? 'bg-amber-100 text-amber-700'
                            : inv.status === 'overdue'        ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'}`}>
                            {inv.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm font-semibold text-red-600">{fmt(inv.balance_due)}</span>
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
                                  Partial — {fmt((inv.balance_due ?? 0) - allocated)} remains
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
                    <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-slate-500">
                      {selectedIds.size} of {invoices.length} selected
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
            {errors.invoices && (
              <p className="text-xs text-red-500 mt-2">{errors.invoices}</p>
            )}
          </div>

          {/* ── Cash summary bar ────────────────────────────────────────── */}
          {cash > 0 && selectedIds.size > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                <p className="text-xs text-slate-400">Amount Received</p>
                <p className="text-sm font-bold text-slate-700">{fmt(cash)}</p>
              </div>
              <div className="bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-100">
                <p className="text-xs text-slate-400">Will Be Applied</p>
                <p className="text-sm font-bold text-indigo-700">{fmt(cashUsed)}</p>
              </div>
              <div className={`rounded-lg px-3 py-2 border ${cashLeft > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-xs text-slate-400">Remaining</p>
                <p className={`text-sm font-bold ${cashLeft > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {fmt(cashLeft)}
                </p>
              </div>
            </div>
          )}

          {/* ── Step 3: Payment details ──────────────────────────────────── */}
          <div className="mb-1">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
              Step 3 — Payment Details
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <FormSelect
              label="Payment Method"
              name="payment_method"
              value={form.payment_method}
              onChange={handleFormChange}
              options={PAYMENT_METHODS}
              required
              error={errors.payment_method}
            />
            <FormInput
              label="Payment Date"
              name="payment_date"
              type="date"
              value={form.payment_date}
              onChange={handleFormChange}
              required
              error={errors.payment_date}
            />
          </div>
          <FormInput
            label="Reference / Transaction ID"
            name="payment_reference"
            value={form.payment_reference}
            onChange={handleFormChange}
            placeholder="e.g. TXN-20260516-001"
            hint="Shared reference for all invoices in this batch"
          />
          <div className="mt-4">
            <FormTextarea
              label="Notes"
              name="notes"
              value={form.notes}
              onChange={handleFormChange}
              rows={2}
              placeholder="Optional notes"
            />
          </div>

          {/* ── Actions ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving || selectedIds.size === 0 || cash <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700
                         text-white text-sm font-medium rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving && <ButtonSpinner />}
              {saving ? 'Recording…' : `Confirm Receipt — ${fmt(cashUsed)}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200
                         rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>

        </form>
      )}
    </Modal>
  )
}
