-- Full-quality copies of uploaded photos and pages, used when guests zoom in or download.
--   npx wrangler d1 execute album_db --local  --file=migrations/0004_media_full.sql
--   npx wrangler d1 execute album_db --remote --file=migrations/0004_media_full.sql
-- (npm run local adds missing columns by itself.)

ALTER TABLE media ADD COLUMN full_key TEXT NOT NULL DEFAULT '';
