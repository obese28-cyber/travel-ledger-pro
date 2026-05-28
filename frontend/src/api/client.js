import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

// Attach JWT token to every request
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tlp_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Handle responses globally
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only force-logout on 401 if the user was already logged in (has a token).
    // Do NOT redirect when the 401 comes from a login attempt — let the
    // Login page handle that error and show the message to the user.
    const token = localStorage.getItem('tlp_token')
    const isLoginRequest = error.config?.url?.includes('/auth/login')

    const status = error.response?.status
    const errMsg = error.response?.data?.error ?? ''

    // 401 = expired/missing token
    // 422 = malformed token (e.g. integer subject from old token format)
    const isInvalidToken =
      (status === 401 && token && !isLoginRequest) ||
      (status === 422 && errMsg.includes('Subject must be a string') && token)

    if (isInvalidToken) {
      localStorage.removeItem('tlp_token')
      localStorage.removeItem('tlp_user')
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

export default client
