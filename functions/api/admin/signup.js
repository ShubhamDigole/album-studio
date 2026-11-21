// POST /api/admin/signup {studioName, name, email, password, phone, city}
// Creates a studio waiting for the master's approval, and its owner account.
import { json, error, readJson, handle, clientIp, rateLimit, cleanText, HttpError } from '../../../lib/http.js';
import { hashPassword } from '../../../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'studio';
}

export const onRequestPost = handle(async ({ request, env }) => {
  if (!(await rateLimit(env.DB, 'signup:' + clientIp(request), 3, 3600))) return error(429, 'Too many sign-ups from this network. Try again in an hour.');
  const b = await readJson(request);
  const studioName = cleanText(b.studioName, { min: 2, max: 80, field: 'Studio name' });
  const name = cleanText(b.name, { min: 1, max: 80, field: 'Your name' });
  const email = cleanText(b.email, { min: 3, max: 120, field: 'Email' }).toLowerCase();
  const phone = cleanText(b.phone, { max: 40, field: 'Phone' });
  const city = cleanText(b.city, { max: 80, field: 'City' });
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 8) throw new HttpError(400, 'Choose a password of at least 8 characters.');
  if (password.length > 200) throw new HttpError(400, 'That password is too long.');
  if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) {
    throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  }
  let id = slugify(studioName), n = 1;
  while (await env.DB.prepare('SELECT id FROM studios WHERE id = ?').bind(id).first()) id = `${slugify(studioName)}-${++n}`;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO studios (id, name, phone, email, city, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)").bind(id, studioName, phone, email, city, now),
    env.DB.prepare("INSERT INTO users (email, name, pass_hash, role, studio_id, created_at) VALUES (?, ?, ?, 'owner', ?, ?)").bind(email, name, await hashPassword(password), id, now),
  ]);
  return json({ ok: true, status: 'pending' }, 201);
});
