-- Idempotent account tables. Applied automatically at API start (src/db/ensure-account-schema.js)
-- and also part of schema.sql via db:migrate.
-- ── Real user accounts (ship readiness) ─────────────────────────────────────
-- Email verification + one-time tokens for verify-email and password reset.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens (user_id, purpose, created_at DESC);

-- Per-user daily counters for costly actions (LLM calls, report emails).
CREATE TABLE IF NOT EXISTS user_daily_usage (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
