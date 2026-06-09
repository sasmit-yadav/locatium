const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const harsacQuery = require('../controllers/harsac-query.controller');

const router = Router();

/**
 * @route   GET /api/harsac/nearby
 * @desc    Query features near a point in a specific layer
 * @query   layer - Layer slug (e.g., social-infrastructure)
 * @query   lat - Latitude
 * @query   lng - Longitude
 * @query   radius - Search radius in km (default: 5)
 */
router.get('/nearby', asyncHandler(harsacQuery.queryNearby));

/**
 * @route   GET /api/harsac/multi-nearby
 * @desc    Query features near a point across multiple layers
 * @query   lat - Latitude
 * @query   lng - Longitude
 * @query   radius - Search radius in km (default: 5)
 * @query   layers - Comma-separated layer slugs (default: social-infrastructure,transportation,utilities)
 */
router.get('/multi-nearby', asyncHandler(harsacQuery.queryMultiNearby));

/**
 * @route   GET /api/harsac/in-bbox
 * @desc    Query features within a bounding box
 * @query   layer - Layer slug
 * @query   bbox - Bounding box as minLon,minLat,maxLon,maxLat
 */
router.get('/in-bbox', asyncHandler(harsacQuery.queryInBbox));

/**
 * @route   GET /api/harsac/layers/:layer/features
 * @desc    Get paginated features for a layer (covers entire Haryana)
 * @param   layer - Layer slug
 * @query   limit - Number of features per page (max 500, default 100)
 * @query   offset - Pagination offset (default 0)
 */
router.get('/layers/:layer/features', asyncHandler(harsacQuery.getLayerFeatures));

module.exports = router;