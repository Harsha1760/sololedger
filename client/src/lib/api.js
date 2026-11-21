const BASE = '/api';

// JSON request helper. Throws Error (with .status) carrying the server's `error` message.
export async function api(path, options = {}) {
  const { body, headers, ...rest } = options;
  const init = { ...rest, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getDashboard = () => api('/dashboard');
export const getInvoices = () => api('/invoices');
export const createInvoice = (payload) => api('/invoices', { method: 'POST', body: payload });
export const setInvoiceStatus = (id, status) =>
  api(`/invoices/${id}/status`, { method: 'PATCH', body: { status } });
export const chaseInvoice = (id) => api(`/invoices/${id}/chase`, { method: 'POST' });
export const getBills = () => api('/bills');
export const createBill = (payload) => api('/bills', { method: 'POST', body: payload });
export const payBill = (id) => api(`/bills/${id}/pay`, { method: 'PATCH' });
export const updateSettings = (payload) => api('/settings', { method: 'PATCH', body: payload });

// Forwards every param except undefined/null/false/'' (so realistic: true -> ?realistic=true).
export function getForecast(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== false && value !== '') qs.set(key, String(value));
  }
  const query = qs.toString();
  return api(`/forecast${query ? `?${query}` : ''}`);
}

export const getClients = () => api('/clients');
export const getCustomers = () => api('/customers');
export const createClient = (payload) => api('/clients', { method: 'POST', body: payload });
export const resetDemo = () => api('/reset', { method: 'POST' });
