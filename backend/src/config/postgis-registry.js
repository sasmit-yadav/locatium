/**
 * Category → PostGIS table mapping (derived from layer-registry).
 * Tables must exist in public schema with geom column (EPSG:4326).
 */

const {
  TABLES_BY_CATEGORY,
  getTablesForCategory,
  listTableIds,
  hasTable,
  getLayerConfig,
} = require('./layer-registry');

function getTablesForLayer(slug) {
  return getTablesForCategory(slug);
}

function hasLayer(slug) {
  return Boolean(TABLES_BY_CATEGORY[slug]);
}

function listLayerKeys() {
  return Object.keys(TABLES_BY_CATEGORY);
}

module.exports = {
  getTablesForLayer,
  hasLayer,
  listLayerKeys,
  getLayerConfig,
  hasTable,
  listTableIds,
  LAYER_TABLES: TABLES_BY_CATEGORY,
};
