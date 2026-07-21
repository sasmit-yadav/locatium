require('dotenv').config();

const { createApp } = require('./app');
const { PORT } = require('./config');
const { checkDatabase } = require('./db/pool');
const { startInvestorAlertJob } = require('./jobs/investor-alerts.job');
const { warmInvestorCache } = require('./services/investor-cache-warm.service');

const app = createApp();

app.listen(PORT, () => {
  console.log(`LOCATIUM API listening on http://localhost:${PORT}`);
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
  if (process.env.INVESTOR_CACHE_WARM !== 'false') {
    warmInvestorCache()
      .then((r) => console.log(`Investor cache warm: ${r.success}/${r.queries} queries`))
      .catch((err) => console.warn('Investor cache warm skipped:', err.message));
  }
  console.log(`UI:     cd frontend && npm run dev   → http://localhost:5173 (keep this API running)`);
});
