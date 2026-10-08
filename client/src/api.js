// Dev: talks to the local server. Production: VITE_API_URL (absolute URL), or '/api' when the host proxies /api to the backend.
const RAW = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');
const BASE = RAW.replace(/\/+$/, '');

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method, credentials: 'include',
      headers: { 'X-Requested-With': 'HostelHub', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session ended (expired, or account deactivated): send the user back to login. Login/me handle their own errors.
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') window.dispatchEvent(new Event('hostelhub:unauthorized'));
    if (data.code === 'MUST_CHANGE_PASSWORD') window.dispatchEvent(new Event('hostelhub:mustchange'));
    const e = new Error(data.message || 'Something went wrong'); e.status = res.status; e.code = data.code; throw e;
  }
  return data;
}
