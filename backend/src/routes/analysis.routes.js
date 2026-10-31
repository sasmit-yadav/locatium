const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const { authenticate } = require('../middleware/auth.middleware');
const { heavyWorkGuard } = require('../middleware/heavy-work-guard.middleware');
const analysis = require('../controllers/analysis.controller');

const router = Router();

router.post('/score-location', asyncHandler(analysis.scoreLocation));
// Batch scoring costs ~135ms of PostGIS work per point: signed-in callers only, one at a time.
router.post('/score-batch', authenticate, heavyWorkGuard(), asyncHandler(analysis.scoreBatch));
router.get('/forecast', asyncHandler(analysis.forecast));
router.get('/facility-gap', asyncHandler(analysis.getFacilityGap));

module.exports = router;
