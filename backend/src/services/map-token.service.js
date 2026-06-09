/**
 * ArcGIS token for HARSAC MapServer (export / identify / query require auth).
 * Federated setup: portal token (referer-bound) → exchange for server token (hsacggm.in/host).
 */

const {
  mapServerToken,
  mapServerUsername,
  mapServerPassword,
  mapServerTokenUrl,
  mapServerReferer,
  mapServerExchangeUrl,
} = require('../config');

/** @type {{ token: string, expiresAt: number } | null} */
let cached = null;

/** @type {Promise<{ token: string, expiresAt: number }> | null} */
let tokenInflight = null;

function isTokenConfigured() {
  return Boolean(mapServerToken || (mapServerUsername && mapServerPassword));
}

/** Headers required when using referer-bound HARSAC tokens */
function getMapServerFetchHeaders(extra = {}) {
  return {
    Accept: extra.Accept || '*/*',
    'User-Agent': 'LOCATIUM-Proxy/1.0',
    Referer: mapServerReferer,
    ...extra,
  };
}

async function postTokenForm(body) {
  const res = await fetch(mapServerTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'LOCATIUM-Proxy/1.0',
    },
    body: body.toString(),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Token service returned non-JSON (${res.status})`);
  }

  if (!res.ok || json.error) {
    const msg = json.error?.message || json.error?.details?.[0] || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (!json.token) {
    throw new Error('Token service response missing token');
  }

  const expiresAt =
    typeof json.expires === 'number'
      ? json.expires
      : Date.now() + 23 * 60 * 60 * 1000;

  return { token: json.token, expiresAt };
}

/**
 * Portal credentials → server token (required for hsacggm.in/server MapServer REST).
 */
async function fetchGeneratedToken() {
  const portalBody = new URLSearchParams({
    username: mapServerUsername,
    password: mapServerPassword,
    client: 'referer',
    referer: mapServerReferer,
    expiration: '1440',
    f: 'json',
  });

  const portal = await postTokenForm(portalBody);

  const exchangeBody = new URLSearchParams({
    token: portal.token,
    serverUrl: mapServerExchangeUrl,
    f: 'json',
  });

  return postTokenForm(exchangeBody);
}

/**
 * Returns a valid MapServer token, or null if not configured.
 */
async function getMapServerToken() {
  if (mapServerToken) return mapServerToken;

  if (!mapServerUsername || !mapServerPassword) return null;

  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  if (!tokenInflight) {
    tokenInflight = fetchGeneratedToken()
      .then((next) => {
        cached = next;
        return next;
      })
      .finally(() => {
        tokenInflight = null;
      });
  }

  const next = await tokenInflight;
  return next.token;
}

/** Pre-fetch server token at API startup so the first map pan is faster. */
async function warmMapServerToken() {
  if (!isTokenConfigured()) return false;
  try {
    await getMapServerToken();
    return true;
  } catch (err) {
    console.warn('[maps] Token warm-up failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Append token query param when available (async for username/password flow).
 */
async function withMapServerToken(url) {
  const token = await getMapServerToken();
  if (!token) return url;
  const u = new URL(url);
  u.searchParams.set('token', token);
  return u.toString();
}

async function probeMapServerAccess() {
  if (!isTokenConfigured()) {
    return {
      ok: false,
      configured: false,
      message:
        'Map layers need a HARSAC token. Add MAP_SERVER_TOKEN or MAP_SERVER_USERNAME and MAP_SERVER_PASSWORD to backend/.env, then restart the API.',
    };
  }

  try {
    const token = await getMapServerToken();
    if (!token) {
      return { ok: false, configured: true, message: 'Could not obtain a MapServer token.' };
    }

    const testUrl = await withMapServerToken(
      'https://hsacggm.in/server/rest/services/MSME_HARSAC/Administrative_Boundaries/MapServer/export?bbox=76.6,28.3,77.2,28.7&bboxSR=4326&imageSR=4326&size=64,64&format=png&transparent=true&f=image'
    );

    const res = await fetch(
      testUrl,
      getMapServerFetchHeaders({ Accept: 'image/png,*/*' })
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok || !contentType.includes('image') || buf.length < 8 || buf[0] !== 0x89) {
      let msg = `MapServer test export failed (${res.status})`;
      try {
        const err = JSON.parse(buf.toString('utf8'));
        if (err.error?.message) msg = err.error.message;
      } catch {
        /* ignore */
      }
      return { ok: false, configured: true, message: msg };
    }

    return { ok: true, configured: true, message: 'MapServer token is valid.' };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      message: err instanceof Error ? err.message : 'MapServer token check failed',
    };
  }
}

function logStartupHint() {
  if (isTokenConfigured()) {
    console.log('Maps:  HARSAC credentials configured (portal → server token exchange)');
    return;
  }
  console.warn(
    'Maps:  No HARSAC token — operational layers will be blank. Set MAP_SERVER_TOKEN or MAP_SERVER_USERNAME/PASSWORD in backend/.env'
  );
}

module.exports = {
  isTokenConfigured,
  getMapServerToken,
  withMapServerToken,
  getMapServerFetchHeaders,
  probeMapServerAccess,
  logStartupHint,
  warmMapServerToken,
};
