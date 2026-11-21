// PATCH /api/admin/master/studios/:id {status: active|suspended|pending}   (master only)
import { json, error, readJson, handle, HttpError } from '../../../../../lib/http.js';

export const onRequestPatch = handle(async ({ request, env, params }) => {
  const { status } = await readJson(request);
  if (!['active', 'suspended', 'pending'].includes(status)) throw new HttpError(400, 'Status must be active, suspended or pending.');
  const res = await env.DB.prepare(`UPDATE studios SET status = ?, approved_at = CASE WHEN ? = 'active' AND approved_at IS NULL THEN ? ELSE approved_at END WHERE id = ?`)
    .bind(status, status, Date.now(), String(params.id)).run();
  return res.meta.changes ? json({ ok: true }) : error(404, 'Studio not found.');
});
