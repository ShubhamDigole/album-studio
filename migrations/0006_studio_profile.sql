-- Studio profile, branding and album defaults (filled in by the onboarding steps and the "Your studio" page).
--   npx wrangler d1 execute album_db --local  --file=migrations/0006_studio_profile.sql
--   npx wrangler d1 execute album_db --remote --file=migrations/0006_studio_profile.sql
-- (npm run local adds missing columns by itself.)

ALTER TABLE studios ADD COLUMN tagline TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN instagram TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN facebook TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN youtube TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN logo_key TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN accent TEXT NOT NULL DEFAULT '';
ALTER TABLE studios ADD COLUMN defaults TEXT NOT NULL DEFAULT '{}';
ALTER TABLE studios ADD COLUMN onboarded_at INTEGER;
ALTER TABLE studios ADD COLUMN terms_at INTEGER;
