-- LOCATIUM core schema (PostgreSQL + PostGIS)
-- Apply with: npm run db:migrate (from backend/)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'investor'
    CHECK (role IN ('investor', 'admin', 'public')),
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id);

-- Spatial features (Week 4+ ingestion); geom ready for PostGIS queries
CREATE TABLE IF NOT EXISTS features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id TEXT NOT NULL,
  name TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326)
);

CREATE INDEX IF NOT EXISTS idx_features_layer ON features (layer_id);
CREATE INDEX IF NOT EXISTS idx_features_geom ON features USING GIST (geom);

CREATE TABLE IF NOT EXISTS investor_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT 'industrial',
  recommendation TEXT NOT NULL,
  opportunity_score INTEGER NOT NULL,
  filename TEXT NOT NULL,
  storage_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  content BYTEA,
  file_size_bytes INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investor_reports_zone ON investor_reports (zone_id);
CREATE INDEX IF NOT EXISTS idx_investor_reports_generated ON investor_reports (generated_at DESC);
ALTER TABLE investor_reports ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE investor_reports ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_investor_reports_user ON investor_reports (user_id, generated_at DESC);

-- Saved Searches table (Week 8)
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);

-- Bookmarks/Favorites table (Week 8)
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_zone ON favorites (zone_id);

-- Shared Snapshots table (Week 8 sharing)
CREATE TABLE IF NOT EXISTS shared_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  center_lng DOUBLE PRECISION NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  zoom DOUBLE PRECISION NOT NULL,
  active_layers TEXT[] NOT NULL,
  selected_zone_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shared_snapshots_token ON shared_snapshots (token);

-- Analysis History table (Week 8)
CREATE TABLE IF NOT EXISTS analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  sector TEXT NOT NULL DEFAULT 'industrial',
  overall_score INTEGER,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analysis_history_user ON analysis_history (user_id, created_at DESC);

-- Server-side copilot memory (Ask LOCATIUM). One row per user; session JSON is the same
-- client-held envelope the widget already sends, so either side can hydrate the other.
CREATE TABLE IF NOT EXISTS assistant_memories (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  session JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

