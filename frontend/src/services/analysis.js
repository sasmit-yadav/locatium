import { getMapsApiOrigin } from '../config/api';

export async function scoreLocation({ lat, lng, sector = 'industrial' }) {
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/score-location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, sector }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Analysis failed (${res.status})`);
  }
  return json;
}

export async function scoreBatch({ locations, sector = 'industrial' }) {
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/score-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, sector }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Batch analysis failed (${res.status})`);
  }
  return json;
}

/**
 * `horizon` opts into the forward `outlook` block. It is omitted by default so callers
 * that only want today's band do not pay for the extra trend query.
 */
export async function getLandForecast({ lat, lng, sector = 'industrial', zoneId, horizon } = {}) {
  const params = new URLSearchParams();
  if (zoneId) params.set('zoneId', zoneId);
  if (lat != null) params.set('lat', String(lat));
  if (lng != null) params.set('lng', String(lng));
  params.set('sector', sector);
  if (horizon) params.set('horizon', Array.isArray(horizon) ? horizon.join(',') : String(horizon));
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/forecast?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Land forecast failed (${res.status})`);
  }
  return json;
}

export async function getFacilityGap({ district, limit = 400 } = {}) {
  const params = new URLSearchParams();
  if (district) params.set('district', district);
  params.set('limit', String(limit));
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/facility-gap?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Facility gap failed (${res.status})`);
  }
  return json;
}
