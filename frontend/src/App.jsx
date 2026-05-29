import logo from "./assets/logo.jpg";
/**
 * App.jsx -- Root component. Sets up routing, auth context, and toast provider.
 */

import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider }         from './components/ui/Toast'
import AppLayout                 from './components/layout/AppLayout'

// Pages
import Login          from './pages/Login'
import Dashboard      from './pages/Dashboard'
import Customers      from './pages/Customers'
import CustomerForm   from './pages/CustomerForm'
import CustomerDetail from './pages/CustomerDetail'
import NewBooking     from './pages/NewBooking'
import BookingDetail  from './pages/BookingDetail'
import Vendors        from './pages/Vendors'
import VendorForm     from './pages/VendorForm'
import VendorDetail   from './pages/VendorDetail'
import Invoices       from './pages/Invoices'
import InvoiceDetail  from './pages/InvoiceDetail'
import Payments       from './pages/Payments'
import VendorBills    from './pages/VendorBills'
import Reports        from './pages/Reports'
import CashBook       from './pages/CashBook'
import Expenses       from './pages/Expenses'
import Settings       from './pages/Settings'
import Airlines       from './pages/Airlines'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

            {/* Protected (inside main layout) */}
            <Route
              path="/"
              element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
            >
              <Route index element={<Dashboard />} />

              {/* Customers */}
              <Route path="customers"          element={<Customers />} />
              <Route path="customers/new"      element={<CustomerForm />} />
              <Route path="customers/:id"      element={<CustomerDetail />} />
              <Route path="customers/:id/edit" element={<CustomerForm />} />

              {/* Bookings */}
              <Route path="bookings/new" element={<NewBooking />} />
              <Route path="bookings/:id" element={<BookingDetail />} />

              {/* Vendors */}
              <Route path="vendors"          element={<Vendors />} />
              <Route path="vendors/new"      element={<VendorForm />} />
              <Route path="vendors/:id"      element={<VendorDetail />} />
              <Route path="vendors/:id/edit" element={<VendorForm />} />

              {/* Invoices */}
              <Route path="invoices"     element={<Invoices />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />

              {/* Payments */}
              <Route path="payments" element={<Payments />} />

              {/* Vendor Bills */}
              <Route path="bills" element={<VendorBills />} />

              {/* Cash Book */}
              <Route path="cash-book" element={<CashBook />} />

              {/* Expenses */}
              <Route path="expenses" element={<Expenses />} />

              {/* Reports */}
              <Route path="reports" element={<Reports />} />

              {/* Airlines */}
              <Route path="airlines" element={<Airlines />} />

              {/* Settings (admin) */}
              <Route path="settings" element={<Settings />} />

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
