// GET /api/admin/studio  -> the signed-in owner's studio profile, brand and album defaults
// PUT /api/admin/studio  {name?, tagline?, city?, address?, phone?, whatsapp?, url?, instagram?, facebook?, youtube?,
//                         accent?, defaults?, onboarded?}
//   Only the fields that are sent change (the onboarding steps save one part at a time).
//   onboarded: true marks the first-time setup as finished (or skipped).
//   The profile is printed on back covers when an album leaves its credit empty, and shown to guests in the viewer.
import { json, error, readJson, handle } from '../../../lib/http.js';
import { validateStudioInput, studioProfile } from '../../../lib/studios.js';

const load = (env, id) => env.DB.prepare('SELECT * FROM studios WHERE id = ?').bind(id).first();

export const onRequestGet = handle(async ({ env, data }) => {
  if (!data.user.studioId) return json({ studio: null });
  return json({ studio: studioProfile(await load(env, data.user.studioId)) });
});

export const onRequestPut = handle(async ({ request, env, data }) => {
  if (!data.user.studioId) return error(400, 'The master account has no studio profile.');
  const b = await readJson(request);
  const v = validateStudioInput(b);
  const sets = Object.keys(v).map((k) => `${k} = ?`);
  const binds = Object.values(v);
  if (b.onboarded === true) sets.push('onboarded_at = COALESCE(onboarded_at, ?)'), binds.push(Date.now());
  if (sets.length) await env.DB.prepare(`UPDATE studios SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, data.user.studioId).run();
  return json({ ok: true, studio: studioProfile(await load(env, data.user.studioId)) });
});
