const { runAllAlerts } = require('../services/investor-alert.service');

const INTERVAL_MS = Number(process.env.INVESTOR_ALERT_INTERVAL_MS) || 60 * 60 * 1000;

let timer = null;

function startInvestorAlertJob() {
  if (process.env.INVESTOR_ALERTS_ENABLED !== 'true') {
    console.log('[investor-alerts] Job disabled (set INVESTOR_ALERTS_ENABLED=true)');
    return;
  }

  const tick = async () => {
    try {
      const result = await runAllAlerts();
      console.log(`[investor-alerts] processed=${result.processed} notified=${result.notified}`);
    } catch (err) {
      console.error('[investor-alerts] run failed:', err.message);
    }
  };

  tick();
  timer = setInterval(tick, INTERVAL_MS);
  console.log(`[investor-alerts] Scheduled every ${Math.round(INTERVAL_MS / 60000)} min`);
}

function stopInvestorAlertJob() {
  if (timer) clearInterval(timer);
}

module.exports = { startInvestorAlertJob, stopInvestorAlertJob };
