require('dotenv').config();

const { createApp } = require('./app');
const { PORT, validateProductionConfig } = require('./config');
const { checkDatabase, closePool } = require('./db/pool');
const { startInvestorAlertJob } = require('./jobs/investor-alerts.job');
const { startDemoCleanupJob } = require('./jobs/demo-cleanup.job');
const { warmInvestorCache } = require('./services/investor-cache-warm.service');
const { logEvent } = require('./utils/structured-logger');

validateProductionConfig();
const app = createApp();
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`LOCATIUM API listening on http://${HOST}:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health  (liveness — no DB check)`);
  console.log(`Ready:  http://localhost:${PORT}/ready   (PostgreSQL)`);
  console.log(`Auth:   POST http://localhost:${PORT}/api/auth/register | login | refresh | logout`);
  console.log(`        GET  http://localhost:${PORT}/api/auth/profile (Bearer access token)`);
  console.log(`Maps:   GET  http://localhost:${PORT}/api/maps/status`);
  console.log(`        GET  http://localhost:${PORT}/api/tiles/list`);
  console.log(`        GET  http://localhost:${PORT}/api/tiles/:layer/:z/:x/:y.png`);
  console.log(`        GET  http://localhost:${PORT}/api/maps/:layerKey?bbox=minLon,minLat,maxLon,maxLat`);
  (async () => {
    const db = await checkDatabase();
    if (db.ok) console.log('Database: connected');
    else console.warn('Database: not configured or unreachable');
  })();
  startInvestorAlertJob();
  startDemoCleanupJob();
  if (process.env.INVESTOR_CACHE_WARM === 'true') {
    const warm = () =>
      warmInvestorCache()
        .then((r) => console.log(`Investor cache warm: ${r.success}/${r.queries} queries`))
        .catch((err) => console.warn('Investor cache warm skipped:', err.message));
    warm();
    // Re-warm before the score cache expires, so visitors never hit a minutes-long cold
    // district scan (which also exceeds the ~100s limit of the public tunnel).
    const ttlSec = Number(process.env.INVESTOR_SCORE_CACHE_TTL_SEC) || 3600;
    const rewarm = setInterval(warm, Math.max(10 * 60, ttlSec * 0.8) * 1000);
    rewarm.unref();
  }
  console.log(`UI:     cd frontend && npm run dev   → http://localhost:5173 (keep this API running)`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; stopping LOCATIUM API`);

  const forceTimer = setTimeout(() => process.exit(1), 10_000);
  forceTimer.unref();
  server.close(async (err) => {
    try {
      await closePool();
    } finally {
      clearTimeout(forceTimer);
      process.exit(err ? 1 : 0);
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

/**
 * Safety nets. A bug in one request must never take the API offline for everyone —
 * Node's default policy for an unhandled rejection is to terminate the process, which
 * turns a single malformed payload into an outage. Log loudly and keep serving.
 */
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logEvent('unhandled_rejection', { message: err.message, stack: err.stack });
  console.error('Unhandled promise rejection (kept serving):', err);
});

/**
 * An uncaught exception leaves process state undefined, so this one does stop — but
 * gracefully, draining in-flight requests and closing the pool, and with a non-zero
 * exit so a supervisor (compose `restart:`, systemd, Render) brings it straight back.
 */
process.on('uncaughtException', (err) => {
  logEvent('uncaught_exception', { message: err?.message, stack: err?.stack });
  console.error('Uncaught exception; shutting down:', err);
  shutdown('uncaughtException').finally(() => process.exit(1));
});
