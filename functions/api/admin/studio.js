// GET /api/admin/studio  -> the signed-in owner's studio profile
// PUT /api/admin/studio  {name, phone, url, city} -> update it (printed on back covers when an album leaves these empty)
import { json, error, readJson, handle, cleanText, HttpError } from '../../../lib/http.js';

export const onRequestGet = handle(async ({ env, data }) => {
  if (!data.user.studioId) return json({ studio: null });
  return json({ studio: await env.DB.prepare('SELECT id, name, phone, url, city, email, status, plan, created_at FROM studios WHERE id = ?').bind(data.user.studioId).first() });
});

export const onRequestPut = handle(async ({ request, env, data }) => {
  if (!data.user.studioId) return error(400, 'The master account has no studio profile.');
  const b = await readJson(request);
  const name = cleanText(b.name, { min: 2, max: 80, field: 'Studio name' });
  const phone = cleanText(b.phone, { max: 40, field: 'Phone' });
  const url = cleanText(b.url, { max: 300, field: 'Website' });
  const city = cleanText(b.city, { max: 80, field: 'City' });
  if (url && !/^https?:\/\//.test(url)) throw new HttpError(400, 'Website must start with https://');
  await env.DB.prepare('UPDATE studios SET name = ?, phone = ?, url = ?, city = ? WHERE id = ?').bind(name, phone, url, city, data.user.studioId).run();
  return json({ ok: true });
});
