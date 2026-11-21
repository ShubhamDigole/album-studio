// POST /api/unlock {password} -> sets the signed guest cookie (only used when ALBUM_PASSWORD is set).
import { json, error, readJson, handle, clientIp, rateLimit, assertSameOrigin } from '../../lib/http.js';
import { safeEqual, gateCookie } from '../../lib/auth.js';

export const onRequestPost = handle(async ({ request, env }) => {
  assertSameOrigin(request);
  if (!env.ALBUM_PASSWORD) return json({ ok: true });
  if (!(await rateLimit(env.DB, 'unlock:' + clientIp(request), 10, 600))) return error(429, 'Too many tries. Wait 10 minutes and try again.');
  const { password } = await readJson(request);
  if (typeof password !== 'string' || !(await safeEqual(env.ALBUM_SECRET, password, env.ALBUM_PASSWORD))) {
    return error(401, 'That password did not work.');
  }
  return json({ ok: true }, 200, { 'Set-Cookie': await gateCookie(request, env) });
});
