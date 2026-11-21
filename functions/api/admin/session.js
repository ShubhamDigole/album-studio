// GET /api/admin/session -> { user } (null when signed out)    DELETE -> sign out
import { json } from '../../../lib/http.js';
import { currentUser, clearSessionCookie } from '../../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  let user = null;
  try { user = await currentUser(request, env); } catch { /* missing secret -> signed out */ }
  let pendingStudios = 0;
  if (user && user.isMaster) pendingStudios = (await env.DB.prepare("SELECT COUNT(*) AS n FROM studios WHERE status = 'pending'").first()).n;
  return json({ user, pendingStudios });
}

export async function onRequestDelete({ request }) {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
}
