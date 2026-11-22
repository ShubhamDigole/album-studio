// Album records: validation, DB row <-> API shape, and merging with the pipeline's album.json.
import { ALBUM_ID_RE, HttpError, cleanText } from './http.js';
import { designedPages, pageRatioOf, photoPages, coverOnly, composedPages, PAGE_OPTIONS } from './layout.js';
import { parseComposed } from './pages.js';

export const ALBUM_TYPES = ['wedding', 'engagement', 'pre-wedding', 'haldi', 'mehendi', 'sangeet', 'reception',
  'anniversary', 'birthday', 'baby-shower', 'maternity', 'other'];
const TEMPLATE_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;   // unknown keys fall back to the type's default design

export function rowToAlbum(row) {
  let names = [], design = {};
  try { names = JSON.parse(row.names || '[]'); } catch { /* keep empty */ }
  try { design = JSON.parse(row.design || '{}'); } catch { /* keep empty */ }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    names,
    date: row.event_date || '',
    location: row.location,
    studio: { name: row.studio_name, phone: row.studio_phone, url: row.studio_url },
    music: row.music,
    downloadUrl: row.download_url,
    accent: row.accent,
    template: row.template || '',
    design,
    studioId: row.studio_id || null,
    status: row.status,
    requireApproval: !!row.require_approval,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Extra pages chosen for an album (endpapers, welcome, sections, thanks): only true/false values are kept.
// A missing key means "the default for this kind of album" (see pageOptions in layout.js).
export function cleanPageOptions(p) {
  const out = {};
  if (p && typeof p === 'object') for (const k of PAGE_OPTIONS) if (typeof p[k] === 'boolean') out[k] = p[k];
  return out;
}

const URL_OK = (s) => s === '' || /^(https?:\/\/|\/)[^\s"'<>]*$/.test(s) || /^[\w./-]+$/.test(s);

// Validate admin input. `partial` allows missing fields (PUT keeps existing values).
export function validateAlbumInput(body, { requireId }) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Send the album details as a JSON object.');
  const out = {};
  if (requireId) {
    const id = cleanText(body.id, { max: 64, min: 2, field: 'Album link' }).toLowerCase();
    if (!ALBUM_ID_RE.test(id)) throw new HttpError(400, 'Album link may only use lowercase letters, numbers and dashes (2–64 characters).');
    out.id = id;
  }
  const type = body.type == null ? 'wedding' : String(body.type);
  if (!ALBUM_TYPES.includes(type)) throw new HttpError(400, 'Choose an album type from the list.');
  out.type = type;
  out.title = cleanText(body.title, { max: 120, field: 'Title' });
  const names = Array.isArray(body.names) ? body.names : [];
  if (names.length > 6) throw new HttpError(400, 'Add at most 6 names.');
  out.names = names.map((n) => cleanText(n, { max: 60, field: 'Name' })).filter(Boolean);
  if (!out.names.length && !out.title) throw new HttpError(400, 'Add at least one name or a title.');
  const date = cleanText(body.date, { max: 10, field: 'Date' });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Date must look like 2026-02-12.');
  out.date = date;
  out.location = cleanText(body.location, { max: 120, field: 'Location' });
  const studio = body.studio && typeof body.studio === 'object' ? body.studio : {};
  out.studio = {
    name: cleanText(studio.name, { max: 100, field: 'Studio name' }),
    phone: cleanText(studio.phone, { max: 40, field: 'Studio phone' }),
    url: cleanText(studio.url, { max: 300, field: 'Studio website' }),
  };
  out.music = cleanText(body.music, { max: 300, field: 'Music' });
  out.downloadUrl = cleanText(body.downloadUrl, { max: 500, field: 'Download link' });
  for (const [k, label] of [['music', 'Music'], ['downloadUrl', 'Download link']]) {
    if (!URL_OK(out[k])) throw new HttpError(400, `${label} must be a web address (https://…) or a file path.`);
  }
  if (out.studio.url && !/^https?:\/\//.test(out.studio.url)) throw new HttpError(400, 'Studio website must start with https://');
  const accent = cleanText(body.accent, { max: 7, field: 'Accent colour' });
  if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) throw new HttpError(400, 'Accent colour must look like #c8255f.');
  out.accent = accent;
  const template = body.template == null ? '' : String(body.template);
  if (template && !TEMPLATE_KEY_RE.test(template)) throw new HttpError(400, 'Choose a cover design from the list.');
  out.template = template;
  out.status = body.status === 'published' ? 'published' : 'draft';
  out.requireApproval = !!body.requireApproval;
  return out;
}

export function albumParams(a) {
  return [a.type, a.title, JSON.stringify(a.names), a.date || null, a.location, a.studio.name, a.studio.phone,
    a.studio.url, a.music, a.downloadUrl, a.accent, a.template, a.status, a.requireApproval ? 1 : 0];
}

export async function getAlbumRow(db, id) {
  return db.prepare('SELECT * FROM albums WHERE id = ?').bind(id).first();
}

// Fetch the static album.json produced by tools/build-album.mjs (served from /albums/<id>/album.json).
export async function getStaticAlbum(env, request, id) {
  if (!env.ASSETS) return null;
  const res = await env.ASSETS.fetch(new URL(`/albums/${id}/album.json`, request.url));
  if (!res.ok) return null;
  const type = res.headers.get('Content-Type') || '';
  if (!type.includes('json')) return null; // SPA fallback html
  try { return await res.json(); } catch { return null; }
}

// Uploaded photos/pages of an album (from the media table).
export async function getMedia(db, id) {
  const { results } = await db.prepare("SELECT * FROM media WHERE album_id = ? AND kind IN ('photo', 'page') ORDER BY position, created_at").bind(id).all();
  return { photos: results.filter((m) => m.kind === 'photo'), pages: results.filter((m) => m.kind === 'page') };
}

// R2 keys in the design JSON -> URLs the browser can load.
export function designUrls(design) {
  const out = {};
  for (const part of ['cover', 'back', 'endpaper']) {
    const d = design && design[part];
    if (!d) continue;
    out[part] = { template: d.template || '' };
    if (d.upload) out[part].upload = '/media/' + d.upload;
    if (Array.isArray(d.photos)) out[part].photos = d.photos.map((k) => (k ? '/media/' + k : ''));
    if (Array.isArray(d.crops) && d.crops.some(Boolean)) out[part].crops = d.crops;
    if (d.page) out[part].page = d.page;
  }
  return out;
}

// What guests get. Uploaded designed pages win over uploaded photos, which win over the pipeline's build.
// Database fields win over the pipeline's values when they are filled in; empty studio fields come from the studio profile.
export function mergeAlbum(staticAlbum, row, { media, studio, templates } = {}) {
  let base = staticAlbum ? { ...staticAlbum } : { pages: [], gallery: [], sections: [] };
  base.base = `/albums/${row ? row.id : staticAlbum.id}/`; // pages/photos are relative to this folder
  if (!row) return base;
  const opts = rowToAlbum(row).design.pages;
  const composed = parseComposed(row);
  if (composed && media) {
    // pages made in the page editor win over uploaded page images and the automatic layout
    base.pages = composedPages(composed, [...media.photos, ...media.pages], opts);
    base.pageWidth = 1296; base.pageHeight = media.pages.length ? Math.round(1296 / pageRatioOf(media.pages)) : 864;
    base.pageTemplates = templates || {};
  } else if (media && media.pages.length) {
    base.pages = designedPages(media.pages, opts);
    base.pageWidth = 1296; base.pageHeight = Math.round(1296 / pageRatioOf(media.pages));
  } else if (media && media.photos.length) {
    const built = photoPages(media.photos, opts);
    base.pages = built.pages; base.pageWidth = 1296; base.pageHeight = 864;
  }
  if (media && media.photos.length) {
    const built = photoPages(media.photos, opts);
    base.gallery = built.gallery; base.sections = built.sections;
    if (!base.cover) base.cover = built.gallery.find((g) => g.width > g.height)?.display || built.gallery[0].display;
  }
  if (!base.pages || !base.pages.length) { base.pages = coverOnly(opts); base.pageWidth = base.pageWidth || 1296; base.pageHeight = base.pageHeight || 864; }
  if (base.hardCover === undefined) base.hardCover = true;
  const a = rowToAlbum(row);
  base.design = designUrls(a.design);
  // covers made in the editor: their photos as URLs
  if (media) {
    const byId = new Map([...media.photos, ...media.pages].map((m) => [m.id, m]));
    for (const part of Object.keys(base.design)) {
      const pg = base.design[part].page;
      if (!pg) continue;
      const map = {};
      for (const id of [...(pg.els || []).filter((e) => e.type === 'photo').map((e) => e.m), pg.bg && pg.bg.m]) {
        const m = id && byId.get(id);
        if (m) map[id] = { src: '/media/' + m.key, thumb: '/media/' + (m.thumb_key || m.key), zoom: '/media/' + (m.full_key || m.key) };
      }
      base.design[part].media = map;
    }
  }
  if (studio) {
    const s = base.studio || {};
    // the album's own credit wins; the profile adds the logo, tagline and ways to get in touch (public fields only, see lib/studios.js)
    base.studio = { ...studio, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v)) };
  }
  base.id = a.id;
  base.type = a.type;
  if (a.names.length) base.names = a.names;
  base.title = a.title || (a.names.length ? a.names.join(' & ') : base.title || '');
  if (a.date) base.date = a.date;
  if (a.location) base.location = a.location;
  base.studio = { ...(base.studio || {}), ...Object.fromEntries(Object.entries(a.studio).filter(([, v]) => v)) };
  if (a.music) base.music = a.music;
  if (a.downloadUrl) base.downloadUrl = a.downloadUrl;
  base.theme = { ...(base.theme || {}) };
  if (a.accent) base.theme.accent = a.accent;
  if (a.template) base.template = a.template;
  base.status = a.status;
  base.requireApproval = a.requireApproval;
  return base;
}
