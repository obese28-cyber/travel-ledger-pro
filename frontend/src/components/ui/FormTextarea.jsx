/**
 * components/ui/FormTextarea.jsx — Reusable <textarea> field.
 */

import React from 'react'

export default function FormTextarea({
  label,
  name,
  value,
  onChange,
  placeholder = '',
  rows        = 3,
  required    = false,
  disabled    = false,
  error       = '',
  hint        = '',
  className   = '',
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        disabled={disabled}
        className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors resize-none
          ${error
            ? 'border-red-400 bg-red-50 focus:ring-red-400 focus:border-red-400'
            : 'border-slate-300 bg-white focus:ring-indigo-500 focus:border-indigo-500'
          }
          text-slate-900 placeholder-slate-400
          focus:outline-none focus:ring-2
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
