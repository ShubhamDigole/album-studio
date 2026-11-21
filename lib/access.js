// Decide whether the current visitor may see an album.
import { ALBUM_ID_RE, HttpError } from './http.js';
import { getAlbumRow, getStaticAlbum } from './albums.js';
import { currentUser, canManage } from './auth.js';

// Returns { row, staticAlbum, user } or throws 404. Drafts are visible only to their studio and the master.
export async function loadVisibleAlbum(ctx, id) {
  const { request, env } = ctx;
  if (!ALBUM_ID_RE.test(id || '')) throw new HttpError(404, 'Album not found.');
  const row = await getAlbumRow(env.DB, id);
  let user = null;
  if (row && row.status !== 'published') {
    user = await currentUser(request, env);
    if (!canManage(user, row)) throw new HttpError(404, 'Album not found.');
  }
  if (row && row.studio_id) {
    // albums of a suspended or unapproved studio are offline for guests
    const s = await env.DB.prepare('SELECT status FROM studios WHERE id = ?').bind(row.studio_id).first();
    if (s && s.status !== 'active') {
      user = user || await currentUser(request, env);
      if (!user || !user.isMaster) throw new HttpError(404, 'Album not found.');
    }
  }
  const staticAlbum = await getStaticAlbum(env, request, id);
  if (!row && !staticAlbum) throw new HttpError(404, 'Album not found.');
  return { row, staticAlbum, user };
}

// The album row if the signed-in user may manage it (owning studio or master), else null.
export async function findManaged(env, id, user) {
  if (!ALBUM_ID_RE.test(id || '')) return null;
  const row = await getAlbumRow(env.DB, id);
  return canManage(user, row) ? row : null;
}
