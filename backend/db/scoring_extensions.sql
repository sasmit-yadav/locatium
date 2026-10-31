-- Scoring v3 extensions: AQI stations, circle rates, transactions, policy RAG corpus
-- Apply via npm run db:migrate (after schema.sql + zone_features.sql)

CREATE TABLE IF NOT EXISTS aqi_stations (
  id SERIAL PRIMARY KEY,
  station_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  aqi INTEGER NOT NULL CHECK (aqi >= 0 AND aqi <= 500),
  pm25 NUMERIC(6, 2),
  category TEXT,
  source TEXT NOT NULL DEFAULT 'cpcb_seed',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  geom GEOMETRY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_aqi_stations_geom ON aqi_stations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_aqi_stations_district ON aqi_stations (district);

INSERT INTO aqi_stations (station_code, name, district, lat, lng, aqi, pm25, category, geom)
VALUES
  ('HR-GGM-01', 'Gurugram Sector 51', 'Gurugram', 28.4200, 77.0500, 156, 78.5, 'Moderate', ST_SetSRID(ST_MakePoint(77.0500, 28.4200), 4326)),
  ('HR-GGM-02', 'Gurugram Vikas Sadan', 'Gurugram', 28.4595, 77.0266, 142, 71.2, 'Moderate', ST_SetSRID(ST_MakePoint(77.0266, 28.4595), 4326)),
  ('HR-FBD-01', 'Faridabad NIT', 'Faridabad', 28.4089, 77.3178, 168, 84.0, 'Moderate', ST_SetSRID(ST_MakePoint(77.3178, 28.4089), 4326)),
  ('HR-PWL-01', 'Palwal Industrial', 'Palwal', 28.1487, 77.3328, 132, 66.0, 'Moderate', ST_SetSRID(ST_MakePoint(77.3328, 28.1487), 4326)),
  ('HR-REW-01', 'Rewari City', 'Rewari', 28.1990, 76.6198, 98, 49.0, 'Satisfactory', ST_SetSRID(ST_MakePoint(76.6198, 28.1990), 4326)),
  ('HR-KNL-01', 'Karnal GT Road', 'Karnal', 29.6857, 76.9905, 118, 59.0, 'Moderate', ST_SetSRID(ST_MakePoint(76.9905, 29.6857), 4326)),
  ('HR-AMB-01', 'Ambala City', 'Ambala', 30.3782, 76.7767, 105, 52.5, 'Moderate', ST_SetSRID(ST_MakePoint(76.7767, 30.3782), 4326)),
  ('HR-HSR-01', 'Hisar Urban', 'Hisar', 29.1492, 75.7217, 121, 60.5, 'Moderate', ST_SetSRID(ST_MakePoint(75.7217, 29.1492), 4326)),
  ('HR-RHT-01', 'Rohtak Bypass', 'Rohtak', 28.8955, 76.6066, 138, 69.0, 'Moderate', ST_SetSRID(ST_MakePoint(76.6066, 28.8955), 4326)),
  ('HR-PNP-01', 'Panipat Refinery Area', 'Panipat', 29.3909, 76.9635, 175, 87.5, 'Moderate', ST_SetSRID(ST_MakePoint(76.9635, 29.3909), 4326))
ON CONFLICT (station_code) DO UPDATE SET
  aqi = EXCLUDED.aqi,
  pm25 = EXCLUDED.pm25,
  category = EXCLUDED.category,
  observed_at = now();

CREATE TABLE IF NOT EXISTS circle_rates (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  tehsil TEXT,
  sector_type TEXT NOT NULL DEFAULT 'industrial',
  rate_per_sq_yard_inr NUMERIC(12, 2) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'haryana_seed'
);

ALTER TABLE circle_rates ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE circle_rates ADD COLUMN IF NOT EXISTS segment TEXT;

CREATE INDEX IF NOT EXISTS idx_circle_rates_district ON circle_rates (district, sector_type);
CREATE INDEX IF NOT EXISTS idx_circle_rates_district_sector_effective
  ON circle_rates (district, sector_type, effective_from DESC);

-- Legacy invent rows (only if table empty). Prefer curated DC CSVs in production.
INSERT INTO circle_rates (district, tehsil, sector_type, rate_per_sq_yard_inr, source)
SELECT d, NULL, s, r, 'haryana_seed' FROM (VALUES
  ('Gurugram', 'industrial', 85000),
  ('Gurugram', 'commercial', 120000),
  ('Gurugram', 'residential', 95000),
  ('Faridabad', 'industrial', 42000),
  ('Faridabad', 'commercial', 65000),
  ('Faridabad', 'residential', 55000),
  ('Karnal', 'industrial', 28000),
  ('Karnal', 'agricultural', 12000),
  ('Panipat', 'industrial', 35000),
  ('Rewari', 'industrial', 32000),
  ('Hisar', 'industrial', 24000),
  ('Rohtak', 'industrial', 26000)
) AS v(d, s, r)
WHERE NOT EXISTS (SELECT 1 FROM circle_rates LIMIT 1);

CREATE TABLE IF NOT EXISTS land_transactions (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  sector_type TEXT NOT NULL DEFAULT 'industrial',
  price_per_sq_yard_inr NUMERIC(12, 2) NOT NULL,
  area_sq_yards NUMERIC(12, 2),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'seed_comparable',
  geom GEOMETRY(Point, 4326)
);

ALTER TABLE land_transactions ADD COLUMN IF NOT EXISTS tehsil TEXT;
ALTER TABLE land_transactions ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE land_transactions ADD COLUMN IF NOT EXISTS deed_id TEXT;
ALTER TABLE land_transactions ADD COLUMN IF NOT EXISTS consideration_inr NUMERIC(14, 2);
ALTER TABLE land_transactions ADD COLUMN IF NOT EXISTS area_unit TEXT;
ALTER TABLE land_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_land_transactions_geom ON land_transactions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_land_transactions_district_sector ON land_transactions (district, sector_type);
CREATE INDEX IF NOT EXISTS idx_land_transactions_date ON land_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_land_transactions_source ON land_transactions (source);

-- Purge invented seed comps; do not re-seed invents when curated/empty table is preferred.
DELETE FROM land_transactions WHERE source = 'seed_comparable';

CREATE TABLE IF NOT EXISTS policy_documents (
  id SERIAL PRIMARY KEY,
  doc_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  sector_tags TEXT[] NOT NULL DEFAULT '{}',
  excerpt TEXT NOT NULL,
  citation TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO policy_documents (doc_key, title, authority, sector_tags, excerpt, citation, keywords)
VALUES
  (
    'hsiidc-allotment-2023',
    'HSIIDC Plot Allotment Policy',
    'HSIIDC',
    ARRAY['industrial'],
    'Industrial plots are allotted through e-auction or direct allotment based on sector priority, project size, and employment generation commitment. CLU from DTCP may be required for non-estate land.',
    'HSIIDC Industrial Policy Handbook §4.2',
    ARRAY['hsiidc', 'allotment', 'industrial', 'clu', 'auction']
  ),
  (
    'haryana-eia-2020',
    'Haryana Environmental Clearance Guidelines',
    'MoEFCC / HSPCB',
    ARRAY['industrial', 'commercial'],
    'Projects within 500m of wetland buffers or in forest fringe zones require Environmental Impact Assessment (EIA) and HSPCB consent before ground-breaking.',
    'Haryana State EC Guidelines 2020 §7.1',
    ARRAY['eia', 'environment', 'forest', 'wetland', 'hspcb']
  ),
  (
    'dtcp-clu-residential',
    'Change of Land Use (CLU) — Residential',
    'DTCP Haryana',
    ARRAY['residential', 'commercial'],
    'CLU from agricultural to residential/commercial use requires application to DTCP with land use plan conformity, road access proof, and utility NOC from DIS/HVPNL where applicable.',
    'DTCP CLU Circular 2019 §3',
    ARRAY['clu', 'dtcp', 'land use', 'residential', 'agricultural']
  ),
  (
    'hvpnl-connection',
    'Industrial Power Connection Norms',
    'HVPNL',
    ARRAY['industrial'],
    'Load above 100 kW requires substation feasibility from HVPNL. Proximity to existing 33/11 kV lines reduces connection timeline and capex.',
    'HVPNL Industrial Supply Code §12',
    ARRAY['power', 'hvpnl', 'substation', 'industrial', 'utility']
  ),
  (
    'water-hsiidc-noc',
    'Water & Sewer NOC for Industrial Units',
    'HSIIDC / PHED',
    ARRAY['industrial'],
    'Units drawing >50 KLD must obtain water NOC; sewer discharge requires ETP compliance certificate before occupation certificate.',
    'HSIIDC Utility NOC Guidelines §2.4',
    ARRAY['water', 'sewer', 'noc', 'industrial', 'etp']
  )
ON CONFLICT (doc_key) DO NOTHING;
