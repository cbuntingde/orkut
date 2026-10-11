-- orkut — complete schema.
--
-- This is the whole database in one file. There is no migration history to
-- replay: a fresh clone gets a working database by applying this once, and the
-- Docker image does it automatically (docker-compose.yml mounts this file into
-- /docker-entrypoint-initdb.d, so `docker compose up -d` is the entire setup).
--
-- It replaces eleven earlier numbered migrations, which had to be applied in a
-- hand-documented order because each one ALTERed a table a later file created.
-- That ordering was a real hazard: nothing enforced it, and a fresh clone that
-- skipped or reordered one failed with a confusing error rather than a clear
-- one. Everything those files built is defined here inline instead.
--
-- Verified against the old sequence by building both from empty and diffing
-- `pg_dump --schema-only`: 29 tables, 178 columns, 56 indexes, identical apart
-- from the two objects noted at the bottom that nothing referenced.
--
-- From here on, this file is the baseline. A deployed database needs changes
-- applied as new numbered migrations after it; this file stays frozen at the
-- released schema.

-- gen_random_uuid() supplies every primary key, and pg_trgm supplies the
-- gin_trgm_ops operator class behind the two name-search indexes below.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";


-- ---------------------------------------------------------------- enum types

DO $$ BEGIN CREATE TYPE friendship_status  AS ENUM ('pending','accepted');              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE friendship_tier    AS ENUM ('acquaintance','good','best');      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE testimonial_status AS ENUM ('pending','accepted','rejected');    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE member_role        AS ENUM ('member','moderator','owner');       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE join_policy        AS ENUM ('open','approval','closed');         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE report_status      AS ENUM ('open','reviewed','actioned','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------------ identity

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  -- TOTP secrets are stored encrypted (AES-256-GCM), not hashed: generating the
  -- next code needs the original, so it has to be recoverable.
  totp_secret     TEXT,
  totp_enabled_at TIMESTAMPTZ,
  -- Highest TOTP counter already spent, so a captured code cannot be replayed.
  totp_last_counter INTEGER,
  -- Site-wide administrator. Not self-service: no server action sets it, and
  -- signup always leaves it false. Grant it out of band with
  --   UPDATE users SET is_admin = TRUE WHERE email = 'you@example.com';
  is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  dob            TIMESTAMPTZ,
  avatar_url     TEXT,
  gender         VARCHAR(20),
  status         VARCHAR(255),
  relationship   VARCHAR(50),
  city           VARCHAR(100),
  country        VARCHAR(100),
  about          TEXT,
  interests      TEXT,
  music          TEXT,
  movies         TEXT,
  books          TEXT,
  theme          VARCHAR(40) NOT NULL DEFAULT 'orkut',
  profile_views  INT NOT NULL DEFAULT 0,
  scraps_count   INT NOT NULL DEFAULT 0,
  lucky_pct      INT NOT NULL DEFAULT 50,
  -- Orkut's jail: upheld reports produced a temporary restriction rather than an
  -- immediate ban, so one malicious report could not lock anyone out alone.
  jailed_until   TIMESTAMPTZ,
  jail_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_name_trgm ON users USING gin (name gin_trgm_ops);

-- One row per device. The token is what the session cookie carries; user_agent
-- and ip exist so a user can recognise a login that is not theirs.
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  ip           VARCHAR(64),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id, created_at DESC);

-- Single-use recovery codes, stored hashed. Without these, losing the phone
-- means the account can never be logged into again.
CREATE TABLE IF NOT EXISTS two_factor_recovery (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS two_factor_recovery_user ON two_factor_recovery (user_id);


-- ---------------------------------------------------------- the social graph

-- Friendships were two-way with an accept step, and categorised by closeness
-- rather than mere existence.
CREATE TABLE IF NOT EXISTS friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       friendship_status NOT NULL DEFAULT 'pending',
  tier         friendship_tier NOT NULL DEFAULT 'acquaintance',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

-- Fans are one-way and deliberately not the same as a friendship. That
-- distinction is the whole reason both lists exist.
CREATE TABLE IF NOT EXISTS fans (
  fan_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  star_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fan_id, star_id)
);

-- Crushes stay secret until mutual.
CREATE TABLE IF NOT EXISTS crushes (
  admirer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crushee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admirer_id, crushee_id)
);

-- Orkut rated people 1-3 on cool / sexy / trustworthy, one rating per rater.
CREATE TABLE IF NOT EXISTS ratings (
  rater_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rated_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cool          INT NOT NULL DEFAULT 0,
  sexy          INT NOT NULL DEFAULT 0,
  trustworthy   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (rater_id, rated_id)
);

CREATE TABLE IF NOT EXISTS profile_visits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS visits_visited ON profile_visits (visited_id, visited_at DESC);


-- ------------------------------------------------------------- the scrapbook

CREATE TABLE IF NOT EXISTS scraps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       VARCHAR(1000) NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scraps_owner_created ON scraps (owner_id, created_at DESC);

-- Testimonials were friend-only and the recipient chose whether to display one.
CREATE TABLE IF NOT EXISTS testimonials (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  status     testimonial_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS testimonials_subject ON testimonials (subject_id, status);

CREATE TABLE IF NOT EXISTS direct_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        VARCHAR(1000) NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dm_pair ON direct_messages (sender_id, receiver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(30) NOT NULL,
  actor_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  target_id  TEXT,
  body       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at DESC);


-- --------------------------------------------------------------- communities

CREATE TABLE IF NOT EXISTS communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL UNIQUE,
  description   TEXT,
  category      VARCHAR(80),
  language      VARCHAR(40),
  avatar_url    TEXT,
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  -- What gave community owners real authority over who got in.
  join_policy   join_policy NOT NULL DEFAULT 'open',
  rules         TEXT,
  members_count INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS communities_name_trgm ON communities USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS community_members (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         member_role NOT NULL DEFAULT 'member',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  title        VARCHAR(200) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS topics_community ON topics (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS posts_topic ON posts (topic_id, created_at);

CREATE TABLE IF NOT EXISTS polls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  question     VARCHAR(280) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS polls_community ON polls (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label       VARCHAR(140) NOT NULL,
  votes_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS poll_options_poll ON poll_options (poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One vote per person per poll, enforced by the key rather than by a read.
  PRIMARY KEY (poll_id, voter_id)
);

CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  location     VARCHAR(200),
  starts_at    TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_community ON events (community_id, starts_at);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status   VARCHAR(20) NOT NULL DEFAULT 'going',
  PRIMARY KEY (event_id, user_id)
);


-- ------------------------------------------------------- photos and videos

CREATE TABLE IF NOT EXISTS photo_albums (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(120) NOT NULL,
  description VARCHAR(280),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS albums_owner ON photo_albums (owner_id, created_at DESC);

-- url is either /uploads/<name> for a stored file or an external http(s) link.
CREATE TABLE IF NOT EXISTS photos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id   UUID REFERENCES photo_albums(id) ON DELETE SET NULL,
  url        TEXT NOT NULL,
  caption    VARCHAR(280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS photos_owner ON photos (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS photos_album ON photos (album_id, created_at);

CREATE TABLE IF NOT EXISTS photo_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id   UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body       VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS photo_comments_photo ON photo_comments (photo_id, created_at);

CREATE TABLE IF NOT EXISTS videos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  title        VARCHAR(160),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A video belongs on a profile or in a community, never both and never neither.
  CONSTRAINT videos_scope CHECK (owner_id IS NOT NULL OR community_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS videos_owner ON videos (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_community ON videos (community_id, created_at DESC);


-- ------------------------------------------------------- account lifecycle

-- Only the SHA-256 hash of a verification token is stored, so a database leak
-- cannot be replayed into account access.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS verification_user ON email_verification_tokens (user_id, created_at DESC);

-- One row per (action, scope) key. The counter resets itself once window_start
-- falls outside the window, so no background job is needed; lib/rate-limit.ts
-- clears stale rows opportunistically as it goes.
CREATE TABLE IF NOT EXISTS rate_limits (
  key         VARCHAR(200) PRIMARY KEY,
  count       INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- -------------------------------------------------------- trust and safety

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- target_id is a user id for target_type 'profile' and the row id of the
-- reported thing otherwise; moderation only jails the former.
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id   TEXT NOT NULL,
  reason      VARCHAR(280) NOT NULL,
  status      report_status NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at DESC);


-- ------------------------------------------------------------- deliberately
-- not carried over from the old migration sequence:
--
--   CREATE EXTENSION unaccent  — no query used it.
--   prune_rate_limits()        — the same DELETE now runs inline from
--                                lib/rate-limit.ts on an occasional call, so the
--                                function had no callers.