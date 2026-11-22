// GET /api/admin/page-templates -> page designs made by the master (studios get the active ones; the master also sees hidden ones)
import { json, handle } from '../../../lib/http.js';
import { templateOut } from '../../../lib/pages.js';

export const onRequestGet = handle(async ({ env, data }) => {
  const sql = data.user.isMaster ? 'SELECT * FROM page_templates ORDER BY updated_at DESC' : "SELECT * FROM page_templates WHERE status = 'active' ORDER BY updated_at DESC";
  const { results } = await env.DB.prepare(sql).all();
  return json({ templates: results.map(templateOut) });
});
