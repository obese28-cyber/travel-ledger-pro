/**
 * pages/RecordPaymentModal.jsx — AR-aware payment recording modal.
 *
 * Connects to: POST /api/payments/
 *
 * AR Behaviour:
 *   - amount can exceed invoice balance_due (overpayment is allowed)
 *   - applied portion  = min(amount, balance_due)  → credited to this invoice
 *   - unapplied portion = amount - applied          → stored as customer credit (CR)
 *   - Invoice is marked PAID once amount_paid = total_amount
 *   - Excess sits on customer account as Advance Credit
 *
 * Props:
 *   invoice              — { id, invoice_number, total_amount, amount_paid, balance_due, customer_name, ... }
 *   customerCreditBalance — existing advance credit on the customer account (default 0)
 *   onClose              — called when user dismisses
 *   onSuccess            — called after successful payment (so parent can refresh)
 */

import React, { useState } from 'react'
import { paymentService } from '../services/paymentService'
import { useToast }       from '../components/ui/Toast'
import Modal              from '../components/ui/Modal'
import FormInput          from '../components/ui/FormInput'
import FormSelect         from '../components/ui/FormSelect'
import FormTextarea       from '../components/ui/FormTextarea'
import { ButtonSpinner }  from '../components/ui/LoadingSpinner'

const PAYMENT_METHODS = [
  { value: 'cash',          label: '💵  Cash' },
  { value: 'bank_transfer', label: '🏦  Bank Transfer' },
  { value: 'credit_card',   label: '💳  Credit / Debit Card' },
  { value: 'mobile_money',  label: '📱  Mobile Money' },
]

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

export default function RecordPaymentModal({ invoice, onClose, onSuccess, customerCreditBalance = 0 }) {
  const toast = useToast()

  const totalAmount = invoice?.total_amount ?? 0
  const amountPaid  = invoice?.amount_paid  ?? 0
  const balanceDue  = Math.max((invoice?.balance_due ?? totalAmount - amountPaid), 0)

  const [form, setForm] = useState({
    amount:           balanceDue > 0 ? String(balanceDue.toFixed(2)) : '',
    payment_method:   'cash',
    payment_date:     new Date().toISOString().slice(0, 10),
    notes:            '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Live AR preview
  const entered         = parseFloat(form.amount) || 0
  const amountApplied   = Math.min(entered, balanceDue)
  const unappliedAmount = Math.max(0, entered - balanceDue)
  const newInvBalance   = Math.max(0, balanceDue - entered)
  const isOverpayment   = entered > balanceDue + 0.005
  const isPartial       = entered > 0 && entered < balanceDue - 0.005
  const isFullPay       = entered > 0 && !isOverpayment && !isPartial

  function validate() {
    const errs = {}
    const num = Number(form.amount)
    if (!form.amount || isNaN(num) || num <= 0)
      errs.amount = 'Enter a valid payment amount greater than zero.'
    if (!form.payment_date)
      errs.payment_date = 'Payment date is required.'
    return errs
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      await paymentService.create({
        invoice_id:     invoice.id,
        amount:         parseFloat(form.amount),
        payment_method: form.payment_method,
        payment_date:   form.payment_date,
        notes:          form.notes.trim() || null,
      })
      toast.success(
        isOverpayment
          ? `Payment of ${fmt(entered)} recorded. Invoice paid. ${fmt(unappliedAmount)} added as advance credit.`
          : `Payment of ${fmt(entered)} recorded successfully.`
      )
      onSuccess()
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'Failed to record payment.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Record Payment" size="md">

      {/* ── Invoice AR summary card ─────────────────────────────── */}
      <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-slate-400 mb-1">Invoice Total</p>
            <p className="text-sm font-bold text-slate-700 font-mono">{fmt(totalAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Amount Paid</p>
            <p className="text-sm font-bold text-emerald-600 font-mono">{fmt(amountPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Balance Due</p>
            <p className={`text-sm font-bold font-mono ${balanceDue > 0 ? 'text-red-600' : 'text-slate-400'}`}>
              {fmt(balanceDue)}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono font-semibold text-slate-700">{invoice.invoice_number}</p>
            <p className="text-xs text-slate-400">{invoice.customer_name}</p>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            invoice.status === 'paid'           ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : invoice.status === 'partially_paid' ? 'bg-amber-100 text-amber-700 border-amber-200'
            : invoice.status === 'overdue'        ? 'bg-red-100 text-red-700 border-red-200'
            :                                       'bg-blue-100 text-blue-700 border-blue-200'
          }`}>
            {(invoice.status || 'issued').toUpperCase().replace('_',' ')}
          </span>
        </div>
      </div>

      {/* ── Existing credit notice ──────────────────────────────── */}
      {customerCreditBalance > 0.005 && (
        <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg
                        bg-violet-50 border border-violet-200">
          <span className="text-lg leading-none shrink-0">💳</span>
          <div>
            <p className="text-sm font-semibold text-violet-800">
              Customer has advance credit on account
            </p>
            <p className="text-xs text-violet-600 mt-0.5">
              Available credit: <strong>{fmt(customerCreditBalance)}</strong>.
              Record any additional cash here — it will be reflected in the AR ledger automatically.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">

        {/* Amount */}
        <FormInput
          label="Payment Amount Received (USD)"
          name="amount"
          type="number"
               min="0.01"
          step="0.01"
          value={form.amount}
          onChange={handleChange}
          placeholder="0.00"
          required
          error={errors.amount}
          hint={invoice ? `Balance due: $${Number(invoice.balance_due ?? 0).toFixed(2)}` : ''}
        />

        {/* Payment method */}
        <FormSelect
          label="Payment Method"
          name="payment_method"
          value={form.payment_method}
          onChange={handleChange}
          options={[
            { value: 'cash',          label: 'Cash' },
            { value: 'bank_transfer', label: 'Bank Transfer' },
            { value: 'credit_card',   label: 'Credit Card' },
            { value: 'mobile_money',  label: 'Mobile Money' },
          ]}
          required
          error={errors.payment_method}
        />

        {/* Date */}
        <FormInput
          label="Payment Date"
          name="payment_date"
          type="date"
          value={form.payment_date}
          onChange={handleChange}
          required
          error={errors.payment_date}
        />

        {/* Notes */}
        <FormInput
          label="Reference / Notes"
          name="notes"
          value={form.notes}
          onChange={handleChange}
          placeholder="Bank ref, receipt number…"
        />

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold
                       bg-emerald-600 hover:bg-emerald-700 text-white
                       disabled:opacity-50 transition-colors">
            {saving ? 'Recording…' : 'Record Payment'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium
                       border border-slate-200 text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
