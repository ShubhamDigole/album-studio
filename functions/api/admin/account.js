// PUT /api/admin/account {currentPassword, newPassword} -> change your password
import { json, error, readJson, handle, HttpError } from '../../../lib/http.js';
import { checkPassword, hashPassword } from '../../../lib/auth.js';

export const onRequestPut = handle(async ({ request, env, data }) => {
  const { currentPassword, newPassword } = await readJson(request);
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw new HttpError(400, 'Choose a new password of at least 8 characters.');
  const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(data.user.id).first();
  if (!row || !(await checkPassword(String(currentPassword || ''), row.pass_hash, env.ALBUM_SECRET))) return error(401, 'Your current password is not correct.');
  await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(await hashPassword(newPassword), data.user.id).run();
  return json({ ok: true });
});
