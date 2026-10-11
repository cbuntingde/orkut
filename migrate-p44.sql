-- P4.4: per-device sessions, TOTP two-factor.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
-- Highest spent TOTP counter, so a captured code cannot be replayed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_counter INTEGER;

-- Single-use recovery codes, stored hashed. Without these, losing the phone
-- means the account can never be logged into again.
CREATE TABLE IF NOT EXISTS two_factor_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS two_factor_recovery_user ON two_factor_recovery (user_id);