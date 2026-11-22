-- D1 schema for the album site (fresh databases). Safe to run repeatedly.
-- Existing databases: run the files in migrations/ in order instead.
--   local:   npx wrangler d1 execute album_db --local  --file=schema.sql
--   remote:  npx wrangler d1 execute album_db --remote --file=schema.sql

-- One row per album. Photos/pages come from the image pipeline (dist/albums/<id>/album.json);
-- this table holds the details that can be edited online.
CREATE TABLE IF NOT EXISTS albums (
  id               TEXT PRIMARY KEY,                -- URL slug, e.g. aarav-ananya-2026
  type             TEXT NOT NULL DEFAULT 'wedding', -- wedding | engagement | pre-wedding | haldi | mehendi | sangeet | reception | anniversary | birthday | baby-shower | maternity | other
  title            TEXT NOT NULL DEFAULT '',        -- optional; defaults to the names joined with " & "
  names            TEXT NOT NULL DEFAULT '[]',      -- JSON array of names, e.g. ["Aarav","Ananya"]
  event_date       TEXT,                            -- YYYY-MM-DD
  location         TEXT NOT NULL DEFAULT '',
  studio_name      TEXT NOT NULL DEFAULT '',
  studio_phone     TEXT NOT NULL DEFAULT '',
  studio_url       TEXT NOT NULL DEFAULT '',
  music            TEXT NOT NULL DEFAULT '',        -- path or URL of an mp3
  download_url     TEXT NOT NULL DEFAULT '',        -- e.g. Google Drive folder with the originals
  accent           TEXT NOT NULL DEFAULT '',        -- optional #rrggbb override
  template         TEXT NOT NULL DEFAULT '',        -- cover design key ('' = default for the album type)
  design           TEXT NOT NULL DEFAULT '{}',      -- per part: {cover:{template,upload,photos}, back:{…}, endpaper:{…}}
  composed         TEXT NOT NULL DEFAULT '',        -- pages from the page editor: [{t, p:[{m, c}], tx, bg, s} | {gen, text}]
  studio_id        TEXT,                            -- owning studio (NULL = master only)
  status           TEXT NOT NULL DEFAULT 'draft',   -- draft (admins only) | published
  require_approval INTEGER NOT NULL DEFAULT 0,      -- 1 = guestbook messages wait for approval
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guestbook (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  approved   INTEGER NOT NULL DEFAULT 1,
  visitor    TEXT
);
CREATE INDEX IF NOT EXISTS gb_album ON guestbook(album_id, created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  album_id   TEXT NOT NULL,
  photo      TEXT NOT NULL,
  visitor    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (album_id, photo, visitor)
);

CREATE TABLE IF NOT EXISTS views (
  album_id TEXT NOT NULL,
  day      TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, day)
);

CREATE TABLE IF NOT EXISTS rate (
  key      TEXT PRIMARY KEY,
  n        INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS studios (
  id          TEXT PRIMARY KEY,                 -- slug, e.g. rang-studio
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  tagline     TEXT NOT NULL DEFAULT '',          -- one line under the name, e.g. Candid weddings since 2012
  whatsapp    TEXT NOT NULL DEFAULT '',          -- number with country code, e.g. +91 98200 00000
  instagram   TEXT NOT NULL DEFAULT '',          -- full https:// links (handles are turned into links)
  facebook    TEXT NOT NULL DEFAULT '',
  youtube     TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  logo_key    TEXT NOT NULL DEFAULT '',          -- R2 key s/<studio>/logo-<id>.png, public via /media/s/…
  accent      TEXT NOT NULL DEFAULT '',          -- #rrggbb for new albums ('' = each occasion's own colour)
  defaults    TEXT NOT NULL DEFAULT '{}',        -- new albums: {type, template, music, pages:{…}, requireApproval, status}
  onboarded_at INTEGER,                         -- set when the first-time setup is finished or skipped
  terms_at    INTEGER,                          -- when the owner accepted the terms at sign-up
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

CREATE INDEX IF NOT EXISTS albums_studio ON albums(studio_id);

-- Photos and designed pages uploaded from the admin page (files live in R2).
CREATE TABLE IF NOT EXISTS media (
  id         TEXT PRIMARY KEY,
  album_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,                     -- photo | page | design
  key        TEXT NOT NULL,                     -- R2 key of the display image
  full_key   TEXT NOT NULL DEFAULT '',          -- full-quality copy for zoom and download (optional)
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

-- Page designs drawn by the master (built-in designs live in assets/js/page-templates.js)
CREATE TABLE IF NOT EXISTS page_templates (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
