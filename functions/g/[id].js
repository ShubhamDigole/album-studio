// /g/<album-id> -> photo gallery
import { ALBUM_ID_RE } from '../../lib/http.js';

export function onRequestGet({ request, params }) {
  if (!ALBUM_ID_RE.test(params.id || '')) return new Response('Album not found', { status: 404 });
  return Response.redirect(new URL('/gallery?id=' + params.id, request.url).href, 302);
}
