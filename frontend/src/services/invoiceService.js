import client from '../api/client'

export const invoiceService = {
  list:              async (params = {}) => { const r = await client.get('/invoices/', { params });                        return r.data },
  get:               async (id)          => { const r = await client.get(`/invoices/${id}`);                               return r.data.data },
  createFromBooking: async (bookingId, data) => { const r = await client.post(`/invoices/from-booking/${bookingId}`, data); return r.data.data },
  issue:             async (id)          => { const r = await client.patch(`/invoices/${id}/issue`);                       return r.data.data },
  cancel:            async (id)          => { const r = await client.patch(`/invoices/${id}/cancel`);                      return r.data.data },

  // Returns a Blob for the PDF so the caller can trigger a browser download
  downloadPdf: async (id) => {
    const r = await client.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
    return r.data
  },
}
