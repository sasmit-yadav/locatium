/**
 * Social-infrastructure gap overlay.
 *
 * FORWARD_roadmap Week 19 asked for a facility-gap heatmap. We rank HSIIDC zone
 * centroids by hospitals + schools within 5 km from the existing zone_features
 * materialised view. High gapScore = underserved. No invented counts.
 */

const { getPool } = require('../db/pool');
const { AppError } = require('../middleware/error.middleware');

function classifyGap(facilities5km) {
  const n = Number(facilities5km) || 0;
  if (n <= 0) return 'severe';
  if (n < 3) return 'gap';
  if (n < 8) return 'moderate';
  return 'served';
}

function gapScoreFromCounts(hospitals, schools) {
  const facilities = Math.max(0, Number(hospitals) || 0) + Math.max(0, Number(schools) || 0);
  // Inverse density on a 0–100 scale. 0 facilities → 100; 12+ → ~0.
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-facilities / 4))));
}

function toFeature(row) {
  const hospitals = Number(row.hospitals_5km) || 0;
  const schools = Number(row.schools_5km) || 0;
  const facilities5km = hospitals + schools;
  const gapScore = gapScoreFromCounts(hospitals, schools);
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [Number(row.lng), Number(row.lat)],
    },
    properties: {
      zoneId: row.zone_id,
      district: row.district,
      hospitals5km: hospitals,
      schools5km: schools,
      facilities5km,
      gapScore,
      gapClass: classifyGap(facilities5km),
    },
  };
}

function summarize(features) {
  const counts = { severe: 0, gap: 0, moderate: 0, served: 0 };
  for (const f of features) {
    const klass = f.properties.gapClass;
    if (counts[klass] != null) counts[klass] += 1;
  }
  return {
    zones: features.length,
    ...counts,
    method: 'zone_features_5km_counts',
    note: 'Gap score is inverse hospital+school density within 5 km of HSIIDC zone centroids. It is a screening overlay, not a service-planning model.',
  };
}

async function getFacilityGap({ district, limit = 400 } = {}) {
  const pool = getPool();
  if (!pool) throw AppError.serviceUnavailable('Database is not configured');

  const safeLimit = Math.max(20, Math.min(800, Number(limit) || 400));
  const districtName = typeof district === 'string' && district.trim() ? district.trim() : null;

  try {
    const { rows } = await pool.query(
      `
        SELECT zone_id, district, lat, lng, hospitals_5km, schools_5km
        FROM zone_features
        WHERE lat IS NOT NULL AND lng IS NOT NULL
          AND ($1::text IS NULL OR district ILIKE $1)
        ORDER BY (COALESCE(hospitals_5km, 0) + COALESCE(schools_5km, 0)) ASC,
                 district ASC
        LIMIT $2
      `,
      [districtName, safeLimit]
    );

    const features = rows
      .filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)))
      .map(toFeature);

    return {
      type: 'FeatureCollection',
      features,
      summary: summarize(features),
      district: districtName,
    };
  } catch (err) {
    if (err.code === '42P01') {
      return {
        type: 'FeatureCollection',
        features: [],
        summary: {
          zones: 0,
          severe: 0,
          gap: 0,
          moderate: 0,
          served: 0,
          method: 'unavailable',
          note: 'zone_features is missing. Run db:migrate after GIS restore to enable the facility-gap overlay.',
        },
        district: districtName,
      };
    }
    throw err;
  }
}

module.exports = {
  classifyGap,
  gapScoreFromCounts,
  toFeature,
  getFacilityGap,
};
