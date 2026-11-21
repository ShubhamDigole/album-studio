// PUT /api/admin/albums/:id/design {part, template?, removeUpload?, removeSlot?}
// Choose the design for the cover, end page or endpaper, or remove an uploaded image.
import { json, error, readJson, handle, HttpError } from '../../../../../lib/http.js';
import { findManaged } from '../../../../../lib/access.js';
import { designUrls } from '../../../../../lib/albums.js';

export const onRequestPut = handle(async ({ request, env, params, data }) => {
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const b = await readJson(request);
  if (!['cover', 'back', 'endpaper'].includes(b.part)) throw new HttpError(400, 'Choose cover, end page or endpaper.');
  let design = {};
  try { design = JSON.parse(row.design || '{}'); } catch { /* reset */ }
  const d = design[b.part] || (design[b.part] = {});
  const removed = [];
  if (b.template !== undefined) {
    if (b.template && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(b.template))) throw new HttpError(400, 'Choose a design from the list.');
    d.template = b.template ? String(b.template) : '';
    if (d.upload && b.keepUpload !== true) { removed.push(d.upload); delete d.upload; }   // picking a design replaces your own image
  }
  if (b.removeUpload && d.upload) { removed.push(d.upload); delete d.upload; }
  if (b.useMedia) {
    // use an album photo or page as this part, shown as-is (like your own upload)
    const m = await env.DB.prepare("SELECT key FROM media WHERE id = ? AND album_id = ? AND kind IN ('photo', 'page')").bind(String(b.useMedia), row.id).first();
    if (!m) throw new HttpError(404, 'That photo is not in this album.');
    if (d.upload) removed.push(d.upload);
    d.upload = m.key;
  }
  if (Number.isInteger(b.setSlot) && b.setSlot >= 0 && b.setSlot <= 5 && b.mediaId) {
    // use a photo already uploaded to this album
    const m = await env.DB.prepare("SELECT key FROM media WHERE id = ? AND album_id = ? AND kind = 'photo'").bind(String(b.mediaId), row.id).first();
    if (!m) throw new HttpError(404, 'That photo is not in this album.');
    d.photos = Array.isArray(d.photos) ? d.photos : [];
    if (d.photos[b.setSlot]) removed.push(d.photos[b.setSlot]);
    d.photos[b.setSlot] = m.key;
  }
  if (Number.isInteger(b.removeSlot) && Array.isArray(d.photos) && d.photos[b.removeSlot]) { removed.push(d.photos[b.removeSlot]); d.photos[b.removeSlot] = ''; }
  await env.DB.prepare('UPDATE albums SET design = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(design), Date.now(), row.id).run();
  // only files uploaded for the design itself; album photos used in a slot stay
  const own = removed.filter((k) => k.startsWith(`a/${row.id}/design/`));
  if (own.length && env.MEDIA) await env.MEDIA.delete(own);
  return json({ ok: true, design, designView: designUrls(design) });
});
