const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const { authenticate } = require('../middleware/auth.middleware');
const investor = require('../controllers/investor.controller');

const router = Router();

router.get('/opportunities', asyncHandler(investor.getOpportunities));
router.get('/zones', asyncHandler(investor.getZones));
router.get('/compare-zones', asyncHandler(investor.compareZones));
router.get('/zone-analysis/:zoneId', asyncHandler(investor.getZoneAnalysis));
router.get('/reports', asyncHandler(investor.listReports));
router.get('/reports/:reportId/download', asyncHandler(investor.downloadReport));
router.post('/email-report', authenticate, asyncHandler(investor.emailReport));
router.get('/generate-report', asyncHandler(investor.generateReport));
router.post('/generate-report', asyncHandler(investor.generateReport));

module.exports = router;
