/**
 * HARSAC MapServer bases — README-aligned HSACGG MapServer REST roots (SSRF-safe slug table).
 * Do not point the proxy at arbitrary URLs; slugs resolve only to this table (SSRF-safe).
 */

/** @type {Record<string, string>} API slug → MapServer REST root (exact strings from README.md) */
const LAYER_BASE_URL = {
  administrative:
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Administrative_Boundaries/MapServer',
  'base-layers':
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Base_Reference_Layers/MapServer',
  constituencies:
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Constituency_Boundaries/MapServer',
  environmental:
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Environmental_Constraints/MapServer',
  cadastral:
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Haryana_Cadastral/MapServer',
  'social-infrastructure':
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Social_Infrastructure/MapServer',
  transportation:
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Transportation_Infrastructure/MapServer',
  utilities:
    'https://hsacggm.in/server/rest/services/MSME_HARSAC/Utilities/MapServer',
};

function resolveLayerBaseUrl(slug) {
  return LAYER_BASE_URL[slug] || null;
}

function listLayerKeys() {
  return Object.keys(LAYER_BASE_URL);
}

module.exports = {
  LAYER_BASE_URL,
  resolveLayerBaseUrl,
  listLayerKeys,
};
