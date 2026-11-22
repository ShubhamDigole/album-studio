// Geometry helpers for drawing ornaments as SVG paths (absolute coordinates, 1-decimal precision).
export const f = (n) => (Math.round(n * 10) / 10).toString();
export const P = (p) => f(p[0]) + ' ' + f(p[1]);
export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;

export function rotP(p, a, c = [0, 0]) { const s = Math.sin(a), co = Math.cos(a); const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co]; }
// place local points (base at origin, pointing to -y) at x,y with angle a (radians, 0 = up)
export const place = (pts, x, y, a, sx = 1, sy = 1) => pts.map((p) => { const q = rotP([p[0] * sx, p[1] * sy], a); return [q[0] + x, q[1] + y]; });

export function bez(p0, p1, p2, p3, n = 40) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
// spiral from angle a0 to a1 with radius r0 -> r1 (exponential), around c
export function spiral(c, r0, r1, a0, a1, n = 50) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const r = r0 * Math.pow(r1 / r0, t); const a = a0 + (a1 - a0) * t; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  return out;
}
export const join = (...lines) => lines.reduce((acc, l) => acc.concat(acc.length ? l.slice(1) : l), []);
export function resample(pts, n) {
  const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = d[d.length - 1], out = []; let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n; while (j < d.length - 2 && d[j + 1] < s) j++;
    const t = (s - d[j]) / Math.max(1e-9, d[j + 1] - d[j]);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return out;
}
// calligraphic stroke: a filled outline around a centre line, width follows prof(t) (0..1)
export function swash(pts, w, prof = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.0)), 0.7), n = 70) {
  const c = resample(pts, n);
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const hw = (w * Math.max(0.04, prof(i / n))) / 2;
    L.push([c[i][0] + nx * hw, c[i][1] + ny * hw]); R.push([c[i][0] - nx * hw, c[i][1] - ny * hw]);
  }
  return 'M' + L.map(P).join('L') + 'L' + R.reverse().map(P).join('L') + 'Z';
}
// profiles
export const taperEnd = (t) => Math.pow(1 - t, 0.8) * Math.min(1, t * 8 + 0.3);     // thick start, sharp end
export const taperBoth = (t) => Math.pow(Math.sin(Math.PI * t), 0.6);
export const taperStart = (t) => Math.pow(t, 0.8) * Math.min(1, (1 - t) * 8 + 0.3);

export const poly = (pts, close = true) => 'M' + pts.map(P).join('L') + (close ? 'Z' : '');
// smooth closed path through points (Catmull-Rom -> Bezier)
export function smooth(pts, close = true) {
  const n = pts.length; let d = 'M' + P(pts[0]);
  const g = (i) => pts[(i + n) % n];
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const p0 = close ? g(i - 1) : pts[Math.max(0, i - 1)], p1 = g(i), p2 = g(i + 1), p3 = close ? g(i + 2) : pts[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
  }
  return d + (close ? 'Z' : '');
}
// petal / leaf outline pointing up from the origin: len, width, shape params
export function petalPts(len, w, { tip = 0.85, belly = 0.4, base = 0.08, round = false, n = 14 } = {}) {
  // build as two cubic sides
  const hw = w / 2;
  const right = bez([0, 0], [hw * (base * 6 + 0.4), -len * belly * 0.4], [hw * (round ? 1.25 : 1.1), -len * tip * (round ? 0.95 : 0.85)], [0, -len], n);
  const left = right.map(([x, y]) => [-x, y]).reverse();
  return right.concat(left.slice(1));
}
export const petal = (x, y, a, len, w, o = {}) => poly(place(petalPts(len, w, o), x, y, a));
// outlined petal (ring) via evenodd: outer minus inner
export function petalRing(x, y, a, len, w, th, o = {}) {
  const outer = place(petalPts(len, w, o), x, y, a);
  const inner = place(petalPts(len - th * 2.2, Math.max(0.5, w - th * 2), o).map(([px, py]) => [px, py - th * 0.9]), x, y, a);
  return poly(outer) + poly(inner);
}
export function circle(cx, cy, r) { return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`; }
export const ringPath = (cx, cy, r, th) => circle(cx, cy, r + th / 2) + circle(cx, cy, r - th / 2);
export function around(n, fn, off = 0) { let s = ''; for (let i = 0; i < n; i++) s += fn(off + (i / n) * TAU, i); return s; }
export function scallopRing(cx, cy, r, n, depth, th) {
  // ring of arcs (scalloped edge) drawn as a filled band
  const outer = [], inner = [];
  for (let i = 0; i <= n * 12; i++) {
    const a = (i / (n * 12)) * TAU, k = Math.abs(Math.sin((a * n) / 2));
    const rr = r + depth * Math.pow(k, 0.6);
    outer.push([cx + Math.cos(a) * (rr + th / 2), cy + Math.sin(a) * (rr + th / 2)]); inner.push([cx + Math.cos(a) * (rr - th / 2), cy + Math.sin(a) * (rr - th / 2)]);
  }
  return poly(outer) + poly(inner.reverse());
}
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const mirrorX = (pts, cx) => pts.map(([x, y]) => [2 * cx - x, y]);
export const mirrorD = (d, cx) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => f(2 * cx - +x) + ' ' + y);   // only for absolute M/L/C paths with "x y" pairs
export function svg(vb, body, { evenodd = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${evenodd ? ' fill-rule="evenodd"' : ''}>${body}</svg>`;
}
export const path = (d, extra = '') => `<path d="${d}"${extra}/>`;
