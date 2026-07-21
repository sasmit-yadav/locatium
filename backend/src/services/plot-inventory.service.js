/**
 * Plot-level inventory inside investor zones (HSVP, land bank, nearby parcels).
 */

const { getPool } = require('../db/pool');
const { retrievePolicyContext } = require('./policy-rag.service');
const { normalizeSector } = require('./scoring-engine');

const PLOT_SOURCES = [
  {
    table: 'hsvp_plots',
    label: 'HSVP plot',
    districtExpr: `COALESCE(NULLIF(TRIM(district), ''), '')`,
    statusField: null,
    title: (r) => `Plot ${r.plot_no || r.id}, Sector ${r.sector || '—'}`,
    areaSqm: (r) => Number(r.area_sqm) || (Number(r.shape_area) ? Number(r.shape_area) : null),
    sectorFilter: (sector) => {
      const s = normalizeSector(sector);
      if (s === 'industrial') return `(parcel_subtype ILIKE '%industrial%' OR parcel_subtype ILIKE '%institution%')`;
      if (s === 'commercial') return `(parcel_subtype ILIKE '%commercial%' OR parcel_subtype ILIKE '%institution%')`;
      if (s === 'residential') return `(parcel_subtype ILIKE '%residential%' OR parcel_subtype ILIKE '%commercial%')`;
      return 'TRUE';
    },
  },
  {
    table: 'karnal_land_bank',
    label: 'Land bank parcel',
    districtExpr: `COALESCE(NULLIF(TRIM(n_d_name), ''), NULLIF(TRIM(district), ''), '')`,
    statusField: 'category',
    title: (r) => `Khasra ${r.n_khas_no || r.id} · ${r.n_v_name || ''}`.trim(),
    areaSqm: (r) => (Number(r.area_acres) ? Number(r.area_acres) * 4046.8564224 : Number(r.shape_area) || null),
    sectorFilter: () => 'TRUE',
  },
];

function normalizePlotStatus(raw, table) {
  const s = String(raw || '').toLowerCase();
  if (!raw) return table === 'hsvp_plots' ? 'listed' : 'unknown';
  if (/vacant|available|open|unsold|for sale/i.test(s)) return 'available';
  if (/allot|occupied|leased|sold|allotted/i.test(s)) return 'allotted';
  if (/clu|under process|pending/i.test(s)) return 'under_clu';
  return 'unknown';
}

function zoneAnchor(zone) {
  if (zone.geometry?.type === 'Polygon' || zone.geometry?.type === 'MultiPolygon') {
    return { mode: 'geom', value: JSON.stringify(zone.geometry) };
  }
  if (zone.center?.lat != null && zone.center?.lng != null) {
    return { mode: 'point', lat: zone.center.lat, lng: zone.center.lng };
  }
  return null;
}

async function queryPlotsIntersect(pool, source, zone) {
  const anchor = zoneAnchor(zone);
  if (!anchor || anchor.mode !== 'geom') return [];

  try {
    const { rows } = await pool.query(
      `
        SELECT *
        FROM ${source.table}
        WHERE geom IS NOT NULL
          AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
        ORDER BY COALESCE(area_sqm, shape_area, 0) DESC NULLS LAST
        LIMIT 40
      `,
      [anchor.value]
    );
    return rows;
  } catch {
    return [];
  }
}

async function queryPlotsNearby(pool, source, zone, sector, radiusM = 12000) {
  const anchor = zoneAnchor(zone);
  if (!anchor) return [];

  const district = (zone.district || '').trim();
  const sectorSql = source.sectorFilter ? source.sectorFilter(sector) : 'TRUE';
  const districtCol = source.districtExpr || `COALESCE(NULLIF(TRIM(district), ''), '')`;

  try {
    if (anchor.mode === 'geom') {
      const { rows } = await pool.query(
        `
          SELECT *, ST_Distance(
            geom::geography,
            ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography
          ) / 1000.0 AS distance_km
          FROM ${source.table}
          WHERE geom IS NOT NULL
            AND ${sectorSql}
            AND ($3 = '' OR LOWER(${districtCol}) LIKE LOWER($3) || '%'
                 OR LOWER($3) LIKE LOWER(${districtCol}) || '%')
            AND ST_DWithin(
              geom::geography,
              ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography,
              $2
            )
          ORDER BY distance_km ASC, COALESCE(area_sqm, shape_area, 0) DESC NULLS LAST
          LIMIT 40
        `,
        [anchor.value, radiusM, district]
      );
      return rows;
    }

    const { rows } = await pool.query(
      `
        SELECT *, ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) / 1000.0 AS distance_km
        FROM ${source.table}
        WHERE geom IS NOT NULL
          AND ${sectorSql}
          AND ($4 = '' OR LOWER(${districtCol}) LIKE LOWER($4) || '%'
               OR LOWER($4) LIKE LOWER(${districtCol}) || '%')
          AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        ORDER BY distance_km ASC, COALESCE(area_sqm, shape_area, 0) DESC NULLS LAST
        LIMIT 40
      `,
      [anchor.lng, anchor.lat, radiusM, district]
    );
    return rows;
  } catch {
    return [];
  }
}

function mapPlotRow(source, row, zone) {
  return {
    id: `${source.table}:${row.id}`,
    tableId: source.table,
    plotId: row.plot_no || row.objectid || row.id,
    name: source.title(row),
    label: source.label,
    areaSqm: source.areaSqm(row),
    areaAcres: source.areaSqm(row) ? source.areaSqm(row) / 4046.8564224 : null,
    distanceKm: row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : null,
    status: normalizePlotStatus(source.statusField ? row[source.statusField] : row.parcel_subtype, source.table),
    statusLabel: source.statusField ? row[source.statusField] : row.parcel_subtype || 'Listed',
    district: row.district || row.n_d_name || zone.district,
    properties: {
      sector: row.sector,
      parcel_subtype: row.parcel_subtype,
      category: row.category,
      estate: row.estate,
    },
  };
}

async function queryPlotsByDistrict(pool, source, zone, sector, limit = 40) {
  const district = (zone.district || '').trim();
  if (!district) return [];

  const sectorSql = source.sectorFilter ? source.sectorFilter(sector) : 'TRUE';
  const districtCol = source.districtExpr || `COALESCE(NULLIF(TRIM(district), ''), '')`;
  const anchor = zoneAnchor(zone);

  try {
    if (anchor?.mode === 'point') {
      const { rows } = await pool.query(
        `
          SELECT *, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0 AS distance_km
          FROM ${source.table}
          WHERE geom IS NOT NULL AND ${sectorSql}
            AND LOWER(${districtCol}) LIKE LOWER($3) || '%'
          ORDER BY distance_km ASC, COALESCE(area_sqm, shape_area, 0) DESC NULLS LAST
          LIMIT $4
        `,
        [anchor.lng, anchor.lat, district, limit]
      );
      return rows;
    }
    if (anchor?.mode === 'geom') {
      const { rows } = await pool.query(
        `
          SELECT *, ST_Distance(
            geom::geography,
            ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography
          ) / 1000.0 AS distance_km
          FROM ${source.table}
          WHERE geom IS NOT NULL AND ${sectorSql}
            AND LOWER(${districtCol}) LIKE LOWER($2) || '%'
          ORDER BY distance_km ASC, COALESCE(area_sqm, shape_area, 0) DESC NULLS LAST
          LIMIT $3
        `,
        [anchor.value, district, limit]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `
        SELECT *, NULL::float AS distance_km
        FROM ${source.table}
        WHERE geom IS NOT NULL AND ${sectorSql}
          AND LOWER(${districtCol}) LIKE LOWER($1) || '%'
        ORDER BY COALESCE(area_sqm, shape_area, 0) DESC NULLS LAST
        LIMIT $2
      `,
      [district, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

async function queryPlotsInZone(pool, source, zone, sector) {
  let rows = await queryPlotsIntersect(pool, source, zone);
  let matchMode = rows.length ? 'intersect' : 'none';

  if (!rows.length) {
    const radiusM = zone.tableId === 'hsiidc_boundary' ? 20000 : 8000;
    rows = await queryPlotsNearby(pool, source, zone, sector, radiusM);
    if (rows.length) matchMode = 'nearby';
  }

  if (!rows.length && zone.district) {
    rows = await queryPlotsNearby(pool, source, { ...zone, district: '' }, sector, 25000);
    if (rows.length) matchMode = 'nearby';
  }

  if (!rows.length && zone.tableId === 'hsiidc_boundary' && zone.district) {
    rows = await queryPlotsByDistrict(pool, source, zone, sector);
    if (rows.length) matchMode = 'district';
  }

  return {
    plots: rows.map((row) => mapPlotRow(source, row, zone)),
    matchMode,
  };
}

async function getPlotInventoryForZone(zone, sector = 'industrial') {
  const pool = getPool();
  if (!pool) return { count: 0, plots: [], summary: null, policyLinks: [], matchMode: 'unavailable' };

  const batches = await Promise.all(PLOT_SOURCES.map((source) => queryPlotsInZone(pool, source, zone, sector)));
  const matchModes = batches.map((b) => b.matchMode);

  if (zone.tableId === 'karnal_land_bank' && zone.featureId) {
    batches.push({
      plots: [
        {
          id: zone.id,
          plotId: zone.properties?.n_khas_no || zone.featureId,
          name: zone.name,
          label: 'Land bank parcel',
          areaSqm: zone.areaSqm,
          areaAcres: zone.areaAcres,
          status: normalizePlotStatus(zone.properties?.category, 'karnal_land_bank'),
          statusLabel: zone.properties?.category || 'Land bank',
          district: zone.district,
        },
      ],
      matchMode: 'self',
    });
    matchModes.push('self');
  }

  const plots = batches.flatMap((b) => b.plots);
  const available = plots.filter((p) => p.status === 'available').length;
  const allotted = plots.filter((p) => p.status === 'allotted').length;
  const aggregateMatchMode = matchModes.includes('intersect')
    ? 'intersect'
    : matchModes.includes('nearby')
      ? 'nearby'
      : matchModes.includes('self')
        ? 'self'
        : 'none';

  const policyLinks = await retrievePolicyContext({
    sector,
    keywords: ['auction', 'allotment', 'hsiidc', 'e-auction', zone.district],
    limit: 3,
  });

  return {
    count: plots.length,
    plots,
    matchMode: aggregateMatchMode,
    summary: {
      total: plots.length,
      available,
      allotted,
      unknown: plots.length - available - allotted,
      aggregateStatus:
        available > 0 ? 'available' : allotted > plots.length / 2 ? 'mostly_allotted' : plots.length ? 'mixed' : 'boundary_only',
    },
    policyLinks: policyLinks.map((p) => ({ title: p.title, citation: p.citation, excerpt: p.excerpt?.slice(0, 180) })),
  };
}

module.exports = { getPlotInventoryForZone, normalizePlotStatus };
