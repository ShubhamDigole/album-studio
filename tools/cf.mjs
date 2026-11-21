// Run wrangler with the Cloudflare credentials from .env, without printing them.
//   node tools/cf.mjs <wrangler arguments...>      e.g.  node tools/cf.mjs whoami
// .env may use CF_API_TOKEN / CF_ACCOUNT_ID or CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, '.env');
const vars = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
const env = { ...process.env };
env.CLOUDFLARE_API_TOKEN = vars.CLOUDFLARE_API_TOKEN || vars.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN;
env.CLOUDFLARE_ACCOUNT_ID = vars.CLOUDFLARE_ACCOUNT_ID || vars.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
if (!env.CLOUDFLARE_API_TOKEN) { console.error('No Cloudflare token: add CF_API_TOKEN=... to .env'); process.exit(1); }
const r = spawnSync('npx', ['wrangler', ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
