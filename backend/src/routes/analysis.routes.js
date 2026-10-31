const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const analysis = require('../controllers/analysis.controller');

const router = Router();

router.post('/score-location', asyncHandler(analysis.scoreLocation));
router.post('/score-batch', asyncHandler(analysis.scoreBatch));
router.get('/forecast', asyncHandler(analysis.forecast));
router.get('/facility-gap', asyncHandler(analysis.getFacilityGap));

module.exports = router;
