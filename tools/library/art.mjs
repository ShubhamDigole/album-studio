// Original ornaments for the album design library, drawn as single-colour SVG (fill #000, tinted by the editor via CSS mask)
// plus a few multi-colour illustrations. usage: node art.mjs <outDir> -> writes <outDir>/art/*.svg and art.json
import { writeFileSync, mkdirSync } from 'node:fs';
import * as G from './geo.mjs';
const { f, P, TAU, deg, place, bez, spiral, join, swash, taperEnd, taperBoth, taperStart, poly, smooth, petal, petalPts, petalRing, circle, ringPath, around, scallopRing, rng, svg, path } = G;

const out = process.argv[2];
mkdirSync(out + '/art', { recursive: true });
const ART = [];
function def(key, name, category, tags, vb, body, o = {}) {
  const s = svg(vb, body, o);
  const old = ART.findIndex((a) => a.key === key); if (old >= 0) ART.splice(old, 1);
  writeFileSync(`${out}/art/${key}.svg`, s);
  ART.push({ key, name, src: `/assets/library/art/${key}.svg`, tags, tint: o.tint !== false, category, ratio: (() => { const [, , w, h] = vb.split(' ').map(Number); return Math.round((w / h) * 1000) / 1000; })() });
}
const D = (d) => path(d);

// ---------- reusable motifs (return path data) ----------
function leafD(x, y, a, len, w, { vein = true, curve = 0 } = {}) {
  const pts = petalPts(len, w, { tip: 0.9, belly: 0.45 }).map(([px, py]) => [px + curve * Math.sin((-py / len) * Math.PI) * len * 0.12, py]);
  let d = poly(place(pts, x, y, a));
  if (vein && len > 14) {
    const v = place(petalPts(len * 0.72, Math.max(0.9, w * 0.09), { tip: 0.9, belly: 0.5 }).map(([px, py]) => [px + curve * Math.sin((-(py - len * 0.12) / len) * Math.PI) * len * 0.12, py - len * 0.12]), x, y, a);
    d += poly(v);
  }
  return d;
}
// a stem along pts with leaves alternating on both sides
function sprig(pts, { n = 7, len = 22, w = 9, stem = 2.6, leafAngle = 38, shrink = 0.55, endLeaf = true, curve = 0.3, kind = 'leaf' } = {}) {
  let d = swash(pts, stem, (t) => 1 - t * 0.6);
  const c = G.resample(pts, 100);
  for (let i = 1; i <= n; i++) {
    const t = 0.12 + (i / (n + 1)) * 0.86; const k = Math.round(t * 100);
    const p = c[k], q = c[Math.min(100, k + 1)], ang = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
    const side = i % 2 ? 1 : -1, sc = 1 - shrink * t;
    if (kind === 'round') d += circle(p[0] + Math.cos(ang - Math.PI / 2 + side * deg(70)) * len * sc * 0.55, p[1] + Math.sin(ang - Math.PI / 2 + side * deg(70)) * len * sc * 0.55, w * sc * 0.55) + '';
    else if (kind === 'berry') { d += leafD(p[0], p[1], ang + side * deg(leafAngle), len * sc, w * sc, { curve: side * curve }); if (i % 3 === 0) d += circle(p[0] - side * 6, p[1] - 4, 3.2); }
    else d += leafD(p[0], p[1], ang + side * deg(leafAngle), len * sc, w * sc, { curve: side * curve, vein: kind !== 'fern' });
  }
  if (endLeaf) { const p = c[100], q = c[97]; const ang = Math.atan2(p[1] - q[1], p[0] - q[0]) + Math.PI / 2; d += leafD(p[0], p[1], ang, len * (1 - shrink) * 1.1, w * (1 - shrink) * 1.1, { vein: kind !== 'fern' }); }
  return d;
}
// rosette: layered petals with outline and core (top view)
function rosette(cx, cy, r, n = 8, { core = 0.22, outline = true, inner = true, off = 0 } = {}) {
  let d = '';
  d += around(n, (a) => outline ? petalRing(cx + Math.sin(a) * r * core, cy - Math.cos(a) * r * core, a, r * (1 - core), r * 0.62 * (8 / n), r * 0.06, { round: true, tip: 0.9 }) : petal(cx + Math.sin(a) * r * core, cy - Math.cos(a) * r * core, a, r * (1 - core), r * 0.62 * (8 / n), { round: true }), off);
  if (inner) d += around(n, (a) => petal(cx + Math.sin(a) * r * core, cy - Math.cos(a) * r * core, a, r * (1 - core) * 0.55, r * 0.22 * (8 / n), { tip: 0.9 }), off);
  d += circle(cx, cy, r * core * 0.75);
  return d;
}
// marigold: ruffled pom-pom of small rounded petals in rings, seen from the top
function marigold(cx, cy, r, seed = 1) {
  const R = rng(seed); let d = '';
  const lite = r < 32; const rings = lite ? [[1, 14, 0.42], [0.62, 9, 0.42]] : [[1, 22, 0.32], [0.78, 18, 0.3], [0.56, 14, 0.3], [0.36, 10, 0.32]];
  for (const [k, n, wk] of rings) {
    d += around(n, (a) => { const j = (R() - 0.5) * 0.12; return petalRing(cx + Math.sin(a + j) * r * k * 0.45, cy - Math.cos(a + j) * r * k * 0.45, a + j, r * k * 0.55, r * wk * (k + 0.3) * 0.9, r * (lite ? 0.05 : 0.035), { round: true, tip: 1, n: lite ? 5 : 10 }); }, R() * 0.3);
  }
  d += circle(cx, cy, r * 0.12);
  return d;
}
// lotus side view
function lotus(cx, cy, s, { detail = true } = {}) {
  let d = '';
  const pet = (a, len, w, x0 = 0) => detail ? petalRing(cx + x0 * s, cy, deg(a), len * s, w * s, 3.2 * s, { tip: 0.8, belly: 0.45 }) + petal(cx + x0 * s, cy - 2 * s, deg(a), len * 0.5 * s, w * 0.22 * s) : petal(cx + x0 * s, cy, deg(a), len * s, w * s, { tip: 0.8 });
  d += pet(-68, 52, 30, -6) + pet(68, 52, 30, 6);
  d += pet(-40, 70, 36, -3) + pet(40, 70, 36, 3);
  d += pet(-14, 82, 38, -1) + pet(14, 82, 38, 1);
  d += pet(0, 92, 40);
  // base cup
  d += G.swash(bez([cx - 46 * s, cy + 4 * s], [cx - 20 * s, cy + 18 * s], [cx + 20 * s, cy + 18 * s], [cx + 46 * s, cy + 4 * s]), 5 * s, taperBoth);
  return d;
}
function paisleyPts(cx, cy, s, flip = 1) {
  const raw = [[0, 95], [-46, 72], [-66, 28], [-60, -20], [-36, -60], [-2, -84], [36, -100], [54, -92], [44, -78], [30, -66], [40, -40], [58, -4], [66, 36], [50, 76]];
  return raw.map(([x, y]) => [cx + x * s * flip, cy + y * s]);
}
function paisley(cx, cy, s, { flip = 1, fillInner = true, seed = 3 } = {}) {
  const o = paisleyPts(cx, cy, s, flip);
  const scale = (pts, k, dx = 0, dy = 0) => pts.map(([x, y]) => [cx + (x - cx) * k + dx * s * flip, cy + (y - cy) * k + dy * s]);
  let d = smooth(o) + smooth(scale(o, 0.86, -2, 6));            // outer band
  d += smooth(scale(o, 0.74, -3, 10)) + smooth(scale(o, 0.7, -3, 11));   // hairline
  if (fillInner) {
    const ic = [cx - 6 * s * flip, cy + 22 * s];
    d += rosette(ic[0], ic[1], 26 * s, 8, { core: 0.25 });
    // a chain of small teardrops rising to the tip
    for (let i = 0; i < 5; i++) { const t = i / 5; const x = cx + (-4 + t * 22) * s * flip, y = cy + (-14 - t * 58) * s; d += petal(x, y, deg(18 * flip + t * 30 * flip), (10 - t * 5) * s, (7 - t * 3) * s, { round: true }); }
    // dots inside the band
    const dots = G.resample(scale(o, 0.8, -2, 8).concat([scale(o, 0.8, -2, 8)[0]]), 46);
    dots.slice(0, 46).forEach((p, i) => { if (i % 2 === 0) d += circle(p[0], p[1], 1.6 * s); });
  }
  return d;
}
// C-scroll flourish built from tapering swashes
function scroll(x, y, s, flip = 1, rot = 0) {
  const T = (pts) => pts.map(([px, py]) => { const q = G.rotP([px * flip * s, py * s], rot); return [x + q[0], y + q[1]]; });
  let d = '';
  const main = join(bez([0, 0], [40, -10], [80, 20], [92, 52], 30), spiral([74, 56], 18, 4, 0, -TAU * 0.95, 40));
  d += swash(T(main), 7 * s, (t) => Math.pow(1 - t, 0.5) * Math.min(1, t * 6 + 0.25));
  const back = join(bez([6, 2], [-10, -24], [-34, -30], [-46, -12], 20), spiral([-36, -8], 10, 3, Math.PI, Math.PI + TAU * 0.8, 30));
  d += swash(T(back), 5 * s, (t) => Math.pow(1 - t, 0.6) * Math.min(1, t * 6 + 0.25));
  // leaf buds off the main curve
  const L = (px, py, a, len, w) => { const p = T([[px, py]])[0]; return leafD(p[0], p[1], rot + a * flip, len * s, w * s); };
  d += L(40, -4, deg(-20), 26, 11) + L(60, 4, deg(40), 20, 9) + L(22, 0, deg(-60), 16, 7);
  const dot = T([[100, 30]])[0]; d += circle(dot[0], dot[1], 3 * s);
  return d;
}

// ---------- MANDALAS ----------
function mandala(spec) {
  const c = 100; let d = '';
  for (const L of spec) {
    if (L.t === 'pet') d += around(L.n, (a) => (L.ring ? petalRing(c + Math.sin(a) * L.r, c - Math.cos(a) * L.r, a, L.len, L.w, L.th || 1.6, L.o || {}) : petal(c + Math.sin(a) * L.r, c - Math.cos(a) * L.r, a, L.len, L.w, L.o || {})), L.off || 0);
    if (L.t === 'dot') d += around(L.n, (a) => circle(c + Math.sin(a) * L.r, c - Math.cos(a) * L.r, L.s), L.off || 0);
    if (L.t === 'ring') d += ringPath(c, c, L.r, L.th);
    if (L.t === 'disc') d += circle(c, c, L.r);
    if (L.t === 'scal') d += scallopRing(c, c, L.r, L.n, L.depth, L.th);
    if (L.t === 'leaf') d += around(L.n, (a) => leafD(c + Math.sin(a) * L.r, c - Math.cos(a) * L.r, a, L.len, L.w), L.off || 0);
    if (L.t === 'spike') d += around(L.n, (a) => petal(c + Math.sin(a) * L.r, c - Math.cos(a) * L.r, a, L.len, L.w, { tip: 0.6, belly: 0.2 }), L.off || 0);
  }
  return d;
}
const MANDALAS = {
  'mandala-lotus': [{ t: 'disc', r: 6 }, { t: 'ring', r: 11, th: 1.4 }, { t: 'pet', n: 8, r: 13, len: 20, w: 11, ring: true, th: 1.4, o: { round: true } }, { t: 'dot', n: 16, r: 37, s: 1.6 },
    { t: 'pet', n: 16, r: 40, len: 22, w: 11, ring: true, th: 1.5 }, { t: 'pet', n: 16, r: 41, len: 10, w: 3, off: 0 }, { t: 'ring', r: 65, th: 1.2 },
    { t: 'pet', n: 16, r: 66, len: 26, w: 18, ring: true, th: 1.7, off: TAU / 32, o: { tip: 0.75 } }, { t: 'pet', n: 16, r: 68, len: 14, w: 5, off: TAU / 32 }, { t: 'dot', n: 16, r: 97, s: 1.8, off: TAU / 32 }],
  'mandala-sun': [{ t: 'disc', r: 9 }, { t: 'ring', r: 14, th: 2 }, { t: 'spike', n: 24, r: 17, len: 18, w: 5 }, { t: 'ring', r: 38, th: 1.2 }, { t: 'scal', r: 44, n: 24, depth: 4, th: 1.4 },
    { t: 'pet', n: 12, r: 52, len: 30, w: 20, ring: true, th: 1.8 }, { t: 'pet', n: 12, r: 55, len: 14, w: 6 }, { t: 'spike', n: 12, r: 60, len: 34, w: 6, off: TAU / 24 }, { t: 'dot', n: 24, r: 90, s: 2.2, off: TAU / 48 }],
  'mandala-marigold': [{ t: 'disc', r: 5 }, { t: 'pet', n: 6, r: 7, len: 16, w: 12, ring: true, th: 1.4, o: { round: true } }, { t: 'pet', n: 12, r: 24, len: 16, w: 10, ring: true, th: 1.3, o: { round: true }, off: TAU / 12 },
    { t: 'ring', r: 43, th: 1.3 }, { t: 'dot', n: 24, r: 48, s: 2 }, { t: 'pet', n: 24, r: 52, len: 18, w: 11, ring: true, th: 1.3, o: { round: true } }, { t: 'pet', n: 24, r: 54, len: 30, w: 4, off: TAU / 48 },
    { t: 'scal', r: 86, n: 24, depth: 6, th: 1.6 }],
  'mandala-star': [{ t: 'disc', r: 7 }, { t: 'pet', n: 8, r: 9, len: 30, w: 14, ring: true, th: 1.6, o: { tip: 0.7 } }, { t: 'pet', n: 8, r: 9, len: 22, w: 10, ring: true, th: 1.4, o: { tip: 0.7 }, off: TAU / 16 },
    { t: 'ring', r: 44, th: 1.4 }, { t: 'ring', r: 49, th: 0.8 }, { t: 'leaf', n: 16, r: 50, len: 24, w: 10 }, { t: 'spike', n: 16, r: 50, len: 44, w: 5, off: TAU / 32 }, { t: 'dot', n: 32, r: 80, s: 1.5 }],
  'mandala-jaali': [{ t: 'disc', r: 4 }, { t: 'ring', r: 8, th: 1.2 }, { t: 'pet', n: 6, r: 9, len: 22, w: 16, ring: true, th: 1.3, o: { round: true } }, { t: 'pet', n: 6, r: 9, len: 22, w: 16, ring: true, th: 1.3, o: { round: true }, off: TAU / 12 },
    { t: 'ring', r: 34, th: 1.6 }, { t: 'pet', n: 12, r: 36, len: 26, w: 20, ring: true, th: 1.4, o: { round: true } }, { t: 'pet', n: 12, r: 36, len: 26, w: 20, ring: true, th: 1.4, o: { round: true }, off: TAU / 24 },
    { t: 'ring', r: 64, th: 1.6 }, { t: 'scal', r: 70, n: 36, depth: 3, th: 1.2 }, { t: 'pet', n: 36, r: 76, len: 14, w: 7, o: { tip: 0.8 } }, { t: 'dot', n: 36, r: 95, s: 1.6 }],
  'mandala-petal-burst': [{ t: 'disc', r: 10 }, { t: 'ring', r: 14, th: 1 }, { t: 'pet', n: 10, r: 16, len: 34, w: 18, ring: true, th: 1.5, o: { tip: 0.85 } }, { t: 'pet', n: 10, r: 18, len: 20, w: 7, o: { tip: 0.85 } },
    { t: 'pet', n: 10, r: 30, len: 40, w: 22, ring: true, th: 1.5, o: { tip: 0.8 }, off: TAU / 20 }, { t: 'pet', n: 20, r: 70, len: 22, w: 9, o: { round: true } }, { t: 'dot', n: 20, r: 96, s: 2, off: TAU / 40 }],
};

// ---------- FRAMES ----------
function archPts(x0, y0, w, h, kind) {
  // returns centre line points of an arch outline (open at bottom) in a box
  const cx = x0 + w / 2, R = w / 2;
  const pts = [[x0, y0 + h]];
  if (kind === 'round') { pts.push([x0, y0 + R]); for (let i = 0; i <= 40; i++) { const a = Math.PI + (i / 40) * Math.PI; pts.push([cx + Math.cos(a) * R, y0 + R + Math.sin(a) * R]); } }
  if (kind === 'mughal') {   // pointed onion arch with an ogee tip
    const sh = h * 0.36; pts.push([x0, y0 + sh]);
    pts.push(...bez([x0, y0 + sh], [x0, y0 + sh * 0.35], [cx - w * 0.18, y0 + sh * 0.25], [cx - w * 0.06, y0 + sh * 0.08], 20).slice(1));
    pts.push(...bez([cx - w * 0.06, y0 + sh * 0.08], [cx - w * 0.02, y0 + sh * 0.03], [cx, y0 + 2], [cx, y0], 8).slice(1));
    const right = pts.slice().reverse().map(([x, y]) => [2 * cx - x, y]);
    return pts.concat(right.slice(1));
  }
  pts.push([x0 + w, y0 + R]); pts.push([x0 + w, y0 + h]);
  return pts;
}
const strokeLine = (pts, w) => swash(pts, w, () => 1, Math.max(60, pts.length));
function multifoil(cx, top, w, h, th) {
  // cusped (multifoil) arch: a row of lobes along a round arch
  const R = w / 2, cy = top + R; let d = '';
  const lobes = 7; const pts = [];
  for (let i = 0; i <= lobes * 16; i++) {
    const t = i / (lobes * 16), a = Math.PI + t * Math.PI, k = Math.abs(Math.sin(t * lobes * Math.PI));
    const rr = R - (1 - Math.pow(k, 0.5)) * w * 0.07;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const full = [[cx - R, top + h]].concat(pts).concat([[cx + R, top + h]]);
  d += strokeLine(full, th);
  return d;
}

// ---------- write everything ----------
// MANDALAS
for (const [k, spec] of Object.entries(MANDALAS)) def(k, k.replace('mandala-', '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) + ' mandala', 'mandalas', ['mandala', 'round', 'rangoli'], '0 0 200 200', D(mandala(spec)));
// quarter-mandala corner (cut from the lotus mandala, centred on the corner)
def('corner-mandala-quarter', 'Quarter mandala corner', 'corners', ['corner', 'mandala'], '0 0 200 200', `<g transform="translate(-200 -200) scale(2)">${D(mandala(MANDALAS['mandala-lotus']))}</g>`);

// FLORALS
def('marigold', 'Marigold', 'florals', ['marigold', 'genda', 'flower', 'haldi', 'mehendi'], '0 0 200 200', D(marigold(100, 100, 96, 4)));
def('lotus', 'Lotus', 'florals', ['lotus', 'kamal', 'flower'], '0 0 200 160', D(lotus(100, 128, 1.15)));
def('lotus-simple', 'Lotus line', 'florals', ['lotus', 'flower', 'minimal'], '0 0 200 160', D(lotus(100, 128, 1.15, { detail: false })));
def('rosette', 'Rosette flower', 'florals', ['flower', 'rose', 'round'], '0 0 200 200', D(rosette(100, 100, 96, 8) + rosette(100, 100, 40, 8, { core: 0.3, off: TAU / 16 })));
def('jasmine', 'Jasmine', 'florals', ['mogra', 'jasmine', 'flower'], '0 0 200 200', D(around(5, (a) => petalRing(100 + Math.sin(a) * 10, 100 - Math.cos(a) * 10, a, 86, 46, 4, { round: true, tip: 0.95 })) + around(5, (a) => petal(100 + Math.sin(a) * 12, 100 - Math.cos(a) * 12, a, 40, 4)) + circle(100, 100, 9)));
// rose (spiral of petal arcs, top view)
{
  let d = ''; const c = [100, 100];
  for (let i = 0; i < 9; i++) { const r = 14 + i * 9.5, a0 = i * 2.1; d += swash(spiral(c, r, r * 1.08, a0, a0 + Math.PI * (1.1 + i * 0.04), 30), 5 + i * 0.5, taperBoth); }
  d += circle(100, 100, 6);
  def('rose', 'Rose', 'florals', ['rose', 'gulab', 'flower', 'romance'], '0 0 200 200', D(d));
}
// sprigs and branches
def('sprig-olive', 'Olive sprig', 'florals', ['leaves', 'botanical', 'sprig', 'minimal'], '0 0 120 240', D(sprig(bez([60, 236], [52, 170], [70, 100], [58, 12]), { n: 10, len: 40, w: 12, leafAngle: 34, shrink: 0.5 })));
def('sprig-eucalyptus', 'Eucalyptus sprig', 'florals', ['leaves', 'botanical', 'sprig'], '0 0 140 240', D(sprig(bez([70, 236], [62, 170], [82, 100], [66, 14]), { n: 9, len: 44, w: 34, leafAngle: 70, shrink: 0.5, curve: 0 })));
def('sprig-fern', 'Fern', 'florals', ['leaves', 'botanical', 'fern'], '0 0 140 240', D(sprig(bez([70, 236], [60, 160], [86, 90], [70, 8]), { n: 26, len: 46, w: 9, leafAngle: 62, shrink: 0.75, kind: 'fern' })));
def('sprig-berries', 'Berry sprig', 'florals', ['leaves', 'botanical', 'berries'], '0 0 140 240', D(sprig(bez([70, 236], [62, 170], [80, 100], [64, 12]), { n: 8, len: 40, w: 15, leafAngle: 44, shrink: 0.45, kind: 'berry' })));
def('branch-curved', 'Curved leafy branch', 'florals', ['leaves', 'botanical', 'branch', 'corner'], '0 0 240 160', D(sprig(bez([8, 150], [60, 140], [150, 110], [232, 20]), { n: 12, len: 34, w: 13, leafAngle: 40, shrink: 0.55 })));
def('leaf-pair', 'Pair of leaves', 'florals', ['leaves', 'botanical', 'minimal'], '0 0 200 140', D(leafD(100, 130, deg(-50), 120, 46, { curve: 0.4 }) + leafD(100, 130, deg(40), 96, 38, { curve: -0.4 }) + swash([[100, 130], [100, 138]], 4)));
def('vine-swirl', 'Vine swirl', 'florals', ['vine', 'leaves', 'flourish'], '0 0 260 140', D(swash(join(bez([6, 110], [60, 130], [120, 120], [150, 70], 30), spiral([180, 70], 30, 8, Math.PI, Math.PI + TAU * 0.9, 40)), 5, (t) => Math.pow(1 - t, 0.5) * Math.min(1, t * 6 + 0.3)) +
  leafD(60, 120, deg(-30), 30, 12) + leafD(95, 112, deg(60), 26, 11) + leafD(130, 96, deg(-10), 28, 11) + leafD(40, 118, deg(70), 22, 9) + circle(214, 92, 4) + circle(224, 104, 2.6)));
// marigold garland strand (hanging) and toran
function strand(x, top, n, r, seed) {
  let d = swash([[x, top], [x, top + 12]], 2.2, () => 1);
  for (let i = 0; i < n; i++) d += marigold(x, top + 12 + r + i * r * 1.75, r, seed + i);
  const end = top + 12 + r + (n - 1) * r * 1.75 + r;
  d += leafD(x, end - 2, deg(180), r * 1.6, r * 0.9) + circle(x, end + r * 1.8, r * 0.25);
  return d;
}
def('marigold-strand', 'Marigold strand', 'florals', ['marigold', 'garland', 'haldi', 'mehendi', 'hanging'], '0 0 60 400', D(strand(30, 0, 6, 26, 9)));
{
  // toran: a string of hanging marigold strands under a scalloped rope with mango leaves
  let d = ''; const W = 600;
  d += swash(bez([0, 14], [200, 30], [400, 30], [600, 14]), 3.5, () => 1);
  for (let i = 0; i < 9; i++) { const x = 30 + i * 67.5; const len = i % 2 ? 3 : 4; d += strand(x, 18, len, 13, 20 + i); }
  for (let i = 0; i < 8; i++) { const x = 64 + i * 67.5; d += leafD(x, 22, deg(180), 46, 18) ; }
  def('toran-marigold', 'Marigold toran', 'borders', ['toran', 'marigold', 'garland', 'haldi', 'mehendi', 'top'], `0 0 ${W} 220`, D(d));
}
// rose cluster / bouquet corner
{
  let d = rosette(80, 82, 46, 8) + rosette(132, 120, 28, 7, { off: 0.3 }) + rosette(42, 138, 24, 6, { off: 0.2 });
  d += sprig(bez([110, 70], [150, 50], [180, 40], [196, 12]), { n: 5, len: 24, w: 10, shrink: 0.4 }) + sprig(bez([60, 120], [40, 160], [20, 180], [6, 196]), { n: 5, len: 24, w: 10, shrink: 0.4 });
  def('floral-cluster', 'Floral cluster', 'florals', ['flowers', 'bouquet', 'corner'], '0 0 200 200', D(d));
}

// CORNERS
def('corner-scroll', 'Scroll corner', 'corners', ['corner', 'flourish', 'classic'], '0 0 200 200', D(scroll(14, 14, 1.25, 1, deg(0)) + scroll(14, 14, 1.25, -1, deg(90)) + circle(16, 16, 8) + ringPath(16, 16, 14, 1.6)));
{
  let d = ''; // paisley corner: paisley in the corner with vines on both edges
  d += `<g transform="rotate(-45 64 64)">${path(paisley(64, 64, 0.52))}</g>`;
  def('corner-paisley', 'Paisley corner', 'corners', ['corner', 'paisley', 'mehendi'], '0 0 200 200', d + D(sprig(bez([110, 18], [140, 14], [170, 16], [196, 10]), { n: 6, len: 18, w: 7, shrink: 0.4 }) + sprig(bez([18, 110], [14, 140], [16, 170], [10, 196]), { n: 6, len: 18, w: 7, shrink: 0.4 })));
}
def('corner-floral', 'Floral corner', 'corners', ['corner', 'flowers', 'leaves'], '0 0 200 200', D(rosette(34, 34, 30, 8) + sprig(bez([60, 30], [100, 22], [150, 28], [196, 14]), { n: 8, len: 26, w: 10, shrink: 0.5 }) + sprig(bez([30, 60], [22, 100], [28, 150], [14, 196]), { n: 8, len: 26, w: 10, shrink: 0.5 }) + rosette(120, 22, 12, 6) + rosette(22, 120, 12, 6)));
def('corner-lotus', 'Lotus corner', 'corners', ['corner', 'lotus'], '0 0 200 200', `<g transform="rotate(135 70 70) translate(-30 -60)">${D(lotus(100, 128, 0.62))}</g>` + D(strokeLine([[6, 150], [6, 6], [150, 6]], 2.4) + strokeLine([[16, 120], [16, 16], [120, 16]], 1.2) + circle(150, 6, 4) + circle(6, 150, 4)));
{
  // art-deco corner: stepped lines with a fan
  let d = '';
  for (let i = 0; i < 4; i++) d += strokeLine([[8 + i * 9, 196], [8 + i * 9, 8 + i * 9], [196, 8 + i * 9]], i === 0 ? 2.6 : 1.2);
  d += around(7, (a) => petal(52, 52, a, 42, 10, { tip: 0.7 }), 0).replace(/^/, '');
  def('corner-deco', 'Deco fan corner', 'corners', ['corner', 'deco', 'modern', 'lines'], '0 0 200 200', D(d) );
}
def('corner-sprig', 'Leafy sprig corner', 'corners', ['corner', 'botanical', 'leaves', 'minimal'], '0 0 200 200', D(sprig(bez([8, 192], [10, 120], [60, 40], [190, 10]), { n: 12, len: 30, w: 11, shrink: 0.55, leafAngle: 42 })));
def('corner-line', 'Double line corner', 'corners', ['corner', 'lines', 'minimal', 'frame'], '0 0 200 200', D(strokeLine([[6, 200], [6, 6], [200, 6]], 2.2) + strokeLine([[14, 200], [14, 14], [200, 14]], 0.9) + petal(14, 14, deg(135), 30, 12) + circle(30, 30, 3)));

// DIVIDERS (wide, short)
{
  const c = 300;
  const tw = (x0, x1, y, w0) => swash([[x0, y], [x1, y]], w0, (t) => Math.pow(1 - t, 1.4) + 0.02);
  def('divider-lotus', 'Lotus divider', 'dividers', ['divider', 'lotus', 'line'], '0 0 600 90', D(lotus(c, 66, 0.55) + tw(c - 58, 20, 66, 3) + tw(c + 58, 580, 66, 3) + circle(c - 64, 66, 3) + circle(c + 64, 66, 3)));
  def('divider-scroll', 'Scroll divider', 'dividers', ['divider', 'flourish', 'classic'], '0 0 600 110', D(scroll(c, 55, 0.95, 1, deg(-20)) + scroll(c, 55, 0.95, -1, deg(20)) + G.petal(c, 70, 0, 34, 16) + tw(c - 110, 40, 58, 2.4) + tw(c + 110, 560, 58, 2.4)));
  def('divider-diamond', 'Diamond and dots divider', 'dividers', ['divider', 'minimal', 'line'], '0 0 600 40', D(poly([[c, 6], [c + 14, 20], [c, 34], [c - 14, 20]]) + poly([[c, 12], [c + 8, 20], [c, 28], [c - 8, 20]]) + circle(c - 30, 20, 3) + circle(c + 30, 20, 3) + circle(c - 44, 20, 2) + circle(c + 44, 20, 2) + tw(c - 56, 10, 20, 2.2) + tw(c + 56, 590, 20, 2.2)));
  def('divider-paisley', 'Paisley pair divider', 'dividers', ['divider', 'paisley', 'mehendi'], '0 0 600 120', `<g transform="translate(${c - 62} 60) rotate(-90) translate(-100 -100)">${path(paisley(100, 100, 0.42))}</g><g transform="translate(${c + 62} 60) rotate(90) scale(-1 1) translate(-100 -100)">${path(paisley(100, 100, 0.42))}</g>` + D(circle(c, 60, 6) + tw(c - 120, 30, 60, 2.4) + tw(c + 120, 570, 60, 2.4)));
  def('divider-vine', 'Leaf vine divider', 'dividers', ['divider', 'leaves', 'botanical'], '0 0 600 80', D(sprig(bez([c, 40], [c - 80, 30], [c - 180, 50], [c - 290, 40]), { n: 12, len: 22, w: 9, shrink: 0.5, endLeaf: true }) + sprig(bez([c, 40], [c + 80, 30], [c + 180, 50], [c + 290, 40]), { n: 12, len: 22, w: 9, shrink: 0.5 }) + rosette(c, 40, 16, 6)));
  def('divider-beads', 'Bead string divider', 'dividers', ['divider', 'beads', 'pearls', 'minimal'], '0 0 600 40', D(Array.from({ length: 29 }, (_, i) => { const x = 20 + i * 20; const k = 1 - Math.abs(i - 14) / 14; return circle(x, 20, 2 + k * 4.5); }).join('')));
  def('divider-marigold', 'Marigold divider', 'dividers', ['divider', 'marigold', 'haldi'], '0 0 600 90', D(marigold(c, 45, 30, 31) + marigold(c - 62, 45, 18, 32) + marigold(c + 62, 45, 18, 33) + leafD(c - 90, 45, deg(-90), 40, 14) + leafD(c + 90, 45, deg(90), 40, 14) + tw(c - 132, 20, 45, 2.4) + tw(c + 132, 580, 45, 2.4)));
}

// BORDERS (long bands that tile along their length)
{
  const band = (n, w, h, cell) => { let d = ''; for (let i = 0; i < n; i++) d += cell(i * w + w / 2, h / 2); return d; };
  const W = 800;
  def('border-paisley', 'Paisley band', 'borders', ['border', 'band', 'paisley'], `0 0 ${W} 100`, D(strokeLine([[0, 6], [W, 6]], 2) + strokeLine([[0, 94], [W, 94]], 2) + band(8, 100, 100, (x, y) => '') + Array.from({ length: 8 }, (_, i) => '').join('')) + Array.from({ length: 8 }, (_, i) => `<g transform="translate(${50 + i * 100} 50) rotate(${i % 2 ? 90 : -90}) scale(0.3) translate(-100 -100)">${path(paisley(100, 100, 1, { flip: i % 2 ? -1 : 1 }))}</g>`).join(''));
  def('border-lotus', 'Lotus band', 'borders', ['border', 'band', 'lotus'], `0 0 ${W} 90`, D(strokeLine([[0, 84], [W, 84]], 2.4) + strokeLine([[0, 76], [W, 76]], 1) + band(10, 80, 90, (x) => lotus(x, 70, 0.4)) + band(10, 80, 90, (x) => circle(x + 40, 60, 3))));
  def('border-scallop-lace', 'Scallop lace edge', 'borders', ['border', 'lace', 'scallop', 'edge'], `0 0 ${W} 60`, D(poly([[0, 0], [W, 0], ...Array.from({ length: 81 }, (_, i) => { const x = W - i * 10; return [x, 30 + 14 * Math.abs(Math.sin((i * Math.PI) / 4))]; }), [0, 30]]) + Array.from({ length: 20 }, (_, i) => circle(20 + i * 40, 18, 4)).join('') + Array.from({ length: 20 }, (_, i) => circle(20 + i * 40, 52, 2.4)).join('')));
  def('border-marigold', 'Marigold garland band', 'borders', ['border', 'band', 'marigold', 'garland', 'haldi'], `0 0 ${W} 70`, D(band(14, W / 14, 70, (x, y) => marigold(x, y, 26, Math.round(x))) + band(14, W / 14, 70, (x, y) => leafD(x + W / 28, y + 4, deg(180), 24, 10))));
  def('border-jaali', 'Jaali lattice band', 'borders', ['border', 'band', 'jaali', 'geometric'], `0 0 ${W} 80`, D(strokeLine([[0, 3], [W, 3]], 2) + strokeLine([[0, 77], [W, 77]], 2) + band(20, 40, 80, (x, y) => {
    const s = 18; return strokeLine([[x - s, y], [x, y - s], [x + s, y], [x, y + s], [x - s, y]], 1.6) + circle(x, y, 3.2) + circle(x + 20, y - 22, 2) + circle(x + 20, y + 22, 2);
  })));
}

// FRAMES
{
  // jharokha arch frame: double mughal arch with dome finial and base ledge
  const outer = archPts(20, 40, 260, 340, 'mughal'), inner = archPts(32, 54, 236, 318, 'mughal');
  let d = strokeLine(outer, 5) + strokeLine(inner, 1.6);
  d += petal(150, 40, 0, 30, 10, { tip: 0.6 }) + circle(150, 6, 4);
  d += swash([[8, 382], [292, 382]], 6, () => 1) + swash([[16, 392], [284, 392]], 2, () => 1);
  d += leafD(150, 64, 0, 0.1, 0.1, { vein: false });
  def('frame-jharokha', 'Jharokha arch frame', 'frames', ['frame', 'arch', 'jharokha', 'mughal', 'window'], '0 0 300 400', D(d));
  def('frame-arch-double', 'Double line arch', 'frames', ['frame', 'arch', 'minimal'], '0 0 300 400', D(strokeLine(archPts(10, 10, 280, 380, 'round'), 3) + strokeLine(archPts(22, 22, 256, 368, 'round'), 1.2) + petal(150, 10, Math.PI, 0.1, 0.1)));
  def('frame-multifoil', 'Cusped arch frame', 'frames', ['frame', 'arch', 'mughal', 'palace'], '0 0 300 400', D(multifoil(150, 14, 272, 376, 4) + multifoil(150, 30, 240, 360, 1.4) + strokeLine([[6, 392], [294, 392]], 4)));
  // round ornate frame
  let r = ringPath(150, 150, 130, 3) + ringPath(150, 150, 120, 1.2) + around(48, (a) => circle(150 + Math.cos(a) * 138, 150 + Math.sin(a) * 138, 2.2));
  r += around(4, (a) => `${lotus(0, 0, 0) /* noop */}`, 0);
  [[150, 10, 0], [290, 150, 90], [150, 290, 180], [10, 150, 270]].forEach(([x, y, a]) => { r += petal(x, y + (a === 0 ? 14 : a === 180 ? -14 : 0) , deg(a + 180), 0.1, 0.1); });
  r += around(4, (a) => petalRing(150 + Math.sin(a) * 118, 150 - Math.cos(a) * 118, a, 30, 22, 2.4, { round: true }) + petal(150 + Math.sin(a) * 122, 150 - Math.cos(a) * 122, a, 16, 6));
  def('frame-round-ornate', 'Ornate round frame', 'frames', ['frame', 'round', 'circle', 'classic'], '0 0 300 300', D(r));
  def('frame-scalloped', 'Scalloped circle frame', 'frames', ['frame', 'round', 'scallop', 'lace'], '0 0 300 300', D(scallopRing(150, 150, 128, 28, 10, 3) + ringPath(150, 150, 120, 1.2) + around(28, (a) => circle(150 + Math.cos(a) * 112, 150 + Math.sin(a) * 112, 1.8), TAU / 56)));
  // wreath frame: two leafy branches around a circle
  const arc = (a0, a1, rr) => Array.from({ length: 41 }, (_, i) => { const a = a0 + (a1 - a0) * (i / 40); return [150 + Math.cos(a) * rr, 150 + Math.sin(a) * rr]; });
  def('frame-wreath', 'Leaf wreath', 'frames', ['frame', 'wreath', 'leaves', 'botanical', 'round'], '0 0 300 300', D(sprig(arc(deg(100), deg(255), 124), { n: 16, len: 28, w: 11, shrink: 0.35, leafAngle: 40 }) + sprig(arc(deg(80), deg(-75), 124), { n: 16, len: 28, w: 11, shrink: 0.35, leafAngle: 40 }) + rosette(150, 274, 14, 6)));
  // double line rectangle frame with corner squares
  const R = (x, y, w, h, t) => strokeLine([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], t);
  def('frame-double-line', 'Double line frame', 'frames', ['frame', 'rectangle', 'lines', 'minimal'], '0 0 300 400', D(R(6, 6, 288, 388, 3) + R(16, 16, 268, 368, 1.1) + [[16, 16], [284, 16], [16, 384], [284, 384]].map(([x, y]) => poly([[x, y - 7], [x + 7, y], [x, y + 7], [x - 7, y]])).join('')));
  def('frame-corners-ornate', 'Frame with scroll corners', 'frames', ['frame', 'rectangle', 'classic', 'flourish'], '0 0 300 400', `<g>${D(R(20, 20, 260, 360, 1.6))}</g>` + [[0, 0, 1, 1], [300, 0, -1, 1], [0, 400, 1, -1], [300, 400, -1, -1]].map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx * 0.5} ${sy * 0.5})">${path(scroll(14, 14, 1.25, 1, 0) + scroll(14, 14, 1.25, -1, deg(90)) + circle(16, 16, 8))}</g>`).join(''));
  const hex = Array.from({ length: 7 }, (_, i) => { const a = deg(-90 + i * 60); return [150 + Math.cos(a) * 140, 150 + Math.sin(a) * 140]; });
  def('frame-hexagon', 'Hexagon line frame', 'frames', ['frame', 'hexagon', 'geometric', 'modern'], '0 0 300 300', D(strokeLine(hex, 2.4) + sprig(bez([40, 236], [70, 270], [110, 286], [150, 290]), { n: 7, len: 20, w: 8, shrink: 0.4 }) + sprig(bez([50, 70], [60, 40], [90, 20], [120, 16]), { n: 5, len: 18, w: 7, shrink: 0.4 })));
  def('frame-mandala-ring', 'Mandala ring frame', 'frames', ['frame', 'round', 'mandala'], '0 0 300 300', D(ringPath(150, 150, 112, 2) + around(32, (a) => petalRing(150 + Math.sin(a) * 114, 150 - Math.cos(a) * 114, a, 26, 13, 1.6, { tip: 0.8 })) + around(32, (a) => circle(150 + Math.sin(a) * 146, 150 - Math.cos(a) * 146, 1.8), TAU / 64) + ringPath(150, 150, 104, 1)));
  def('frame-oval-pearl', 'Pearl oval frame', 'frames', ['frame', 'oval', 'pearls', 'classic'], '0 0 240 320', D(Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * TAU; return circle(120 + Math.cos(a) * 110, 160 + Math.sin(a) * 150, 4.2); }).join('') + strokeLine(Array.from({ length: 121 }, (_, i) => { const a = (i / 120) * TAU; return [120 + Math.cos(a) * 100, 160 + Math.sin(a) * 140]; }), 1.2)));
}

// MOTIFS
def('paisley', 'Paisley', 'motifs', ['paisley', 'kairi', 'mehendi', 'buta'], '0 0 200 220', D(paisley(100, 112, 1)));
def('paisley-simple', 'Paisley outline', 'motifs', ['paisley', 'minimal'], '0 0 200 220', D(smooth(paisleyPts(100, 112, 1)) + smooth(paisleyPts(100, 112, 0.9).map(([x, y]) => [x - 2, y + 4])) + circle(94, 140, 14)));
{
  // kalash: pot with mango leaves and coconut
  let d = '';
  const pot = [[60, 120], [44, 150], [40, 190], [56, 226], [84, 244], [116, 244], [144, 226], [160, 190], [156, 150], [140, 120]];
  d += smooth(pot) + smooth(pot.map(([x, y]) => [100 + (x - 100) * 0.9, 186 + (y - 186) * 0.9]));
  d += swash([[52, 120], [148, 120]], 10, () => 1) + swash([[66, 108], [134, 108]], 6, () => 1);
  d += swash(bez([46, 180], [80, 196], [120, 196], [154, 180]), 3, () => 1) + around(1, () => '');
  for (let i = 0; i < 5; i++) d += circle(64 + i * 18, 202 + Math.sin((i / 4) * Math.PI) * 6, 3.2);
  d += circle(100, 226, 0.1);
  // leaves
  [-62, -36, -12, 12, 36, 62].forEach((a, i) => { d += leafD(100 + a * 0.5, 106, deg(a * 1.1), 52 - Math.abs(a) * 0.2, 18); });
  d += smooth([[100, 18], [124, 40], [128, 70], [112, 92], [88, 92], [72, 70], [76, 40]]) + swash(bez([90, 30], [100, 46], [96, 64], [104, 84]), 2, taperBoth);
  d += swash(spiral([100, 160], 20, 6, 0, TAU * 1.1, 40), 2.4, taperEnd);
  def('kalash', 'Kalash', 'motifs', ['kalash', 'pot', 'ceremony', 'griha pravesh'], '0 0 200 260', D(d));
}
{
  // diya with flame
  let d = smooth([[20, 120], [60, 150], [140, 150], [180, 120], [178, 112], [150, 118], [100, 122], [50, 118], [22, 112]]);
  d += swash(bez([30, 130], [70, 142], [130, 142], [170, 130]), 2, taperBoth);
  d += smooth([[100, 20], [114, 56], [118, 84], [100, 108], [82, 84], [86, 56]]) + smooth([[100, 52], [108, 76], [100, 98], [92, 76]]);
  d += swash(bez([84, 120], [96, 114], [104, 114], [116, 120]), 3, taperBoth);
  d += around(3, () => '') + [[50, 176], [100, 186], [150, 176]].map(([x, y]) => '').join('');
  def('diya', 'Diya', 'motifs', ['diya', 'lamp', 'diwali', 'festive'], '0 0 200 160', D(d));
}
{
  // peacock feather: eye + barbs
  let d = '';
  d += smooth([[100, 40], [130, 62], [134, 100], [100, 124], [66, 100], [70, 62]]) + smooth([[100, 54], [120, 70], [122, 98], [100, 112], [78, 98], [80, 70]]);
  d += smooth([[100, 66], [112, 78], [110, 98], [100, 104], [90, 98], [88, 78]]);
  d += swash(bez([100, 116], [102, 200], [96, 300], [104, 390]), 4, (t) => 1 - t * 0.6);
  for (let i = 0; i < 46; i++) {
    const t = i / 46, y = 30 + t * 330, side = i % 2 ? 1 : -1, len = 74 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) + 10;
    const x0 = 100 + side * 2, ang = side * (0.75 + t * 0.5);
    d += swash(bez([x0, y + 20], [x0 + side * len * 0.4, y + 10], [x0 + side * len * 0.8, y + 4 + t * 20], [x0 + side * len, y + 14 + t * 30]), 1.6, taperEnd);
  }
  def('peacock-feather', 'Peacock feather', 'motifs', ['peacock', 'feather', 'mor pankh'], '0 0 200 400', D(d));
}
{
  // jhumka earring
  let d = circle(100, 20, 10) + ringPath(100, 20, 15, 2) + swash([[100, 35], [100, 52]], 3, () => 1);
  d += smooth([[100, 52], [146, 80], [164, 140], [36, 140], [54, 80]]) + smooth([[100, 62], [138, 86], [152, 132], [48, 132], [62, 86]]);
  d += around(6, (a) => '') + petal(100, 132, 0, 50, 26, { round: true });
  for (let i = 0; i < 13; i++) { const x = 40 + i * 10; d += swash([[x, 142], [x, 160 + Math.sin((i / 12) * Math.PI) * 14]], 1.4, () => 1) + circle(x, 166 + Math.sin((i / 12) * Math.PI) * 14, 3.6); }
  def('jhumka', 'Jhumka earring', 'motifs', ['jhumka', 'jewellery', 'bride'], '0 0 200 200', D(d));
}
{
  // hanging lantern
  let d = swash([[100, 0], [100, 30]], 2.4, () => 1) + ringPath(100, 36, 6, 2);
  d += poly([[70, 48], [130, 48], [140, 60], [60, 60]]) + smooth([[60, 62], [140, 62], [150, 120], [136, 176], [64, 176], [50, 120]]) + smooth([[70, 74], [130, 74], [138, 120], [126, 164], [74, 164], [62, 120]]);
  d += smooth([[100, 84], [112, 108], [116, 130], [100, 154], [84, 130], [88, 108]]);
  d += poly([[64, 178], [136, 178], [124, 192], [76, 192]]) + swash([[100, 192], [100, 214]], 2, () => 1) + petal(100, 214, Math.PI, 30, 12);
  def('lantern', 'Hanging lantern', 'motifs', ['lantern', 'kandil', 'diwali', 'sangeet', 'lights'], '0 0 200 250', D(d));
}
{
  // wedding rings
  let d = ringPath(78, 120, 52, 9) + ringPath(78, 120, 52, 0.1) + ringPath(124, 120, 52, 9);
  d += poly([[124, 50], [136, 60], [124, 76], [112, 60]]) + poly([[116, 52], [132, 52], [138, 60], [110, 60]]);
  def('rings', 'Wedding rings', 'motifs', ['rings', 'engagement', 'ring ceremony', 'wedding'], '0 0 200 190', D(d));
}
{
  const heart = (cx, cy, s) => [[cx, cy + 40 * s], [cx - 44 * s, cy], [cx - 40 * s, cy - 30 * s], [cx - 16 * s, cy - 38 * s], [cx, cy - 22 * s], [cx + 16 * s, cy - 38 * s], [cx + 40 * s, cy - 30 * s], [cx + 44 * s, cy]];
  const hp = (cx, cy, s) => smooth(heart(cx, cy, s)).replace(/C[^C]*Z$/, (m) => m);
  def('heart-outline', 'Heart outline', 'motifs', ['heart', 'love', 'romance', 'minimal'], '0 0 200 180', D(smooth(heart(100, 90, 2)) + smooth(heart(100, 92, 1.84))));
  def('heart-ornate', 'Ornate heart', 'motifs', ['heart', 'love', 'flourish'], '0 0 200 180', D(smooth(heart(100, 90, 1.5)) + smooth(heart(100, 92, 1.36)) + smooth(heart(100, 90, 1.1)) + scroll(100, 156, 0.55, 1, deg(-60)) + scroll(100, 156, 0.55, -1, deg(60))));
  def('hearts-trio', 'Three hearts', 'celebration', ['hearts', 'love', 'anniversary'], '0 0 200 120', D(smooth(heart(60, 66, 0.8)) + smooth(heart(110, 52, 1.05)) + smooth(heart(110, 54, 0.9)) + smooth(heart(156, 74, 0.6))));
}
{
  // love birds: two small birds facing each other on a branch
  const bird = (x, y, s, dir) => {
    const B = [[0, 0], [18, -14], [40, -16], [56, -8], [66, -22], [74, -20], [70, -6], [60, 10], [36, 22], [10, 20], [-18, 26], [-8, 12]];
    const pts = B.map(([px, py]) => [x + px * s * dir, y + py * s]);
    let d = smooth(pts);
    d += smooth([[16, 4], [36, -4], [48, 6], [30, 14]].map(([px, py]) => [x + px * s * dir, y + py * s]));
    d += circle(x + 62 * s * dir, y - 14 * s, 1.6 * s) + poly([[74, -20], [84, -16], [74, -13]].map(([px, py]) => [x + px * s * dir, y + py * s]));
    return d;
  };
  def('love-birds', 'Love birds', 'motifs', ['birds', 'love', 'couple', 'romance'], '0 0 240 150', D(bird(30, 92, 1.1, 1) + bird(210, 92, 1.1, -1) + swash(bez([10, 124], [80, 112], [160, 112], [230, 124]), 4, (t) => 1 - t * 0.5) + leafD(60, 118, deg(-150), 24, 10) + leafD(180, 118, deg(150), 24, 10) + smooth([[120, 58], [104, 44], [108, 30], [120, 36], [132, 30], [136, 44]])));
}
{
  // damask medallion (mirror symmetric)
  let half = '';
  half += swash(join(bez([100, 30], [70, 50], [56, 90], [70, 120], 30), spiral([84, 112], 14, 4, Math.PI, Math.PI + TAU * 0.8, 30)), 5, (t) => Math.pow(1 - t, 0.5) + 0.05);
  half += swash(join(bez([100, 190], [70, 176], [54, 150], [64, 132], 20), spiral([76, 140], 10, 3, Math.PI, Math.PI - TAU * 0.8, 30)), 4, (t) => Math.pow(1 - t, 0.5) + 0.05);
  half += leafD(70, 60, deg(-40), 40, 14, { curve: 0.4 }) + leafD(58, 168, deg(-140), 30, 12);
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => f(200 - +x) + ' ' + y);
  let d = half + mirror(half) + petalRing(100, 140, 0, 80, 44, 3, { tip: 0.8 }) + petal(100, 130, 0, 46, 16, { tip: 0.8 }) + rosette(100, 180, 14, 6) + petal(100, 60, 0, 34, 12, { tip: 0.6 });
  def('damask-motif', 'Damask motif', 'motifs', ['damask', 'classic', 'medallion'], '0 0 200 210', D(d));
}
{
  // mango (kairi) and conch-free bandhan: a simple mango leaf pair (torana leaves)
  def('mango-leaves', 'Mango leaves', 'motifs', ['mango leaves', 'toran', 'auspicious'], '0 0 300 120', D(swash([[0, 10], [300, 10]], 3, () => 1) + Array.from({ length: 7 }, (_, i) => leafD(24 + i * 42, 12, Math.PI, 90 - (i % 2) * 20, 26)).join('')));
}
// monogram rings / dots
def('monogram-ring', 'Monogram ring', 'stickers', ['monogram', 'initials', 'circle', 'minimal'], '0 0 200 200', D(ringPath(100, 100, 92, 2.4) + ringPath(100, 100, 84, 0.9) + around(4, (a) => circle(100 + Math.sin(a) * 92, 100 - Math.cos(a) * 92, 4), TAU / 8)));
def('monogram-dot', 'Monogram dot', 'stickers', ['monogram', 'dot', 'circle'], '0 0 200 200', D(circle(100, 100, 96)));
def('monogram-wreath', 'Monogram wreath', 'stickers', ['monogram', 'initials', 'wreath', 'leaves'], '0 0 200 200', D(sprig(Array.from({ length: 41 }, (_, i) => { const a = deg(115 + i * 3.6); return [100 + Math.cos(a) * 84, 100 + Math.sin(a) * 84]; }), { n: 12, len: 22, w: 9, shrink: 0.4 }) + sprig(Array.from({ length: 41 }, (_, i) => { const a = deg(65 - i * 3.6); return [100 + Math.cos(a) * 84, 100 + Math.sin(a) * 84]; }), { n: 12, len: 22, w: 9, shrink: 0.4 })));

// CELEBRATION
{
  const balloon = (x, y, s, seed) => {
    let d = smooth([[x, y - 52 * s], [x + 36 * s, y - 32 * s], [x + 30 * s, y + 18 * s], [x, y + 44 * s], [x - 30 * s, y + 18 * s], [x - 36 * s, y - 32 * s]]);
    d += smooth([[x - 18 * s, y - 34 * s], [x - 10 * s, y - 42 * s], [x - 16 * s, y - 20 * s]]);   // highlight cut
    d += poly([[x, y + 44 * s], [x + 6 * s, y + 52 * s], [x - 6 * s, y + 52 * s]]);
    d += swash(bez([x, y + 52 * s], [x + 14 * s, y + 90 * s], [x - 14 * s, y + 120 * s], [x + 4 * s, y + 170 * s]), 1.8, () => 1);
    return d;
  };
  def('balloons', 'Balloons', 'celebration', ['balloons', 'birthday', 'party'], '0 0 200 260', D(balloon(70, 70, 1, 1) + balloon(128, 56, 1.1, 2) + balloon(110, 112, 0.8, 3)));
  // cake
  let c = poly([[30, 230], [170, 230], [170, 236], [30, 236]]);
  c += smooth([[40, 160], [160, 160], [160, 226], [40, 226]]).replace(/C.*Z/, '') ;
  c = poly([[24, 236], [176, 236], [176, 228], [24, 228]]);
  c += poly([[40, 226], [160, 226], [160, 166], [40, 166]]);
  c += poly([[58, 160], [142, 160], [142, 110], [58, 110]]);
  // icing drips (cut)
  c += 'M40 166' + Array.from({ length: 7 }, (_, i) => `Q${f(48.5 + i * 17.1)} ${i % 2 ? 196 : 184} ${f(57.1 + i * 17.1)} 166`).join('') + 'Z';
  c += 'M58 110' + Array.from({ length: 5 }, (_, i) => `Q${f(66.4 + i * 16.8)} ${i % 2 ? 132 : 124} ${f(74.8 + i * 16.8)} 110`).join('') + 'Z';
  c += poly([[96, 108], [104, 108], [104, 70], [96, 70]]) + smooth([[100, 36], [108, 52], [106, 62], [100, 66], [94, 62], [92, 52]]);
  c += around(1, () => '') + [60, 80, 100, 120, 140].map((x) => circle(x, 208, 3)).join('');
  def('cake', 'Cake', 'celebration', ['cake', 'birthday', 'anniversary'], '0 0 200 250', D(c));
  // confetti scatter
  const R = rng(77); let cf = '';
  for (let i = 0; i < 46; i++) {
    const x = 10 + R() * 380, y = 10 + R() * 180, k = R(), a = R() * TAU;
    if (k < 0.35) cf += circle(x, y, 2.2 + R() * 2.2);
    else if (k < 0.7) cf += poly(place([[-6, -2.4], [6, -2.4], [6, 2.4], [-6, 2.4]], x, y, a));
    else cf += swash(place(spiral([0, 0], 6, 3, 0, Math.PI * 1.4, 12), x, y, a), 1.8, () => 1);
  }
  def('confetti', 'Confetti', 'celebration', ['confetti', 'party', 'birthday', 'sangeet'], '0 0 400 200', D(cf));
  // gift
  let g = poly([[40, 100], [160, 100], [160, 124], [40, 124]]) + poly([[48, 128], [152, 128], [152, 210], [48, 210]]);
  g += poly([[94, 100], [106, 100], [106, 210], [94, 210]]).replace(/^/, '');
  g += smooth([[100, 98], [70, 70], [62, 86], [80, 98]]) + smooth([[100, 98], [130, 70], [138, 86], [120, 98]]);
  def('gift', 'Gift box', 'celebration', ['gift', 'birthday', 'present'], '0 0 200 220', D(g));
  // bunting
  let bn = swash(bez([0, 20], [150, 60], [250, 60], [400, 20]), 2, () => 1);
  for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9; const x = t * 400; const y = 20 + 160 * t * (1 - t) * 0.95; bn += poly([[x - 16, y], [x + 16, y], [x, y + 40]]); }
  def('bunting', 'Bunting flags', 'celebration', ['bunting', 'flags', 'party', 'birthday'], '0 0 400 110', D(bn));
  // sparkles
  const spark = (x, y, s) => `M${f(x)} ${f(y - s)}C${f(x + s * 0.12)} ${f(y - s * 0.12)} ${f(x + s * 0.12)} ${f(y - s * 0.12)} ${f(x + s)} ${f(y)}C${f(x + s * 0.12)} ${f(y + s * 0.12)} ${f(x + s * 0.12)} ${f(y + s * 0.12)} ${f(x)} ${f(y + s)}C${f(x - s * 0.12)} ${f(y + s * 0.12)} ${f(x - s * 0.12)} ${f(y + s * 0.12)} ${f(x - s)} ${f(y)}C${f(x - s * 0.12)} ${f(y - s * 0.12)} ${f(x - s * 0.12)} ${f(y - s * 0.12)} ${f(x)} ${f(y - s)}Z`;
  def('sparkle', 'Sparkle', 'celebration', ['sparkle', 'star', 'shine'], '0 0 200 200', D(spark(100, 100, 96)));
  def('sparkles', 'Sparkle cluster', 'celebration', ['sparkles', 'stars', 'shine'], '0 0 200 200', D(spark(80, 110, 70) + spark(156, 50, 32) + spark(150, 160, 20) + circle(40, 40, 4) + circle(176, 110, 3)));
  def('starburst', 'Starburst', 'celebration', ['burst', 'rays', 'shine'], '0 0 200 200', D(around(24, (a, i) => petal(100 + Math.sin(a) * 18, 100 - Math.cos(a) * 18, a, i % 2 ? 50 : 80, i % 2 ? 4 : 6, { tip: 0.5, belly: 0.2 })) + circle(100, 100, 8)));
}

// BABY
{
  const spark = (x, y, s) => { let d = ''; const k = 0.38; const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? s * k : s; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return smooth(pts.flatMap((p, i) => [p])).length ? poly(pts) : d; };
  const crescent = 'M120 20A80 80 0 1 0 180 150A66 66 0 1 1 120 20Z';
  def('moon-stars', 'Moon and stars', 'baby', ['moon', 'stars', 'baby', 'night', 'naming'], '0 0 220 200', D(crescent + spark(170, 50, 16) + spark(196, 96, 9) + spark(150, 96, 6) + circle(186, 20, 2.5)));
  def('star', 'Star', 'baby', ['star', 'baby', 'birthday'], '0 0 200 200', `<path d="${poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 40 : 96; return [100 + Math.cos(a) * r, 108 + Math.sin(a) * r]; }))}" stroke="#000" stroke-width="10" stroke-linejoin="round"/>`);
  def('cloud', 'Cloud', 'baby', ['cloud', 'baby', 'sky'], '0 0 240 140', D(smooth([[30, 120], [14, 96], [30, 72], [56, 70], [70, 40], [106, 26], [140, 40], [156, 60], [190, 56], [216, 80], [222, 108], [204, 124]])));
  // feet prints
  const foot = (x, y, s, flip) => { const F = (px, py) => [x + px * s * flip, y + py * s]; let d = smooth([F(0, 0), F(20, 10), F(24, 50), F(14, 90), F(-4, 96), F(-16, 70), F(-14, 30)]); [[-6, -16, 9], [10, -18, 7], [22, -12, 6], [30, -2, 5], [34, 10, 4]].forEach(([px, py, r]) => { const p = F(px, py); d += circle(p[0], p[1], r * s); }); return d; };
  def('baby-feet', 'Baby feet', 'baby', ['feet', 'baby', 'newborn', 'baby shower'], '0 0 200 200', D(foot(70, 70, 1, -1) + foot(130, 82, 1, 1)));
  // pram
  let pr = 'M40 100A70 70 0 0 0 180 100Z' + 'M110 100V30A70 70 0 0 1 180 100Z' + circle(70, 160, 18) + circle(70, 160, 7) + circle(150, 160, 18) + circle(150, 160, 7) + swash([[40, 100], [30, 70], [14, 64]], 4, () => 1) + swash([[80, 136], [70, 142]], 3, () => 1) + swash([[140, 136], [150, 142]], 3, () => 1);
  pr = 'M40 100A70 70 0 0 0 180 100L110 100Z M110 92V30A70 62 0 0 1 180 92Z' + circle(70, 160, 18) + circle(70, 160, 8) + circle(150, 160, 18) + circle(150, 160, 8) + swash([[40, 100], [30, 70], [14, 64]], 5, () => 1);
  def('pram', 'Baby pram', 'baby', ['pram', 'baby', 'baby shower'], '0 0 200 190', D(pr));
  // rattle
  def('rattle', 'Rattle', 'baby', ['rattle', 'baby', 'toy'], '0 0 200 200', D(circle(70, 70, 50) + circle(70, 70, 40) + around(6, (a) => circle(70 + Math.cos(a) * 22, 70 + Math.sin(a) * 22, 6)) + swash([[104, 104], [176, 176]], 14, () => 1) + ringPath(176, 176, 12, 5)));
  // hot air balloon
  def('hot-air-balloon', 'Hot air balloon', 'baby', ['balloon', 'baby', 'adventure', 'birthday'], '0 0 160 220', D(smooth([[80, 6], [140, 40], [140, 96], [100, 140], [60, 140], [20, 96], [20, 40]]) + smooth([[80, 14], [104, 44], [102, 100], [86, 132], [74, 132], [58, 100], [56, 44]]) + swash([[64, 142], [70, 176]], 2, () => 1) + swash([[96, 142], [90, 176]], 2, () => 1) + poly([[64, 176], [96, 176], [92, 204], [68, 204]])));
  // teddy face
  def('teddy', 'Teddy bear', 'baby', ['teddy', 'baby', 'toy'], '0 0 200 190', D(circle(46, 50, 30) + circle(46, 50, 14) + circle(154, 50, 30) + circle(154, 50, 14) + circle(100, 104, 78) + circle(72, 90, 7) + circle(128, 90, 7) + smooth([[100, 112], [128, 118], [134, 142], [100, 156], [66, 142], [72, 118]]) + smooth([[100, 118], [110, 124], [100, 130], [90, 124]])));
}

// STICKERS & LABELS
{
  // ribbon banner with folded tails
  let r = poly([[40, 30], [360, 30], [360, 90], [40, 90]]) + poly([[40, 46], [4, 46], [20, 76], [4, 106], [56, 106], [56, 90], [40, 90]]) + poly([[360, 46], [396, 46], [380, 76], [396, 106], [344, 106], [344, 90], [360, 90]]);
  r += strokeLine([[52, 38], [348, 38]], 1).replace(/^/, '');
  def('ribbon-banner', 'Ribbon banner', 'stickers', ['ribbon', 'banner', 'label', 'title'], '0 0 400 120', D(r));
  def('label-scroll', 'Scroll label', 'stickers', ['scroll', 'label', 'title', 'classic'], '0 0 400 140', D(poly([[40, 30], [360, 30], [360, 110], [40, 110]]) + smooth([[40, 30], [20, 34], [12, 60], [26, 76], [40, 70]], false).replace(/$/, 'Z') + smooth([[360, 110], [380, 106], [388, 80], [374, 64], [360, 70]], false).replace(/$/, 'Z') + poly([[52, 40], [348, 40], [348, 42], [52, 42]]) + poly([[52, 98], [348, 98], [348, 100], [52, 100]])));
  // cusped plaque (arched cartouche)
  const plaque = [[20, 160], [20, 60], ...bez([20, 60], [20, 24], [70, 14], [100, 14], 16).slice(1), ...bez([100, 14], [130, 14], [180, 24], [180, 60], 16).slice(1), [180, 160]];
  def('label-arch', 'Arch plaque', 'stickers', ['label', 'arch', 'plaque', 'title'], '0 0 200 180', D(poly(plaque) + poly(plaque.map(([x, y]) => [100 + (x - 100) * 0.9, 90 + (y - 90) * 0.9]))));
  def('label-oval', 'Oval cartouche', 'stickers', ['label', 'oval', 'cartouche', 'title'], '0 0 300 180', D(Array.from({ length: 1 }, () => smooth(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return [150 + Math.cos(a) * 140, 90 + Math.sin(a) * 80]; }))).join('') + smooth(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return [150 + Math.cos(a) * 132, 90 + Math.sin(a) * 72]; })) + smooth(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return [150 + Math.cos(a) * 126, 90 + Math.sin(a) * 66]; })) + smooth(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return [150 + Math.cos(a) * 124, 90 + Math.sin(a) * 64]; }))));
  def('ribbon-bow', 'Ribbon bow', 'stickers', ['bow', 'ribbon', 'gift'], '0 0 200 160', D(smooth([[100, 60], [60, 20], [22, 30], [24, 80], [60, 92]]) + smooth([[100, 60], [140, 20], [178, 30], [176, 80], [140, 92]]) + smooth([[88, 52], [112, 52], [116, 74], [84, 74]]) + poly([[90, 72], [70, 150], [86, 140], [98, 152], [100, 74]]) + poly([[110, 72], [130, 150], [114, 140], [102, 152], [100, 74]])));
  def('tag', 'Gift tag', 'stickers', ['tag', 'label'], '0 0 300 140', D(poly([[60, 20], [290, 20], [290, 120], [60, 120], [10, 70]]) + circle(46, 70, 9)));
  // wax seal
  const seal = Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * TAU; const r = 92 + Math.sin(i * 2.3) * 3 + Math.sin(i * 0.7) * 2; return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r]; });
  def('wax-seal', 'Wax seal', 'stickers', ['seal', 'stamp', 'monogram', 'classic'], '0 0 200 200', D(smooth(seal) + ringPath(100, 100, 66, 3) + around(24, (a) => circle(100 + Math.cos(a) * 76, 100 + Math.sin(a) * 76, 1.6))));
  def('stamp-scallop', 'Scalloped badge', 'stickers', ['badge', 'stamp', 'scallop'], '0 0 200 200', D(poly(Array.from({ length: 96 }, (_, i) => { const a = (i / 96) * TAU; const r = 90 + 8 * Math.abs(Math.cos(a * 12)); return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r]; })) + ringPath(100, 100, 74, 2)));
}

// EDGES: torn paper and deckle (meant to be tinted white or the page colour)
{
  const torn = (seed, W, H, rough) => {
    const R = rng(seed); const top = []; let y = H * 0.45;
    for (let x = 0; x <= W; x += 4) { y += (R() - 0.5) * rough; y = Math.max(H * 0.2, Math.min(H * 0.7, y + (H * 0.45 - y) * 0.08)); top.push([x, y + (R() - 0.5) * 3]); }
    return poly([...top, [W, H], [0, H]]);
  };
  // fibrous edge: a second lighter layer slightly above the edge (opacity) reads as torn paper fibre
  def('torn-edge', 'Torn paper edge', 'edges', ['torn', 'paper', 'edge', 'studio'], '0 0 1200 120', `<path d="${torn(5, 1200, 120, 9)}" opacity="0.55"/><path d="${torn(5, 1200, 120, 9).replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (m, x, y) => x + ' ' + f(+y + 7))}"/>`);
  def('torn-edge-rough', 'Rough torn edge', 'edges', ['torn', 'paper', 'edge', 'studio'], '0 0 1200 160', `<path d="${torn(11, 1200, 160, 18)}" opacity="0.5"/><path d="${torn(11, 1200, 160, 18).replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (m, x, y) => x + ' ' + f(+y + 9))}"/>`);
  def('deckle-edge', 'Deckle paper edge', 'edges', ['deckle', 'paper', 'edge'], '0 0 1200 60', D(poly([...Array.from({ length: 301 }, (_, i) => [i * 4, 24 + Math.sin(i * 0.9) * 3 + Math.sin(i * 2.7) * 2 + Math.sin(i * 0.13) * 5]), [1200, 60], [0, 60]])));
  def('brush-stroke', 'Brush stroke', 'edges', ['brush', 'paint', 'swash', 'background'], '0 0 600 160', D((() => { const R = rng(9); let d = ''; for (let k = 0; k < 9; k++) { const y = 50 + k * 7 + (R() - 0.5) * 6; d += swash(bez([20 + R() * 30, y], [200, y - 10 + R() * 20], [400, y - 10 + R() * 20], [570 - R() * 40, y + (R() - 0.5) * 10]), 12 + R() * 8, (t) => Math.pow(Math.sin(Math.PI * t), 0.25) * (0.7 + 0.3 * Math.sin(t * 20 + k))); } return d; })()));
}

// MULTI-COLOUR illustrations (tint: false)
{
  const col = (d, c, extra = '') => `<path d="${d}" fill="${c}"${extra}/>`;
  // marigold garland in colour
  let g = col(swash(bez([0, 14], [200, 30], [400, 30], [600, 14]), 3.5, () => 1), '#6b4a1f');
  for (let i = 0; i < 9; i++) { const x = 30 + i * 67.5; const n = i % 2 ? 3 : 4; for (let j = 0; j < n; j++) { const y = 30 + 13 + j * 22.75; g += col(circle(x, y, 13), j % 2 ? '#F2B01E' : '#EA7A12') + col(marigold(x, y, 13, 50 + i * 7 + j), j % 2 ? '#C9860F' : '#B85409'); } g += col(leafD(x, 30 + 13 + n * 22.75 - 6, Math.PI, 24, 12), '#3E7A3A'); }
  for (let i = 0; i < 8; i++) g += col(leafD(64 + i * 67.5, 22, Math.PI, 46, 18), i % 2 ? '#2F6B35' : '#4C8A3F');
  def('toran-marigold-colour', 'Marigold toran (colour)', 'florals', ['toran', 'marigold', 'garland', 'haldi', 'mehendi', 'colour'], '0 0 600 160', g, { tint: false });
  // diya in colour
  let dy = col(smooth([[20, 120], [60, 150], [140, 150], [180, 120], [178, 112], [150, 118], [100, 122], [50, 118], [22, 112]]), '#B5531E');
  dy += col(swash(bez([30, 130], [70, 142], [130, 142], [170, 130]), 3, taperBoth), '#E9B04B');
  dy += `<radialGradient id="fl" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#FFF4C2"/><stop offset=".5" stop-color="#FFC23A"/><stop offset="1" stop-color="#F07A16"/></radialGradient>` + `<path d="${smooth([[100, 20], [114, 56], [118, 84], [100, 108], [82, 84], [86, 56]])}" fill="url(#fl)"/>`;
  dy += `<circle cx="100" cy="80" r="56" fill="#FFC23A" opacity=".12"/>`;
  def('diya-colour', 'Diya (colour)', 'motifs', ['diya', 'lamp', 'diwali', 'colour'], '0 0 200 160', dy, { tint: false });
  // lotus in colour
  const pet = (a, len, w, x0, c1) => col(petal(100 + x0, 128, deg(a), len * 1.15, w * 1.15, { tip: 0.8, belly: 0.45 }), c1);
  let lt = pet(-68, 52, 30, -6, '#E58FA8') + pet(68, 52, 30, 6, '#E58FA8') + pet(-40, 70, 36, -3, '#EFA6BA') + pet(40, 70, 36, 3, '#EFA6BA') + pet(-14, 82, 38, -1, '#F6C2CF') + pet(14, 82, 38, 1, '#F6C2CF') + pet(0, 92, 40, 0, '#FBD9E1');
  lt += col(G.swash(bez([46, 132], [80, 146], [120, 146], [154, 132]), 6, taperBoth), '#4C8A3F');
  def('lotus-colour', 'Lotus (colour)', 'florals', ['lotus', 'flower', 'colour'], '0 0 200 160', lt, { tint: false });
  // balloons in colour
  const bl = (x, y, s, c) => col(smooth([[x, y - 52 * s], [x + 36 * s, y - 32 * s], [x + 30 * s, y + 18 * s], [x, y + 44 * s], [x - 30 * s, y + 18 * s], [x - 36 * s, y - 32 * s]]), c) + col(smooth([[x - 18 * s, y - 34 * s], [x - 10 * s, y - 42 * s], [x - 16 * s, y - 20 * s]]), '#ffffff', ' opacity=".45"') + col(poly([[x, y + 44 * s], [x + 6 * s, y + 52 * s], [x - 6 * s, y + 52 * s]]), c) + col(swash(bez([x, y + 52 * s], [x + 14 * s, y + 90 * s], [x - 14 * s, y + 120 * s], [x + 4 * s, y + 170 * s]), 1.6, () => 1), '#8a7a6a');
  def('balloons-colour', 'Balloons (colour)', 'celebration', ['balloons', 'birthday', 'party', 'colour'], '0 0 200 260', bl(70, 70, 1, '#E8A33D') + bl(128, 56, 1.1, '#D9667E') + bl(110, 112, 0.8, '#6FA3A0'), { tint: false });
  // peacock feather in colour
  let pf = '';
  for (let i = 0; i < 46; i++) { const t = i / 46, y = 30 + t * 330, side = i % 2 ? 1 : -1, len = 74 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) + 10; const x0 = 100 + side * 2; pf += col(swash(bez([x0, y + 20], [x0 + side * len * 0.4, y + 10], [x0 + side * len * 0.8, y + 4 + t * 20], [x0 + side * len, y + 14 + t * 30]), 1.6, taperEnd), i % 3 ? '#4E8B5A' : '#A9A23E'); }
  pf += col(swash(bez([100, 116], [102, 200], [96, 300], [104, 390]), 4, (t) => 1 - t * 0.6), '#7C6A3A');
  pf += col(smooth([[100, 40], [130, 62], [134, 100], [100, 124], [66, 100], [70, 62]]), '#2E7F6E') + col(smooth([[100, 54], [120, 70], [122, 98], [100, 112], [78, 98], [80, 70]]), '#C8A13A') + col(smooth([[100, 66], [112, 78], [110, 98], [100, 104], [90, 98], [88, 78]]), '#1E3F86') + col(circle(100, 86, 8), '#0E1F45');
  def('peacock-feather-colour', 'Peacock feather (colour)', 'motifs', ['peacock', 'feather', 'colour'], '0 0 200 400', pf, { tint: false });
  // kalash in colour
  const pot = [[60, 120], [44, 150], [40, 190], [56, 226], [84, 244], [116, 244], [144, 226], [160, 190], [156, 150], [140, 120]];
  let kl = '';
  [-62, -36, -12, 12, 36, 62].forEach((a) => { kl += col(leafD(100 + a * 0.5, 106, deg(a * 1.1), 52 - Math.abs(a) * 0.2, 18, { vein: false }), Math.abs(a) > 30 ? '#2F6B35' : '#4C8A3F'); });
  kl += col(smooth([[100, 18], [124, 40], [128, 70], [112, 92], [88, 92], [72, 70], [76, 40]]), '#8A5A2B');
  kl += col(smooth(pot), '#C0703A') + col(swash([[52, 120], [148, 120]], 10, () => 1), '#D99A55') + col(swash(bez([46, 180], [80, 196], [120, 196], [154, 180]), 4, () => 1), '#F2C94C') + col(swash(spiral([100, 160], 20, 6, 0, TAU * 1.1, 40), 3, taperEnd), '#B3261E');
  def('kalash-colour', 'Kalash (colour)', 'motifs', ['kalash', 'pot', 'ceremony', 'colour'], '0 0 200 260', kl, { tint: false });
}

await import('./art-fixes.mjs').then((m) => m.default({ def, ART, out, H: { leafD, sprig, rosette, marigold, lotus, scroll, strokeLine, mandala, MANDALAS } }));
writeFileSync(`${out}/art.json`, JSON.stringify(ART, null, 1));
console.log('art', ART.length);
