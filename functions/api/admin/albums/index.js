// GET  /api/admin/albums -> the studio's albums (master: every album) with stats and upload summaries,
//                           plus (master only) built albums that have no details yet
// POST /api/admin/albums -> create an album for the user's studio (master: for any studio, body.studioId)
import { json, error, readJson, handle, HttpError } from '../../../../lib/http.js';
import { rowToAlbum, validateAlbumInput, albumParams, getStaticAlbum, designUrls } from '../../../../lib/albums.js';

export const onRequestGet = handle(async ({ request, env, data }) => {
  const user = data.user;
  const scoped = !user.isMaster;
  const where = scoped ? 'WHERE a.studio_id = ?' : '';
  const bind = (stmt) => (scoped ? stmt.bind(user.studioId) : stmt);
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [{ results: rows }, { results: views }, { results: msgs }, { results: favs }, { results: media }] = await Promise.all([
    bind(env.DB.prepare(`SELECT a.*, s.name AS owner_studio FROM albums a LEFT JOIN studios s ON s.id = a.studio_id ${where}
      ORDER BY COALESCE(a.event_date, '') DESC, a.created_at DESC`)).all(),
    env.DB.prepare('SELECT album_id, SUM(count) AS total, SUM(CASE WHEN day >= ? THEN count ELSE 0 END) AS recent FROM views GROUP BY album_id').bind(since).all(),
    env.DB.prepare('SELECT album_id, COUNT(*) AS total, SUM(CASE WHEN approved = 0 THEN 1 ELSE 0 END) AS pending FROM guestbook GROUP BY album_id').all(),
    env.DB.prepare('SELECT album_id, COUNT(*) AS total FROM favorites GROUP BY album_id').all(),
    env.DB.prepare(`SELECT album_id, SUM(kind = 'photo') AS photos, SUM(kind = 'page') AS pages,
      MIN(CASE WHEN kind = 'photo' AND width > height THEN key END) AS cover FROM media GROUP BY album_id`).all(),
  ]);
  const by = (list) => Object.fromEntries(list.map((r) => [r.album_id, r]));
  const v = by(views), m = by(msgs), f = by(favs), md = by(media);

  // albums built locally with tools/build-album.mjs (dist/albums/index.json is written by build-site)
  let built = [];
  try {
    const res = await env.ASSETS.fetch(new URL('/albums/index.json', request.url));
    if (res.ok && (res.headers.get('Content-Type') || '').includes('json')) built = (await res.json()).albums || [];
  } catch { /* no index */ }
  const builtById = Object.fromEntries(built.map((b) => [b.id, b]));

  const albums = rows.map((row) => {
    const up = md[row.id];
    return {
      ...rowToAlbum(row),
      designView: designUrls(rowToAlbum(row).design),
      ownerStudio: row.owner_studio || '',
      stats: {
        views: v[row.id]?.total || 0, views30: v[row.id]?.recent || 0,
        messages: m[row.id]?.total || 0, pending: m[row.id]?.pending || 0, hearts: f[row.id]?.total || 0,
      },
      uploads: up ? { photos: up.photos || 0, pages: up.pages || 0, cover: up.cover ? '/media/' + up.cover : '' } : { photos: 0, pages: 0, cover: '' },
      built: builtById[row.id] || null,
    };
  });
  const unregistered = user.isMaster ? built.filter((b) => !rows.some((r) => r.id === b.id)) : [];
  return json({ albums, unregistered });
});

export const onRequestPost = handle(async ({ request, env, data }) => {
  const user = data.user;
  const body = await readJson(request);
  const a = validateAlbumInput(body, { requireId: true });
  let studioId = user.studioId;
  if (user.isMaster) {
    studioId = body.studioId ? String(body.studioId) : null;
    if (studioId && !(await env.DB.prepare('SELECT id FROM studios WHERE id = ?').bind(studioId).first())) throw new HttpError(400, 'That studio does not exist.');
  }
  if (await env.DB.prepare('SELECT id FROM albums WHERE id = ?').bind(a.id).first()) {
    return error(409, `An album with the link "${a.id}" already exists. Choose another link.`);
  }
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO albums (id, type, title, names, event_date, location, studio_name, studio_phone, studio_url,
      music, download_url, accent, template, status, require_approval, created_at, updated_at, studio_id, design)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(a.id, ...albumParams(a), now, now, studioId, JSON.stringify(sanitizeDesign(body.design)))
    .run();
  const row = await env.DB.prepare('SELECT * FROM albums WHERE id = ?').bind(a.id).first();
  return json({ album: rowToAlbum(row), built: !!(await getStaticAlbum(env, request, a.id)) }, 201);
});

// Only template choices can be set when creating; uploads are attached later.
function sanitizeDesign(d) {
  const out = {};
  for (const part of ['cover', 'back', 'endpaper']) {
    const t = d && d[part] && d[part].template;
    if (typeof t === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(t)) out[part] = { template: t };
  }
  return out;
}
