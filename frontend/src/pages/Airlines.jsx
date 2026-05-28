/**
 * pages/Airlines.jsx
 * Manage airline master list — add, edit name, activate/deactivate.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useToast } from '../components/ui/Toast'
import client from '../api/client'

export default function Airlines() {
  const toast = useToast()
  const [airlines, setAirlines]   = useState([])
  const [loading,  setLoading]    = useState(true)
  const [saving,   setSaving]     = useState(false)

  // inline edit / add state
  const [editId,   setEditId]     = useState(null)   // null = adding new
  const [editName, setEditName]   = useState('')
  const [showForm, setShowForm]   = useState(false)

  const [search,   setSearch]     = useState('')

  const load = useCallback(() => {
    setLoading(true)
    client.get('/airlines/all')
      .then(r => setAirlines(r.data?.data?.airlines || []))
      .catch(() => toast.error('Could not load airlines.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditId(null)
    setEditName('')
    setShowForm(true)
  }

  function openEdit(airline) {
    setEditId(airline.id)
    setEditName(airline.name)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditId(null)
    setEditName('')
  }

  async function handleSave() {
    const name = editName.trim()
    if (!name) { toast.error('Airline name is required.'); return }
    setSaving(true)
    try {
      if (editId) {
        await client.put(`/airlines/${editId}`, { name })
        toast.success('Airline updated.')
      } else {
        await client.post('/airlines', { name })
        toast.success(`Airline "${name}" added.`)
      }
      cancelForm()
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(airline) {
    try {
      await client.put(`/airlines/${airline.id}`, { is_active: !airline.is_active })
      toast.success(airline.is_active ? `"${airline.name}" deactivated.` : `"${airline.name}" activated.`)
      load()
    } catch {
      toast.error('Could not update airline.')
    }
  }

  const filtered = airlines.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )
  const active   = filtered.filter(a =>  a.is_active)
  const inactive = filtered.filter(a => !a.is_active)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Airlines</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage airlines used in bookings
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white
                     text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Airline
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-indigo-800 mb-3">
            {editId ? 'Edit Airline' : 'New Airline'}
          </p>
          <div className="flex gap-3">
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelForm() }}
              placeholder="e.g. Ethiopian Airlines"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editId ? 'Update' : 'Add'}
            </button>
            <button
              onClick={cancelForm}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm
                         hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search airlines…"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {/* Active list */}
      {loading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {active.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">
              {search ? 'No airlines match your search.' : 'No airlines yet. Click "Add Airline" to get started.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Airline Name</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.map((a, i) => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(a)}
                          className="text-xs px-3 py-1 rounded-md border border-slate-200
                                     text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(a)}
                          className="text-xs px-3 py-1 rounded-md border border-red-200
                                     text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Inactive section */}
      {inactive.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-600 select-none">
            ▸ {inactive.length} deactivated airline{inactive.length > 1 ? 's' : ''} (click to show)
          </summary>
          <div className="mt-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {inactive.map(a => (
                  <tr key={a.id} className="opacity-60 hover:opacity-100 transition-opacity">
                    <td className="px-4 py-3 text-slate-400 line-through">{a.name}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(a)}
                        className="text-xs px-3 py-1 rounded-md border border-emerald-200
                                   text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
