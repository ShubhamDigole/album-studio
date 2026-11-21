// GET    /api/admin/guestbook/:albumId          -> every message (incl. hidden / waiting), newest first
// PATCH  /api/admin/guestbook/:messageId {approved: true|false}
// DELETE /api/admin/guestbook/:messageId
// Only for the album's own studio or the master.
import { json, error, readJson, handle } from '../../../../lib/http.js';
import { findManaged } from '../../../../lib/access.js';
import { canManage } from '../../../../lib/auth.js';

export const onRequestGet = handle(async ({ env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const { results } = await env.DB.prepare('SELECT id, name, message, created_at, approved FROM guestbook WHERE album_id = ? ORDER BY id DESC LIMIT 500')
    .bind(row.id).all();
  return json({ messages: results });
});

async function ownMessage(env, params, user) {
  const n = Number(params.id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const msg = await env.DB.prepare('SELECT g.id, a.studio_id FROM guestbook g JOIN albums a ON a.id = g.album_id WHERE g.id = ?').bind(n).first();
  return msg && canManage(user, msg) ? msg : null;
}

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  const msg = await ownMessage(env, params, data.user);
  if (!msg) return error(404, 'Message not found.');
  const { approved } = await readJson(request);
  await env.DB.prepare('UPDATE guestbook SET approved = ? WHERE id = ?').bind(approved ? 1 : 0, msg.id).run();
  return json({ ok: true });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  const msg = await ownMessage(env, params, data.user);
  if (!msg) return error(404, 'Message not found.');
  await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(msg.id).run();
  return json({ ok: true });
});
