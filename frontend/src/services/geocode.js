import { getMapsApiOrigin } from '../config/api';

/**
 * Free-text geocode (India-biased): villages, tehsils, muraba labels present in OSM, cities, POIs.
 */
function geocodeFetchErrorHint() {
  if (!import.meta.env.DEV) {
    return 'Maps API unreachable.';
  }
  return 'Maps API unreachable. Start the backend from the repo `backend` folder (see README Quick start: `npm run dev` so the API listens on the port in `frontend/.env` VITE_API_URL, usually 3001).';
}

export async function fetchGeocodeSuggestions(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  const origin = getMapsApiOrigin();
  const url = `${origin}/api/geocode/search?q=${encodeURIComponent(q)}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    const base = geocodeFetchErrorHint();
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    throw new Error(`${base}${detail}`, { cause: err });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error || json.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : 'Geocode failed');
  }
  return {
    results: Array.isArray(json.results) ? json.results : [],
    attribution: json.attribution || '',
  };
}
