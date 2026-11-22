-- Album pages made in the page editor, and page designs made by the master.
--   npx wrangler d1 execute album_db --local  --file=migrations/0005_pages_and_templates.sql
--   npx wrangler d1 execute album_db --remote --file=migrations/0005_pages_and_templates.sql
-- (npm run local adds missing columns and tables by itself.)

ALTER TABLE albums ADD COLUMN composed TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS page_templates (
  key        TEXT PRIMARY KEY,                  -- c-xxxxxx (built-in designs live in assets/js/page-templates.js)
  name       TEXT NOT NULL,
  data       TEXT NOT NULL,                     -- {spread, bg, slots:[…], texts:[…]} in fractions of the page
  status     TEXT NOT NULL DEFAULT 'active',    -- active | hidden
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
