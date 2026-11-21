-- Multi-studio accounts, per-part cover designs and uploaded media.
--   npx wrangler d1 execute album_db --local  --file=migrations/0003_studios_users_media.sql
--   npx wrangler d1 execute album_db --remote --file=migrations/0003_studios_users_media.sql

CREATE TABLE IF NOT EXISTS studios (
  id          TEXT PRIMARY KEY,                 -- slug, e.g. rang-studio
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | active | suspended
  plan        TEXT NOT NULL DEFAULT 'free',     -- for payments later
  created_at  INTEGER NOT NULL,
  approved_at INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,              -- stored lowercase
  name       TEXT NOT NULL DEFAULT '',
  pass_hash  TEXT NOT NULL,                     -- pbkdf2$iterations$salt$hash
  role       TEXT NOT NULL DEFAULT 'owner',     -- master | owner
  studio_id  TEXT,                              -- NULL for the master
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE INDEX IF NOT EXISTS users_studio ON users(studio_id);

ALTER TABLE albums ADD COLUMN studio_id TEXT;
ALTER TABLE albums ADD COLUMN design TEXT NOT NULL DEFAULT '{}';   -- {"cover":{"template","upload","photos"},"back":{…},"endpaper":{…}}
CREATE INDEX IF NOT EXISTS albums_studio ON albums(studio_id);

-- Photos and designed pages uploaded from the admin page (files live in R2).
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  album_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,                     -- photo | page | design
  key        TEXT NOT NULL,                     -- R2 key of the display image
  thumb_key  TEXT NOT NULL DEFAULT '',
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  section    TEXT NOT NULL DEFAULT '',          -- photos: ceremony, e.g. Haldi
  spread     INTEGER NOT NULL DEFAULT 0,        -- pages: 1 = two-page spread
  position   INTEGER NOT NULL DEFAULT 0,
  name       TEXT NOT NULL DEFAULT '',          -- original file name
  bytes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_album ON media(album_id, kind, position);
