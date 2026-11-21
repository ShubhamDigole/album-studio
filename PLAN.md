# Wedding Album: plan, tech stack and build prompt

Personal project. Kept apart from the Khaufnama channel project: its own folder, its own Cloudflare key, its own repo.

## 1. Goal
A private online wedding album for family and guests:
- **Album view:** a realistic flipbook with page-turn, thumbnails, sections (Haldi, Mehendi, Sangeet, Wedding, Reception), music,
  autoplay, zoom and full screen. Works on phones.
- **Simple gallery view** of the same photos, with tap-to-enlarge and download.
- **Guestbook:** blessings/messages, plus "favourite" hearts on photos.
- **Only invited people can open it.**
- **Free forever:** Cloudflare free plan, no card. Photos ≤ 2 GB of originals.

## 2. What already exists (`C:\Users\ShubhamDigole\code\albumviewer`)
- `index.html`, `assets/js/viewer.js` (938 lines), `assets/css/viewer.css`: a FlipHTML5-style viewer on StPageFlip (MIT,
  `assets/js/vendor/page-flip.browser.js`).
- Album data sources, first match wins:
  1. `?album=<url-to-json>`, meant for a backend
  2. `?id=<folder>`, which loads `albums/<folder>/album.js`
  3. `albums/demo/album.js` by default
- `albums/demo/album.json` format:
  - Album fields: `id, title, subtitle, studio{name,logo,url,phone}, pageWidth 1296, pageHeight 864, hardCover, music,
    autoplayInterval, downloadUrl, theme{accent, background}`.
  - `pages[]`: each `{src, thumb?, title?}`.
- `tools/make-demo-album.mjs`: generates the demo's SVG cover/section pages, with picsum placeholder photos.

## 3. Architecture (all free tier, no payment method)

| Layer | Choice | Why |
|---|---|---|
| Hosting | **Cloudflare Pages** (direct upload with `wrangler pages deploy`) | Free, global CDN, unlimited static bandwidth; limits: 20,000 files per deploy, 25 MiB per file, 500 deploys/month |
| Frontend | The existing vanilla JS viewer + a new grid gallery page (no framework, no build step) | Already built and fast; nothing to compile |
| Image pipeline | Node script with **sharp**, run locally | Turns 2 GB of originals into ~300–400 MB of web images; strips GPS/EXIF |
| Backend | **Pages Functions** (`functions/` folder = Workers) | Free 100,000 requests/day; same deploy as the site |
| Database | **Cloudflare D1** (SQLite) | Free 5 GB, 5M reads/day, 100k writes/day; guestbook, favourites, view counts |
| Access control | **Cloudflare Access** (Zero Trust Free, ≤50 users, email one-time PIN). Fallback: a password gate in `functions/_middleware.js` | Access blocks strangers before any file is served and costs no Function requests |
| Big downloads | "Download all" links to a Google Drive / Google Photos folder (`downloadUrl`) | A 2 GB zip can't be hosted on Pages (25 MiB per file) |
| Code repo (optional) | Private GitHub repo, **code only**, never photos | Photos are personal and too big for git |

### 3.1 Image pipeline (`tools/build-album.mjs`)
- **Input:** `originals/<albumId>/` holds sub-folders per section, for example `01-haldi/`, `02-mehendi/`… Files are sorted by name.
  An optional `originals/<albumId>/album.config.json` sets title, subtitle, date, place, music, accent colour, section titles,
  cover photo and the Drive download link.
- **For every photo:**
  - auto-rotate from EXIF, then **strip all metadata (GPS!)**;
  - `display/NNNN-<hash8>.webp`: long side 2400 px, quality 80 (about 300–600 KB);
  - `thumb/NNNN-<hash8>.webp`: long side 400 px, quality 70;
  - `download/NNNN-<hash8>.jpg`: long side 3200 px, quality 85, which must stay < 25 MiB;
  - a tiny blurred placeholder (20 px base64) and the width/height, written into the JSON;
  - a hash in each file name, so the site can cache files forever and a changed photo gets a new name.
- **Album pages:** photos are 3:2 or 2:3, and the flipbook pages are 1296×864.
  - A landscape photo fills a page.
  - Portrait photos are placed two to a page on a paper-texture background, or one centred with a mat. sharp composites these pages.
- Section divider pages: reuse the SVG generators from `make-demo-album.mjs`, filled with the real names, date and place.
- Output goes to `dist/albums/<albumId>/` plus `album.json` (the same format as the demo, plus `gallery[]` with every photo's
  display/thumb/download/width/height/section/blur).
- The script is incremental: it skips photos whose output already exists. At the end it prints the file count and the
  total size, and refuses to continue if the file count would pass 19,000 or any file would be ≥ 25 MiB.

### 3.2 Backend (Pages Functions)
| Route | Method | Does |
|---|---|---|
| `/api/album/:id` | GET | album JSON (static file, or D1 when edited online later) |
| `/api/guestbook/:id` | GET | approved messages, newest first, 50 per page |
| `/api/guestbook/:id` | POST | `{name, message}`; name ≤ 60 chars, message ≤ 1,000 chars; rate limit 5 per 10 min per visitor (D1 counter); stored `approved=1` by default, with a flag to require approval |
| `/api/favorite/:id/:photo` | POST/DELETE | toggle a heart (visitor id = random id in a cookie) |
| `/api/favorites/:id` | GET | heart counts per photo |
| `/api/view/:id` | POST | +1 to today's view count |
| `/admin` | GET | (behind Access, admin emails only) list, hide or delete guestbook messages; see views |

All input is validated and every query is parameterised (no string-built SQL). Output is escaped when shown (no HTML injection
in guestbook messages).

### 3.3 Database (D1 `album_db`, file `schema.sql`)
```sql
CREATE TABLE guestbook (id INTEGER PRIMARY KEY AUTOINCREMENT, album_id TEXT NOT NULL, name TEXT NOT NULL,
  message TEXT NOT NULL, created_at INTEGER NOT NULL, approved INTEGER NOT NULL DEFAULT 1, visitor TEXT);
CREATE INDEX gb_album ON guestbook(album_id, created_at DESC);
CREATE TABLE favorites (album_id TEXT NOT NULL, photo TEXT NOT NULL, visitor TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (album_id, photo, visitor));
CREATE TABLE views (album_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (album_id, day));
CREATE TABLE rate (key TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at INTEGER NOT NULL);
```

### 3.4 Who can open it
- **Option A (preferred): Cloudflare Access.**
  - Zero Trust → Access → Applications → Self-hosted: protect `<project>.pages.dev` and `*.<project>.pages.dev`
    (preview URLs too!).
  - Policy "Allow" → Emails = the guest list. Login method = One-time PIN by email.
  - A second application for `/admin*` with only the couple's emails.
  - Free up to 50 users. **If the Zero Trust sign-up asks for a card, stop and choose Option B.**
- **Option B: password gate.**
  - `functions/_middleware.js` checks a signed cookie (HMAC-SHA256 with the secret `ALBUM_SECRET`, set with
    `wrangler pages secret put`). Without it, it shows a small password page.
  - Note: the middleware runs on every file, so each visit spends ~100–200 Function requests of the 100,000 a day (about
    500+ visits a day, enough for a wedding).
- Either way: add `<meta name="robots" content="noindex">` and a `robots.txt` with `Disallow: /`.

## 4. The Cloudflare API token: what to create

Use **a separate free Cloudflare account for personal things**, not the channel's account (recommended; then the channel's
Reel poster and quotas can never be affected).

In that account: **My Profile → API Tokens → Create Token → Create Custom Token**
- **Token name:** `wedding-album-deploy`
- **Permissions:**
  | Scope | Permission | Access | Needed for |
  |---|---|---|---|
  | Account | Cloudflare Pages | Edit | create the project, deploy, set secrets |
  | Account | D1 | Edit | create the database, run schema/migrations |
  | Account | Account Settings | Read | `wrangler whoami`, finding the account |
  | Account | Access: Apps and Policies | Edit | *only if* Claude should set up Option A for you; otherwise do Access by hand in the dashboard and leave it out |
- **Account Resources:** Include → *your personal account only*.
- **Zone Resources:** none. (Only with a custom domain you bought: Include → that zone, plus **Zone → DNS → Edit**.)
- **Client IP filtering:** optional (your home IP).
- **TTL:** an end date about 30–60 days out; make a new token later if needed.

Put it in `C:\Users\ShubhamDigole\code\albumviewer\.env` yourself (wrangler reads these names):
```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
```
The Account ID is on the account's home page, in the right-hand sidebar. **Never paste the token into chat.** Claude must
never print it, `cat` the .env, or commit it.

## 5. Build phases (each ends with a check)
1. **Setup:**
   - `git init`; `.gitignore` covers `.env`, `originals/`, `dist/`, `node_modules/` and `.wrangler/`.
   - `package.json` with `sharp` and `wrangler` (pinned exact versions); `wrangler.toml` with
     `pages_build_output_dir = "dist"` and the D1 binding.
   - Check: `npx wrangler whoami` shows the personal account.
2. **Image pipeline:** `node tools/build-album.mjs <albumId>` on 20 test photos.
   - Check: sizes, rotation, no EXIF/GPS left (verify with `exiftool` or sharp metadata), and page composites look right.
     Open a contact sheet and look at it.
3. **Viewer on real data:** load `dist/albums/<id>/album.json`; add the grid gallery page (`gallery.html`) with lazy-loading
   thumbs, blur placeholders, lightbox, per-photo download and a section filter.
   - Check: works at 360 px phone width and on desktop; no layout shift; first screen < 1.5 MB.
4. **Backend + DB:** `wrangler d1 create album_db`; apply `schema.sql` locally and remotely; Functions as in 3.2; guestbook and
   hearts in the UI.
   - Check: `wrangler pages dev dist` locally; a POST with `<script>` shows as plain text; rate limit works.
5. **Access:** Option A (or B).
   - Check: an incognito window gets the login; an invited email gets in; a non-invited email is refused; the preview URL is also
     protected; `/admin` is admin-only.
6. **Full album + deploy:** run the full 2 GB; `wrangler pages project create wedding-album --production-branch main`;
   `wrangler pages deploy dist --project-name wedding-album`.
   - Check: the file count (< 20,000) and that every file is < 25 MiB; open on a phone over mobile data.
7. **Hand-off:** `README.md` covering how to add photos, rebuild, deploy, add a guest email and hide a message.

## 6. Prompt to give Claude Code (copy everything below the line)

---

You are working in `C:\Users\ShubhamDigole\code\albumviewer`, a personal wedding album project, separate from any other
project on this machine. Read `PLAN.md` fully first, then `index.html`, `assets/js/viewer.js`, `assets/css/viewer.css`,
`albums/demo/album.json` and `tools/make-demo-album.mjs`, and build what PLAN.md describes, phase by phase (section 5).
Stop after each phase, show me what changed and how you checked it, then continue.

Hard rules:
- **Free only.** Cloudflare free plan: Pages, Pages Functions, D1, and Access on the Zero Trust Free plan. If anything asks
  for a payment method or a paid plan, stop and ask me. No other paid services.
- **Secrets:** the Cloudflare token is in `.env` as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  - Never print, `cat`, `echo` or log it, and never commit `.env`.
  - Let wrangler read it from the environment, loaded without echoing values.
  - Use only this personal Cloudflare account. If `wrangler whoami` shows a different account, stop.
- **Privacy:**
  - These are private family photos. Never upload them anywhere except this Cloudflare Pages project.
  - Never commit `originals/` or `dist/` to git.
  - Strip all EXIF/GPS from every published image.
  - Mark the site `noindex`, with `robots.txt` disallowing everything.
  - Protect production *and* preview URLs.
- **Keep the existing viewer** (StPageFlip flipbook) and its album.json format; extend, don't rewrite. Keep vanilla JS, no
  framework and no build step for the frontend.
- **Limits:** keep each deploy < 19,000 files and every file < 25 MiB; the build script must check both before deploying.
- **Security:**
  - Parameterised D1 queries only.
  - Validate and length-limit all input.
  - Escape guestbook output.
  - Rate-limit POSTs.
  - Signed cookie for any session (HMAC-SHA256, secret in a Pages secret).
- **Quality:**
  - Pin exact package versions.
  - Test the viewer and gallery at 360 px phone width and on desktop, light and dark.
  - Look at the rendered contact sheets of the processed photos before saying the pipeline works.
  - Report failures honestly, with the error text.
- Photos are in: `<FILL IN: e.g. D:\Wedding\Final>`. Sections: `<FILL IN: Haldi, Mehendi, Sangeet, Wedding, Reception>`.
  Names, date and place for the cover: `<FILL IN>`. Who can open it: `<Option A guest emails / Option B password>`.
  Admin emails: `<FILL IN>`. Music: `<FILL IN path to an mp3 we own, or none>`. Download-all link: `<FILL IN Drive link
  or none>`.
- **Done means:**
  - the album is live at `https://<project>.pages.dev`;
  - strangers are blocked and invited guests get in;
  - guestbook and hearts work;
  - there is a README for adding photos and guests;
  - you've given me the final file count, total size and how much of each free limit it uses.
