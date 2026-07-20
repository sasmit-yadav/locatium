const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const analysis = require('../controllers/analysis.controller');

const router = Router();

router.post('/score-location', asyncHandler(analysis.scoreLocation));
router.post('/score-batch', asyncHandler(analysis.scoreBatch));

module.exports = router;
