/**
 * services/expenseService.js — Expense management API calls.
 */

import client from '../api/client'

export const expenseService = {
  /** GET /api/expenses/summary?date_from=&date_to= */
  getSummary: async (params = {}) => {
    const res = await client.get('/expenses/summary', { params })
    return res.data.data
  },

  /** GET /api/expenses/categories */
  getCategories: async () => {
    const res = await client.get('/expenses/categories')
    return res.data.data
  },

  /** GET /api/expenses?date_from=&date_to=&category=&payment_method=&search=&page=&per_page= */
  list: async (params = {}) => {
    const res = await client.get('/expenses', { params })
    return res.data
  },

  /** POST /api/expenses */
  create: async (data) => {
    const res = await client.post('/expenses', data)
    return res.data.data
  },

  /** GET /api/expenses/<id> */
  get: async (id) => {
    const res = await client.get(`/expenses/${id}`)
    return res.data.data
  },

  /** GET /api/expenses/category/<key>?date_from=&date_to= */
  getCategoryLedger: async (key, params = {}) => {
    const res = await client.get(`/expenses/category/${key}`, { params })
    return res.data.data
  },
}
