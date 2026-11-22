// Runs for every request: optional guest password gate (PLAN option B) + privacy headers.
// The gate is active only when the ALBUM_PASSWORD secret is set. With Cloudflare Access (option A) leave it unset.
import { verifyToken, GATE_COOKIE, currentUser } from '../lib/auth.js';
import { getCookie } from '../lib/http.js';

// Reachable without the guest password: the unlock call, fonts, and the admin area (it has its own sign-in).
const OPEN_PATHS = [/^\/api\/unlock$/, /^\/assets\/fonts\//, /^\/robots\.txt$/, /^\/favicon/, /^\/admin(\.html)?$/, /^\/api\/admin\//,
  /^\/assets\/css\/(fonts|base|admin|page-templates|page-editor|template-designer|free-editor|onboarding)\.css$/, /^\/assets\/library\//,
  /^\/assets\/js\/(admin|album-meta|cover-templates|cover-templates-more|qr|crop|page-templates|page-editor|template-designer|free-editor|onboarding)\.js$/,
  /^\/assets\/js\/vendor\/(pdfjs\/|qrcode-)/];

function withHeaders(res) {
  const r = new Response(res.body, res);
  r.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'same-origin');
  r.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return r;
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  if (env.ALBUM_PASSWORD && !OPEN_PATHS.some((re) => re.test(url.pathname))) {
    let ok = await verifyToken(env.ALBUM_SECRET, 'gate', getCookie(request, GATE_COOKIE));
    if (!ok) ok = !!(await currentUser(request, env).catch(() => null));   // signed-in studios pass the gate
    if (!ok) {
      if (url.pathname.startsWith('/api/')) {
        return withHeaders(new Response(JSON.stringify({ error: 'Enter the album password first.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
      }
      return withHeaders(new Response(gatePage(), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
  }
  return withHeaders(await next());
}

function gatePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Private album</title><link rel="stylesheet" href="/assets/css/fonts.css">
<style>
:root{--silk:#0F3D3E;--rani:#C8255F;--jasmine:#FBF7F1}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;font-family:Mukta,system-ui,sans-serif;color:var(--jasmine);
background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.07) 45%,transparent 60%),repeating-linear-gradient(45deg,rgba(255,255,255,.018) 0 2px,transparent 2px 5px),var(--silk)}
form{width:min(360px,100%)}h1{font:400 40px/1.1 "Rozha One",Georgia,serif;margin:0 0 8px}p{margin:0 0 24px;opacity:.8;line-height:1.5}
label{display:block;font-size:15px;margin-bottom:6px}input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.2);color:inherit;font:inherit;font-size:17px}
input:focus{outline:2px solid var(--rani);outline-offset:2px}button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--rani);color:#fff;font:600 17px Mukta,sans-serif;cursor:pointer}
.err{color:#ffb3c8;min-height:1.4em;margin-top:10px}</style></head><body>
<form id="f"><h1>A private album</h1><p>This album is shared with family and friends. Enter the password from your invitation.</p>
<label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required autofocus>
<button>Open album</button><div class="err" id="e" role="alert"></div></form>
<script>document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var e=document.getElementById('e');e.textContent='';
var r=await fetch('/api/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
if(r.ok){location.reload()}else{var j=await r.json().catch(function(){return{}});e.textContent=j.error||'That password did not work.'}}</script></body></html>`;
}
