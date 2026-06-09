/**
 * Central config from environment (single place to validate defaults).
 * Load dotenv in server.js (or tests) before importing this module.
 */

const PORT = Number(process.env.PORT) || 3001;

const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
const corsOrigins = rawOrigins
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
const jwtAccessExpires = process.env.JWT_ACCESS_EXPIRES || '7d';
const jwtRefreshExpires = process.env.JWT_REFRESH_EXPIRES || '30d';

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

module.exports = {
  PORT,
  corsOrigins,
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpires,
  jwtRefreshExpires,
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
};
