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
  (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cr.rate_per_sq_yard_inr::float8)
    FROM circle_rates cr
    WHERE cr.sector_type = 'industrial'
      AND cr.source <> 'haryana_seed'
      AND (
        LOWER(TRIM(cr.district)) = LOWER(TRIM(z.district))
        OR (
          LOWER(TRIM(z.district)) IN ('gurugram', 'gurgaon')
          AND LOWER(TRIM(cr.district)) IN ('gurugram', 'gurgaon')
        )
        OR (
          LOWER(TRIM(z.district)) IN ('nuh', 'mewat')
          AND LOWER(TRIM(cr.district)) IN ('nuh', 'mewat')
        )
        OR (
          LOWER(TRIM(z.district)) IN ('mahendragarh', 'mahendergarh')
          AND LOWER(TRIM(cr.district)) IN ('mahendragarh', 'mahendergarh')
        )
        OR (
          LOWER(TRIM(z.district)) IN ('hisar')
          AND LOWER(TRIM(cr.district)) IN ('hisar')
        )
      )
      AND cr.effective_from = (
        SELECT MAX(cr2.effective_from)
        FROM circle_rates cr2
        WHERE cr2.sector_type = 'industrial'
          AND cr2.source <> 'haryana_seed'
          AND (
            LOWER(TRIM(cr2.district)) = LOWER(TRIM(z.district))
            OR (
              LOWER(TRIM(z.district)) IN ('gurugram', 'gurgaon')
              AND LOWER(TRIM(cr2.district)) IN ('gurugram', 'gurgaon')
            )
            OR (
              LOWER(TRIM(z.district)) IN ('nuh', 'mewat')
              AND LOWER(TRIM(cr2.district)) IN ('nuh', 'mewat')
            )
            OR (
              LOWER(TRIM(z.district)) IN ('mahendragarh', 'mahendergarh')
              AND LOWER(TRIM(cr2.district)) IN ('mahendragarh', 'mahendergarh')
            )
            OR (
              LOWER(TRIM(z.district)) IN ('hisar')
              AND LOWER(TRIM(cr2.district)) IN ('hisar')
            )
          )
      )
  ) AS circle_rate_median_inr,
  (
    SELECT COUNT(*)::int
    FROM circle_rates cr
    WHERE cr.sector_type = 'industrial'
      AND cr.source <> 'haryana_seed'
      AND (
        LOWER(TRIM(cr.district)) = LOWER(TRIM(z.district))
        OR (
          LOWER(TRIM(z.district)) IN ('gurugram', 'gurgaon')
          AND LOWER(TRIM(cr.district)) IN ('gurugram', 'gurgaon')
        )
        OR (
          LOWER(TRIM(z.district)) IN ('nuh', 'mewat')
          AND LOWER(TRIM(cr.district)) IN ('nuh', 'mewat')
        )
        OR (
          LOWER(TRIM(z.district)) IN ('mahendragarh', 'mahendergarh')
          AND LOWER(TRIM(cr.district)) IN ('mahendragarh', 'mahendergarh')
        )
        OR (
          LOWER(TRIM(z.district)) IN ('hisar')
          AND LOWER(TRIM(cr.district)) IN ('hisar')
        )
      )
      AND cr.effective_from = (
        SELECT MAX(cr2.effective_from)
        FROM circle_rates cr2
        WHERE cr2.sector_type = 'industrial'
          AND cr2.source <> 'haryana_seed'
          AND (
            LOWER(TRIM(cr2.district)) = LOWER(TRIM(z.district))
            OR (
              LOWER(TRIM(z.district)) IN ('gurugram', 'gurgaon')
              AND LOWER(TRIM(cr2.district)) IN ('gurugram', 'gurgaon')
            )
            OR (
              LOWER(TRIM(z.district)) IN ('nuh', 'mewat')
              AND LOWER(TRIM(cr2.district)) IN ('nuh', 'mewat')
            )
            OR (
              LOWER(TRIM(z.district)) IN ('mahendragarh', 'mahendergarh')
              AND LOWER(TRIM(cr2.district)) IN ('mahendragarh', 'mahendergarh')
            )
            OR (
              LOWER(TRIM(z.district)) IN ('hisar')
              AND LOWER(TRIM(cr2.district)) IN ('hisar')
            )
          )
      )
  ) AS circle_rate_sample_count,
  (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lt.price_per_sq_yard_inr::float8)
    FROM land_transactions lt
    WHERE lt.geom IS NOT NULL
      AND lt.sector_type = 'industrial'
      AND lt.source <> 'seed_comparable'
      AND lt.transaction_date >= (CURRENT_DATE - INTERVAL '36 months')
      AND ST_DWithin(
            lt.geom::geography,
            z.centroid::geography,
            10000
          )
  ) AS comps_median_inr,
  (
    SELECT COUNT(*)::int
    FROM land_transactions lt
    WHERE lt.geom IS NOT NULL
      AND lt.sector_type = 'industrial'
      AND lt.source <> 'seed_comparable'
      AND lt.transaction_date >= (CURRENT_DATE - INTERVAL '36 months')
      AND ST_DWithin(
            lt.geom::geography,
            z.centroid::geography,
            10000
          )
  ) AS comps_count,
  now() AS refreshed_at
FROM zones z;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zone_features_zone_id ON zone_features (zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_features_district ON zone_features (district);

-- Bootstrap / refresh labels: spatial signal + attributable land premium when comps exist
INSERT INTO zone_outcomes (zone_id, district, occupancy_rate, price_appreciation, time_to_lease_days, label_score)
SELECT
  zf.zone_id,
  zf.district,
  LEAST(1.0, GREATEST(0.0, (100 - COALESCE(zf.dist_road_km, 20)) / 100.0)) AS occupancy_rate,
  CASE
    WHEN zf.circle_rate_median_inr IS NOT NULL
         AND zf.comps_median_inr IS NOT NULL
         AND zf.circle_rate_median_inr > 0
      THEN LEAST(0.5, GREATEST(-0.25, (zf.comps_median_inr - zf.circle_rate_median_inr) / zf.circle_rate_median_inr))
    ELSE LEAST(0.5, GREATEST(-0.1, (5 - COALESCE(zf.dist_industrial_km, 10)) / 20.0))
  END AS price_appreciation,
  GREATEST(30, LEAST(720, 90 + COALESCE(zf.dist_rail_km, 5)::int * 12)) AS time_to_lease_days,
  LEAST(
    100,
    GREATEST(
      0,
      50
        + CASE WHEN zf.dist_industrial_km IS NOT NULL AND zf.dist_industrial_km < 15 THEN 10 ELSE 0 END
        + LEAST(20, COALESCE(zf.utilities_2km, 0) * 4)
        + LEAST(15, COALESCE(zf.roads_3km, 0))
        + CASE
            WHEN zf.circle_rate_median_inr IS NOT NULL AND zf.comps_median_inr IS NOT NULL AND zf.circle_rate_median_inr > 0
              THEN LEAST(12, GREATEST(-8, ROUND(((zf.comps_median_inr - zf.circle_rate_median_inr) / zf.circle_rate_median_inr) * 40)))
            WHEN zf.circle_rate_median_inr IS NOT NULL THEN 4
            ELSE 0
          END
        - CASE WHEN COALESCE(zf.dist_forest_km, 99) < 3 THEN 15 ELSE 0 END
    )
  )::int AS label_score
FROM zone_features zf
ON CONFLICT (zone_id) DO NOTHING;

-- Keep existing rows land-aware after circle_rates / comps imports (idempotent refresh)
UPDATE zone_outcomes zo SET
  price_appreciation = CASE
    WHEN zf.circle_rate_median_inr IS NOT NULL
         AND zf.comps_median_inr IS NOT NULL
         AND zf.circle_rate_median_inr > 0
      THEN LEAST(0.5, GREATEST(-0.25, (zf.comps_median_inr - zf.circle_rate_median_inr) / zf.circle_rate_median_inr))
    ELSE zo.price_appreciation
  END,
  label_score = LEAST(
    100,
    GREATEST(
      0,
      50
        + CASE WHEN zf.dist_industrial_km IS NOT NULL AND zf.dist_industrial_km < 15 THEN 10 ELSE 0 END
        + LEAST(20, COALESCE(zf.utilities_2km, 0) * 4)
        + LEAST(15, COALESCE(zf.roads_3km, 0))
        + CASE
            WHEN zf.circle_rate_median_inr IS NOT NULL AND zf.comps_median_inr IS NOT NULL AND zf.circle_rate_median_inr > 0
              THEN LEAST(12, GREATEST(-8, ROUND(((zf.comps_median_inr - zf.circle_rate_median_inr) / zf.circle_rate_median_inr) * 40)))
            WHEN zf.circle_rate_median_inr IS NOT NULL THEN 4
            ELSE 0
          END
        - CASE WHEN COALESCE(zf.dist_forest_km, 99) < 3 THEN 15 ELSE 0 END
    )
  )::int,
  recorded_at = now()
FROM zone_features zf
WHERE zo.zone_id = zf.zone_id;
