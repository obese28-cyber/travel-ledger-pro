/**
 * pages/NewBooking.jsx — Create a new booking.
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { bookingService } from '../services/bookingService'
import { customerService } from '../services/customerService'
import { vendorService } from '../services/vendorService'
import { useToast } from '../components/ui/Toast'
import client from '../api/client'
import FormInput from '../components/ui/FormInput'
import FormSelect from '../components/ui/FormSelect'
import FormTextarea from '../components/ui/FormTextarea'
import { ButtonSpinner } from '../components/ui/LoadingSpinner'

const SERVICE_TYPE_OPTIONS = [
  { value: 'flight', label: '✈️ Flight Ticket' },
  { value: 'hotel', label: '🏨 Hotel Reservation' },
  { value: 'visa', label: '📋 Visa Service' },
  { value: 'tour_package', label: '🗺️ Tour Package' },
  { value: 'insurance', label: '🛡️ Travel Insurance' },
  { value: 'other', label: '📦 Other' },
]

const VENDOR_TYPE_LABELS = {
  airline: 'Airline',
  hotel: 'Hotel',
  tour: 'Tour Operator',
  visa: 'Visa / Embassy',
  insurance: 'Insurance Provider',
  other: 'Other Supplier',
}

const SERVICE_TYPE_LABELS = {
  flight: 'Flight Ticket',
  hotel: 'Hotel Reservation',
  visa: 'Visa Service',
  tour_package: 'Tour Package',
  insurance: 'Travel Insurance',
  other: 'Other',
}

const EMPTY_FORM = {
  customer_id: '',
  traveler_name: '',
  vendor_id: '',
  service_type: '',
  destination: '',
  travel_date: '',
  return_date: '',
  airline_id: '',
  ticket_number: '',
  selling_price: '',
  vendor_cost: '',
  notes: '',
}

function validate(form) {
  const errs = {}

  if (!form.customer_id) errs.customer_id = 'Please select a company.'
  if (!form.vendor_id) errs.vendor_id = 'Please select a supplier.'
  if (!form.service_type) errs.service_type = 'Please select a service type.'
  if (!form.destination.trim()) errs.destination = 'Destination is required.'
  if (!form.travel_date) errs.travel_date = 'Travel date is required.'

  if (
    form.selling_price === '' ||
    isNaN(Number(form.selling_price)) ||
    Number(form.selling_price) <= 0
  ) {
    errs.selling_price = 'Enter a valid selling price greater than 0.'
  }

  if (
    form.vendor_cost === '' ||
    isNaN(Number(form.vendor_cost)) ||
    Number(form.vendor_cost) < 0
  ) {
    errs.vendor_cost = 'Enter a valid supplier cost.'
  }

  if (form.service_type === 'flight' && !form.airline_id) {
    errs.airline_id = 'Please select an airline.'
  }

  return errs
}

export default function NewBooking() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToast()

  const [form, setForm] = useState({
    ...EMPTY_FORM,
    customer_id: searchParams.get('customer') ?? '',
  })

  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const [vendors, setVendors] = useState([])
  const [vendorOpts, setVendorOpts] = useState([])
  const [airlineOpts, setAirlineOpts] = useState([])
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [loadingDeps, setLoadingDeps] = useState(true)

  const selling = parseFloat(form.selling_price) || 0
  const cost = parseFloat(form.vendor_cost) || 0
  const profit = selling - cost
  const margin = selling > 0 ? ((profit / selling) * 100).toFixed(1) : 0

  useEffect(() => {
    Promise.all([
      customerService.list({ per_page: 500 }),
      vendorService.list({ per_page: 500 }),
      client.get('/airlines'),
    ])
      .then(([custRes, vendRes, airRes]) => {
        setCustomers(
          (custRes.data ?? []).map((c) => ({
            value: String(c.id),
            label: c.name,
          }))
        )

        const vends = vendRes.data ?? []
        setVendors(vends)

        setVendorOpts(
          vends.map((v) => ({
            value: String(v.id),
            label: `${v.name} (${VENDOR_TYPE_LABELS[v.type] ?? v.type})`,
          }))
        )

        const airlines = airRes.data?.data?.airlines ?? airRes.data?.airlines ?? []

        setAirlineOpts(
          airlines.map((a) => ({
            value: String(a.id),
            label: a.name,
          }))
        )
      })
      .catch(() => toast.error('Could not load customers, suppliers, or airlines.'))
      .finally(() => setLoadingDeps(false))
  }, [])

  function handleChange(e) {
    const { name, value } = e.target

    if (name === 'vendor_id') {
      const vendor = vendors.find((v) => String(v.id) === value)
      setSelectedVendor(vendor || null)

      setForm((prev) => ({
        ...prev,
        vendor_id: value,
        service_type: vendor?.default_service_type || '',
      }))

      setErrors((prev) => ({
        ...prev,
        vendor_id: '',
        service_type: '',
      }))

      return
    }

    if (name === 'service_type') {
      setForm((prev) => ({
        ...prev,
        service_type: value,
        // Keep airline_id and ticket_number — user may want to link a flight
        // to any type of booking (e.g. a tour package that includes flights)
      }))

      setErrors((prev) => ({
        ...prev,
        service_type: '',
        airline_id: '',
      }))

      return
    }

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const errs = validate(form)

    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }

    setSaving(true)

    try {
      const payload = {
        customer_id:   Number(form.customer_id),
        traveler_name: form.traveler_name.trim() || null,
        destination:   form.destination.trim(),
        travel_date:   form.travel_date,
        return_date:   form.return_date || null,
        notes:         form.notes.trim() || null,
        items: [
          {
            service_type: form.service_type,
            vendor_id: Number(form.vendor_id),
            description: `${
              SERVICE_TYPE_LABELS[form.service_type] || form.service_type
            } — ${form.destination.trim()}`,
            selling_price: parseFloat(form.selling_price),
            vendor_cost: parseFloat(form.vendor_cost),
            quantity: 1,
            airline_id: form.airline_id ? Number(form.airline_id) : null,
            ticket_number: form.ticket_number.trim() || null,
          },
        ],
      }

      const booking = await bookingService.create(payload)
      const ref = booking.booking_reference || booking.booking_ref || `#${booking.id}`

      toast.success(`Booking ${ref} created successfully.`)
      navigate(`/bookings/${booking.id}`)
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to create booking.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-5">
        <Link to="/bookings" className="hover:text-indigo-600 transition-colors">
          Bookings
        </Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">New Booking</span>
      </nav>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100">
          <h1 className="text-base font-semibold text-slate-800">New Booking</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Select a company and supplier, then enter the service details and pricing.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Company &amp; Supplier
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormSelect
              label="Company"
              name="customer_id"
              value={form.customer_id}
              onChange={handleChange}
              options={customers}
              placeholder={loadingDeps ? 'Loading…' : 'Select company…'}
              required
              error={errors.customer_id}
              disabled={loadingDeps}
            />

            <FormInput
              label="Customer Name"
              name="traveler_name"
              value={form.traveler_name}
              onChange={handleChange}
              placeholder="e.g. John Mensah"
              hint="Type the traveler's name"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormSelect
              label="Supplier / Vendor"
              name="vendor_id"
              value={form.vendor_id}
              onChange={handleChange}
              options={vendorOpts}
              placeholder={loadingDeps ? 'Loading…' : 'Select supplier…'}
              required
              error={errors.vendor_id}
              disabled={loadingDeps}
            />
          </div>

          {selectedVendor && (
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3">
              <p className="text-sm font-medium text-indigo-800">
                {selectedVendor.name}
              </p>

              <div className="flex flex-wrap gap-2 mt-1">
                <span className="text-xs text-indigo-600 bg-indigo-100 rounded-full px-2 py-0.5">
                  {VENDOR_TYPE_LABELS[selectedVendor.type] ?? selectedVendor.type}
                </span>

                {selectedVendor.default_service_type && (
                  <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    Default service:{' '}
                    {SERVICE_TYPE_LABELS[selectedVendor.default_service_type] ??
                      selectedVendor.default_service_type}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Service &amp; Travel Details
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormSelect
              label="Service Type"
              name="service_type"
              value={form.service_type}
              onChange={handleChange}
              options={SERVICE_TYPE_OPTIONS}
              placeholder="Select service type…"
              required
              error={errors.service_type}
            />

            <FormInput
              label="Destination"
              name="destination"
              value={form.destination}
              onChange={handleChange}
              placeholder="e.g. Dubai, UAE"
              required
              error={errors.destination}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <div className="sm:col-span-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                ✈️ Airline &amp; Ticket
              </p>
              {form.service_type !== 'flight' && (
                <span className="text-xs text-blue-400 italic">Optional for this service type</span>
              )}
            </div>

            <FormSelect
              label="Airline"
              name="airline_id"
              value={form.airline_id}
              onChange={handleChange}
              options={airlineOpts}
              placeholder={
                airlineOpts.length === 0
                  ? 'No airlines — add in Airlines setup'
                  : 'Select airline…'
              }
              required={form.service_type === 'flight'}
              error={errors.airline_id}
              disabled={airlineOpts.length === 0}
              hint={form.service_type !== 'flight' ? 'Optional — will appear on invoice' : undefined}
            />

            <FormInput
              label="Ticket Number"
              name="ticket_number"
              value={form.ticket_number}
              onChange={handleChange}
              placeholder="e.g. 176-1234567890"
              hint="Optional — will appear on invoice"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Travel Date"
              name="travel_date"
              type="date"
              value={form.travel_date}
              onChange={handleChange}
              required
              error={errors.travel_date}
            />

            <FormInput
              label="Return Date"
              name="return_date"
              type="date"
              value={form.return_date}
              onChange={handleChange}
              hint="Optional"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Pricing
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Selling Price"
              name="selling_price"
              type="number"
              min="0.01"
              step="0.01"
              value={form.selling_price}
              onChange={handleChange}
              placeholder="0.00"
              required
              error={errors.selling_price}
              hint="What the customer pays you"
            />

            <FormInput
              label="Supplier Cost"
              name="vendor_cost"
              type="number"
              min="0"
              step="0.01"
              value={form.vendor_cost}
              onChange={handleChange}
              placeholder="0.00"
              required
              error={errors.vendor_cost}
              hint="What you pay the supplier"
            />
          </div>

          {(selling > 0 || cost > 0) && (
            <div
              className={`rounded-xl p-4 flex items-center justify-between ${
                profit >= 0
                  ? 'bg-emerald-50 border border-emerald-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Gross Profit</p>
                <p
                  className={`text-2xl font-bold ${
                    profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  ${profit.toFixed(2)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selling ${selling.toFixed(2)} − Cost ${cost.toFixed(2)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-slate-500 mb-0.5">Margin</p>
                <p
                  className={`text-2xl font-bold ${
                    profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {margin}%
                </p>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <FormTextarea
              label="Notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Flight number, hotel confirmation, itinerary notes…"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving || loadingDeps}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
              bg-indigo-600 hover:bg-indigo-700 text-white transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving && <ButtonSpinner />}
              {saving ? 'Creating…' : 'Create Booking'}
            </button>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600
              border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}