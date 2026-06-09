/**
 * XYZ tile indices -> Web Mercator bounding box (EPSG:3857).
 *
 * MapLibre/OSM-style raster tiles are drawn in the Web Mercator tile grid.
 * Exporting HARSAC tiles in EPSG:4326 and then placing them into that grid
 * warps the overlay, so ArcGIS export must receive bboxSR/imageSR=3857.
 */

const WEB_MERCATOR_HALF_WORLD = 20037508.342789244;

function xyzToBBox3857(z, x, y) {
  const zNum = Number(z);
  const xNum = Number(x);
  const yNum = Number(y);
  const n = 2 ** zNum;
  const tileSpan = (WEB_MERCATOR_HALF_WORLD * 2) / n;

  return {
    minX: -WEB_MERCATOR_HALF_WORLD + xNum * tileSpan,
    maxX: -WEB_MERCATOR_HALF_WORLD + (xNum + 1) * tileSpan,
    minY: WEB_MERCATOR_HALF_WORLD - (yNum + 1) * tileSpan,
    maxY: WEB_MERCATOR_HALF_WORLD - yNum * tileSpan,
  };
}

module.exports = { xyzToBBox3857 };
