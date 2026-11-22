// PUT    /api/admin/master/page-templates/:key {name, spread, bg, slots, texts, hidden?} -> update a page design (master only)
// DELETE /api/admin/master/page-templates/:key -> delete it; albums that use it fall back to a framed photo layout
import { json, error, readJson, handle } from '../../../../../lib/http.js';
import { cleanTemplate, templateOut } from '../../../../../lib/pages.js';

export const onRequestPut = handle(async ({ request, env, params }) => {
  const b = await readJson(request, 64 * 1024);
  const key = String(params.key);
  const row = await env.DB.prepare('SELECT * FROM page_templates WHERE key = ?').bind(key).first();
  if (!row) return error(404, 'Design not found.');
  // hiding or showing only
  if (Object.keys(b).length === 1 && typeof b.hidden === 'boolean') {
    await env.DB.prepare('UPDATE page_templates SET status = ?, updated_at = ? WHERE key = ?').bind(b.hidden ? 'hidden' : 'active', Date.now(), key).run();
  } else {
    const { name, data } = cleanTemplate(b);
    const status = typeof b.hidden === 'boolean' ? (b.hidden ? 'hidden' : 'active') : row.status;
    await env.DB.prepare('UPDATE page_templates SET name = ?, data = ?, status = ?, updated_at = ? WHERE key = ?').bind(name, JSON.stringify(data), status, Date.now(), key).run();
  }
  return json({ template: templateOut(await env.DB.prepare('SELECT * FROM page_templates WHERE key = ?').bind(key).first()) });
});

export const onRequestDelete = handle(async ({ env, params }) => {
  const res = await env.DB.prepare('DELETE FROM page_templates WHERE key = ?').bind(String(params.key)).run();
  return res.meta.changes ? json({ ok: true }) : error(404, 'Design not found.');
});
