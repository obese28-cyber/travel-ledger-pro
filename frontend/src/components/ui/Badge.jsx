/**
 * components/ui/Badge.jsx
 *
 * Colored pill badge for statuses, types, etc.
 *
 * Props:
 *   label   — text to display
 *   variant — 'success' | 'warning' | 'danger' | 'info' | 'default' | 'purple'
 */

import React from 'react'

const VARIANTS = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50  text-amber-700  ring-amber-200',
  danger:  'bg-red-50    text-red-700    ring-red-200',
  info:    'bg-blue-50   text-blue-700   ring-blue-200',
  purple:  'bg-purple-50 text-purple-700 ring-purple-200',
  default: 'bg-slate-100 text-slate-600  ring-slate-200',
}

// Auto-map common status strings to variants
const STATUS_MAP = {
  paid:            'success',
  completed:       'success',
  active:          'success',
  confirmed:       'info',
  issued:          'info',
  partially_paid:  'warning',
  pending:         'warning',
  unpaid:          'warning',
  overdue:         'danger',
  cancelled:       'default',
  draft:           'default',
  airline:         'info',
  hotel:           'purple',
  tour:            'success',
  visa:            'warning',
  insurance:       'default',
  other:           'default',
}

export default function Badge({ label, variant }) {
  const v = variant ?? STATUS_MAP[label?.toLowerCase()] ?? 'default'
  const cls = VARIANTS[v] ?? VARIANTS.default
  const display = label?.replace(/_/g, ' ')

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset capitalize ${cls}`}>
      {display}
    </span>
  )
}
