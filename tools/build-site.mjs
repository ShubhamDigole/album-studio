// Copies the static site into dist/ (next to the albums built by tools/build-album.mjs),
// writes robots.txt, _headers and albums/index.json, and checks Cloudflare Pages limits.
//   node tools/build-site.mjs
import { cpSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(join(dist, 'albums'), { recursive: true });

// 1. site files (assets/ is replaced wholesale so deleted files disappear)
rmSync(join(dist, 'assets'), { recursive: true, force: true });
for (const f of ['index.html', 'gallery.html', 'admin.html']) cpSync(join(root, f), join(dist, f));
cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
// the demo album (SVG pages + album.json); real albums are written into dist/albums by build-album
rmSync(join(dist, 'albums', 'demo'), { recursive: true, force: true });
cpSync(join(root, 'albums', 'demo'), join(dist, 'albums', 'demo'), { recursive: true });

writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
writeFileSync(join(dist, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow, noarchive
  Referrer-Policy: same-origin
  X-Content-Type-Options: nosniff

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/albums/*/display/*
  Cache-Control: private, max-age=31536000, immutable
/albums/*/thumb/*
  Cache-Control: private, max-age=31536000, immutable
/albums/*/download/*
  Cache-Control: private, max-age=31536000, immutable
/albums/*/pages/*
  Cache-Control: private, max-age=31536000, immutable

/albums/*/album.json
  Cache-Control: no-cache
`);

// 2. index of built albums, used by the admin page to show albums that have photos but no details yet
const albums = [];
for (const id of readdirSync(join(dist, 'albums'))) {
  const file = join(dist, 'albums', id, 'album.json');
  if (id === 'demo' || !existsSync(file)) continue;   // the demo is not a real album
  try {
    const a = JSON.parse(readFileSync(file, 'utf8'));
    const pages = (a.pages || []).reduce((n, p) => n + (p.spread ? 2 : 1), 0);
    albums.push({
      id, title: a.title || (a.names || []).join(' & '), type: a.type || '', names: a.names || [], date: a.date || '',
      location: a.location || '', pages, photos: (a.gallery || []).length, template: a.template || '',
      cover: a.cover ? `/albums/${id}/${a.cover}` : '', pageWidth: a.pageWidth || 1296, pageHeight: a.pageHeight || 864,
    });
  } catch { console.warn('skipping unreadable', file); }
}
writeFileSync(join(dist, 'albums', 'index.json'), JSON.stringify({ albums }, null, 2));

// 3. Cloudflare Pages limits: 20,000 files per deploy (we stop at 19,000) and 25 MiB per file
let files = 0, bytes = 0;
const tooBig = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else { files++; bytes += s.size; if (s.size >= 25 * 1024 * 1024) tooBig.push(p); }
  }
})(dist);

console.log(`dist/: ${files} files, ${(bytes / 1048576).toFixed(1)} MiB, albums: ${albums.map((a) => a.id).join(', ') || 'none'}`);
if (files > 19000) { console.error(`Too many files for Cloudflare Pages (${files} > 19,000). Remove an album or shrink outputs.`); process.exit(1); }
if (tooBig.length) { console.error('Files of 25 MiB or more cannot be deployed:\n  ' + tooBig.join('\n  ')); process.exit(1); }
