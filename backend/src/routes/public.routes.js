const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const publicController = require('../controllers/public.controller');

const router = Router();

router.get('/transparency', asyncHandler(publicController.transparency));
router.get('/zones/:zoneId/card', asyncHandler(publicController.zoneCard));

module.exports = router;
