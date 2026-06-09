/**
 * In-process PNG tile cache (fast path when Redis is off).
 */

const MAX_ENTRIES = 800;

/** @type {Map<string, Buffer>} */
const store = new Map();

function get(key) {
  const buf = store.get(key);
  if (!buf) return null;
  store.delete(key);
  store.set(key, buf);
  return buf;
}

function set(key, buffer) {
  if (store.has(key)) store.delete(key);
  store.set(key, buffer);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

module.exports = { get, set };
