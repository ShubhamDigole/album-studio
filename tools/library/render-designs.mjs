// Renders library designs with the real engine (page-templates.js + css + fonts), filling photo spots with placeholders.
// usage: node render-designs.mjs <designs.json> <projectRoot> <placeholderDir> <outDir> [width] [only,keys]
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
const [designsFile, root, phDir, outDir, width = 1280, only = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const designs = JSON.parse(readFileSync(designsFile, 'utf8')).filter((d) => !only || only.split(',').includes(d.key));
const TYPES = { svg: 'image/svg+xml', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', css: 'text/css', js: 'text/javascript', woff2: 'font/woff2', html: 'text/html' };
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/fonts.css"><link rel="stylesheet" href="/assets/library/fonts.css"><link rel="stylesheet" href="/assets/css/page-templates.css">
<style>body{margin:0;background:#888}#stage{position:relative;overflow:hidden}</style><script src="/assets/js/page-templates.js"></script></head><body><div id="stage"></div></body></html>`;
const LAND = ['ph-01', 'ph-03', 'ph-05', 'ph-07', 'ph-09', 'ph-11'], PORT = ['ph-02', 'ph-04', 'ph-06', 'ph-08', 'ph-10', 'ph-12'];
const missing = new Set();
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const p = await b.newPage({ viewport: { width: +width, height: 1000 } });
await p.route('http://site.local/**', (r) => {
  const path = decodeURIComponent(new URL(r.request().url()).pathname);
  if (path === '/index.html') return r.fulfill({ body: html, contentType: 'text/html' });
  const file = path.startsWith('/__ph/') ? `${phDir}/${path.slice(6)}` : root + path;
  if (!existsSync(file)) { missing.add(path); return r.fulfill({ status: 404, body: '' }); }
  r.fulfill({ body: readFileSync(file), contentType: TYPES[file.split('.').pop()] || 'application/octet-stream' });
});
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://site.local/index.html');
for (const d of designs) {
  const page = JSON.parse(JSON.stringify(d.page));
  const media = {}; let li = [...d.key].reduce((a, c) => a + c.charCodeAt(0), 0) % 6, pi = li, n = 0;
  const assign = (land) => { const id = 'p' + n++; const k = land ? LAND[li++ % LAND.length] : PORT[pi++ % PORT.length]; media[id] = { src: `/__ph/${k}.jpg`, thumb: `/__ph/${k}.jpg` }; return id; };
  if (page.bg && page.bg.type === 'photo') page.bg.m = assign(true);
  for (const e of page.els) if (e.type === 'photo') e.m = assign((e.w * d.ratio) / e.h >= 1);
  const album = Object.assign({ names: ['Aarav', 'Meera'], date: '2026-02-14', location: 'Udaipur', title: 'Aarav & Meera' }, d.sample || {});
  const h = Math.round(+width / d.ratio);
  await p.evaluate(({ page, media, album, w, h, section }) => {
    const st = document.getElementById('stage'); st.style.width = w + 'px'; st.style.height = h + 'px';
    st.innerHTML = window.PageTemplates.renderFree(page, { album, media, section });
  }, { page, media, album, w: +width, h, section: (d.sample || {}).section || '' });
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))); });
  await p.waitForTimeout(250);
  await p.locator('#stage').screenshot({ path: `${outDir}/${d.key}.png` });
}
await b.close();
console.log('rendered', designs.length, 'missing:', [...missing].join(' ') || 'none', 'errors:', errors.join(' | ') || 'none');
