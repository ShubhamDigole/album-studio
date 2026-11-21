// Generates the demo album used when no backend is running (file:// or ?id=demo):
// designed SVG pages (covers, section dividers) + album.js / album.json.
// Photo pages and the gallery use placeholder photos from picsum.photos.
// Run:  node tools/make-demo-album.mjs
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'albums', 'demo');
const pagesDir = join(outDir, 'pages');
rmSync(pagesDir, { recursive: true, force: true });
mkdirSync(pagesDir, { recursive: true });

const W = 1296, H = 864;
const ALBUM = { type: 'wedding', names: ['Aarav', 'Ananya'], date: '2026-02-12', location: 'Udaipur', dateText: '12 February 2026' };
const STUDIO = 'Your Studio Photography';
const C = { silk: '#0F3D3E', rani: '#C8255F', marigold: '#EFA00B', jasmine: '#FBF7F1', kohl: '#1D1A26', paper: '#F7F3EE' };

// SVGs shown through <img> cannot load external fonts, so the latin subsets are embedded.
const font = (file) => readFileSync(join(root, 'assets', 'fonts', file)).toString('base64');
const FONTS = `<style>
@font-face{font-family:"Rozha One";src:url(data:font/woff2;base64,${font('RozhaOne-400-latin.woff2')}) format("woff2")}
@font-face{font-family:Mukta;font-weight:400;src:url(data:font/woff2;base64,${font('Mukta-400-latin.woff2')}) format("woff2")}
</style>`;
const DISPLAY = "'Rozha One', Georgia, serif";
const UI = "Mukta, 'Segoe UI', sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, str, { size = 40, color = C.kohl, family = DISPLAY, anchor = 'middle', opacity = 1 } = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" fill="${color}" opacity="${opacity}">${esc(str)}</text>`;

// The same woven bud motif as the zari border in the UI.
const zari = (y, color, width = W) => `<g fill="${color}" opacity=".85">
  <rect x="0" y="${y}" width="${width}" height="1.5"/><rect x="0" y="${y + 24}" width="${width}" height="1.5"/>
  ${Array.from({ length: Math.ceil(width / 40) }, (_, i) => {
    const x = i * 40 + 20;
    return `<path d="M${x} ${y + 6}c4 3 4 9 0 13-4-4-4-10 0-13z"/><circle cx="${x - 20}" cy="${y + 12.5}" r="2"/>`;
  }).join('')}</g>`;

const bud = (cx, cy, s, color) => `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 -16c9 7 9 22 0 32-9-10-9-25 0-32z" fill="${color}"/>`;

const svg = (body) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${FONTS}
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".38" stop-color="#fff" stop-opacity=".07"/>
    <stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <pattern id="twill" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="1" height="6" fill="#fff" opacity=".035"/>
  </pattern>
  <radialGradient id="falloff" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-opacity="0"/><stop offset="1" stop-opacity=".35"/></radialGradient>
</defs>
${body}
</svg>`;

const silkBg = (color = C.silk) => `<rect width="${W}" height="${H}" fill="${color}"/><rect width="${W}" height="${H}" fill="url(#twill)"/>
  <rect width="${W}" height="${H}" fill="url(#sheen)"/><rect width="${W}" height="${H}" fill="url(#falloff)"/>`;
const paperBg = `<rect width="${W}" height="${H}" fill="${C.paper}"/>`;
const [A, B] = ALBUM.names;

const files = {
  // Front cover: names large and left-aligned like a foil-stamped album, zari band along the foot.
  'title.svg': svg(`${paperBg}
    ${text(W / 2, 330, A, { size: 120, color: C.silk })}
    ${text(W / 2, 410, 'weds', { size: 34, color: C.rani, family: UI })}
    ${text(W / 2, 540, B, { size: 120, color: C.silk })}
    ${text(W / 2, 640, `Wedding in ${ALBUM.location} on ${ALBUM.dateText}`, { size: 30, color: C.kohl, family: UI, opacity: 0.75 })}`),

  'thank-you.svg': svg(`${paperBg}
    ${text(W / 2, 410, 'With gratitude', { size: 110, color: C.silk })}
    ${text(W / 2, 500, 'to everyone who blessed us with their presence', { size: 32, color: C.kohl, family: UI, opacity: 0.75 })}
    ${bud(W / 2, 600, 0.9, C.rani)}`),

};

// Section dividers: each ceremony gets its own silk, the title set large.
const SECTIONS = [
  { key: 'haldi', title: 'Haldi', line: 'Turmeric, laughter and a lot of yellow', silk: '#7A5200', mark: '#F7C948', photos: 3 },
  { key: 'mehendi', title: 'Mehendi', line: 'Stories drawn in henna', silk: '#23452B', mark: '#C9A227', photos: 3 },
  { key: 'sangeet', title: 'Sangeet', line: 'Music, dance and both families on one stage', silk: '#2E1F5E', mark: '#F05A9D', photos: 3 },
  { key: 'wedding', title: 'The wedding', line: 'Seven vows by the lake', silk: '#0F3D3E', mark: '#C8255F', photos: 5, spread: true },
  { key: 'reception', title: 'Reception', line: 'An evening with everyone we love', silk: '#14213D', mark: '#E0B44C', photos: 4 },
];
for (const s of SECTIONS) {
  files[`section-${s.key}.svg`] = svg(`${silkBg(s.silk)}
    ${bud(110, 360, 1.1, s.mark)}
    ${text(100, 500, s.title, { size: 140, color: C.jasmine, anchor: 'start' })}
    ${text(104, 570, s.line, { size: 32, color: C.jasmine, family: UI, anchor: 'start', opacity: 0.8 })}
    ${zari(H - 74, s.mark)}`);
}

for (const [name, content] of Object.entries(files)) writeFileSync(join(pagesDir, name), content);

// ---- album definition ----------------------------------------------------------------
const pages = [];
const gallery = [];
let seed = 100, n = 1;
function count() { return pages.reduce((k, p) => k + (p.spread ? 2 : 1), 0); }
const photo = (section) => {
  const s = seed++;
  const id = String(n++).padStart(4, '0') + '-demo';
  gallery.push({
    id, section,
    display: `https://picsum.photos/seed/wedding${s}/1800/1200`, thumb: `https://picsum.photos/seed/wedding${s}/480/320`,
    download: `https://picsum.photos/seed/wedding${s}/2400/1600`, width: 1800, height: 1200, blur: '',
  });
  return { src: `https://picsum.photos/seed/wedding${s}/1296/864`, thumb: `https://picsum.photos/seed/wedding${s}/324/216` };
};

// cover, endpapers and back cover are drawn live from the cover template (assets/js/cover-templates.js)
pages.push({ generated: 'cover', title: 'Cover' }, { generated: 'inside-front' }, { src: 'pages/title.svg', title: 'Welcome' }, photo('welcome'));
const sections = [];
for (const s of SECTIONS) {
  pages.push({ src: `pages/section-${s.key}.svg`, title: s.title });
  sections.push({ key: s.key, title: s.title, count: s.photos, page: count() });
  for (let i = 0; i < s.photos; i++) pages.push(photo(s.key));
  if (s.spread) {
    if (count() % 2 === 0) pages.push(photo(s.key)); // panoramas start on a left page
    pages.push({ spread: `https://picsum.photos/seed/panorama${seed++}/2592/864`, title: 'By the lake' });
  }
}
pages.push({ src: 'pages/thank-you.svg', title: 'With gratitude' });
while (count() % 2 !== 0) pages.push(photo('reception'));
pages.push({ generated: 'inside-back' }, { generated: 'back', title: 'Back cover' });

const album = {
  id: 'demo',
  ...{ type: ALBUM.type, names: ALBUM.names, date: ALBUM.date, location: ALBUM.location },
  title: '',                 // empty = names joined with " & "
  studio: { name: STUDIO, logo: '', url: 'https://example.com', phone: '+91 00000 00000' },
  pageWidth: W,
  pageHeight: H,
  hardCover: true,
  template: 'jharokha',     // jharokha | mandala | toran | lotus | paisley | photo
  music: '',                 // e.g. "music/background.mp3" – plays after the first click
  autoplayInterval: 4,
  downloadUrl: '',
  theme: {},                 // optional { silk, accent } overrides; defaults come from the album type
  sections,
  pages,
  gallery,
};

writeFileSync(join(outDir, 'album.json'), JSON.stringify(album, null, 2));
writeFileSync(join(outDir, 'album.js'),
  `// Generated by tools/make-demo-album.mjs\nwindow.ALBUM_DATA = ${JSON.stringify(album, null, 2)};\n`);
console.log(`demo album: ${count()} pages, ${gallery.length} gallery photos, ${Object.keys(files).length} svg files`);
