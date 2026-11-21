// GET /api/admin/config -> settings the admin page needs in the browser.
// googleApiKey: a browser key for the Google Drive API (restrict it to the Drive API and your site's address).
import { json } from '../../../lib/http.js';

export function onRequestGet({ env }) {
  return json({ googleApiKey: env.GOOGLE_API_KEY || '' });
}
