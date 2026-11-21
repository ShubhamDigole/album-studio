// DELETE /api/admin/albums/:id/media/:mid -> remove an uploaded photo or page (database row + R2 files)
// PATCH  /api/admin/albums/:id/media/:mid {spread: true|false} -> one image holds two pages (a spread), or just one page
import { json, error, handle, readJson, HttpError } from '../../../../../../lib/http.js';
import { findManaged } from '../../../../../../lib/access.js';

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const b = await readJson(request);
  if (typeof b.spread !== 'boolean') throw new HttpError(400, 'Say whether the image is two pages (spread: true or false).');
  const res = await env.DB.prepare('UPDATE media SET spread = ? WHERE id = ? AND album_id = ?').bind(b.spread ? 1 : 0, String(params.mid), row.id).run();
  return res.meta.changes ? json({ ok: true, spread: b.spread }) : error(404, 'That photo is gone.');
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const m = await env.DB.prepare('SELECT key, thumb_key, full_key FROM media WHERE id = ? AND album_id = ?').bind(String(params.mid), row.id).first();
  if (!m) return error(404, 'That photo is already gone.');
  await env.DB.prepare('DELETE FROM media WHERE id = ? AND album_id = ?').bind(String(params.mid), row.id).run();
  if (env.MEDIA) await env.MEDIA.delete([m.key, m.thumb_key, m.full_key].filter(Boolean));
  return json({ ok: true });
});
