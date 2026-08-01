import { getMapsApiOrigin } from '../config/api';

/**
 * Ask LOCATIUM copilot — JSON mode with multi-turn history + session memory.
 * District full-scans can take minutes on cold cache — keep AbortSignal long.
 */
export async function askLocatium(payload, { signal } = {}) {
  const origin = getMapsApiOrigin();
  let res;
  try {
    res = await fetch(`${origin}/api/assistant/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, stream: false }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(
      'Network/proxy timed out while scanning sites. For Gurugram, the first full scan can take a few minutes — wait and retry (cache warms after first success).'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Assistant failed (${res.status})`);
  }
  return data;
}
