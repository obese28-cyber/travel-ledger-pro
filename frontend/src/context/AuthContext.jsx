/**
 * context/AuthContext.jsx
 *
 * Provides authentication state to the entire app.
 *
 * Usage in any component:
 *   import { useAuth } from '../context/AuthContext'
 *   const { user, login, logout, isAuthenticated } = useAuth()
 */

import React, { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'

// Create the context
const AuthContext = createContext(null)

/** Wrap your app with this provider to share auth state everywhere */
export function AuthProvider({ children }) {
  // Restore state from localStorage so user stays logged in after page refresh
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('tlp_user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('tlp_token') || null)
  const [loading, setLoading] = useState(false)

  const isAuthenticated = !!token && !!user

  /**
   * Log in with email + password.
   * On success: saves token + user to localStorage and state.
   * On failure: throws the error so the Login page can show it.
   */
  async function login(email, password) {
    setLoading(true)
    try {
      const data = await authService.login(email, password)
      localStorage.setItem('tlp_token', data.token)
      localStorage.setItem('tlp_user',  JSON.stringify(data.user))
      setToken(data.token)
      setUser(data.user)
      return data.user
    } finally {
      setLoading(false)
    }
  }

  /** Log out: clears state and localStorage */
  async function logout() {
    await authService.logout()
    setToken(null)
    setUser(null)
  }

  const value = { user, token, isAuthenticated, loading, login, logout }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Hook — call this inside any component to access auth state */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
