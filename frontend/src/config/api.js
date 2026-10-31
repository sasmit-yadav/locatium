/**
 * Backend origin for `/api/*` (tiles, identify).
 * In development use the browser origin (e.g. http://localhost:5173) so tile URLs stay absolute.
 * Vite proxies `/api` → VITE_API_URL when configured.
 */
export function getMapsApiOrigin() {
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return 'http://localhost:5173';
  }
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === 'string' && raw.trim()) {
    const origin = raw.replace(/\/+$/, '');
    if (!/^https:\/\//i.test(origin)) {
      throw new Error('VITE_API_URL must use HTTPS in production');
    }
    return origin;
  }
  throw new Error('VITE_API_URL is required for a production build');
}

/** Bump when backend tile projection/rendering changes, so browser tile cache is bypassed. */
const TILE_URL_VERSION = 'mvt-v5';

/** Per-table vector tiles (MVT) from backend PostGIS — one source per table. */
export function getTableTileUrl(tableId) {
  return `${getMapsApiOrigin()}/api/tiles/${tableId}/{z}/{x}/{y}.pbf?v=${TILE_URL_VERSION}`;
}

/** @deprecated Use getTableTileUrl — category slugs no longer serve combined tiles. */
export function getOperationalTileUrl(layerSlug) {
  return getTableTileUrl(layerSlug);
}
