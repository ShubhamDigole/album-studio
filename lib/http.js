// Small helpers shared by the Pages Functions.

export const ALBUM_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const PHOTO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function error(status, message) {
  return json({ error: message }, status);
}

export async function readJson(request, maxBytes = 16 * 1024) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Send JSON (Content-Type: application/json).');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request is too large.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Request body is not valid JSON.'); }
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Wrap a handler so thrown HttpErrors become JSON responses.
export function handle(fn) {
  return async (ctx) => {
    try { return await fn(ctx); }
    catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message);
      console.error(e);
      return error(500, 'Something went wrong on the server.');
    }
  };
}

// Trim, drop control characters (keep newlines in messages), enforce length.
export function cleanText(value, { max, min = 0, multiline = false, field = 'Field' }) {
  let s = typeof value === 'string' ? value : value == null ? '' : String(value);
  s = s.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '').trim();
  if (multiline) s = s.replace(/\n{3,}/g, '\n\n');
  if (s.length < min) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  return s;
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function cookie(name, value, { maxAge, httpOnly = true, sameSite = 'Lax', path = '/' } = {}, request) {
  const secure = request && new URL(request.url).protocol === 'https:';
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

// Reject cross-site state-changing requests (CSRF) by comparing Origin with the request host.
export function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return; // non-browser clients (curl) and same-origin GET navigations
  if (new URL(origin).host !== new URL(request.url).host) throw new HttpError(403, 'Cross-site request blocked.');
}

// Fixed-window rate limit stored in D1. Returns true if allowed.
export async function rateLimit(db, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare('SELECT n, reset_at FROM rate WHERE key = ?').bind(key).first();
  if (!row || row.reset_at <= now) {
    await db.prepare('INSERT INTO rate (key, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET n = 1, reset_at = excluded.reset_at')
      .bind(key, now + windowSeconds).run();
    return true;
  }
  if (row.n >= limit) return false;
  await db.prepare('UPDATE rate SET n = n + 1 WHERE key = ?').bind(key).run();
  return true;
}

// A random visitor id kept in a cookie (used for hearts and guestbook ownership).
export function visitorId(request) {
  const v = getCookie(request, 'v');
  if (v && /^[a-f0-9]{32}$/.test(v)) return { id: v, setCookie: null };
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { id, setCookie: cookie('v', id, { maxAge: 60 * 60 * 24 * 400 }, request) };
}
