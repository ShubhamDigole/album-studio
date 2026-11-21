// GET /api/album/:id -> album JSON for the viewer and gallery:
// built or uploaded pages and photos, merged with the editable details and the studio profile.
import { json, handle } from '../../../lib/http.js';
import { mergeAlbum, getMedia } from '../../../lib/albums.js';
import { loadVisibleAlbum } from '../../../lib/access.js';

export const onRequestGet = handle(async (ctx) => {
  const { row, staticAlbum } = await loadVisibleAlbum(ctx, ctx.params.id);
  let media = null, studio = null;
  if (row) {
    media = await getMedia(ctx.env.DB, row.id);
    if (row.studio_id) studio = await ctx.env.DB.prepare('SELECT name, phone, url FROM studios WHERE id = ?').bind(row.studio_id).first();
  }
  return json(mergeAlbum(staticAlbum, row, { media, studio }));
});
