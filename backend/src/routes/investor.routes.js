const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const { authenticate } = require('../middleware/auth.middleware');
const investor = require('../controllers/investor.controller');

const router = Router();

router.get('/opportunities', asyncHandler(investor.getOpportunities));
router.get('/districts', asyncHandler(investor.listDistricts));
router.get('/zones', asyncHandler(investor.getZones));
router.get('/compare-zones', asyncHandler(investor.compareZones));
router.get('/zone-analysis/:zoneId', asyncHandler(investor.getZoneAnalysis));
router.get('/plots/:zoneId', asyncHandler(investor.getPlotInventory));
router.get('/reports', authenticate, asyncHandler(investor.listReports));
router.get('/reports/:reportId/download', authenticate, asyncHandler(investor.downloadReport));
router.post('/email-report', authenticate, asyncHandler(investor.emailReport));
router.get('/generate-report', authenticate, asyncHandler(investor.generateReport));
router.post('/generate-report', authenticate, asyncHandler(investor.generateReport));
router.post('/portfolio-report', authenticate, asyncHandler(investor.generatePortfolioReport));

module.exports = router;
