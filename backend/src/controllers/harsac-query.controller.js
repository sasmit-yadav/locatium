const harsacQueryService = require('../services/harsac-query.service');
const { AppError } = require('../middleware/error.middleware');

/**
 * Query features near a point in a specific layer
 * GET /api/harsac/nearby?layer=social-infrastructure&lat=28.48&lng=76.98&radius=5000
 */
async function queryNearby(req, res) {
  const { layer, lat, lng, radius } = req.query;

  if (!layer || !lat || !lng) {
    throw new AppError(400, 'missing_parameters', 'layer, lat, and lng parameters are required');
  }

  const radiusM = radius ? parseFloat(radius) * 1000 : 5000; // Convert km to meters, default 5km

  const { features, cacheHit } = await harsacQueryService.queryFeaturesNearPoint(
    layer,
    lat,
    lng,
    radiusM
  );

  res.json({
    success: true,
    layer,
    center: { lat: parseFloat(lat), lng: parseFloat(lng) },
    radiusMeters: radiusM,
    radiusKm: radiusM / 1000,
    count: features.length,
    cacheHit,
    features
  });
}

/**
 * Query features near a point across multiple layers
 * GET /api/harsac/multi-nearby?lat=28.48&lng=76.98&radius=5&layers=social-infrastructure,transportation,utilities
 */
async function queryMultiNearby(req, res) {
  const { lat, lng, radius, layers } = req.query;

  if (!lat || !lng) {
    throw new AppError(400, 'missing_parameters', 'lat and lng parameters are required');
  }

  // Default to the 3 key layers if not specified
  const layerSlugs = layers 
    ? layers.split(',').map(l => l.trim())
    : ['social-infrastructure', 'transportation', 'utilities'];

  const radiusM = radius ? parseFloat(radius) * 1000 : 5000; // Convert km to meters

  const result = await harsacQueryService.queryMultipleLayersNearPoint(
    layerSlugs,
    lat,
    lng,
    radiusM
  );

  res.json({
    success: true,
    ...result
  });
}

/**
 * Query features within a bounding box
 * GET /api/harsac/in-bbox?layer=social-infrastructure&bbox=76.5,28.0,77.5,29.0
 */
async function queryInBbox(req, res) {
  const { layer, bbox } = req.query;

  if (!layer || !bbox) {
    throw new AppError(400, 'missing_parameters', 'layer and bbox parameters are required');
  }

  const bboxArray = bbox.split(',').map(coord => parseFloat(coord.trim()));
  
  if (bboxArray.length !== 4 || bboxArray.some(isNaN)) {
    throw new AppError(400, 'invalid_bbox', 'bbox must be 4 comma-separated numbers: minLon,minLat,maxLon,maxLat');
  }

  const { features } = await harsacQueryService.queryFeaturesInBbox(layer, bboxArray);

  res.json({
    success: true,
    layer,
    bbox: bboxArray,
    count: features.length,
    features
  });
}

/**
 * Get all features for a layer (paginated)
 * GET /api/harsac/layers/social-infrastructure/features?limit=100&offset=0
 */
async function getLayerFeatures(req, res) {
  const { layer } = req.params;
  const { limit = 100, offset = 0 } = req.query;

  // For getting all features, we'll query a large bbox covering Haryana
  // Haryana approximate bounds: 74.5,27.5,77.5,31.0
  const haryanaBbox = [74.5, 27.5, 77.5, 31.0];
  
  const { features } = await harsacQueryService.queryFeaturesInBbox(layer, haryanaBbox);

  // Apply pagination
  const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
  const offsetNum = Math.max(0, parseInt(offset));
  const paginatedFeatures = features.slice(offsetNum, offsetNum + limitNum);

  res.json({
    success: true,
    layer,
    total: features.length,
    limit: limitNum,
    offset: offsetNum,
    returned: paginatedFeatures.length,
    features: paginatedFeatures
  });
}

module.exports = {
  queryNearby,
  queryMultiNearby,
  queryInBbox,
  getLayerFeatures
};