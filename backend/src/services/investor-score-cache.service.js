/**
 * Investor zone score cache — Redis (primary) + in-memory fallback.
 */

const redis = require('./redis-cache.service');

const MEMORY = new Map();
const DEFAULT_TTL_SEC = Number(process.env.INVESTOR_SCORE_CACHE_TTL_SEC) || 3600;
const MEMORY_TTL_MS = DEFAULT_TTL_SEC * 1000;

const CACHE_VERSION = 'v9'; // v9: ML / synthetic labels no longer blended into ranked scores

/**
 * `depth` keeps the fast ranking payload and the fully enriched payload in separate
 * slots. Without it whichever request warmed a zone first decided what every later
 * caller saw — a list scan could starve the detail view of plots/policy/comparables,
 * and a detail hit could make a lite list look richer than the lite path can promise.
 */
function key(zoneId, sector, depth = 'full') {
  return `investor:score:${CACHE_VERSION}:${depth}:${sector}:${zoneId}`;
}

function getMemory(k) {
  const hit = MEMORY.get(k);
  if (!hit || Date.now() - hit.at > MEMORY_TTL_MS) {
    MEMORY.delete(k);
    return null;
  }
  return hit.data;
}

function setMemory(k, data) {
  MEMORY.set(k, { at: Date.now(), data });
  if (MEMORY.size > 5000) MEMORY.delete(MEMORY.keys().next().value);
}

async function getCachedZoneScore(zoneId, sector, depth = 'full') {
  const k = key(zoneId, sector, depth);
  const mem = getMemory(k);
  if (mem) return { ...mem, cacheSource: 'memory' };

  const raw = await redis.getString(k);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      setMemory(k, data);
      return { ...data, cacheSource: 'redis' };
    } catch {
      return null;
    }
  }
  return null;
}

async function setCachedZoneScore(zoneId, sector, data, depth = 'full') {
  const k = key(zoneId, sector, depth);
  const payload = { ...data, cachedAt: new Date().toISOString() };
  setMemory(k, payload);
  await redis.setString(k, JSON.stringify(payload), DEFAULT_TTL_SEC);
}

async function clearAll() {
  MEMORY.clear();
}

module.exports = {
  getCachedZoneScore,
  setCachedZoneScore,
  clearAll,
  DEFAULT_TTL_SEC,
};
