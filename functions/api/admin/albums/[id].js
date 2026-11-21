// GET / PUT / DELETE /api/admin/albums/:id   (only the owning studio or the master)
import { json, error, readJson, handle, HttpError } from '../../../../lib/http.js';
import { rowToAlbum, validateAlbumInput, albumParams, getAlbumRow, getStaticAlbum, designUrls } from '../../../../lib/albums.js';
import { findManaged } from '../../../../lib/access.js';


// GET: details, 30 days of views, the built summary and every uploaded photo / page.
export const onRequestGet = handle(async ({ request, env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const [views, totals, media, studio] = await Promise.all([
    env.DB.prepare('SELECT day, count FROM views WHERE album_id = ? AND day >= ? ORDER BY day').bind(params.id, since).all(),
    env.DB.prepare(`SELECT (SELECT COALESCE(SUM(count), 0) FROM views WHERE album_id = ?1) AS views,
      (SELECT COUNT(*) FROM guestbook WHERE album_id = ?1) AS messages,
      (SELECT COUNT(*) FROM guestbook WHERE album_id = ?1 AND approved = 0) AS pending,
      (SELECT COUNT(*) FROM favorites WHERE album_id = ?1) AS hearts`).bind(params.id).first(),
    env.DB.prepare("SELECT id, kind, key, thumb_key, width, height, section, spread, name, bytes FROM media WHERE album_id = ? AND kind IN ('photo', 'page') ORDER BY position, created_at").bind(params.id).all(),
    row.studio_id ? env.DB.prepare('SELECT id, name, phone, url FROM studios WHERE id = ?').bind(row.studio_id).first() : null,
  ]);
  const built = await getStaticAlbum(env, request, params.id);
  const album = rowToAlbum(row);
  const items = media.results.map((m) => ({ ...m, url: '/media/' + m.key, thumb: '/media/' + (m.thumb_key || m.key) }));
  const firstLandscape = items.find((m) => m.kind === 'photo' && m.width > m.height);
  return json({
    album, designView: designUrls(album.design), studio,
    stats: { ...totals, daily: views.results },
    media: { photos: items.filter((m) => m.kind === 'photo'), pages: items.filter((m) => m.kind === 'page'), cover: firstLandscape ? firstLandscape.url : '' },
    built: built ? { pages: built.pages.reduce((n, p) => n + (p.spread ? 2 : 1), 0), photos: (built.gallery || []).length,
      cover: built.cover ? `/albums/${params.id}/${built.cover}` : '', pageWidth: built.pageWidth, pageHeight: built.pageHeight,
      template: built.template || '' } : null,
  });
});

export const onRequestPut = handle(async ({ request, env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const body = await readJson(request);
  const a = validateAlbumInput(body, { requireId: false });
  let studioId = row.studio_id;
  if (data.user.isMaster && body.studioId !== undefined) {
    studioId = body.studioId ? String(body.studioId) : null;
    if (studioId && !(await env.DB.prepare('SELECT id FROM studios WHERE id = ?').bind(studioId).first())) throw new HttpError(400, 'That studio does not exist.');
  }
  await env.DB.prepare(`UPDATE albums SET type = ?, title = ?, names = ?, event_date = ?, location = ?, studio_name = ?, studio_phone = ?,
      studio_url = ?, music = ?, download_url = ?, accent = ?, template = ?, status = ?, require_approval = ?, updated_at = ?, studio_id = ? WHERE id = ?`)
    .bind(...albumParams(a), Date.now(), studioId, params.id).run();
  return json({ album: rowToAlbum(await getAlbumRow(env.DB, params.id)) });
});

// Deletes the album, its messages, hearts, view counts and uploaded files. Locally built photos in dist/ are not touched.
export const onRequestDelete = handle(async ({ env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  if (env.MEDIA) {
    let cursor;
    do {
      const list = await env.MEDIA.list({ prefix: `a/${params.id}/`, cursor });
      if (list.objects.length) await env.MEDIA.delete(list.objects.map((o) => o.key));
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM guestbook WHERE album_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM favorites WHERE album_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM views WHERE album_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM media WHERE album_id = ?').bind(params.id),
    env.DB.prepare('DELETE FROM albums WHERE id = ?').bind(params.id),
  ]);
  return json({ ok: true });
});
