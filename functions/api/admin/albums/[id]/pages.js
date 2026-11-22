// GET    /api/admin/albums/:id/pages             -> { pages | null, templates }   the album's pages from the page editor
// PUT    /api/admin/albums/:id/pages {pages}      -> save them (they replace the automatic layout and uploaded page images)
// DELETE /api/admin/albums/:id/pages             -> back to the automatic layout
import { json, error, readJson, handle, HttpError } from '../../../../../lib/http.js';
import { findManaged } from '../../../../../lib/access.js';
import { cleanComposed, parseComposed, templatesFor } from '../../../../../lib/pages.js';

export const onRequestGet = handle(async ({ env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const pages = parseComposed(row);
  return json({ pages, templates: await templatesFor(env.DB, pages) });
});

export const onRequestPut = handle(async ({ request, env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const b = await readJson(request, 512 * 1024);
  const pages = cleanComposed(b, { albumId: row.id });
  // photos must belong to this album
  const ids = [...new Set(pages.flatMap((p) => (p.v === 2 ? [...p.els.filter((e) => e.type === 'photo').map((e) => e.m), p.bg.m] : (p.p || []).map((x) => x.m))).filter(Boolean))];
  if (ids.length) {
    const { results } = await env.DB.prepare("SELECT id FROM media WHERE album_id = ? AND kind IN ('photo', 'page')").bind(row.id).all();
    const have = new Set(results.map((r) => r.id));
    const missing = ids.filter((id) => !have.has(id));
    if (missing.length) throw new HttpError(409, 'Some photos on these pages were removed. Reload the editor and try again.');
  }
  await env.DB.prepare('UPDATE albums SET composed = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(pages), Date.now(), row.id).run();
  return json({ ok: true, pages: pages.length });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  await env.DB.prepare("UPDATE albums SET composed = '', updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  return json({ ok: true });
});
