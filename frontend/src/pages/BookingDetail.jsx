/**
 * pages/BookingDetail.jsx — Booking view with services, profit summary, and invoice link.
 */

import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { bookingService } from '../services/bookingService'
import { invoiceService } from '../services/invoiceService'
import { useToast } from '../components/ui/Toast'
import Badge from '../components/ui/Badge'
import { PageSpinner, ButtonSpinner } from '../components/ui/LoadingSpinner'

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n ?? 0)

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function LabelValue({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p
        className={`text-sm font-medium text-slate-800 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || '—'}
      </p>
    </div>
  )
}

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)

  const load = () => {
    bookingService
      .get(id)
      .then(setBooking)
      .catch(() => toast.error('Could not load booking.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleGenerateInvoice() {
    setGeneratingInvoice(true)

    try {
      const inv = await invoiceService.createFromBooking(id, {})

      toast.success(`Invoice ${inv.invoice_number} created.`)

      navigate(`/invoices/${inv.id}`)
    } catch (err) {
      toast.error(
        err?.response?.data?.error ?? 'Failed to generate invoice.'
      )
    } finally {
      setGeneratingInvoice(false)
    }
  }

  if (loading) return <PageSpinner />

  if (!booking) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Booking not found.</p>

        <Link
          to="/customers"
          className="text-indigo-600 text-sm mt-2 inline-block"
        >
          ← Back to Customers
        </Link>
      </div>
    )
  }

  const items = booking.items ?? []

  const totalSelling = items.reduce(
    (s, i) => s + (i.selling_price ?? 0) * (i.quantity ?? 1),
    0
  )

  const totalCost = items.reduce(
    (s, i) => s + (i.vendor_cost ?? 0) * (i.quantity ?? 1),
    0
  )

  const grossProfit = totalSelling - totalCost

  const margin =
    totalSelling > 0
      ? ((grossProfit / totalSelling) * 100).toFixed(1)
      : 0

  const invoice = booking.invoice
  const hasInvoice = Boolean(invoice?.id)

  return (
    <div className="space-y-5 max-w-5xl">

      <nav className="flex items-center gap-2 text-sm text-slate-500">
        {booking.customer_id && (
          <>
            <Link to="/customers" className="hover:text-indigo-600">
              Customers
            </Link>

            <span>/</span>

            <Link
              to={`/customers/${booking.customer_id}`}
              className="hover:text-indigo-600"
            >
              {booking.customer_name}
            </Link>

            <span>/</span>
          </>
        )}

        <span className="text-slate-700 font-medium">
          {booking.booking_ref}
        </span>
      </nav>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <p className="font-mono text-sm font-semibold text-indigo-600 mb-0.5">
            {booking.booking_ref}
          </p>

          <h1 className="text-xl font-bold text-slate-900">
            {booking.service_type?.replace(/_/g, ' ') ?? 'Booking'} —{' '}
            {booking.destination}
          </h1>

          <p className="text-sm text-slate-400 mt-0.5">
            Created {fmtDate(booking.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Badge label={booking.status} />
          <Badge label={booking.payment_status?.replace(/_/g, ' ')} />

          {!hasInvoice && (
            <button
              onClick={handleGenerateInvoice}
              disabled={generatingInvoice}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm
              disabled:opacity-50"
            >
              {generatingInvoice && <ButtonSpinner />}
              {generatingInvoice ? 'Generating…' : '+ Generate Invoice'}
            </button>
          )}

          {hasInvoice && (
            <Link
              to={`/invoices/${invoice.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              View Invoice →
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <div className="lg:col-span-2 space-y-5">

          <Section title="Booking Details">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">

              <LabelValue
                label="Service Type"
                value={booking.service_type?.replace(/_/g, ' ')}
              />

              <LabelValue
                label="Destination"
                value={booking.destination}
              />

              <LabelValue
                label="Travel Date"
                value={fmtDate(booking.travel_date)}
              />

              <LabelValue
                label="Return Date"
                value={fmtDate(booking.return_date)}
              />

              <LabelValue
                label="Booking Status"
                value={<Badge label={booking.status} />}
              />

              <LabelValue
                label="Payment Status"
                value={
                  <Badge
                    label={booking.payment_status?.replace(/_/g, ' ')}
                  />
                }
              />
            </div>
          </Section>

          {items.length > 0 && (
            <Section title="Services">

              <div className="overflow-x-auto -mx-5 px-5">

                <table className="w-full text-sm">

                  <thead>
                    <tr className="border-b border-slate-100">
                      {[
                        'Description',
                        'Type',
                        'Airline / Ticket',
                        'Qty',
                        'Selling Price',
                        'Vendor Cost',
                        'Profit',
                      ].map((h) => (
                        <th
                          key={h}
                          className="pb-2 text-left text-xs text-slate-400 font-medium pr-3"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-50">

                    {items.map((item, idx) => {
                      const p =
                        (item.selling_price - item.vendor_cost) *
                        (item.quantity ?? 1)

                      return (
                        <tr key={idx} className="text-slate-700">

                          <td className="py-2.5 pr-3">
                            {item.description}
                          </td>

                          <td className="py-2.5 pr-3">
                            <Badge label={item.service_type} />
                          </td>

                          <td className="py-2.5 pr-3">
                            {item.airline_name ? (
                              <div>
                                <p className="text-sm font-medium text-indigo-700">
                                  ✈ {item.airline_name}
                                </p>

                                {item.ticket_number && (
                                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                                    {item.ticket_number}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          <td className="py-2.5 pr-3">
                            {item.quantity ?? 1}
                          </td>

                          <td className="py-2.5 pr-3 font-semibold">
                            {fmt(item.selling_price)}
                          </td>

                          <td className="py-2.5 pr-3 text-slate-500">
                            {fmt(item.vendor_cost)}
                          </td>

                          <td
                            className={`py-2.5 font-semibold ${
                              p >= 0
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            }`}
                          >
                            {fmt(p)}
                          </td>

                        </tr>
                      )
                    })}

                  </tbody>
                </table>
              </div>
            </Section>
          )}

        </div>

        <div className="space-y-5">

          <Section title="Company">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-indigo-700">
                  {booking.customer_name?.charAt(0).toUpperCase()}
                </span>
              </div>

              <div>
                <p className="font-medium text-slate-800">
                  {booking.customer_name}
                </p>

                {booking.traveler_name && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    👤 {booking.traveler_name}
                  </p>
                )}

                <Link
                  to={`/customers/${booking.customer_id}`}
                  className="text-xs text-indigo-600 hover:underline mt-1 inline-block"
                >
                  View profile →
                </Link>
              </div>

            </div>

          </Section>

          <div
            className={`rounded-xl border p-4 space-y-2 ${
              grossProfit >= 0
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}
          >

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Profit Summary
            </p>

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Revenue</span>
              <span className="font-semibold text-slate-800">
                {fmt(totalSelling)}
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Vendor Cost</span>
              <span className="font-semibold text-slate-500">
                − {fmt(totalCost)}
              </span>
            </div>

            <div className="border-t border-slate-200 pt-2 flex justify-between">

              <span className="text-sm font-semibold text-slate-700">
                Gross Profit
              </span>

              <span
                className={`text-lg font-bold ${
                  grossProfit >= 0
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                {fmt(grossProfit)}
              </span>

            </div>

            <p
              className={`text-xs text-right ${
                grossProfit >= 0
                  ? 'text-emerald-600'
                  : 'text-red-600'
              }`}
            >
              {margin}% margin
            </p>

          </div>

        </div>
      </div>

    </div>
  )
}