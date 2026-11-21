-- Adds the cover template choice to databases created before it existed.
--   npx wrangler d1 execute album_db --local  --file=migrations/0002_album_template.sql
--   npx wrangler d1 execute album_db --remote --file=migrations/0002_album_template.sql
ALTER TABLE albums ADD COLUMN template TEXT NOT NULL DEFAULT '';
