import { API_URL } from './config.js';

const KEY = 'semvault:catalog';
const TTL = 5 * 60 * 1000;

export const previewMode = !API_URL;

export async function getCatalog({ fresh = false } = {}) {
  if (!fresh) {
    const cached = sessionStorage.getItem(KEY);
    if (cached) {
      const { at, data } = JSON.parse(cached);
      if (Date.now() - at < TTL) return data;
    }
  }
  const url = API_URL ? `${API_URL}?action=catalog` : new URL('../dev/sample-catalog.json', import.meta.url);
  const res = await fetch(url);
  const data = await res.json();
  if (data.ok === false) throw new Error(data.error);
  sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data }));
  return data;
}

export function clearCatalogCache() {
  sessionStorage.removeItem(KEY);
}

export async function post(action, body = {}) {
  if (!API_URL) throw new Error('Preview mode: not connected to the server yet');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight Apps Script can't answer
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.code = data.code;
    throw err;
  }
  return data;
}
