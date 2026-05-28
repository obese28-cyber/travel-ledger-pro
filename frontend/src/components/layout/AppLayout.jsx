import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header  from './Header'

function getTitle(pathname) {
  if (pathname === '/')                            return 'Dashboard'
  if (pathname === '/customers')                   return 'Customers'
  if (pathname === '/customers/new')               return 'Add Customer'
  if (/^\/customers\/\d+\/edit$/.test(pathname))  return 'Edit Customer'
  if (/^\/customers\/\d+$/.test(pathname))        return 'Customer Details'
  if (pathname === '/bookings/new')                return 'New Booking'
  if (/^\/bookings\/\d+$/.test(pathname))         return 'Booking Details'
  if (pathname === '/vendors')                     return 'Suppliers'
  if (pathname === '/vendors/new')                 return 'Add Supplier'
  if (/^\/vendors\/\d+\/edit$/.test(pathname))    return 'Edit Supplier'
  if (/^\/vendors\/\d+$/.test(pathname))          return 'Supplier Details'
  if (pathname === '/invoices')                    return 'Invoices'
  if (/^\/invoices\/\d+$/.test(pathname))         return 'Invoice Details'
  if (pathname === '/payments')                    return 'Payments'
  if (pathname === '/bills')                       return 'Supplier Invoices'
  if (pathname === '/cash-book')                   return 'Cash Book'
  if (pathname === '/expenses')                    return 'Expenses'
  if (pathname === '/reports')                     return 'Reports'
  return 'Travel Ledger Pro'
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = getTitle(location.pathname)

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
