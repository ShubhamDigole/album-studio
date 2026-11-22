// GET /media/a/<album>/<kind>/<file>  -> an uploaded image from R2.
// Same visibility as the album: published albums for guests (behind the optional guest password), drafts for their studio.
// GET /media/s/<studio>/logo-<id>.<ext>  -> a studio's current logo. Logos are public branding (shown to guests);
// only the key saved in the studio's profile is served, so old or made-up keys give 404.
import { handle, error } from '../../lib/http.js';
import { loadVisibleAlbum } from '../../lib/access.js';
import { LOGO_KEY_RE } from '../../lib/studios.js';

const KEY_RE = /^a\/([a-z0-9][a-z0-9-]{1,63})\/(photo|page|design|asset)\/[a-z0-9]{6,20}(-[tf])?\.(jpg|webp|png)$/;   // -t thumbnail, -f full quality

export const onRequestGet = handle(async (ctx) => {
  const { request, env, params } = ctx;
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!env.MEDIA) return error(404, 'Not found.');
  let cache = 'private, max-age=31536000, immutable';
  const logo = LOGO_KEY_RE.exec(key);
  if (logo) {
    const s = await env.DB.prepare('SELECT logo_key FROM studios WHERE id = ?').bind(logo[1]).first();
    if (!s || s.logo_key !== key) return error(404, 'Not found.');
    cache = 'public, max-age=31536000, immutable';   // a new logo gets a new key
  } else {
    const m = KEY_RE.exec(key);
    if (!m) return error(404, 'Not found.');
    await loadVisibleAlbum(ctx, m[1]);
  }
  const etagIn = request.headers.get('If-None-Match');
  const obj = await env.MEDIA.get(key, etagIn ? { onlyIf: { etagDoesNotMatch: etagIn.replace(/"/g, '') } } : undefined);
  if (!obj) return error(404, 'Not found.');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', cache);
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
});
