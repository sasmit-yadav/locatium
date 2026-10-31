import { getMapsApiOrigin } from '../config/api';

export async function fetchMapsStatus() {
  const origin = getMapsApiOrigin();
  const res = await fetch(`${origin}/api/maps/status`);
  if (!res.ok) {
    throw new Error(`Maps status check failed (${res.status})`);
  }
  return res.json();
}
