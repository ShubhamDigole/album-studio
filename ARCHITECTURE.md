# Architecture: tech stack and flow

A multi-studio platform for online photo albums: weddings, engagements, haldi, birthdays, anniversaries and more.
Photographers (studios) sign up, a master account approves them, and each studio makes flipbook albums for its clients.
Guests open an album link, turn real-feeling pages, browse the photo gallery, leave blessings and heart photos.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Hosting | **Cloudflare Pages** | Static files from `dist/`, global CDN, free plan |
| Backend | **Cloudflare Pages Functions** (Workers runtime) | `functions/` folder, file-based routes, no server to manage |
| Database | **Cloudflare D1** (SQLite) | Studios, users, albums, uploads index, guestbook, hearts, views, rate limits |
| File storage | **Cloudflare R2** | Uploaded photos, designed pages, PDF pages, custom covers (free up to 10 GB) |
| Frontend | Vanilla HTML, CSS and JavaScript | No framework and no build step. Three pages: album (`index.html`), gallery (`gallery.html`), admin (`admin.html`) |
| Page flip | [StPageFlip](https://github.com/Nodlik/StPageFlip) 2.0.7 (MIT) | Vendored in `assets/js/vendor/` |
| PDF import | [pdf.js](https://github.com/mozilla/pdf.js) 6.5.438 (Apache-2.0) | Runs in the browser: PDF pages become images before upload |
| Cover designs | Own SVG engine (`assets/js/cover-templates*.js`) | 31 designs drawn live from the album's details |
| Fonts | Rozha One + Mukta (SIL OFL) | Self-hosted, Latin + Devanagari |
| Local image pipeline | Node 24 + [sharp](https://sharp.pixelplumbing.com/) 0.35.5 | Optional: builds albums from a folder of originals on your computer |
| Tooling | wrangler 4.166.0 | Local dev (`wrangler pages dev`), D1/R2 emulation, deploy |

## Repository layout

```
index.html  gallery.html  admin.html      the three pages
assets/css/        base.css (design tokens, dark + light), viewer.css, gallery.css, admin.css, fonts.css
assets/js/         album-meta.js      occasion types, titles, theme colours, album loading (API or file://)
                   cover-templates.js       the design engine + 6 core designs (cover, end page, endpapers, inner pages)
                   cover-templates-more.js  25 more designs per occasion, incl. 8 photo designs
                   viewer.js          flipbook: page flip, zoom, thumbnails, contents, slideshow, sound, share, blessings
                   gallery.js         photo grid, lightbox, hearts, downloads
                   guestbook.js       blessings widget (shared)
                   admin.js           studio admin + master console
assets/js/vendor/  page-flip, pdfjs
functions/         Pages Functions (the API), see "API" below
lib/               shared server code: http helpers, auth (sessions, passwords), albums, access rules, page layout
migrations/        database changes for existing databases (run in order)
schema.sql         full schema for a fresh database
tools/             build-album.mjs (sharp pipeline), build-site.mjs, cf.mjs (wrangler with .env), make-demo-album.mjs, serve.mjs
albums/demo/       demo album that works from file:// with no server
```

## Data model (D1)

```
studios   id, name, phone, url, email, city, status (pending|active|suspended), plan, created_at, approved_at
users     id, email, name, pass_hash (PBKDF2), role (master|owner), studio_id
albums    id (link), studio_id, type (occasion), title, names[], event_date, location, studio credit fields,
          music, download_url, accent, template, design {cover|back|endpaper: {template, upload, photos[]}},
          status (draft|published), require_approval
media     id, album_id, kind (photo|page), key (R2), thumb_key, width, height, section, spread, position, name, bytes
guestbook id, album_id, name, message, approved, created_at
favorites album_id, photo, visitor            views  album_id, day, count            rate  key, n, reset_at
```

## Roles

- **Master** (you): signs in with `MASTER_EMAIL` and `ADMIN_PASSWORD`. The account is created on the first sign-in. The master approves or switches off studios, sees every album on every shelf, and can move an album to another studio.
- **Studio owner**: signs up at `/admin` and waits for approval. After that they only see and manage their own studio's albums, uploads and blessings.
- **Guests**: open published albums by link. If the optional `ALBUM_PASSWORD` gate is on, they enter it once.

## Flows

### 1. A studio joins
`/admin` → **Create a studio account** → `POST /api/admin/signup` (limited to 3 per hour per IP) → the studio is `pending`
→ the master sees it under **Studios** → `PATCH /api/admin/master/studios/:id {status: active}` → the owner can sign in.

### 2. Making an album
1. **New album** goes straight to the details page (there is no separate cover step).
2. **Details:** names, date, location, link, photographer credit, colour, music and download link, draft or published (`POST /api/admin/albums`).
3. **Front cover, back cover and endpaper** (stored as the parts `cover`, `back`, `endpaper`): on the details page each part has **Designs** and **Upload**. Every design previews the real names; empty details show sample text. For a new album, uploads are kept in the browser as blob URLs (`draft.pending`) and sent with `POST …/upload kind=design` right after the album is created. Designs opens a picker with tabs. Choose a design per part (filtered by occasion), upload your own image from the computer, use one of the album's photos (`PUT …/design {useMedia}`), or put photos into a design's photo spots (`PUT /api/admin/albums/:id/design`, `POST …/upload kind=design`).
4. **Extra pages:** ticks on the details page for endpapers, a welcome page, section pages and a thank-you page, stored as `design.pages` (only ticks that differ from the default; sent as `pages` with the album). `lib/layout.js` `pageOptions()` fills in the defaults (photo albums: all on; designed albums: endpapers only) and the page builders keep the book even, spreads on a left page and the back cover alone at the end.
5. **Photos and pages**, any of:
   - **Photos:** dropped in the browser, resized to 2400 px with a 480 px thumbnail. Re-encoding removes EXIF and GPS. Upload goes to R2 (`kind=photo`, with a ceremony section). The album lays them out automatically: a title page, a divider per ceremony, landscape photos full-page, portraits in pairs, then a thank-you page.
   - **Designed pages:** images in file-name order, or **a PDF** that pdf.js turns into images in the browser (`kind=page`). Wide pages (wider than 1.9 : 1) become two-page spreads; each page or photo tile has a one page / two pages button (`PATCH /api/admin/albums/:id/media/:mid {spread}`). Wide photos also run across two pages in the automatic layout. Pages and photos are reordered by dragging (pointer events, so mouse and touch; on touch only the grip drags) or with each tile's arrows; the whole order is sent as `PUT /api/admin/albums/:id/order {kind, ids}`, which refuses a list that does not hold every item exactly once and sets every position in one statement (`json_each`). You can use the first page as the front cover and the last as the back cover; a wide first page is a whole cover and is split in the browser: left half = back cover, right half = front cover. The details page has the same "back + front cover as one image" upload.
   - **Google Drive:** paste a folder or file link shared as "Anyone with the link". The browser lists and downloads the files through the Drive API (v3, using the `GOOGLE_API_KEY` browser key from `GET /api/admin/config`), then resizes and uploads them exactly like files from the computer.
   - **Local build (optional, larger albums):** `node tools/build-album.mjs <id>` reads `originals/<id>/` and writes `dist/albums/<id>/`. The photographer's own `cover.jpg`, `back.jpg`, `inside-*.jpg` and `spreads/` are used when present.
6. **Quality:** with "Keep full quality" the browser also makes a full-resolution copy (JPEG 95, up to 8000 px, EXIF removed by the canvas) sent as `full` and stored as `media.full_key` (`-f` files); layout.js puts it in `zoom` (viewer) and `download` (gallery). Migration 0004 adds the column; `npm run local` adds missing columns to an existing database by comparing it with schema.sql.
7. **Music:** `assets/music/tracks.json` lists the built-in songs (CC BY 4.0, see `assets/music/LICENSES.md`); the album stores the chosen file path or the studio's own link in `music`. The viewer shows the required credit in "How to view".
8. **Publish:** guests open `/a/<id>` (the flipbook) or `/g/<id>` (the gallery).

### 3. A guest opens an album
The book looks thick: `updateThickness()` in viewer.js draws the pages already read as a stack of edges on the left and the rest on the right (layered box-shadows that move as pages turn), with the hard cover board showing around the open pages. Phones held sideways get a one-row toolbar so the book gets the height.

```
/a/<id> → /?id=<id> → index.html → GET /api/album/<id>
   ├─ access check: published, studio active (drafts only for their studio or the master), optional guest gate
   ├─ pages: uploaded designed pages, otherwise uploaded photos (auto layout), otherwise the local build
   ├─ cover / end page / endpapers: { generated } entries drawn live by cover-templates.js
   │    (or the studio's uploaded image, or the photographer's own built cover)
   └─ details from D1; empty photographer credit filled from the studio profile
→ viewer.js builds the flipbook (StPageFlip), loads images lazily from /media/... (R2) or /albums/... (static)
→ POST /api/view/<id> (one view per visitor per day); blessings and hearts via /api/guestbook and /api/favorite
```

### 4. Images
`/media/a/<album>/<kind>/<file>` → a Function checks the same access rules as the album → streams from R2 with private, immutable caching.
Static build output under `/albums/<id>/` is served by Pages with long cache headers (`_headers`).

## API

| Route | Who | Does |
|---|---|---|
| `GET /api/album/:id` | guests | album JSON for the viewer and gallery |
| `GET/POST /api/guestbook/:id` | guests | blessings (POST limited to 5 per 10 min) |
| `POST/DELETE /api/favorite/:id/:photo`, `GET /api/favorites/:id` | guests | hearts |
| `POST /api/view/:id` | guests | view count |
| `POST /api/unlock` | guests | guest password (when `ALBUM_PASSWORD` is set) |
| `GET /media/…` | guests | uploaded images from R2 |
| `POST /api/admin/signup`, `POST /api/admin/login`, `GET/DELETE /api/admin/session` | anyone | accounts |
| `GET/POST /api/admin/albums`, `GET/PUT/DELETE /api/admin/albums/:id` | owner, master | albums (scoped to the studio) |
| `POST /api/admin/albums/:id/upload`, `PUT …/design`, `DELETE …/media/:mid` | owner, master | uploads and cover choices |
| `GET /api/admin/guestbook/:id`, `PATCH/DELETE /api/admin/guestbook/:msg` | owner, master | moderation |
| `GET/PUT /api/admin/studio`, `PUT /api/admin/account` | owner | studio profile, password |
| `GET /api/admin/config` | owner, master | browser settings (the Google Drive API key) |
| `GET /api/admin/master/studios`, `PATCH /api/admin/master/studios/:id` | master | approve or switch off studios |

## Security

- **Passwords:** PBKDF2-SHA256 with 100,000 iterations and a random salt. Sessions use an HMAC-SHA256 signed cookie (`HttpOnly`, `SameSite=Strict`, `Secure` on https).
- **Isolation:** every admin query is scoped to the user's studio, and every album, upload and message route checks ownership.
- **Requests:** cross-site POSTs are blocked by an Origin check, sign-in, sign-up, blessings, hearts and the guest password are rate-limited, and all D1 queries are parameterised.
- **Content:** input is validated and length-limited, guest text is rendered with `textContent`, and uploads are limited to JPEG, PNG or WebP of 15 MB or less, under keys the server generates.
- **Privacy:** `noindex` headers, `robots.txt` disallows everything, and photos lose their EXIF/GPS data, in the browser or in the sharp pipeline.

## Local development

There are two ways to run it on your computer. Both read `.dev.vars` (git-ignored): `ALBUM_SECRET`, `ADMIN_PASSWORD`, `MASTER_EMAIL`, and optionally `ALBUM_PASSWORD` and `GOOGLE_API_KEY`.

| | `npm run local` (default for now) | `npm run dev` |
|---|---|---|
| Server | `server/local.mjs`, plain Node 24 | wrangler pages dev (workerd) |
| Database | `data/album.sqlite` (Node's built-in SQLite, behind a D1-style wrapper) | D1 emulated in `.wrangler/` |
| Files | `data/media/` (behind an R2-style wrapper) | R2 emulated in `.wrangler/` |
| URL | http://localhost:8080 | http://127.0.0.1:8788 |
| Needs | Node only | wrangler and workerd |

`server/local.mjs` loads the same `functions/` files with Cloudflare Pages routing rules: `[param]` and `[[catchall]]` segments, `_middleware.js` chains, `onRequestGet` and so on. It serves `dist/` with pretty URLs and applies `schema.sql` on start, so the code that runs locally is the code that will run on Cloudflare.

## Deploying to Cloudflare

`.env` holds `CF_API_TOKEN` and `CF_ACCOUNT_ID`. `node tools/cf.mjs <wrangler args>` runs wrangler with them, without printing them.
The token needs these **account** permissions, with Account Resources set to your account:
- Cloudflare Pages: Edit
- D1: Edit
- Workers R2 Storage: Edit
- Account Settings: Read

R2 must be enabled once in the dashboard.

```
node tools/cf.mjs d1 create album_db                        # paste database_id into wrangler.toml
node tools/cf.mjs d1 execute album_db --remote --file=schema.sql
node tools/cf.mjs r2 bucket create album-media
node tools/cf.mjs pages project create wedding-album --production-branch main
node tools/cf.mjs pages secret put ALBUM_SECRET --project-name wedding-album      # also ADMIN_PASSWORD, MASTER_EMAIL
npm run build:site && node tools/cf.mjs pages deploy dist --project-name wedding-album
```

## Limits (free plan)

| Item | Limit |
|---|---|
| Pages | 20,000 files per deploy and 25 MiB per file (`build-site` checks both) |
| Functions | 100,000 requests a day |
| D1 | 5 GB, 5 million reads a day |
| R2 | 10 GB stored, 1 million writes and 10 million reads a month, no download fees |

## Next steps

- Payments per studio (the `studios.plan` column is ready), with storage quotas per plan.
- Custom domains per studio, and guest invitations by email (Cloudflare Access).
- Reordering pages and photos by drag and drop, and choosing the cover photo from the gallery.
