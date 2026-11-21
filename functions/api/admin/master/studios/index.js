// GET /api/admin/master/studios -> every studio with its owner, album count, views and storage used (master only)
import { json, handle } from '../../../../../lib/http.js';

export const onRequestGet = handle(async ({ env }) => {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(`SELECT s.*,
      (SELECT email FROM users u WHERE u.studio_id = s.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS owner_email,
      (SELECT name FROM users u WHERE u.studio_id = s.id AND u.role = 'owner' ORDER BY u.id LIMIT 1) AS owner_name,
      (SELECT COUNT(*) FROM albums a WHERE a.studio_id = s.id) AS albums,
      (SELECT COALESCE(SUM(v.count), 0) FROM views v JOIN albums a ON a.id = v.album_id WHERE a.studio_id = s.id AND v.day >= ?) AS views30,
      (SELECT COALESCE(SUM(m.bytes), 0) FROM media m JOIN albums a ON a.id = m.album_id WHERE a.studio_id = s.id) AS bytes
    FROM studios s ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, s.created_at DESC`).bind(since).all();
  return json({ studios: results });
});
