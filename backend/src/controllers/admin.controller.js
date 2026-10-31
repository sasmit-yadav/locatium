const adminService = require('../services/admin.service');
const modelHealthService = require('../services/model-health.service');

async function layerStatus(_req, res) {
  const status = await adminService.getLayerStatus();
  res.json(status);
}

async function userStatistics(_req, res) {
  const stats = await adminService.getUserStatistics();
  res.json(stats);
}

async function dataAnalytics(_req, res) {
  const analytics = await adminService.getDataAnalytics();
  res.json(analytics);
}

/** Week 16 model-monitoring rollup: ML uptime, scoring fallback rate, LLM health, data freshness. */
async function modelHealth(_req, res) {
  res.json(await modelHealthService.getModelHealth());
}

async function auditLogs(req, res) {
  const logs = await adminService.getRecentAuditLogs({ limit: req.query.limit });
  res.json({ count: logs.length, logs });
}

module.exports = {
  modelHealth,
  layerStatus,
  userStatistics,
  dataAnalytics,
  auditLogs,
};
