const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const geocode = require('../controllers/geocode.controller');

const router = Router();

router.get('/geocode/search', asyncHandler(geocode.search));

module.exports = router;
