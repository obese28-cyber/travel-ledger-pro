import client from '../api/client'

export const paymentService = {
  list:    async (params = {}) => { const r = await client.get('/payments/', { params });  return r.data },
  create:  async (data)        => { const r = await client.post('/payments/', data);       return r.data.data },
  bulkPay: async (data)        => { const r = await client.post('/payments/bulk', data);   return r.data.data },
  get:     async (id)          => { const r = await client.get(`/payments/${id}`);         return r.data.data },
}
