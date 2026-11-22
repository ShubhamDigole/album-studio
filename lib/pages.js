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

// One album's pages: [{ gen, text } | { t, p: [{ m, c: [cx, cy, zoom] }], tx: [...], bg?, s? }]
export function cleanComposed(input) {
  const pages = Array.isArray(input) ? input : input && Array.isArray(input.pages) ? input.pages : null;
  if (!pages) throw new HttpError(400, 'Send the pages as a list.');
  if (pages.length > 600) throw new HttpError(400, 'An album can have at most 600 pages.');
  return pages.map((pg, i) => {
    if (!pg || typeof pg !== 'object') throw new HttpError(400, `Page ${i + 1} is not valid.`);
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
