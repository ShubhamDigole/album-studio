// POST /api/admin/login {email, password}
// The master account is created on its first sign-in from the MASTER_EMAIL and ADMIN_PASSWORD secrets.
import { json, error, readJson, handle, clientIp, rateLimit, cleanText } from '../../../lib/http.js';
import { safeEqual, hashPassword, checkPassword, sessionCookie } from '../../../lib/auth.js';

export const onRequestPost = handle(async ({ request, env }) => {
  if (!(await rateLimit(env.DB, 'login:' + clientIp(request), 8, 600))) return error(429, 'Too many sign-in attempts. Wait 10 minutes and try again.');
  const body = await readJson(request);
  const email = cleanText(body.email, { max: 120, field: 'Email' }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return error(400, 'Enter your email and password.');

  let user = await env.DB.prepare('SELECT u.*, s.status AS studio_status FROM users u LEFT JOIN studios s ON s.id = u.studio_id WHERE u.email = ?').bind(email).first();
  const masterEmail = (env.MASTER_EMAIL || '').trim().toLowerCase();
  if (!user && masterEmail && email === masterEmail && env.ADMIN_PASSWORD && await safeEqual(env.ALBUM_SECRET, password, env.ADMIN_PASSWORD)) {
    await env.DB.prepare("INSERT INTO users (email, name, pass_hash, role, studio_id, created_at) VALUES (?, 'Master', ?, 'master', NULL, ?)")
      .bind(email, await hashPassword(password), Date.now()).run();
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  }
  if (!user || !(await checkPassword(password, user.pass_hash, env.ALBUM_SECRET))) return error(401, 'That email and password do not match.');
  if (user.role !== 'master') {
    if (user.studio_status === 'pending') return error(403, 'Your studio is waiting for approval. You can sign in as soon as it is approved.');
    if (user.studio_status !== 'active') return error(403, 'This studio account is switched off. Contact the site owner.');
  }
  await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(Date.now(), user.id).run();
  return json({ ok: true, role: user.role }, 200, { 'Set-Cookie': await sessionCookie(request, env, user.id) });
});
