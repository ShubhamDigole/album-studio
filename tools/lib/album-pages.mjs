// Album page designer: turns page specs (plain data) into 2592x1728 page images with sharp.
// Any change to this file changes every page hash (see pageHash), so edits re-render all pages.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escMarkup, hash8, sha1 } from './util.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(here, '..', 'fonts');
export const FONTS = {
  rozha: { file: join(FONT_DIR, 'RozhaOne-Regular.ttf'), family: 'Rozha One' },
  mukta: { file: join(FONT_DIR, 'Mukta-Regular.ttf'), family: 'Mukta' },
  muktaMedium: { file: join(FONT_DIR, 'Mukta-Medium.ttf'), family: 'Mukta Medium' },
};

export const PW = 2592, PH = 1728;          // rendered page size (2x the 1296x864 viewer page)
export const TW = 432, TH = 288;            // page thumbnail size

export const INK = '#1D1A26', PAPER = '#F7F3EE', JASMINE = '#FBF7F1';
export const THEMES = {
  wedding: { silk: '#0F3D3E', accent: '#C8255F' },
  engagement: { silk: '#3B1E3F', accent: '#EFA00B' },
  'pre-wedding': { silk: '#1F3A5F', accent: '#E86A92' },
  haldi: { silk: '#7A5200', accent: '#F7C948' },
  mehendi: { silk: '#23452B', accent: '#C9A227' },
  sangeet: { silk: '#2E1F5E', accent: '#F05A9D' },
  reception: { silk: '#14213D', accent: '#E0B44C' },
  anniversary: { silk: '#5A1426', accent: '#E7B75F' },
  birthday: { silk: '#14454F', accent: '#F2A541' },
  'baby-shower': { silk: '#2F4858', accent: '#F6BD60' },
  maternity: { silk: '#4A3F5C', accent: '#E9A6A6' },
  other: { silk: '#2B2D42', accent: '#EF8354' },
};
export const TYPE_LABELS = {
  wedding: 'Wedding', engagement: 'Engagement', 'pre-wedding': 'Pre-wedding', haldi: 'Haldi', mehendi: 'Mehendi',
  sangeet: 'Sangeet', reception: 'Reception', anniversary: 'Anniversary', birthday: 'Birthday',
  'baby-shower': 'Baby shower', maternity: 'Maternity', other: '',
};

// Design fingerprint: this file's source + fonts' sizes. Part of every page hash.
const DESIGN = sha1(readFileSync(fileURLToPath(import.meta.url)) + Object.values(FONTS)
  .map((f) => readFileSync(f.file).length).join(','));

/** Stable cache key for a page: covers its spec (texts, colours, photo hashes, layout) and the design code. */
export const pageHash = (spec) => hash8(DESIGN + JSON.stringify(spec));

// ---------------------------------------------------------------------------------------------------------------
// colour helpers
const rgb = (hex) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Mix colour a towards b; t=0 -> a, t=1 -> b. */
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
/** Accent colour for use on paper: light accents (haldi yellow etc.) are deepened towards the silk so they read. */
const paperAccent = ({ accent, silk }) => { let c = accent; while (lum(c) > 0.5) c = mix(c, silk, 0.2); return c; };
const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------------------------------------------
// backgrounds (raw RGB buffers, cached per colour)
const bgCache = new Map();

/** Deep silk: fine horizontal weave + soft diagonal sheen + gentle vignette. */
function silkBg(hex) {
  const key = 'silk' + hex;
  if (bgCache.has(key)) return bgCache.get(key);
  const [r0, g0, b0] = rgb(hex);
  const buf = Buffer.alloc(PW * PH * 3);
  const rnd = mulberry32(7);
  const row = new Float32Array(PH);
  for (let y = 0; y < PH; y++) row[y] = rnd() * 2 - 1;
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < PH - 1; y++) row[y] = (row[y - 1] + row[y] * 2 + row[y + 1]) / 4;
  const noise = new Float32Array(PW), fib = new Float32Array(PW);
  const R = 28;
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) noise[x] = rnd() * 2 - 1;
    let acc = 0;
    for (let x = -R; x <= R; x++) acc += noise[(x + PW) % PW];
    for (let x = 0; x < PW; x++) {
      fib[x] = acc / Math.sqrt(2 * R + 1);
      acc += noise[(x + R + 1) % PW] - noise[(x - R + PW) % PW];
    }
    const ny = y / PH - 0.5;
    for (let x = 0; x < PW; x++) {
      const nx = x / PW - 0.5;
      const vig = 1 - 0.85 * (nx * nx * 0.8 + ny * ny * 1.3);
      const d = (x / PW) * 0.55 + (y / PH) * 0.45;
      const sheen = 0.15 * Math.exp(-(((d - 0.34) / 0.24) ** 2));
      const k = vig + sheen;
      const add = fib[x] * 1.5 + row[y] * 2.2 + noise[x] * 1.1;
      const o = (y * PW + x) * 3;
      buf[o] = Math.max(0, Math.min(255, r0 * k + add));
      buf[o + 1] = Math.max(0, Math.min(255, g0 * k + add));
      buf[o + 2] = Math.max(0, Math.min(255, b0 * k + add));
    }
  }
  bgCache.set(key, buf);
  return buf;
}

/** Warm paper: very fine grain + a whisper of fibre and vignette. */
function paperBg(hex = PAPER) {
  const key = 'paper' + hex;
  if (bgCache.has(key)) return bgCache.get(key);
  const [r0, g0, b0] = rgb(hex);
  const buf = Buffer.alloc(PW * PH * 3);
  const rnd = mulberry32(11);
  const noise = new Float32Array(PW), fib = new Float32Array(PW);
  const R = 6;
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) noise[x] = rnd() * 2 - 1;
    let acc = 0;
    for (let x = -R; x <= R; x++) acc += noise[(x + PW) % PW];
    for (let x = 0; x < PW; x++) { fib[x] = acc / Math.sqrt(2 * R + 1); acc += noise[(x + R + 1) % PW] - noise[(x - R + PW) % PW]; }
    const ny = y / PH - 0.5;
    for (let x = 0; x < PW; x++) {
      const nx = x / PW - 0.5;
      const shade = -14 * (nx * nx + ny * ny);
      const add = shade + noise[x] * 1.2 + fib[x] * 0.6;
      const o = (y * PW + x) * 3;
      buf[o] = Math.min(255, Math.max(0, r0 + add));
      buf[o + 1] = Math.min(255, Math.max(0, g0 + add));
      buf[o + 2] = Math.min(255, Math.max(0, b0 + add - 0.6));
    }
  }
  bgCache.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------------------------------------------------------
// layers
const svgLayer = async (body, w = PW, h = PH) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)).png().toBuffer();

/**
 * Render text with sharp/Pango using a bundled TTF. Returns { input, width, height } trimmed to the ink box.
 * `markup` may contain Pango spans (already escaped); `text` is escaped for you.
 */
async function textLayer({ text, markup, font = 'rozha', size, color, width, align = 'centre', spacing }) {
  const f = FONTS[font];
  const body = markup ?? escMarkup(text);
  const opts = { text: `<span foreground="${color}">${body}</span>`, font: `${f.family} ${size}`, fontfile: f.file,
    rgba: true, dpi: 72, align, wrap: 'word' };
  if (width) opts.width = width;
  if (spacing) opts.spacing = spacing;
  const { data, info } = await sharp({ text: opts }).png().toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

/** Largest size <= `size` whose single-line render fits in maxWidth. */
async function fitText(o, maxWidth, minSize = 24) {
  let size = o.size;
  for (;;) {
    const t = await textLayer({ ...o, size });
    if (t.width <= maxWidth || size <= minSize) return Object.assign(t, { size });
    size = Math.max(minSize, Math.floor(size * Math.min(0.95, maxWidth / t.width)));
  }
}

const at = (layer, left, top) => ({ input: layer.input, left: Math.round(left), top: Math.round(top) });
const centred = (layer, cx, top) => at(layer, cx - layer.width / 2, top);

/** Stack text/ornament layers vertically, centred on cx, block centred on cy. Gaps are px between items. */
function stack(items, cx, cy) {
  const total = items.reduce((s, it) => s + it.layer.height + (it.gap ?? 0), 0);
  let y = cy - total / 2;
  const out = [];
  for (const it of items) { y += it.gap ?? 0; out.push(centred(it.layer, cx + (it.dx ?? 0), y)); y += it.layer.height; }
  return out;
}

// ornaments ------------------------------------------------------------------------------------------------------
/** A small lotus with fine rules either side. Returned as a layer of width w. */
async function lotus(color, { scale = 1, rule = 220, line } = {}) {
  const w = Math.round((rule * 2 + 160) * scale), h = Math.round(80 * scale);
  const lc = line ?? color;
  const petal = (len, wid) => `M0,${-len} C${wid},${-len * 0.62} ${wid * 1.05},${-len * 0.2} 0,4 C${-wid * 1.05},${-len * 0.2} ${-wid},${-len * 0.62} 0,${-len}Z`;
  const body = `<g transform="translate(${w / 2} ${h * 0.68}) scale(${scale})">
    <g fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round">
      <path d="${petal(30, 13)}" transform="rotate(-40 0 4)"/>
      <path d="${petal(30, 13)}" transform="rotate(40 0 4)"/>
      <path d="${petal(22, 10)}" transform="rotate(-74 0 4)"/>
      <path d="${petal(22, 10)}" transform="rotate(74 0 4)"/>
    </g>
    <path d="${petal(44, 15)}" fill="${color}"/>
    <g stroke="${lc}" stroke-width="2" stroke-linecap="round" fill="${lc}">
      <path d="M${-46} 12 H${-46 - rule}" /><path d="M46 12 H${46 + rule}"/>
      <circle cx="${-52 - rule}" cy="12" r="3.4" stroke="none"/><circle cx="${52 + rule}" cy="12" r="3.4" stroke="none"/>
    </g></g>`;
  return { input: await svgLayer(body, w, h), width: w, height: h };
}

/** A fine rule with a small diamond in the middle. */
async function rule(color, w = 360) {
  const h = 24;
  const body = `<g stroke="${color}" stroke-width="2" fill="none">
    <path d="M0 ${h / 2} H${w / 2 - 18} M${w / 2 + 18} ${h / 2} H${w}"/>
    <path d="M${w / 2} ${h / 2 - 8} L${w / 2 + 8} ${h / 2} L${w / 2} ${h / 2 + 8} L${w / 2 - 8} ${h / 2}Z" fill="${color}"/></g>`;
  return { input: await svgLayer(body, w, h), width: w, height: h };
}

/** Soft drop shadow for a rectangle placed at (x, y, w, h). Full-page layer. */
async function shadow(x, y, w, h, { blur = 18, dy = 12, opacity = 0.22 } = {}) {
  return { input: await svgLayer(`<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${blur}"/></filter></defs>
    <rect x="${x}" y="${y + dy}" width="${w}" height="${h}" fill="#000" opacity="${opacity}" filter="url(#s)"/>`), left: 0, top: 0 };
}

async function photoLayer(file, w, h, position = 'centre') {
  const input = await sharp(file).resize(Math.round(w), Math.round(h), { fit: 'cover', position }).toBuffer();
  return { input, width: Math.round(w), height: Math.round(h) };
}

async function finish(bg, layers) {
  const base = sharp(bg, { raw: { width: PW, height: PH, channels: 3 } }).composite(layers);
  const full = await base.webp({ quality: 80, effort: 5 }).toBuffer();
  const thumb = await sharp(full).resize(TW, TH).webp({ quality: 78 }).toBuffer();
  return { full, thumb };
}

// ---------------------------------------------------------------------------------------------------------------
// page renderers. Every renderer takes (spec, ctx) where ctx.photoFile(hash) gives the processed JPEG to use.
const R = {};

R.cover = async (s, ctx) => {
  const { silk, accent } = s.theme;
  // photo window: 3:2, left/centre
  const ph = 1056, pw = 1584, px = 228, py = (PH - ph) / 2;
  const layers = [];
  layers.push(await shadow(px, py, pw, ph, { blur: 26, dy: 18, opacity: 0.45 }));
  // a thin jasmine keyline set off the photo like a debossed window edge
  const k = 26;
  layers.push({ input: await svgLayer(`<rect x="${px - k}" y="${py - k}" width="${pw + 2 * k}" height="${ph + 2 * k}"
      fill="none" stroke="${mix(JASMINE, silk, 0.45)}" stroke-width="2"/>`), left: 0, top: 0 });
  if (s.photo) layers.push(at(await photoLayer(ctx.photoFile(s.photo), pw, ph, 'attention'), px, py));
  // title column on the right
  const colL = px + pw + k + 90, colR = PW - 150, cx = (colL + colR) / 2, colW = colR - colL;
  const items = [{ layer: await lotus(accent, { scale: 1.2, rule: 60, line: mix(accent, silk, 0.25) }) }];
  if (s.names.length >= 2) {
    // keep all names the same size: the smallest size at which each one fits the column
    const fitted = await Promise.all(s.names.map((n) => fitText({ text: n, size: 168, color: JASMINE }, colW, 60)));
    const size = Math.min(...fitted.map((l) => l.size));
    const nameLayers = await Promise.all(s.names.map((n, i) => fitted[i].size === size ? fitted[i] : textLayer({ text: n, size, color: JASMINE })));
    const amp = await textLayer({ text: '&', size: 112, color: accent });
    nameLayers.forEach((l, i) => {
      if (i > 0) items.push({ layer: amp, gap: i === 1 ? 26 : 18 });
      items.push({ layer: l, gap: i === 0 ? 64 : 26 });
    });
  } else {
    items.push({ layer: await textLayer({ text: s.title, size: 132, color: JASMINE, width: colW }), gap: 64 });
  }
  const sub = mix(JASMINE, silk, 0.18);
  items.push({ layer: await rule(mix(accent, silk, 0.15), 200), gap: 70 });
  if (s.date) items.push({ layer: await fitText({ text: s.date, font: 'mukta', size: 50, color: sub }, colW), gap: 54 });
  if (s.location) items.push({ layer: await fitText({ text: s.location, font: 'mukta', size: 50, color: sub }, colW), gap: 18 });
  layers.push(...stack(items, cx, PH / 2));
  return finish(silkBg(silk), layers);
};

/** Initials inside a double ring with four small diamonds. Returns full-page layers centred on (cx, cy). */
async function monogram(initials, { cx, cy, r, letters, accent }) {
  const k = r / 236;
  const ring = await svgLayer(`<g fill="none" stroke="${accent}">
      <circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="${3 * k}"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 16 * k}" stroke-width="${1.2 * k}" opacity="0.7"/></g>
    <g fill="${accent}">${[0, 90, 180, 270].map((a) => `<path d="M0 -9 L7 0 L0 9 L-7 0Z"
      transform="translate(${cx + r * Math.sin(a * Math.PI / 180)} ${cy - r * Math.cos(a * Math.PI / 180)}) rotate(${a}) scale(${k})"/>`).join('')}</g>`);
  const layers = [{ input: ring, left: 0, top: 0 }];
  const amp = `<span foreground="${accent}" size="${Math.round(120 * k * 1024)}">&amp;</span>`;
  const markup = initials.length >= 2 ? initials.map(escMarkup).join(amp) : escMarkup(initials[0] || '');
  if (markup) {
    const t = await fitText({ markup, size: Math.round(200 * k), color: letters }, 2 * r - 110 * k, 20);
    layers.push(at(t, cx - t.width / 2, cy - t.height / 2 + 4 * k));
  }
  return layers;
}

R.monogram = async (s) => finish(paperBg(),
  await monogram(s.initials, { cx: PW / 2, cy: PH / 2, r: 236, letters: s.theme.silk, accent: paperAccent(s.theme) }));

R.title = async (s) => {
  const { silk } = s.theme, accent = paperAccent(s.theme);
  const items = [{ layer: await lotus(accent, { scale: 1, rule: 150 }) }];
  if (s.names.length >= 2) {
    const markup = s.names.slice(0, -1).map(escMarkup).join(', ') +
      ` <span foreground="${accent}">&amp;</span> ` + escMarkup(s.names[s.names.length - 1]);
    items.push({ layer: await fitText({ markup, size: 190, color: silk }, PW - 520, 70), gap: 76 });
  } else {
    items.push({ layer: await textLayer({ text: s.title, size: 170, color: silk, width: PW - 520 }), gap: 76 });
  }
  if (s.line1) items.push({ layer: await fitText({ text: s.line1, font: 'mukta', size: 62, color: INK }, PW - 600), gap: 86 });
  if (s.line2) items.push({ layer: await fitText({ text: s.line2, font: 'mukta', size: 52, color: mix(INK, PAPER, 0.38) }, PW - 600), gap: 26 });
  return finish(paperBg(), stack(items, PW / 2, PH / 2 - 10));
};

R.divider = async (s) => {
  const { silk, accent } = s.theme;
  const items = [
    { layer: await lotus(accent, { scale: 1.5, rule: 120, line: mix(accent, silk, 0.3) }) },
    { layer: await fitText({ text: s.title, size: 250, color: JASMINE }, PW - 560, 80), gap: 70 },
  ];
  if (s.sub) items.push({ layer: await fitText({ text: s.sub, font: 'mukta', size: 54, color: mix(JASMINE, silk, 0.3) }, PW - 700), gap: 60 });
  return finish(silkBg(silk), stack(items, PW / 2, PH / 2));
};

R.full = async (s, ctx) => {
  const p = await photoLayer(ctx.photoFile(s.photo), PW, PH, 'centre');
  return finish(paperBg(), [at(p, 0, 0)]);
};

const PAIR = { m: 150, g: 64 };
R.pair = async (s, ctx) => {
  const { m, g } = PAIR;
  const w = (PW - 2 * m - g) / 2, h = PH - 2 * m;
  const layers = [];
  for (let i = 0; i < 2; i++) {
    const x = m + i * (w + g);
    layers.push(await shadow(x, m, w, h, { blur: 14, dy: 8, opacity: 0.16 }));
    layers.push(at(await photoLayer(ctx.photoFile(s.photos[i]), w, h, 'attention'), x, m));
  }
  return finish(paperBg(), layers);
};

R.single = async (s, ctx) => {
  // fit inside a generous mat, keep the photo's own ratio
  const boxW = PW - 2 * 560, boxH = PH - 2 * 230;
  const r = s.ratio;
  let w = boxH * r, h = boxH;
  if (w > boxW) { w = boxW; h = boxW / r; }
  const x = (PW - w) / 2, y = (PH - h) / 2;
  return finish(paperBg(), [
    await shadow(x, y, w, h, { blur: 16, dy: 10, opacity: 0.18 }),
    at(await photoLayer(ctx.photoFile(s.photo), w, h, 'centre'), x, y),
  ]);
};

R.closing = async (s) => {
  const { silk } = s.theme, accent = paperAccent(s.theme);
  const items = [
    { layer: await textLayer({ text: s.heading, size: 200, color: silk }) },
    { layer: await lotus(accent, { scale: 0.9, rule: 130 }), gap: 56 },
  ];
  if (s.line) items.push({ layer: await fitText({ text: s.line, font: 'mukta', size: 58, color: mix(INK, PAPER, 0.2) }, PW - 700), gap: 56 });
  return finish(paperBg(), stack(items, PW / 2, PH / 2));
};

R.blank = async () => finish(paperBg(), []);

R.insideBack = async (s) => {
  const accent = paperAccent(s.theme);
  if (!s.studio) return finish(paperBg(), []);
  const items = [
    { layer: await textLayer({ text: 'Photographs by', font: 'mukta', size: 44, color: mix(INK, PAPER, 0.42) }) },
    { layer: await fitText({ text: s.studio, font: 'muktaMedium', size: 64, color: INK }, PW - 800), gap: 22 },
    { layer: await rule(accent, 160), gap: 44 },
  ];
  return finish(paperBg(), stack(items, PW / 2, PH / 2));
};

R.back = async (s, ctx) => {
  const { silk, accent } = s.theme;
  const layers = await monogram(s.initials, { cx: PW / 2, cy: PH / 2 - 110, r: 170, letters: JASMINE, accent });
  const items = [];
  if (s.logo) {
    const logo = await sharp(ctx.mediaFile(s.logo)).resize(420, 180, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    items.push({ layer: { input: logo.data, width: logo.info.width, height: logo.info.height } });
  }
  if (s.studio) items.push({ layer: await fitText({ text: s.studio, size: 54, color: JASMINE }, PW - 900, 30), gap: items.length ? 36 : 0 });
  const sub = mix(JASMINE, silk, 0.32);
  for (const [i, line] of (s.contact || []).entries()) {
    items.push({ layer: await fitText({ text: line, font: 'mukta', size: 38, color: sub }, PW - 900), gap: i === 0 ? 34 : 20 });
  }
  if (items.length) {
    const total = items.reduce((a, it) => a + it.layer.height + (it.gap ?? 0), 0);
    layers.push(...stack(items, PW / 2, PH - 230 - total / 2));
  }
  return finish(silkBg(silk), layers);
};

/** Render one page spec. Returns { full, thumb } webp buffers. */
export async function renderPage(spec, ctx) {
  const fn = R[spec.kind];
  if (!fn) throw new Error(`unknown page kind ${spec.kind}`);
  return fn(spec, ctx);
}

export const isDark = (hex) => lum(hex) < 0.5;
