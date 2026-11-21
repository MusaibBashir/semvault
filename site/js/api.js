import { API_URL } from './config.js';

const KEY = 'semvault:catalog';
const TTL = 5 * 60 * 1000;

export const previewMode = !API_URL;
// Dev only: with no server configured, localStorage 'semvault:mock' = '1' swaps in dev/mock-server.js.
export const mockMode = previewMode && localStorage.getItem('semvault:mock') === '1';
const mock = () => import('../dev/mock-server.js');

export async function getCatalog({ fresh = false } = {}) {
  if (mockMode) return (await mock()).catalog();
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
  let data;
  if (mockMode) {
    try {
      data = await (await mock()).handle(action, body);
    } catch (e) {
      data = { ok: false, error: e.message, code: e.code };
    }
  } else {
    if (!API_URL) throw new Error('Preview mode: not connected to the server yet');
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids a CORS preflight Apps Script can't answer
      body: JSON.stringify({ action, ...body }),
    });
    try {
      data = await res.json();
    } catch {
      // Google answers oversized or broken requests with an HTML page, not JSON.
      throw new Error("The server didn't accept that. If the files are large, try smaller ones, then try again.");
    }
  }
  if (!data.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.code = data.code;
    throw err;
  }
  return data;
}
