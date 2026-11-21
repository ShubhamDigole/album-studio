// DELETE /api/admin/albums/:id/media/:mid -> remove an uploaded photo or page (database row + R2 files)
import { json, error, handle } from '../../../../../../lib/http.js';
import { findManaged } from '../../../../../../lib/access.js';

export const onRequestDelete = handle(async ({ env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const m = await env.DB.prepare('SELECT key, thumb_key FROM media WHERE id = ? AND album_id = ?').bind(String(params.mid), row.id).first();
  if (!m) return error(404, 'That photo is already gone.');
  await env.DB.prepare('DELETE FROM media WHERE id = ? AND album_id = ?').bind(String(params.mid), row.id).run();
  if (env.MEDIA) await env.MEDIA.delete([m.key, m.thumb_key].filter(Boolean));
  return json({ ok: true });
});
