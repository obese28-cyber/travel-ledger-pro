/**
 * pages/Customers.jsx — Customer list with search.
 *
 * Connects to: GET /api/customers/?search=&page=&per_page=
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { customerService } from '../services/customerService'
import { PageSpinner }     from '../components/ui/LoadingSpinner'
import EmptyState          from '../components/ui/EmptyState'

const ICONS = {
  user:   'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  plus:   'M12 4v16m8-8H4',
  phone:  'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  mail:   'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
}

const fmt = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n ?? 0)

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)

  const PER_PAGE = 20

  const load = useCallback(async (q, p) => {
    setLoading(true)
    try {
      const res = await customerService.list({ search: q, page: p, per_page: PER_PAGE })
      setCustomers(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => { load(search, page) }, [])

  // Re-search on query change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      load(search, 1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  function handlePageChange(newPage) {
    setPage(newPage)
    load(search, newPage)
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">

        {/* Search */}
        <div className="relative max-w-xs w-full">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.search} />
          </svg>
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-300
                       bg-white text-slate-900 placeholder-slate-400
                       focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <Link
          to="/customers/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.plus} />
          </svg>
          Add Customer
        </Link>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Results count */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${total} customer${total !== 1 ? 's' : ''}${search ? ' found' : ''}`}
          </p>
        </div>

        {loading ? (
          <PageSpinner />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={ICONS.user}
            title="No customers yet"
            message={search ? `No customers match "${search}". Try a different search.` : 'Add your first customer to get started.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Customer', 'Passport / ID', 'Nationality', 'Contact', 'Created'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
                      AR Balance
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {customers.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name + email */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-indigo-700">
                              {c.name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{c.name}</p>
                            {c.email && (
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.mail} />
                                </svg>
                                {c.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">
                        {c.passport_number || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {c.nationality || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {c.phone ? (
                          <span className="flex items-center gap-1 text-xs">
                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.phone} />
                            </svg>
                            {c.phone}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                      </td>

                      {/* AR Balance — shows credit (green) or outstanding (red) */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {c.has_credit ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                             text-xs font-semibold bg-violet-100 text-violet-700 border border-violet-200">
                              💳 CR
                            </span>
                            <span className="text-xs font-bold text-violet-700">
                              {fmt(c.credit_balance)}
                            </span>
                          </span>
                        ) : c.outstanding_balance > 0 ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                             text-xs font-semibold bg-red-50 text-red-600 border border-red-100">
                              Owes
                            </span>
                            <span className="text-xs font-bold text-red-600">
                              {fmt(c.outstanding_balance)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-400 px-2 py-0.5">
                            Clear
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link to={`/customers/${c.id}`}
                          className="text-xs text-indigo-600 hover:underline font-medium">
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages} — {total} customers
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200
                             text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  Previous
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200
                             text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}
