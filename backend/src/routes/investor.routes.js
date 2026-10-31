const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const { authenticate } = require('../middleware/auth.middleware');
const { heavyWorkGuard, isDistrictScan } = require('../middleware/heavy-work-guard.middleware');
const investor = require('../controllers/investor.controller');

const router = Router();

// Light, cacheable listings stay public.
router.get('/districts', asyncHandler(investor.listDistricts));
router.get('/zones', asyncHandler(investor.getZones));

// Ranking and per-zone analysis run live PostGIS scoring. A cold district scan can take
// minutes, so these need a token (the showcase issues one automatically) and district
// scans are concurrency-bounded.
router.get(
  '/opportunities',
  authenticate,
  heavyWorkGuard(isDistrictScan),
  asyncHandler(investor.getOpportunities)
);
router.get('/compare-zones', authenticate, asyncHandler(investor.compareZones));
router.get('/zone-analysis/:zoneId', authenticate, asyncHandler(investor.getZoneAnalysis));
router.get('/plots/:zoneId', authenticate, asyncHandler(investor.getPlotInventory));
router.get('/reports', authenticate, asyncHandler(investor.listReports));
router.get('/reports/:reportId/download', authenticate, asyncHandler(investor.downloadReport));
router.post('/email-report', authenticate, asyncHandler(investor.emailReport));
router.get('/generate-report', authenticate, asyncHandler(investor.generateReport));
router.post('/generate-report', authenticate, asyncHandler(investor.generateReport));
router.post('/portfolio-report', authenticate, asyncHandler(investor.generatePortfolioReport));

module.exports = router;
