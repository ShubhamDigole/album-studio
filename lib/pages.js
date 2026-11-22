// Album pages from the page editor (albums.composed) and the master's page designs (page_templates):
// validation and the shapes the browser gets. The layout geometry of built-in designs lives in assets/js/page-templates.js.
import { HttpError } from './http.js';

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MEDIA_RE = /^[a-z0-9]{1,32}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const BGS = ['paper', 'white', 'silk', 'dark'];
const GENS = ['title', 'divider', 'closing'];
const num = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);
const bgOf = (v) => (BGS.includes(v) || HEX.test(v || '') ? v : undefined);

// Free-form pages (v: 2) from the advanced editor; see page-templates.js for the format.
const COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const colorOf = (v) => (v === 'accent' || v === 'silk' || COLOR.test(v || '') ? v : undefined);
const SRC = /^\/(assets\/library\/[a-z0-9/_-]{1,120}\.(jpg|jpeg|png|webp|svg)|media\/a\/[a-z0-9][a-z0-9-]{1,63}\/(asset|photo|page|design)\/[a-z0-9]{6,20}(-[tf])?\.(jpg|png|webp))$/;
const SHAPES = ['rect', 'rounded', 'circle', 'arch', 'hexagon', 'diamond', 'triangle', 'octagon', 'star', 'slant', 'heart', 'blob', 'scallop', 'flower', 'line'];
const FONTS = ['display', 'ui', 'playfair', 'cormorant', 'cinzel', 'marcellus', 'greatvibes', 'parisienne', 'dancing', 'montserrat', 'poppins', 'yatra', 'tiro'];
const ROLES = ['names', 'date', 'place', 'title', 'section', 'caption', 'free'];
const pick = (v, list, def) => (list.includes(v) ? v : def);
function srcOf(v, albumId) {
  const s = String(v || '');
  if (!SRC.test(s)) return undefined;
  if (s.startsWith('/media/') && albumId && !s.startsWith('/media/a/' + albumId + '/')) return undefined;   // only this album's uploads
  return s;
}
const cropOf = (c) => (Array.isArray(c) ? [num(c[0], 0, 1, 0.5), num(c[1], 0, 1, 0.5), num(c[2], 1, 4, 1)].map((n) => Math.round(n * 1000) / 1000) : undefined);
export function cleanFreePage(pg, { albumId, template = false } = {}) {
  const out = { v: 2 };
  if (pg.s) out.s = 1;
  const b = pg.bg && typeof pg.bg === 'object' ? pg.bg : {};
  const type = pick(b.type, ['color', 'gradient', 'image', 'photo'], 'color');
  const bg = { type };
  if (type === 'color') bg.color = colorOf(b.color) || '#F7F3EE';
  if (type === 'gradient') { bg.colors = (Array.isArray(b.colors) ? b.colors : []).slice(0, 2).map((c) => colorOf(c) || '#F7F3EE'); bg.angle = num(b.angle, 0, 360, 180); if (b.radial) bg.radial = true; }
  if (type === 'image') { bg.src = srcOf(b.src, albumId); if (!bg.src) { bg.type = 'color'; bg.color = '#F7F3EE'; } if (b.repeat) { bg.repeat = true; bg.scale = num(b.scale, 2, 100, 20); } }
  if (type === 'photo') { bg.m = !template && MEDIA_RE.test(String(b.m || '')) ? String(b.m) : null; const c = cropOf(b.c); if (c) bg.c = c; }
  if (type === 'image' || type === 'photo') {
    if (b.blur) bg.blur = num(b.blur, 0, 5, 0);
    if (b.dim) { bg.dim = num(b.dim, 0, 0.95, 0); bg.dimColor = colorOf(b.dimColor) || '#000000'; }
    const c = colorOf(b.color); if (c) bg.color = c;
  }
  out.bg = bg;
  const els = Array.isArray(pg.els) ? pg.els : [];
  if (els.length > 80) throw new HttpError(400, 'A page can hold at most 80 items.');
  out.els = els.map((e) => {
    if (!e || typeof e !== 'object') return null;
    const o = { type: pick(e.type, ['photo', 'text', 'shape', 'art'], null) };
    if (!o.type) return null;
    Object.assign(o, { x: num(e.x, -1, 2, 0.1), y: num(e.y, -1, 2, 0.1), w: num(e.w, 0.002, 3, 0.3), h: num(e.h, 0.002, 3, 0.3) });
    if (e.rot) o.rot = num(e.rot, -360, 360, 0);
    if (e.opacity != null && e.opacity < 1) o.opacity = num(e.opacity, 0, 1, 1);
    if (e.flipX) o.flipX = true;
    if (e.flipY) o.flipY = true;
    if (e.lock) o.lock = true;
    if (o.type === 'photo') {
      o.m = !template && MEDIA_RE.test(String(e.m || '')) ? String(e.m) : null;
      const c = cropOf(e.c); if (c) o.c = c;
      o.shape = pick(e.shape, SHAPES, 'rect');
      if (e.radius != null) o.radius = num(e.radius, 0, 0.5, 0.08);
      if (e.border && e.border.w) o.border = { w: num(e.border.w, 0, 5, 0.5), color: colorOf(e.border.color) || '#ffffff' };
      if (['soft', 'strong', 'glow'].includes(e.shadow)) o.shadow = e.shadow;
      if (['polaroid', 'mat'].includes(e.frame)) o.frame = e.frame;
      if (e.fade && ['left', 'right', 'top', 'bottom', 'x', 'y', 'all'].includes(e.fade.side)) o.fade = { side: e.fade.side, size: num(e.fade.size, 0.05, 0.9, 0.3) };
      if (e.filter && typeof e.filter === 'object') {
        const f = {};
        for (const [k, lo, hi] of [['brightness', 0.2, 2], ['contrast', 0.2, 2], ['saturate', 0, 3], ['grayscale', 0, 1], ['sepia', 0, 1], ['blur', 0, 3]]) {
          if (e.filter[k] != null) f[k] = num(e.filter[k], lo, hi, k === 'brightness' || k === 'contrast' || k === 'saturate' ? 1 : 0);
        }
        if (Object.keys(f).length) o.filter = f;
      }
    } else if (o.type === 'text') {
      o.text = str(e.text, 500);
      if (ROLES.includes(e.role)) o.role = e.role;
      o.font = pick(e.font, FONTS, 'display');
      o.size = num(e.size, 0.5, 40, 5);
      o.color = colorOf(e.color) || '#2A2530';
      o.align = pick(e.align, ['left', 'center', 'right'], 'center');
      if (e.weight) o.weight = num(e.weight, 100, 900, 400);
      if (e.italic) o.italic = true;
      if (e.spacing) o.spacing = num(e.spacing, -0.1, 1, 0);
      if (e.line) o.line = num(e.line, 0.7, 3, 1.15);
      if (['soft', 'strong', 'glow'].includes(e.shadow)) o.shadow = e.shadow;
      if (e.upper) o.upper = true;
      const bgc = colorOf(e.bg); if (bgc) o.bg = bgc;
      if (['top', 'bottom'].includes(e.valign)) o.valign = e.valign;
    } else if (o.type === 'shape') {
      o.shape = pick(e.shape, SHAPES, 'rect');
      const fill = colorOf(e.fill); if (fill) o.fill = fill;
      const stroke = colorOf(e.stroke); if (stroke) o.stroke = stroke;
      if (e.strokeW) o.strokeW = num(e.strokeW, 0, 10, 0.3);
      if (e.radius != null) o.radius = num(e.radius, 0, 0.5, 0.08);
    } else if (o.type === 'art') {
      o.src = srcOf(e.src, albumId);
      if (!o.src) return null;
      const tint = colorOf(e.tint); if (tint) o.tint = tint;
    }
    return o;
  }).filter(Boolean);
  return out;
}

// One album's pages: [{ gen, text } | { t, p: [{ m, c: [cx, cy, zoom] }], tx: [...], bg?, s? } | { v: 2, … }]
export function cleanComposed(input, { albumId } = {}) {
  const pages = Array.isArray(input) ? input : input && Array.isArray(input.pages) ? input.pages : null;
  if (!pages) throw new HttpError(400, 'Send the pages as a list.');
  if (pages.length > 600) throw new HttpError(400, 'An album can have at most 600 pages.');
  return pages.map((pg, i) => {
    if (!pg || typeof pg !== 'object') throw new HttpError(400, `Page ${i + 1} is not valid.`);
    if (pg.v === 2) return cleanFreePage(pg, { albumId });
    if (pg.gen !== undefined) {
      if (!GENS.includes(pg.gen)) throw new HttpError(400, `Page ${i + 1} has an unknown kind.`);
      const out = { gen: pg.gen };
      if (pg.text) out.text = str(pg.text, 80);
      return out;
    }
    if (!KEY_RE.test(String(pg.t || ''))) throw new HttpError(400, `Page ${i + 1} needs a design.`);
    const p = (Array.isArray(pg.p) ? pg.p : []).slice(0, 12).map((x) => {
      const m = x && MEDIA_RE.test(String(x.m || '')) ? String(x.m) : null;
      const c = Array.isArray(x && x.c) ? [num(x.c[0], 0, 1, 0.5), num(x.c[1], 0, 1, 0.5), num(x.c[2], 1, 4, 1)].map((n) => Math.round(n * 1000) / 1000) : undefined;
      return c ? { m, c } : { m };
    });
    const out = { t: String(pg.t), p };
    if (Array.isArray(pg.tx) && pg.tx.some((s) => s)) out.tx = pg.tx.slice(0, 8).map((s) => str(s, 300));
    const bg = bgOf(pg.bg); if (bg) out.bg = bg;
    if (pg.s) out.s = 1;
    return out;
  });
}

// A page design drawn by the master.
export function cleanTemplate(b) {
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Send the design as an object.');
  const name = str(b.name, 60).trim();
  if (!name) throw new HttpError(400, 'Give the design a name.');
  if (b.v === 2) {
    // a free-form design: photo spots are photo layers without a photo
    const page = cleanFreePage(b, { template: true });
    if (!page.els.length) throw new HttpError(400, 'Add at least one item to the design.');
    const data = { ...page, kind: ['page', 'cover'].includes(b.kind) ? b.kind : 'page' };
    if (Array.isArray(b.occasions)) data.occasions = b.occasions.filter((o) => KEY_RE.test(String(o))).slice(0, 12);
    return { name, data };
  }
  const slots = (Array.isArray(b.slots) ? b.slots : []).slice(0, 12).map((s) => {
    const o = { x: num(s.x, -0.2, 1.2, 0), y: num(s.y, -0.2, 1.2, 0), w: num(s.w, 0.02, 1.4, 0.3), h: num(s.h, 0.02, 1.4, 0.3) };
    if (s.r === 'circle' || s.r === 'arch') o.r = s.r; else if (s.r) o.r = num(s.r, 0, 0.5, 0);
    if (['mat', 'shadow', 'polaroid'].includes(s.frame)) o.frame = s.frame;
    if (s.rot) o.rot = num(s.rot, -45, 45, 0);
    return o;
  });
  const texts = (Array.isArray(b.texts) ? b.texts : []).slice(0, 8).map((t) => {
    const o = { x: num(t.x, 0, 1, 0.1), y: num(t.y, 0, 1, 0.1), w: num(t.w, 0.02, 1, 0.5), h: num(t.h, 0.02, 1, 0.1),
      role: ['names', 'date', 'place', 'title', 'section', 'caption', 'free'].includes(t.role) ? t.role : 'free',
      font: t.font === 'ui' ? 'ui' : 'display', size: num(t.size, 1, 30, 5),
      align: ['left', 'right'].includes(t.align) ? t.align : 'center',
      color: ['ink', 'accent', 'light', 'silk'].includes(t.color) || HEX.test(t.color || '') ? t.color : 'ink' };
    if (t.text) o.text = str(t.text, 200);
    if (t.weight) o.weight = num(t.weight, 300, 800, 400);
    return o;
  });
  if (!slots.length && !texts.length) throw new HttpError(400, 'Add at least one photo spot or text box.');
  const data = { spread: !!b.spread, bg: bgOf(b.bg) || 'paper', slots, texts, auto: b.auto !== false && !texts.length };
  if (Array.isArray(b.occasions)) data.occasions = b.occasions.filter((o) => KEY_RE.test(String(o))).slice(0, 12);
  return { name, data };
}

export const templateOut = (row) => {
  let data = {};
  try { data = JSON.parse(row.data || '{}'); } catch { /* keep empty */ }
  return { key: row.key, name: row.name, hidden: row.status !== 'active', ...data };
};

export function parseComposed(row) {
  if (!row || !row.composed) return null;
  try { const v = JSON.parse(row.composed); return Array.isArray(v) && v.length ? v : null; } catch { return null; }
}

// master designs used by these pages, for the viewer (built-in designs ship with page-templates.js)
export async function templatesFor(db, pages) {
  const keys = [...new Set((pages || []).map((p) => p.t).filter((k) => k && k.startsWith('c-')))];
  if (!keys.length) return {};
  const { results } = await db.prepare(`SELECT * FROM page_templates WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all();
  return Object.fromEntries(results.map((r) => [r.key, templateOut(r)]));
}
