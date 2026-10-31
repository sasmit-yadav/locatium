const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const admin = require('../controllers/admin.controller');

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/layer-status', asyncHandler(admin.layerStatus));
router.get('/user-statistics', asyncHandler(admin.userStatistics));
router.get('/data-analytics', asyncHandler(admin.dataAnalytics));
router.get('/model-health', asyncHandler(admin.modelHealth));
router.get('/audit-logs', asyncHandler(admin.auditLogs));

module.exports = router;
