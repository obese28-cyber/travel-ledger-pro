import axios from 'axios'

/**
 * Axios instance for all API calls
 */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Attach JWT token automatically to every request
 */
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tlp_token')

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * Optional: global response error handling
 */
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // If token expired or invalid, clear storage
    if (error.response?.status === 401) {
      console.warn('🔒 Unauthorized - clearing token')

      localStorage.removeItem('tlp_token')
      localStorage.removeItem('tlp_user')
    }

    return Promise.reject(error)
  }
)

export default client