// Ready-made v2 designs for the library. usage: node designs.mjs <out.json>
// Coordinates are fractions of the page (or of the two-page spread for s: 1). `ratio` = width / height the design was drawn for.
import { writeFileSync } from 'node:fs';
const [outFile] = process.argv.slice(2);
const r4 = (n) => Math.round(n * 10000) / 10000;
const BG = (k, o = {}) => ({ type: 'image', src: `/assets/library/backgrounds/${k}.jpg`, ...o });
const PAT = (k, way, color, scale) => ({ type: 'image', src: `/assets/library/patterns/${k}--${way}.svg`, repeat: true, scale, color });
const COL = (color) => ({ type: 'color', color });
const box = (x, y, w, h) => ({ x: r4(x), y: r4(y), w: r4(w), h: r4(h) });
const ph = (x, y, w, h, o = {}) => ({ type: 'photo', ...box(x, y, w, h), m: null, shape: 'rect', ...o });
const tx = (x, y, w, h, o = {}) => ({ type: 'text', ...box(x, y, w, h), text: '', font: 'cormorant', size: 5, color: '#2A2530', align: 'center', ...o });
const sh = (x, y, w, h, o = {}) => ({ type: 'shape', ...box(x, y, w, h), shape: 'rect', ...o });
const ar = (k, x, y, w, h, tint, o = {}) => ({ type: 'art', ...box(x, y, w, h), src: `/assets/library/art/${k}.svg`, ...(tint ? { tint } : {}), ...o });
const line = (x, y, w, color, strokeW = 0.25) => ({ type: 'shape', ...box(x, y, w, 0.01), shape: 'line', stroke: color, strokeW });
const frameLine = (x, y, w, h, color, strokeW = 0.22) => ({ type: 'shape', ...box(x, y, w, h), shape: 'rect', stroke: color, strokeW });

// palette
const GOLD = '#D9B66A', GOLD_DEEP = '#A47E33', IVORY = '#FBF5E8', INK = '#2A2530', MAROON = '#6E1426', WHITE = '#FFFFFF';
const STUDIO = { sage: '#A7AE95', mauve: '#C9A9B7', plum: '#5E2B4F', olive: '#8B8B3E', mustard: '#E9B92F', blush: '#EED7D3', slate: '#2F4A6B', ivory: '#F7F3EE' };

const D = [];
function add(key, name, kind, ratio, occasions, tags, page, sample = {}) { D.push({ key, name, kind, ratio, occasions, tags, page: { v: 2, ...page }, sample }); }
// helpers in page units: square side h on a page of ratio R
const W = (h, R) => h / R;
// corner ornaments at all four corners
const corners = (k, size, R, tint, inset = 0.025, opacity) => {
  const w = W(size, R), ix = W(inset, R);
  const o = opacity ? { opacity } : {};
  return [ar(k, ix, inset, w, size, tint, o), ar(k, 1 - ix - w, inset, w, size, tint, { flipX: true, ...o }), ar(k, ix, 1 - inset - size, w, size, tint, { flipY: true, ...o }), ar(k, 1 - ix - w, 1 - inset - size, w, size, tint, { flipX: true, flipY: true, ...o })];
};

/* ===================== COVERS (front cover, 4:3) ===================== */
const RC = 4 / 3;
{ // 1 royal maroon silk, jharokha window
  const fh = 0.72, fw = W(fh * 0.75, RC), fx = 0.5 - fw / 2, fy = 0.05;
  add('cover-maroon-jharokha', 'Maroon silk jharokha', 'cover', RC, ['wedding', 'reception'], ['royal', 'silk', 'gold', 'arch', 'classic'], {
    bg: BG('silk-maroon'), els: [
      ...corners('corner-scroll', 0.2, RC, GOLD, 0.03, 0.9),
      ph(fx + fw * 46 / 300, fy + fh * 96 / 400, fw * 208 / 300, fh * 274 / 400, { shape: 'arch', shadow: 'strong' }),
      ar('frame-jharokha', fx, fy, fw, fh, GOLD),
      tx(0.1, 0.775, 0.8, 0.12, { role: 'names', font: 'greatvibes', size: 9, color: GOLD, shadow: 'soft' }),
      ar('divider-diamond', 0.36, 0.895, 0.28, W(0.28, RC) * RC / 15, GOLD),
      tx(0.2, 0.915, 0.6, 0.05, { role: 'date', font: 'cinzel', size: 2.3, color: '#EAD3A0', spacing: 0.28, upper: true }),
    ] });
}
{ // 2 emerald velvet with mandala halo
  const ch = 0.56, cw = W(ch, RC);
  add('cover-emerald-mandala', 'Emerald mandala', 'cover', RC, ['wedding', 'mehendi', 'engagement'], ['velvet', 'mandala', 'gold', 'circle'], {
    bg: BG('velvet-emerald'), els: [
      ar('mandala-lotus', 0.06, 0.12, W(0.76, RC), 0.76, GOLD, { opacity: 0.35 }),
      ph(0.06 + (W(0.76, RC) - cw) / 2, 0.12 + (0.76 - ch) / 2, cw, ch, { shape: 'circle', border: { w: 0.5, color: GOLD }, shadow: 'strong' }),
      tx(0.62, 0.3, 0.35, 0.3, { role: 'names', font: 'cormorant', italic: true, size: 8, color: '#F3E3BC', line: 1.05 }),
      ar('divider-lotus', 0.635, 0.6, 0.32, W(0.32, RC) * RC * 90 / 600, GOLD),
      tx(0.62, 0.66, 0.35, 0.06, { role: 'date', font: 'cinzel', size: 2.2, color: GOLD, spacing: 0.25, upper: true }),
      tx(0.62, 0.72, 0.35, 0.05, { role: 'place', font: 'cormorant', size: 2.6, color: '#CFE0D2', italic: true }),
    ] });
}
{ // 3 ivory brocade, matted photo, paisley bands
  add('cover-ivory-brocade', 'Ivory brocade', 'cover', RC, ['wedding', 'anniversary', 'reception'], ['brocade', 'ivory', 'paisley', 'classic'], {
    bg: BG('brocade-ivory'), els: [
      ar('border-paisley', 0, 0.035, 1, W(1, 1) * RC / 8, GOLD_DEEP),
      ar('border-paisley', 0, 1 - 0.035 - RC / 8, 1, RC / 8, GOLD_DEEP, { flipY: true }),
      sh(0.24, 0.2, 0.52, 0.44, { fill: '#FFFDF7' }),
      ph(0.255, 0.22, 0.49, 0.4, { shadow: 'soft' }),
      frameLine(0.225, 0.18, 0.55, 0.48, GOLD_DEEP, 0.18),
      tx(0.1, 0.665, 0.8, 0.08, { role: 'names', font: 'playfair', size: 5.4, color: '#5B3B14' }),
      tx(0.2, 0.745, 0.6, 0.04, { role: 'date', font: 'montserrat', size: 1.9, color: '#8A6A3A', spacing: 0.35, upper: true }),
    ] });
}
{ // 4 engagement blush watercolour, tilted print, rings
  add('cover-engagement-blush', 'Blush engagement', 'cover', RC, ['engagement', 'ring-ceremony', 'pre-wedding'], ['watercolour', 'blush', 'polaroid', 'rings'], {
    bg: BG('watercolour-blush'), els: [
      ph(0.12, 0.13, 0.42, 0.68, { frame: 'polaroid', rot: -4, shadow: 'soft' }),
      ar('rings', 0.66, 0.16, W(0.16, RC), 0.16, '#B4475E'),
      tx(0.56, 0.36, 0.4, 0.07, { text: 'The Engagement', font: 'cormorant', size: 2.6, color: '#8C4A55', spacing: 0.3, upper: true }),
      tx(0.55, 0.43, 0.42, 0.22, { role: 'names', font: 'parisienne', size: 7.5, color: '#7A2F3E', line: 1.1 }),
      ar('sprig-olive', 0.86, 0.62, W(0.3, RC) * 0.5, 0.3, '#9AA88C', { rot: 20 }),
      tx(0.56, 0.68, 0.4, 0.05, { role: 'date', font: 'montserrat', size: 1.9, color: '#8C4A55', spacing: 0.3, upper: true }),
    ] });
}
{ // 5 haldi saffron dupion with marigold toran
  const ch = 0.46, cw = W(ch, RC);
  add('cover-haldi-marigold', 'Haldi marigold', 'cover', RC, ['haldi'], ['marigold', 'saffron', 'toran', 'festive'], {
    bg: BG('dupion-saffron'), els: [
      ar('toran-marigold-colour', -0.02, 0, 1.04, RC * 1.04 * 160 / 600),
      ph(0.5 - cw / 2, 0.25, cw, ch, { shape: 'circle', border: { w: 0.7, color: '#FFF3C4' }, shadow: 'strong' }),
      tx(0.1, 0.725, 0.8, 0.13, { text: 'Haldi', font: 'greatvibes', size: 10, color: '#FFF6D8', shadow: 'soft' }),
      tx(0.15, 0.86, 0.7, 0.06, { role: 'names', font: 'cinzel', size: 2.6, color: '#5A2A04', spacing: 0.2, upper: true }),
    ] });
}
{ // 6 mehendi: paisley pattern ground, ivory arch panel
  add('cover-mehendi-paisley', 'Mehendi paisley', 'cover', RC, ['mehendi'], ['paisley', 'green', 'pattern', 'arch'], {
    bg: PAT('paisley-buta', 'gold', '#1E4A33', 16), els: [
      sh(0.29, 0.06, 0.42, 0.88, { shape: 'arch', fill: '#F6EFDD' }),
      ph(0.32, 0.1, 0.36, 0.52, { shape: 'arch' }),
      ar('divider-paisley', 0.37, 0.632, 0.26, 0.26 * RC * 120 / 600, '#2F6B45'),
      tx(0.3, 0.705, 0.4, 0.1, { text: 'Mehendi', font: 'greatvibes', size: 8, color: '#1E4A33' }),
      tx(0.3, 0.81, 0.4, 0.05, { role: 'names', font: 'marcellus', size: 2.4, color: '#7A5A2A', spacing: 0.18, upper: true }),
    ] });
}
{ // 7 sangeet under fairy lights
  const ch = 0.5, cw = W(ch, RC);
  add('cover-sangeet-lights', 'Sangeet night', 'cover', RC, ['sangeet', 'cocktail', 'reception'], ['night', 'lights', 'party', 'glow'], {
    bg: BG('fairy-lights'), els: [
      ph(0.5 - cw / 2, 0.24, cw, ch, { shape: 'hexagon', shadow: 'glow' }),
      tx(0.1, 0.76, 0.8, 0.1, { role: 'names', font: 'dancing', size: 6.5, color: '#FFE3A8', weight: 700, shadow: 'glow' }),
      tx(0.2, 0.865, 0.6, 0.05, { text: 'Sangeet Night', font: 'montserrat', size: 2, color: '#F3C98B', spacing: 0.45, upper: true }),
    ] });
}
{ // 8 reception: black-gold marble, tall photo right, type left
  add('cover-reception-nero', 'Nero marble reception', 'cover', RC, ['reception', 'wedding', 'cocktail'], ['marble', 'black', 'gold', 'modern'], {
    bg: BG('marble-nero-gold'), els: [
      ph(0.52, 0, 0.48, 1),
      ar('fade-left', 0.52, 0, 0.12, 1, '#0E0C0E'),
      tx(0.06, 0.3, 0.44, 0.07, { text: 'The Reception', font: 'cinzel', size: 2.4, color: GOLD, spacing: 0.4, upper: true, align: 'left' }),
      tx(0.06, 0.38, 0.46, 0.24, { role: 'names', font: 'playfair', size: 7.5, color: '#F5EBD6', align: 'left', line: 1.05 }),
      line(0.06, 0.64, 0.14, GOLD, 0.3),
      tx(0.06, 0.67, 0.44, 0.05, { role: 'date', font: 'montserrat', size: 1.9, color: '#CDB68A', spacing: 0.3, upper: true, align: 'left' }),
      tx(0.06, 0.72, 0.44, 0.05, { role: 'place', font: 'cormorant', size: 2.6, color: '#CDB68A', italic: true, align: 'left' }),
    ] });
}
{ // 9 anniversary: champagne, pearl oval
  const fh = 0.7, fw = W(fh * 0.75, RC);
  add('cover-anniversary-pearl', 'Pearl anniversary', 'cover', RC, ['anniversary', 'wedding'], ['pearl', 'oval', 'champagne', 'classic'], {
    bg: BG('champagne-shimmer'), els: [
      ph(0.5 - fw / 2 + fw * 0.1, 0.05 + fh * 0.07, fw * 0.8, fh * 0.86, { shape: 'circle' }),
      ar('frame-oval-pearl', 0.5 - fw / 2, 0.05, fw, fh, '#B8955A'),
      tx(0.15, 0.77, 0.7, 0.1, { text: 'Happy Anniversary', font: 'greatvibes', size: 6.5, color: '#7A5A2E' }),
      tx(0.15, 0.87, 0.7, 0.05, { role: 'names', font: 'cormorant', size: 2.8, color: '#5E4628', spacing: 0.15, upper: true, weight: 600 }),
    ] });
}
{ // 10 birthday: rose bokeh, balloons
  const ch = 0.56, cw = W(ch, RC);
  add('cover-birthday-balloons', 'Birthday balloons', 'cover', RC, ['birthday'], ['balloons', 'pink', 'party', 'playful'], {
    bg: BG('bokeh-rose'), els: [
      ar('balloons-colour', 0.68, 0.1, W(0.62, RC) * 200 / 260, 0.62),
      ph(0.08, 0.14, cw, ch, { shape: 'circle', border: { w: 0.8, color: WHITE }, shadow: 'soft' }),
      tx(0.06, 0.73, 0.6, 0.12, { text: 'Happy Birthday', font: 'greatvibes', size: 8, color: '#9C3550', align: 'left' }),
      tx(0.08, 0.85, 0.6, 0.06, { role: 'title', font: 'poppins', size: 2.6, color: '#6E3A48', weight: 600, spacing: 0.12, upper: true, align: 'left' }),
      ar('confetti', 0.5, 0.78, 0.45, 0.45 * RC / 2, '#D98BA0', { opacity: 0.8 }),
    ] }, { title: 'Ananya turns one' });
}
{ // 11 baby shower: sky watercolour, moon and arch
  add('cover-baby-shower-moon', 'Baby shower moon', 'cover', RC, ['baby-shower', 'naming', 'baby'], ['moon', 'stars', 'watercolour', 'soft'], {
    bg: BG('watercolour-sky'), els: [
      ph(0.34, 0.08, 0.32, 0.6, { shape: 'arch', border: { w: 0.5, color: WHITE } }),
      ar('moon-stars', 0.6, 0.06, W(0.2, RC) * 220 / 200, 0.2, '#C9A45A'),
      ar('cloud', 0.2, 0.52, W(0.12, RC) * 240 / 140, 0.12, WHITE, { opacity: 0.9 }),
      tx(0.15, 0.71, 0.7, 0.12, { text: 'Baby Shower', font: 'parisienne', size: 7.5, color: '#4E5E86' }),
      tx(0.2, 0.83, 0.6, 0.05, { role: 'names', font: 'montserrat', size: 2, color: '#6F7EA3', spacing: 0.3, upper: true }),
    ] }, { names: ['Riya', 'Kabir'] });
}
{ // 12 maternity: blush satin, tall arch with eucalyptus
  add('cover-maternity-satin', 'Maternity satin', 'cover', RC, ['maternity', 'baby-shower'], ['satin', 'blush', 'arch', 'botanical'], {
    bg: BG('satin-blush'), els: [
      ph(0.08, 0.08, 0.38, 0.84, { shape: 'arch', shadow: 'soft' }),
      ar('sprig-eucalyptus', 0.02, 0.56, W(0.42, RC) * 140 / 240, 0.42, '#8C9B82', { rot: -16 }),
      tx(0.52, 0.28, 0.3, 0.24, { text: 'Waiting for you', font: 'cormorant', italic: true, size: 9, color: '#7D4B52', line: 1, align: 'left' }),
      line(0.53, 0.55, 0.1, '#B88A8E', 0.25),
      tx(0.52, 0.58, 0.42, 0.06, { role: 'names', font: 'montserrat', size: 2, color: '#8A5E63', spacing: 0.25, upper: true, align: 'left' }),
    ] }, { names: ['Riya', 'Kabir'] });
}
{ // 13 pre-wedding: full photo with name lockup
  add('cover-prewedding-film', 'Pre-wedding full photo', 'cover', RC, ['pre-wedding', 'engagement', 'couple'], ['full bleed', 'modern', 'minimal'], {
    bg: { type: 'photo', m: null, dim: 0.12, dimColor: '#000000' }, els: [
      ar('fade-bottom', 0, 0.5, 1, 0.5, '#1A1416'),
      tx(0.06, 0.64, 0.6, 0.06, { text: 'Save the date', font: 'montserrat', size: 2, color: '#F4E7D4', spacing: 0.4, upper: true, align: 'left' }),
      tx(0.06, 0.7, 0.8, 0.16, { role: 'names', font: 'playfair', size: 8.5, color: WHITE, align: 'left', italic: true }),
      tx(0.06, 0.86, 0.6, 0.05, { role: 'date', font: 'montserrat', size: 2, color: '#E9D8BE', spacing: 0.25, upper: true, align: 'left' }),
    ] });
}
{ // 14 navy velvet, gold double frame, round photo
  const ch = 0.46, cw = W(ch, RC);
  add('cover-navy-gold', 'Navy and gold', 'cover', RC, ['wedding', 'reception', 'anniversary'], ['velvet', 'navy', 'gold', 'frame'], {
    bg: BG('velvet-navy'), els: [
      frameLine(0.035, 0.05, 0.93, 0.9, GOLD, 0.35), frameLine(0.05, 0.07, 0.9, 0.86, GOLD, 0.12),
      ar('frame-round-ornate', 0.5 - W(0.56, RC) / 2, 0.1, W(0.56, RC), 0.56, GOLD),
      ph(0.5 - cw / 2, 0.15, cw, ch, { shape: 'circle' }),
      tx(0.1, 0.7, 0.8, 0.1, { role: 'names', font: 'cinzel', size: 4.6, color: '#F1DFB4', spacing: 0.08 }),
      tx(0.2, 0.8, 0.6, 0.05, { role: 'date', font: 'cormorant', size: 2.8, color: GOLD, italic: true }),
    ] });
}
// ---- studio-style covers (front cover is the right half of a 2.667:1 back+front image)
{
  add('cover-studio-teal-arch', 'Teal velvet arch', 'cover', RC, ['wedding', 'engagement', 'reception'], ['studio-style', 'velvet', 'teal', 'arch', 'gold'], {
    bg: BG('velvet-teal'), els: [
      ph(0.31, 0.08, 0.38, 0.62, { shape: 'arch', border: { w: 0.45, color: GOLD } }),
      frameLine(0.295, 0.06, 0.41, 0.66, GOLD, 0.12),
      tx(0.1, 0.74, 0.8, 0.12, { role: 'names', font: 'greatvibes', size: 8, color: GOLD, shadow: 'soft' }),
      tx(0.2, 0.86, 0.6, 0.05, { role: 'date', font: 'cormorant', size: 2.6, color: '#E3CF9E', spacing: 0.2, upper: true }),
      ar('sprig-olive', 0.71, 0.5, W(0.22, RC) * 0.5, 0.22, GOLD, { rot: 24, opacity: 0.8 }),
    ] });
  add('cover-studio-lilac', 'Lilac watercolour', 'cover', RC, ['wedding', 'engagement', 'anniversary'], ['studio-style', 'watercolour', 'lilac', 'frame'], {
    bg: BG('watercolour-lilac'), els: [
      sh(0.27, 0.1, 0.46, 0.6, { fill: WHITE }),
      ph(0.29, 0.125, 0.42, 0.55),
      frameLine(0.255, 0.08, 0.49, 0.64, '#8E78A8', 0.12),
      tx(0.1, 0.74, 0.8, 0.12, { role: 'names', font: 'parisienne', size: 7.5, color: '#5D4A78' }),
      tx(0.2, 0.86, 0.6, 0.05, { role: 'date', font: 'montserrat', size: 1.9, color: '#7E6C98', spacing: 0.35, upper: true }),
    ] });
  const ch = 0.4, cw = W(ch, RC);
  add('cover-studio-bw-portrait', 'Faded portrait and circle', 'cover', RC, ['wedding', 'pre-wedding', 'engagement'], ['studio-style', 'black and white', 'circle', 'leaves'], {
    bg: COL('#F5F1EA'), els: [
      ph(0, 0, 0.62, 1, { opacity: 0.35, filter: { grayscale: 1 } }),
      ar('fade-left', 0.38, 0, 0.26, 1, '#F5F1EA', { flipX: true }),
      ph(0.58, 0.16, cw, ch, { shape: 'circle', border: { w: 0.45, color: WHITE }, shadow: 'soft' }),
      ar('branch-curved', 0.52, 0.5, W(0.2, RC) * 1.5, 0.2, '#7C8A6A'),
      tx(0.5, 0.66, 0.46, 0.12, { role: 'names', font: 'greatvibes', size: 7, color: '#3E3A34' }),
      tx(0.5, 0.78, 0.46, 0.05, { role: 'date', font: 'montserrat', size: 1.8, color: '#6E675C', spacing: 0.35, upper: true }),
    ] });
  add('cover-studio-linen-polaroid', 'Linen and print', 'cover', RC, ['wedding', 'pre-wedding', 'anniversary', 'birthday'], ['studio-style', 'linen', 'polaroid', 'botanical'], {
    bg: BG('linen-cream'), els: [
      ph(0.3, 0.08, 0.4, 0.64, { frame: 'polaroid', rot: 2, shadow: 'soft' }),
      ar('sprig-eucalyptus', 0.12, 0.34, W(0.4, RC) * 140 / 240, 0.4, '#7E8C70', { rot: -22 }),
      ar('sprig-fern', 0.76, 0.12, W(0.34, RC) * 140 / 240, 0.34, '#9AA58A', { rot: 16 }),
      tx(0.1, 0.76, 0.8, 0.1, { role: 'names', font: 'playfair', italic: true, size: 6, color: '#4A3F33' }),
      tx(0.2, 0.86, 0.6, 0.05, { role: 'date', font: 'montserrat', size: 1.8, color: '#7A6B57', spacing: 0.35, upper: true }),
    ] });
}

/* ===================== INNER PAGES (single page, 3:2) ===================== */
const RP = 1.5;
add('page-hero-caption', 'Hero photo with caption', 'page', RP, ['wedding', 'any'], ['hero', 'full bleed', 'caption'], {
  bg: COL('#1A1416'), els: [ph(0, 0, 1, 1), ar('fade-bottom', 0, 0.62, 1, 0.38, '#140F10'), tx(0.06, 0.8, 0.6, 0.1, { role: 'caption', text: 'The moment it all began', font: 'cormorant', italic: true, size: 5, color: '#FBF3E4', align: 'left' })] });
add('page-section-haldi', 'Haldi opener', 'page', RP, ['haldi'], ['section', 'marigold', 'opener'], {
  bg: BG('dupion-saffron'), els: [
    ar('marigold-strand', 0.06, 0, W(0.75, RP) * 60 / 400, 0.75, '#FFE08A'), ar('marigold-strand', 0.14, 0, W(0.55, RP) * 60 / 400, 0.55, '#FFF1C2'),
    ar('marigold-strand', 1 - 0.06 - W(0.75, RP) * 60 / 400, 0, W(0.75, RP) * 60 / 400, 0.75, '#FFE08A'), ar('marigold-strand', 1 - 0.14 - W(0.55, RP) * 60 / 400, 0, W(0.55, RP) * 60 / 400, 0.55, '#FFF1C2'),
    ph(0.36, 0.14, 0.28, 0.5, { shape: 'arch', border: { w: 0.5, color: '#FFF3C4' } }),
    tx(0.2, 0.67, 0.6, 0.14, { role: 'section', font: 'greatvibes', size: 9, color: '#FFF6D8', shadow: 'soft' }),
    tx(0.25, 0.81, 0.5, 0.06, { role: 'caption', text: 'Turmeric, laughter and a lot of yellow', font: 'cormorant', italic: true, size: 3.2, color: '#FFF1D0' }),
  ] }, { section: 'Haldi' });
add('page-section-mehendi', 'Mehendi opener', 'page', RP, ['mehendi'], ['section', 'paisley', 'pattern', 'opener'], {
  bg: PAT('paisley-buta', 'gold', '#1E4A33', 14), els: [
    sh(0.25, 0.12, 0.5, 0.76, { fill: '#F6EFDD' }), frameLine(0.265, 0.14, 0.47, 0.72, '#2F6B45', 0.15),
    ar('paisley', 0.5 - W(0.3, RP) * 200 / 240 / 2, 0.2, W(0.3, RP) * 200 / 240, 0.3, '#2F6B45'),
    tx(0.28, 0.52, 0.44, 0.14, { role: 'section', font: 'greatvibes', size: 9, color: '#1E4A33' }),
    tx(0.3, 0.68, 0.4, 0.08, { role: 'caption', text: 'Henna, songs and stories', font: 'cormorant', italic: true, size: 3.2, color: '#5E6B4A' }),
  ] }, { section: 'Mehendi' });
add('page-section-sangeet', 'Sangeet opener', 'page', RP, ['sangeet', 'cocktail'], ['section', 'night', 'lanterns', 'opener'], {
  bg: BG('gradient-midnight'), els: [
    ar('lantern', 0.12, 0, W(0.42, RP) * 200 / 250, 0.42, GOLD), ar('lantern', 0.2, 0, W(0.28, RP) * 200 / 250, 0.28, GOLD, { opacity: 0.7 }),
    ar('lantern', 0.88 - W(0.42, RP) * 200 / 250, 0, W(0.42, RP) * 200 / 250, 0.42, GOLD), ar('lantern', 0.8 - W(0.28, RP) * 200 / 250, 0, W(0.28, RP) * 200 / 250, 0.28, GOLD, { opacity: 0.7 }),
    tx(0.15, 0.42, 0.7, 0.18, { role: 'section', font: 'dancing', weight: 700, size: 11, color: '#FFE3A8', shadow: 'glow' }),
    tx(0.25, 0.62, 0.5, 0.06, { text: 'Music, dance and family', role: 'caption', font: 'montserrat', size: 2, color: '#D9C3E8', spacing: 0.35, upper: true }),
  ] }, { section: 'Sangeet' });
add('page-quote-paper', 'Quote on handmade paper', 'page', RP, ['any'], ['quote', 'words', 'paper', 'minimal'], {
  bg: BG('paper-handmade-ivory'), els: [
    ar('divider-scroll', 0.3, 0.22, 0.4, 0.4 * RP * 110 / 600, '#9C7A3C'),
    tx(0.25, 0.36, 0.5, 0.26, { role: 'caption', text: 'Whatever our souls are made of, his and mine are the same.', font: 'cormorant', italic: true, size: 5.4, color: '#4A3A28', line: 1.3 }),
    ar('divider-scroll', 0.3, 0.66, 0.4, 0.4 * RP * 110 / 600, '#9C7A3C', { flipY: true }),
  ] });
add('page-three-prints', 'Three prints on kraft', 'page', RP, ['any'], ['polaroid', 'collage', 'kraft', 'playful'], {
  bg: BG('paper-kraft'), els: [
    ph(0.05, 0.14, 0.3, 0.62, { frame: 'polaroid', rot: -5, shadow: 'soft' }), ph(0.35, 0.22, 0.3, 0.62, { frame: 'polaroid', rot: 3, shadow: 'soft' }), ph(0.65, 0.1, 0.3, 0.62, { frame: 'polaroid', rot: -2, shadow: 'soft' }),
    ar('sprig-olive', 0.9, 0.62, W(0.3, RP) * 0.5, 0.3, '#5E5030', { rot: 30 }),
  ] });
add('page-grid-four-linen', 'Four on linen', 'page', RP, ['any'], ['grid', 'linen', 'collage'], {
  bg: BG('linen-cream'), els: [
    ph(0.06, 0.08, 0.435, 0.405), ph(0.505, 0.08, 0.435, 0.405), ph(0.06, 0.515, 0.435, 0.405), ph(0.505, 0.515, 0.435, 0.405),
  ] });
add('page-feature-trio', 'One large, two small with words', 'page', RP, ['any'], ['feature', 'collage', 'caption'], {
  bg: BG('paper-cotton-white'), els: [
    ph(0.05, 0.07, 0.56, 0.86), ph(0.64, 0.07, 0.31, 0.38), ph(0.64, 0.48, 0.31, 0.3),
    tx(0.64, 0.8, 0.31, 0.12, { role: 'caption', text: 'Little things we never want to forget', font: 'cormorant', italic: true, size: 3.4, color: '#4A4038', align: 'left' }),
  ] });
{ const c = 0.36, w = W(c, RP), cm = 0.46, wm = W(cm, RP);
  add('page-circles-mandala', 'Three circles on a mandala', 'page', RP, ['wedding', 'mehendi', 'sangeet'], ['circle', 'mandala', 'trio'], {
    bg: BG('silk-maroon'), els: [
      ar('mandala-jaali', 0.5 - W(1.1, RP) / 2, -0.05, W(1.1, RP), 1.1, GOLD, { opacity: 0.18 }),
      ph(0.06, 0.32, w, c, { shape: 'circle', border: { w: 0.4, color: GOLD } }), ph(0.5 - wm / 2, 0.27, wm, cm, { shape: 'circle', border: { w: 0.5, color: GOLD }, shadow: 'strong' }), ph(0.94 - w, 0.32, w, c, { shape: 'circle', border: { w: 0.4, color: GOLD } }),
      tx(0.2, 0.82, 0.6, 0.08, { role: 'caption', text: 'Seven vows, one promise', font: 'cormorant', italic: true, size: 3.6, color: '#F0DDB0' }),
    ] });
}
add('page-arch-trio', 'Three arches', 'page', RP, ['wedding', 'pre-wedding', 'any'], ['arch', 'trio', 'ivory', 'botanical'], {
  bg: BG('raw-silk-ivory'), els: [
    ph(0.08, 0.14, 0.25, 0.64, { shape: 'arch' }), ph(0.375, 0.08, 0.25, 0.7, { shape: 'arch' }), ph(0.67, 0.14, 0.25, 0.64, { shape: 'arch' }),
    ar('divider-vine', 0.3, 0.83, 0.4, 0.4 * RP * 80 / 600, '#8A7A55'),
  ] });
add('page-torn-story', 'Torn paper story', 'page', RP, ['any'], ['torn paper', 'story', 'caption'], {
  bg: COL('#FBF8F2'), els: [
    ph(0, 0, 1, 0.66),
    ar('torn-edge', 0, 0.56, 1, RP / 10, '#FBF8F2'),
    tx(0.08, 0.72, 0.84, 0.1, { role: 'section', text: '', font: 'playfair', italic: true, size: 6, color: '#3E352E' }),
    tx(0.15, 0.83, 0.7, 0.08, { role: 'caption', text: 'Write a few lines about this day', font: 'cormorant', size: 3.2, color: '#6E6255' }),
  ] }, { section: 'The baraat' });
{ const fh = 0.74, fw = W(fh * 0.75, RP);
  add('page-pearl-pair', 'Two portraits in pearls', 'page', RP, ['wedding', 'engagement', 'anniversary'], ['portrait', 'pearl', 'pair', 'classic'], {
    bg: BG('onyx-ivory'), els: [
      ph(0.12 + fw * 0.1, 0.13 + fh * 0.07, fw * 0.8, fh * 0.86, { shape: 'circle' }), ar('frame-oval-pearl', 0.12, 0.13, fw, fh, '#B8955A'),
      ph(0.88 - fw + fw * 0.1, 0.13 + fh * 0.07, fw * 0.8, fh * 0.86, { shape: 'circle' }), ar('frame-oval-pearl', 0.88 - fw, 0.13, fw, fh, '#B8955A'),
      ar('love-birds', 0.5 - W(0.14, RP) * 260 / 170 / 2, 0.42, W(0.14, RP) * 260 / 170, 0.14, '#9C7A3C'),
    ] });
}
{ const s = 0.18, w = W(s, RP);
  add('page-thank-you', 'Thank you', 'page', RP, ['any'], ['thank you', 'closing', 'monogram'], {
    bg: BG('paper-deckle-cream'), els: [
      ph(0.08, 0.12, 0.42, 0.76, { border: { w: 0.8, color: WHITE }, shadow: 'soft' }),
      ar('monogram-ring', 0.73 - w / 2, 0.18, w, s, '#9C7A3C'),
      tx(0.55, 0.42, 0.36, 0.16, { text: 'Thank you', font: 'greatvibes', size: 9, color: '#5B3B14' }),
      tx(0.55, 0.58, 0.36, 0.14, { role: 'caption', text: 'for being part of our story', font: 'cormorant', italic: true, size: 3.4, color: '#7A5E3A' }),
      tx(0.55, 0.74, 0.36, 0.06, { role: 'names', font: 'montserrat', size: 1.9, color: '#8A6A3A', spacing: 0.3, upper: true }),
    ] });
}
add('page-family-six', 'Family six', 'page', RP, ['any'], ['family', 'grid', 'title'], {
  bg: BG('paper-cotton-white'), els: [
    tx(0.05, 0.05, 0.9, 0.1, { role: 'section', font: 'playfair', italic: true, size: 5.5, color: '#3E352E' }),
    ...[0, 1, 2].flatMap((i) => [ph(0.05 + i * 0.307, 0.18, 0.29, 0.37), ph(0.05 + i * 0.307, 0.57, 0.29, 0.37)]),
  ] }, { section: 'Family' });
add('page-details-five', 'Details mosaic', 'page', RP, ['wedding', 'engagement', 'mehendi'], ['details', 'mosaic', 'grid'], {
  bg: BG('marble-white'), els: [
    ph(0.04, 0.06, 0.48, 0.88), ph(0.54, 0.06, 0.205, 0.43), ph(0.775, 0.06, 0.205, 0.43), ph(0.54, 0.51, 0.205, 0.43), ph(0.775, 0.51, 0.205, 0.43),
  ] });
add('page-heart-letter', 'Love letter', 'page', RP, ['anniversary', 'engagement', 'pre-wedding'], ['heart', 'romance', 'words'], {
  bg: BG('watercolour-blush'), els: [
    ph(0.08, 0.12, W(0.76, RP) * 1.1, 0.76, { shape: 'heart' }),
    tx(0.58, 0.28, 0.36, 0.12, { text: 'Always', font: 'greatvibes', size: 9, color: '#9C3550' }),
    tx(0.58, 0.42, 0.36, 0.3, { role: 'caption', text: 'You are my today and all of my tomorrows.', font: 'cormorant', italic: true, size: 4, color: '#6E3A48', line: 1.3 }),
  ] });
add('page-gold-mat', 'Gold leaf mat', 'page', RP, ['wedding', 'reception', 'anniversary'], ['gold', 'framed', 'luxury'], {
  bg: BG('gold-leaf'), els: [sh(0.12, 0.1, 0.76, 0.8, { fill: '#FFFDF6' }), ph(0.14, 0.13, 0.72, 0.74, { shadow: 'soft' }), ...corners('corner-line', 0.14, RP, '#7A5A22', 0.05)] });
add('page-baby-stars', 'Baby stars', 'page', RP, ['baby', 'baby-shower', 'birthday', 'naming'], ['baby', 'stars', 'pattern', 'playful'], {
  bg: PAT('stars-moons', 'gold', '#2F3B63', 12), els: [
    ph(0.1, 0.12, 0.38, 0.76, { shape: 'rounded', radius: 0.06, border: { w: 0.7, color: WHITE } }),
    ar('cloud', 0.56, 0.18, W(0.16, RP) * 240 / 140, 0.16, '#FFFFFF', { opacity: 0.9 }),
    tx(0.54, 0.4, 0.4, 0.16, { role: 'section', text: 'Little star', font: 'parisienne', size: 8, color: '#FFE9B0' }),
    tx(0.54, 0.58, 0.4, 0.1, { role: 'caption', text: 'Ten tiny fingers, ten tiny toes', font: 'cormorant', italic: true, size: 3.2, color: '#D6DEF2' }),
  ] });

/* ===================== SPREADS (two pages, 3:1) ===================== */
const RS = 3;
add('spread-panorama-title', 'Panorama with title', 'page', RS, ['any'], ['spread', 'panorama', 'full bleed'], {
  s: 1, bg: COL('#1A1416'), els: [ph(0, 0, 1, 1), ar('fade-bottom', 0, 0.6, 0.5, 0.4, '#140F10', { opacity: 0.8 }), tx(0.04, 0.78, 0.4, 0.14, { role: 'section', font: 'playfair', italic: true, size: 7, color: WHITE, align: 'left' })] }, { section: 'The pheras' });
add('spread-feature-grid', 'Feature and four', 'page', RS, ['any'], ['spread', 'feature', 'grid'], {
  s: 1, bg: COL('#FBF8F2'), els: [ph(0, 0, 0.5, 1), ...[0, 1, 2, 3].map((i) => ph(0.53 + (i % 2) * 0.225, 0.06 + Math.floor(i / 2) * 0.45, 0.215, 0.43))] });

// ---- studio-style spreads (12x36 in albums: each page 1.5, spread 3:1)
const st = (key, name, occ, tags, page, sample) => add(key, name, 'page', RS, occ, ['spread', 'studio-style', ...tags], { s: 1, ...page }, sample);
const gridCells = (x0, y0, w, h, cols, rows, gut, o = {}) => { const cw = (w - gut * (cols - 1)) / cols, chh = (h - gut * (rows - 1)) / rows; const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(ph(x0 + c * (cw + gut), y0 + r * (chh + gut), cw, chh, o)); return out; };
// (1) hero fading into ivory + 3x2 grid
st('studio-hero-fade-grid', 'Hero fade and six', ['wedding', 'any'], ['hero', 'fade', 'grid', 'ivory'], {
  bg: COL(STUDIO.ivory), els: [ph(0, 0, 0.36, 1), ar('fade-left', 0.27, 0, 0.1, 1, STUDIO.ivory, { flipX: true }),
    tx(0.37, 0.08, 0.12, 0.12, { role: 'section', font: 'greatvibes', size: 6, color: '#7A6650' }), tx(0.37, 0.2, 0.12, 0.06, { role: 'caption', text: 'a day to remember', font: 'cormorant', italic: true, size: 2.4, color: '#8E8070' }),
    ...gridCells(0.535, 0.1, 0.42, 0.8, 3, 2, 0.008)] }, { section: 'Moments' });
// (2) sage: grid left, hero fade right
st('studio-sage-grid-hero', 'Sage grid and hero', ['wedding', 'engagement', 'any'], ['sage', 'grid', 'hero', 'fade'], {
  bg: COL(STUDIO.sage), els: [frameLine(0.02, 0.05, 0.46, 0.9, WHITE, 0.15), ...gridCells(0.04, 0.1, 0.42, 0.8, 2, 2, 0.008),
    ph(0.62, 0, 0.38, 1), ar('fade-left', 0.6, 0, 0.12, 1, STUDIO.sage),
    tx(0.5, 0.36, 0.11, 0.14, { role: 'section', text: 'Better together', font: 'greatvibes', size: 5.2, color: WHITE, line: 1 }), tx(0.5, 0.52, 0.11, 0.08, { role: 'caption', text: 'two hearts, one story', font: 'cormorant', italic: true, size: 2.2, color: '#F1F1E6' })] });
// (3) mauve: dense 4x2 with inset frame and vertical title
st('studio-mauve-dense', 'Mauve dense grid', ['any'], ['mauve', 'grid', 'dense', 'vertical title'], {
  bg: COL(STUDIO.mauve), els: [frameLine(0.015, 0.045, 0.97, 0.91, WHITE, 0.15), ...gridCells(0.06, 0.09, 0.42, 0.82, 2, 2, 0.007), ...gridCells(0.52, 0.09, 0.42, 0.82, 2, 2, 0.007),
    { ...tx(0.0, 0.46, 0.1, 0.08, { role: 'section', text: 'Moments', font: 'greatvibes', size: 4.8, color: WHITE, rot: -90 }), ...box(-0.03, 0.46, 0.12, 0.08) }] });
// (4) plum: 3x2 grids on both pages + gold script title
st('studio-plum-memories', 'Plum sweet memories', ['wedding', 'reception', 'sangeet'], ['plum', 'grid', 'title', 'gold'], {
  bg: COL(STUDIO.plum), els: [...gridCells(0.03, 0.08, 0.31, 0.84, 2, 2, 0.007), ph(0.36, 0.08, 0.12, 0.84),
    tx(0.52, 0.08, 0.2, 0.14, { role: 'section', text: 'Sweet Memories', font: 'greatvibes', size: 6, color: GOLD, align: 'left' }), tx(0.52, 0.22, 0.2, 0.06, { role: 'caption', text: 'moments we will cherish forever', font: 'cormorant', italic: true, size: 2.4, color: '#E7CFE0', align: 'left' }),
    ...gridCells(0.52, 0.32, 0.45, 0.6, 3, 2, 0.007)] });
// (5) olive colour block with photos overlapping its edge
st('studio-olive-block', 'Olive colour block', ['any'], ['olive', 'colour block', 'overlap'], {
  bg: COL(STUDIO.ivory), els: [sh(0, 0, 0.2, 1, { fill: STUDIO.olive }), ph(0.07, 0.12, 0.2, 0.76, { shadow: 'soft' }), ph(0.3, 0.12, 0.17, 0.36), ph(0.3, 0.52, 0.17, 0.36),
    ph(0.53, 0.08, 0.27, 0.84), tx(0.83, 0.3, 0.15, 0.14, { role: 'section', text: 'Engagement Ceremony', font: 'cormorant', italic: true, size: 4.2, color: '#5C5C28', align: 'left', line: 1.05 }), line(0.83, 0.47, 0.05, STUDIO.olive, 0.3),
    tx(0.83, 0.49, 0.14, 0.12, { role: 'caption', text: 'the day we said yes', font: 'cormorant', size: 2.4, color: '#7A7A4A', align: 'left' }), ph(0.83, 0.64, 0.13, 0.28)] });
// (6) mustard block right, stepping photos
st('studio-mustard-steps', 'Mustard steps', ['haldi', 'mehendi', 'any'], ['mustard', 'colour block', 'haldi'], {
  bg: COL('#FFFDF7'), els: [sh(0.62, 0, 0.38, 1, { fill: STUDIO.mustard }), ph(0.04, 0.1, 0.27, 0.8), ph(0.33, 0.1, 0.14, 0.38), ph(0.33, 0.52, 0.14, 0.38),
    ph(0.54, 0.14, 0.2, 0.72, { shadow: 'soft' }), ph(0.77, 0.14, 0.2, 0.34), ph(0.77, 0.52, 0.2, 0.34),
    tx(0.5, 0.88, 0.12, 0.08, { role: 'section', text: 'Haldi', font: 'greatvibes', size: 5, color: '#8A6410' })] });
// (7) big faded B&W portrait behind colour photos
st('studio-bw-ghost', 'Faded portrait behind', ['wedding', 'pre-wedding', 'any'], ['black and white', 'faded', 'portrait', 'grid'], {
  bg: COL('#F5F1EA'), els: [ph(0, 0, 0.5, 1, { opacity: 0.35, filter: { grayscale: 1 } }), ph(0.23, 0.18, 0.12, 0.62, { border: { w: 0.5, color: WHITE }, shadow: 'soft' }), ph(0.36, 0.3, 0.11, 0.5, { border: { w: 0.5, color: WHITE }, shadow: 'soft' }),
    ...gridCells(0.53, 0.1, 0.42, 0.8, 2, 2, 0.008), tx(0.03, 0.82, 0.18, 0.1, { role: 'section', text: 'Most Beautiful Day', font: 'greatvibes', size: 4.6, color: '#3E3A34', align: 'left' })] });
// (8) arches and a print on blush
st('studio-blush-arches', 'Blush arches and print', ['wedding', 'engagement', 'any'], ['blush', 'arch', 'polaroid', 'border'], {
  bg: COL(STUDIO.blush), els: [ph(0.04, 0.12, 0.13, 0.76, { shape: 'arch', border: { w: 0.4, color: WHITE } }), ph(0.19, 0.12, 0.13, 0.76, { shape: 'arch', border: { w: 0.4, color: WHITE } }), ph(0.34, 0.12, 0.13, 0.76, { shape: 'arch', border: { w: 0.4, color: WHITE } }),
    ph(0.56, 0.1, 0.17, 0.8, { frame: 'polaroid', rot: -3, shadow: 'soft' }), ph(0.76, 0.08, 0.2, 0.5), tx(0.76, 0.62, 0.2, 0.12, { role: 'section', text: 'Forever starts here', font: 'parisienne', size: 4.6, color: '#8C4A55' }),
    ar('sprig-olive', 0.92, 0.66, W(0.3, RS) * 0.5, 0.3, '#A27A80', { rot: 30 })] });
// (9) torn paper between a photo and a white area
st('studio-torn-haldi', 'Torn paper title', ['haldi', 'mehendi', 'any'], ['torn paper', 'title', 'white'], {
  bg: COL(WHITE), els: [ph(0, 0, 0.5, 1), ph(0.5, 0, 0.5, 0.58), ar('torn-edge', 0.5, 0.5, 0.5, 0.5 * RS / 10, WHITE),
    tx(0.55, 0.66, 0.4, 0.14, { role: 'section', text: 'Haldi', font: 'greatvibes', size: 8, color: '#B07A10' }), tx(0.58, 0.8, 0.34, 0.08, { role: 'caption', text: 'colours of love and turmeric', font: 'cormorant', italic: true, size: 2.6, color: '#7A6650' }),
    ar('sprig-berries', 0.93, 0.66, W(0.28, RS) * 140 / 240, 0.28, '#C9A227')] });
// (10) slate blue: grid + big + vertical title
st('studio-slate-vertical', 'Slate with vertical title', ['wedding', 'reception', 'any'], ['slate', 'blue', 'grid', 'vertical title'], {
  bg: COL(STUDIO.slate), els: [...gridCells(0.04, 0.08, 0.42, 0.84, 2, 2, 0.008), ph(0.54, 0.08, 0.36, 0.84),
    { ...tx(0, 0, 0.1, 0.08, { role: 'section', text: 'Better together', font: 'greatvibes', size: 4.4, color: WHITE, rot: -90 }), ...box(0.895, 0.46, 0.12, 0.08) }] });
// (11) ivory with sprigs: two bordered portraits + title
st('studio-ivory-portraits', 'Ivory portraits and sprigs', ['wedding', 'engagement', 'any'], ['ivory', 'botanical', 'portrait', 'border'], {
  bg: BG('paper-cotton-white'), els: [ar('sprig-eucalyptus', 0.01, 0.6, W(0.4, RS) * 140 / 240, 0.4, '#8C9B82', { rot: -20 }), ph(0.1, 0.1, 0.17, 0.8, { border: { w: 0.5, color: WHITE }, shadow: 'soft' }), ph(0.3, 0.18, 0.17, 0.64, { border: { w: 0.5, color: WHITE }, shadow: 'soft' }),
    tx(0.55, 0.36, 0.38, 0.16, { role: 'section', text: 'Most Beautiful Day', font: 'greatvibes', size: 6, color: '#4A4038' }), line(0.69, 0.54, 0.1, '#B8A07A', 0.2), tx(0.58, 0.57, 0.32, 0.08, { role: 'caption', text: 'the beginning of forever', font: 'cormorant', italic: true, size: 2.6, color: '#7A6A58' }),
    ar('monogram-dot', 0.735 - W(0.06, RS) / 2, 0.22, W(0.06, RS), 0.06, '#B8A07A'), ar('sprig-fern', 0.93, 0.04, W(0.36, RS) * 140 / 240, 0.36, '#9AA58A', { rot: 160 })] });
// (12) section opener: big photo left, centred small title right with monogram dot
st('studio-opener-monogram', 'Section opener with monogram', ['engagement', 'wedding', 'any'], ['opener', 'monogram', 'minimal'], {
  bg: COL(STUDIO.ivory), els: [ph(0, 0, 0.5, 1), ar('monogram-ring', 0.75 - W(0.16, RS) / 2, 0.22, W(0.16, RS), 0.16, '#A08A64'),
    tx(0.58, 0.42, 0.34, 0.14, { role: 'section', text: 'Engagement Ceremony', font: 'cormorant', italic: true, size: 5.4, color: '#3E352E' }), tx(0.6, 0.57, 0.3, 0.06, { role: 'date', font: 'montserrat', size: 1.8, color: '#8A7A64', spacing: 0.35, upper: true })] });
// (13) mauve: three stacked left with vertical caption, hero right page
st('studio-mauve-stack-hero', 'Mauve stack and hero', ['any'], ['mauve', 'hero', 'stack'], {
  bg: COL(STUDIO.mauve), els: [ph(0.08, 0.08, 0.36, 0.26), ph(0.08, 0.37, 0.36, 0.26), ph(0.08, 0.66, 0.36, 0.26),
    { ...tx(0, 0, 0.1, 0.06, { role: 'caption', text: 'our favourite frames', font: 'cormorant', italic: true, size: 2.6, color: WHITE, rot: -90 }), ...box(-0.035, 0.47, 0.14, 0.06) }, ph(0.5, 0, 0.5, 1)] });
// (14) sage polaroid scatter
st('studio-sage-polaroids', 'Sage prints', ['any', 'pre-wedding'], ['sage', 'polaroid', 'scatter', 'playful'], {
  bg: COL(STUDIO.sage), els: [ph(0.04, 0.16, 0.14, 0.62, { frame: 'polaroid', rot: -6, shadow: 'soft' }), ph(0.19, 0.22, 0.14, 0.62, { frame: 'polaroid', rot: 4, shadow: 'soft' }), ph(0.34, 0.12, 0.14, 0.62, { frame: 'polaroid', rot: -2, shadow: 'soft' }),
    ph(0.53, 0.18, 0.14, 0.62, { frame: 'polaroid', rot: 5, shadow: 'soft' }), ph(0.68, 0.12, 0.14, 0.62, { frame: 'polaroid', rot: -4, shadow: 'soft' }), tx(0.83, 0.36, 0.15, 0.14, { role: 'section', text: 'Moments', font: 'greatvibes', size: 6, color: WHITE }), tx(0.83, 0.5, 0.15, 0.08, { role: 'caption', text: 'little pieces of us', font: 'cormorant', italic: true, size: 2.4, color: '#F1F1E6' })] });
// (15) plum: circle on each page, script title between, leaves
{ const c = 0.6, w = W(c, RS);
  st('studio-plum-circles', 'Plum circles', ['wedding', 'sangeet', 'reception'], ['plum', 'circle', 'gold', 'leaves'], {
    bg: COL(STUDIO.plum), els: [ph(0.25 - w / 2, 0.2, w, c, { shape: 'circle', border: { w: 0.4, color: GOLD } }), ar('frame-wreath', 0.25 - W(0.78, RS) / 2, 0.11, W(0.78, RS), 0.78, GOLD, { opacity: 0.85 }),
      ...gridCells(0.55, 0.12, 0.2, 0.76, 1, 2, 0.01), tx(0.78, 0.3, 0.19, 0.16, { role: 'section', text: 'Sweet Memories', font: 'greatvibes', size: 5.4, color: GOLD }), tx(0.78, 0.47, 0.19, 0.1, { role: 'caption', text: 'the night we danced till dawn', font: 'cormorant', italic: true, size: 2.4, color: '#E7CFE0' }), ph(0.8, 0.6, 0.15, 0.28)] });
}
// (16) blush: 4x2 full-spread dense grid with a white label
st('studio-blush-dense-label', 'Blush grid with label', ['haldi', 'mehendi', 'any'], ['blush', 'grid', 'dense', 'label'], {
  bg: COL(STUDIO.blush), els: [frameLine(0.012, 0.04, 0.976, 0.92, WHITE, 0.15), ...gridCells(0.03, 0.08, 0.44, 0.84, 2, 2, 0.007), ...gridCells(0.53, 0.08, 0.44, 0.84, 2, 2, 0.007),
    sh(0.425, 0.42, 0.15, 0.16, { fill: WHITE }), tx(0.425, 0.42, 0.15, 0.11, { role: 'section', text: 'Haldi', font: 'greatvibes', size: 5, color: '#9C6B4A' }), tx(0.425, 0.51, 0.15, 0.06, { role: 'caption', text: 'the yellow day', font: 'cormorant', italic: true, size: 2, color: '#9C8A7A' })] });
// (17) olive + ivory halves: faded full portrait left, two framed right
st('studio-olive-ghost', 'Olive with faded portrait', ['wedding', 'pre-wedding'], ['olive', 'faded', 'portrait', 'arch'], {
  bg: COL(STUDIO.olive), els: [ph(0, 0, 0.5, 1, { opacity: 0.4, filter: { grayscale: 1 } }), ph(0.17, 0.14, 0.16, 0.72, { shape: 'arch', border: { w: 0.5, color: '#F3EFD8' }, shadow: 'soft' }),
    sh(0.5, 0, 0.5, 1, { fill: '#F3EFDF' }), ph(0.55, 0.1, 0.19, 0.8), ph(0.76, 0.1, 0.19, 0.38), tx(0.76, 0.54, 0.19, 0.14, { role: 'section', text: 'Better together', font: 'greatvibes', size: 5, color: '#5C5C28' }), tx(0.76, 0.68, 0.19, 0.1, { role: 'caption', text: 'today, tomorrow, always', font: 'cormorant', italic: true, size: 2.4, color: '#7A7A4A' })] });
// (18) slate film strip of five portraits with a title
st('studio-slate-strip', 'Slate portrait strip', ['any'], ['slate', 'strip', 'portraits'], {
  bg: COL('#F7F3EE'), els: [sh(0, 0.2, 1, 0.6, { fill: STUDIO.slate }), ...[0.04, 0.19, 0.34, 0.53, 0.68].map((x) => ph(x, 0.12, 0.13, 0.76, { border: { w: 0.5, color: WHITE }, shadow: 'soft' })),
    tx(0.82, 0.3, 0.16, 0.16, { role: 'section', text: 'Moments', font: 'greatvibes', size: 6.5, color: WHITE }), tx(0.82, 0.48, 0.16, 0.08, { role: 'caption', text: 'frame by frame', font: 'cormorant', italic: true, size: 2.6, color: '#D7E0EC' }), ar('divider-diamond', 0.84, 0.6, 0.12, 0.12 * RS / 15, '#D7E0EC')] });

writeFileSync(outFile, JSON.stringify(D, null, 1));
console.log('designs', D.length, 'covers', D.filter((d) => d.kind === 'cover').length, 'pages', D.filter((d) => d.kind === 'page').length, 'studio', D.filter((d) => d.tags.includes('studio-style')).length);
