const { Router } = require('express');
const asyncHandler = require('../middleware/async-handler');
const maps = require('../controllers/maps.controller');

const router = Router();

router.get('/maps/status', asyncHandler(maps.getMapsStatus));

router.get('/tiles/list', asyncHandler(maps.listLayers));

router.get('/tiles/:layer/metadata.json', asyncHandler(maps.getTileMetadata));

router.get('/tiles/:layer/:z/:x/:y.png', asyncHandler(maps.getTile));
router.get('/tiles/:layer/:z/:x/:y.pbf', asyncHandler(maps.getTile));

router.post('/maps/identify', asyncHandler(maps.identifyBatch));

router.get('/maps/:layerKey/info', asyncHandler(maps.getLayerInfo));

router.get('/maps/:layerKey', asyncHandler(maps.getMapGeoJson));

module.exports = router;
