// Small helpers shared by tools/build-album.mjs and its libs.
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export const sha1 = (data) => createHash('sha1').update(data).digest('hex');
export const hash8 = (data) => sha1(data).slice(0, 8);

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const byName = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

export async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

/** Write atomically (tmp + rename) so an interrupted run never leaves a half file that later counts as "done". */
export async function writeAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, path);
}

/** All files below `dir` (recursive) as { path, size }. */
export async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.isFile()) out.push({ path: p, size: (await fsp.stat(p)).size });
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];

/** "2026-02-12" -> "12 February 2026"; "2026-02" -> "February 2026"; anything else is returned unchanged. */
export function formatDate(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s).trim());
  if (!m) return String(s);
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return String(s);
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

/** Escape text for Pango markup. */
export const escMarkup = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape text for SVG/XML attributes and content. */
export const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
