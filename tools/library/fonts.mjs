import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
const [cssFile, outDir, cssOut] = process.argv.slice(2);
const css = readFileSync(cssFile, 'utf8');
const KEEP = ['latin', 'latin-ext', 'devanagari'];
const re = /\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]+)\}/g;
const byUrl = new Map(); const rules = [];
let m;
while ((m = re.exec(css))) {
  const [_, subset, body] = m;
  if (!KEEP.includes(subset)) continue;
  const get = (k) => (body.match(new RegExp(k + ':\s*([^;]+);')) || [])[1].trim();
  const fam = get('font-family').replace(/'/g, ''), style = get('font-style'), weight = get('font-weight');
  const url = get('src').match(/url\(([^)]+)\)/)[1], range = get('unicode-range');
  if (!/^https:\/\/fonts\.gstatic\.com\/[A-Za-z0-9/_.-]+\.woff2$/.test(url)) throw new Error('bad url ' + url);
  if (!byUrl.has(url)) byUrl.set(url, `${fam.replace(/ /g, '')}-${style === 'italic' ? 'italic-' : ''}${byUrl.size}-${subset}.woff2`.replace(/-\d+-/, `-${weight}-`));
  rules.push({ fam, style, weight, file: byUrl.get(url), range, subset });
}
mkdirSync(outDir, { recursive: true });
// distinct names for shared (variable) files
const names = new Set();
for (const [url, name] of byUrl) {
  let n = name; let k = 2; while (names.has(n)) n = name.replace('.woff2', '-' + k++ + '.woff2');
  names.add(n); byUrl.set(url, n);
}
for (const r of rules) r.file = [...byUrl].find(([u]) => u === [...byUrl].find(([uu, nn]) => nn === r.file)?.[0])?.[1] || r.file;
let total = 0;
for (const [url, name] of byUrl) {
  const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.slice(0, 4).toString() !== 'wOF2') throw new Error('not woff2 ' + url);
  writeFileSync(`${outDir}/${name}`, buf); total += buf.length;
}
const out = ['/* Editor fonts, self-hosted from Google Fonts (SIL Open Font License 1.1, see fonts/OFL.txt and LICENSES.md). Rozha One and Mukta live in /assets/css/fonts.css. */'];
for (const r of rules) out.push(`@font-face{font-family:"${r.fam}";font-style:${r.style};font-weight:${r.weight};font-display:swap;src:url("fonts/${r.file}") format("woff2");unicode-range:${r.range}}`);
writeFileSync(cssOut, out.join('\n') + '\n');
console.log('files', byUrl.size, 'rules', rules.length, 'KB', Math.round(total / 1024));
