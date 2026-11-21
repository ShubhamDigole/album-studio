// Accounts and signed cookies.
//   - users sign in with email + password (PBKDF2-SHA256, 100,000 iterations, random salt)
//   - the session cookie holds the user id, an expiry and an HMAC-SHA256 signature (secret: ALBUM_SECRET)
//   - the master account is created on first sign-in from MASTER_EMAIL + ADMIN_PASSWORD
//   - the optional guest gate (ALBUM_PASSWORD) uses its own signed cookie
import { getCookie, cookie, HttpError } from './http.js';

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hmacKey(secret) {
  if (!secret || secret.length < 16) throw new HttpError(500, 'Server is missing ALBUM_SECRET (at least 16 characters).');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(secret, data) {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
}

// Constant-time comparison via HMAC of both sides.
export async function safeEqual(secret, a, b) {
  const [x, y] = await Promise.all([sign(secret, 'cmp:' + a), sign(secret, 'cmp:' + b)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function makeToken(secret, scope, maxAgeSeconds) {
  const payload = `${scope}.${Math.floor(Date.now() / 1000) + maxAgeSeconds}`;
  return `${payload}.${await sign(secret, payload)}`;
}
// Returns the scope (e.g. "u42") when the token is valid and unexpired, else null.
export async function readToken(secret, token, scopeRe) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !scopeRe.test(parts[0]) || +parts[1] < Date.now() / 1000) return null;
  return (await safeEqual(secret, parts[2], await sign(secret, `${parts[0]}.${parts[1]}`))) ? parts[0] : null;
}
export async function verifyToken(secret, scope, token) {
  return (await readToken(secret, token, new RegExp('^' + scope + '$'))) === scope;
}

/* ---------- passwords ---------- */
const ITER = 100000;
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`;
}
export async function checkPassword(password, stored, secret) {
  const [kind, iter, salt, hash] = String(stored || '').split('$');
  if (kind !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: +iter }, key, 256);
  return safeEqual(secret, b64(bits), hash);
}

/* ---------- sessions ---------- */
export const SESSION_COOKIE = 'adm';
export const GATE_COOKIE = 'gate';
const SESSION_AGE = 60 * 60 * 12;

export async function sessionCookie(request, env, userId) {
  return cookie(SESSION_COOKIE, await makeToken(env.ALBUM_SECRET, 'u' + userId, SESSION_AGE), { maxAge: SESSION_AGE, sameSite: 'Strict' }, request);
}
export function clearSessionCookie(request) {
  return cookie(SESSION_COOKIE, '', { maxAge: 0, sameSite: 'Strict' }, request);
}

// The signed-in user with their studio, or null. Users of pending or suspended studios count as signed out.
export async function currentUser(request, env) {
  let scope;
  try { scope = await readToken(env.ALBUM_SECRET, getCookie(request, SESSION_COOKIE), /^u\d+$/); } catch { return null; }
  if (!scope) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.studio_id, s.name AS studio_name, s.status AS studio_status,
      s.phone AS studio_phone, s.url AS studio_url, s.city AS studio_city
    FROM users u LEFT JOIN studios s ON s.id = u.studio_id WHERE u.id = ?`).bind(+scope.slice(1)).first();
  if (!row) return null;
  if (row.role !== 'master' && row.studio_status !== 'active') return null;
  return {
    id: row.id, email: row.email, name: row.name, role: row.role, studioId: row.studio_id,
    studio: row.studio_id ? { id: row.studio_id, name: row.studio_name, phone: row.studio_phone, url: row.studio_url, city: row.studio_city } : null,
    isMaster: row.role === 'master',
  };
}

// May this user see / change this album row?
export function canManage(user, row) {
  return !!(user && row && (user.isMaster || (row.studio_id && row.studio_id === user.studioId)));
}

export async function gateCookie(request, env) {
  const maxAge = 60 * 60 * 24 * 60;
  return cookie(GATE_COOKIE, await makeToken(env.ALBUM_SECRET, 'gate', maxAge), { maxAge }, request);
}
