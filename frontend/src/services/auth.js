import { create } from 'zustand';
import { getMapsApiOrigin } from '../config/api';

/**
 * Session handling.
 *
 * - Access tokens are short-lived (15 min). When one expires the API answers 401 and
 *   authFetch silently swaps the refresh token for a new access token, then retries.
 * - Visitors who have not signed in get a private guest (demo) account automatically,
 *   so the app works without sign-up. Creating an account upgrades that guest account
 *   in place, so nothing they saved is lost.
 */

const ACCESS_KEY = 'locatium_access_token';
const REFRESH_KEY = 'locatium_refresh_token';

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: token lasts this page view */
  }
}

let accessToken = readStorage(ACCESS_KEY);
let refreshToken = readStorage(REFRESH_KEY);
let demoLoginPromise = null;
let refreshPromise = null;

/** Current signed-in user for the UI. `null` until the profile has loaded. */
export const useAuthStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

export function getToken() {
  return accessToken;
}

export function setToken(token) {
  accessToken = token || '';
  writeStorage(ACCESS_KEY, accessToken);
}

function setRefreshToken(token) {
  refreshToken = token || '';
  writeStorage(REFRESH_KEY, refreshToken);
}

function applySession(data) {
  if (data?.accessToken) setToken(data.accessToken);
  if (data?.refreshToken) setRefreshToken(data.refreshToken);
  if (data?.user) useAuthStore.getState().setUser(data.user);
}

function clearSession() {
  setToken('');
  setRefreshToken('');
  useAuthStore.getState().setUser(null);
}

function api(path) {
  return `${getMapsApiOrigin()}/api/auth${path}`;
}

async function postJson(path, body, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(api(path), { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || json.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Obtain a private guest identity without exposing credentials. */
export async function loginDemo() {
  if (getToken()) return getToken();
  if (demoLoginPromise) return demoLoginPromise;

  demoLoginPromise = (async () => {
    const res = await fetch(api('/demo'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Demo login failed with status: ${res.status}`);
    }
    const data = await res.json();
    if (!data.accessToken) throw new Error('No access token returned in response');
    applySession(data);
    return data.accessToken;
  })();

  try {
    return await demoLoginPromise;
  } finally {
    demoLoginPromise = null;
  }
}

/** Exchanges the refresh token for a new access token. De-duplicates concurrent callers. */
async function refreshAccessToken() {
  if (!refreshToken) return null;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(api('/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Revoked or expired (signed out elsewhere, password changed, account deleted).
        clearSession();
        return null;
      }
      const data = await res.json();
      applySession(data);
      return data.accessToken || null;
    } catch {
      return null; // network error: keep tokens, let the caller report it
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Fetch wrapper: adds the Bearer token, and on 401 refreshes the session (or, as a last
 * resort, starts a fresh guest session) and retries once.
 */
export async function authFetch(url, options = {}) {
  const headers = { ...options.headers };

  // Cold load: acquire an identity BEFORE the first request, so a burst of queries on mount
  // does not all fire tokenless and 401. loginDemo() de-duplicates concurrent callers.
  let token = getToken();
  if (!token && refreshToken) token = await refreshAccessToken();
  if (!token) {
    try {
      token = await loginDemo();
    } catch {
      /* fall through: the request below will 401 and the retry path reports it */
    }
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    setToken('');
    try {
      token = (await refreshAccessToken()) || (await loginDemo());
      headers.Authorization = `Bearer ${token}`;
      res = await fetch(url, { ...options, headers });
    } catch (err) {
      console.error('[auth] Silent recovery failed:', err.message);
    }
  }

  return res;
}

export async function getAuthConfig() {
  const res = await fetch(api('/config'));
  if (!res.ok) return { registrationOpen: false, demoMode: true };
  return res.json();
}

/** Creates an account. If the visitor is a guest, the guest account is upgraded (data kept). */
export async function register({ email, password, displayName, acceptTerms }) {
  // Make sure an expired guest access token is renewed first, so the upgrade can find it.
  if (!accessToken && refreshToken) await refreshAccessToken();
  const data = await postJson('/register', { email, password, displayName, acceptTerms }, { auth: true });
  applySession(data);
  return data;
}

export async function login({ email, password }) {
  const data = await postJson('/login', { email, password });
  applySession(data);
  return data;
}

export async function logout() {
  const token = refreshToken;
  clearSession();
  if (token) {
    await postJson('/logout', { refreshToken: token }).catch(() => {});
  }
}

export function forgotPassword({ email }) {
  return postJson('/forgot-password', { email });
}

export function resetPassword({ token, password }) {
  return postJson('/reset-password', { token, password });
}

export async function verifyEmail({ token }) {
  const data = await postJson('/verify-email', { token });
  const current = useAuthStore.getState().user;
  if (current && data.user && current.id === data.user.id) useAuthStore.getState().setUser(data.user);
  return data;
}

async function authJson(path, { method = 'POST', body } = {}) {
  const res = await authFetch(api(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Request failed (${res.status})`);
  }
  return json;
}

export function resendVerification() {
  return authJson('/resend-verification');
}

export async function changePassword({ currentPassword, newPassword }) {
  const data = await authJson('/change-password', { body: { currentPassword, newPassword } });
  applySession(data);
  return data;
}

export async function deleteAccount({ password }) {
  const data = await authJson('/account', { method: 'DELETE', body: { password } });
  clearSession();
  return data;
}

export async function getProfile() {
  const res = await authFetch(api('/profile'));
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Failed to load profile (${res.status})`);
  }
  useAuthStore.getState().setUser(json);
  return json;
}

export async function updateProfile({ displayName }) {
  const res = await authFetch(api('/profile'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Failed to update profile (${res.status})`);
  }
  useAuthStore.getState().setUser(json);
  return json;
}

/** Opens the sign-in / sign-up dialog from anywhere. mode: 'signin' | 'signup' | 'forgot'. */
export function openAccountDialog(mode = 'signin') {
  window.dispatchEvent(new CustomEvent('locatium:open-account', { detail: { mode } }));
}
