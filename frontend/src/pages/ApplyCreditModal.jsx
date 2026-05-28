/**
 * pages/ApplyCreditModal.jsx
 *
 * Apply a SPECIFIC unallocated payment toward one or more open invoices.
 * Staff can select multiple invoices and enter an amount for each.
 * Applications are submitted sequentially — one API call per invoice.
 */

import React, { useState, useMemo } from 'react'
import { customerService } from '../services/customerService'
import { useToast }        from '../components/ui/Toast'
import Modal               from '../components/ui/Modal'
import FormTextarea        from '../components/ui/FormTextarea'
import { ButtonSpinner }   from '../components/ui/LoadingSpinner'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—'

const METHOD_LABEL = {
  cash:           'Cash',
  bank_transfer:  'Bank Transfer',
  credit_card:    'Credit Card',
  mobile_money:   'Mobile Money',
}

export default function ApplyCreditModal({
  customerId, customerName, sourcePayment, openInvoices, onClose, onSuccess
}) {
  const toast = useToast()

  // selections: { [invoice_id]: { checked: bool, amount: string } }
  const [selections, setSelections] = useState(() => {
    const init = {}
    openInvoices.forEach(inv => {
      init[inv.invoice_id] = { checked: false, amount: '' }
    })
    return init
  })

  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(null) // e.g. "Applying 2 of 3…"

  // Total being applied across all selected invoices
  const totalApplying = useMemo(() => {
    return Object.entries(selections).reduce((sum, [, sel]) => {
      if (!sel.checked) return sum
      return sum + (parseFloat(sel.amount) || 0)
    }, 0)
  }, [selections])

  const remainingUnallocated = Math.max(0, sourcePayment.unapplied_amount - totalApplying)
  const overLimit = totalApplying > sourcePayment.unapplied_amount + 0.005

  const selectedInvoices = openInvoices.filter(inv => selections[inv.invoice_id]?.checked)
  const canSubmit = selectedInvoices.length > 0 && totalApplying > 0 && !overLimit && !saving

  function toggleInvoice(invId, invoiceBalance) {
    setSelections(prev => {
      const current = prev[invId]
      const nowChecked = !current.checked
      // Auto-fill amount when checking: min of invoice balance and remaining unallocated
      const remaining = sourcePayment.unapplied_amount - Object.entries(prev).reduce((sum, [id, sel]) => {
        if (String(id) === String(invId) || !sel.checked) return sum
        return sum + (parseFloat(sel.amount) || 0)
      }, 0)
      const autoAmount = nowChecked ? Math.min(invoiceBalance, remaining) : 0
      return {
        ...prev,
        [invId]: {
          checked: nowChecked,
          amount: nowChecked ? autoAmount.toFixed(2) : '',
        }
      }
    })
  }

  function setAmount(invId, value) {
    setSelections(prev => ({
      ...prev,
      [invId]: { ...prev[invId], amount: value }
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    // Validate each selection
    for (const inv of selectedInvoices) {
      const sel = selections[inv.invoice_id]
      const amt = parseFloat(sel.amount) || 0
      if (amt <= 0) {
        toast.error(`Enter a valid amount for ${inv.reference}.`)
        return
      }
      if (amt > inv.invoice_balance + 0.005) {
        toast.error(`Amount for ${inv.reference} exceeds its balance of ${fmt(inv.invoice_balance)}.`)
        return
      }
    }

    setSaving(true)
    let applied = 0
    let errors  = 0

    for (let i = 0; i < selectedInvoices.length; i++) {
      const inv = selectedInvoices[i]
      const amt = parseFloat(selections[inv.invoice_id].amount)
      setProgress(`Applying ${i + 1} of ${selectedInvoices.length}…`)
      try {
        await customerService.applyCredit(customerId, {
          invoice_id:        inv.invoice_id,
          source_payment_id: sourcePayment.payment_id,
          amount:            amt,
          notes:             notes.trim() || undefined,
        })
        applied++
      } catch (err) {
        errors++
        toast.error(`Failed to apply to ${inv.reference}: ${err?.response?.data?.error ?? 'Unknown error'}`)
      }
    }

    setSaving(false)
    setProgress(null)

    if (applied > 0) {
      toast.success(
        errors > 0
          ? `Applied to ${applied} invoice(s). ${errors} failed.`
          : `${fmt(totalApplying)} applied to ${applied} invoice(s).`
      )
      onSuccess()
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Apply Unallocated Cash to Invoices" size="lg">

      {/* Source payment card */}
      <div className="mb-5 p-4 bg-violet-50 border border-violet-200 rounded-xl">
        <p className="text-xs text-violet-500 font-semibold uppercase tracking-wide mb-2">
          Cash Source — Unallocated Payment
        </p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm font-bold text-violet-800">
              {sourcePayment.reference}
            </p>
            <p className="text-xs text-violet-500 mt-0.5">
              {fmtDate(sourcePayment.date)} ·{' '}
              {METHOD_LABEL[sourcePayment.payment_method] || sourcePayment.payment_method}
            </p>
            {sourcePayment.description && (
              <p className="text-xs text-violet-400 mt-0.5 italic truncate max-w-xs">
                {sourcePayment.description}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-violet-700">
              {fmt(sourcePayment.unapplied_amount)}
            </p>
            <p className="text-xs text-violet-500 font-semibold">Unallocated</p>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg
                      bg-blue-50 border border-blue-100 text-xs text-blue-700">
        <span className="text-base shrink-0">ℹ️</span>
        <p>
          Select one or more invoices to apply this cash to. Each invoice gets its own amount.
          No new payment is collected — this allocates cash already in the system.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">

        {/* Invoice list */}
        {openInvoices.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            No open invoices found for {customerName}.
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Select Invoices to Apply To
            </label>
            {openInvoices.map(inv => {
              const sel     = selections[inv.invoice_id]
              const checked = sel?.checked || false
              const amt     = parseFloat(sel?.amount) || 0
              const maxAmt  = Math.min(inv.invoice_balance, sourcePayment.unapplied_amount)
              const overInv = amt > inv.invoice_balance + 0.005

              return (
                <div key={inv.invoice_id}
                  className={`rounded-xl border p-3 transition-all ${
                    checked
                      ? 'border-violet-300 bg-violet-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Invoice row header */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInvoice(inv.invoice_id, inv.invoice_balance)}
                      className="w-4 h-4 accent-violet-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-slate-800">
                          {inv.reference}
                        </span>
                        <span className="text-sm font-bold text-red-600 shrink-0">
                          {fmt(inv.invoice_balance)} due
                        </span>
                      </div>
                      {inv.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">{inv.description}</p>
                      )}
                    </div>
                  </label>

                  {/* Amount input — shown when checked */}
                  {checked && (
                    <div className="mt-3 pl-7">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <input
                            type="number"
                            min="0.01"
                            max={maxAmt}
                            step="0.01"
                            value={sel.amount}
                            onChange={e => setAmount(inv.invoice_id, e.target.value)}
                            placeholder={maxAmt.toFixed(2)}
                            className={`w-full rounded-lg border px-3 py-1.5 text-sm font-mono
                                        focus:outline-none focus:ring-2 focus:ring-violet-400
                                        ${overInv ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                          />
                          {overInv && (
                            <p className="text-xs text-red-600 mt-1">
                              Exceeds invoice balance of {fmt(inv.invoice_balance)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setAmount(inv.invoice_id, maxAmt.toFixed(2))}
                          className="text-xs px-2 py-1.5 rounded bg-violet-100 text-violet-700
                                     hover:bg-violet-200 font-medium whitespace-nowrap shrink-0"
                        >
                          Max
                        </button>
                      </div>
                      {/* Invoice result preview */}
                      {amt > 0 && !overInv && (
                        <p className={`text-xs mt-1 font-medium ${
                          amt >= inv.invoice_balance - 0.005 ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {amt >= inv.invoice_balance - 0.005
                            ? '✓ Invoice fully paid'
                            : `${fmt(Math.max(0, inv.invoice_balance - amt))} will remain outstanding`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Running total bar */}
        {totalApplying > 0 && (
          <div className={`rounded-xl border p-4 ${
            overLimit ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <p className="text-slate-500 mb-0.5">Total Applying</p>
                <p className={`font-bold text-base ${overLimit ? 'text-red-600' : 'text-violet-700'}`}>
                  {fmt(totalApplying)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Invoices Selected</p>
                <p className="font-bold text-base text-slate-700">{selectedInvoices.length}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Remaining After</p>
                <p className={`font-bold text-base ${remainingUnallocated > 0 ? 'text-violet-600' : 'text-slate-400'}`}>
                  {fmt(remainingUnallocated)}
                </p>
              </div>
            </div>
            {overLimit && (
              <p className="text-xs text-red-600 font-semibold text-center mt-2">
                ⚠ Total exceeds unallocated balance of {fmt(sourcePayment.unapplied_amount)}
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        <FormTextarea
          label="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={`e.g. Applying deposit from ${sourcePayment.reference}`}
          rows={2}
        />

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                       bg-violet-600 hover:bg-violet-700 text-white transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving && <ButtonSpinner />}
            {saving
              ? (progress || 'Applying…')
              : totalApplying > 0
                ? `Apply ${fmt(totalApplying)} to ${selectedInvoices.length} Invoice${selectedInvoices.length !== 1 ? 's' : ''}`
                : 'Apply Cash'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600
                       border border-slate-200 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>

      </form>
    </Modal>
  )
}
