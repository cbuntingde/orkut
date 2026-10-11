-- Orkut fidelity phase (P1 + P2) and rate-limit housekeeping (P4.1).
--
-- friendship_tier: Orkut categorised friendships by closeness, not just existence.
-- join_policy:    open / approval / closed, which is what gave community owners
--                 real authority over who gets in.
-- rules:          community rules text, always displayed to members.

DO $$ BEGIN CREATE TYPE friendship_tier AS ENUM ('acquaintance','good','best'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE join_policy AS ENUM ('open','approval','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE friendships ADD COLUMN IF NOT EXISTS tier friendship_tier NOT NULL DEFAULT 'acquaintance';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS rules TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS join_policy join_policy NOT NULL DEFAULT 'open';

-- P4.1: rate_limits was created by migrate-rate-limits.sql and grew forever,
-- because a row is inserted on first touch and never removed. Clear anything
-- whose window closed more than a day ago. lib/rate-limit.ts also calls this
-- opportunistically, so running it once here just tidies an existing database.
DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day';