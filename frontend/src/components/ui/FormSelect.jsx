/**
 * components/ui/FormSelect.jsx — Reusable <select> dropdown.
 *
 * Usage:
 *   <FormSelect
 *     label="Service Type"
 *     name="type"
 *     value={form.type}
 *     onChange={handleChange}
 *     options={[
 *       { value: 'flight', label: 'Flight' },
 *       { value: 'hotel',  label: 'Hotel' },
 *     ]}
 *     required
 *   />
 */

import React from 'react'

export default function FormSelect({
  label,
  name,
  value,
  onChange,
  options     = [],
  placeholder = 'Select…',
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
      <div className="relative">
        <select
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={`w-full px-3.5 py-2.5 text-sm rounded-lg border appearance-none pr-9 transition-colors
            ${error
              ? 'border-red-400 bg-red-50 focus:ring-red-400 focus:border-red-400'
              : 'border-slate-300 bg-white focus:ring-indigo-500 focus:border-indigo-500'
            }
            text-slate-900
            focus:outline-none focus:ring-2
            disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
        >
          {placeholder && (
            <option value="" disabled>{placeholder}</option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* chevron icon */}
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
