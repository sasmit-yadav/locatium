/**
 * Optional Redis cache for tile PNG buffers and JSON strings.
 * If REDIS_URL is unset, all operations no-op / return null.
 */

const Redis = require('ioredis');

let client = null;
let redisDisabled = false;

function getClient() {
  if (!process.env.REDIS_URL || redisDisabled) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    client.on('error', (err) => {
      if (!redisDisabled) {
        redisDisabled = true;
        console.warn('[redis] Unavailable — continuing without tile cache:', err.message);
        try {
          client.disconnect();
        } catch {
          /* noop */
        }
        client = null;
      }
    });
    client.connect().catch(() => {
      /* handled by error listener */
    });
  }
  return client;
}

async function getBuffer(key) {
  const r = getClient();
  if (!r) return null;
  try {
    const buf = await r.getBuffer(key);
    return buf && buf.length ? buf : null;
  } catch {
    return null;
  }
}

async function setBuffer(key, buffer, ttlSec) {
  const r = getClient();
  if (!r) return;
  try {
    await r.set(key, buffer, 'EX', ttlSec);
  } catch {
    /* ignore cache write failures */
  }
}

async function getString(key) {
  const r = getClient();
  if (!r) return null;
  try {
    const s = await r.get(key);
    return s ?? null;
  } catch {
    return null;
  }
}

async function setString(key, value, ttlSec) {
  const r = getClient();
  if (!r) return;
  try {
    await r.set(key, value, 'EX', ttlSec);
  } catch {
    /* ignore */
  }
}

/** Health check — does not create a long-lived client if REDIS_URL unset. */
async function pingRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return { ok: false, reason: 'not_configured' };
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 4000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    return pong === 'PONG' ? { ok: true } : { ok: false, reason: 'error', message: 'unexpected ping' };
  } catch (err) {
    return { ok: false, reason: 'error', message: err.message };
  } finally {
    redis.disconnect();
  }
}

module.exports = {
  getBuffer,
  setBuffer,
  getString,
  setString,
  pingRedis,
};
