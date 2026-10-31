import { getMapsApiOrigin } from '../config/api';

/**
 * @param {object} body
 * @param {number} body.lng
 * @param {number} body.lat
 * @param {{ xmin: number, ymin: number, xmax: number, ymax: number }} body.extent4326
 * @param {number} body.width
 * @param {number} body.height
 * @param {number} [body.dpi]
 * @param {string[]} body.layerKeys
 */
export async function postIdentifyBatch(body) {
  const origin = getMapsApiOrigin();
  const res = await fetch(`${origin}/api/maps/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : 'Identify request failed');
  }
  return json;
}
