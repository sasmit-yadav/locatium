const investorOpportunities = require('../services/investor-opportunities.service');
const investorReports = require('../services/investor-report.service');
const auditService = require('../services/audit.service');

async function getOpportunities(req, res) {
  const result = await investorOpportunities.getOpportunities(req.query || {});
  res.json(result);
}

async function listDistricts(req, res) {
  const result = await investorOpportunities.listDistricts();
  res.json(result);
}

async function getZones(req, res) {
  const result = await investorOpportunities.getZones(req.query || {});
  res.json(result);
}

async function getZoneAnalysis(req, res) {
  const result = await investorOpportunities.getZoneAnalysis(req.params.zoneId, req.query || {});
  res.json(result);
}

async function compareZones(req, res) {
  const result = await investorOpportunities.compareZones(req.query || {});
  res.json(result);
}

async function generateReport(req, res) {
  const zoneId = req.params.zoneId || req.query.zoneId || req.body?.zoneId;
  const report = await investorReports.generateReport(
    zoneId,
    req.query || req.body || {},
    req.user.id
  );

  await auditService.writeAuditFromRequest(req, {
    action: 'investor.report_generated',
    resourceType: 'report',
    resourceId: report.metadata?.id || null,
    metadata: {
      zoneId: report.analysis?.zone?.id || zoneId,
      zoneName: report.analysis?.zone?.name,
      filename: report.filename,
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.setHeader('Content-Length', report.buffer.length);
  res.send(report.buffer);
}

async function listReports(req, res) {
  const reports = await investorReports.listReports({
    limit: req.query.limit,
    userId: req.user.id,
  });
  res.json({ count: reports.length, reports });
}

async function downloadReport(req, res) {
  const { report, buffer } = await investorReports.getReportById(
    req.params.reportId,
    req.user.id
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

async function emailReport(req, res) {
  const body = req.body || {};
  const result = await investorReports.emailReport({
    to: body.to,
    zoneId: body.zoneId || req.query.zoneId,
    reportId: body.reportId,
    query: { ...(req.query || {}), sector: body.sector || req.query?.sector },
    userId: req.user.id,
  });

  await auditService.writeAuditFromRequest(req, {
    action: 'investor.report_emailed',
    resourceType: 'report',
    resourceId: result.reportId,
    metadata: {
      to: result.to,
      zoneId: result.zoneId,
      zoneName: result.zoneName,
      deliveryMode: result.deliveryMode,
    },
  });

  res.json(result);
}

async function getPlotInventory(req, res) {
  const result = await investorOpportunities.getPlotInventory(req.params.zoneId, req.query || {});
  res.json(result);
}

async function generatePortfolioReport(req, res) {
  const { zoneIds, sector, portfolioName } = req.body || req.query || {};
  const ids = Array.isArray(zoneIds) ? zoneIds : String(zoneIds || '').split(',').filter(Boolean);
  const report = await investorReports.generatePortfolioReport({
    zoneIds: ids,
    sector: sector || 'industrial',
    portfolioName: portfolioName || 'Investor portfolio',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.send(report.buffer);
}

module.exports = {
  getOpportunities,
  listDistricts,
  getZones,
  getZoneAnalysis,
  compareZones,
  getPlotInventory,
  generateReport,
  generatePortfolioReport,
  listReports,
  downloadReport,
  emailReport,
};
