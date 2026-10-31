const { purgeExpiredDemoUsers } = require('../services/auth.service');

const INTERVAL_MS = 6 * 60 * 60 * 1000;
let timer = null;

/** Purges expired per-visitor demo accounts at boot and every 6 hours. */
function startDemoCleanupJob() {
  if (process.env.DEMO_MODE !== 'true' || process.env.DEMO_ISOLATED === 'false') return;

  const tick = async () => {
    try {
      const { deleted } = await purgeExpiredDemoUsers();
      if (deleted) console.log(`[demo-cleanup] removed ${deleted} expired demo account(s)`);
    } catch (err) {
      console.error('[demo-cleanup] failed:', err.message);
    }
  };

  tick();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
}

function stopDemoCleanupJob() {
  if (timer) clearInterval(timer);
}

module.exports = { startDemoCleanupJob, stopDemoCleanupJob };
