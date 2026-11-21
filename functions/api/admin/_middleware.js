// Every /api/admin/* route needs a signed-in user (studio owner or master), except sign-in, sign-up and session.
// The user is passed on as ctx.data.user. /api/admin/master/* additionally needs the master role.
import { error, assertSameOrigin, HttpError } from '../../../lib/http.js';
import { currentUser } from '../../../lib/auth.js';

const PUBLIC = new Set(['/api/admin/login', '/api/admin/session', '/api/admin/signup']);

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);
    const path = new URL(request.url).pathname;
    if (!PUBLIC.has(path)) {
      const user = await currentUser(request, env);
      if (!user) return error(401, 'Sign in first.');
      if (path.startsWith('/api/admin/master/') && !user.isMaster) return error(403, 'Only the master account can do this.');
      ctx.data.user = user;
    }
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.message);
    throw e;
  }
  return next();
}
