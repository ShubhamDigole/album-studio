// GET /api/favorites/:id -> { counts: {photoId: n}, mine: [photoId] }
import { json, handle, visitorId } from '../../../lib/http.js';
import { loadVisibleAlbum } from '../../../lib/access.js';

export const onRequestGet = handle(async (ctx) => {
  const { request, env, params } = ctx;
  await loadVisibleAlbum(ctx, params.id);
  const visitor = visitorId(request);
  const [counts, mine] = await Promise.all([
    env.DB.prepare('SELECT photo, COUNT(*) AS n FROM favorites WHERE album_id = ? GROUP BY photo').bind(params.id).all(),
    env.DB.prepare('SELECT photo FROM favorites WHERE album_id = ? AND visitor = ?').bind(params.id, visitor.id).all(),
  ]);
  return json({
    counts: Object.fromEntries(counts.results.map((r) => [r.photo, r.n])),
    mine: mine.results.map((r) => r.photo),
  }, 200, visitor.setCookie ? { 'Set-Cookie': visitor.setCookie } : {});
});
