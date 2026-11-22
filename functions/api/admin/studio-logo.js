// POST   /api/admin/studio-logo  (multipart: file)  -> store the studio's logo, replacing the old one
// DELETE /api/admin/studio-logo                     -> remove it
// The browser resizes the logo first (PNG, JPEG or WebP, 2 MB at most). It is kept in R2 at s/<studio>/logo-<id>.<ext>
// and served publicly by /media/s/… (studio logos are public branding; see functions/media/[[path]].js).
import { json, error, handle, HttpError } from '../../../lib/http.js';
import { studioProfile } from '../../../lib/studios.js';

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;

// check the file really is the image type it claims to be
function sniff(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);

export const onRequestPost = handle(async ({ request, env, data }) => {
  const sid = data.user.studioId;
  if (!sid) return error(400, 'The master account has no studio profile.');
  if (!env.MEDIA) return error(501, 'Uploads need the R2 bucket (MEDIA binding).');
  const form = await request.formData().catch(() => { throw new HttpError(400, 'Send the logo as a file upload.'); });
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new HttpError(400, 'Choose an image for your logo.');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'Your logo is larger than 2 MB. Use a smaller image.');
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type || !TYPES[type]) throw new HttpError(415, 'Your logo must be a PNG, JPEG or WebP image.');
  const row = await env.DB.prepare('SELECT logo_key FROM studios WHERE id = ?').bind(sid).first();
  if (!row) return error(404, 'Studio not found.');
  const key = `s/${sid}/logo-${newId()}.${TYPES[type]}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  await env.DB.prepare('UPDATE studios SET logo_key = ? WHERE id = ?').bind(key, sid).run();
  if (row.logo_key && row.logo_key.startsWith(`s/${sid}/`)) await env.MEDIA.delete(row.logo_key);
  return json({ ok: true, logo: '/media/' + key, studio: studioProfile(await env.DB.prepare('SELECT * FROM studios WHERE id = ?').bind(sid).first()) }, 201);
});

export const onRequestDelete = handle(async ({ env, data }) => {
  const sid = data.user.studioId;
  if (!sid) return error(400, 'The master account has no studio profile.');
  const row = await env.DB.prepare('SELECT logo_key FROM studios WHERE id = ?').bind(sid).first();
  if (!row) return error(404, 'Studio not found.');
  await env.DB.prepare("UPDATE studios SET logo_key = '' WHERE id = ?").bind(sid).run();
  if (env.MEDIA && row.logo_key && row.logo_key.startsWith(`s/${sid}/`)) await env.MEDIA.delete(row.logo_key);
  return json({ ok: true });
});
