import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const Icon = ({ path, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
)

const ICONS = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  customers: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  vendors:   'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  bookings:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  invoices:  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  payments:  'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  supplier:  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  cashbook:  'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  expenses:  'M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z',
  reports:   'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  airlines:  'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
}

const NAV_ITEMS = [
  { label: 'Dashboard',           to: '/',             icon: 'dashboard', end: true },
  { label: 'Customers',           to: '/customers',    icon: 'customers' },
  { label: 'Bookings',            to: '/bookings/new', icon: 'bookings',  bookingsNav: true },
  { label: 'Suppliers',           to: '/vendors',      icon: 'vendors' },
  { label: 'Invoices',            to: '/invoices',     icon: 'invoices' },
  { label: 'Payments',            to: '/payments',     icon: 'payments' },
  { label: 'Supplier Invoices',   to: '/bills',        icon: 'supplier' },
  { label: 'Cash Book',           to: '/cash-book',    icon: 'cashbook' },
  { label: 'Expenses',            to: '/expenses',     icon: 'expenses' },
  { label: 'Reports',             to: '/reports',      icon: 'reports' },
  { label: 'Airlines',            to: '/airlines',     icon: 'airlines' },
]

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation()

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={[
          'fixed top-0 left-0 z-30 h-full w-64 flex flex-col',
          'bg-slate-900 text-white overflow-y-auto',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'transition-transform duration-200 ease-in-out',
        ].join(' ')}
        aria-label="Sidebar navigation"
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700/60">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-600 shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Travel Ledger</p>
            <p className="text-xs text-slate-400 leading-tight">Pro</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ label, to, icon, end, bookingsNav }) => {
            const isActive = bookingsNav
              ? location.pathname.startsWith('/bookings')
              : (end ? location.pathname === to : location.pathname.startsWith(to))
            return (
              <NavLink
                key={label}
                to={to}
                end={end}
                onClick={onClose}
                className={() => [
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                ].join(' ')}
              >
                <Icon path={ICONS[icon]} className="w-5 h-5 shrink-0" />
                {label}
              </NavLink>
            )
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-700/60">
          <p className="text-xs text-slate-500">Travel Ledger Pro</p>
          <p className="text-xs text-slate-600">v1.0</p>
        </div>
      </aside>
    </>
  )
}
