// GET  /api/guestbook/:id?before=<id>  -> approved messages, newest first, 50 per page
// POST /api/guestbook/:id {name, message} -> add a message (rate limited)
import { json, error, readJson, handle, cleanText, clientIp, rateLimit, visitorId, assertSameOrigin } from '../../../lib/http.js';
import { loadVisibleAlbum } from '../../../lib/access.js';

const PAGE = 50;

export const onRequestGet = handle(async (ctx) => {
  const id = ctx.params.id;
  await loadVisibleAlbum(ctx, id);
  const before = parseInt(new URL(ctx.request.url).searchParams.get('before') || '0', 10);
  const stmt = before > 0
    ? ctx.env.DB.prepare('SELECT id, name, message, created_at FROM guestbook WHERE album_id = ? AND approved = 1 AND id < ? ORDER BY id DESC LIMIT ?').bind(id, before, PAGE + 1)
    : ctx.env.DB.prepare('SELECT id, name, message, created_at FROM guestbook WHERE album_id = ? AND approved = 1 ORDER BY id DESC LIMIT ?').bind(id, PAGE + 1);
  const { results } = await stmt.all();
  return json({ messages: results.slice(0, PAGE), more: results.length > PAGE });
});

export const onRequestPost = handle(async (ctx) => {
  const { request, env, params } = ctx;
  assertSameOrigin(request);
  const { row } = await loadVisibleAlbum(ctx, params.id);
  const body = await readJson(request, 8 * 1024);
  const name = cleanText(body.name, { min: 1, max: 60, field: 'Your name' });
  const message = cleanText(body.message, { min: 1, max: 1000, multiline: true, field: 'Message' });
  const visitor = visitorId(request);
  if (!(await rateLimit(env.DB, `gb:${params.id}:${clientIp(request)}`, 5, 600))) {
    return error(429, 'You have sent several messages in a short time. Wait 10 minutes and try again.');
  }
  const approved = row && row.require_approval ? 0 : 1;
  const now = Date.now();
  const res = await env.DB.prepare('INSERT INTO guestbook (album_id, name, message, created_at, approved, visitor) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(params.id, name, message, now, approved, visitor.id).run();
  const headers = visitor.setCookie ? { 'Set-Cookie': visitor.setCookie } : {};
  return json({ message: { id: res.meta.last_row_id, name, message, created_at: now }, approved: !!approved }, 201, headers);
});
