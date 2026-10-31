import { getMapsApiOrigin } from '../config/api';

let accessToken = localStorage.getItem('locatium_access_token') || '';
let demoLoginPromise = null;

export function getToken() {
  return accessToken;
}

export function setToken(token) {
  accessToken = token;
  if (token) {
    localStorage.setItem('locatium_access_token', token);
  } else {
    localStorage.removeItem('locatium_access_token');
  }
}

/** Obtain the server-controlled showcase identity without exposing credentials. */
export async function loginDemo() {
  if (getToken()) return getToken();
  if (demoLoginPromise) return demoLoginPromise;

  const origin = getMapsApiOrigin();
  const url = `${origin}/api/auth/demo`;

  demoLoginPromise = (async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Demo login failed with status: ${res.status}`);
    }

    const data = await res.json();
    if (data.accessToken) {
      setToken(data.accessToken);
      return data.accessToken;
    }
    throw new Error('No access token returned in response');
  })();

  try {
    return await demoLoginPromise;
  } finally {
    demoLoginPromise = null;
  }
}

/**
 * Fetch wrapper that automatically appends the Bearer token header
 * and attempts showcase login and retry once if it returns 401.
 */
export async function authFetch(url, options = {}) {
  const headers = { ...options.headers };

  // Cold load: acquire the showcase identity BEFORE the first request. Without this
  // every authenticated query on mount fires tokenless, 401s, and recovers separately —
  // a burst of failed requests and console errors on every page load. loginDemo()
  // de-duplicates concurrent callers, so the whole burst shares one login.
  let token = getToken();
  if (!token) {
    try {
      token = await loginDemo();
    } catch {
      /* fall through: the request below will 401 and the retry path reports it */
    }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  let res = await fetch(url, fetchOptions);

  // If unauthorized, perform silent login and retry once
  if (res.status === 401) {
    setToken('');
    try {
      token = await loginDemo();
      // Retry with new token
      headers['Authorization'] = `Bearer ${token}`;
      res = await fetch(url, { ...options, headers });
    } catch (err) {
      console.error('[auth] Silent recovery failed:', err.message);
    }
  }

  return res;
}

export async function getProfile() {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/auth/profile`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Failed to load profile (${res.status})`);
  }
  return json;
}

export async function updateProfile({ displayName }) {
  const origin = getMapsApiOrigin();
  const res = await authFetch(`${origin}/api/auth/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Failed to update profile (${res.status})`);
  }
  return json;
}
