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
