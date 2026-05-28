/**
 * pages/ApplyCreditModal.jsx
 *
 * Apply a SPECIFIC unallocated payment toward an open invoice.
 *
 * Triggered from the payment row in the AR ledger — the one that shows
 * "Unallocated: $10,000".  Staff must choose WHICH invoice to apply it to.
 * The amount is capped at the payment's remaining unapplied_amount so
 * employees cannot pull credit from the air — it must trace back to
 * a real cash source.
 *
 * Props:
 *   customerId    — customer id
 *   customerName  — display name
 *   sourcePayment — the ledger payment row with unapplied_amount > 0
 *                   { payment_id, reference, unapplied_amount, credit,
 *                     payment_method, date, description }
 *   openInvoices  — array of open invoice ledger entries
 *                   [{ invoice_id, reference, invoice_balance, description, date }, ...]
 *   onClose       — dismiss callback
 *   onSuccess     — refresh callback
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

  // ── Invoice selection ──────────────────────────────────────────────────────
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(
    openInvoices.length === 1 ? String(openInvoices[0].invoice_id) : ''
  )

  const selectedInvoice = useMemo(
    () => openInvoices.find(inv => String(inv.invoice_id) === selectedInvoiceId) || null,
    [openInvoices, selectedInvoiceId]
  )

  // ── Amount ────────────────────────────────────────────────────────────────
  const maxApply = selectedInvoice
    ? Math.min(sourcePayment.unapplied_amount, selectedInvoice.invoice_balance)
    : 0

  const [amount,   setAmount]   = useState('')
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [amtError, setAmtError] = useState('')

  const effectiveAmount = parseFloat(amount) || 0

  const creditAfter  = Math.max(0, sourcePayment.unapplied_amount - effectiveAmount)
  const invoiceAfter = selectedInvoice
    ? Math.max(0, selectedInvoice.invoice_balance - effectiveAmount)
    : 0
  const fullyPaid    = invoiceAfter <= 0.005

  function handleInvoiceChange(invId) {
    setSelectedInvoiceId(invId)
    setAmount('')
    setAmtError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedInvoice) { return }
    if (effectiveAmount <= 0) { setAmtError('Enter a valid amount.'); return }
    if (effectiveAmount > sourcePayment.unapplied_amount + 0.005) {
      setAmtError(`Cannot exceed unallocated balance of ${fmt(sourcePayment.unapplied_amount)}.`); return
    }
    if (effectiveAmount > selectedInvoice.invoice_balance + 0.005) {
      setAmtError(`Cannot exceed invoice balance of ${fmt(selectedInvoice.invoice_balance)}.`); return
    }
    setAmtError('')
    setSaving(true)
    try {
      await customerService.applyCredit(customerId, {
        invoice_id:        selectedInvoice.invoice_id,
        source_payment_id: sourcePayment.payment_id,   // traces back to specific cash
        amount:            effectiveAmount,
        notes:             notes.trim() || undefined,
      })
      toast.success(
        fullyPaid
          ? `${fmt(effectiveAmount)} applied — invoice fully paid!`
          : `${fmt(effectiveAmount)} applied — ${fmt(invoiceAfter)} still owed on invoice.`
      )
      onSuccess()
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to apply credit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Apply Unallocated Cash to Invoice" size="md">

      {/* ── Source payment card ────────────────────────────────────────── */}
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
              {METHOD_LABEL[sourcePayment.payment_method] || sourcePayment.payment_method || 'Payment'}
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

      {/* ── Info note ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg
                      bg-blue-50 border border-blue-100 text-xs text-blue-700">
        <span className="text-base shrink-0">ℹ️</span>
        <p>
          This transfers cash that is <strong>already in the system</strong> from this specific
          payment to reduce the selected invoice. No new payment is collected from the customer.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">

        {/* ── Invoice selector ────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Apply To Invoice <span className="text-red-500">*</span>
          </label>
          {openInvoices.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              No open invoices found for {customerName}. All invoices are already paid.
            </div>
          ) : (
            <select
              value={selectedInvoiceId}
              onChange={e => handleInvoiceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
            >
              <option value="">— Select an open invoice —</option>
              {openInvoices.map(inv => (
                <option key={inv.invoice_id} value={String(inv.invoice_id)}>
                  {inv.reference} · Balance due: {fmt(inv.invoice_balance)}
                  {inv.description ? ` — ${inv.description}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ── Amount input (shown only after invoice is selected) ─────── */}
        {selectedInvoice && (
          <div>
            {/* Selected invoice balance summary */}
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg
                            flex items-center justify-between">
              <div>
                <p className="text-xs text-red-500 font-semibold uppercase tracking-wide">
                  Invoice Balance Due
                </p>
                <p className="font-mono text-xs text-red-400 mt-0.5">{selectedInvoice.reference}</p>
              </div>
              <p className="text-xl font-bold text-red-700">{fmt(selectedInvoice.invoice_balance)}</p>
            </div>

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Amount to Apply (USD)
            </label>
            <input
              type="number"
              min="0.01"
              max={maxApply}
              step="0.01"
              value={amount}
              onChange={e => { setAmount(e.target.value); setAmtError('') }}
              placeholder={`e.g. ${maxApply.toFixed(2)}`}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono
                          focus:outline-none focus:ring-2 focus:ring-violet-400
                          ${amtError ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
            />
            {amtError && <p className="text-xs text-red-600 mt-1">{amtError}</p>}
            <p className="text-xs text-slate-400 mt-1">
              Maximum: {fmt(maxApply)} (limited by{' '}
              {sourcePayment.unapplied_amount <= selectedInvoice.invoice_balance
                ? 'unallocated cash on this payment'
                : 'invoice balance due'})
            </p>

            {/* Quick-fill buttons */}
            <div className="flex gap-2 mt-2">
              <button type="button"
                onClick={() => { setAmount(String(maxApply.toFixed(2))); setAmtError('') }}
                className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700
                           hover:bg-violet-200 font-medium">
                Apply Max ({fmt(maxApply)})
              </button>
              <button type="button"
                onClick={() => { setAmount(String((maxApply / 2).toFixed(2))); setAmtError('') }}
                className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">
                Apply Half
              </button>
            </div>
          </div>
        )}

        {/* ── Live preview ─────────────────────────────────────────────── */}
        {selectedInvoice && effectiveAmount > 0 &&
         effectiveAmount <= sourcePayment.unapplied_amount + 0.005 && (
          <div className={`rounded-xl border p-4 ${
            fullyPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
          }`}>
            <p className={`text-xs font-bold uppercase tracking-wide mb-3 ${
              fullyPaid ? 'text-emerald-700' : 'text-amber-700'
            }`}>
              {fullyPaid ? '✓ Invoice will be fully paid' : '⚠ Invoice will be partially paid'}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div>
                <p className="text-slate-500 mb-0.5">Cash Applied</p>
                <p className="font-bold text-violet-700 text-base">{fmt(effectiveAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Invoice After</p>
                <p className={`font-bold text-base ${
                  fullyPaid ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {fmt(invoiceAfter)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Unallocated Left</p>
                <p className={`font-bold text-base ${
                  creditAfter > 0 ? 'text-violet-600' : 'text-slate-400'
                }`}>
                  {fmt(creditAfter)}
                </p>
              </div>
            </div>
            {invoiceAfter > 0.005 && (
              <p className="text-xs text-amber-700 mt-3 text-center">
                After applying, <strong>{fmt(invoiceAfter)}</strong> will still need to be
                collected as new cash.
              </p>
            )}
          </div>
        )}

        {/* ── Notes ────────────────────────────────────────────────────── */}
        <FormTextarea
          label="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={`e.g. Applying deposit from ${sourcePayment.reference}`}
          rows={2}
        />

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving || !selectedInvoice || effectiveAmount <= 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold
                       bg-violet-600 hover:bg-violet-700 text-white transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving && <ButtonSpinner />}
            {saving ? 'Applying…' : effectiveAmount > 0 ? `Apply ${fmt(effectiveAmount)}` : 'Apply Cash'}
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
