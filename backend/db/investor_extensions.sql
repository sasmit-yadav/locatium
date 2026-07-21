-- Investor tab Phase B: pipeline stages per user/zone
CREATE TABLE IF NOT EXISTS investor_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'discovered'
    CHECK (stage IN ('discovered', 'shortlisted', 'due_diligence', 'negotiation', 'closed', 'passed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_investor_pipeline_user ON investor_pipeline (user_id);
CREATE INDEX IF NOT EXISTS idx_investor_pipeline_stage ON investor_pipeline (stage);

-- Named shortlist portfolios (Phase B)
CREATE TABLE IF NOT EXISTS investor_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_ids TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investor_portfolios_user ON investor_portfolios (user_id);

-- Saved search alert subscriptions (hourly job when INVESTOR_ALERTS_ENABLED=true)
CREATE TABLE IF NOT EXISTS investor_search_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  saved_search_id UUID REFERENCES saved_searches (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  min_score_delta NUMERIC(5, 2) NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  last_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
