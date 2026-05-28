/**
 * pages/Settings.jsx
 *
 * Admin-only settings page.
 * Sections:
 *   1. Agency Profile  — name, address, phones, emails, bank accounts,
 *                        signatories, services footer
 *
 * Changes are saved to backend/agency_profile.py via PUT /api/admin/agency-profile
 * and take effect on the next PDF generated (no server restart needed).
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import client from '../api/client'

// ── tiny helpers ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, className = '' }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`}
    />
  )
}

function TagList({ values, onChange, placeholder }) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  function remove(i) {
    onChange(values.filter((_, idx) => idx !== i))
  }

  function update(i, val) {
    const copy = [...values]
    copy[i] = val
    onChange(copy)
  }

  return (
    <div className="space-y-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={v}
            onChange={e => update(i, e.target.value)}
            className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button onClick={() => remove(i)}
            className="text-red-400 hover:text-red-600 px-2 text-lg leading-none">×</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 border border-dashed border-slate-300 rounded-lg px-3 py-1.5
                     text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button onClick={add}
          className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
          + Add
        </button>
      </div>
    </div>
  )
}

// ── Bank accounts sub-form ────────────────────────────────────────────────────

function BankAccounts({ accounts, onChange }) {
  function update(i, field, val) {
    const copy = accounts.map((a, idx) => idx === i ? { ...a, [field]: val } : a)
    onChange(copy)
  }
  function add() {
    onChange([...accounts, { bank: '', account: '', label: '' }])
  }
  function remove(i) {
    onChange(accounts.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-3">
      {accounts.map((bk, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <p className="text-xs text-slate-500 mb-1">Bank Name</p>
            <input value={bk.bank} onChange={e => update(i, 'bank', e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Account Number</p>
            <input value={bk.account} onChange={e => update(i, 'account', e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Label (e.g. GHS Account)</p>
            <div className="flex gap-1">
              <input value={bk.label} onChange={e => update(i, 'label', e.target.value)}
                className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => remove(i)}
                className="text-red-400 hover:text-red-600 px-2 text-lg leading-none">×</button>
            </div>
          </div>
        </div>
      ))}
      <button onClick={add}
        className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
        <span className="text-lg leading-none">+</span> Add Bank Account
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EMPTY = {
  name: '', address_lines: [], phones: [], emails: [],
  logo_path: null, bank_accounts: [],
  signatory_left:  { name: '', title: '' },
  signatory_right: { name: '', title: '' },
  services: [],
}

export default function Settings() {
  const { user }   = useAuth()
  const toast = useToast()
  const isAdmin    = user?.role === 'admin'

  const [profile,  setProfile]  = useState(EMPTY)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [dirty,    setDirty]    = useState(false)

  // helper — patch a top-level key and mark dirty
  const patch = useCallback((key, val) => {
    setProfile(p => ({ ...p, [key]: val }))
    setDirty(true)
  }, [])

  useEffect(() => {
    client.get('/admin/agency-profile')
      .then(r => {
        const p = r.data?.data?.profile || {}
        setProfile({ ...EMPTY, ...p })
      })
      .catch(() => toast.error('Could not load agency profile.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!isAdmin) return
    setSaving(true)
    try {
      await client.put('/admin/agency-profile', { profile })
      toast.success('Agency profile saved!')
      setDirty(false)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-400">Loading…</div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Agency profile — appears on every printed invoice
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white
                       hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          You are viewing the agency profile in read-only mode. Contact an admin to make changes.
        </div>
      )}

      {/* ── Section 1: Basic info ───────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-slate-700 text-base border-b border-slate-100 pb-3">
          Agency Identity
        </h3>

        <Field label="Agency Name" hint="Appears at the top of every invoice in bold.">
          <Input value={profile.name} onChange={v => patch('name', v)}
            placeholder="e.g. AXUM TRAVEL AND TOURS" />
        </Field>

        <Field label="Address Lines" hint="Each line appears separately. Drag to reorder.">
          <TagList values={profile.address_lines}
            onChange={v => patch('address_lines', v)}
            placeholder="Add address line…" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Phone Numbers">
            <TagList values={profile.phones}
              onChange={v => patch('phones', v)}
              placeholder="Add phone number…" />
          </Field>
          <Field label="Emails / Website">
            <TagList values={profile.emails}
              onChange={v => patch('emails', v)}
              placeholder="Add email or website…" />
          </Field>
        </div>
      </section>

      {/* ── Section 2: Bank accounts ────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-slate-700 text-base border-b border-slate-100 pb-3">
          Bank Accounts
          <span className="text-xs font-normal text-slate-400 ml-2">Shown in the signature section of invoices</span>
        </h3>
        <BankAccounts accounts={profile.bank_accounts}
          onChange={v => patch('bank_accounts', v)} />
      </section>

      {/* ── Section 3: Signatories ──────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-slate-700 text-base border-b border-slate-100 pb-3">
          Signatories
          <span className="text-xs font-normal text-slate-400 ml-2">Appear under "Checked By" and "Approved By"</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[
            ['signatory_left',  'Checked By (Left)'],
            ['signatory_right', 'Approved By (Right)'],
          ].map(([key, label]) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium text-slate-600">{label}</p>
              <input
                value={profile[key]?.name || ''}
                onChange={e => patch(key, { ...profile[key], name: e.target.value })}
                placeholder="NAME : John Smith"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <input
                value={profile[key]?.title || ''}
                onChange={e => patch(key, { ...profile[key], title: e.target.value })}
                placeholder="Title, e.g. Operations / Ticketing"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 4: Services footer ──────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-slate-700 text-base border-b border-slate-100 pb-3">
          Services Footer
          <span className="text-xs font-normal text-slate-400 ml-2">Grey bar at the bottom of every invoice (up to 9 items)</span>
        </h3>
        <TagList values={profile.services}
          onChange={v => patch('services', v)}
          placeholder="Add service…" />
      </section>

      {/* ── Section 5: Logo ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-slate-700 text-base border-b border-slate-100 pb-3">
          Agency Logo
          <span className="text-xs font-normal text-slate-400 ml-2">Appears at the top of every invoice</span>
        </h3>

        {/* Current logo preview */}
        <div className="flex items-start gap-6">
          <div className="w-40 h-20 border-2 border-dashed border-slate-200 rounded-lg
                          flex items-center justify-center bg-slate-50 shrink-0 overflow-hidden">
            {profile.logo_path ? (
              <img
                src={`/api/admin/logo-preview?t=${Date.now()}`}
                alt="Agency logo"
                className="max-w-full max-h-full object-contain"
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="text-center text-slate-400">
                <svg className="w-8 h-8 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 3h18M3 3v18" />
                </svg>
                <p className="text-xs">No logo</p>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-sm text-slate-500">
              Upload a PNG or JPG logo (~300 × 150 px recommended).
              Leave empty to show a placeholder box on invoices.
            </p>

            {/* Upload button */}
            {isAdmin && (
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300
                                bg-white text-sm text-slate-700 cursor-pointer
                                hover:bg-slate-50 hover:border-indigo-400 transition-colors">
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Choose Logo File…
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="sr-only"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const fd = new FormData()
                    fd.append('logo', file)
                    try {
                      const r = await client.post('/admin/upload-logo', fd, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                      })
                      patch('logo_path', r.data?.data?.logo_path || null)
                      toast.success('Logo uploaded — click Save Changes to apply.')
                    } catch {
                      toast.error('Upload failed. Please try again.')
                    }
                  }}
                />
              </label>
            )}

            {/* Remove logo */}
            {profile.logo_path && isAdmin && (
              <button
                onClick={() => { patch('logo_path', null); toast.info('Logo removed — click Save Changes to apply.') }}
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Remove logo
              </button>
            )}

            {profile.logo_path && (
              <p className="text-xs text-slate-400 break-all">{profile.logo_path}</p>
            )}
          </div>
        </div>
      </section>

      {/* Sticky save bar */}
      {isAdmin && dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                       bg-indigo-600 text-white shadow-lg hover:bg-indigo-700
                       disabled:opacity-50 transition-all"
          >
            {saving
              ? <><span className="animate-spin">⟳</span> Saving…</>
              : <>💾 Save Changes</>}
          </button>
        </div>
      )}
    </div>
  )
}
