# Album studio

Online flipbook photo albums for weddings and every other occasion, run as one platform for many photo studios.

- **Guests** turn real-feeling pages, zoom, browse the photo gallery, leave blessings and heart their favourite photos.
- **Studios** sign up, get approved, and make albums: choose one of 31 cover designs, upload photos, designed pages or a PDF, or their own custom front cover, back cover and endpaper.
- **The master account** approves studios and sees everything.

It runs on Cloudflare's free plan (Pages, Functions, D1, R2). The front end has no framework and no build step.
See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the tech stack, data model, flows and API, and `PLAN.md` for the original plan.

## Run it locally (no Cloudflare needed)

```bash
npm install
npm run local          # http://localhost:8080/admin
```

Everything is kept in the local `data/` folder, which is git-ignored:
- `data/album.sqlite`: albums, studios, blessings and so on;
- `data/media/`: uploaded photos, PDF pages and covers.

The same backend code later runs on Cloudflare, with D1 and R2 in place of this folder.
To use Cloudflare's local emulation instead, run `npm run dev` (wrangler, http://127.0.0.1:8788).

Create `.dev.vars` (git-ignored):
```
ALBUM_SECRET=<64 random hex characters>
MASTER_EMAIL=you@example.com
ADMIN_PASSWORD=<master password>
# ALBUM_PASSWORD=<optional guest password for every album>
```

Then:
- **Sign in as master:** go to `http://127.0.0.1:8788/admin` and use `MASTER_EMAIL` with `ADMIN_PASSWORD`. The account is created on the first sign-in.
- **Try a studio:** open `/admin#signup` (or **New here? Create a studio account**), then approve it as master under **Studios**. On its first sign-in the studio goes through a three-step setup (details, logo and colour, album defaults) that it can skip; everything can be changed later under **Your studio**.
- **Open an album:** `/a/<album-link>` opens the flipbook and `/g/<album-link>` the photo gallery. Opening `index.html` straight from disk shows the demo album.

An older local database needs the files in `migrations/` run in order.

## Making an album (studio)

1. **New album** opens the details page straight away: occasion, names, date, place, link and colour.
2. On the same page, the **front cover, back cover and endpaper** each have two buttons: **Designs** opens a picker with designs filtered by occasion (and photo spots for photo designs), and **Upload** takes the studio's own custom design from the computer. Uploads chosen before the album exists are kept in the browser and saved when you press Create album.
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
| **Google Drive** | Photos and pages, From Google Drive (shown once `GOOGLE_API_KEY` is set) | Paste a folder or file link shared as "Anyone with the link"; import as photos or as designed pages/PDF |
| **Front and back cover** | Photos and pages, Front and back cover | Your own designed covers, uploaded from the computer |
| **Front cover, back cover, endpaper** | Details, Front cover, back cover and endpaper | A design, an image uploaded from the computer, or one of the album's photos |
| **Cover as one wide image** | Details, "Upload back + front cover as one image" (or a wide first page of a PDF) | Left half becomes the back cover, right half the front cover |
| **Two pages in one image** | Photos and pages, each tile's "one page / two pages" button | Wide images are found automatically; the button fixes any that were guessed wrong |
| **Page order** | Photos and pages: drag a page or photo, or use the arrows on it | Page numbers update at once (a two-page image counts as two); the order is saved automatically |
| **Extra pages** | Details, Extra pages | Tick or untick the endpapers, welcome page, section pages and thank-you page. Photo albums start with all four; designed albums with endpapers only |
| **Full quality** | Photos and pages, "Keep full quality" (on by default) | A full-resolution copy (up to 8000 px) is kept for zooming in and downloads; guests flip through fast 2400 px copies. Location data is always removed |
| **Background music** | Details, Extras | 8 built-in songs (Kevin MacLeod, CC BY 4.0, credited in the viewer) or your own mp3 link, with example links |
| **Album pages (page editor)** | Album pages tab | Create pages from your photos in one click (fewer / balanced / more per page), then drag photos onto spots, swap, crop, change designs, backgrounds and words, reorder, shuffle, save. Saved pages replace the automatic layout |
| **Page designs (master)** | Page designs (master menu) | Draw photo spots and text boxes on a page (frames, shapes, colours, two-page designs); every studio can use active designs |
| **Crop in cover photo spots** | Details, cover popup, Adjust | Drag and zoom the photo inside the spot's own shape |
| **Share** | Album viewer Share, admin "QR code" | Link, WhatsApp, email, and a QR code (PNG download for printing) |

### Google Drive setup (once)

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. Under **Credentials**, create an **API key**, then restrict it:
   - API restrictions: **Google Drive API** only.
   - Website restrictions: your site (for example `https://<project>.pages.dev/*`), and `http://127.0.0.1:8788/*` for local testing.
3. Add it as `GOOGLE_API_KEY`:
   - locally: in `.dev.vars`;
   - online: `node tools/cf.mjs pages secret put GOOGLE_API_KEY --project-name wedding-album`.

The key only reads files that are already shared publicly by link. Downloads go straight from Google to the studio's browser, which resizes them before upload.

## Designing pages and covers

- **Album pages tab:** create pages from your photos, then "Edit freely" (or add a "Designed spread") to open the full editor: layers, photos in 15 shapes with crop, fade, frames and looks; 13 fonts incl. Devanagari; shapes, ornaments, backgrounds (textures, patterns, gradients, blurred photo, your own upload); smart guides, align, photo grid, layers panel, undo/redo, shortcuts (press ?).
- **Covers:** Details → Front cover / Back cover / Endpaper → "Design it yourself" opens the same editor.
- **Ready-made designs:** 56 designs in `assets/library/library.json` (18 covers, 38 pages incl. 20 two-page spreads; filter "Studio style" for designs in this studio's 12x36 style).
- **Your own finished albums:** Photos and pages → Designed album pages → tick "Use the first page as the cover" and select every file of the folder (a wide first file is split into back and front cover; 3:1 spreads show across two pages).
- **Master:** Page designs → "New free-form design" makes designs every studio can use.

## Deploy

`.env` holds `CF_API_TOKEN` and `CF_ACCOUNT_ID`. Run wrangler through `node tools/cf.mjs …` so the keys are loaded without being printed.
The token permissions and the deploy commands are in [ARCHITECTURE.md](ARCHITECTURE.md#deploying-to-cloudflare).

## Licences

- StPageFlip (MIT) and pdf.js (Apache-2.0): see `assets/js/vendor/`.
- Rozha One and Mukta (SIL OFL): see `assets/fonts/OFL.txt`.
- Design library (`assets/library/`): CC0 textures (ambientCG, Poly Haven, Wikimedia Commons), OFL fonts, and original ornaments, patterns and designs; every file is listed in `assets/library/LICENSES.md`. Generators: `tools/library/`.
- Background music: Kevin MacLeod, CC BY 4.0 (`assets/music/LICENSES.md`); qrcode-generator 1.4.4 (MIT).
