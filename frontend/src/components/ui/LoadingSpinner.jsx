import React from 'react'

/** Full-page centered spinner for initial page loads */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )
}

/** Small inline spinner for buttons */
export function ButtonSpinner() {
  return <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
}

export default PageSpinner
