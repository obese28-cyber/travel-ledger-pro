import client from '../api/client'

export const vendorBillService = {
  /** List bills, optionally filtered by vendor_id */
  list:   async (params = {}) => { const r = await client.get('/vendor-bills/', { params }); return r.data },

  /** Get a single bill */
  get:    async (id)           => { const r = await client.get(`/vendor-bills/${id}`);        return r.data.data },

  /** Create a new vendor bill */
  create: async (data)         => { const r = await client.post('/vendor-bills/', data);       return r.data.data },

  /** Record a payment against a vendor bill */
  pay:    async (id, data)     => { const r = await client.post(`/vendor-bills/${id}/payments`, data); return r.data.data },

  /** Bulk pay — one cheque covering multiple bills */
  bulkPay: async (data)        => { const r = await client.post('/vendor-bills/bulk-pay', data);       return r.data.data },
}
