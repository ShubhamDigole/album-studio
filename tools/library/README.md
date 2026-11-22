# Design library generators

Scripts that produced the original artwork in `assets/library/` (ornaments, patterns, ready-made designs and their thumbnails). Run them from the project root with Node 24. Third-party textures and fonts are not generated here; their sources and licences are in `assets/library/LICENSES.md`.

| Script | Makes | Usage |
|---|---|---|
| `art.mjs` (+ `art-fixes.mjs`, `geo.mjs`) | ornament SVGs | `node tools/library/art.mjs assets/library/art` |
| `patterns.mjs` | seamless pattern tiles and their colourways | `node tools/library/patterns.mjs assets/library/patterns` |
| `designs.mjs` | ready-made v2 designs (JSON for `library.json` "designs") | `node tools/library/designs.mjs designs.json` |
| `fonts.mjs` | woff2 files and `fonts.css` from a Google Fonts CSS response | `node tools/library/fonts.mjs google.css assets/library/fonts assets/library/fonts.css` |
| `render-designs.mjs` | 640 px thumbnails of the designs | `node tools/library/render-designs.mjs designs.json . <placeholder-photo-dir> assets/library/designs` (needs `playwright-core` and Chrome) |

Every design must pass `cleanFreePage()` in `lib/pages.js` unchanged. Thumbnails use generated placeholder pictures, never client photos.
