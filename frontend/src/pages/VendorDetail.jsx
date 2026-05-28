/**
 * pages/VendorDetail.jsx — Supplier account with full transaction ledger.
 *
 * Route: /vendors/:id
 *
 * Tabs:
 *   Ledger   — chronological supplier statement (bills + payments + running balance)
 *   Overview — account summary + contact details
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, Link }                          from 'react-router-dom'
import client                                       from '../api/client'
import { BulkPayModal }                             from './VendorBills'
import { vendorService }  from '../services/vendorService'
import { useToast }       from '../components/ui/Toast'
import { PageSpinner }    from '../components/ui/LoadingSpinner'
import Badge              from '../components/ui/Badge'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  }) : '—'

const SERVICE_ICONS = {
  flight:       '✈',
  hotel:        '🏨',
  tour_package: '🗺',
  visa:         '📋',
  insurance:    '🛡',
  other:        '📦',
}

const SERVICE_LABELS = {
  flight:       'Flight Ticket',
  hotel:        'Hotel Reservation',
  tour_package: 'Tour Package',
  visa:         'Visa Service',
  insurance:    'Travel Insurance',
  other:        'Other',
}

const VENDOR_TYPE_LABELS = {
  airline:   'Airline',
  hotel:     'Hotel',
  tour:      'Tour Operator',
  insurance: 'Insurance Provider',
  visa:      'Visa / Embassy',
  other:     'Other',
}

const TYPE_COLORS = {
  airline:   'bg-sky-100 text-sky-700',
  hotel:     'bg-emerald-100 text-emerald-700',
  tour:      'bg-violet-100 text-violet-700',
  insurance: 'bg-amber-100 text-amber-700',
  visa:      'bg-pink-100 text-pink-700',
  other:     'bg-slate-100 text-slate-600',
}

const ICONS = {
  building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  phone:    'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  mail:     'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  edit:     'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  bill:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  payment:  'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  service:  'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  layers:   'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
}

function InfoRow({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24"
           stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-slate-700 font-medium">{value}</p>
      </div>
    </div>
  )
}

const TABS = ['Ledger', 'Overview']

export default function VendorDetail() {
  const { id } = useParams()
  const toast  = useToast()

  const [vendor,      setVendor]      = useState(null)
  const [statement,   setStatement]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState('Ledger')
  const [showBulkPay, setShowBulkPay] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      vendorService.get(id),
      client.get(`/vendors/${id}/statement`),
    ])
      .then(([v, stmtRes]) => {
        setVendor(v)
        const data = stmtRes.data?.data
        setStatement({ summary: data?.summary, entries: data?.entries || [] })
      })
      .catch(() => toast.error('Could not load supplier account.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <PageSpinner />

  if (!vendor) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Supplier not found.</p>
        <Link to="/vendors" className="text-indigo-600 text-sm mt-2 inline-block">← Back</Link>
      </div>
    )
  }

  const typeLabel   = VENDOR_TYPE_LABELS[vendor.type]   || vendor.type
  const typeColor   = TYPE_COLORS[vendor.type]          || TYPE_COLORS.other
  const svcType     = vendor.default_service_type
  const svcLabel    = SERVICE_LABELS[svcType]           || svcType
  const summary     = statement?.summary  || {}
  const entries     = statement?.entries  || []
  const outstanding = summary.outstanding ?? vendor.outstanding_balance ?? 0
  const hasUnpaid   = entries.some(e => e.entry_type === 'bill' && e.balance_due > 0)

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Breadcrumb ──────────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/vendors" className="hover:text-indigo-600 transition-colors">Suppliers</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium truncate">{vendor.name}</span>
      </nav>

      {/* ── Profile card ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-indigo-600">
                {vendor.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-800">{vendor.name}</h1>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${typeColor}`}>
                  {typeLabel}
                </span>
              </div>
              {svcLabel && (
                <div className="flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24"
                       stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.service} />
                  </svg>
                  <span className="text-xs text-indigo-600 font-medium">
                    Default service: {SERVICE_ICONS[svcType] || ''} {svcLabel}
                  </span>
                </div>
              )}
              {vendor.contact_name && (
                <p className="text-sm text-slate-500 mt-1">Contact: {vendor.contact_name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/bills?vendor=${id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                         text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.bill} />
              </svg>
              All Invoices
            </Link>
            <Link to={`/vendors/${id}/edit`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                         text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.edit} />
              </svg>
              Edit
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Billed',    value: fmt(summary.total_billed ?? 0),
            sub: `${summary.bill_count ?? 0} invoice(s)`,
            cls: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
          { label: 'Total Paid',      value: fmt(summary.total_paid ?? 0),
            sub: `${summary.payment_count ?? 0} payment(s)`,
            cls: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
          { label: 'Outstanding',     value: fmt(outstanding),
            sub: 'Amount we still owe',
            cls: outstanding > 0 ? 'bg-red-50 border-red-100 text-red-700'
                                 : 'bg-slate-50 border-slate-200 text-slate-600' },
          { label: 'Default Service', value: svcLabel || '—',
            sub: typeLabel,
            cls: 'bg-slate-50 border-slate-200 text-slate-600' },
        ].map(({ label, value, sub, cls }) => (
          <div key={label} className={`rounded-xl border p-4 ${cls}`}>
            <p className="text-xs opacity-60 mb-1">{label}</p>
            <p className="text-sm font-bold leading-snug">{value}</p>
            {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-slate-200">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
            {t === 'Ledger' && entries.length > 0 && (
              <span className="ml-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">
                {entries.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TAB: LEDGER
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'Ledger' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Supplier Account Ledger</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                All supplier invoices and payments — chronological with running balance
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {outstanding > 0 && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100
                                 rounded-full px-3 py-1">
                  We owe: {fmt(outstanding)}
                </span>
              )}
              <button
                onClick={() => setShowBulkPay(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                           font-semibold bg-indigo-600 hover:bg-indigo-700 text-white
                           transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                     stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.layers} />
                </svg>
                Pay Here
              </button>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-10 h-10 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.bill} />
              </svg>
              <p className="text-sm text-slate-400">No transactions yet for this supplier.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Date','Type','Reference','Booking','Service','Description','Bill Amount','Paid','Balance Owed','Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500
                                              uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((entry, idx) => {
                    const isBill = entry.entry_type === 'bill'
                    const isPmt  = entry.entry_type === 'payment'
                    const bal    = entry.running_balance
                    const canPay = isBill && entry.balance_due > 0

                    return (
                      <tr key={idx}
                        className={`transition-colors ${
                          isBill ? 'hover:bg-orange-50/30'
                                 : 'hover:bg-emerald-50/40 bg-emerald-50/20'
                        }`}
                      >
                        {/* Date */}
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {fmtDate(entry.date)}
                        </td>

                        {/* Type badge */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isBill ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold
                                             text-orange-700 bg-orange-50 border border-orange-100
                                             rounded-full px-2 py-0.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24"
                                   stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.bill} />
                              </svg>
                              Invoice
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold
                                             text-emerald-700 bg-emerald-50 border border-emerald-100
                                             rounded-full px-2 py-0.5">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24"
                                   stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.payment} />
                              </svg>
                              Payment
                            </span>
                          )}
                        </td>

                        {/* Reference */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono text-xs text-slate-600">{entry.reference}</span>
                        </td>

                        {/* Booking ref */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.booking_ref ? (
                            <Link to={`/bookings/${entry.booking_id}`}
                              className="font-mono text-xs text-indigo-500 hover:underline">
                              {entry.booking_ref}
                            </Link>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Service type */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {entry.service_type ? (
                            <span className="text-xs">
                              {SERVICE_ICONS[entry.service_type] || '📦'}{' '}
                              <span className="text-slate-500 capitalize">
                                {entry.service_type.replace(/_/g, ' ')}
                              </span>
                            </span>
                          ) : entry.payment_method ? (
                            <span className="text-xs text-slate-500 capitalize">
                              {entry.payment_method.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Description */}
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                          {entry.description}
                        </td>

                        {/* Debit — bill amount */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {entry.debit > 0 ? (
                            <span className="font-semibold text-slate-800">{fmt(entry.debit)}</span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>

                        {/* Paid column:
                            - Bill row  → amount already paid against this specific bill
                            - Pmt row   → the credit amount of this payment */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isBill ? (
                            (entry.amount_paid ?? 0) > 0 ? (
                              <span className="font-semibold text-emerald-600">{fmt(entry.amount_paid)}</span>
                            ) : (
                              <span className="text-slate-200">—</span>
                            )
                          ) : entry.credit > 0 ? (
                            <span className="font-semibold text-emerald-600">{fmt(entry.credit)}</span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>

                        {/* Balance Owed column:
                            - Bill row  → remaining balance on THIS bill (balance_due)
                            - Pmt row   → cumulative running balance owed to vendor */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isBill ? (
                            <>
                              <span className={`font-bold text-sm ${
                                (entry.balance_due ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'
                              }`}>
                                {fmt(entry.balance_due ?? 0)}
                              </span>
                              {entry.due_date && (entry.balance_due ?? 0) > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5">Due {fmtDate(entry.due_date)}</p>
                              )}
                            </>
                          ) : (
                            <span className={`font-bold text-sm ${
                              bal > 0 ? 'text-red-600'
                              : bal < 0 ? 'text-emerald-600'
                              : 'text-slate-400'
                            }`}>
                              {fmt(bal)}
                            </span>
                          )}
                        </td>

                        {/* Action — status badge for bills */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {isBill ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                              ${entry.status === 'paid'           ? 'bg-emerald-100 text-emerald-700' :
                                entry.status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
                                                                    'bg-red-100 text-red-700'}`}>
                              {(entry.status || 'unpaid').replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-slate-200 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                {/* Totals footer */}
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={7} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Account Totals
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">
                      {fmt(summary.total_billed ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                      {fmt(summary.total_paid ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className={`font-bold text-base ${
                        outstanding > 0 ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {fmt(outstanding)}
                      </span>
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'Overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Account summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Account Summary</h3>
            <div className="space-y-0">
              {[
                { label: 'Total Billed',       value: fmt(summary.total_billed ?? 0) },
                { label: 'Total Paid',          value: fmt(summary.total_paid ?? 0) },
                { label: 'Still Owed',          value: fmt(outstanding),
                  valueClass: outstanding > 0 ? 'text-red-600 font-bold' : 'text-slate-700' },
                { label: 'Supplier Invoices',   value: summary.bill_count ?? 0 },
                { label: 'Payments Made',       value: summary.payment_count ?? 0 },
                { label: 'Default Service',     value: svcLabel || '—' },
              ].map(({ label, value, valueClass = 'text-slate-700' }) => (
                <div key={label} className="flex justify-between items-center py-2.5
                                             border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-500">{label}</span>
                  <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact info */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Contact Details</h3>
            <div className="space-y-3">
              <InfoRow icon={ICONS.phone}    label="Phone"          value={vendor.phone} />
              <InfoRow icon={ICONS.mail}     label="Email"          value={vendor.email} />
              <InfoRow icon={ICONS.building} label="Contact Person" value={vendor.contact_name} />
              {vendor.notes && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-0.5">Notes</p>
                  <p className="text-sm text-slate-600">{vendor.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Payment Modal ─────────────────────────────────────── */}
      {showBulkPay && (
        <BulkPayModal
          vendorId={Number(id)}
          vendorName={vendor.name}
          onClose={() => setShowBulkPay(false)}
          onSuccess={() => { setShowBulkPay(false); load() }}
        />
      )}

    </div>
  )
}
