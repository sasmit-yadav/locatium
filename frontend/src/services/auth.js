import { getMapsApiOrigin } from '../config/api';

let accessToken = localStorage.getItem('locatium_access_token') || '';

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

/**
 * Perform silent login of the default analyst user.
 */
export async function loginDefaultAnalyst() {
  const origin = getMapsApiOrigin();
  const url = `${origin}/api/auth/login`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'analyst@locatium.in',
        password: 'sas@123456789',
      }),
    });

    if (!res.ok) {
      throw new Error(`Silent login failed with status: ${res.status}`);
    }

    const data = await res.json();
    if (data.accessToken) {
      setToken(data.accessToken);
      console.log('[auth] Silent auto-login succeeded');
      return data.accessToken;
    }
    throw new Error('No access token returned in response');
  } catch (error) {
    console.error('[auth] Silent auto-login error:', error.message);
    throw error;
  }
}

/**
 * Fetch wrapper that automatically appends the Bearer token header
 * and attempts auto-login and retry once if it returns 401.
 */
export async function authFetch(url, options = {}) {
  const headers = { ...options.headers };

  // Set auth header if token exists
  let token = getToken();
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
    console.warn('[auth] Authorization expired or missing. Attempting silent recovery...');
    try {
      token = await loginDefaultAnalyst();
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
