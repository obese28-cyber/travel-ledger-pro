/**
 * pages/CustomerAdvanceModal.jsx — Record a customer advance / deposit.
 *
 * Used when the customer has no outstanding invoices but has paid (or wishes
 * to pre-pay) cash that should sit as a credit balance on their account.
 *
 * Connects to: POST /api/customers/<id>/credit
 *
 * Props:
 *   customerId   — customer.id
 *   customerName — display name
 *   currentCredit — existing credit balance (if any)
 *   onClose      — dismiss callback
 *   onSuccess    — refresh callback
 */

import React, { useState } from 'react'
import { customerService } from '../services/customerService'
import { useToast }        from '../components/ui/Toast'
import Modal               from '../components/ui/Modal'
import FormInput           from '../components/ui/FormInput'
import FormSelect          from '../components/ui/FormSelect'
import FormTextarea        from '../components/ui/FormTextarea'
import { ButtonSpinner }   from '../components/ui/LoadingSpinner'

const PAYMENT_METHODS = [
  { value: 'cash',           label: '💵  Cash' },
  { value: 'bank_transfer',  label: '🏦  Bank Transfer' },
  { value: 'credit_card',    label: '💳  Credit / Debit Card' },
  { value: 'mobile_money',   label: '📱  Mobile Money' },
]

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n ?? 0)

export default function CustomerAdvanceModal({ customerId, customerName, currentCredit = 0, onClose, onSuccess }) {
  const toast = useToast()

  const [form,   setForm]   = useState({
    amount:            '',
    payment_method:    'cash',
    payment_date:      new Date().toISOString().slice(0, 10),
    payment_reference: '',
    notes:             '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const enteredAmount  = parseFloat(form.amount) || 0
  const newCreditTotal = currentCredit + enteredAmount

  function validate() {
    const errs = {}
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      errs.amount = 'Enter a valid advance amount.'
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
      await customerService.recordAdvance(customerId, {
        amount:            parseFloat(form.amount),
        payment_method:    form.payment_method,
        payment_date:      form.payment_date,
        payment_reference: form.payment_reference.trim() || null,
        notes:             form.notes.trim() || null,
      })
      toast.success(`Advance of ${fmt(parseFloat(form.amount))} recorded for ${customerName}.`)
      onSuccess()
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'Failed to record advance.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Record Customer Advance / Credit" size="md">

      {/* Customer summary card */}
      <div className="mb-5 p-4 bg-violet-50 rounded-xl border border-violet-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-violet-400">Customer</p>
            <p className="text-sm font-semibold text-violet-900 mt-0.5">{customerName}</p>
            <p className="text-xs text-violet-500 mt-1">
              Cash received will be credited to this customer's account
            </p>
          </div>
          {currentCredit > 0 && (
            <div className="text-right">
              <p className="text-xs text-violet-400">Existing Credit</p>
              <p className="text-lg font-bold text-violet-700 mt-0.5">{fmt(currentCredit)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Info notice */}
      <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg
                      bg-blue-50 border border-blue-100 text-sm text-blue-800">
        <span className="text-lg leading-none shrink-0">ℹ️</span>
        <p className="text-xs text-blue-600">
          Use this to record cash received from a customer that is not tied to a specific
          open invoice — pre-payments, deposits, or overpayments made after all invoices
          are settled. The amount will appear as a credit balance in the customer ledger
          and can be applied to future invoices.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">

        {/* Amount */}
        <FormInput
          label="Advance Amount (USD)"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={handleChange}
          placeholder="0.00"
          required
          error={errors.amount}
          hint="Full amount of cash received from customer"
        />

        {/* Live new credit preview */}
        {enteredAmount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-lg text-sm
                          bg-violet-50 border border-violet-200 text-violet-700">
            <span>💳 New credit balance after recording</span>
            <span className="font-bold">{fmt(newCreditTotal)}</span>
          </div>
        )}

        {/* Payment method + date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormSelect
            label="Payment Method"
            name="payment_method"
            value={form.payment_method}
            onChange={handleChange}
            options={PAYMENT_METHODS}
          />
          <FormInput
            label="Payment Date"
            name="payment_date"
            type="date"
            value={form.payment_date}
            onChange={handleChange}
            required
            error={errors.payment_date}
          />
        </div>

        {/* Reference */}
        <FormInput
          label="Reference / Transaction ID"
          name="payment_reference"
          value={form.payment_reference}
          onChange={handleChange}
          placeholder="e.g. TXN-20260511-001"
          hint="Optional — bank reference, receipt number, etc."
        />

        {/* Notes */}
        <FormTextarea
          label="Notes"
          name="notes"
          value={form.notes}
          onChange={handleChange}
          placeholder="e.g. Pre-payment for upcoming tour package"
          rows={2}
        />

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
                       bg-violet-600 hover:bg-violet-700 text-white transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving && <ButtonSpinner />}
            {saving ? 'Recording…' : 'Record Advance Credit'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600
                       border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>

      </form>
    </Modal>
  )
}
