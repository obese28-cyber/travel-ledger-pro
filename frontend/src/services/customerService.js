import client from '../api/client'

export const customerService = {
  list:             async (params = {}) => { const r = await client.get('/customers/', { params });              return r.data },
  get:              async (id)          => { const r = await client.get(`/customers/${id}`);                     return r.data.data },
  create:           async (data)        => { const r = await client.post('/customers/', data);                   return r.data.data },
  update:           async (id, data)    => { const r = await client.put(`/customers/${id}`, data);               return r.data.data },
  getBookings:      async (id)          => { const r = await client.get(`/customers/${id}/bookings`);            return r.data.data },
  getStatement:     async (id)          => { const r = await client.get(`/customers/${id}/statement`);           return r.data.data },
  getCreditBalance: async (id)          => { const r = await client.get(`/customers/${id}/credit-balance`);      return r.data.data },
  recordAdvance:    async (id, data)    => { const r = await client.post(`/customers/${id}/credit`, data);       return r.data.data },
  applyCredit:      async (id, data)    => { const r = await client.post(`/customers/${id}/apply-credit`, data); return r.data.data },
}
