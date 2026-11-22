// GET /api/album/:id -> album JSON for the viewer and gallery:
// built or uploaded pages and photos, merged with the editable details and the studio profile.
import { json, handle } from '../../../lib/http.js';
import { mergeAlbum, getMedia } from '../../../lib/albums.js';
import { loadVisibleAlbum } from '../../../lib/access.js';
import { parseComposed, templatesFor } from '../../../lib/pages.js';
import { PUBLIC_STUDIO_SQL, publicStudio } from '../../../lib/studios.js';

export const onRequestGet = handle(async (ctx) => {
  const { row, staticAlbum } = await loadVisibleAlbum(ctx, ctx.params.id);
  let media = null, studio = null, templates = null;
  if (row) {
    templates = await templatesFor(ctx.env.DB, parseComposed(row));
    media = await getMedia(ctx.env.DB, row.id);
    if (row.studio_id) studio = publicStudio(await ctx.env.DB.prepare(PUBLIC_STUDIO_SQL).bind(row.studio_id).first());   // branding and contact links, never the email
  }
  return json(mergeAlbum(staticAlbum, row, { media, studio, templates }));
});
