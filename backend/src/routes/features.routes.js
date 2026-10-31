const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const features = require('../controllers/features.controller');
const { searchPlaces } = require('../services/place-search.service');

const router = Router();

router.get('/search', asyncHandler(features.searchFeatures));
// Ranked place search (villages, hadbast, towns, HSVP sectors and plots). Must stay above '/:tableId'.
router.get(
  '/places',
  asyncHandler(async (req, res) => {
    res.json(await searchPlaces(req.query.q, { limit: req.query.limit }));
  })
);
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
