/**
 * services/authService.js — Authentication API calls.
 */

import client from '../api/client'

export const authService = {
  /** POST /api/auth/login — returns { token, user } */
  login: async (email, password) => {
    const res = await client.post('/auth/login', { email, password })
    return res.data.data // { token, user }
  },

  /** POST /api/auth/logout */
  logout: async () => {
    await client.post('/auth/logout').catch(() => {})
    // Always clear local storage, even if the request fails
    localStorage.removeItem('tlp_token')
    localStorage.removeItem('tlp_user')
  },

  /** GET /api/auth/me */
  getCurrentUser: async () => {
    const res = await client.get('/auth/me')
    return res.data.data
  },
}
