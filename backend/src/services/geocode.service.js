const { AppError } = require('../middleware/error.middleware');

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

/** Required by https://operations.osmfoundation.org/policies/nominatim/ */
const DEFAULT_UA = 'LOCATIUM/1.0 (local development; geocode proxy)';

function zoomFromBBox(bb) {
  if (!Array.isArray(bb) || bb.length < 4) return 13;
  const south = Number(bb[0]);
  const north = Number(bb[1]);
  const west = Number(bb[2]);
  const east = Number(bb[3]);
  if ([south, north, west, east].some((n) => Number.isNaN(n))) return 13;
  const latDiff = Math.abs(north - south);
  const lonDiff = Math.abs(east - west);
  const span = Math.max(latDiff, lonDiff);
  if (span > 3) return 8;
  if (span > 1) return 10;
  if (span > 0.25) return 12;
  if (span > 0.05) return 14;
  return 16;
}

function mapItem(row) {
  const lng = Number.parseFloat(row.lon);
  const lat = Number.parseFloat(row.lat);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return {
    id: String(row.place_id ?? `${lng},${lat}`),
    label: row.display_name || `${lat}, ${lng}`,
    lng,
    lat,
    zoom: zoomFromBBox(row.boundingbox),
    type: row.type ?? '',
    category: row.category ?? '',
  };
}

/**
 * Free-text places in India (villages, tehsils, muraba labels in OSM, cities, POIs).
 * Proxied so the browser never hits Nominatim directly (CORS + User-Agent policy).
 */
async function searchPlaces(rawQuery) {
  const q = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  if (q.length < 2) {
    throw AppError.badRequest('Query must be at least 2 characters');
  }
  if (q.length > 280) {
    throw AppError.badRequest('Query too long');
  }

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '14',
    addressdetails: '1',
    countrycodes: 'in',
    'accept-language': 'en',
  });
  // Bias ranking toward upper NW India / Haryana belt without hard clipping (bounded=0).
  params.set('viewbox', '73.8,32.2,78.2,26.8');
  params.set('bounded', '0');

  const url = `${NOMINATIM_SEARCH}?${params.toString()}`;
  const ua = process.env.NOMINATIM_USER_AGENT?.trim() || DEFAULT_UA;

  const timeoutMs = Number(process.env.GEOCODE_TIMEOUT_MS) || 18_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': ua,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    throw AppError.serviceUnavailable(`Geocoder unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw AppError.serviceUnavailable(`Geocoder returned HTTP ${res.status}`);
  }

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw AppError.serviceUnavailable('Geocoder returned invalid JSON');
  }

  if (!Array.isArray(rows)) {
    return { results: [] };
  }

  const results = rows.map(mapItem).filter(Boolean);
  return { results };
}

module.exports = {
  searchPlaces,
};
