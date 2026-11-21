// POST /api/view/:id -> count one view per visitor IP per album per day
import { json, handle, clientIp, rateLimit } from '../../../lib/http.js';
import { loadVisibleAlbum } from '../../../lib/access.js';

export const onRequestPost = handle(async (ctx) => {
  const { request, env, params } = ctx;
  await loadVisibleAlbum(ctx, params.id);
  const day = new Date().toISOString().slice(0, 10);
  if (await rateLimit(env.DB, `view:${params.id}:${day}:${clientIp(request)}`, 1, 60 * 60 * 24)) {
    await env.DB.prepare('INSERT INTO views (album_id, day, count) VALUES (?, ?, 1) ON CONFLICT(album_id, day) DO UPDATE SET count = count + 1')
      .bind(params.id, day).run();
  }
  return json({ ok: true });
});
