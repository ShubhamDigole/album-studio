// Original seamless pattern tiles. Each master is single colour (#000) on transparent (tint via CSS mask);
// colourway copies (--gold, --ivory, --ink, --rose) carry their own translucent colour so they can be used directly as a
// repeating page background over bg.color. usage: node patterns.mjs <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import * as G from './geo.mjs';
const { f, P, TAU, deg, place, bez, spiral, join, swash, poly, smooth, petal, petalRing, circle, ringPath, around, rng } = G;
const out = process.argv[2];
mkdirSync(out + '/patterns', { recursive: true });
const PAT = [];
const WAYS = { gold: ['#D8B45F', 0.7], ivory: ['#FFF8E8', 0.35], ink: ['#2A2530', 0.12], rose: ['#B4475E', 0.22] };
const S = (d, w) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const F = (d) => `<path d="${d}"/>`;
// draw a motif at the tile centre and at the four corners (half-drop), so it repeats seamlessly
const halfDrop = (W, H, m) => m(W / 2, H / 2) + m(0, 0) + m(W, 0) + m(0, H) + m(W, H);
const grid = (W, H, m) => m(W / 2, H / 2) + m(-W / 2, H / 2) + m(W * 1.5, H / 2) + m(W / 2, -H / 2) + m(W / 2, H * 1.5);
function pat(key, name, W, H, body, { scale = 18, tags = [] } = {}) {
  const master = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill-rule="evenodd">${body}</svg>`;
  writeFileSync(`${out}/patterns/${key}.svg`, master);
  const colorways = {};
  for (const [k, [c, a]] of Object.entries(WAYS)) {
    const s = master.replace('fill-rule="evenodd">', `fill-rule="evenodd" fill="${c}" fill-opacity="${a}"><g stroke-opacity="${a}">`).replace('</svg>', '</g></svg>').replace(/stroke="#000"/g, `stroke="${c}"`);
    writeFileSync(`${out}/patterns/${key}--${k}.svg`, s);
    colorways[k] = `/assets/library/patterns/${key}--${k}.svg`;
  }
  PAT.push({ key, name, src: `/assets/library/patterns/${key}.svg`, tint: true, scale, ratio: Math.round((W / H) * 1000) / 1000, tags, colorways });
}
function leafD(x, y, a, len, w) { return poly(place(G.petalPts(len, w, { tip: 0.9, belly: 0.45 }), x, y, a)); }

// 1 paisley buta, alternating direction
{
  const boteh = (x, y, s, flip) => { const raw = [[0, 22], [-11, 16], [-15, 6], [-13, -5], [-7, -13], [1, -19], [9, -22], [12, -20], [9, -17], [7, -14], [9, -8], [13, -1], [15, 8], [11, 17]]; return smooth(raw.map(([px, py]) => [x + px * s * flip, y + py * s])) + circle(x - 1 * s * flip, y + 6 * s, 4 * s) ; };
  pat('paisley-buta', 'Paisley buta', 100, 100, F(halfDrop(100, 100, (x, y) => boteh(x, y, 1.3, (x + y) % 200 === 0 ? 1 : -1))) + F(grid(100, 100, (x, y) => '') + circle(50, 0, 2) + circle(0, 50, 2) + circle(100, 50, 2) + circle(50, 100, 2)), { scale: 14, tags: ['paisley', 'mehendi'] });
}
// 2 mandala lattice: small rosettes in a diamond lattice joined by fine lines
pat('mandala-lattice', 'Mandala lattice', 100, 100, F(halfDrop(100, 100, (x, y) => around(8, (a) => petal(x + Math.sin(a) * 3, y - Math.cos(a) * 3, a, 13, 6, { round: true })) + circle(x, y, 2.4) + around(8, (a) => circle(x + Math.sin(a) * 19, y - Math.cos(a) * 19, 1.2), TAU / 16))) + S('M0 0L100 100M100 0L0 100', 0.8), { scale: 16, tags: ['mandala', 'lattice'] });
// 3 jaali: ogee lattice (pierced stone screen)
{
  const og = (x0, y0) => `M${x0} ${y0}C${x0 + 25} ${y0 + 12} ${x0 + 25} ${y0 + 38} ${x0} ${y0 + 50}C${x0 - 25} ${y0 + 62} ${x0 - 25} ${y0 + 88} ${x0} ${y0 + 100}`;
  let d = ''; for (const x of [0, 50, 100]) { d += og(x, x === 50 ? -50 : 0) + og(x, x === 50 ? 50 : 100); }
  let m = ''; for (const x of [0, 50, 100]) { d += ''; m += og(x, x === 50 ? 0 : -50).replace(/C/g, 'C'); }
  // mirrored set
  const mir = (s) => s.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (q, x, y) => f(100 - +x) + ' ' + y);
  pat('jaali-ogee', 'Jaali ogee', 100, 100, S(og(0, 0) + og(100, 0) + og(50, -50) + og(50, 50), 2.2) + S(mir(og(0, 0) + og(100, 0) + og(50, -50) + og(50, 50)), 2.2) + F(halfDrop(100, 100, (x, y) => around(4, (a) => petal(x, y, a, 9, 5, { round: true })) + circle(x, y, 1.6)).replace(/^/, '') + circle(50, 0, 3) + circle(0, 50, 3) + circle(100, 50, 3) + circle(50, 100, 3)), { scale: 18, tags: ['jaali', 'mughal', 'lattice'] });
}
// 4 bandhani dots: clusters of tie-dye dots with a hollow centre
pat('bandhani', 'Bandhani dots', 60, 60, F(halfDrop(60, 60, (x, y) => around(6, (a) => G.ringPath(x + Math.sin(a) * 6, y - Math.cos(a) * 6, 2, 1.2)) + G.ringPath(x, y, 2, 1.2)) + grid(60, 60, () => '') + circle(30, 0, 1.4) + circle(0, 30, 1.4) + circle(60, 30, 1.4) + circle(30, 60, 1.4)), { scale: 9, tags: ['bandhani', 'dots', 'rajasthani'] });
// 5 leheriya: diagonal waves
{
  let d = '';
  for (let c = -100; c <= 100; c += 12.5) { const pts = []; for (let x = -10; x <= 110; x += 2.5) pts.push([x, x + c + 3 * Math.sin((x / 25) * TAU)]); d += 'M' + pts.map(P).join('L'); }
  pat('leheriya', 'Leheriya waves', 100, 100, S(d, 2.6), { scale: 14, tags: ['leheriya', 'waves', 'rajasthani', 'stripes'] });
}
// 6 lotus tile
pat('lotus-tile', 'Lotus tile', 100, 100, F(halfDrop(100, 100, (x, y) => { let d = ''; [[-50, 13, 9], [50, 13, 9], [-22, 18, 9], [22, 18, 9], [0, 21, 10]].forEach(([a, l, w]) => { d += petal(x, y + 6, deg(a), l, w, { tip: 0.8 }); }); return d + G.swash([[x - 10, y + 8], [x + 10, y + 8]], 1.6, () => 1); })), { scale: 16, tags: ['lotus', 'floral'] });
// 7 damask: mirrored scrolling medallion on a diamond grid
{
  const half = (x, y) => {
    let d = G.swash(join(bez([x, y - 30], [x - 14, y - 22], [x - 22, y - 6], [x - 16, y + 6], 16), spiral([x - 10, y + 2], 6, 2, Math.PI, Math.PI + TAU * 0.8, 20)), 2.4, (t) => Math.pow(1 - t, 0.5) + 0.05);
    d += G.swash(join(bez([x, y + 30], [x - 12, y + 26], [x - 20, y + 16], [x - 16, y + 10], 12), spiral([x - 11, y + 13], 4, 1.5, Math.PI, Math.PI - TAU * 0.7, 16)), 2, (t) => Math.pow(1 - t, 0.5) + 0.05);
    d += leafD(x - 6, y - 12, deg(-40), 14, 6);
    return d;
  };
  const mir = (s, cx) => s.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (q, x, y) => f(2 * cx - +x) + ' ' + y);
  const med = (x, y) => half(x, y) + mir(half(x, y), x) + petal(x, y + 10, 0, 26, 12, { tip: 0.8 }) + circle(x, y + 16, 2.2) + petal(x, y - 28, 0, 10, 5, { tip: 0.6 });
  pat('damask', 'Damask', 100, 120, F(med(50, 60) + med(0, 0) + med(100, 0) + med(0, 120) + med(100, 120)), { scale: 22, tags: ['damask', 'classic', 'wallpaper'] });
}
// 8 moroccan quatrefoil lattice
{
  const q = (x, y, r) => { let d = ''; const pts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU; const k = 1 + 0.18 * Math.cos(4 * a); pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); } return 'M' + pts.map(P).join('L') + 'Z'; };
  pat('quatrefoil', 'Moroccan quatrefoil', 100, 100, S(q(50, 50, 30) + q(0, 0, 30) + q(100, 0, 30) + q(0, 100, 30) + q(100, 100, 30), 2.4) + F(circle(50, 0, 3) + circle(0, 50, 3) + circle(100, 50, 3) + circle(50, 100, 3)), { scale: 16, tags: ['moroccan', 'quatrefoil', 'geometric', 'tile'] });
}
// 9 ikat diamonds: stepped, feathered diamonds
{
  const R = rng(5);
  const ik = (x, y) => { let d = ''; for (let i = 0; i < 10; i++) { const t = i / 9; const w = 22 * Math.sin(Math.PI * t) + 3; const yy = y - 26 + t * 52; d += poly([[x - w + (R() - 0.5) * 3, yy], [x + w + (R() - 0.5) * 3, yy], [x + w - 1 + (R() - 0.5) * 3, yy + 4.6], [x - w + 1 + (R() - 0.5) * 3, yy + 4.6]]); } return d; };
  pat('ikat', 'Ikat diamonds', 80, 80, F(ik(40, 40) + ik(0, 0) + ik(80, 0) + ik(0, 80) + ik(80, 80)), { scale: 12, tags: ['ikat', 'geometric', 'handwoven'] });
}
// 10 polka dots
pat('polka', 'Polka dots', 40, 40, F(halfDrop(40, 40, (x, y) => circle(x, y, 4.4))), { scale: 6, tags: ['dots', 'polka', 'playful', 'baby', 'birthday'] });
// 11 pinstripe
pat('pinstripe', 'Pin stripes', 40, 40, F('M0 0H1.4V40H0ZM20 0H20.8V40H20ZM38.6 0H40V40H38.6Z'), { scale: 5, tags: ['stripes', 'minimal', 'classic'] });
// 12 chevron
pat('chevron', 'Chevron', 40, 20, S('M-20 5L0 15L20 5L40 15L60 5M-20 25L0 35L20 25L40 35L60 25M-20 -15L0 -5L20 -15L40 -5L60 -15', 3.2), { scale: 5, tags: ['chevron', 'zigzag', 'geometric', 'playful'] });
// 13 scales (scallop)
{
  let d = ''; for (const y of [0, 20, 40]) for (const x of [-20, 0, 20, 40, 60]) { const xo = x + (y % 40 ? 10 : 0); d += `M${xo - 10} ${y}A10 10 0 0 0 ${xo + 10} ${y}`; }
  pat('scallop-scales', 'Scallop scales', 40, 40, S(d, 1.6), { scale: 6, tags: ['scallop', 'scales', 'art deco'] });
}
// 14 buti scatter: tiny flowers and leaves
{
  const fl = (x, y, s) => around(5, (a) => petal(x + Math.sin(a) * s, y - Math.cos(a) * s, a, 6 * s, 4.6 * s, { round: true })) + circle(x, y, 1.1 * s);
  pat('buti', 'Floral buti', 100, 100, F(fl(50, 50, 1.4) + fl(0, 0, 1.4) + fl(100, 0, 1.4) + fl(0, 100, 1.4) + fl(100, 100, 1.4) + leafD(25, 25, deg(45), 10, 4.4) + leafD(75, 75, deg(225), 10, 4.4) + leafD(75, 25, deg(-45), 8, 3.6) + leafD(25, 75, deg(135), 8, 3.6) + circle(50, 0, 1.4) + circle(0, 50, 1.4) + circle(100, 50, 1.4) + circle(50, 100, 1.4)), { scale: 12, tags: ['buti', 'floral', 'scatter', 'mehendi'] });
}
// 15 trellis (garden lattice with dots)
pat('trellis', 'Trellis', 60, 60, S('M0 30L30 0L60 30L30 60Z', 1.6) + F(circle(30, 0, 2.6) + circle(0, 30, 2.6) + circle(60, 30, 2.6) + circle(30, 60, 2.6) + circle(30, 30, 1.4)), { scale: 8, tags: ['trellis', 'lattice', 'geometric'] });
// 16 stars and moons scatter (baby)
{
  const star = (x, y, r) => poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.42 : r; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; }));
  const moon = (x, y, r) => `M${f(x)} ${f(y - r)}A${r} ${r} 0 1 0 ${f(x + r * 0.9)} ${f(y + r * 0.45)}A${r * 0.8} ${r * 0.8} 0 1 1 ${f(x)} ${f(y - r)}Z`;
  pat('stars-moons', 'Stars and moons', 100, 100, F(star(50, 50, 6) + star(0, 0, 6) + star(100, 0, 6) + star(0, 100, 6) + star(100, 100, 6) + moon(24, 72, 7) + moon(76, 24, 7) + circle(80, 70, 1.4) + circle(20, 28, 1.4)), { scale: 14, tags: ['stars', 'moon', 'baby', 'night'] });
}
// 17 hearts scatter
{
  const H = (x, y, s) => `M${f(x)} ${f(y + 8 * s)}C${f(x - 10 * s)} ${f(y + 1 * s)} ${f(x - 9 * s)} ${f(y - 8 * s)} ${f(x - 4.5 * s)} ${f(y - 8 * s)}C${f(x - 2 * s)} ${f(y - 8 * s)} ${f(x)} ${f(y - 6 * s)} ${f(x)} ${f(y - 4 * s)}C${f(x)} ${f(y - 6 * s)} ${f(x + 2 * s)} ${f(y - 8 * s)} ${f(x + 4.5 * s)} ${f(y - 8 * s)}C${f(x + 9 * s)} ${f(y - 8 * s)} ${f(x + 10 * s)} ${f(y + 1 * s)} ${f(x)} ${f(y + 8 * s)}Z`;
  pat('hearts', 'Little hearts', 60, 60, F(halfDrop(60, 60, (x, y) => H(x, y, 0.8))), { scale: 8, tags: ['hearts', 'love', 'anniversary', 'playful'] });
}
// 18 marigold mesh (rangoli dots grid)
pat('rangoli-dots', 'Rangoli dot grid', 50, 50, F(halfDrop(50, 50, (x, y) => circle(x, y, 2.2) + around(4, (a) => petal(x, y, a + TAU / 8, 10, 3.4, { tip: 0.7 })))), { scale: 8, tags: ['rangoli', 'kolam', 'dots', 'festive'] });

writeFileSync(`${out}/patterns.json`, JSON.stringify(PAT, null, 1));
console.log('patterns', PAT.length);
