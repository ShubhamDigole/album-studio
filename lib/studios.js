// Studio profiles: validation of what owners type (onboarding and the "Your studio" page),
// the shapes sent to the admin and to guests, and the defaults used for new albums.
import { HttpError, cleanText } from './http.js';
import { ALBUM_TYPES } from './albums.js';
import { PAGE_OPTIONS } from './layout.js';

const TEMPLATE_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MUSIC_RE = /^\/assets\/music\/[a-z0-9][a-z0-9-]{0,60}\.mp3$/;   // a built-in song (assets/music/tracks.json)
export const LOGO_KEY_RE = /^s\/([a-z0-9][a-z0-9-]{0,62})\/logo-[a-z0-9]{6,20}\.(png|jpg|webp)$/;

// "rangstudio.in" -> "https://rangstudio.in"; only http(s) addresses with a real host are accepted.
export function cleanWebsite(value, field = 'Website') {
  let s = cleanText(value, { max: 300, field });
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let u;
  try { u = new URL(s); } catch { throw new HttpError(400, `${field} does not look like a web address. Try something like rangstudio.in`); }
  if (!/^https?:$/.test(u.protocol) || !/\.[a-z]{2,}$/i.test(u.hostname) || /[\s"'<>]/.test(s)) {
    throw new HttpError(400, `${field} does not look like a web address. Try something like rangstudio.in`);
  }
  return u.href.replace(/\/$/, '') === s.replace(/\/$/, '') ? s : u.href;
}

// Social profiles: "@rangstudio", "rangstudio" or a full link all become https://<site>/<handle>.
const SOCIAL = {
  instagram: { label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com', 'instagr.am'], base: 'https://instagram.com/', handle: /^[A-Za-z0-9._]{1,30}$/ },
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'fb.me'], base: 'https://facebook.com/', handle: /^[A-Za-z0-9.-]{2,50}$/ },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'], base: 'https://youtube.com/@', handle: /^[A-Za-z0-9._-]{3,30}$/ },
};
export function cleanSocial(kind, value) {
  const c = SOCIAL[kind];
  const s = cleanText(value, { max: 200, field: c.label });
  if (!s) return '';
  const bad = () => new HttpError(400, `${c.label}: enter your @handle or the link to your page.`);
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*(instagram|instagr|facebook|fb|youtube|youtu)\.(com|am|me|be)\b/i.test(s)) {
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { throw bad(); }
    if (!c.hosts.includes(u.hostname.toLowerCase()) || u.pathname.length < 2 || /[\s"'<>]/.test(u.pathname)) throw bad();
    return 'https://' + u.hostname.toLowerCase().replace(/^(www|m)\./, '') + u.pathname.replace(/\/$/, '') + u.search;
  }
  const h = s.replace(/^@/, '');
  if (!c.handle.test(h)) throw bad();
  return c.base + h;
}

// Phone numbers: digits, spaces, brackets, dashes and a leading +.
export function cleanPhone(value, field = 'Phone') {
  const s = cleanText(value, { max: 40, field });
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(s)) throw new HttpError(400, `${field} may only use digits, spaces, + and -, for example +91 98200 00000.`);
  if (digits.length < 6 || digits.length > 15) throw new HttpError(400, `${field} looks too ${digits.length < 6 ? 'short' : 'long'}. Enter the number with its area or country code, for example +91 98200 00000.`);
  return s;
}
// WhatsApp needs the country code; a 10-digit Indian mobile number gets +91.
export function cleanWhatsapp(value) {
  const s = cleanPhone(value, 'WhatsApp');
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10 && !s.trim().startsWith('+')) return '+91 ' + digits.slice(0, 5) + ' ' + digits.slice(5);
  if (digits.length < 10) throw new HttpError(400, 'WhatsApp: enter the full mobile number with the country code, for example +91 98200 00000.');
  return s;
}
export const waDigits = (s) => {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 10 ? '91' + d : d;
};

export function cleanAccent(value) {
  const s = cleanText(value, { max: 7, field: 'Colour' });
  if (s && !/^#[0-9a-fA-F]{6}$/.test(s)) throw new HttpError(400, 'Colour must look like #c8255f.');
  return s.toLowerCase();
}

// Album defaults: what a new album starts with.
export function cleanDefaults(d) {
  if (d == null) return {};
  if (typeof d !== 'object' || Array.isArray(d)) throw new HttpError(400, 'Send the album defaults as an object.');
  const out = {};
  if (d.type != null && d.type !== '') {
    if (!ALBUM_TYPES.includes(String(d.type))) throw new HttpError(400, 'Choose an occasion from the list.');
    out.type = String(d.type);
  }
  if (d.template != null && d.template !== '') {
    if (!TEMPLATE_KEY_RE.test(String(d.template))) throw new HttpError(400, 'Choose a cover design from the list.');
    out.template = String(d.template);
  }
  if (d.music != null && d.music !== '') {
    if (!MUSIC_RE.test(String(d.music))) throw new HttpError(400, 'Choose one of the built-in songs.');
    out.music = String(d.music);
  }
  if (d.pages && typeof d.pages === 'object') {
    const pages = {};
    for (const k of PAGE_OPTIONS) if (typeof d.pages[k] === 'boolean') pages[k] = d.pages[k];
    out.pages = pages;
  }
  if (d.requireApproval != null) out.requireApproval = !!d.requireApproval;
  if (d.status != null) out.status = d.status === 'published' ? 'published' : 'draft';
  return out;
}
export function parseDefaults(row) {
  try { const d = JSON.parse((row && row.defaults) || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}

// Validate a (partial) profile update: only the fields that are sent are checked and returned.
export function validateStudioInput(b) {
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Send the studio details as a JSON object.');
  const out = {};
  const has = (k) => b[k] !== undefined;
  if (has('name')) out.name = cleanText(b.name, { min: 2, max: 80, field: 'Studio name' });
  if (has('tagline')) out.tagline = cleanText(b.tagline, { max: 120, field: 'Tagline' });
  if (has('city')) out.city = cleanText(b.city, { max: 80, field: 'City' });
  if (has('address')) out.address = cleanText(b.address, { max: 300, field: 'Address', multiline: true });
  if (has('phone')) out.phone = cleanPhone(b.phone);
  if (has('whatsapp')) out.whatsapp = cleanWhatsapp(b.whatsapp);
  if (has('url')) out.url = cleanWebsite(b.url);
  for (const k of Object.keys(SOCIAL)) if (has(k)) out[k] = cleanSocial(k, b[k]);
  if (has('accent')) out.accent = cleanAccent(b.accent);
  if (has('defaults')) out.defaults = JSON.stringify(cleanDefaults(b.defaults));
  return out;
}

const PROFILE_COLS = ['name', 'tagline', 'city', 'address', 'phone', 'whatsapp', 'url', 'instagram', 'facebook', 'youtube', 'accent', 'defaults'];
export const STUDIO_COLUMNS = PROFILE_COLS;

// The owner's own view of their studio (never another studio's).
export function studioProfile(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, tagline: row.tagline || '', city: row.city || '', address: row.address || '',
    phone: row.phone || '', whatsapp: row.whatsapp || '', url: row.url || '', email: row.email || '',
    instagram: row.instagram || '', facebook: row.facebook || '', youtube: row.youtube || '',
    accent: row.accent || '', logo: row.logo_key ? '/media/' + row.logo_key : '',
    defaults: parseDefaults(row), onboardedAt: row.onboarded_at || null,
    status: row.status, plan: row.plan, createdAt: row.created_at,
  };
}

// What guests may see in an album: branding and ways to get in touch. Never email addresses or anything private.
export const PUBLIC_STUDIO_SQL = 'SELECT name, tagline, city, phone, whatsapp, url, instagram, facebook, youtube, logo_key FROM studios WHERE id = ?';
export function publicStudio(row) {
  if (!row) return null;
  const out = { name: row.name || '', phone: row.phone || '', url: row.url || '' };
  for (const k of ['tagline', 'city', 'instagram', 'facebook', 'youtube']) if (row[k]) out[k] = row[k];
  if (row.whatsapp) out.whatsapp = waDigits(row.whatsapp);
  if (row.logo_key) out.logo = '/media/' + row.logo_key;
  return out;
}

// Fill what a new album leaves out with the studio's defaults (the browser normally sends them already).
export function applyAlbumDefaults(body, studioRow) {
  if (!studioRow || !body || typeof body !== 'object') return body;
  const d = parseDefaults(studioRow);
  const out = { ...body };
  if (out.type == null && d.type) out.type = d.type;
  if (out.template == null && d.template) out.template = d.template;
  if (out.music == null && d.music) out.music = d.music;
  if (out.status == null && d.status) out.status = d.status;
  if (out.requireApproval == null && d.requireApproval != null) out.requireApproval = d.requireApproval;
  if (out.accent == null && studioRow.accent) out.accent = studioRow.accent;
  const design = out.design && typeof out.design === 'object' ? { ...out.design } : {};
  if (design.pages == null && d.pages) {
    // only the pages the studio switched off are stored; the rest follow the album's own default
    const off = Object.fromEntries(Object.entries(d.pages).filter(([, v]) => v === false));
    if (Object.keys(off).length) design.pages = off;
  }
  if (design.cover == null && d.template) design.cover = { template: d.template };
  out.design = design;
  return out;
}
