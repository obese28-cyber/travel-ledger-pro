import client from '../api/client'

export const bookingService = {
  list:         async (params = {}) => { const r = await client.get('/bookings/', { params });       return r.data },
  get:          async (id)          => { const r = await client.get(`/bookings/${id}`);              return r.data.data },
  create:       async (data)        => { const r = await client.post('/bookings/', data);            return r.data.data },
  updateStatus: async (id, status)  => { const r = await client.patch(`/bookings/${id}/status`, { status }); return r.data.data },
}
