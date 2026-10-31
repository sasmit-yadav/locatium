import { getMapsApiOrigin } from '../config/api';
import { authFetch } from './auth';

async function json(res, fallback) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || fallback);
  return body;
}

/** Plain, bilingual "Check my plot" summary for a point. */
export async function getPlotSummary({ lat, lng, sector = 'industrial', lang = 'en' }) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), sector, lang });
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/plot-summary?${params}`);
  return json(res, 'Could not check this place');
}

/** Downloads the one-page PDF and hands it to the browser as a file. */
export async function downloadPlotReport({ lat, lng, sector, lang, area, buyer, areaType, place }) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), sector, lang });
  if (area) params.set('area', String(area));
  if (buyer) params.set('buyer', buyer);
  if (areaType) params.set('areaType', areaType);
  if (place) params.set('place', place);
  const res = await authFetch(`${getMapsApiOrigin()}/api/analysis/plot-report?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Report failed (${res.status})`);
  }
  const blob = await res.blob();
  const match = (res.headers.get('content-disposition') || '').match(/filename="?([^";]+)"?/i);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] || 'locatium-plot-check.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function calculateAcquisitionCost(input) {
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/acquisition-cost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return json(res, 'Could not calculate the cost');
}

export async function getBuyerChecklist(lang = 'en') {
  const res = await fetch(`${getMapsApiOrigin()}/api/analysis/buyer-checklist?lang=${lang}`);
  return json(res, 'Could not load the checklist');
}

/** Ranked villages, hadbast, towns, HSVP sectors and plots. */
export async function searchPlaces(q, { limit = 8, signal } = {}) {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`${getMapsApiOrigin()}/api/features/places?${params}`, { signal });
  return json(res, 'Search failed');
}

/** Plain-language glossary (English + Hindi) shared with the copilot. */
export async function getGlossary() {
  const res = await fetch(`${getMapsApiOrigin()}/api/assistant/capabilities`);
  const body = await json(res, 'Could not load the glossary');
  return body.glossary || [];
}
