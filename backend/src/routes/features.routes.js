const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const features = require('../controllers/features.controller');

const router = Router();

router.get('/search', asyncHandler(features.searchFeatures));
router.get('/nearby', asyncHandler(features.findNearby));
router.get('/statistics', asyncHandler(features.getLayerStatistics));
router.get('/zone-facilities-summary', asyncHandler(features.getZoneFacilitiesSummary));
router.get('/zone-facilities/:zoneId/:facilityType', asyncHandler(features.getZoneFacilitiesByType));

router.post('/within-bounds', asyncHandler(features.queryWithinBounds));
router.post('/nearest-facility', asyncHandler(features.findNearestFacility));

// Bbox GeoJSON for a single table — requires ?bbox=minLon,minLat,maxLon,maxLat
router.get('/:tableId', asyncHandler(features.getFeaturesByBbox));

router.get('/:layerId/:featureId', asyncHandler(features.getFeatureDetail));

module.exports = router;
