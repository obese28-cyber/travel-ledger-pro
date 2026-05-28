/**
 * components/ui/StatCard.jsx
 *
 * A metric card used in the dashboard.
 *
 * Props:
 *   title   — label, e.g. "Total Sales"
 *   value   — the big number/text
 *   icon    — SVG path string (from ICONS map in Dashboard)
 *   color   — 'indigo' | 'emerald' | 'amber' | 'red' | 'purple' | 'slate'
 *   loading — shows skeleton if true
 */

import React from 'react'

const COLOR_MAP = {
  indigo: { bg: 'bg-indigo-50',  icon: 'bg-indigo-100 text-indigo-600',  value: 'text-indigo-700' },
  emerald:{ bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-700' },
  amber:  { bg: 'bg-amber-50',   icon: 'bg-amber-100 text-amber-600',     value: 'text-amber-700' },
  red:    { bg: 'bg-red-50',     icon: 'bg-red-100 text-red-600',         value: 'text-red-700' },
  purple: { bg: 'bg-purple-50',  icon: 'bg-purple-100 text-purple-600',   value: 'text-purple-700' },
  slate:  { bg: 'bg-slate-50',   icon: 'bg-slate-100 text-slate-600',     value: 'text-slate-700' },
}

export default function StatCard({ title, value, icon, color = 'indigo', loading = false }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.indigo

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3.5 w-24 bg-slate-200 rounded" />
            <div className="h-7 w-32 bg-slate-200 rounded" />
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-200" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500 font-medium truncate">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${c.value}`}>{value}</p>
        </div>
        {icon && (
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${c.icon}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
