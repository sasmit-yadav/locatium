/**
 * Central config from environment (single place to validate defaults).
 * Load dotenv in server.js (or tests) before importing this module.
 */

const PORT = Number(process.env.PORT) || 3002;

const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
const corsOrigins = rawOrigins
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
/** Short-lived access tokens; the frontend renews them silently with the refresh token. */
const jwtAccessExpires = process.env.JWT_ACCESS_EXPIRES || '15m';
const jwtRefreshExpires = process.env.JWT_REFRESH_EXPIRES || '30d';

/** Public URL of the frontend — used to build verify-email and reset-password links. */
const appPublicUrl = (process.env.PUBLIC_APP_URL || corsOrigins[0] || 'http://localhost:5173').replace(/\/$/, '');

/** Minimum password length (README security checklist: 12+) */
const passwordMinLength = Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH) || 12);

/** Redis URL — optional; tiles/geo queries work without cache if unset */
const redisUrl = process.env.REDIS_URL || '';

/** Tile PNG cache TTL (seconds); roadmap default ~24h */
const tileCacheTtlSec = Number(process.env.TILE_CACHE_TTL_SEC) || 86400;

/** GeoJSON bbox query cache TTL (seconds); roadmap ~1h */
const mapQueryCacheTtlSec = Number(process.env.MAP_QUERY_CACHE_TTL_SEC) || 3600;

/** MapServer export/query HTTP timeout (ms) */
const mapUpstreamTimeoutMs = Number(process.env.MAP_UPSTREAM_TIMEOUT_MS) || 45000;

/** ArcGIS REST layer index used for `/query` (per-service tuning later) */
const mapQueryLayerId = Number(process.env.MAP_QUERY_LAYER_ID);
const mapQueryLayerIdSafe = Number.isFinite(mapQueryLayerId) ? mapQueryLayerId : 0;

/** Rate limit (Step 4): requests per IP per window for map routes */
const mapRateLimitWindowMs = Number(process.env.MAP_RATE_LIMIT_WINDOW_MS) || 60_000;
const mapRateLimitMax =
  Number(process.env.MAP_RATE_LIMIT_MAX) ||
  (process.env.NODE_ENV === 'production' ? 100 : 2000);

/** Identify tolerance (screen px); wider picks symbols easier on dense tiles */
const mapIdentifyTolerancePx = Number(process.env.MAP_IDENTIFY_TOLERANCE_PX);
const mapIdentifyTolerancePxSafe = Number.isFinite(mapIdentifyTolerancePx) ? mapIdentifyTolerancePx : 15;

/** HARSAC / ArcGIS MapServer token (export, identify, query require auth) */
const mapServerToken = (process.env.MAP_SERVER_TOKEN || '').trim();
const mapServerUsername = (process.env.MAP_SERVER_USERNAME || '').trim();
const mapServerPassword = process.env.MAP_SERVER_PASSWORD || '';
const mapServerTokenUrl =
  (process.env.MAP_SERVER_TOKEN_URL || '').trim() ||
  'https://hsacggm.in/portal/sharing/rest/generateToken';

/** Referer bound to portal tokens (HARSAC requires HTTPS + referer) */
const mapServerReferer =
  (process.env.MAP_SERVER_REFERER || '').trim() || 'https://hsacggm.in';

/** Federated server URL for portal → server token exchange */
const mapServerExchangeUrl =
  (process.env.MAP_SERVER_EXCHANGE_URL || '').trim() || 'https://hsacggm.in/host';

/** ML service base URL (Phase 4 — optional; scoring falls back when unreachable) */
const mlServiceUrl = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
/**
 * ML_SERVICE_URL=disabled turns the (experimental, display-only) ML service off entirely, e.g.
 * on free hosting. Scores then come straight from the formula, which is what users see anyway.
 */
const mlServiceEnabled = !/^(disabled|off|false|none)$/i.test((process.env.ML_SERVICE_URL || '').trim());

/**
 * Allow a sleeping showcase ML service to wake. Locally we still fail fast, but the
 * budget has to cover the ML service's own cold PostGIS feature queries (~1-3s while
 * they contend with the Node heuristic's queries) or every first score silently
 * drops to the heuristic fallback. An unreachable service still errors immediately.
 */
const mlServiceTimeoutMs =
  Number(process.env.ML_SERVICE_TIMEOUT_MS) ||
  (process.env.NODE_ENV === 'production' ? 75_000 : 8_000);

/**
 * The investment model is trained on 30 HSIIDC rows whose labels are derived from the same
 * spatial features it reads (db/zone_features.sql), so it can only re-learn a hand formula.
 * Until real outcome data exists its output is reported as an experimental shadow score and
 * never replaces or blends into the formula score. Set ML_OVERRIDE_ENABLED=true to restore
 * the old override behaviour (e.g. after retraining on real outcomes).
 */
function mlOverrideEnabled() {
  return process.env.ML_OVERRIDE_ENABLED === 'true';
}

function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const errors = [];
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CORS_ORIGINS'];
  for (const key of required) {
    if (!process.env[key]?.trim()) errors.push(`${key} is required`);
  }

  if ((jwtAccessSecret || '').length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }
  if ((jwtRefreshSecret || '').length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters');
  }
  if (jwtAccessSecret && jwtAccessSecret === jwtRefreshSecret) {
    errors.push('JWT access and refresh secrets must be different');
  }
  if (corsOrigins.includes('*')) {
    errors.push('CORS_ORIGINS cannot contain * in production');
  }
  if (corsOrigins.some((origin) => /^http:\/\/(localhost|127\.0\.0\.1)/i.test(origin))) {
    errors.push('CORS_ORIGINS cannot contain localhost in production');
  }

  if (!process.env.PUBLIC_APP_URL?.trim()) {
    errors.push('PUBLIC_APP_URL is required (frontend URL used in verify / reset emails)');
  }
  if (!process.env.SMTP_HOST?.trim() || !process.env.SMTP_FROM?.trim()) {
    console.warn(
      '[config] SMTP_HOST / SMTP_FROM are not set: verification, password-reset and report emails will NOT be delivered.'
    );
  }

  if (errors.length) {
    throw new Error(`Invalid production configuration:\n- ${errors.join('\n- ')}`);
  }
}

module.exports = {
  PORT,
  corsOrigins,
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpires,
  jwtRefreshExpires,
  appPublicUrl,
  passwordMinLength,
  redisUrl,
  tileCacheTtlSec,
  mapQueryCacheTtlSec,
  mapUpstreamTimeoutMs,
  mapQueryLayerIdSafe,
  mapRateLimitWindowMs,
  mapRateLimitMax,
  mapIdentifyTolerancePxSafe,
  mapServerToken,
  mapServerUsername,
  mapServerPassword,
  mapServerTokenUrl,
  mapServerReferer,
  mapServerExchangeUrl,
  mlServiceUrl,
  mlServiceEnabled,
  mlServiceTimeoutMs,
  mlOverrideEnabled,
  validateProductionConfig,
};
