#!/usr/bin/env node
// Build one album: originals/<albumId>/NN-section/*.jpg  ->  dist/albums/<albumId>/ (web images, flipbook pages, album.json)
//
//   node tools/build-album.mjs <albumId> [--force]
//
// Incremental: outputs that already exist are kept (file names carry content hashes); --force re-creates everything.
// Stale files in the album's output folders are removed. Fails if dist/ would hold > 19,000 files or any file >= 25 MiB.
import sharp from 'sharp';
import { promises as fsp, existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { byName, exists, formatBytes, formatDate, hash8, pool, walk, writeAtomic } from './lib/util.mjs';
import { PAPER, PW, THEMES, TYPE_LABELS, pageHash, renderPage } from './lib/album-pages.mjs';
import { writeContactSheets } from './lib/contact-sheet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILES = 19000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const CONCURRENCY = 4;
const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
const SIZES = {
  display: { long: 2400, ext: 'webp', encode: (s) => s.webp({ quality: 80, effort: 4 }) },
  thumb: { long: 400, ext: 'webp', encode: (s) => s.webp({ quality: 70, effort: 4 }) },
  download: { long: 3200, ext: 'jpg', encode: (s) => s.jpeg({ quality: 85, mozjpeg: true }) },
};
const OUT_DIRS = ['display', 'thumb', 'download', 'pages', 'pages/thumb', 'media'];

sharp.cache(false);                    // we never re-read the same input; keep memory flat on big albums
sharp.concurrency(Math.max(1, Math.floor(availableParallelism() / CONCURRENCY)));

class BuildError extends Error {}
const fail = (msg) => { throw new BuildError(msg); };

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const albumId = args.find((a) => !a.startsWith('--'));
  if (!albumId || !/^[a-z0-9][a-z0-9_-]*$/i.test(albumId)) {
    fail('usage: node tools/build-album.mjs <albumId> [--force]   (albumId: letters, digits, - and _)');
  }
  const srcDir = join(ROOT, 'originals', albumId);
  const outDir = join(ROOT, 'dist', 'albums', albumId);
  if (!existsSync(srcDir)) fail(`originals folder not found: ${relative(ROOT, srcDir)}`);
  const t0 = Date.now();

  const config = await readConfig(srcDir);
  const type = THEMES[config.type] ? config.type : (config.type && console.warn(`! unknown type "${config.type}", using "other"`), 'other');
  const theme = { ...THEMES[type] };
  if (config.accent) theme.accent = config.accent;
  const names = (config.names || []).map((n) => String(n).trim()).filter(Boolean);
  const title = config.title?.trim() || joinNames(names) || [TYPE_LABELS[type] || 'Our', 'album'].join(' ');

  // ---- scan sections & photos ----------------------------------------------------------------------------------
  const sections = await scanSections(srcDir, config);
  const photos = sections.flatMap((s) => s.files.map((f) => ({ section: s, file: f })));
  const designed = await scanDesigned(srcDir);
  if (!photos.length && !designed.spreads.length) {
    fail(`no photos found in ${relative(ROOT, srcDir)} (expected sub-folders like 01-haldi/ with jpg/png/webp/tif files, or a spreads/ folder of designed pages)`);
  }

  // pre-flight: will the deploy stay under the Pages limits?
  const albumFilesEstimate = photos.length * 3 + (photos.length + 2 * sections.length + 10) * 2 + 4;
  const otherDist = (await walk(join(ROOT, 'dist'))).filter((f) => !f.path.startsWith(outDir + sep));
  if (otherDist.length + albumFilesEstimate > MAX_FILES) {
    fail(`dist/ would hold about ${otherDist.length + albumFilesEstimate} files (limit ${MAX_FILES}); split the album or remove photos`);
  }

  for (const d of OUT_DIRS) await fsp.mkdir(join(outDir, d), { recursive: true });
  const existing = await indexExisting(outDir);
  const keep = new Set([join(outDir, 'album.json')]);
  const stats = { encoded: 0, reused: 0, pagesRendered: 0, pagesReused: 0 };

  console.log(`Album "${albumId}": ${photos.length} photos in ${sections.length} sections (${type})`);

  // ---- photos --------------------------------------------------------------------------------------------------
  let index = 0;
  const gallery = [];
  for (const [si, section] of sections.entries()) {
    const tS = Date.now();
    const jobs = section.files.map((file) => ({ file, n: ++index }));
    const before = { ...stats };
    const results = await pool(jobs, CONCURRENCY, (job) => processPhoto(job, { outDir, existing, force, stats, keep }));
    for (const r of results) gallery.push({ ...r, section: section.key });
    section.items = results;
    console.log(`  [${si + 1}/${sections.length}] ${section.key.padEnd(14)} ${String(results.length).padStart(4)} photos  ` +
      `${stats.encoded - before.encoded} encoded, ${stats.reused - before.reused} cached  (${((Date.now() - tS) / 1000).toFixed(1)}s)`);
  }

  // ---- media (music / studio logo) -----------------------------------------------------------------------------
  const studio = { name: '', phone: '', url: '', logo: '', ...(config.studio || {}) };
  const music = await copyMedia(config.music, srcDir, outDir, keep);
  studio.logo = await copyMedia(studio.logo, srcDir, outDir, keep);

  // ---- pages ---------------------------------------------------------------------------------------------------
  // Cover, end page and endpapers: the photographer's own files (cover.jpg, back.jpg, inside-front.jpg,
  // inside-back.jpg) when present, otherwise { generated } entries the viewer draws from the cover template.
  // Inner pages: a spreads/ folder of designed pages when present, otherwise the automatic layout.
  const coverPhoto = gallery.length ? pickCover(config.cover, photos, gallery) : null;
  const pageRatio = await decideRatio(config, designed);
  const PHd = Math.round(PW / pageRatio);
  const tP = Date.now();
  const gen = (kind, t) => (t ? { generated: kind, title: t } : { generated: kind });

  async function imagePage(file, prefix, isSpread) {
    const buf = await fsp.readFile(file);
    const name = `${prefix}-${hash8(Buffer.concat([buf, Buffer.from(`${PHd}${isSpread ? 's' : ''}`)]))}.webp`;
    const full = join(outDir, 'pages', name), thumb = join(outDir, 'pages', 'thumb', name);
    keep.add(full); keep.add(thumb);
    if (!force && await exists(full) && await exists(thumb)) stats.pagesReused++;
    else {
      const w = isSpread ? PW * 2 : PW;
      const img = sharp(buf, { limitInputPixels: false }).rotate();
      await writeAtomic(full, await img.clone().resize(w, PHd, { fit: 'cover' }).webp({ quality: 82 }).toBuffer());
      await writeAtomic(thumb, await img.clone().resize(Math.round(w / 6), Math.round(PHd / 6), { fit: 'cover' }).webp({ quality: 72 }).toBuffer());
      stats.pagesRendered++;
    }
    return isSpread ? { spread: `pages/${name}`, thumb: `pages/thumb/${name}` } : { src: `pages/${name}`, thumb: `pages/thumb/${name}` };
  }
  const providedOr = async (kind, t) => {
    if (!designed.covers[kind]) return gen(kind, t);
    const e = await imagePage(designed.covers[kind], kind, false);
    return t ? { ...e, title: t } : e;
  };

  const head = [await providedOr('cover', 'Cover'), await providedOr('inside-front')];
  const tail = [await providedOr('inside-back'), await providedOr('back', 'Back cover')];
  const count = (list) => list.reduce((n, p) => n + (p.spread ? 2 : 1), 0);
  let body = [];
  let sectionPages = {};
  if (designed.spreads.length) {
    body.push(gen('flyleaf'));   // faces the inside front cover, so the first spread opens on a left page
    for (const [i, file] of designed.spreads.entries()) {
      const meta = await sharp(file).metadata();
      const [w, h] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
      const isSpread = w / h > pageRatio * 1.5;
      if (isSpread && (head.length + count(body)) % 2 === 0) body.push({ blank: true });   // spreads must start on a left page
      body.push(await imagePage(file, `s${String(i + 1).padStart(3, '0')}`, isSpread));
    }
  } else {
    const specs = planPages({ type, theme, names, title, config, sections, coverPhoto, studio });
    const byHash = new Map(gallery.map((g) => [g.hash, g]));
    const ctx = { photoFile: (h) => join(outDir, byHash.get(h).download), mediaFile: (p) => join(outDir, p) };
    body = await pool(specs, CONCURRENCY, async (spec, i) => {
      const { meta, ...design } = spec;
      const name = `p${String(i + 3).padStart(3, '0')}-${pageHash(design)}.webp`;
      const full = join(outDir, 'pages', name), thumb = join(outDir, 'pages', 'thumb', name);
      keep.add(full); keep.add(thumb);
      if (!force && await exists(full) && await exists(thumb)) stats.pagesReused++;
      else {
        const r = await renderPage(design, ctx);
        await writeAtomic(full, r.full);
        await writeAtomic(thumb, r.thumb);
        stats.pagesRendered++;
      }
      const entry = { src: `pages/${name}`, thumb: `pages/thumb/${name}` };
      if (meta?.title) entry.title = meta.title;
      return entry;
    });
    specs.forEach((s, i) => { if (s.kind === 'divider') sectionPages[s.meta.sectionKey] = head.length + i + 1; });
  }
  // the inside back cover is the right-hand page of the last spread
  if ((head.length + count(body)) % 2 === 1) body.push(gen('flyleaf'));
  const pages = [...head, ...body, ...tail];
  console.log(`  pages: ${count(pages)} (${designed.spreads.length ? 'designed spreads' : 'automatic layout'}, ` +
    `${Object.values(designed.covers).filter(Boolean).length} provided cover files, ${stats.pagesRendered} rendered, ` +
    `${stats.pagesReused} cached, ${((Date.now() - tP) / 1000).toFixed(1)}s)`);

  // ---- album.json ----------------------------------------------------------------------------------------------
  const sectionsOut = sections.map((s) => ({ key: s.key, title: s.title, count: s.files.length, page: sectionPages[s.key] || 0 }));
  const album = {
    id: albumId, type, title, names, date: config.date || '', location: config.location || '', studio,
    music, downloadUrl: config.downloadUrl || '', hardCover: config.hardCover !== false, theme,
    template: config.template || 'jharokha',
    cover: coverPhoto ? coverPhoto.display : '',
    pageWidth: 1296, pageHeight: Math.round(1296 / pageRatio),
    sections: sectionsOut,
    pages,
    gallery: gallery.map(({ id, section, display, thumb, download, width, height, blur }) =>
      ({ id, section, display, thumb, download, width, height, blur })),
  };
  const json = JSON.stringify(album, null, 2) + '\n';
  const jsonPath = join(outDir, 'album.json');
  if (!(await exists(jsonPath)) || (await fsp.readFile(jsonPath, 'utf8')) !== json) await writeAtomic(jsonPath, json);

  // ---- remove stale outputs ------------------------------------------------------------------------------------
  let removed = 0;
  for (const f of await walk(outDir)) {
    if (!keep.has(f.path)) { await fsp.rm(f.path); removed++; }
  }

  // ---- contact sheets (build/, not deployed) -------------------------------------------------------------------
  const sheets = await writeContactSheets({ root: ROOT, albumId, outDir, album, theme, paper: PAPER });

  // ---- totals & limits -----------------------------------------------------------------------------------------
  const albumFiles = await walk(outDir);
  const distFiles = await walk(join(ROOT, 'dist'));
  const albumBytes = albumFiles.reduce((a, f) => a + f.size, 0);
  const distBytes = distFiles.reduce((a, f) => a + f.size, 0);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  photos:       ${gallery.length} (${stats.encoded} encoded, ${stats.reused} cached)`);
  console.log(`  pages:        ${pages.length}`);
  console.log(`  album files:  ${albumFiles.length} (${formatBytes(albumBytes)})${removed ? `, removed ${removed} stale` : ''}`);
  console.log(`  dist/ total:  ${distFiles.length} files, ${formatBytes(distBytes)}`);
  console.log(`  contact sheets: ${sheets.map((p) => relative(ROOT, p)).join(', ')}`);
  const big = distFiles.filter((f) => f.size >= MAX_FILE_BYTES);
  if (big.length) fail(`files >= 25 MiB in dist/ (Cloudflare Pages limit):\n  ${big.map((f) => `${relative(ROOT, f.path)} ${formatBytes(f.size)}`).join('\n  ')}`);
  if (distFiles.length > MAX_FILES) fail(`dist/ holds ${distFiles.length} files, more than ${MAX_FILES} (Cloudflare Pages allows 20,000)`);
}

// ---------------------------------------------------------------------------------------------------------------
async function readConfig(srcDir) {
  const p = join(srcDir, 'album.config.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch (e) { fail(`album.config.json: ${e.message}`); }
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

async function scanSections(srcDir, config) {
  const dirs = (await fsp.readdir(srcDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name.toLowerCase() !== 'spreads').map((d) => d.name).sort(byName);
  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    let key = dir.replace(/^\d+[-_ ]*/, '').trim().toLowerCase().replace(/\s+/g, '-') || dir.toLowerCase();
    while (seen.has(key)) key += '-2';
    seen.add(key);
    const files = (await fsp.readdir(join(srcDir, dir), { withFileTypes: true }))
      .filter((f) => f.isFile() && PHOTO_EXT.has(extname(f.name).toLowerCase()) && !f.name.startsWith('.'))
      .map((f) => f.name).sort(byName)
      .map((f) => ({ abs: join(srcDir, dir, f), rel: `${dir}/${f}` }));
    if (!files.length) { console.warn(`! skipping empty section folder ${dir}/`); continue; }
    const pretty = key.replace(/-/g, ' ');
    const title = config.sections?.[key] || pretty.charAt(0).toUpperCase() + pretty.slice(1);
    out.push({ dir, key, title, files });
  }
  return out;
}

/** Map existing output files by their content hash, so a renumbered photo is copied instead of re-encoded. */
async function indexExisting(outDir) {
  const idx = {};
  for (const kind of Object.keys(SIZES)) {
    idx[kind] = new Map();
    for (const f of await fsp.readdir(join(outDir, kind))) {
      const m = /^\d{4,}-([0-9a-f]{8})\./.exec(f);
      if (m) idx[kind].set(m[1], join(outDir, kind, f));
    }
  }
  return idx;
}

async function processPhoto({ file, n }, { outDir, existing, force, stats, keep }) {
  const buf = await fsp.readFile(file.abs);
  const hash = hash8(buf);
  const id = `${String(n).padStart(4, '0')}-${hash}`;
  const paths = Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, join(outDir, k, `${id}.${v.ext}`)]));
  Object.values(paths).forEach((p) => keep.add(p));

  let missing = [];
  for (const [kind, p] of Object.entries(paths)) {
    if (force || !(await exists(p))) {
      const prev = !force && existing[kind].get(hash);
      if (prev && prev !== p && await exists(prev)) await fsp.copyFile(prev, p);   // same photo, new position
      else missing.push(kind);
    }
  }

  if (missing.length) {
    let base, info;
    try {
      // decode once: auto-orient, flatten alpha, convert to sRGB 8-bit, cap at the largest output size
      ({ data: base, info } = await sharp(buf, { failOn: 'error', limitInputPixels: 0 })
        .rotate()
        .flatten({ background: '#ffffff' })
        .toColourspace('srgb')
        .resize({ width: SIZES.download.long, height: SIZES.download.long, fit: 'inside', withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true }));
    } catch (e) {
      fail(`cannot read ${file.rel}: ${e.message}`);
    }
    for (const kind of missing) {
      const { long } = SIZES[kind];
      // metadata is dropped because we never call keepExif/keepMetadata/withMetadata
      const img = sharp(base, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .resize({ width: long, height: long, fit: 'inside', withoutEnlargement: true });
      await writeAtomic(paths[kind], await SIZES[kind].encode(img).toBuffer());
    }
    stats.encoded++;
  } else stats.reused++;

  const meta = await sharp(paths.display).metadata();
  const blur = await sharp(paths.thumb).resize(20, 20, { fit: 'inside' }).webp({ quality: 40 }).toBuffer();
  return {
    id, hash, rel: file.rel,
    display: `display/${id}.webp`, thumb: `thumb/${id}.webp`, download: `download/${id}.jpg`,
    width: meta.width, height: meta.height,
    blur: `data:image/webp;base64,${blur.toString('base64')}`,
  };
}

/** Copy a config-referenced file (music/logo) that lives inside originals/<id>/ into media/; URLs pass through. */
async function copyMedia(ref, srcDir, outDir, keep) {
  if (!ref) return '';
  if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('data:')) return ref;
  const abs = resolve(srcDir, ref);
  if (!abs.startsWith(srcDir + sep) || !existsSync(abs)) {
    console.warn(`! ${ref} is not a file inside originals/; leaving it as is`);
    return ref;
  }
  const buf = await fsp.readFile(abs);
  const ext = extname(abs).toLowerCase();
  const stem = basename(abs, extname(abs)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'file';
  const name = `media/${stem}-${hash8(buf)}${ext}`;
  const dest = join(outDir, name);
  keep.add(dest);
  if (!existsSync(dest)) await writeAtomic(dest, buf);
  return name;
}

/** Photographer-designed files: cover/back/inside-front/inside-back images in the album folder, and spreads/. */
async function scanDesigned(srcDir) {
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  const top = entries.filter((f) => f.isFile() && PHOTO_EXT.has(extname(f.name).toLowerCase()));
  const covers = {};
  for (const kind of ['cover', 'inside-front', 'inside-back', 'back']) {
    const hit = top.find((f) => basename(f.name, extname(f.name)).toLowerCase() === kind);
    covers[kind] = hit ? join(srcDir, hit.name) : null;
  }
  let spreads = [];
  const dir = entries.find((d) => d.isDirectory() && d.name.toLowerCase() === 'spreads');
  if (dir) {
    spreads = (await fsp.readdir(join(srcDir, dir.name), { withFileTypes: true }))
      .filter((f) => f.isFile() && PHOTO_EXT.has(extname(f.name).toLowerCase()) && !f.name.startsWith('.'))
      .map((f) => f.name).sort(byName).map((f) => join(srcDir, dir.name, f));
  }
  return { covers, spreads };
}

/** Width / height of one page. Designed albums take it from their spreads (24x12 in spreads = square pages). */
async function decideRatio(config, designed) {
  if (!designed.spreads.length) return 1.5;   // the automatic layout renders 3:2 pages
  if (config.pageRatio) {
    const m = String(config.pageRatio).match(/^(\d+(?:\.\d+)?)(?:\s*[x:/]\s*(\d+(?:\.\d+)?))?$/);
    if (m) return m[2] ? +m[1] / +m[2] : +m[1];
  }
  const meta = await sharp(designed.spreads[0]).metadata();
  const [w, h] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const r = w / h;
  return r > 1.9 ? r / 2 : r;   // a wide first file is a two-page spread
}

function pickCover(cover, photos, gallery) {
  if (cover) {
    const want = cover.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
    const i = photos.findIndex((p) => p.file.rel.toLowerCase() === want);
    if (i >= 0) return gallery[i];
    console.warn(`! cover "${cover}" not found among the photos; using the first landscape photo`);
  }
  return gallery.find((g) => g.width / g.height > 1.1) || gallery[0];
}

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** The page sequence as design specs. `meta` is not part of the page hash. */
function planPages({ type, theme, names, title, config, sections, coverPhoto, studio }) {
  const date = formatDate(config.date);
  const location = (config.location || '').trim();
  const label = TYPE_LABELS[type];
  const line1 = label && location ? `${label} in ${location}` : (label || location);
  const firstGrapheme = (t) => (new Intl.Segmenter().segment(t.trim())[Symbol.iterator]().next().value?.segment || '').toUpperCase();
  const initials = names.length ? names.map(firstGrapheme) : [firstGrapheme(title)];
  // cover, endpapers and back cover come from the template (or the photographer's files): inner pages only here
  const specs = [
    { kind: 'title', theme, names, title, line1, line2: date, meta: { title: 'Welcome' } },
  ];
  sections.forEach((s, si) => {
    specs.push({ kind: 'divider', theme, title: s.title,
      sub: sections.length > 1 && si < NUMBER_WORDS.length ? `Chapter ${NUMBER_WORDS[si]}` : '',
      meta: { title: s.title, sectionKey: s.key } });
    let pending = null;
    const flush = () => {
      if (pending) specs.push({ kind: 'single', photo: pending.hash, ratio: +(pending.width / pending.height).toFixed(4) });
      pending = null;
    };
    for (const p of s.items) {
      if (p.width / p.height > 1.1) { flush(); specs.push({ kind: 'full', photo: p.hash }); }
      else if (pending) { specs.push({ kind: 'pair', photos: [pending.hash, p.hash] }); pending = null; }
      else pending = p;
    }
    flush();
  });
  const closingLine = { wedding: 'for being part of our story', engagement: 'for celebrating the beginning with us',
    anniversary: 'for every year we have shared with you', birthday: 'for making the day so special',
  }[type] ?? 'for being part of our story';
  specs.push({ kind: 'closing', theme, heading: 'Thank you', line: closingLine, meta: { title: 'Thank you' } });
  return specs;
}

main().catch((e) => {
  console.error(`\nbuild-album failed: ${e instanceof BuildError ? e.message : e.stack || e}`);
  process.exit(1);
});
