// PUT /api/admin/albums/:id/order {kind: 'page'|'photo', ids: [...]}
// Saves the order of the album's designed pages (or photos) after dragging them on the admin page.
// The list must hold every page (or photo) of the album exactly once, so a stale browser tab cannot lose items.
import { json, error, readJson, handle, HttpError } from '../../../../../lib/http.js';
import { findManaged } from '../../../../../lib/access.js';

const MAX_ITEMS = 3000;
const ID_RE = /^[a-z0-9]{1,32}$/;

export const onRequestPut = handle(async ({ request, env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const b = await readJson(request, 128 * 1024);
  if (!['page', 'photo'].includes(b.kind)) throw new HttpError(400, 'Say whether you are ordering pages or photos.');
  if (!Array.isArray(b.ids) || b.ids.length > MAX_ITEMS || !b.ids.every((x) => typeof x === 'string' && ID_RE.test(x))) {
    throw new HttpError(400, 'The order must be a list of page ids.');
  }
  const { results } = await env.DB.prepare('SELECT id FROM media WHERE album_id = ? AND kind = ?').bind(row.id, b.kind).all();
  const have = new Set(results.map((r) => r.id));
  if (b.ids.length !== have.size || new Set(b.ids).size !== b.ids.length || !b.ids.every((x) => have.has(x))) {
    throw new HttpError(409, 'The pages changed in another tab. Reload this page and try again.');
  }
  // one statement: each item's position is its index in the JSON list
  await env.DB.prepare(`UPDATE media SET position = (SELECT CAST(j.key AS INTEGER) FROM json_each(?) AS j WHERE j.value = media.id)
      WHERE album_id = ? AND kind = ?`).bind(JSON.stringify(b.ids), row.id, b.kind).run();
  return json({ ok: true });
});
