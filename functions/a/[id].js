// Short share links: /a/<album-id>  ->  /?id=<album-id>   (and /g/<id> for the photo gallery)
import { ALBUM_ID_RE } from '../../lib/http.js';

export function onRequestGet({ request, params }) {
  if (!ALBUM_ID_RE.test(params.id || '')) return new Response('Album not found', { status: 404 });
  return Response.redirect(new URL('/?id=' + params.id + new URL(request.url).hash, request.url).href, 302);
}
