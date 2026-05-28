/**
 * pages/VendorForm.jsx — Add or Edit a vendor/supplier.
 *
 * Key feature: when Vendor Type is selected, default_service_type auto-fills
 * with the matching service type. Staff can override it if needed.
 *
 * Routes:
 *   /vendors/new       -> create mode
 *   /vendors/:id/edit  -> edit mode
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { vendorService } from '../services/vendorService'
import { useToast }      from '../components/ui/Toast'
import FormInput         from '../components/ui/FormInput'
import FormSelect        from '../components/ui/FormSelect'
import FormTextarea      from '../components/ui/FormTextarea'
import { ButtonSpinner } from '../components/ui/LoadingSpinner'

const VENDOR_TYPE_OPTIONS = [
  { value: 'airline',   label: 'Airline' },
  { value: 'hotel',     label: 'Hotel' },
  { value: 'tour',      label: 'Tour Operator' },
  { value: 'insurance', label: 'Insurance Provider' },
  { value: 'visa',      label: 'Visa / Embassy' },
  { value: 'other',     label: 'Other' },
]

const SERVICE_TYPE_OPTIONS = [
  { value: 'flight',       label: 'Flight Ticket' },
  { value: 'hotel',        label: 'Hotel Reservation' },
  { value: 'tour_package', label: 'Tour Package' },
  { value: 'insurance',    label: 'Travel Insurance' },
  { value: 'visa',         label: 'Visa Service' },
  { value: 'other',        label: 'Other' },
]

// Auto-suggest mapping: vendor type → default service type
const TYPE_TO_SERVICE = {
  airline:   'flight',
  hotel:     'hotel',
  tour:      'tour_package',
  insurance: 'insurance',
  visa:      'visa',
  other:     'other',
}

const EMPTY_FORM = {
  name:                 '',
  type:                 '',
  default_service_type: '',
  contact_name:         '',
  phone:                '',
  email:                '',
  notes:                '',
}

function validate(form) {
  const errs = {}
  if (!form.name.trim())
    errs.name = 'Supplier name is required.'
  if (!form.type)
    errs.type = 'Please select a supplier type.'
  if (!form.default_service_type)
    errs.default_service_type = 'Please select the default service type for this supplier.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errs.email = 'Enter a valid email address.'
  return errs
}

export default function VendorForm() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const toast    = useToast()
  const isEdit   = Boolean(id)

  const [form,    setForm]    = useState(EMPTY_FORM)
  const [errors,  setErrors]  = useState({})
  const [loading, setLoading] = useState(isEdit)
  const [saving,  setSaving]  = useState(false)

  // Load existing vendor in edit mode
  useEffect(() => {
    if (!isEdit) return
    vendorService.get(id)
      .then(v => setForm({
        name:                 v.name                 || '',
        type:                 v.type                 || '',
        default_service_type: v.default_service_type || '',
        contact_name:         v.contact_name         || '',
        phone:                v.phone                || '',
        email:                v.email                || '',
        notes:                v.notes                || '',
      }))
      .catch(() => toast.error('Could not load supplier.'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  function handleChange(e) {
    const { name, value } = e.target

    if (name === 'type') {
      // Auto-suggest default_service_type from vendor type
      const autoService = TYPE_TO_SERVICE[value] || ''
      setForm(f => ({
        ...f,
        type:                 value,
        default_service_type: autoService,
      }))
      setErrors(er => ({ ...er, type: undefined, default_service_type: undefined }))
      return
    }

    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(er => ({ ...er, [name]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const payload = {
        name:                 form.name.trim(),
        type:                 form.type,
        default_service_type: form.default_service_type,
        contact_name:         form.contact_name.trim() || null,
        phone:                form.phone.trim()        || null,
        email:                form.email.trim()        || null,
        notes:                form.notes.trim()        || null,
      }
      const vendor = isEdit
        ? await vendorService.update(id, payload)
        : await vendorService.create(payload)

      toast.success(isEdit ? 'Supplier updated.' : 'Supplier added successfully.')
      navigate(`/vendors/${vendor.id}`)
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to save supplier.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link to="/vendors" className="hover:text-indigo-600 transition-colors">Suppliers</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">
          {isEdit ? 'Edit Supplier' : 'New Supplier'}
        </span>
      </nav>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h1 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Edit Supplier' : 'Add New Supplier'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit
              ? 'Update supplier information and service settings.'
              : 'Add an airline, hotel, tour operator, or any other service provider.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">

          {/* ── Supplier Name ─────────────────────────────────── */}
          <FormInput
            label="Supplier Name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Emirates Airlines, Marriott Hotels, AXA Insurance"
            required
            error={errors.name}
          />

          {/* ── Supplier Type + Default Service Type ──────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormSelect
              label="Supplier Type"
              name="type"
              value={form.type}
              onChange={handleChange}
              options={VENDOR_TYPE_OPTIONS}
              placeholder="Select supplier type"
              required
              error={errors.type}
            />
            <FormSelect
              label="Default Service Type"
              name="default_service_type"
              value={form.default_service_type}
              onChange={handleChange}
              options={SERVICE_TYPE_OPTIONS}
              placeholder="Select service type"
              required
              error={errors.default_service_type}
              hint="Auto-filled from supplier type — you can change it"
            />
          </div>

          {/* Info box explaining the link */}
          {form.type && form.default_service_type && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs text-amber-800 font-medium">Service type auto-fill</p>
              <p className="text-xs text-amber-700 mt-0.5">
                When staff select <strong>{form.name || 'this supplier'}</strong> in a booking,
                the service type will automatically be set to{' '}
                <strong>
                  {SERVICE_TYPE_OPTIONS.find(o => o.value === form.default_service_type)?.label
                    || form.default_service_type}
                </strong>.
              </p>
            </div>
          )}

          {/* ── Contact ───────────────────────────────────────── */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Contact Information
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Contact Person"
              name="contact_name"
              value={form.contact_name}
              onChange={handleChange}
              placeholder="Primary contact name"
            />
            <FormInput
              label="Phone Number"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="+1 234 567 8900"
            />
          </div>

          <FormInput
            label="Email Address"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="supplier@example.com"
            error={errors.email}
          />

          <FormTextarea
            label="Notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Payment terms, bank details, special instructions…"
            rows={3}
          />

          {/* ── Actions ───────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white
                         text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60
                         transition-colors shadow-sm"
            >
              {saving && <ButtonSpinner />}
              {isEdit ? 'Save Changes' : 'Add Supplier'}
            </button>
            <Link
              to={isEdit ? `/vendors/${id}` : '/vendors'}
              className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800
                         border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
          </div>

        </form>
      </div>
    </div>
  )
}
