// POST   /api/favorite/:id/:photo -> heart a photo
// DELETE /api/favorite/:id/:photo -> remove the heart
import { json, error, handle, PHOTO_ID_RE, clientIp, rateLimit, visitorId, assertSameOrigin } from '../../../../lib/http.js';
import { loadVisibleAlbum } from '../../../../lib/access.js';

async function toggle(ctx, add) {
  const { request, env, params } = ctx;
  assertSameOrigin(request);
  if (!PHOTO_ID_RE.test(params.photo || '')) return error(400, 'Unknown photo.');
  await loadVisibleAlbum(ctx, params.id);
  if (!(await rateLimit(env.DB, `fav:${clientIp(request)}`, 120, 600))) return error(429, 'Too many hearts at once. Try again in a few minutes.');
  const visitor = visitorId(request);
  if (add) {
    await env.DB.prepare('INSERT OR IGNORE INTO favorites (album_id, photo, visitor, created_at) VALUES (?, ?, ?, ?)')
      .bind(params.id, params.photo, visitor.id, Date.now()).run();
  } else {
    await env.DB.prepare('DELETE FROM favorites WHERE album_id = ? AND photo = ? AND visitor = ?').bind(params.id, params.photo, visitor.id).run();
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM favorites WHERE album_id = ? AND photo = ?').bind(params.id, params.photo).first();
  return json({ photo: params.photo, count: row.n, mine: add }, 200, visitor.setCookie ? { 'Set-Cookie': visitor.setCookie } : {});
}

export const onRequestPost = handle((ctx) => toggle(ctx, true));
export const onRequestDelete = handle((ctx) => toggle(ctx, false));
