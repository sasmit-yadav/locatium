const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const { authenticate } = require('../middleware/auth.middleware');
const { heavyWorkGuard } = require('../middleware/heavy-work-guard.middleware');
const analysis = require('../controllers/analysis.controller');
const { calculateAcquisitionCost } = require('../services/acquisition-cost.service');
const buyerChecklist = require('../config/buyer-checklist');

const router = Router();

router.post('/score-location', asyncHandler(analysis.scoreLocation));
// Batch scoring costs ~135ms of PostGIS work per point: signed-in callers only, one at a time.
router.post('/score-batch', authenticate, heavyWorkGuard(), asyncHandler(analysis.scoreBatch));
router.get('/forecast', asyncHandler(analysis.forecast));
router.get('/facility-gap', asyncHandler(analysis.getFacilityGap));
// Pure arithmetic over published rates: cheap, so public.
router.post('/acquisition-cost', (req, res) => res.json(calculateAcquisitionCost(req.body || {})));
router.get('/buyer-checklist', (req, res) => {
  const lang = req.query.lang === 'hi' ? 'hi' : 'en';
  res.json({
    lang,
    items: buyerChecklist.map((c) => ({ key: c.key, ...c[lang], url: c.url, portal: c.portal })),
  });
});
router.get('/plot-summary', asyncHandler(analysis.plotSummary));
// One-page "Check my plot" PDF for any point (English or Hindi).
router.get('/plot-report', authenticate, heavyWorkGuard(), asyncHandler(analysis.plotReport));

module.exports = router;
