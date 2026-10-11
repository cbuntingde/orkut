-- P3 completeness: themes, photo albums, videos, notifications, and the jail
-- system. All idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(40) NOT NULL DEFAULT 'orkut';
ALTER TABLE users ADD COLUMN IF NOT EXISTS jailed_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS jail_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS photo_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS albums_owner ON photo_albums (owner_id, created_at DESC);

ALTER TABLE photos ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES photo_albums(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS photos_album ON photos (album_id, created_at);

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT videos_scope CHECK (owner_id IS NOT NULL OR community_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS videos_owner ON videos (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_community ON videos (community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at DESC);