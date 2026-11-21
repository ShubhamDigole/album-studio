// Local server: runs the same backend as Cloudflare (functions/ + lib/), with everything kept in a local folder.
//   data/album.sqlite   the database (instead of Cloudflare D1)
//   data/media/         uploaded photos, PDF pages and covers (instead of Cloudflare R2)
// No wrangler, no Cloudflare account needed.  Start:  npm run local   ->  http://localhost:8080
//
// Settings come from .dev.vars (ALBUM_SECRET, MASTER_EMAIL, ADMIN_PASSWORD, optional ALBUM_PASSWORD, GOOGLE_API_KEY).
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { join, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { randomBytes, createHash } from 'node:crypto';

process.removeAllListeners('warning');   // hide "SQLite is an experimental feature" noise
const { DatabaseSync } = await import('node:sqlite');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || +process.argv[2] || 8080;
const DATA = join(root, 'data');
const MEDIA_DIR = join(DATA, 'media');
const SITE = join(root, 'dist');
mkdirSync(MEDIA_DIR, { recursive: true });

/* ---------- settings (.dev.vars) ---------- */
function readVars(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const vars = readVars(join(root, '.dev.vars'));
if (!vars.ALBUM_SECRET) {
  vars.ALBUM_SECRET = randomBytes(32).toString('hex');
  console.warn('! No ALBUM_SECRET in .dev.vars: using a temporary one (you will be signed out when the server restarts).');
}

/* ---------- database: a D1-compatible wrapper around a local SQLite file ---------- */
const sqlite = new DatabaseSync(join(DATA, 'album.sqlite'));
const schemaSql = readFileSync(join(root, 'schema.sql'), 'utf8');
sqlite.exec(schemaSql);
// An existing data/album.sqlite may predate columns added to schema.sql later (D1 gets them from migrations/):
// compare with a fresh in-memory copy of the schema and add what is missing.
{
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(schemaSql);
  const tables = fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
  for (const t of tables) {
    const have = new Set(sqlite.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
    for (const c of fresh.prepare(`PRAGMA table_info(${t})`).all()) {
      if (have.has(c.name)) continue;
      const def = c.dflt_value !== null ? ' DEFAULT ' + c.dflt_value : '';
      sqlite.exec(`ALTER TABLE ${t} ADD COLUMN ${c.name} ${c.type}${c.notnull && def ? ' NOT NULL' : ''}${def}`);
      console.log(`Database: added column ${t}.${c.name}`);
    }
  }
  fresh.close();
}
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const plain = (row) => (row ? { ...row } : null);
function statement(sql, args = []) {
  return {
    bind: (...a) => statement(sql, a.map(norm)),
    first: async (col) => { const r = plain(sqlite.prepare(sql).get(...args)); return r && col ? r[col] : r; },
    all: async () => ({ results: sqlite.prepare(sql).all(...args).map(plain), success: true, meta: {} }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    _exec: () => sqlite.prepare(sql).run(...args),
  };
}
const DB = {
  prepare: (sql) => statement(sql),
  batch: async (stmts) => {
    sqlite.exec('BEGIN');
    try { const out = stmts.map((s) => s._exec()); sqlite.exec('COMMIT'); return out.map(() => ({ success: true })); }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
  exec: async (sql) => sqlite.exec(sql),
};

/* ---------- media: an R2-compatible wrapper around data/media ---------- */
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const mediaPath = (key) => {
  const p = join(MEDIA_DIR, ...key.split('/'));
  if (!p.startsWith(MEDIA_DIR + sep)) throw new Error('bad key');
  return p;
};
const MEDIA = {
  async put(key, body) {
    const p = mediaPath(key);
    await fsp.mkdir(dirname(p), { recursive: true });
    const buf = body instanceof ReadableStream ? Buffer.from(await new Response(body).arrayBuffer())
      : body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body);
    await fsp.writeFile(p, buf);
    return { key };
  },
  async get(key, opts = {}) {
    const p = mediaPath(key);
    if (!existsSync(p)) return null;
    const st = statSync(p);
    const etag = createHash('sha1').update(key + st.size + st.mtimeMs).digest('hex').slice(0, 16);
    const meta = {
      key, size: st.size, httpEtag: `"${etag}"`,
      writeHttpMetadata: (h) => h.set('Content-Type', TYPES[extname(p).toLowerCase()] || 'application/octet-stream'),
    };
    if (opts.onlyIf && opts.onlyIf.etagDoesNotMatch === etag) return meta;   // 304
    return { ...meta, body: Readable.toWeb(createReadStream(p)) };
  },
  async delete(keys) {
    for (const k of [].concat(keys)) { try { await fsp.unlink(mediaPath(k)); } catch { /* already gone */ } }
  },
  async list({ prefix = '' } = {}) {
    const objects = [];
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else { const key = relative(MEDIA_DIR, p).split(sep).join('/'); if (key.startsWith(prefix)) objects.push({ key }); }
      }
    };
    walk(MEDIA_DIR);
    return { objects, truncated: false };
  },
};

/* ---------- static site (dist/), with Pages-style pretty URLs ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};
function staticFile(pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const candidates = [rel, extname(rel) ? null : rel + '.html'].filter(Boolean);
  for (const c of candidates) {
    const p = join(SITE, ...c.split('/'));
    if (p.startsWith(SITE) && existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
async function serveStatic(request) {
  const url = new URL(request.url);
  if (/\.html$/.test(url.pathname) && url.pathname !== '/index.html') {
    // Pages redirects /gallery.html -> /gallery
    return new Response(null, { status: 308, headers: { Location: url.pathname.replace(/\.html$/, '') + url.search } });
  }
  const p = staticFile(url.pathname);
  if (!p) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  const type = MIME[extname(p).toLowerCase()] || 'application/octet-stream';
  const cache = /\/(display|thumb|download|pages)\//.test(url.pathname) || /\/fonts\//.test(url.pathname) ? 'private, max-age=31536000, immutable' : 'no-cache';
  return new Response(await fsp.readFile(p), { headers: { 'Content-Type': type, 'Cache-Control': cache } });
}
const ASSETS = { fetch: (input) => serveStatic(new Request(typeof input === 'string' || input instanceof URL ? input : input.url)) };

/* ---------- functions/ routing, like Cloudflare Pages ---------- */
const FN = join(root, 'functions');
const routes = [];
const middlewares = [];
(function scan(dir, segs) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { scan(p, [...segs, name]); continue; }
    if (!name.endsWith('.js')) continue;
    const base = name.slice(0, -3);
    if (base === '_middleware') { middlewares.push({ prefix: '/' + segs.join('/'), file: p }); continue; }
    const parts = base === 'index' ? segs : [...segs, base];
    routes.push({ parts, file: p, score: parts.map((s) => (s.startsWith('[[') ? 0 : s.startsWith('[') ? 1 : 2)) });
  }
})(FN, []);
routes.sort((a, b) => {
  for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) {
    const x = a.score[i] ?? -1, y = b.score[i] ?? -1;
    if (x !== y) return y - x;
  }
  return 0;
});
middlewares.sort((a, b) => a.prefix.length - b.prefix.length);

function match(pathname) {
  const segs = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  for (const r of routes) {
    const params = {};
    let ok = true, i = 0;
    for (; i < r.parts.length; i++) {
      const part = r.parts[i];
      if (part.startsWith('[[')) { const rest = segs.slice(i); if (!rest.length) { ok = false; break; } params[part.slice(2, -2)] = rest; i = segs.length; break; }
      if (i >= segs.length) { ok = false; break; }
      if (part.startsWith('[')) params[part.slice(1, -1)] = segs[i];
      else if (part !== segs[i]) { ok = false; break; }
    }
    if (ok && i === segs.length) return { route: r, params };
  }
  return null;
}
const modules = new Map();
const load = async (file) => {
  if (!modules.has(file)) modules.set(file, await import(pathToFileURL(file).href));
  return modules.get(file);
};
const METHOD = { GET: 'onRequestGet', POST: 'onRequestPost', PUT: 'onRequestPut', PATCH: 'onRequestPatch', DELETE: 'onRequestDelete', HEAD: 'onRequestHead' };

const env = { ...vars, DB, MEDIA, ASSETS };

async function handle(request) {
  const url = new URL(request.url);
  const found = match(url.pathname);
  const chain = [];
  for (const mw of middlewares) {
    if (url.pathname === mw.prefix || url.pathname.startsWith(mw.prefix === '/' ? '/' : mw.prefix + '/')) chain.push((await load(mw.file)).onRequest);
  }
  let final;
  if (found) {
    const mod = await load(found.route.file);
    const fn = mod[METHOD[request.method]] || mod.onRequest;
    final = fn ? (ctx) => fn(ctx) : () => new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } else final = () => serveStatic(request);
  const ctx = { request, env, params: found ? found.params : {}, data: {}, waitUntil() {}, passThroughOnException() {} };
  let i = 0;
  ctx.next = async () => {
    const f = chain[i++];
    return f ? f({ ...ctx, next: ctx.next }) : final(ctx);
  };
  return ctx.next();
}

/* ---------- node http <-> fetch Request/Response ---------- */
createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host || 'localhost:' + PORT}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', req.socket.remoteAddress || 'local');
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(url, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: 'half' });
    const response = await handle(request);
    const out = {};
    response.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(response.status, out);
    if (response.body && req.method !== 'HEAD') Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Something went wrong on the local server.' }));
  }
}).listen(PORT, () => {
  console.log(`Album studio (local): http://localhost:${PORT}/admin`);
  console.log(`  data:   ${relative(root, DATA)}${sep}album.sqlite and ${relative(root, MEDIA_DIR)}${sep}`);
  console.log(`  master: ${vars.MASTER_EMAIL || '(set MASTER_EMAIL and ADMIN_PASSWORD in .dev.vars)'}`);
});
