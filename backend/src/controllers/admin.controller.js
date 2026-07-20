const adminService = require('../services/admin.service');

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

async function auditLogs(req, res) {
  const logs = await adminService.getRecentAuditLogs({ limit: req.query.limit });
  res.json({ count: logs.length, logs });
}

module.exports = {
  layerStatus,
  userStatistics,
  dataAnalytics,
  auditLogs,
};
