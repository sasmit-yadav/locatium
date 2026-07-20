import { getMapsApiOrigin } from '../config/api';

export async function searchFeatures(keyword, { limit = 12, layer } = {}) {
  const q = typeof keyword === 'string' ? keyword.trim() : '';
  if (q.length < 2) return { features: [] };

  const params = new URLSearchParams({ keyword: q, limit: String(limit) });
  if (layer) params.set('layer', layer);

  const res = await fetch(`${getMapsApiOrigin()}/api/features/search?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `Search failed (${res.status})`);
  }
  return json;
}
