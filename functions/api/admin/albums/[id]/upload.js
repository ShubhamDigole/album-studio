// POST /api/admin/albums/:id/upload   (multipart form)
//   kind=photo   file, thumb, width, height, section, position, name     -> a gallery / auto-layout photo
//   kind=page    file, thumb, width, height, spread, position, name      -> a designed album page (image or PDF page)
//   kind=design  file, part=cover|back|endpaper [, slot=n]               -> your own cover / end page / endpaper, or a photo in a design's slot
// The browser resizes images before upload (which also removes EXIF/GPS); files are stored in R2.
import { json, error, handle, HttpError } from '../../../../../lib/http.js';
import { findManaged } from '../../../../../lib/access.js';

const TYPES = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ITEMS = 3000;

function newId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}
function intField(form, name, def = 0) {
  const n = parseInt(form.get(name), 10);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? n : def;
}
function checkFile(file, label) {
  if (!file || typeof file === 'string') throw new HttpError(400, `${label} is missing.`);
  if (!TYPES[file.type]) throw new HttpError(415, `${label} must be a JPEG, WebP or PNG image.`);
  if (file.size > MAX_BYTES) throw new HttpError(413, `${label} is larger than 15 MB.`);
}

export const onRequestPost = handle(async ({ request, env, params, data }) => {
  if (!env.MEDIA) return error(501, 'Uploads need the R2 bucket (MEDIA binding). See README, "Uploads".');
  const row = await findManaged(env, params.id, data.user);
  if (!row) return error(404, 'Album not found.');
  const form = await request.formData();
  const kind = String(form.get('kind') || '');
  if (!['photo', 'page', 'design'].includes(kind)) throw new HttpError(400, 'Unknown upload kind.');
  const file = form.get('file');
  checkFile(file, 'The image');
  const thumb = form.get('thumb');
  if (thumb && typeof thumb !== 'string') checkFile(thumb, 'The thumbnail');

  const id = newId();
  const ext = TYPES[file.type];
  const key = `a/${row.id}/${kind}/${id}.${ext}`;
  const thumbKey = thumb && typeof thumb !== 'string' ? `a/${row.id}/${kind}/${id}-t.${TYPES[thumb.type]}` : '';
  const put = (k, f) => env.MEDIA.put(k, f.stream(), { httpMetadata: { contentType: f.type, cacheControl: 'private, max-age=31536000, immutable' } });

  if (kind === 'design') {
    const part = String(form.get('part') || '');
    if (!['cover', 'back', 'endpaper'].includes(part)) throw new HttpError(400, 'Choose cover, end page or endpaper.');
    const slotRaw = form.get('slot');
    const slot = slotRaw === null || slotRaw === '' ? null : intField(form, 'slot', -1);
    if (slot !== null && (slot < 0 || slot > 5)) throw new HttpError(400, 'Unknown photo slot.');
    await put(key, file);
    let design = {};
    try { design = JSON.parse(row.design || '{}'); } catch { /* reset */ }
    const d = design[part] || (design[part] = {});
    let old = '';
    if (slot === null) { old = d.upload || ''; d.upload = key; }
    else { d.photos = Array.isArray(d.photos) ? d.photos : []; old = d.photos[slot] || ''; d.photos[slot] = key; }
    await env.DB.prepare('UPDATE albums SET design = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(design), Date.now(), row.id).run();
    // only delete files uploaded for the design; an album photo used as the cover stays
    if (old && old.startsWith(`a/${row.id}/design/`)) await env.MEDIA.delete(old);
    return json({ ok: true, part, slot, url: '/media/' + key }, 201);
  }

  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM media WHERE album_id = ?').bind(row.id).first();
  if (n.n >= MAX_ITEMS) throw new HttpError(409, `An album can hold up to ${MAX_ITEMS} photos and pages.`);
  const width = intField(form, 'width'), height = intField(form, 'height');
  if (!width || !height) throw new HttpError(400, 'Image width and height are missing.');
  const section = String(form.get('section') || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60);
  const name = String(form.get('name') || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160);
  await put(key, file);
  if (thumbKey) await put(thumbKey, thumb);
  await env.DB.prepare(`INSERT INTO media (id, album_id, kind, key, thumb_key, width, height, section, spread, position, name, bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, row.id, kind, key, thumbKey, width, height, kind === 'photo' ? section : '', kind === 'page' && form.get('spread') === '1' ? 1 : 0,
      intField(form, 'position'), name, file.size + (thumb && typeof thumb !== 'string' ? thumb.size : 0), Date.now()).run();
  return json({ ok: true, item: { id, kind, url: '/media/' + key, thumb: '/media/' + (thumbKey || key), width, height, section, name } }, 201);
});
