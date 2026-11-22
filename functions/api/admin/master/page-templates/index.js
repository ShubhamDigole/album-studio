// POST /api/admin/master/page-templates {name, spread, bg, slots, texts} -> a new page design for every studio (master only)
import { json, readJson, handle } from '../../../../../lib/http.js';
import { cleanTemplate, templateOut } from '../../../../../lib/pages.js';

export const onRequestPost = handle(async ({ request, env, data }) => {
  const { name, data: tpl } = cleanTemplate(await readJson(request, 64 * 1024));
  const key = 'c-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO page_templates (key, name, data, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(key, name, JSON.stringify(tpl), 'active', data.user.email || '', now, now).run();
  return json({ template: templateOut(await env.DB.prepare('SELECT * FROM page_templates WHERE key = ?').bind(key).first()) }, 201);
});
