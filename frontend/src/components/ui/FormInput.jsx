/**
 * components/ui/FormInput.jsx — Reusable text/email/tel/date input field.
 *
 * Usage:
 *   <FormInput
 *     label="Full Name"
 *     name="name"
 *     value={form.name}
 *     onChange={handleChange}
 *     required
 *     error={errors.name}
 *   />
 */

import React from 'react'

export default function FormInput({
  label,
  name,
  value,
  onChange,
  type        = 'text',
  placeholder = '',
  required    = false,
  disabled    = false,
  error       = '',
  hint        = '',
  className   = '',
  ...rest
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`w-full px-3.5 py-2.5 text-sm rounded-lg border transition-colors
          ${error
            ? 'border-red-400 bg-red-50 focus:ring-red-400 focus:border-red-400'
            : 'border-slate-300 bg-white focus:ring-indigo-500 focus:border-indigo-500'
          }
          text-slate-900 placeholder-slate-400
          focus:outline-none focus:ring-2
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
