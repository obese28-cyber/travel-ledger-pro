/**
 * pages/NewBooking.jsx — Create a new booking.
 *
 * Mode A — Single Passenger  : standard vertical form
 * Mode B — Multiple Passengers: table where rows = PAX, columns = fields
 *   Company is chosen ONCE in the shared header — never per-passenger.
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
  { value: 'flight',       label: '✈️ Flight Ticket' },
  { value: 'hotel',        label: '🏨 Hotel Reservation' },
  { value: 'visa',         label: '📋 Visa Service' },
  { value: 'tour_package', label: '🗺️ Tour Package' },
  { value: 'insurance',    label: '🛡️ Travel Insurance' },
  { value: 'other',        label: '📦 Other' },
]

const VENDOR_TYPE_LABELS = {
  airline:   'Airline',
  hotel:     'Hotel',
  tour:      'Tour Operator',
  visa:      'Visa / Embassy',
  insurance: 'Insurance Provider',
  other:     'Other Supplier',
}

const SERVICE_TYPE_LABELS = {
  flight:       'Flight Ticket',
  hotel:        'Hotel Reservation',
  visa:         'Visa Service',
  tour_package: 'Tour Package',
  insurance:    'Travel Insurance',
  other:        'Other',
}

const EMPTY_FORM = {
  customer_id:   '',
  traveler_name: '',
  vendor_id:     '',
  service_type:  '',
  destination:   '',
  travel_date:   '',
  return_date:   '',
  airline_id:    '',
  ticket_number: '',
  selling_price: '',
  vendor_cost:   '',
  notes:         '',
}

const EMPTY_PAX = {
  name:          '',
  airline_id:    '',
  ticket_number: '',
  selling_price: '',
  vendor_cost:   '',
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateSingle(f) {
  const e = {}
  if (!f.customer_id)          e.customer_id   = 'Please select a company.'
  if (!f.vendor_id)            e.vendor_id     = 'Please select a supplier.'
  if (!f.service_type)         e.service_type  = 'Please select a service type.'
  if (!f.destination.trim())   e.destination   = 'Destination is required.'
  if (!f.travel_date)          e.travel_date   = 'Travel date is required.'
  if (!f.return_date)          e.return_date   = 'Return date is required.'
  if (!f.traveler_name.trim()) e.traveler_name = 'Passenger name is required.'
  if (!f.selling_price || isNaN(+f.selling_price) || +f.selling_price <= 0)
    e.selling_price = 'Enter a valid selling price greater than 0.'
  if (f.vendor_cost === '' || isNaN(+f.vendor_cost) || +f.vendor_cost < 0)
    e.vendor_cost = 'Enter a valid supplier cost.'
  if (f.service_type === 'flight') {
    if (!f.airline_id)           e.airline_id    = 'Please select an airline.'
    if (!f.ticket_number.trim()) e.ticket_number = 'Ticket number is required for flights.'
  }
  return e
}

function validateMultiHeader(h) {
  const e = {}
  if (!h.customer_id)        e.customer_id  = 'Please select a company.'
  if (!h.vendor_id)          e.vendor_id    = 'Please select a supplier.'
  if (!h.service_type)       e.service_type = 'Please select a service type.'
  if (!h.destination.trim()) e.destination  = 'Destination is required.'
  if (!h.travel_date)        e.travel_date  = 'Travel date is required.'
  if (!h.return_date)        e.return_date  = 'Return date is required.'
  return e
}

function validatePaxRows(rows, serviceType) {
  return rows.map((p) => {
    const e = {}
    if (!p.name.trim())                                        e.name          = 'Required'
    if (!p.selling_price || +p.selling_price <= 0)             e.selling_price = 'Required'
    if (p.vendor_cost === '' || isNaN(+p.vendor_cost))         e.vendor_cost   = 'Required'
    if (serviceType === 'flight') {
      if (!p.airline_id)           e.airline_id    = 'Required'
      if (!p.ticket_number.trim()) e.ticket_number = 'Required'
    }
    return e
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NewBooking() {
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()
  const toast          = useToast()

  const [mode,        setMode]        = useState('single')
  const [formKey,     setFormKey]     = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [loadingDeps, setLoadingDeps] = useState(true)

  const [customers,      setCustomers]      = useState([])
  const [vendors,        setVendors]        = useState([])
  const [vendorOpts,     setVendorOpts]     = useState([])
  const [airlineOpts,    setAirlineOpts]    = useState([])
  const [selectedVendor, setSelectedVendor] = useState(null)

  // single-pax
  const [form,   setForm]   = useState({ ...EMPTY_FORM, customer_id: searchParams.get('customer') ?? '' })
  const [errors, setErrors] = useState({})

  // multi-pax
  const EMPTY_HDR = {
    customer_id: searchParams.get('customer') ?? '',
    vendor_id: '', service_type: '', destination: '',
    travel_date: '', return_date: '', notes: '',
  }
  const [hdr,      setHdr]      = useState({ ...EMPTY_HDR })
  const [hdrErrs,  setHdrErrs]  = useState({})
  const [paxList,  setPaxList]  = useState([{ ...EMPTY_PAX }, { ...EMPTY_PAX }])
  const [paxErrs,  setPaxErrs]  = useState([{}, {}])

  // profit helpers
  const sSell = parseFloat(form.selling_price) || 0
  const sCost = parseFloat(form.vendor_cost)   || 0
  const sProfit = sSell - sCost
  const sMargin = sSell > 0 ? ((sProfit / sSell) * 100).toFixed(1) : 0

  const mTotalSell = paxList.reduce((s, p) => s + (parseFloat(p.selling_price) || 0), 0)
  const mTotalCost = paxList.reduce((s, p) => s + (parseFloat(p.vendor_cost)   || 0), 0)
  const mProfit    = mTotalSell - mTotalCost

  // load dropdowns
  useEffect(() => {
    Promise.all([
      customerService.list({ per_page: 500 }),
      vendorService.list({ per_page: 500 }),
      client.get('/airlines'),
    ]).then(([cR, vR, aR]) => {
      setCustomers((cR.data ?? []).map((c) => ({ value: String(c.id), label: c.name })))
      const vends = vR.data ?? []
      setVendors(vends)
      setVendorOpts(vends.map((v) => ({
        value: String(v.id),
        label: `${v.name} (${VENDOR_TYPE_LABELS[v.type] ?? v.type})`,
      })))
      const airlines = aR.data?.data?.airlines ?? aR.data?.airlines ?? []
      setAirlineOpts(airlines.map((a) => ({ value: String(a.id), label: a.name })))
    })
    .catch(() => toast.error('Could not load customers, suppliers, or airlines.'))
    .finally(() => setLoadingDeps(false))
  }, [])

  // vendor change helper
  function applyVendor(vendorId, setter, errSetter) {
    const v = vendors.find((x) => String(x.id) === vendorId)
    setSelectedVendor(v || null)
    setter((p) => ({ ...p, vendor_id: vendorId, service_type: v?.default_service_type || '' }))
    errSetter((p) => ({ ...p, vendor_id: '', service_type: '' }))
  }

  // ── single-pax handlers ──────────────────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target
    if (name === 'vendor_id')    { applyVendor(value, setForm, setErrors); return }
    if (name === 'service_type') {
      setForm((p) => ({ ...p, service_type: value }))
      setErrors((p) => ({ ...p, service_type: '', airline_id: '' }))
      return
    }
    setForm((p) => ({ ...p, [name]: value }))
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }))
  }

  async function handleSingleSubmit(e) {
    e.preventDefault()
    const errs = validateSingle(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const booking = await bookingService.create({
        customer_id:   Number(form.customer_id),
        traveler_name: form.traveler_name.trim() || null,
        destination:   form.destination.trim(),
        travel_date:   form.travel_date,
        return_date:   form.return_date || null,
        notes:         form.notes.trim() || null,
        items: [{
          service_type:  form.service_type,
          vendor_id:     Number(form.vendor_id),
          description:   `${SERVICE_TYPE_LABELS[form.service_type] || form.service_type} — ${form.destination.trim()}`,
          selling_price: parseFloat(form.selling_price),
          vendor_cost:   parseFloat(form.vendor_cost),
          quantity:      1,
          airline_id:    form.airline_id ? Number(form.airline_id) : null,
          ticket_number: form.ticket_number.trim() || null,
        }],
      })
      const ref = booking.booking_reference || `#${booking.id}`
      toast.success(`Booking ${ref} created successfully.`)
      setForm({ ...EMPTY_FORM }); setErrors({}); setSelectedVendor(null)
      setFormKey((k) => k + 1)
      navigate(`/bookings/${booking.id}`)
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to create booking.')
    } finally { setSaving(false) }
  }

  // ── multi-pax handlers ───────────────────────────────────────────────────
  function handleHdrChange(e) {
    const { name, value } = e.target
    if (name === 'vendor_id')    { applyVendor(value, setHdr, setHdrErrs); return }
    if (name === 'service_type') {
      setHdr((p) => ({ ...p, service_type: value }))
      setHdrErrs((p) => ({ ...p, service_type: '' }))
      return
    }
    setHdr((p) => ({ ...p, [name]: value }))
    if (hdrErrs[name]) setHdrErrs((p) => ({ ...p, [name]: '' }))
  }

  function paxChange(idx, field, value) {
    setPaxList((l) => l.map((p, i) => i === idx ? { ...p, [field]: value } : p))
    setPaxErrs((l) => l.map((e, i) => i === idx ? { ...e, [field]: '' } : e))
  }

  function addPax() {
    if (paxList.length >= 6) return
    setPaxList((l) => [...l, { ...EMPTY_PAX }])
    setPaxErrs((l) => [...l, {}])
  }

  function removePax(idx) {
    if (paxList.length <= 1) return
    setPaxList((l) => l.filter((_, i) => i !== idx))
    setPaxErrs((l) => l.filter((_, i) => i !== idx))
  }

  async function handleMultiSubmit(e) {
    e.preventDefault()
    const hE = validateMultiHeader(hdr)
    const pE = validatePaxRows(paxList, hdr.service_type)
    if (Object.keys(hE).length || pE.some((x) => Object.keys(x).length)) {
      setHdrErrs(hE); setPaxErrs(pE); return
    }
    setSaving(true)
    try {
      const booking = await bookingService.create({
        customer_id: Number(hdr.customer_id),
        destination: hdr.destination.trim(),
        travel_date: hdr.travel_date,
        return_date: hdr.return_date || null,
        notes:       hdr.notes.trim() || null,
        items: paxList.map((p) => ({
          service_type:   hdr.service_type,
          vendor_id:      Number(hdr.vendor_id),
          description:    `${SERVICE_TYPE_LABELS[hdr.service_type] || hdr.service_type} — ${hdr.destination.trim()}`,
          selling_price:  parseFloat(p.selling_price),
          vendor_cost:    parseFloat(p.vendor_cost),
          quantity:       1,
          airline_id:     p.airline_id ? Number(p.airline_id) : null,
          ticket_number:  p.ticket_number.trim() || null,
          passenger_name: p.name.trim(),
        })),
      })
      const ref = booking.booking_reference || `#${booking.id}`
      toast.success(`Booking ${ref} created — ${paxList.length} passengers.`)
      setHdr({ ...EMPTY_HDR }); setHdrErrs({})
      setPaxList([{ ...EMPTY_PAX }, { ...EMPTY_PAX }]); setPaxErrs([{}, {}])
      setSelectedVendor(null); setFormKey((k) => k + 1)
      navigate(`/bookings/${booking.id}`)
    } catch (err) {
      toast.error(err?.response?.data?.error ?? 'Failed to create booking.')
    } finally { setSaving(false) }
  }

  // ── Shared header section (company chosen ONCE here) ─────────────────────
  function HeaderFields({ values, errs, onChange }) {
    return (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Company &amp; Supplier
        </p>

        {/* Company — full width, prominent, chosen once */}
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3">
            🏢 Company — applies to all passengers
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormSelect
              label="Company" name="customer_id" value={values.customer_id}
              onChange={onChange} options={customers}
              placeholder={loadingDeps ? 'Loading…' : 'Select company…'}
              required error={errs.customer_id} disabled={loadingDeps}
            />
            <FormSelect
              label="Supplier / Vendor" name="vendor_id" value={values.vendor_id}
              onChange={onChange} options={vendorOpts}
              placeholder={loadingDeps ? 'Loading…' : 'Select supplier…'}
              required error={errs.vendor_id} disabled={loadingDeps}
            />
            <FormSelect
              label="Service Type" name="service_type" value={values.service_type}
              onChange={onChange} options={SERVICE_TYPE_OPTIONS}
              placeholder="Select service type…" required error={errs.service_type}
            />
          </div>
        </div>

        {selectedVendor && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700">{selectedVendor.name}</span>
            <span className="text-xs text-indigo-600 bg-indigo-100 rounded-full px-2 py-0.5">
              {VENDOR_TYPE_LABELS[selectedVendor.type] ?? selectedVendor.type}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Travel Details
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormInput
            label="Destination" name="destination" value={values.destination}
            onChange={onChange} placeholder="e.g. Dubai, UAE"
            required error={errs.destination}
          />
          <FormInput
            label="Travel Date" name="travel_date" type="date" value={values.travel_date}
            onChange={onChange} required error={errs.travel_date}
          />
          <FormInput
            label="Return Date" name="return_date" type="date" value={values.return_date}
            onChange={onChange} required error={errs.return_date}
          />
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl">
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-5">
        <Link to="/bookings" className="hover:text-indigo-600 transition-colors">Bookings</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">New Booking</span>
      </nav>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">

        {/* Mode toggle */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-800">New Booking</h1>
            <p className="text-sm text-slate-500 mt-0.5">Single or multiple passengers.</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
            <button type="button" onClick={() => setMode('single')}
              className={`px-4 py-2 transition-colors ${mode === 'single'
                ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              👤 Single Passenger
            </button>
            <button type="button" onClick={() => setMode('multi')}
              className={`px-4 py-2 border-l border-slate-200 transition-colors ${mode === 'multi'
                ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              👥 Multiple Passengers
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            SINGLE PASSENGER
        ═══════════════════════════════════════════════════════════════ */}
        {mode === 'single' && (
          <form key={`s-${formKey}`} onSubmit={handleSingleSubmit} noValidate autoComplete="off" className="p-6 space-y-5">
            <HeaderFields values={form} errs={errors} onChange={handleChange} />

            {/* Passenger name (single mode only) */}
            <FormInput
              label="Passenger Name" name="traveler_name" value={form.traveler_name}
              onChange={handleChange} placeholder="e.g. John Mensah"
              required error={errors.traveler_name} autoComplete="off"
            />

            {/* Airline & Ticket */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                  ✈️ Airline &amp; Ticket
                </p>
              </div>
              <FormSelect
                label="Airline" name="airline_id" value={form.airline_id}
                onChange={handleChange} options={airlineOpts}
                placeholder={airlineOpts.length === 0 ? 'No airlines — add in setup' : 'Select airline…'}
                required={form.service_type === 'flight'} error={errors.airline_id}
                disabled={airlineOpts.length === 0}
              />
              <FormInput
                label="Ticket Number" name="ticket_number" value={form.ticket_number}
                onChange={handleChange} placeholder="e.g. 176-1234567890"
                required={form.service_type === 'flight'} error={errors.ticket_number}
                autoComplete="off"
              />
            </div>

            {/* Pricing */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Pricing</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormInput label="Selling Price" name="selling_price" type="number" min="0.01" step="0.01"
                value={form.selling_price} onChange={handleChange} placeholder="0.00"
                required error={errors.selling_price} hint="What the customer pays" />
              <FormInput label="Supplier Cost" name="vendor_cost" type="number" min="0" step="0.01"
                value={form.vendor_cost} onChange={handleChange} placeholder="0.00"
                required error={errors.vendor_cost} hint="What you pay the supplier" />
            </div>

            {(sSell > 0 || sCost > 0) && (
              <div className={`rounded-xl p-4 flex items-center justify-between ${sProfit >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Gross Profit</p>
                  <p className={`text-2xl font-bold ${sProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    GHS {sProfit.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Sell {sSell.toFixed(2)} − Cost {sCost.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-0.5">Margin</p>
                  <p className={`text-2xl font-bold ${sProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{sMargin}%</p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <FormTextarea label="Notes" name="notes" value={form.notes} onChange={handleChange}
                placeholder="Flight number, hotel confirmation, itinerary notes…" rows={2} />
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <button type="submit" disabled={saving || loadingDeps}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {saving && <ButtonSpinner />}{saving ? 'Creating…' : 'Create Booking'}
              </button>
              <button type="button" onClick={() => navigate(-1)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            MULTIPLE PASSENGERS — rows = PAX, columns = fields
        ═══════════════════════════════════════════════════════════════ */}
        {mode === 'multi' && (
          <form key={`m-${formKey}`} onSubmit={handleMultiSubmit} noValidate autoComplete="off" className="p-6 space-y-5">
            <HeaderFields values={hdr} errs={hdrErrs} onChange={handleHdrChange} />

            {/* PAX table */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Passengers &nbsp;
                  <span className="text-indigo-500 font-bold normal-case">{paxList.length}</span>
                  <span className="text-slate-300"> / 6</span>
                </p>
                {paxList.length < 6 && (
                  <button type="button" onClick={addPax}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors">
                    + Add PAX
                  </button>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm" style={{ minWidth: '680px' }}>
                  <thead>
                    <tr className="bg-slate-700 text-white text-xs">
                      <th className="px-3 py-2.5 text-left font-semibold w-8">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">
                        Passenger Name <span className="text-red-400">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold w-36">
                        Airline {hdr.service_type === 'flight' && <span className="text-red-400">*</span>}
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold w-32">
                        Ticket # {hdr.service_type === 'flight' && <span className="text-red-400">*</span>}
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold w-28">
                        Selling Price <span className="text-red-400">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold w-28">
                        Supplier Cost <span className="text-red-400">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold w-24">Profit</th>
                      <th className="px-2 py-2.5 w-8"></th>
                    </tr>
                  </thead>

                  <tbody>
                    {paxList.map((p, i) => {
                      const sp  = parseFloat(p.selling_price) || 0
                      const vc  = parseFloat(p.vendor_cost)   || 0
                      const pr  = sp - vc
                      const odd = i % 2 === 1
                      return (
                        <tr key={i} className={`border-t border-slate-100 ${odd ? 'bg-slate-50' : 'bg-white'}`}>
                          {/* Row number */}
                          <td className="px-3 py-2 text-xs font-semibold text-slate-400 text-center">{i + 1}</td>

                          {/* Name */}
                          <td className="px-2 py-2">
                            <input
                              value={p.name}
                              onChange={(e) => paxChange(i, 'name', e.target.value)}
                              placeholder="Full name"
                              autoComplete="off"
                              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-400
                                ${paxErrs[i]?.name ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                            />
                            {paxErrs[i]?.name && (
                              <p className="text-red-500 text-xs mt-0.5">{paxErrs[i].name}</p>
                            )}
                          </td>

                          {/* Airline */}
                          <td className="px-2 py-2">
                            <select
                              value={p.airline_id}
                              onChange={(e) => paxChange(i, 'airline_id', e.target.value)}
                              className={`w-full text-xs px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white
                                ${paxErrs[i]?.airline_id ? 'border-red-400' : 'border-slate-300'}`}>
                              <option value="">— select —</option>
                              {airlineOpts.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>
                            {paxErrs[i]?.airline_id && (
                              <p className="text-red-500 text-xs mt-0.5">{paxErrs[i].airline_id}</p>
                            )}
                          </td>

                          {/* Ticket # */}
                          <td className="px-2 py-2">
                            <input
                              value={p.ticket_number}
                              onChange={(e) => paxChange(i, 'ticket_number', e.target.value)}
                              placeholder="e.g. 176-123456"
                              autoComplete="off"
                              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-400
                                ${paxErrs[i]?.ticket_number ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                            />
                            {paxErrs[i]?.ticket_number && (
                              <p className="text-red-500 text-xs mt-0.5">{paxErrs[i].ticket_number}</p>
                            )}
                          </td>

                          {/* Selling Price */}
                          <td className="px-2 py-2">
                            <input type="number" min="0.01" step="0.01"
                              value={p.selling_price}
                              onChange={(e) => paxChange(i, 'selling_price', e.target.value)}
                              placeholder="0.00"
                              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-400
                                ${paxErrs[i]?.selling_price ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                            />
                            {paxErrs[i]?.selling_price && (
                              <p className="text-red-500 text-xs mt-0.5">{paxErrs[i].selling_price}</p>
                            )}
                          </td>

                          {/* Supplier Cost */}
                          <td className="px-2 py-2">
                            <input type="number" min="0" step="0.01"
                              value={p.vendor_cost}
                              onChange={(e) => paxChange(i, 'vendor_cost', e.target.value)}
                              placeholder="0.00"
                              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-400
                                ${paxErrs[i]?.vendor_cost ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
                            />
                            {paxErrs[i]?.vendor_cost && (
                              <p className="text-red-500 text-xs mt-0.5">{paxErrs[i].vendor_cost}</p>
                            )}
                          </td>

                          {/* Profit (live) */}
                          <td className="px-3 py-2 text-right">
                            <span className={`text-xs font-bold ${pr > 0 ? 'text-emerald-600' : pr < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                              {sp > 0 || vc > 0 ? `${pr >= 0 ? '+' : ''}${pr.toFixed(2)}` : '—'}
                            </span>
                          </td>

                          {/* Remove */}
                          <td className="px-2 py-2 text-center">
                            {paxList.length > 1 && (
                              <button type="button" onClick={() => removePax(i)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                                title="Remove passenger">
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}

                    {/* Totals row */}
                    {(mTotalSell > 0 || mTotalCost > 0) && (
                      <tr className="border-t-2 border-indigo-200 bg-indigo-50">
                        <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-indigo-700">
                          Totals — {paxList.length} passenger{paxList.length > 1 ? 's' : ''}
                        </td>
                        <td className="px-2 py-2.5 text-xs font-semibold text-slate-700">
                          {mTotalSell.toFixed(2)}
                        </td>
                        <td className="px-2 py-2.5 text-xs font-semibold text-slate-600">
                          {mTotalCost.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-sm font-bold ${mProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {mProfit >= 0 ? '+' : ''}{mProfit.toFixed(2)}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <FormTextarea label="Notes" name="notes" value={hdr.notes} onChange={handleHdrChange}
                placeholder="Group booking reference, PNR, hotel confirmation…" rows={2} />
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
              <button type="submit" disabled={saving || loadingDeps}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {saving && <ButtonSpinner />}
                {saving ? 'Creating…' : `Create Booking (${paxList.length} PAX)`}
              </button>
              <button type="button" onClick={() => navigate(-1)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}
