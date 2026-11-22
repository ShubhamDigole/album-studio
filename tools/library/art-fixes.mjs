// Second pass: redrawn motifs (paisley, kalash, rose, hearts, rings, corners, birds) using strokes and knock-outs.
import { unlinkSync, existsSync, writeFileSync } from 'node:fs';
import * as G from './geo.mjs';
const { f, P, TAU, deg, place, bez, spiral, join, swash, taperEnd, taperBoth, poly, smooth, petal, petalRing, circle, ringPath, around, rng } = G;

const S = (d, w, extra = '') => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const F = (d, extra = '') => `<path d="${d}"${extra}/>`;
const pl = (pts) => 'M' + pts.map(P).join('L');
// sample a path made of cubic segments: [start, [c1, c2, p], ...]
function sampleCubic(start, segs, n = 24) { let pts = [start], p0 = start; for (const [c1, c2, p] of segs) { pts = pts.concat(bez(p0, c1, c2, p, n).slice(1)); p0 = p; } return pts; }
const cubicD = (start, segs) => 'M' + P(start) + segs.map(([a, b, c]) => 'C' + P(a) + ' ' + P(b) + ' ' + P(c)).join('') + 'Z';
const scalePts = (pts, k, c) => pts.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
const swapXY = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => y + ' ' + x);
let mid = 0;
// a layer stack drawn back to front; each layer is cut where the layers above it sit (plus a gap), so single-colour art keeps its depth
function stack(layers, gap, vb) {
  const [x, y, w, h] = vb.split(' ').map(Number);
  let defs = '', body = '';
  layers.forEach((L, i) => {
    const above = layers.slice(i + 1);
    if (!above.length) { body += L; return; }
    const id = 'k' + (mid++);
    defs += `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><g fill="#000" stroke="#000" stroke-width="${gap * 2}" stroke-linejoin="round">${above.join('').replace(/ fill="none"/g, '')}</g></mask>`;
    body += `<g mask="url(#${id})">${L}</g>`;
  });
  return `<defs>${defs}</defs>${body}`;
}
// cut thin lines out of a filled group
function cut(fillBody, cutBody, vb) {
  const [x, y, w, h] = vb.split(' ').map(Number); const id = 'c' + (mid++);
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><g stroke="#000" fill="#000">${cutBody}</g></mask></defs><g mask="url(#${id})">${fillBody}</g>`;
}

export default function ({ def, ART, out, H }) {
  const undef = (k) => { const i = ART.findIndex((a) => a.key === k); if (i >= 0) ART.splice(i, 1); const p = `${out}/art/${k}.svg`; if (existsSync(p)) unlinkSync(p); };
  const { leafD, sprig, rosette, lotus, strokeLine } = H;

  // ---- paisley (boteh): convex back, concave front, the tip curling over ----
  const PST = [100, 222], PSEG = [[[52, 222], [30, 184], [34, 146]], [[38, 104], [70, 64], [112, 42]], [[134, 29], [154, 20], [168, 26]], [[184, 33], [182, 54], [168, 57]],
    [[158, 59], [150, 51], [155, 43]], [[138, 52], [126, 66], [126, 86]], [[126, 108], [146, 122], [158, 146]], [[170, 176], [150, 222], [100, 222]]];
  const outline = sampleCubic(PST, PSEG, 20);
  const C0 = [98, 160];
  function paisleyBody(full = true) {
    const innerPts = scalePts(outline, 0.85, C0); const cutAt = innerPts.findIndex(([x, y], i) => i > 20 && y < 64); const resume = innerPts.findIndex(([x, y], i) => i > cutAt + 5 && y > 64 && x > 120);
    let s = S(cubicD(PST, PSEG), 7) + S(pl(innerPts.slice(resume).concat(innerPts.slice(0, cutAt))), 1.6);
    if (!full) return s + F(circle(96, 172, 12));
    const dots = G.resample(scalePts(outline, 0.93, C0), 60);
    let d = dots.slice(0, 60).map((p, i) => (i % 2 || p[1] < 70 ? '' : circle(p[0], p[1], 1.7))).join('');
    d += rosette(96, 172, 30, 8, { core: 0.26 }) + around(16, (a) => circle(96 + Math.sin(a) * 40, 172 - Math.cos(a) * 40, 1.8));
    [[104, 122, 14, 18, 11], [118, 98, 30, 14, 9], [134, 78, 46, 11, 7], [148, 62, 60, 7, 5]].forEach(([x, y, a, l, w]) => { d += petalRing(x, y, deg(a), l * 1.3, w * 1.2, 1.5, { round: true }) ; });
    d += leafD(64, 132, deg(-40), 26, 10) + leafD(70, 104, deg(-20), 22, 9);
    return s + F(d);
  }
  const PB = paisleyBody(true);
  def('paisley', 'Paisley', 'motifs', ['paisley', 'kairi', 'mehendi', 'buta'], '0 0 200 240', PB);
  def('paisley-simple', 'Paisley outline', 'motifs', ['paisley', 'minimal'], '0 0 200 240', paisleyBody(false));
  def('corner-paisley', 'Paisley corner', 'corners', ['corner', 'paisley', 'mehendi'], '0 0 200 200',
    `<g transform="translate(66 66) rotate(-45) scale(0.46) translate(-100 -130)">${PB}</g>` + F(sprig(bez([92, 10], [130, 6], [166, 12], [198, 6]), { n: 7, len: 18, w: 7, shrink: 0.45 }) + swapXY(sprig(bez([92, 10], [130, 6], [166, 12], [198, 6]), { n: 7, len: 18, w: 7, shrink: 0.45 })) + circle(10, 10, 5)));
  def('divider-paisley', 'Paisley pair divider', 'dividers', ['divider', 'paisley', 'mehendi'], '0 0 600 120',
    `<g transform="translate(${300 - 58} 60) rotate(-90) scale(0.44) translate(-100 -130)">${PB}</g><g transform="translate(${300 + 58} 60) scale(-1 1) rotate(-90) scale(0.44) translate(-100 -130)">${PB}</g>` +
    F(swash([[180, 60], [20, 60]], 2.4, (t) => Math.pow(1 - t, 1.4) + 0.02) + swash([[420, 60], [580, 60]], 2.4, (t) => Math.pow(1 - t, 1.4) + 0.02) + circle(300, 60, 5)));
  {
    let b = S('M0 6H800M0 94H800', 2);
    for (let i = 0; i < 8; i++) b += `<g transform="translate(${50 + i * 100} 50) rotate(${i % 2 ? 90 : -90}) scale(${i % 2 ? -0.3 : 0.3} 0.3) translate(-100 -130)">${PB}</g>`;
    for (let i = 0; i < 9; i++) b += F(circle(i * 100, 50, 3.5));
    def('border-paisley', 'Paisley band', 'borders', ['border', 'band', 'paisley'], '0 0 800 100', b);
  }

  // ---- kalash ----
  {
    const vb = '0 0 200 260';
    let leaves = ''; [-72, -40, -12, 12, 40, 72].forEach((a) => { leaves += leafD(100 + Math.sin(deg(a)) * 8, 104, deg(a), 66 - Math.abs(a) * 0.15, 24, { curve: a < 0 ? -0.3 : 0.3 }); });
    const coconut = smooth([[100, 22], [120, 34], [128, 62], [120, 92], [100, 100], [80, 92], [72, 62], [80, 34]]);
    const rim = poly([[56, 100], [144, 100], [150, 112], [50, 112]]) + poly([[64, 114], [136, 114], [134, 124], [66, 124]]);
    const pot = smooth([[66, 124], [134, 124], [158, 150], [166, 186], [150, 224], [118, 246], [82, 246], [50, 224], [34, 186], [42, 150]]);
    const potCut = S('M44 168Q100 184 156 168', 2) + S('M40 198Q100 214 160 198', 2) + around(1, () => '') + [56, 78, 100, 122, 144].map((x, i) => F(circle(x, 184 + Math.sin((i / 4) * Math.PI) * 6, 3.4))).join('') + S('M100 216l7 7l-7 7l-7-7z', 1.6);
    const cocoCut = S('M100 30Q90 60 100 96', 1.4) + S('M88 36Q78 62 86 92', 1.2) + S('M112 36Q122 62 114 92', 1.2);
    def('kalash', 'Kalash', 'motifs', ['kalash', 'pot', 'ceremony', 'griha pravesh'], vb, stack([F(leaves), cut(F(coconut), cocoCut, vb), F(rim), cut(F(pot), potCut, vb)], 3, vb));
  }

  // ---- rose (top view, three tiers of petals) ----
  {
    const vb = '0 0 200 200';
    const tier = (n, len, w, off, r0) => F(around(n, (a) => petal(100 + Math.sin(a) * r0, 100 - Math.cos(a) * r0, a, len, w, { round: true, tip: 1, belly: 0.55 }), off));
    const centre = F(swash(spiral([100, 100], 22, 3, 0, TAU * 1.6, 60), 5, (t) => 0.4 + 0.6 * (1 - t)) + circle(100, 100, 4));
    def('rose', 'Rose', 'florals', ['rose', 'gulab', 'flower', 'romance'], vb, stack([tier(5, 90, 96, 0, 6), tier(5, 66, 70, TAU / 10, 6), tier(5, 44, 46, 0, 4), centre], 3.5, vb));
    // camellia-style flower with outlined petals for a lighter look
    const tierO = (n, len, w, off, th) => F(around(n, (a) => petalRing(100, 100, a, len, w, th, { round: true, tip: 1, belly: 0.55 }), off));
    def('rose-line', 'Rose outline', 'florals', ['rose', 'flower', 'line'], vb, stack([tierO(5, 92, 96, 0, 2.4), tierO(5, 66, 70, TAU / 10, 2.2), tierO(5, 42, 44, 0, 2), F(circle(100, 100, 9))], 2.5, vb));
  }

  // ---- hearts ----
  const HEART = 'M100 172C58 142 16 112 16 70C16 40 38 20 64 20C82 20 94 30 100 46C106 30 118 20 136 20C162 20 184 40 184 70C184 112 142 142 100 172Z';
  const scaleD = (d, k, cx, cy, dx = 0, dy = 0) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => f(cx + (x - cx) * k + dx) + ' ' + f(cy + (y - cy) * k + dy));
  def('heart-outline', 'Heart outline', 'motifs', ['heart', 'love', 'romance', 'minimal'], '0 0 200 190', S(HEART, 6) + S(scaleD(HEART, 0.88, 100, 92), 1.5));
  def('heart-ornate', 'Ornate heart', 'motifs', ['heart', 'love', 'flourish'], '0 0 200 200', S(scaleD(HEART, 0.8, 100, 80), 5) + S(scaleD(HEART, 0.7, 100, 82), 1.4) + F(scaleD(HEART, 0.22, 100, 86) +
    swash(join(bez([100, 150], [86, 166], [60, 176], [40, 168], 20), spiral([44, 154], 14, 4, deg(100), deg(100) + TAU * 0.85, 30)), 5, (t) => Math.pow(1 - t, 0.5) * Math.min(1, t * 6 + 0.3)) +
    swash(join(bez([100, 150], [114, 166], [140, 176], [160, 168], 20), spiral([156, 154], 14, 4, deg(80), deg(80) - TAU * 0.85, 30)), 5, (t) => Math.pow(1 - t, 0.5) * Math.min(1, t * 6 + 0.3)) +
    leafD(100, 152, Math.PI, 34, 12) + circle(100, 194, 3)));
  def('hearts-trio', 'Three hearts', 'celebration', ['hearts', 'love', 'anniversary'], '0 0 240 120', F(scaleD(HEART, 0.36, 100, 100, -50, -34)) + F(scaleD(HEART, 0.5, 100, 100, 20, -46)) + S(scaleD(HEART, 0.3, 100, 100, 82, -28), 3.4));

  // ---- interlocked rings ----
  {
    const vb = '0 0 200 200';
    const A = S(circle(76, 124, 52), 9), B = S(circle(124, 124, 52), 9);
    const m1 = 'm' + (mid++), m2 = 'm' + (mid++);
    const defs = `<defs><mask id="${m1}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#fff"/><g clip-path="url(#top${m1})">${S(circle(124, 124, 52), 17).replace('#000', '#000')}</g></mask>` +
      `<clipPath id="top${m1}"><rect width="200" height="124"/></clipPath><clipPath id="bot${m2}"><rect y="124" width="200" height="76"/></clipPath>` +
      `<mask id="${m2}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#fff"/><g clip-path="url(#bot${m2})">${S(circle(76, 124, 52), 17)}</g></mask></defs>`;
    const gem = F(poly([[124, 46], [140, 60], [124, 82], [108, 60]]) + poly([[112, 44], [136, 44], [146, 56], [102, 56]])) + S('M108 60H140M124 46V82', 1.2, ' stroke="#fff"');
    def('rings', 'Wedding rings', 'motifs', ['rings', 'engagement', 'ring ceremony', 'wedding'], vb, defs + `<g mask="url(#${m1})">${A}</g><g mask="url(#${m2})">${B}</g>` + cut(F(poly([[124, 40], [142, 56], [124, 84], [106, 56]])), S('M106 56H142M124 40L116 56L124 84L132 56Z', 1.4), vb));
  }

  // ---- corners ----
  {
    let half = swash(join(bez([12, 12], [60, 4], [112, 6], [150, 26], 30), spiral([146, 46], 20, 4, -Math.PI / 2 + 0.2, -Math.PI / 2 + 0.2 + TAU * 0.85, 46)), 6.5, (t) => Math.pow(1 - t, 0.45) * Math.min(1, t * 5 + 0.35));
    half += swash(join(bez([26, 28], [54, 22], [80, 30], [92, 44], 20), spiral([84, 52], 10, 3, -0.8, -0.8 + TAU * 0.8, 30)), 4, (t) => Math.pow(1 - t, 0.5) * Math.min(1, t * 5 + 0.3));
    half += leafD(64, 12, deg(150), 24, 10) + leafD(104, 14, deg(130), 20, 9) + leafD(118, 20, deg(30), 22, 9);
    const sym = half + swapXY(half);
    def('corner-scroll', 'Scroll corner', 'corners', ['corner', 'flourish', 'classic'], '0 0 200 200', F(sym + petal(8, 8, deg(135), 44, 20, { tip: 0.8 }) + poly([[46, 46], [54, 52], [46, 58], [40, 52]].map(([x, y]) => [x, y - 6]))));
    // lotus corner: blooming inward from the corner, framed by two rules
    def('corner-lotus', 'Lotus corner', 'corners', ['corner', 'lotus'], '0 0 200 200', `<g transform="translate(34 34) rotate(135) scale(0.62) translate(-100 -128)">${F(lotus(100, 128, 1))}</g>` + F(strokeLine([[6, 196], [6, 6], [196, 6]], 2.4) + strokeLine([[16, 196], [16, 16], [196, 16]], 1) + circle(196, 6, 3.5) + circle(6, 196, 3.5)));
    // deco fan: rays from the corner, stepped rules
    let dd = '';
    for (let i = 0; i < 3; i++) dd += strokeLine([[6 + i * 8, 198], [6 + i * 8, 6 + i * 8], [198, 6 + i * 8]], i === 0 ? 2.6 : 1.1);
    for (let i = 0; i < 7; i++) { const a = deg(102 + i * 11); dd += petal(30, 30, a, i % 2 ? 56 : 84, i % 2 ? 6 : 10, { tip: 0.6, belly: 0.3 }); }
    dd += G.ringPath(30, 30, 24, 1.4).replace(/^/, '');
    def('corner-deco', 'Deco fan corner', 'corners', ['corner', 'deco', 'modern', 'lines'], '0 0 200 200', cut(F(dd), F(circle(30, 30, 18)), '0 0 200 200') + F(circle(30, 30, 9)));
  }

  // ---- love birds ----
  {
    const vb = '0 0 260 170';
    const B = [[78, 12], [92, 18], [96, 28], [88, 42], [74, 58], [50, 70], [26, 70], [2, 82], [10, 66], [-6, 62], [16, 52], [30, 36], [50, 26], [62, 14]];
    const bird = (x, y, dir) => {
      const T = (pts) => pts.map(([px, py]) => [x + px * dir, y + py]);
      const body = smooth(T(B)) + poly(T([[94, 20], [110, 26], [94, 30]]));
      const wing = smooth(T([[30, 42], [56, 34], [72, 42], [60, 56], [34, 60]]));
      const cuts = S(wing, 2) + S(pl(T([[40, 50], [62, 46]])), 1.4) + F(circle(x + 82 * dir, y + 22, 2.4));
      return cut(F(body), cuts, vb);
    };
    const branch = F(swash(bez([8, 150], [90, 136], [170, 136], [252, 150]), 5, (t) => 1 - t * 0.5) + leafD(56, 144, deg(-150), 28, 11) + leafD(200, 144, deg(150), 28, 11) + leafD(130, 139, deg(180), 22, 9));
    def('love-birds', 'Love birds', 'motifs', ['birds', 'love', 'couple', 'romance'], vb, bird(24, 66, 1) + bird(236, 66, -1) + branch + F(scaleD(HEART, 0.12, 100, 100, 30, -64)));
  }

  // ---- misc fixes ----
  const oval = (rx, ry) => smooth(Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * TAU; return [150 + Math.cos(a) * rx, 90 + Math.sin(a) * ry]; }));
  def('label-oval', 'Oval cartouche', 'stickers', ['label', 'oval', 'cartouche', 'title'], '0 0 300 180', F(oval(144, 84) + oval(134, 74) + oval(131, 71)));
  // stretchable fades: no viewBox, so they fill whatever box they are given (tint = the colour that fades in)
  const fade = (key, name, inner, tags) => {
    writeFileSync(`${out}/art/${key}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">${inner}</svg>`);
    const i = ART.findIndex((a) => a.key === key); if (i >= 0) ART.splice(i, 1);
    ART.push({ key, name, src: `/assets/library/art/${key}.svg`, tags, tint: true, category: 'edges', stretch: true });
  };
  fade('fade-left', 'Fade from left', '<linearGradient id="g"><stop offset="0"/><stop offset=".35" stop-opacity=".85"/><stop offset="1" stop-opacity="0"/></linearGradient><rect width="100%" height="100%" fill="url(#g)"/>', ['fade', 'gradient', 'blend', 'studio']);
  fade('fade-bottom', 'Fade from bottom', '<linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0"/><stop offset=".35" stop-opacity=".85"/><stop offset="1" stop-opacity="0"/></linearGradient><rect width="100%" height="100%" fill="url(#g)"/>', ['fade', 'gradient', 'blend', 'caption']);
  fade('vignette', 'Soft vignette', '<radialGradient id="g" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-opacity="0"/><stop offset="1" stop-opacity=".9"/></radialGradient><rect width="100%" height="100%" fill="url(#g)"/>', ['vignette', 'gradient', 'blend']);
  undef('damask-motif'); undef('jasmine'); undef('tag'); undef('starburst');
  undef('lotus-simple');
}
