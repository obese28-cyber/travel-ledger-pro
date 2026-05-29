import client from '../api/client'

const authService = {
  login: async (email, password) => {
    const res = await client.post('/auth/login', { email, password })
    const data = res.data?.data || res.data
    const token = data?.token || data?.access_token
    const user  = data?.user || null

    if (!token) throw new Error('Login failed: no token returned')

    localStorage.setItem('tlp_token', token)
    localStorage.setItem('tlp_user', JSON.stringify(user))

    return { token, user }
  },

  logout: () => {
    localStorage.removeItem('tlp_token')
    localStorage.removeItem('tlp_user')
  },

  getToken: () => localStorage.getItem('tlp_token'),

  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('tlp_user'))
    } catch {
      return null
    }
  },
}

export default authService
