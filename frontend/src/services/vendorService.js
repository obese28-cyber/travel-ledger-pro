import client from '../api/client'

export const vendorService = {
  list:       async (params = {}) => { const r = await client.get('/vendors/', { params }); return r.data },
  get:        async (id)          => { const r = await client.get(`/vendors/${id}`);         return r.data.data },
  create:     async (data)        => { const r = await client.post('/vendors/', data);        return r.data.data },
  update:     async (id, data)    => { const r = await client.put(`/vendors/${id}`, data);   return r.data.data },
  getBalance: async (id)          => { const r = await client.get(`/vendors/${id}/balance`); return r.data.data },
}
