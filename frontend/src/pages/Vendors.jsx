/**
 * pages/Vendors.jsx — Supplier list with type filter, balance display, and service type.
 *
 * Connects to: GET /api/vendors/?type=&search=
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Link }           from 'react-router-dom'
import { vendorService }  from '../services/vendorService'
import Badge              from '../components/ui/Badge'
import { PageSpinner }    from '../components/ui/LoadingSpinner'
import EmptyState         from '../components/ui/EmptyState'

const VENDOR_TYPES = ['all', 'airline', 'hotel', 'tour', 'visa', 'insurance', 'other']

const SERVICE_LABELS = {
  flight:       '✈ Flight',
  hotel:        '🏨 Hotel',
  tour_package: '🗺 Tour',
  visa:         '📋 Visa',
  insurance:    '🛡 Insurance',
  other:        '📦 Other',
}

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(n ?? 0)

const BUILDING_ICON = 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'
const SEARCH_ICON  = 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'
const PLUS_ICON    = 'M12 4v16m8-8H4'

export default function Vendors() {
  const [vendors,    setVendors]    = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = useCallback(async (q, t) => {
    setLoading(true)
    try {
      const params = { search: q, per_page: 50 }
      if (t && t !== 'all') params.type = t
      const res = await vendorService.list(params)
      setVendors(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setVendors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(search, typeFilter) }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search, typeFilter), 350)
    return () => clearTimeout(t)
  }, [search, typeFilter])

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={SEARCH_ICON} />
            </svg>
            <input
              type="text"
              placeholder="Search suppliers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300 bg-white
                         text-slate-900 placeholder-slate-400
                         focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-56"
            />
          </div>

          {/* Type filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {VENDOR_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                  typeFilter === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Link
          to="/vendors/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={PLUS_ICON} />
          </svg>
          Add Supplier
        </Link>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${total} supplier${total !== 1 ? 's' : ''}`}
          </p>
          <p className="text-xs text-slate-400">
            Supplier type determines default service on bookings
          </p>
        </div>

        {loading ? (
          <PageSpinner />
        ) : vendors.length === 0 ? (
          <EmptyState
            icon={BUILDING_ICON}
            title="No suppliers found"
            message={search ? `No suppliers match "${search}".` : 'Add your first supplier to get started.'}
            action={
              <Link to="/vendors/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium
                           bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                Add Supplier
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Supplier', 'Type', 'Default Service', 'Contact', 'Balance Owed', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vendors.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">

                    {/* Supplier name */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24"
                               stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={BUILDING_ICON} />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{v.name}</p>
                          {v.email && <p className="text-xs text-slate-400 mt-0.5">{v.email}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-5 py-3.5">
                      <Badge label={v.type} />
                    </td>

                    {/* Default service type */}
                    <td className="px-5 py-3.5">
                      {v.default_service_type ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium
                                         text-indigo-700 bg-indigo-50 border border-indigo-100
                                         rounded-full px-2.5 py-1">
                          {SERVICE_LABELS[v.default_service_type] ?? v.default_service_type}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-5 py-3.5 text-slate-500 text-xs">
                      <div className="space-y-0.5">
                        {v.contact_name && <p className="font-medium text-slate-600">{v.contact_name}</p>}
                        {v.phone && <p>{v.phone}</p>}
                        {!v.contact_name && !v.phone && <span className="text-slate-300">—</span>}
                      </div>
                    </td>

                    {/* Balance owed */}
                    <td className="px-5 py-3.5">
                      <span className={`font-semibold text-sm ${
                        (v.outstanding_balance ?? 0) > 0 ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {fmt(v.outstanding_balance ?? 0)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link to={`/vendors/${v.id}/edit`}
                          className="text-xs text-slate-500 hover:text-slate-700 font-medium">
                          Edit
                        </Link>
                        <Link to={`/vendors/${v.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
