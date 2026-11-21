# Album studio

Online flipbook photo albums for weddings and every other occasion, run as one platform for many photo studios.

- **Guests** turn real-feeling pages, zoom, browse the photo gallery, leave blessings and heart their favourite photos.
- **Studios** sign up, get approved, and make albums: choose one of 31 cover designs, upload photos, designed pages or a PDF, or their own cover and end page.
- **The master account** approves studios and sees everything.

It runs on Cloudflare's free plan (Pages, Functions, D1, R2). The front end has no framework and no build step.
See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the tech stack, data model, flows and API, and `PLAN.md` for the original plan.

## Run it locally

```bash
npm install
npx wrangler d1 execute album_db --local --file=schema.sql   # a fresh local database
npm run dev                                                   # http://127.0.0.1:8788
```

Create `.dev.vars` (git-ignored):
```
ALBUM_SECRET=<64 random hex characters>
MASTER_EMAIL=you@example.com
ADMIN_PASSWORD=<master password>
# ALBUM_PASSWORD=<optional guest password for every album>
```

Then:
- **Sign in as master:** go to `http://127.0.0.1:8788/admin` and use `MASTER_EMAIL` with `ADMIN_PASSWORD`. The account is created on the first sign-in.
- **Try a studio:** choose **Create a studio account**, then approve it as master under **Studios**.
- **Open an album:** `/a/<album-link>` opens the flipbook and `/g/<album-link>` the photo gallery. Opening `index.html` straight from disk shows the demo album.

An older local database needs the files in `migrations/` run in order.

## Making an album (studio)

1. **New album:** pick the occasion, type the names and choose a cover design.
2. **Details:** the date, place, link and colour. On the same page you choose the **cover, end page and endpaper**. Each opens a picker with a design list filtered by occasion, an "upload your own" option, and photo spots for photo designs.
3. **Photos and pages:**
   - **Photos:** grouped by ceremony and laid out automatically.
   - **Designed pages:** images or **one PDF**, converted in the browser. They replace the automatic layout, and the first page can become the cover.
4. **Publish** and share the guest link.

For very large albums you can also build on your computer: `node tools/build-album.mjs <album-link>` reads `originals/<album-link>/` (ceremony folders, plus optional `cover.jpg`, `back.jpg` and `spreads/`). Then run `npm run build:site`.

## Ways to add photos

| From | Where in admin | Notes |
|---|---|---|
| **Computer** | Photos and pages, Photos card | Drop files or choose them; grouped by ceremony |
| **PDF** | Photos and pages, Designed pages card | Turned into page images in the browser; the first page can become the cover |
| **Google Drive** | Photos and pages, From Google Drive | Paste a folder or file link shared as "Anyone with the link"; import as photos or as designed pages/PDF |
| **Cover and end page** | Details, Cover, end page and endpaper | A design, an image uploaded from the computer, or one of the album's photos |

### Google Drive setup (once)

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Under **Credentials**, create an **API key**, then restrict it:
   - API restrictions: **Google Drive API** only.
   - Website restrictions: your site (for example `https://<project>.pages.dev/*`), and `http://127.0.0.1:8788/*` for local testing.
3. Add it as `GOOGLE_API_KEY`:
   - locally: in `.dev.vars`;
   - online: `node tools/cf.mjs pages secret put GOOGLE_API_KEY --project-name wedding-album`.

The key only reads files that are already shared publicly by link. Downloads go straight from Google to the studio's browser, which resizes them before upload.

## Deploy

`.env` holds `CF_API_TOKEN` and `CF_ACCOUNT_ID`. Run wrangler through `node tools/cf.mjs …` so the keys are loaded without being printed.
The token permissions and the deploy commands are in [ARCHITECTURE.md](ARCHITECTURE.md#deploying-to-cloudflare).

## Licences

- StPageFlip (MIT) and pdf.js (Apache-2.0): see `assets/js/vendor/`.
- Rozha One and Mukta (SIL OFL): see `assets/fonts/OFL.txt`.
