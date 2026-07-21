-- Week 14 feature store: zone-level features + labeled outcomes for model training
-- Apply after schema.sql (via npm run db:migrate)

CREATE TABLE IF NOT EXISTS zone_outcomes (
  zone_id TEXT PRIMARY KEY,
  district TEXT,
  occupancy_rate NUMERIC(5, 4),
  price_appreciation NUMERIC(8, 4),
  time_to_lease_days INTEGER,
  label_score INTEGER CHECK (label_score >= 0 AND label_score <= 100),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zone_outcomes_district ON zone_outcomes (district);

-- Materialized view: one row per HSIIDC zone centroid with proximity + density features
DROP MATERIALIZED VIEW IF EXISTS zone_features;

CREATE MATERIALIZED VIEW zone_features AS
WITH zones AS (
  SELECT
    id::text AS zone_id,
    COALESCE(NULLIF(TRIM(district1), ''), NULLIF(TRIM(pwd_div), ''), 'unknown') AS district,
    ST_Centroid(geom) AS centroid,
    geom
  FROM hsiidc_boundary
  WHERE geom IS NOT NULL
)
SELECT
  z.zone_id,
  z.district,
  ST_Y(z.centroid) AS lat,
  ST_X(z.centroid) AS lng,
  (
    SELECT ST_Distance(z.centroid::geography, r.geom::geography) / 1000.0
    FROM roads_line r
    WHERE r.geom IS NOT NULL
    ORDER BY z.centroid <-> r.geom
    LIMIT 1
  ) AS dist_road_km,
  (
    SELECT ST_Distance(z.centroid::geography, r.geom::geography) / 1000.0
    FROM rail_network r
    WHERE r.geom IS NOT NULL
    ORDER BY z.centroid <-> r.geom
    LIMIT 1
  ) AS dist_rail_km,
  (
    SELECT ST_Distance(z.centroid::geography, a.geom::geography) / 1000.0
    FROM airports a
    WHERE a.geom IS NOT NULL
    ORDER BY z.centroid <-> a.geom
    LIMIT 1
  ) AS dist_airport_km,
  (
    SELECT ST_Distance(z.centroid::geography, h.geom::geography) / 1000.0
    FROM hsiidc_boundary h
    WHERE h.id::text <> z.zone_id AND h.geom IS NOT NULL
    ORDER BY z.centroid <-> h.geom
    LIMIT 1
  ) AS dist_industrial_km,
  (
    SELECT COUNT(*)::int
    FROM hospitals h
    WHERE h.geom IS NOT NULL
      AND ST_DWithin(h.geom, z.centroid, 5000.0 / 111320.0)
  ) AS hospitals_5km,
  (
    SELECT COUNT(*)::int
    FROM (
      SELECT geom FROM govt_school
      UNION ALL SELECT geom FROM pm_shri_and_sanskriti_school
      UNION ALL SELECT geom FROM haryana_police_public_schools_point
    ) s
    WHERE s.geom IS NOT NULL
      AND ST_DWithin(s.geom, z.centroid, 5000.0 / 111320.0)
  ) AS schools_5km,
  (
    SELECT COUNT(*)::int
    FROM water_network w
    WHERE w.geom IS NOT NULL
      AND ST_DWithin(w.geom, z.centroid, 2000.0 / 111320.0)
  ) AS utilities_2km,
  (
    SELECT COUNT(*)::int
    FROM roads_line r
    WHERE r.geom IS NOT NULL
      AND ST_DWithin(r.geom, z.centroid, 3000.0 / 111320.0)
  ) AS roads_3km,
  (
    SELECT ST_Distance(z.centroid::geography, f.geom::geography) / 1000.0
    FROM forest_area f
    WHERE f.geom IS NOT NULL
    ORDER BY z.centroid <-> f.geom
    LIMIT 1
  ) AS dist_forest_km,
  (
    SELECT ST_Distance(z.centroid::geography, l.geom::geography) / 1000.0
    FROM low_lying_area l
    WHERE l.geom IS NOT NULL
    ORDER BY z.centroid <-> l.geom
    LIMIT 1
  ) AS dist_flood_km,
  now() AS refreshed_at
FROM zones z;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zone_features_zone_id ON zone_features (zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_features_district ON zone_features (district);

-- Seed outcomes from existing reports when table is empty (bootstrap labels for training pipeline)
INSERT INTO zone_outcomes (zone_id, district, occupancy_rate, price_appreciation, time_to_lease_days, label_score)
SELECT
  zf.zone_id,
  zf.district,
  LEAST(1.0, GREATEST(0.0, (100 - COALESCE(zf.dist_road_km, 20)) / 100.0)) AS occupancy_rate,
  LEAST(0.5, GREATEST(-0.1, (5 - COALESCE(zf.dist_industrial_km, 10)) / 20.0)) AS price_appreciation,
  GREATEST(30, LEAST(720, 90 + COALESCE(zf.dist_rail_km, 5)::int * 12)) AS time_to_lease_days,
  LEAST(
    100,
    GREATEST(
      0,
      50
        + CASE WHEN zf.dist_industrial_km IS NOT NULL AND zf.dist_industrial_km < 15 THEN 10 ELSE 0 END
        + LEAST(20, COALESCE(zf.utilities_2km, 0) * 4)
        + LEAST(15, COALESCE(zf.roads_3km, 0))
        - CASE WHEN COALESCE(zf.dist_forest_km, 99) < 3 THEN 15 ELSE 0 END
    )
  )::int AS label_score
FROM zone_features zf
ON CONFLICT (zone_id) DO NOTHING;
