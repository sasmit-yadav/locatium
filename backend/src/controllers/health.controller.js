const { checkDatabaseReadiness } = require('../db/pool');
const { pingRedis } = require('../services/redis-cache.service');

function livePayload() {
  return {
    status: 'ok',
    service: 'locatium-api',
    time: new Date().toISOString(),
  };
}

function readyPayload(dbStatus, redisStatus) {
  const dbUp = dbStatus.ok;
  const redisLabel = !redisStatus
    ? 'unknown'
    : redisStatus.ok
      ? 'up'
      : redisStatus.reason === 'not_configured'
        ? 'not_configured'
        : 'down';

  const allOk = dbUp && (redisStatus?.ok || redisStatus?.reason === 'not_configured');

  return {
    status: allOk ? 'ok' : 'not_ready',
    service: 'locatium-api',
    database: dbUp ? 'up' : dbStatus.reason === 'not_configured' ? 'not_configured' : 'down',
    redis: redisLabel,
    time: new Date().toISOString(),
    ...(!dbUp ? { detail: dbStatus.message || dbStatus.reason } : {}),
    ...(redisStatus && !redisStatus.ok && redisStatus.reason !== 'not_configured'
      ? { redisDetail: redisStatus.message }
      : {}),
  };
}

async function healthLive(_req, res) {
  res.json(livePayload());
}

async function healthReady(_req, res) {
  const dbStatus = await checkDatabaseReadiness({
    requireSpatial: process.env.REQUIRE_SPATIAL_DATA === 'true',
  });
  const redisStatus = await pingRedis();
  const payload = readyPayload(dbStatus, redisStatus);

  if (payload.status === 'ok') {
    res.json(payload);
    return;
  }
  res.status(503).json(payload);
}

module.exports = { healthLive, healthReady };
