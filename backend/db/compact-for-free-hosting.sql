-- Builds the compact (~435 MB) LOCATIUM database for free Postgres hosting (Neon / Supabase).
-- Run on a COPY of the full database, never on the original:
--   createdb -T investmap investmap_lean
--   DATABASE_URL=postgres://.../investmap_lean npm run db:migrate   (brings the app tables up to date)
--   psql -d investmap_lean -f db/compact-for-free-hosting.sql
--   pg_dump -Fc -Z 9 --no-owner --no-privileges -d investmap_lean -f backups/locatium-lean.dump
--
-- What it does (every app feature keeps working):
--  1. The two huge count-only layers (1.3 M power-line segments, 330 k transformers) become
--     weighted density points (<table>_density). Scoring counts SUM(weight) instead of
--     COUNT(*); analysis-scoring.service.js switches automatically when the original table is
--     absent. Checked on 371 sample points: every score identical to the full database.
--  2. Layers only drawn on the map (never used in a calculation) are removed from the DB;
--     the map draws them from static PMTiles files (frontend/public/tiles, built by
--     scripts/build-static-tiles.sh) and identifies them in the browser.
--  3. Shapes are snapped to ~10 cm and simplified at ~1 m — below the source data accuracy.

\set ON_ERROR_STOP on

-- 1. density stand-ins (~100 m cells)
CREATE TABLE sec_oh_electric_line_density AS
  SELECT (row_number() OVER ())::int id, ST_SetSRID(ST_MakePoint(avg(ST_X(c)), avg(ST_Y(c))), 4326) geom, count(*)::int weight
  FROM (SELECT ST_Centroid(geom) c FROM sec_oh_electric_line WHERE geom IS NOT NULL) s GROUP BY ST_SnapToGrid(c, 0.001);
CREATE TABLE distribution_transformer_density AS
  SELECT (row_number() OVER ())::int id, ST_SetSRID(ST_MakePoint(avg(ST_X(c)), avg(ST_Y(c))), 4326) geom, count(*)::int weight
  FROM (SELECT ST_Centroid(geom) c FROM distribution_transformer WHERE geom IS NOT NULL) s GROUP BY ST_SnapToGrid(c, 0.001);
ALTER TABLE sec_oh_electric_line_density ADD PRIMARY KEY (id);
ALTER TABLE distribution_transformer_density ADD PRIMARY KEY (id);
CREATE INDEX ON sec_oh_electric_line_density USING gist (geom);
CREATE INDEX ON distribution_transformer_density USING gist (geom);

-- sewerage lines are long and sparse, so a density summary undercounts them: keep the exact
-- shapes but only id + geom (the map shows their details from the static tile file).
DO $$ DECLARE c text; BEGIN
  FOR c IN SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'sewerage_line' AND column_name NOT IN ('id', 'geom') LOOP
    EXECUTE format('ALTER TABLE sewerage_line DROP COLUMN %I', c);
  END LOOP; END $$;

-- 2. map-only layers (served as static PMTiles) and the originals of the density tables
DROP TABLE IF EXISTS sec_oh_electric_line, pri_oh_electric_line, distribution_transformer,
  switch, joint, sewerage_point, open_point, eht_feeder, pri_ug_electric_segment, sec_ug_electric_line,
  habitation_area, assembly_boundary, parliament_boundary, ncr_district, soil_type, soil_depth,
  women_line, ioc_gas_line, delhi_metro_line, rapid_metro_line, proposed_metro_line, bus_bar, generator,
  conduit_system, switching_facility;

-- 3. snap to ~10 cm, drop repeated vertices, simplify at ~1 m
DO $$
DECLARE r record; t text;
BEGIN
  FOR r IN SELECT f_table_name t FROM geometry_columns WHERE f_table_schema = 'public' AND f_geometry_column = 'geom' LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN geom SET COMPRESSION lz4', r.t);
      EXECUTE format('UPDATE %I SET geom = ST_RemoveRepeatedPoints(ST_QuantizeCoordinates(geom, 6)) WHERE geom IS NOT NULL', r.t);
    EXCEPTION WHEN others THEN RAISE NOTICE 'quantize skipped % (%)', r.t, SQLERRM;
    END;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['sewerage_line','village_boundary','roads_line','ponds','lu_lc','low_lying_area','tehsil_boundary','district_boundary',
    'state_boundary','forest_area','controlled_area','licensed_colony','development_plan','municipal_boundary','haryana_rivers',
    'wetlands','canal','water_network','rail_network','hsiidc_boundary','karnal_land_bank'] LOOP
    BEGIN
      EXECUTE format('UPDATE %I SET geom = ST_Multi(ST_SimplifyPreserveTopology(geom, 0.00001)) WHERE geom IS NOT NULL AND GeometryType(geom) LIKE ''MULTI%%''', t);
      EXECUTE format('UPDATE %I SET geom = ST_SimplifyPreserveTopology(geom, 0.00001) WHERE geom IS NOT NULL AND GeometryType(geom) NOT LIKE ''MULTI%%'' AND GeometryType(geom) <> ''POINT''', t);
    EXCEPTION WHEN others THEN RAISE NOTICE 'simplify skipped % (%)', t, SQLERRM;
    END;
  END LOOP;
END $$;

VACUUM FULL ANALYZE;
SELECT pg_size_pretty(pg_database_size(current_database())) AS compact_size;
