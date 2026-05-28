/**
 * pages/CustomerForm.jsx — Add or Edit a customer.
 *
 * Routes:
 *   /customers/new      → create mode
 *   /customers/:id/edit → edit mode
 *
 * Connects to:
 *   POST /api/customers/        (create)
 *   PUT  /api/customers/:id     (update)
 */

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { customerService } from '../services/customerService'
import { useToast }        from '../components/ui/Toast'
import FormInput           from '../components/ui/FormInput'
import FormSelect          from '../components/ui/FormSelect'
import FormTextarea        from '../components/ui/FormTextarea'
import { ButtonSpinner }   from '../components/ui/LoadingSpinner'

const NATIONALITIES = [
  'Afghan','Albanian','Algerian','American','Angolan','Argentinian','Australian',
  'Austrian','Bangladeshi','Belgian','Bolivian','Brazilian','British','Bulgarian',
  'Cambodian','Cameroonian','Canadian','Chilean','Chinese','Colombian','Congolese',
  'Croatian','Cuban','Czech','Danish','Dutch','Ecuadorian','Egyptian','Ethiopian',
  'Filipino','Finnish','French','Ghanaian','German','Greek','Guatemalan','Haitian',
  'Honduran','Hungarian','Indian','Indonesian','Iranian','Iraqi','Irish','Israeli',
  'Italian','Jamaican','Japanese','Jordanian','Kenyan','Korean','Lebanese','Libyan',
  'Malaysian','Mexican','Moroccan','Mozambican','Namibian','Nepalese','New Zealander',
  'Nigerian','Norwegian','Pakistani','Palestinian','Paraguayan','Peruvian','Polish',
  'Portuguese','Romanian','Russian','Rwandan','Saudi','Senegalese','Serbian',
  'Singaporean','Somali','South African','Spanish','Sri Lankan','Sudanese','Swedish',
  'Swiss','Syrian','Tanzanian','Thai','Tunisian','Turkish','Ugandan','Ukrainian',
  'Uruguayan','Venezuelan','Vietnamese','Yemeni','Zambian','Zimbabwean','Other',
]

const NATIONALITY_OPTIONS = NATIONALITIES.map(n => ({ value: n, label: n }))

const EMPTY_FORM = {
  name:            '',
  phone:           '',
  email:           '',
  passport_number: '',
  nationality:     '',
  notes:           '',
}

function validate(form) {
  const errs = {}
  if (!form.name.trim())          errs.name  = 'Full name is required.'
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
                                   errs.email = 'Enter a valid email address.'
  return errs
}

export default function CustomerForm() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const toast      = useToast()
  const isEdit     = Boolean(id)

  const [form,    setForm]    = useState(EMPTY_FORM)
  const [errors,  setErrors]  = useState({})
  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(isEdit)

  // Load existing customer in edit mode
  useEffect(() => {
    if (!isEdit) return
    customerService.get(id)
      .then(c => setForm({
        name:            c.name            ?? '',
        phone:           c.phone           ?? '',
        email:           c.email           ?? '',
        passport_number: c.passport_number ?? '',
        nationality:     c.nationality     ?? '',
        notes:           c.notes           ?? '',
      }))
      .catch(() => toast.error('Could not load customer.'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      if (isEdit) {
        await customerService.update(id, form)
        toast.success('Customer updated successfully.')
        navigate(`/customers/${id}`)
      } else {
        const customer = await customerService.create(form)
        toast.success('Customer added successfully.')
        navigate(`/customers/${customer.id}`)
      }
    } catch (err) {
      const msg = err?.response?.data?.error ?? 'Failed to save customer.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">

      {/* ── Breadcrumb ─────────────────────────────────────── */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-5">
        <Link to="/customers" className="hover:text-indigo-600 transition-colors">Customers</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">
          {isEdit ? 'Edit Customer' : 'New Customer'}
        </span>
      </nav>

      {/* ── Card ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100">
          <h1 className="text-base font-semibold text-slate-800">
            {isEdit ? 'Edit Customer' : 'Add New Customer'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isEdit ? 'Update the customer details below.' : 'Fill in the details to create a new customer record.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">

          {/* Row 1: Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Full Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. John Smith"
              required
              error={errors.name}
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

          {/* Row 2: Email + Passport */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Email Address"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="john@example.com"
              error={errors.email}
            />
            <FormInput
              label="Passport / ID Number"
              name="passport_number"
              value={form.passport_number}
              onChange={handleChange}
              placeholder="A12345678"
            />
          </div>

          {/* Row 3: Nationality */}
          <FormSelect
            label="Nationality"
            name="nationality"
            value={form.nationality}
            onChange={handleChange}
            options={NATIONALITY_OPTIONS}
            placeholder="Select nationality…"
            className="sm:w-1/2"
          />

          {/* Notes */}
          <FormTextarea
            label="Notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Any special requirements, preferences, or additional info…"
            rows={3}
          />

          {/* ── Actions ───────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
                         bg-indigo-600 hover:bg-indigo-700 text-white transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving && <ButtonSpinner />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
            </button>
            <Link
              to={isEdit ? `/customers/${id}` : '/customers'}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600
                         border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </Link>
          </div>

        </form>
      </div>
    </div>
  )
}
