-- Brute-force and mass-signup throttle (B7 hardening).
-- One row per (action, scope) key. The counter resets itself once window_start
-- falls outside the window, so no background job is needed.

CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(200) PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Opportunistic cleanup helper: clear expired rows.
CREATE OR REPLACE FUNCTION prune_rate_limits() RETURNS void AS $$
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day';
$$ LANGUAGE sql;