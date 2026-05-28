/**
 * services/reportService.js — Report & dashboard API calls.
 */

import client from '../api/client'

export const reportService = {
  /** GET /api/reports/dashboard?date_from=&date_to= */
  getDashboard: async (params = {}) => {
    const res = await client.get('/reports/dashboard', { params })
    return res.data.data
  },

  /** GET /api/reports/profit-loss */
  getProfitLoss: async (params = {}) => {
    const res = await client.get('/reports/profit-loss', { params })
    return res.data.data
  },

  /** GET /api/reports/daily-sales */
  getDailySales: async (params = {}) => {
    const res = await client.get('/reports/daily-sales', { params })
    return res.data.data
  },

  /** GET /api/reports/customer-balances */
  getCustomerBalances: async () => {
    const res = await client.get('/reports/customer-balances')
    return res.data.data
  },

  /** GET /api/reports/vendor-balances */
  getVendorBalances: async () => {
    const res = await client.get('/reports/vendor-balances')
    return res.data.data
  },

  /** GET /api/reports/trial-balance?month=&year= */
  getTrialBalance: async (month, year) => {
    const res = await client.get('/reports/trial-balance', { params: { month, year } })
    return res.data.data
  },

  /** POST /api/reports/trial-balance/expenses */
  saveTrialBalanceExpenses: async (year, month, entries) => {
    const res = await client.post('/reports/trial-balance/expenses', { year, month, entries })
    return res.data.data
  },

  /** GET /api/reports/sparklines — 6-month trend arrays for dashboard KPI cards */
  getSparklines: async () => {
    const res = await client.get('/reports/sparklines')
    return res.data.data
  },
}
