/* The advanced page editor: one free-form page (v: 2, format in page-templates.js) or a two-page spread,
   designed like in Canva or SmartAlbums: photos, words, shapes and ornaments placed freely on a background.

   window.FreeEditor.open(opts)
     opts = admin.js editorContext() + {
       mode: 'page' | 'cover' | 'template', album (media.photos / media.pages), ratio (one page, width / height),
       page (v2 or null), title, onSave(page, meta) -> Promise, onClose(),
       used?: media ids used on other pages (for the "used" markers), section?: the album part this page is in,
       meta?: { name, kind, occasions, hidden } (template mode: shown and returned to onSave), samples?: image URLs for photo spots (template mode) }
   window.FreeEditor.fill(designPage, { photos, pool, template }) -> a copy of a design with its photo spots filled
   window.FreeEditor.library() -> Promise of assets/library/library.json, checked and normalised
   window.FreeEditor.designs(ctx, { kind }) -> Promise of [{ key, name, kind, occasions, tags, page, source }] (library + master designs)

   What is saved is checked again on the server (lib/pages.js cleanFreePage); everything here stays inside its limits. */
(function () {
  'use strict';

  const MAX_ELS = 80;
  const MARGIN = 0.045;               // the page designs' outer margin, shown as the safe area
  const SNAP = 6;                     // screen pixels
  const MIN_PX = 8;
  const ZOOM_100 = 1000;              // 100 % = the page drawn 1000 px tall
  const COLOR_RE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  const LIB_SRC = /^\/assets\/library\/[a-z0-9/_-]{1,120}\.(jpg|jpeg|png|webp|svg)$/;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const clone = (o) => structuredClone(o);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PT = () => window.PageTemplates;

  /* ---------- icons ---------- */
  const I = {
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
    zin: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.2-4.2M11 8v6M8 11h6"/>',
    zout: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.2-4.2M8 11h6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    guides: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M7.5 3.5v17M3.5 16.5h17" stroke-dasharray="2.2 2.2"/>',
    ruler: '<path d="M3 16.5L16.5 3 21 7.5 7.5 21z"/><path d="M7.4 12.1l2 2M10.3 9.2l1.4 1.4M13.2 6.3l2 2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 114 2.1c-.9.6-1.6 1.1-1.6 2.3M12 17.2h.01"/>',
    designs: '<rect x="3" y="3" width="8" height="10" rx="1.2"/><rect x="13" y="3" width="8" height="6" rx="1.2"/><rect x="13" y="11" width="8" height="10" rx="1.2"/><rect x="3" y="15" width="8" height="6" rx="1.2"/>',
    photos: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
    shapes: '<circle cx="8" cy="8" r="4.5"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M3.5 21l4.5-7.5 4.5 7.5z"/>',
    art: '<path d="M12 3c1.4 2.9 4.3 4.4 7.4 4.4-1 2.9-1 5.8 0 8.7-3.1 0-6 1.5-7.4 4.4-1.4-2.9-4.3-4.4-7.4-4.4 1-2.9 1-5.8 0-8.7 3.1 0 6-1.5 7.4-4.4z"/><circle cx="12" cy="11.8" r="2.4"/>',
    bg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15.5l5-5 4 4 3-3 6 6"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 017.6-1.7"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    fwd: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 5V4.5A1.5 1.5 0 0013.5 3h-9A1.5 1.5 0 003 4.5v9A1.5 1.5 0 004.5 15H5" stroke-dasharray="2 2"/>',
    bwd: '<rect x="4" y="4" width="11" height="11" rx="1.5" stroke-dasharray="2 2"/><path d="M9 19.5A1.5 1.5 0 0010.5 21h9a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0019.5 9H19"/>',
    front: '<path d="M12 3v12M7 8l5-5 5 5M4 20h16"/>',
    back: '<path d="M12 21V9M7 16l5 5 5-5M4 4h16"/>',
    flipx: '<path d="M12 3v18"/><path d="M9 7L4 17h5zM15 7l5 10h-5z"/>',
    flipy: '<path d="M3 12h18"/><path d="M7 9l10-5v5zM7 15l10 5v-5z"/>',
    crop: '<path d="M6 2v14a2 2 0 002 2h14"/><path d="M18 22V8a2 2 0 00-2-2H2"/>',
    replace: '<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.2-4.2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    spread: '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/>',
    fitbox: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><path d="M8 10h8M8 14h5"/>',
    frame: '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7" y="7" width="10" height="8"/>',
    al: '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>',
    ac: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
    ar: '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>',
    at: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>',
    am: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
    ab: '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>',
    dh: '<path d="M4 3v18M20 3v18"/><rect x="9" y="7" width="6" height="10" rx="1"/>',
    dv: '<path d="M3 4h18M3 20h18"/><rect x="7" y="9" width="10" height="6" rx="1"/>',
    tl: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    tc: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    tr: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    vt: '<path d="M4 4h16"/><path d="M12 8v12M8 12l4-4 4 4"/>',
    vm: '<path d="M4 12h16"/><path d="M12 3v5M12 16v5M9.5 5.5L12 8l2.5-2.5M9.5 18.5L12 16l2.5 2.5"/>',
    vb: '<path d="M4 20h16"/><path d="M12 4v12M8 12l4 4 4-4"/>',
    italic: '<path d="M10 4h8M6 20h8M14 4l-4 16"/>',
    upper: '<path d="M3 19l5-14 5 14M5 14h6M14.5 19V5h3.8a3.2 3.2 0 010 6.4h-3.8 4.4a3.3 3.3 0 010 6.6h-4.4"/>',
    grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    back2: '<path d="M15 18l-6-6 6-6"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  };
  /* photo { fade: { side: 'left'|'right'|'top'|'bottom'|'x'|'y'|'all', size: 0.05..0.9 } }: the photo melts into what is behind it.
     size is the share of the box that fades. As a CSS mask on the layer box (the shape's own mask sits on .pe-clip inside). */
  function fadeCss(fd) {
    if (!fd || !fd.side) return '';
    const z = Math.round(clamp(+fd.size || 0.3, 0.05, 0.9) * 1000) / 10;
    const lin = (dir) => `linear-gradient(${dir}, transparent 0, #000 ${z}%)`;
    const both = (dir) => `linear-gradient(${dir}, transparent 0, #000 ${z / 2}%, #000 ${100 - z / 2}%, transparent 100%)`;
    const m = { left: lin('to right'), right: lin('to left'), top: lin('to bottom'), bottom: lin('to top'), x: both('to right'), y: both('to bottom') }[fd.side];
    if (m) return `-webkit-mask-image:${m};mask-image:${m};`;
    if (fd.side === 'all') { const a = both('to right'), b = both('to bottom'); return `-webkit-mask-image:${a},${b};-webkit-mask-composite:source-in;mask-image:${a},${b};mask-composite:intersect;`; }
    return '';
  }
  const FADES = [['', 'None'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'], ['x', 'Both sides'], ['y', 'Top and bottom'], ['all', 'All round']];
  const ic = (n, cls = '') => `<svg class="fe-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

  /* ---------- fixed choices ---------- */
  const ROLES = [['free', 'Fixed words'], ['names', 'Couple’s names'], ['date', 'Date'], ['place', 'Place'], ['title', 'Album title'], ['section', 'Section name'], ['caption', 'Caption']];
  const AUTO_ROLES = ['names', 'date', 'place', 'title', 'section'];
  const SHAPE_NAMES = { rect: 'Rectangle', rounded: 'Rounded', circle: 'Circle', arch: 'Arch', hexagon: 'Hexagon', diamond: 'Diamond', triangle: 'Triangle',
    octagon: 'Octagon', star: 'Star', slant: 'Slant', heart: 'Heart', blob: 'Pebble', scallop: 'Scallop', flower: 'Flower', line: 'Line' };
  const FONT_CAT = { display: 'Display', ui: 'Sans', playfair: 'Serif', cormorant: 'Serif', cinzel: 'Serif', marcellus: 'Serif', greatvibes: 'Script',
    parisienne: 'Script', dancing: 'Script', montserrat: 'Sans', poppins: 'Sans', yatra: 'Display', tiro: 'Serif' };
  const FONT_DEVA = { display: true, ui: true, yatra: true, tiro: true };
  const CAT_ORDER = ['Script', 'Serif', 'Display', 'Sans'];
  const SWATCHES = ['#FFFFFF', '#FBF7F0', '#F3E6D3', '#E9C46A', '#C9A227', '#A97C2F', '#EFA00B', '#E07A2E', '#E86A92', '#C8255F',
    '#8E1B3A', '#5A1426', '#3A1020', '#0F3D3E', '#1F5F4A', '#14213D', '#4A3F5C', '#2A2530', '#17151C', '#000000'];
  const BG_SWATCHES = ['#FFFFFF', '#FBF7F0', '#F7F3EE', '#F3E6D3', '#EAD9C6', '#F6EAE6', '#F4E1E6', '#E3EBE0', '#E9C46A', '#C9A227',
    '#8E1B3A', '#5A1426', '#3A1020', '#0F3D3E', '#1F3A5F', '#14213D', '#2E1F5E', '#23452B', '#2A2530', '#17151C'];
  const GRADS = [['#3A1020', '#120608', 160, 0], ['#0F3D3E', '#06191A', 180, 0], ['#FBF7F0', '#EAD9C6', 180, 1], ['#F7E7C6', '#E9C46A', 150, 0],
    ['#5A1426', '#C8255F', 135, 0], ['#14213D', '#3B4A7A', 180, 1], ['#FFF3E0', '#F6C28B', 200, 1], ['#23452B', '#0D1F12', 170, 0],
    ['#F6EAE6', '#E8B4BC', 160, 0], ['#2E1F5E', '#0F0A24', 180, 1], ['accent', 'silk', 150, 0], ['silk', '#000000', 180, 1]];
  const FILTERS = [
    ['original', 'Original', null],
    ['warm', 'Warm', { brightness: 1.04, saturate: 1.18, sepia: 0.22 }],
    ['bw', 'B&W', { grayscale: 1, contrast: 1.1 }],
    ['vintage', 'Vintage', { sepia: 0.45, contrast: 0.9, brightness: 1.06, saturate: 0.82 }],
    ['vivid', 'Vivid', { saturate: 1.45, contrast: 1.08 }],
    ['soft', 'Soft', { contrast: 0.86, brightness: 1.07, saturate: 0.92 }],
    ['noir', 'Noir', { grayscale: 1, contrast: 1.4, brightness: 0.9 }],
    ['fade', 'Faded', { contrast: 0.78, brightness: 1.12, saturate: 0.7 }],
    ['golden', 'Golden hour', { sepia: 0.3, saturate: 1.35, brightness: 1.05, contrast: 1.05 }],
    ['dream', 'Dreamy', { brightness: 1.1, saturate: 1.12, contrast: 0.9, blur: 0.08 }],
  ];
  const ADJUST = [['brightness', 'Brightness', 0.2, 2, 1], ['contrast', 'Contrast', 0.2, 2, 1], ['saturate', 'Saturation', 0, 3, 1],
    ['grayscale', 'Black and white', 0, 1, 0], ['sepia', 'Sepia', 0, 1, 0], ['blur', 'Blur', 0, 3, 0]];
  // text presets: sizes in % of page height, widths in fractions of one page
  const TEXT_PRESETS = [
    ['names', 'Names', 'The couple’s names from the album', { role: 'names', font: 'greatvibes', size: 11, w: 0.72, h: 0.17 }],
    ['heading', 'Heading', 'Big and spaced, for a page title', { role: 'free', text: 'Our wedding', font: 'cinzel', size: 5.6, upper: true, spacing: 0.14, w: 0.72, h: 0.1 }],
    ['script', 'Script', 'Flowing words', { role: 'free', text: 'Forever and always', font: 'parisienne', size: 7, w: 0.6, h: 0.12 }],
    ['caption', 'Caption', 'A few words beside a photo', { role: 'caption', text: 'A few words about this moment', font: 'cormorant', italic: true, size: 3.4, w: 0.36, h: 0.14, align: 'left', line: 1.3 }],
    ['date', 'Date', 'The day, from the album details', { role: 'date', font: 'montserrat', weight: 500, size: 2.4, upper: true, spacing: 0.32, w: 0.5, h: 0.06 }],
    ['place', 'Place', 'Where it happened', { role: 'place', font: 'cormorant', size: 3.4, w: 0.5, h: 0.07 }],
    ['section', 'Section title', 'Haldi, Sangeet, Wedding…', { role: 'section', font: 'display', size: 7, w: 0.6, h: 0.12 }],
    ['edge', 'Edge title', 'Small script turned along the edge of a page', { role: 'section', font: 'greatvibes', size: 5, w: 0.36, h: 0.09, rot: -90 }],
    ['hindi', 'शुभ विवाह', 'Devanagari heading', { role: 'free', text: 'शुभ विवाह', font: 'yatra', size: 8, w: 0.5, h: 0.13 }],
    ['para', 'Paragraph', 'Longer words, a note or a verse', { role: 'free', text: 'Two families, one celebration. Thank you for being part of our story.', font: 'ui', size: 2.5, w: 0.44, h: 0.16, align: 'left', line: 1.5 }],
  ];
  const DEFAULT_SAMPLES = ['#C98B6B,#6E3B4E', '#E9C46A,#B5651D', '#1B5C58,#0A2B2A', '#B5C46A,#5E7A2E', '#3A1640,#170A1E', '#FFD9C2,#F2A48C']
    .map((p) => { const [a, b] = p.split(','); return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="420" fill="url(#g)"/><circle cx="420" cy="150" r="54" fill="#fff" opacity=".35"/><path d="M0 320 Q150 250 300 300 T600 290 V420 H0Z" fill="#000" opacity=".25"/></svg>`); });

  /* ---------- the design library ---------- */
  let LIB = null;
  function normSrc(s) { s = String(s || ''); if (s && !s.startsWith('/')) s = '/' + s; return LIB_SRC.test(s) ? s : ''; }
  function library() {
    if (LIB) return LIB;
    LIB = fetch(window.FreeEditor.libraryUrl || '/assets/library/library.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((l) => {
        const arr = (k) => (Array.isArray(l && l[k]) ? l[k] : []).filter((x) => x && typeof x === 'object');
        const withSrc = (x) => { const src = normSrc(x.src); return src ? Object.assign({}, x, { src, thumb: normSrc(x.thumb) || src }) : null; };
        return {
          backgrounds: arr('backgrounds').map(withSrc).filter(Boolean),
          patterns: arr('patterns').map(withSrc).filter(Boolean),
          art: arr('art').map(withSrc).filter(Boolean),
          fonts: arr('fonts').filter((f) => f.key),
          designs: arr('designs').filter((d) => d.page && Array.isArray(d.page.els)).map((d) => Object.assign({}, d, { source: 'library', kind: d.kind === 'cover' ? 'cover' : 'page' })),
        };
      });
    LIB.then((lib) => { if (!lib.designs.length && !lib.art.length && !lib.backgrounds.length) setTimeout(() => { LIB = null; }, 30000); });   // the library may still be filling in
    return LIB;
  }
  let MASTER = null, MASTER_AT = 0;
  function masterDesigns(ctx) {
    if (!ctx || !ctx.api) return Promise.resolve([]);
    if (MASTER && Date.now() - MASTER_AT < 60000) return MASTER;
    MASTER_AT = Date.now();
    MASTER = ctx.api('page-templates').then((d) => (d.templates || []).filter((t) => t.v === 2 && !t.hidden && Array.isArray(t.els)).map((t) => ({
      key: t.key, name: t.name, kind: t.kind === 'cover' ? 'cover' : 'page', occasions: t.occasions || [], tags: [], source: 'studio',
      page: { v: 2, s: t.s ? 1 : undefined, bg: t.bg, els: t.els },
    }))).catch(() => []);
    return MASTER;
  }
  function designs(ctx, { kind } = {}) {
    return Promise.all([masterDesigns(ctx), library()]).then(([m, lib]) => [...m, ...lib.designs].filter((d) => !kind || d.kind === kind));
  }

  /* a design with its photo spots filled: the given photos first (in order), then the pool; album details fill the named texts */
  function fill(design, { photos = [], pool = [], template = false } = {}) {
    const p = clone(design.page || design);
    const out = { v: 2, bg: p.bg && typeof p.bg === 'object' ? p.bg : { type: 'color', color: '#F7F3EE' }, els: Array.isArray(p.els) ? p.els.slice(0, MAX_ELS) : [] };
    if (p.s) out.s = 1;
    const queue = [...photos, ...pool.filter((id) => !photos.includes(id))];
    let k = 0;
    out.els.forEach((e) => {
      if (e.type === 'photo') { e.m = template ? null : queue[k++] || null; delete e.c; }
      if (e.type === 'text' && AUTO_ROLES.includes(e.role)) e.text = '';
      if (e.type === 'art') e.src = normSrc(e.src) || e.src;
    });
    if (out.bg.type === 'photo') { out.bg.m = template ? null : queue[k++] || null; delete out.bg.c; }
    if (out.bg.type === 'image') out.bg.src = normSrc(out.bg.src) || out.bg.src;
    return out;
  }

  /* recent colours, kept in this browser */
  const RECENT_KEY = 'albumviewer:fe-colors';
  const recent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((c) => COLOR_RE.test(c)).slice(0, 10) : []; } catch (e) { return []; } };
  const remember = (c) => { if (!COLOR_RE.test(c || '')) return; try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...recent().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 10))); } catch (e) { /* private mode */ } };

  let CLIP = null;          // copied layers, kept between pages
  let OPEN = null;          // the editor that is open

  /* ======================================================================
     open
     ====================================================================== */
  function open(opts) {
    if (OPEN) OPEN.close(false);
    const ctx = opts;
    const mode = ['cover', 'template'].includes(opts.mode) ? opts.mode : 'page';
    const tplMode = mode === 'template';
    const M = ctx.M || window.AlbumMeta;
    const album = opts.album || {};
    const VA = Object.assign({}, album, { theme: album.theme || (M && M.theme ? M.theme(album) : undefined) });
    const TH = VA.theme || { silk: '#0F3D3E', accent: '#C8255F' };
    const media = album.media || {};
    const PHOTOS = tplMode ? [] : (media.photos || []);
    const DESIGNED = tplMode ? [] : (media.pages || []);
    const ALL = [...PHOTOS, ...DESIGNED];
    const byId = new Map(ALL.map((m) => [m.id, m]));
    const samples = (opts.samples && opts.samples.length ? opts.samples : DEFAULT_SAMPLES);
    const usedElsewhere = new Set(opts.used || []);
    const ratio = +opts.ratio > 0.2 && +opts.ratio < 5 ? +opts.ratio : 1.5;

    function startPage(p) {
      if (!p || p.v !== 2) return { v: 2, bg: { type: 'color', color: '#F7F3EE' }, els: [] };
      const out = clone(p);
      out.bg = out.bg && typeof out.bg === 'object' ? out.bg : { type: 'color', color: '#F7F3EE' };
      out.els = (Array.isArray(out.els) ? out.els : []).slice(0, MAX_ELS);
      if (mode === 'cover') delete out.s;
      if (tplMode) { out.els.forEach((e) => { if (e.type === 'photo') e.m = null; }); if (out.bg.type === 'photo') out.bg.m = null; }
      else {   // photos that left the album become empty spots
        out.els.forEach((e) => { if (e.type === 'photo' && e.m && !byId.has(e.m)) e.m = null; });
        if (out.bg.type === 'photo' && out.bg.m && !byId.has(out.bg.m)) out.bg.m = null;
      }
      return out;
    }
    const S = {
      page: startPage(opts.page),
      meta: tplMode ? Object.assign({ name: '', kind: 'page', occasions: [], hidden: false }, clone(opts.meta || {})) : null,
      sel: [], hist: [], hi: 0, savedSnap: '', lastTag: '', lastT: 0,
      z: 600, fit: true, guidesOn: true, rulersOn: true, uguides: { v: [], h: [] },
      panel: null, editing: -1, replacing: -1, swapping: -1, saving: false, justSaved: false, error: '',
      photoFilter: 'all', artCat: 'all', artQuery: '', bgTone: 'all', designOcc: 'mine', designQuery: '', designTag: 'all', designKind: tplMode ? 'all' : mode === 'cover' ? 'cover' : 'page',
      artTint: '#C9A227', uploads: [], lib: null, designs: null, drag: null, space: false, hover: -1,
    };
    const snapshot = () => JSON.stringify(S.page) + '|' + JSON.stringify(S.meta);
    S.hist = [snapshot()]; S.savedSnap = S.hist[0];
    const dirty = () => snapshot() !== S.savedSnap;
    const A = () => ratio * (S.page.s ? 2 : 1);            // canvas width / height
    const pagesN = () => (S.page.s ? 2 : 1);
    const els = () => S.page.els;
    const isPhone = () => matchMedia('(max-width: 760px)').matches;

    /* ---------- photos, colours, words ---------- */
    function lookup(id) {
      if (!id) return null;
      if (String(id).startsWith('__s')) return { src: samples[+String(id).slice(3) % samples.length] };
      const m = byId.get(id);
      return m ? { src: m.url, thumb: m.thumb || m.url, zoom: m.full || m.url } : null;
    }
    const resolve = (c) => (c === 'accent' ? TH.accent : c === 'silk' ? TH.silk : COLOR_RE.test(c || '') ? c : '');
    function lum(c) { const v = resolve(c); if (!v) return 0.9; const n = parseInt(v.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
    function bgDark() {
      const b = S.page.bg || {};
      if (b.type === 'color') return lum(b.color) < 0.5;
      if (b.type === 'gradient') return (lum((b.colors || [])[0]) + lum((b.colors || [])[1] || (b.colors || [])[0])) / 2 < 0.5;
      if (b.type === 'photo') return true;
      if (b.type === 'image') {
        const lib = S.lib && [...S.lib.backgrounds, ...S.lib.patterns].find((x) => x.src === b.src);
        if (lib && lib.tone) return lib.tone === 'dark';
        return (b.dim || 0) > 0.3 || lum(b.color || '#F7F3EE') < 0.5;
      }
      return false;
    }
    const ink = () => (bgDark() ? '#FBF7F0' : '#2A2530');
    function textValue(e) { return (e.text != null && e.text !== '' ? e.text : PT().autoText(e.role, VA) || (e.role === 'section' ? opts.section || '' : '')) || ''; }
    function onPage() { return new Set(PT().photoIds(S.page)); }
    function photoOrder() { return S.page.els.filter((e) => e.type === 'photo' && e.m).map((e) => e.m); }
    function unusedPool() {
      const here = onPage();
      const a = ALL.filter((m) => !here.has(m.id) && !usedElsewhere.has(m.id)).map((m) => m.id);
      const b = ALL.filter((m) => !here.has(m.id) && usedElsewhere.has(m.id)).map((m) => m.id);
      return [...a, ...b];
    }
    // the page drawn in the editor: in template mode the photo spots show sample pictures
    function displayPage() {
      if (!tplMode) return S.page;
      const p = Object.assign({}, S.page, { els: S.page.els.map((e, i) => (e.type === 'photo' ? Object.assign({}, e, { m: '__s' + i }) : e)) });
      if (p.bg && p.bg.type === 'photo') p.bg = Object.assign({}, p.bg, { m: '__s' + 7 });
      return p;
    }

    /* ---------- DOM ---------- */
    // a native modal dialog: the page behind it is inert, focus stays inside, Esc arrives as a close request
    const root = document.createElement('dialog');
    root.className = 'fe';
    root.setAttribute('aria-label', 'Page editor: ' + (opts.title || 'page'));
    const RAIL = [['designs', 'Designs', 'designs'], ['photos', tplMode ? 'Photo spots' : 'Photos', 'photos'], ['text', 'Text', 'text'], ['shapes', 'Shapes', 'shapes'],
      ['art', 'Ornaments', 'art'], ['bg', 'Background', 'bg'], ['layers', 'Layers', 'layers']];
    root.innerHTML = `
      <header class="fe-top">
        <button type="button" class="fe-ib" data-cmd="close" title="Close the editor (Esc)" aria-label="Close the editor">${ic('close')}</button>
        <div class="fe-title"><b>${esc(opts.title || 'Page')}</b><small class="fe-status" role="status" aria-live="polite"></small></div>
        <div class="fe-tools">
          <button type="button" class="fe-ib" data-cmd="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${ic('undo')}</button>
          <button type="button" class="fe-ib" data-cmd="redo" title="Redo (Shift+Ctrl+Z)" aria-label="Redo">${ic('redo')}</button>
          <span class="fe-sep"></span>
          <button type="button" class="fe-ib" data-cmd="zoomout" title="Zoom out (Ctrl+−)" aria-label="Zoom out">${ic('zout')}</button>
          <button type="button" class="fe-zoom" data-cmd="zoommenu" title="Zoom" aria-haspopup="menu"><span>100%</span>${ic('chev')}</button>
          <button type="button" class="fe-ib" data-cmd="zoomin" title="Zoom in (Ctrl+=)" aria-label="Zoom in">${ic('zin')}</button>
          <span class="fe-sep"></span>
          <button type="button" class="fe-ib" data-cmd="guides" title="Safe margin and fold (G)" aria-label="Show the safe margin and fold" aria-pressed="true">${ic('guides')}</button>
          <button type="button" class="fe-ib fe-hide-phone" data-cmd="rulers" title="Rulers (R)" aria-label="Show rulers" aria-pressed="true">${ic('ruler')}</button>
          <button type="button" class="fe-ib fe-hide-phone" data-cmd="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${ic('help')}</button>
        </div>
        <div class="fe-end">
          <p class="fe-error" role="alert" hidden></p>
          <button type="button" class="btn fe-save" data-cmd="save">${ic('check')}<span>Save</span></button>
        </div>
      </header>
      <nav class="fe-rail" aria-label="Add to the page">${RAIL.map(([k, l, icn]) => `<button type="button" class="fe-rail-btn" data-panel="${k}" aria-pressed="false">${ic(icn)}<span>${l}</span></button>`).join('')}
        <button type="button" class="fe-rail-btn fe-only-phone" data-panel="props" aria-pressed="false">${ic('sparkle')}<span>Edit</span></button></nav>
      <aside class="fe-drawer" aria-label="Panel"><div class="fe-drawer-head"><h2></h2><button type="button" class="fe-ib sm" data-cmd="closepanel" aria-label="Close this panel">${ic('close')}</button></div><div class="fe-drawer-body"></div></aside>
      <main class="fe-main">
        <canvas class="fe-rx" aria-hidden="true"></canvas><canvas class="fe-ry" aria-hidden="true"></canvas><span class="fe-rc" aria-hidden="true"></span>
        <div class="fe-stage" tabindex="-1">
          <div class="fe-board"><div class="fe-paper"></div><div class="fe-over"></div></div>
        </div>
        <div class="fe-hud" aria-hidden="true"></div>
      </main>
      <aside class="fe-insp" aria-label="Selected item"></aside>`;
    document.body.appendChild(root);
    document.body.classList.add('fe-open');
    root.showModal();
    // the admin's notice lives outside the editor; while it is open it moves inside, so it shows in the top layer above
    // the editor. The crop dialog (crop.js) is a modal dialog of its own and opens above; an older overlay version is moved in
    const toastEl = document.getElementById('toast');
    const toastHome = toastEl && { parent: toastEl.parentNode, next: toastEl.nextSibling };
    if (toastEl) root.appendChild(toastEl);
    const adopt = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains('crop-overlay')) root.appendChild(n); })));
    adopt.observe(document.body, { childList: true });
    const $ = (s) => root.querySelector(s);
    const stage = $('.fe-stage'), board = $('.fe-board'), paper = $('.fe-paper'), over = $('.fe-over');
    const drawer = $('.fe-drawer'), dbody = $('.fe-drawer-body'), insp = $('.fe-insp');
    const rx = $('.fe-rx'), ry = $('.fe-ry');
    const G = { W: 0, H: 0, L: 0, T: 0 };    // canvas size and place on the board, in screen pixels

    /* ---------- history ---------- */
    function commit(tag) {
      const s = snapshot();
      if (s === S.hist[S.hi]) { paintTop(); return; }
      const now = Date.now();
      if (tag && tag === S.lastTag && now - S.lastT < 1200 && S.hi === S.hist.length - 1 && S.hi > 0) S.hist[S.hi] = s;
      else { S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s); if (S.hist.length > 200) S.hist.shift(); S.hi = S.hist.length - 1; }
      S.lastTag = tag || ''; S.lastT = now; S.justSaved = false; S.error = '';
      paintTop();
      if (S.panel === 'layers' || S.panel === 'photos') paintDrawer();
    }
    function travel(step) {
      const i = S.hi + step;
      if (i < 0 || i >= S.hist.length) return;
      S.hi = i;
      const s = S.hist[i], cut = s.lastIndexOf('|');
      const spreadWas = !!S.page.s;
      S.page = JSON.parse(s.slice(0, cut)); S.meta = JSON.parse(s.slice(cut + 1));
      S.sel = S.sel.filter((k) => k < S.page.els.length);
      S.lastTag = '';
      endTextEdit(false);
      render();
      if (spreadWas !== !!S.page.s) zoomFit(); else layout();
      paintTop(); paintDrawer(); paintInsp();
      toast(step < 0 ? 'Undone' : 'Redone');
    }
    const toast = (m) => ctx.toast && ctx.toast(m);

    /* ---------- painting ---------- */
    function render(only) {
      const html = PT().renderFree(displayPage(), { album: VA, media: lookup, editable: true, section: opts.section });
      if (only && only.length && paper.firstElementChild) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        let done = true;
        for (const i of only) {
          const a = paper.querySelector(`[data-el="${i}"]`), b = tmp.querySelector(`[data-el="${i}"]`);
          if (a && b) a.replaceWith(b); else done = false;
        }
        if (done) { markLocked(); return; }
      }
      paper.innerHTML = html;
      markLocked();
    }
    function markLocked() {
      S.page.els.forEach((e, i) => {
        const n = paper.querySelector(`[data-el="${i}"]`);
        if (!n) return;
        n.classList.toggle('fe-locked', !!e.lock);
        if (i === S.editing) n.classList.add('fe-editing');
        if (e.type === 'photo' && e.fade && !n.style.maskImage && !n.style.webkitMaskImage) n.style.cssText += fadeCss(e.fade);
      });
    }
    // move one layer's box without drawing the whole page again (while dragging)
    function placeEl(i) {
      const e = S.page.els[i], n = paper.querySelector(`[data-el="${i}"]`);
      if (!e || !n) return;
      const pct = (v) => (Math.round(v * 100000) / 1000) + '%';
      n.style.left = pct(e.x); n.style.top = pct(e.y); n.style.width = pct(e.w); n.style.height = pct(e.h);
      const tf = [];
      if (e.rot) tf.push(`rotate(${+e.rot}deg)`);
      if (e.flipX || e.flipY) tf.push(`scale(${e.flipX ? -1 : 1},${e.flipY ? -1 : 1})`);
      n.style.transform = tf.join(' ');
      if (e.type === 'text') n.style.fontSize = (+e.size || 5) + 'cqh';
    }

    function paintTop() {
      $('[data-cmd="undo"]').disabled = S.hi <= 0;
      $('[data-cmd="redo"]').disabled = S.hi >= S.hist.length - 1;
      const d = dirty();
      const st = $('.fe-status');
      st.textContent = S.saving ? 'Saving…' : d ? 'Unsaved changes' : S.justSaved ? 'Saved' : tplMode ? 'Page design' : mode === 'cover' ? 'Cover design' : S.page.s ? 'Two pages' : 'One page';
      st.classList.toggle('warn', d && !S.saving);
      const save = $('.fe-save');
      save.disabled = S.saving;
      save.querySelector('span').textContent = S.saving ? 'Saving…' : !d && S.justSaved ? 'Saved' : 'Save';
      save.classList.toggle('quietened', !d && !S.saving);
      const err = $('.fe-error');
      err.hidden = !S.error; err.textContent = S.error;
      $('.fe-zoom span').textContent = Math.round((G.H / ZOOM_100) * 100) + '%';
      $('[data-cmd="guides"]').setAttribute('aria-pressed', String(S.guidesOn));
      $('[data-cmd="rulers"]').setAttribute('aria-pressed', String(S.rulersOn));
    }
    function paintRail() {
      root.querySelectorAll('[data-panel]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.panel === S.panel)));
      root.classList.toggle('fe-drawer-open', !!S.panel && S.panel !== 'props');
      root.classList.toggle('fe-props-open', S.panel === 'props');
      root.classList.toggle('fe-no-rulers', !S.rulersOn);
    }

    /* ---------- layout and zoom ---------- */
    const PAD = () => (isPhone() ? 18 : 56);
    function fitZ() {
      const pad = PAD();
      const w = stage.clientWidth - pad * 2, h = stage.clientHeight - pad * 2;
      return Math.max(80, Math.min(h, w / A()));
    }
    function layout() {
      if (S.fit) S.z = fitZ();
      const H = Math.round(S.z), W = Math.round(S.z * A()), pad = PAD();
      const bw = Math.max(stage.clientWidth, W + pad * 2), bh = Math.max(stage.clientHeight, H + pad * 2);
      board.style.width = bw + 'px'; board.style.height = bh + 'px';
      G.W = W; G.H = H; G.L = Math.round((bw - W) / 2); G.T = Math.round((bh - H) / 2);
      for (const el of [paper, over]) { el.style.left = G.L + 'px'; el.style.top = G.T + 'px'; el.style.width = W + 'px'; el.style.height = H + 'px'; }
      root.style.setProperty('--fe-zoom', String(H / ZOOM_100));
      paintOverlay(); paintRulers(); paintTop(); paintHud();
    }
    function setZoom(z, at) {
      const old = { W: G.W, H: G.H, L: G.L, T: G.T };
      const sr = stage.getBoundingClientRect();
      const px = at ? at.x - sr.left : stage.clientWidth / 2, py = at ? at.y - sr.top : stage.clientHeight / 2;
      // the point of the page under the pointer stays put
      const fx = (stage.scrollLeft + px - old.L) / (old.W || 1), fy = (stage.scrollTop + py - old.T) / (old.H || 1);
      S.fit = false;
      S.z = clamp(z, 80, 6000);
      layout();
      stage.scrollLeft = G.L + fx * G.W - px;
      stage.scrollTop = G.T + fy * G.H - py;
      paintRulers();
    }
    function zoomFit() { S.fit = true; layout(); stage.scrollLeft = (board.offsetWidth - stage.clientWidth) / 2; stage.scrollTop = (board.offsetHeight - stage.clientHeight) / 2; }
    const zoomStep = (dir, at) => setZoom(dir > 0 ? S.z * 1.2 : S.z / 1.2, at);

    function paintRulers() {
      if (!S.rulersOn || isPhone()) return;
      const dpr = devicePixelRatio || 1;
      const css = getComputedStyle(root);
      const fg = css.getPropertyValue('--fe-ruler-ink').trim() || '#888', band = css.getPropertyValue('--fe-ruler-band').trim() || 'rgba(239,160,11,.25)';
      const sr = stage.getBoundingClientRect(), xr = rx.getBoundingClientRect(), yr = ry.getBoundingClientRect();
      const ox = sr.left - xr.left - stage.scrollLeft + G.L, oy = sr.top - yr.top - stage.scrollTop + G.T;
      const bb = S.sel.length ? unionBox(S.sel) : null;
      const draw = (cv, horiz) => {
        const len = horiz ? cv.clientWidth : cv.clientHeight, th = horiz ? cv.clientHeight : cv.clientWidth;
        cv.width = Math.round((horiz ? len : th) * dpr); cv.height = Math.round((horiz ? th : len) * dpr);
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, horiz ? len : th, horiz ? th : len);
        const o = horiz ? ox : oy, size = horiz ? G.W / pagesN() : G.H, count = horiz ? pagesN() : 1;
        if (bb) { g.fillStyle = band; const a = o + (horiz ? bb.l : bb.t), b = o + (horiz ? bb.r : bb.b); if (horiz) g.fillRect(a, 0, b - a, th); else g.fillRect(0, a, th, b - a); }
        g.strokeStyle = fg; g.fillStyle = fg; g.lineWidth = 1; g.font = '10px Mukta, system-ui, sans-serif'; g.textBaseline = 'top';
        const per = size / 100;
        const minor = per * 1 >= 6 ? 1 : per * 5 >= 6 ? 5 : 10, label = per * 10 >= 46 ? 10 : per * 20 >= 46 ? 20 : 50;
        g.beginPath();
        for (let p = 0; p < count; p++) {
          for (let v = 0; v <= 100; v += minor) {
            const at = Math.round(o + p * size + v * per) + 0.5;
            if (at < -2 || at > len + 2) continue;
            const big = v % label === 0, mid = v % 10 === 0;
            const t = big ? th : mid ? th * 0.45 : th * 0.25;
            if (horiz) { g.moveTo(at, th); g.lineTo(at, th - t); } else { g.moveTo(th, at); g.lineTo(th - t, at); }
            if (big && !(p > 0 && v === 0)) {
              if (horiz) g.fillText(String(v), at + 3, 2);
              else { g.save(); g.translate(2, at + 3); g.rotate(Math.PI / 2); g.translate(0, -9); g.fillText(String(v), 0, 0); g.restore(); }
            }
          }
        }
        g.stroke();
      };
      draw(rx, true); draw(ry, false);
    }
    function paintHud() {
      const hud = $('.fe-hud');
      if (S.sel.length === 1) {
        const e = els()[S.sel[0]];
        if (!e) { hud.textContent = ''; return; }
        const pw = 100 * pagesN();
        hud.textContent = `${typeName(e)}  x ${(e.x * pw).toFixed(1)}  y ${(e.y * 100).toFixed(1)}  w ${(e.w * pw).toFixed(1)}  h ${(e.h * 100).toFixed(1)}${e.rot ? `  ${Math.round(e.rot)}°` : ''}`;
      } else hud.textContent = S.sel.length ? `${S.sel.length} items selected` : `${els().length} of ${MAX_ELS} items`;
    }

    /* ---------- geometry ---------- */
    function aabb(e) {
      const W = G.W, H = G.H;
      const cx = (e.x + e.w / 2) * W, cy = (e.y + e.h / 2) * H, w = e.w * W, h = e.h * H;
      const t = ((e.rot || 0) * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
      const bw = w * c + h * s, bh = w * s + h * c;
      return { l: cx - bw / 2, t: cy - bh / 2, r: cx + bw / 2, b: cy + bh / 2, cx, cy };
    }
    function unionBox(list) {
      let b = null;
      list.forEach((i) => { const e = els()[i]; if (!e) return; const a = aabb(e); b = b ? { l: Math.min(b.l, a.l), t: Math.min(b.t, a.t), r: Math.max(b.r, a.r), b: Math.max(b.b, a.b) } : a; });
      if (b) { b.cx = (b.l + b.r) / 2; b.cy = (b.t + b.b) / 2; }
      return b;
    }
    const pt = (ev) => { const r = paper.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    // the layer under the pointer; a shape with no fill (a frame line) only counts near its outline, so it does not hide what is inside it
    function hitEl(ev) {
      for (const n of document.elementsFromPoint(ev.clientX, ev.clientY)) {
        const el = n.closest && n.closest('.fe-paper [data-el]');
        if (!el) { if (n === paper || n.closest && n.closest('.fe-over')) continue; if (n.closest && n.closest('.fe-paper')) continue; break; }
        const e = els()[+el.dataset.el];
        if (!e) continue;
        if (e.type === 'shape' && !e.fill && e.shape !== 'line') {
          const r = el.getBoundingClientRect(), d = Math.min(ev.clientX - r.left, r.right - ev.clientX, ev.clientY - r.top, r.bottom - ev.clientY);
          if (d > 8) continue;
        }
        return el;
      }
      return null;
    }
    function snapLines(excl) {
      const W = G.W, H = G.H, n = pagesN(), pw = W / n, xs = [], ys = [];
      for (let p = 0; p < n; p++) xs.push(p * pw, p * pw + pw / 2, (p + 1) * pw, p * pw + MARGIN * pw, (p + 1) * pw - MARGIN * pw);
      ys.push(0, H / 2, H, MARGIN * H, H - MARGIN * H);
      S.uguides.v.forEach((v) => xs.push(v * W)); S.uguides.h.forEach((v) => ys.push(v * H));
      els().forEach((e, i) => { if (excl.has(i)) return; const a = aabb(e); xs.push(a.l, a.cx, a.r); ys.push(a.t, a.cy, a.b); });
      return { xs, ys };
    }
    function snapAxis(vals, lines, thr) {
      let best = null;
      vals.forEach((v) => lines.forEach((t) => { const d = t - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best))) best = d; }));
      return best;
    }
    const hits = (vals, lines) => [...new Set(lines.filter((t) => vals.some((v) => Math.abs(t - v) < 0.6)).map((t) => Math.round(t * 2) / 2))];

    /* ---------- overlay: safe margin, fold, guides, selection ---------- */
    function paintOverlay() {
      const W = G.W, H = G.H, n = pagesN(), pw = W / n;
      let h = '';
      h += `<i class="fe-crop tl"></i><i class="fe-crop tr"></i><i class="fe-crop bl"></i><i class="fe-crop br"></i>`;
      if (S.guidesOn) {
        for (let p = 0; p < n; p++) h += `<i class="fe-safe" style="left:${p * pw + MARGIN * pw}px;top:${MARGIN * H}px;width:${pw * (1 - 2 * MARGIN)}px;height:${H * (1 - 2 * MARGIN)}px"></i>`;
        if (n === 2) h += `<i class="fe-fold" style="left:${W / 2}px"></i><span class="fe-pagelbl" style="left:${W / 4}px">Left page</span><span class="fe-pagelbl" style="left:${W * 0.75}px">Right page</span>`;
      }
      S.uguides.v.forEach((v, k) => { h += `<i class="fe-ug v" data-ug="v${k}" style="left:${v * W}px"></i>`; });
      S.uguides.h.forEach((v, k) => { h += `<i class="fe-ug h" data-ug="h${k}" style="top:${v * H}px"></i>`; });
      const D = S.drag;
      if (S.hover >= 0 && !S.sel.includes(S.hover) && !D && els()[S.hover]) h += boxHtml(els()[S.hover], 'fe-hov');
      const one = S.sel.length === 1;
      S.sel.forEach((i) => { const e = els()[i]; if (e) h += boxHtml(e, one ? 'fe-sel one' : 'fe-sel', one && i !== S.editing); });
      if (S.sel.length > 1) { const b = unionBox(S.sel); h += `<i class="fe-group" style="left:${b.l}px;top:${b.t}px;width:${b.r - b.l}px;height:${b.b - b.t}px"></i>`; }
      if (D && D.gx) D.gx.forEach((x) => { h += `<i class="fe-snap v" style="left:${x}px"></i>`; });
      if (D && D.gy) D.gy.forEach((y) => { h += `<i class="fe-snap h" style="top:${y}px"></i>`; });
      if (D && D.kind === 'marq' && D.rect) { const r = D.rect; h += `<i class="fe-marq" style="left:${r.l}px;top:${r.t}px;width:${r.r - r.l}px;height:${r.b - r.t}px"></i>`; }
      if (D && D.read) h += `<span class="fe-read" style="left:${D.read.x}px;top:${D.read.y}px">${esc(D.read.t)}</span>`;
      if (D && D.drop) h += `<i class="fe-drop" style="left:${D.drop.x}px;top:${D.drop.y}px"></i>`;
      over.innerHTML = h;
    }
    function boxHtml(e, cls, handles) {
      const W = G.W, H = G.H, w = e.w * W, hh = e.h * H;
      let inner = '';
      if (handles && !e.lock) {
        const line = e.type === 'shape' && e.shape === 'line';
        const small = w < 36 || hh < 36;
        const hs = line ? ['w', 'e'] : small ? ['nw', 'ne', 'se', 'sw'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        inner = hs.map((k) => `<i class="fe-h ${k}" data-h="${k}"></i>`).join('') + '<i class="fe-rot" data-h="rot" title="Rotate (Shift: 15° steps)"></i>';
      }
      if (e.lock && cls.includes('fe-sel')) inner += `<span class="fe-lockbadge">${ic('lock')}</span>`;
      return `<div class="${cls}${e.lock ? ' locked' : ''}" style="left:${e.x * W}px;top:${e.y * H}px;width:${w}px;height:${hh}px;${e.rot ? `transform:rotate(${e.rot}deg);` : ''}">${inner}</div>`;
    }

    /* ---------- selection ---------- */
    function select(list, { keepPanel } = {}) {
      endTextEdit(true);
      S.sel = [...new Set(list)].filter((i) => i >= 0 && i < els().length);
      S.replacing = -1; S.swapping = -1;
      if (isPhone() && !keepPanel) { if (S.sel.length && S.panel !== 'props') S.panel = null; if (!S.sel.length && S.panel === 'props') S.panel = null; paintRail(); }
      paintOverlay(); paintInsp(); paintRulers(); paintHud();
      if (S.panel === 'layers') paintDrawer();
    }

    /* ---------- adding layers ---------- */
    function viewCenter() {
      const r = paper.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      let cx = ((sr.left + sr.right) / 2 - r.left) / G.W, cy = ((sr.top + sr.bottom) / 2 - r.top) / G.H;
      cx = clamp(cx, 0.15, 0.85); cy = clamp(cy, 0.15, 0.85);
      if (S.page.s && Math.abs(cx - 0.5) < 0.12) cx = 0.75;
      return { cx, cy };
    }
    function room(n = 1) {
      if (els().length + n > MAX_ELS) { toast(`A page can hold at most ${MAX_ELS} items. Delete some first.`); return false; }
      return true;
    }
    function addEl(e, { at, select: doSel = true } = {}) {
      if (!room()) return -1;
      const c = at || viewCenter();
      // cascade new layers that would sit exactly on top of each other
      let x = c.cx - e.w / 2, y = c.cy - e.h / 2;
      for (let k = 0; k < 8 && els().some((o) => Math.abs(o.x - x) < 0.004 && Math.abs(o.y - y) < 0.004); k++) { x += 0.02; y += 0.02; }
      e.x = r4(x); e.y = r4(y);
      els().push(e);
      const i = els().length - 1;
      render(); commit();
      if (doSel) select([i], { keepPanel: true });
      return i;
    }
    const pageFrac = (w) => w / pagesN();          // a width given for one page, as a fraction of the canvas
    function photoSize(m, hFrac = 0.5) {
      const ar = m && m.width && m.height ? m.width / m.height : 1.5;
      let h = hFrac, w = (h * ar) / A();
      const maxW = 0.8 / pagesN();
      if (w > maxW) { w = maxW; h = (w * A()) / ar; }
      return { w: r4(w), h: r4(h) };
    }
    function addPhoto(mid, at) {
      const m = byId.get(mid);
      const sz = photoSize(m);
      return addEl(Object.assign({ type: 'photo', m: tplMode ? null : mid, shape: 'rect' }, sz), { at });
    }
    function addSpot(shape) {
      const sq = shape !== 'rect' && shape !== 'rounded' && shape !== 'slant';
      const h = 0.45, w = sq ? h / A() : pageFrac(0.4);
      const e = { type: 'photo', m: null, shape, w: r4(w), h };
      if (shape === 'rounded') e.radius = 0.08;
      return addEl(e);
    }
    function addText(preset) {
      const p = TEXT_PRESETS.find((x) => x[0] === preset);
      if (!p) return;
      const d = clone(p[3]);
      const e = Object.assign({ type: 'text', text: '', align: 'center' }, d, { w: r4(pageFrac(d.w)), color: preset === 'names' || preset === 'section' ? (bgDark() ? '#F7E7C6' : 'silk') : ink() });
      if (preset === 'date') e.color = bgDark() ? '#E9C46A' : 'accent';
      const i = addEl(e);
      if (i >= 0 && !AUTO_ROLES.includes(e.role)) setTimeout(() => startTextEdit(i), 30);
    }
    // the page (of a spread) in view
    function pageInView() { return S.page.s ? (viewCenter().cx >= 0.5 ? 1 : 0) : 0; }
    function addQuick(k) {
      const n = pagesN(), p = pageInView(), x0 = p / n, pw = 1 / n;
      let e;
      if (k === 'frame') { const m = MARGIN * 0.7; e = { type: 'shape', shape: 'rect', x: r4(x0 + m * pw), y: r4(m), w: r4(pw * (1 - 2 * m)), h: r4(1 - 2 * m), stroke: bgDark() ? '#E9C46A' : '#A97C2F', strokeW: 0.18 }; }
      if (k === 'panel') e = { type: 'shape', shape: 'rect', x: r4(x0 + pw * 0.58), y: 0, w: r4(pw * 0.42), h: 1, fill: bgDark() ? '#F3E6D3' : 'silk' };
      if (k === 'band') e = { type: 'shape', shape: 'rect', x: r4(x0), y: 0.74, w: r4(pw), h: 0.16, fill: '#00000066' };
      if (!e || !room()) return;
      els().push(e);
      const i = els().length - 1;
      if (k === 'panel') { S.page.els.splice(i, 1); const firstNonBg = 0; S.page.els.splice(firstNonBg, 0, e); }   // panels go to the back
      render(); commit(); select([els().indexOf(e)], { keepPanel: true });
    }
    function addShape(shape) {
      let e;
      if (shape === 'line') e = { type: 'shape', shape: 'line', w: r4(pageFrac(0.4)), h: 0.04, stroke: bgDark() ? '#E9C46A' : '#A97C2F', strokeW: 0.35 };
      else {
        const h = 0.3, sq = shape !== 'rect' && shape !== 'rounded' && shape !== 'slant';
        e = { type: 'shape', shape, w: r4(sq ? h / A() : pageFrac(0.4)), h, fill: shape === 'rect' || shape === 'rounded' ? (bgDark() ? '#FFFFFF1F' : '#C9A22733') : 'accent' };
        if (shape === 'rounded') e.radius = 0.08;
      }
      addEl(e);
    }
    function imgRatio(src) {
      return new Promise((res) => {
        const im = new Image();
        const done = (v) => { clearTimeout(t); res(v); };
        const t = setTimeout(() => done(1), 2500);
        im.onload = () => done(im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1);
        im.onerror = () => done(1);
        im.src = src;
      });
    }
    async function addArt(a) {
      if (!room()) return;
      if (S.swapping >= 0) {
        const e = els()[S.swapping];
        if (e && e.type === 'art') { e.src = a.src; if (defaultTint(a) === null) delete e.tint; else if (!e.tint) e.tint = defaultTint(a); render(); commit(); select([S.swapping]); toast('Ornament swapped'); }
        S.swapping = -1; paintDrawer();
        return;
      }
      const ar = await imgRatio(a.src);
      let h = 0.28, w = (h * ar) / A();
      if (w > 0.7 / pagesN()) { w = 0.7 / pagesN(); h = (w * A()) / ar; }
      const e = { type: 'art', src: a.src, w: r4(w), h: r4(h) };
      const t = defaultTint(a);
      if (t !== null) e.tint = S.artTint || t;
      addEl(e);
    }
    function defaultTint(a) {
      if (!a) return null;
      if (typeof a.tint === 'string' && (COLOR_RE.test(a.tint) || a.tint === 'accent' || a.tint === 'silk')) return a.tint;
      if (a.tint === true) return '#C9A227';
      return null;
    }

    /* ---------- editing layers ---------- */
    const selEls = () => S.sel.map((i) => els()[i]).filter(Boolean);
    function removeSel() {
      if (!S.sel.length) return;
      const drop = new Set(S.sel);
      S.page.els = els().filter((_, i) => !drop.has(i));
      S.sel = [];
      render(); commit(); select([]);
    }
    function duplicateSel(offset = 0.02) {
      if (!S.sel.length || !room(S.sel.length)) return;
      const copies = S.sel.toSorted((a, b) => a - b).map((i) => { const c = clone(els()[i]); c.x = r4(c.x + offset); c.y = r4(c.y + offset); delete c.lock; return c; });
      const start = els().length;
      els().push(...copies);
      render(); commit();
      select(copies.map((_, k) => start + k), { keepPanel: true });
    }
    function copySel() {
      if (!S.sel.length) return;
      CLIP = { els: S.sel.toSorted((a, b) => a - b).map((i) => clone(els()[i])), album: album.id || '' };
      toast(S.sel.length === 1 ? 'Copied' : `${S.sel.length} items copied`);
    }
    function paste() {
      if (!CLIP || !CLIP.els.length || !room(CLIP.els.length)) return;
      const start = els().length;
      CLIP.els.forEach((c0) => {
        const c = clone(c0);
        c.x = r4(c.x + 0.02); c.y = r4(c.y + 0.02);
        if (c.type === 'photo' && (tplMode || !byId.has(c.m))) c.m = null;
        if (c.type === 'art' && !LIB_SRC.test(c.src || '') && !(album.id && String(c.src || '').startsWith('/media/a/' + album.id + '/'))) return;
        els().push(c);
      });
      CLIP.els.forEach((c) => { c.x = r4(c.x + 0.02); c.y = r4(c.y + 0.02); });   // the next paste lands a little further on
      render(); commit();
      select(els().map((_, i) => i).filter((i) => i >= start), { keepPanel: true });
    }
    function restack(how) {
      if (!S.sel.length) return;
      const list = els(), set = new Set(S.sel);
      const picked = list.filter((_, i) => set.has(i)), rest = list.filter((_, i) => !set.has(i));
      let out;
      if (how === 'front') out = [...rest, ...picked];
      else if (how === 'back') out = [...picked, ...rest];
      else {
        out = list.slice();
        const order = S.sel.toSorted((a, b) => (how === 'fwd' ? b - a : a - b));
        order.forEach((i) => {
          const k = out.indexOf(list[i]), j = how === 'fwd' ? k + 1 : k - 1;
          if (j < 0 || j >= out.length || set.has(list.indexOf(out[j]))) return;
          [out[k], out[j]] = [out[j], out[k]];
        });
      }
      S.page.els = out;
      S.sel = picked.map((e) => out.indexOf(e));
      render(); commit(); select(S.sel, { keepPanel: true });
    }
    function moveLayer(from, to) {
      if (from === to || from < 0) return;
      const list = els(), [e] = list.splice(from, 1);
      list.splice(to, 0, e);
      S.sel = [list.indexOf(e)];
      render(); commit(); select(S.sel, { keepPanel: true });
    }
    function toggleLock() {
      const any = selEls().some((e) => !e.lock);
      selEls().forEach((e) => { if (any) e.lock = true; else delete e.lock; });
      render(); commit(); paintOverlay(); paintInsp();
      toast(any ? 'Locked: it cannot be moved until you unlock it' : 'Unlocked');
    }
    function flip(axis) {
      selEls().forEach((e) => { const k = axis === 'x' ? 'flipX' : 'flipY'; if (e[k]) delete e[k]; else e[k] = true; });
      render(S.sel); commit();
    }
    function moveBy(dx, dy, tag) {   // fractions
      selEls().forEach((e) => { if (e.lock) return; e.x = r4(clamp(e.x + dx, -1, 2 - e.w)); e.y = r4(clamp(e.y + dy, -1, 2 - e.h)); });
      S.sel.forEach(placeEl); commit(tag); paintOverlay(); paintRulers(); paintHud(); syncGeo();
    }
    function shiftEl(e, dxPx, dyPx) { e.x = r4(e.x + dxPx / G.W); e.y = r4(e.y + dyPx / G.H); }
    function align(how) {
      const list = S.sel.filter((i) => !els()[i].lock);
      if (!list.length) return;
      let ref;
      if (S.sel.length > 1) ref = unionBox(S.sel);
      else {
        // one item lines up with its own page (the half of the spread it is on)
        const a = aabb(els()[list[0]]), pw = G.W / pagesN(), p = Math.min(pagesN() - 1, Math.max(0, Math.floor(a.cx / pw)));
        ref = { l: p * pw, r: (p + 1) * pw, t: 0, b: G.H }; ref.cx = (ref.l + ref.r) / 2; ref.cy = G.H / 2;
      }
      list.forEach((i) => {
        const e = els()[i], a = aabb(e);
        if (how === 'l') shiftEl(e, ref.l - a.l, 0);
        if (how === 'c') shiftEl(e, ref.cx - a.cx, 0);
        if (how === 'r') shiftEl(e, ref.r - a.r, 0);
        if (how === 't') shiftEl(e, 0, ref.t - a.t);
        if (how === 'm') shiftEl(e, 0, ref.cy - a.cy);
        if (how === 'b') shiftEl(e, 0, ref.b - a.b);
      });
      render(); commit(); paintOverlay(); syncGeo();
    }
    function distribute(axis) {
      const list = S.sel.filter((i) => !els()[i].lock);
      if (list.length < 3) { toast('Select three or more items to space them evenly.'); return; }
      const items = list.map((i) => ({ i, a: aabb(els()[i]) })).sort((p, q) => (axis === 'h' ? p.a.cx - q.a.cx : p.a.cy - q.a.cy));
      const first = items[0].a, last = items[items.length - 1].a;
      const sizes = items.reduce((s, x) => s + (axis === 'h' ? x.a.r - x.a.l : x.a.b - x.a.t), 0);
      const gap = ((axis === 'h' ? last.r - first.l : last.b - first.t) - sizes) / (items.length - 1);
      let pos = axis === 'h' ? first.l : first.t;
      items.forEach((x) => {
        const e = els()[x.i];
        if (axis === 'h') { shiftEl(e, pos - x.a.l, 0); pos += x.a.r - x.a.l + gap; } else { shiftEl(e, 0, pos - x.a.t); pos += x.a.b - x.a.t + gap; }
      });
      render(); commit(); paintOverlay();
    }
    function gridSel() {
      const list = S.sel.filter((i) => els()[i].type === 'photo' && !els()[i].lock);
      if (list.length < 2) { toast('Select two or more photos to arrange them as a grid.'); return; }
      const b = unionBox(list), W = G.W, H = G.H, gut = (S.gridGap || 0) / 100 * H;
      const n = list.length;
      const ars = list.map((i) => { const m = byId.get(els()[i].m); return m ? m.width / m.height : (els()[i].w * W) / (els()[i].h * H); });
      const avg = Math.exp(ars.reduce((x, a) => x + Math.log(a), 0) / n);
      let best = null;
      const colsList = S.gridCols ? [S.gridCols] : Array.from({ length: n }, (_, k) => k + 1);
      colsList.forEach((cols) => {
        const rows = Math.ceil(n / cols);
        const cw = (b.r - b.l - gut * (cols - 1)) / cols, ch = (b.b - b.t - gut * (rows - 1)) / rows;
        if (cw <= MIN_PX || ch <= MIN_PX) return;
        const cost = Math.abs(Math.log(cw / ch / avg)) + (rows * cols - n) * 0.35;
        if (!best || cost < best.cost) best = { cost, cols, rows, ch };
      });
      if (!best) { toast('The gutter is too wide for this many photos. Make it smaller.'); return; }
      // reading order: top to bottom, then left to right
      const order = list.map((i) => ({ i, a: aabb(els()[i]) })).sort((p, q) => (Math.abs(p.a.cy - q.a.cy) > best.ch / 2 ? p.a.cy - q.a.cy : p.a.cx - q.a.cx)).map((x) => x.i);
      order.forEach((i, k) => {
        const row = Math.floor(k / best.cols), inRow = row === best.rows - 1 ? n - row * best.cols : best.cols;   // the last row fills the width
        const col = k - row * best.cols;
        const cw = (b.r - b.l - gut * (inRow - 1)) / inRow;
        const e = els()[i];
        e.x = r4((b.l + col * (cw + gut)) / W); e.y = r4((b.t + row * (best.ch + gut)) / H);
        e.w = r4(cw / W); e.h = r4(best.ch / H);
        delete e.rot; delete e.c;
      });
      render(); commit(); paintOverlay(); paintInsp();
      toast(`Arranged as ${best.rows} × ${best.cols}`);
    }
    function clearPage() {
      if (!els().length) return;
      if (!confirm('Remove everything from this page? The background stays. You can undo this.')) return;
      S.page.els = []; S.sel = [];
      render(); commit(); select([]);
    }
    function setSpread(on) {
      if (mode === 'cover' || !!S.page.s === on) return;
      if (!on && els().some((e) => e.x + e.w / 2 > 0.5) && !confirm('Make this one page? Items on the right-hand page will end up outside the page. You can undo this.')) { paintInsp(); return; }
      els().forEach((e) => {
        if (on) { e.x = r4(e.x / 2); e.w = r4(e.w / 2); } else { e.x = r4(clamp(e.x * 2, -1, 2)); e.w = r4(clamp(e.w * 2, 0.002, 3)); }
      });
      if (on) S.page.s = 1; else delete S.page.s;
      render(); commit(); zoomFit(); paintInsp();
    }

    /* photos */
    function replacePhoto(i, mid) {
      const e = els()[i];
      if (!e || e.type !== 'photo') return;
      e.m = tplMode ? null : mid; delete e.c;
      render([i]); commit();
    }
    function fillEmptyOrAdd(mid) {
      const sel = S.sel.length === 1 ? els()[S.sel[0]] : null;
      if (S.replacing >= 0 && els()[S.replacing]) { const i = S.replacing; S.replacing = -1; replacePhoto(i, mid); select([i]); paintDrawer(); toast('Photo replaced'); return; }
      if (sel && sel.type === 'photo' && !sel.m) {
        const i = S.sel[0]; replacePhoto(i, mid);
        const next = els().findIndex((e, k) => k > i && e.type === 'photo' && !e.m);
        select(next >= 0 ? [next] : [i], { keepPanel: true });
        return;
      }
      const empty = els().findIndex((e) => e.type === 'photo' && !e.m);
      if (empty >= 0 && !tplMode) { replacePhoto(empty, mid); select([empty], { keepPanel: true }); return; }
      addPhoto(mid);
    }
    async function cropPhoto(i) {
      const e = els()[i];
      if (!e || e.type !== 'photo') return;
      const ph = lookup(tplMode ? '__s' + i : e.m);
      if (!ph) { toast('Put a photo in this spot first.'); return; }
      let aspect = (e.w * G.W) / (e.h * G.H);
      if (e.frame === 'polaroid') aspect = aspect * (0.9 / 0.78);
      const shape = e.shape === 'circle' ? 'circle' : e.shape === 'arch' ? 'arch' : 'rect';
      const c = await window.Crop.open({ src: ph.zoom || ph.src, aspect, crop: e.c, shape, title: 'Crop the photo' });
      if (!c) return;
      if (c[0] === 0.5 && c[1] === 0.5 && c[2] === 1) delete e.c; else e.c = c;
      render([i]); commit();
    }
    async function cropBg() {
      const b = S.page.bg;
      const ph = b && b.type === 'photo' && lookup(b.m);
      if (!ph) return;
      const c = await window.Crop.open({ src: ph.zoom || ph.src, aspect: A(), crop: b.c, shape: 'rect', title: 'Crop the background photo' });
      if (!c) return;
      if (c[0] === 0.5 && c[1] === 0.5 && c[2] === 1) delete b.c; else b.c = c;
      render(); commit();
    }
    function matchPhoto(i) {   // the spot takes the photo's own shape, so all of it shows
      const e = els()[i], m = e && byId.get(e.m);
      if (!m) return;
      const ar = m.width / m.height, area = e.w * G.W * e.h * G.H;
      const hp = Math.sqrt(area / ar), wp = hp * ar;
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      e.w = r4(wp / G.W); e.h = r4(hp / G.H); e.x = r4(cx - e.w / 2); e.y = r4(cy - e.h / 2);
      delete e.c;
      render([i]); commit(); paintOverlay(); syncGeo();
    }
    function fitTextBox(i) {
      const e = els()[i], n = paper.querySelector(`[data-el="${i}"] > span`);
      if (!e || !n) return;
      const r = n.getBoundingClientRect(), z = G.H || 1;
      const h = clamp((r.height + 0.01 * z) / z, 0.02, 1.5);
      const cy = e.y + e.h / 2;
      e.h = r4(h); e.y = r4(cy - h / 2);
      render([i]); commit(); paintOverlay(); syncGeo();
    }

    /* ---------- words: typed straight on the page ---------- */
    function startTextEdit(i) {
      const e = els()[i];
      if (!e || e.type !== 'text' || e.lock) return;
      endTextEdit(true);
      S.sel = [i]; S.editing = i;
      render([i]);
      const n = paper.querySelector(`[data-el="${i}"]`), span = n && n.querySelector('span');
      if (!span) { S.editing = -1; return; }
      n.classList.add('fe-editing');
      if (!e.text && !textValue(e)) span.textContent = '';
      try { span.contentEditable = 'plaintext-only'; } catch (err) { span.contentEditable = 'true'; }
      if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
      span.spellcheck = true;
      span.focus();
      const rg = document.createRange(); rg.selectNodeContents(span);
      const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
      span.addEventListener('blur', () => endTextEdit(true), { once: true });
      span.addEventListener('input', () => { S.editingDirty = true; });
      paintOverlay(); paintInsp();
    }
    function endTextEdit(keep) {
      if (S.editing < 0) return;
      const i = S.editing, e = els()[i];
      S.editing = -1;
      const n = paper.querySelector(`[data-el="${i}"]`), span = n && n.querySelector('span');
      if (e && span && keep && S.editingDirty) {
        span.style.textTransform = 'none';   // innerText follows CSS capitals; keep the words as typed
        let v = span.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '').slice(0, 500);
        const auto = (PT().autoText(e.role, VA) || (e.role === 'section' ? opts.section || '' : '')) || '';
        if (AUTO_ROLES.includes(e.role) && (v === auto || !v.trim())) v = '';
        e.text = v;
      }
      S.editingDirty = false;
      render([i]); commit('text');
      paintOverlay(); paintInsp();
    }

    /* ---------- the ready-made designs ---------- */
    function applyDesign(d) {
      if (!d) return;
      if (els().length && !confirm(`Use the design “${d.name || 'Design'}” for this page?\n\nIt replaces what is on the page now. The photos on the page move into the new design. You can undo this.`)) return;
      const p = fill(d, { photos: photoOrder(), pool: unusedPool(), template: tplMode });
      if (mode === 'cover') delete p.s;
      const spreadWas = !!S.page.s;
      S.page = p; S.sel = [];
      endTextEdit(false);
      render(); commit();
      if (spreadWas !== !!p.s) zoomFit(); else layout();
      paintInsp(); paintDrawer();
      const empty = els().filter((e) => e.type === 'photo' && !e.m).length;
      toast(empty && !tplMode ? `Design applied. ${empty === 1 ? 'One photo spot is' : empty + ' photo spots are'} empty: drag photos onto ${empty === 1 ? 'it' : 'them'}.` : 'Design applied');
    }

    /* ---------- background ---------- */
    function setBg(bg, { commitNow = true } = {}) {
      S.page.bg = bg;
      render();
      if (commitNow) commit();
      if (S.panel === 'bg') paintDrawer();
      paintInsp();
    }
    async function uploadImage(file, { png } = {}) {
      if (!album.id || tplMode) throw new Error('Uploads need an album.');
      let blob = file, name = 'image.jpg';
      if (png && file.type === 'image/png' && file.size < 14e6) name = 'image.png';
      else if (ctx.prepareImage) { const img = await ctx.prepareImage(file, 2400, 0); blob = img.file; }
      const form = new FormData();
      form.append('kind', 'asset');
      form.append('file', blob, name);
      const r = await ctx.api('albums/' + encodeURIComponent(album.id) + '/upload', { method: 'POST', form });
      if (!r || !r.url) throw new Error('The upload did not return an address.');
      S.uploads.unshift(r.url);
      return r.url;
    }

    /* ======================================================================
       panels (left)
       ====================================================================== */
    const PANEL_TITLE = { designs: 'Ready-made designs', photos: tplMode ? 'Photo spots' : 'Photos', text: 'Text', shapes: 'Shapes', art: 'Ornaments', bg: 'Background', layers: 'Layers' };
    function openPanel(k) {
      S.panel = S.panel === k && !isPhone() ? null : S.panel === k ? null : k;
      if (k !== 'photos') S.replacing = -1;
      if (k !== 'art') S.swapping = -1;
      paintRail(); paintDrawer();
      if (k === 'props') paintInsp();
      requestAnimationFrame(() => { layout(); });
    }
    function paintDrawer() {
      if (!S.panel || S.panel === 'props') return;
      drawer.querySelector('h2').textContent = PANEL_TITLE[S.panel] || '';
      const keep = dbody.scrollTop;
      const fn = { designs: panelDesigns, photos: panelPhotos, text: panelText, shapes: panelShapes, art: panelArt, bg: panelBg, layers: panelLayers }[S.panel];
      dbody.innerHTML = fn ? fn() : '';
      dbody.scrollTop = keep;
      if (S.panel === 'designs') paintDesignGrid();
      if (S.panel === 'art') paintArtGrid();
    }
    const loading = '<p class="fe-note">Loading the design library…</p>';

    function panelDesigns() {
      if (!S.designs) return loading;
      const kinds = tplMode ? `<div class="fe-seg wide" role="group" aria-label="Kind of design">${[['all', 'All'], ['page', 'Pages'], ['cover', 'Covers']].map(([k, l]) =>
        `<button type="button" data-dkind="${k}" aria-pressed="${S.designKind === k}">${l}</button>`).join('')}</div>` : '';
      const occ = tplMode ? (S.meta.occasions || [])[0] : album.type;
      const occLabel = occ && M && M.TYPES[occ] ? M.TYPES[occ].label : '';
      return `${kinds}
        <label class="fe-search">${ic('search')}<input type="search" data-q="design" placeholder="Search designs" value="${esc(S.designQuery)}" aria-label="Search designs"></label>
        ${occLabel ? `<div class="fe-chips" role="group" aria-label="Occasion"><button type="button" class="fe-chip" data-docc="mine" aria-pressed="${S.designOcc === 'mine'}">For ${esc(occLabel.toLowerCase())}</button><button type="button" class="fe-chip" data-docc="all" aria-pressed="${S.designOcc === 'all'}">Every occasion</button></div>` : ''}
        ${mode === 'cover' ? '' : `<div class="fe-chips" role="group" aria-label="Kind of layout">${[['all', 'All'], ['spread', 'Spreads'], ['studio-style', 'Studio style'], ['single', 'Single pages']].map(([k, l]) => `<button type="button" class="fe-chip" data-dtag="${k}" aria-pressed="${S.designTag === k}">${l}</button>`).join('')}</div>`}
        <div class="fe-dgrid-host"></div>`;
    }
    function designList() {
      const occ = tplMode ? (S.meta.occasions || [])[0] : album.type;
      const q = S.designQuery.trim().toLowerCase();
      return (S.designs || []).filter((d) => {
        if (mode === 'cover' && (d.kind !== 'cover' || (d.page && d.page.s))) return false;
        if (mode === 'page' && d.kind !== 'page') return false;
        if (tplMode && S.designKind !== 'all' && d.kind !== S.designKind) return false;
        if (S.designOcc === 'mine' && occ && (d.occasions || []).length && !(d.occasions || []).includes(occ)) return false;
        if (q && !`${d.name || ''} ${(d.tags || []).join(' ')} ${(d.occasions || []).join(' ')}`.toLowerCase().includes(q)) return false;
        if (S.designTag === 'spread' && !((d.tags || []).includes('spread') || (d.page && d.page.s))) return false;
        if (S.designTag === 'studio-style' && !(d.tags || []).includes('studio-style')) return false;
        if (S.designTag === 'single' && d.page && d.page.s) return false;
        return true;
      });
    }
    function paintDesignGrid() {
      const host = dbody.querySelector('.fe-dgrid-host');
      if (!host) return;
      const list = designList();
      if (!list.length) {
        host.innerHTML = `<div class="fe-empty"><p><b>No ready-made designs here yet.</b> ${S.designQuery ? 'Try other words, or clear the search.' : S.designOcc === 'mine' ? 'Show the designs for every occasion, or start from the photos, text and ornaments on the left.' : 'Start from the photos, text and ornaments on the left.'}</p></div>`;
        return;
      }
      const photos = photoOrder(), pool = unusedPool();
      const groups = [['studio', 'From your studio'], ['library', 'Library']];
      host.innerHTML = groups.map(([src, label]) => {
        const g = list.filter((d) => d.source === src);
        if (!g.length) return '';
        return `<h3 class="fe-h3">${label} <span class="fe-count">${g.length}</span></h3><div class="fe-dgrid">${g.map((d) => {
          const filled = fill(d, { photos, pool, template: tplMode });
          const view = tplMode ? Object.assign({}, filled, { els: filled.els.map((e, k) => (e.type === 'photo' ? Object.assign({}, e, { m: '__s' + k }) : e)) }) : filled;
          const two = !!filled.s;
          return `<button type="button" class="fe-dtile${two ? ' is-two' : ''}" data-design="${esc(d.source + ':' + d.key)}" title="${esc(d.name || '')}">
            <span class="fe-dthumb" style="aspect-ratio:${ratio * (two ? 2 : 1)}">${PT().renderFree(view, { album: VA, media: lookup, small: true, section: opts.section })}</span>
            <span class="fe-dname">${esc(d.name || 'Design')}${d.kind === 'cover' && mode !== 'cover' ? ' <em>cover</em>' : ''}${two ? ' <em>two pages</em>' : ''}</span></button>`;
        }).join('')}</div>`;
      }).join('');
    }

    function panelPhotos() {
      if (tplMode) {
        return `<p class="fe-note">Photo spots take each album’s photos when a studio uses this design. Here they show sample pictures.</p>
          <div class="fe-shapegrid">${PT().SHAPES.filter((s) => s !== 'line').map((s) => `<button type="button" class="fe-shapebtn" data-spot="${s}" title="${SHAPE_NAMES[s]} photo spot"><span class="fe-sh" style="${PT().shapeCss(s, 0.12)}"></span><small>${SHAPE_NAMES[s]}</small></button>`).join('')}</div>`;
      }
      if (!ALL.length) return '<div class="fe-empty"><p><b>This album has no photos yet.</b> Add them under Photos and pages, then come back to place them here.</p></div>';
      const here = onPage();
      const unused = ALL.filter((m) => !here.has(m.id) && !usedElsewhere.has(m.id)).length;
      if (S.photoFilter === 'unused' && !unused) S.photoFilter = 'all';
      const show = (m) => S.photoFilter === 'all' || (!here.has(m.id) && !usedElsewhere.has(m.id));
      const tile = (m) => {
        const on = here.has(m.id), else_ = usedElsewhere.has(m.id);
        return `<button type="button" class="fe-ph${on ? ' on' : else_ ? ' used' : ''}" data-ph="${esc(m.id)}" title="${esc(m.name || 'Photo')}${on ? ', on this page' : else_ ? ', on another page' : ', not used yet'}">` +
          `<img src="${esc(m.thumb || m.url)}" alt="" loading="lazy" draggable="false">${on ? `<span class="fe-mark">${ic('check')}</span>` : else_ ? '<span class="fe-dot" aria-hidden="true"></span>' : ''}</button>`;
      };
      const secs = [];
      PHOTOS.forEach((m) => { if (!show(m)) return; const k = m.section || ''; let s = secs.find((x) => x.k === k); if (!s) secs.push(s = { k, list: [] }); s.list.push(m); });
      let html = secs.map((s) => (secs.length > 1 || s.k ? `<h3 class="fe-h3">${esc(s.k || 'Other photos')}</h3>` : '') + `<div class="fe-phgrid">${s.list.map(tile).join('')}</div>`).join('');
      const dp = DESIGNED.filter(show);
      if (dp.length) html += `<h3 class="fe-h3">Designed pages</h3><div class="fe-phgrid">${dp.map(tile).join('')}</div>`;
      if (!html) html = '<p class="fe-note">Every photo is on a page.</p>';
      const repl = S.replacing >= 0 ? `<div class="fe-banner">Pick the photo for the selected spot. <button type="button" class="link" data-cmd="cancelreplace">Cancel</button></div>` : '';
      return `${repl}<div class="fe-seg wide" role="group" aria-label="Show">
          <button type="button" data-pfilter="all" aria-pressed="${S.photoFilter === 'all'}">All <span>${ALL.length}</span></button>
          <button type="button" data-pfilter="unused" aria-pressed="${S.photoFilter === 'unused'}" ${unused ? '' : 'disabled'}>Not used <span>${unused}</span></button></div>
        <p class="fe-note">Click to add or fill the next empty spot. Drag onto the page, or onto a photo to replace it.</p>
        ${html}
        <h3 class="fe-h3">Empty photo spots</h3>
        <div class="fe-shapegrid compact">${['rect', 'rounded', 'circle', 'arch', 'heart', 'hexagon'].map((s) => `<button type="button" class="fe-shapebtn" data-spot="${s}" title="Empty ${SHAPE_NAMES[s].toLowerCase()} spot"><span class="fe-sh" style="${PT().shapeCss(s, 0.12)}"></span><small>${SHAPE_NAMES[s]}</small></button>`).join('')}</div>`;
    }

    function panelText() {
      const font = (k) => PT().FONTS[k] || PT().FONTS.display;
      return `<p class="fe-note">Names, date and place fill in from the album details, so a design works for every couple.</p>
        <div class="fe-tpresets">${TEXT_PRESETS.map(([k, label, hint, d]) => {
          const sample = d.role === 'names' ? (PT().autoText('names', VA) || 'Aarav & Diya') : d.role === 'date' ? (PT().autoText('date', VA) || '12 February 2026') : d.role === 'place' ? (PT().autoText('place', VA) || 'Udaipur') : d.role === 'section' ? (opts.section || 'Haldi') : label;
          return `<button type="button" class="fe-tp" data-text="${k}"><span class="fe-tp-s" style="font-family:${esc(font(d.font))};${d.italic ? 'font-style:italic;' : ''}${d.upper ? 'text-transform:uppercase;letter-spacing:.14em;font-size:15px;' : ''}${d.weight ? `font-weight:${d.weight};` : ''}">${esc(sample)}</span><small>${esc(label === sample ? hint : label + ': ' + hint)}</small></button>`;
        }).join('')}</div>`;
    }

    function panelShapes() {
      return `<h3 class="fe-h3">Quick additions</h3>
        <div class="fe-quick">
          <button type="button" class="fe-qbtn" data-quick="frame"><span class="fe-q-frame"></span><b>Inset frame</b><small>A thin line inside the page edge</small></button>
          <button type="button" class="fe-qbtn" data-quick="panel"><span class="fe-q-panel"></span><b>Colour panel</b><small>A block of colour across part of the page</small></button>
          <button type="button" class="fe-qbtn" data-quick="band"><span class="fe-q-band"></span><b>Title band</b><small>A strip for words over a photo</small></button>
        </div>
        <h3 class="fe-h3">Shapes</h3>
        <p class="fe-note">Blocks of colour, frames and lines. Put a shape behind words for a band, or behind a photo for a mat.</p>
        <div class="fe-shapegrid">${PT().SHAPES.map((s) => `<button type="button" class="fe-shapebtn" data-shape="${s}" title="${SHAPE_NAMES[s]}">${s === 'line' ? '<span class="fe-sh line"></span>' : `<span class="fe-sh fill" style="${PT().shapeCss(s, 0.12)}"></span>`}<small>${SHAPE_NAMES[s]}</small></button>`).join('')}</div>`;
    }

    function panelArt() {
      if (!S.lib) return loading;
      const cats = [...new Set(S.lib.art.map((a) => a.category || 'Other'))];
      const swap = S.swapping >= 0 ? `<div class="fe-banner">Pick the ornament to put in its place. <button type="button" class="link" data-cmd="cancelswap">Cancel</button></div>` : '';
      return `${swap}<label class="fe-search">${ic('search')}<input type="search" data-q="art" placeholder="Search ornaments" value="${esc(S.artQuery)}" aria-label="Search ornaments"></label>
        ${cats.length > 1 ? `<div class="fe-chips" role="group" aria-label="Kind of ornament"><button type="button" class="fe-chip" data-acat="all" aria-pressed="${S.artCat === 'all'}">All</button>${cats.map((c) => `<button type="button" class="fe-chip" data-acat="${esc(c)}" aria-pressed="${S.artCat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
        <div class="fe-row"><span class="fe-lbl">Colour for single-colour ornaments</span>${colorBtn('arttint', S.artTint, { label: 'Ornament colour' })}</div>
        <div class="fe-agrid-host"></div>
        ${album.id && !tplMode ? `<label class="fe-upload">${ic('upload')}<span>Upload your own ornament</span><small>PNG with a see-through background works best</small><input type="file" accept="image/png,image/webp,image/jpeg" data-upload="art" hidden></label>` : ''}`;
    }
    function paintArtGrid() {
      const host = dbody.querySelector('.fe-agrid-host');
      if (!host || !S.lib) return;
      const q = S.artQuery.trim().toLowerCase();
      const list = S.lib.art.filter((a) => (S.artCat === 'all' || (a.category || 'Other') === S.artCat) &&
        (!q || `${a.name || ''} ${(a.tags || []).join(' ')} ${a.category || ''}`.toLowerCase().includes(q)));
      const own = S.uploads.filter((u) => /\.png$|\.webp$/.test(u));
      if (!list.length && !own.length) {
        host.innerHTML = `<div class="fe-empty"><p><b>${S.lib.art.length ? 'No ornaments match.' : 'The ornament library is empty for now.'}</b> ${S.lib.art.length ? 'Try other words.' : 'Shapes and lines work as decoration in the meantime.'}</p></div>`;
        return;
      }
      const tintCss = resolve(S.artTint) || '#C9A227';
      host.innerHTML = `<div class="fe-agrid">${own.map((u) => `<button type="button" class="fe-atile" data-artsrc="${esc(u)}" title="Your ornament"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}${list.map((a) =>
        `<button type="button" class="fe-atile" data-art="${esc(a.key || a.src)}" title="${esc(a.name || '')}">${defaultTint(a) !== null
          ? `<i style="-webkit-mask:url('${esc(a.thumb || a.src)}') center/contain no-repeat;mask:url('${esc(a.thumb || a.src)}') center/contain no-repeat;background:${tintCss}"></i>`
          : `<img src="${esc(a.thumb || a.src)}" alt="" loading="lazy">`}</button>`).join('')}</div>`;
    }

    function panelBg() {
      const b = S.page.bg || { type: 'color', color: '#F7F3EE' };
      const lib = S.lib || { backgrounds: [], patterns: [] };
      const isPattern = b.type === 'image' && b.repeat;
      // controls for the background in use
      let cur = '';
      if (b.type === 'color') cur = `<div class="fe-row"><span class="fe-lbl">Colour</span>${colorBtn('bg.color', b.color, { label: 'Background colour', alpha: false })}</div>`;
      if (b.type === 'gradient') {
        const [c1, c2] = b.colors || ['#F7F3EE', '#F7F3EE'];
        cur = `<div class="fe-row"><span class="fe-lbl">Colours</span>${colorBtn('bg.colors.0', c1, { label: 'First colour' })}${colorBtn('bg.colors.1', c2 || c1, { label: 'Second colour' })}
            <button type="button" class="fe-ib sm" data-cmd="swapgrad" title="Swap the two colours" aria-label="Swap the two colours">${ic('replace')}</button></div>
          ${seg('bg.radial', b.radial ? '1' : '', [['', 'Straight'], ['1', 'Round']])}
          ${b.radial ? '' : range('bg.angle', 'Direction', b.angle == null ? 180 : b.angle, 0, 360, 1, 'deg')}`;
      }
      if (b.type === 'image' || b.type === 'photo') {
        cur = (b.type === 'photo' ? `<div class="fe-row"><button type="button" class="btn quiet sm" data-cmd="cropbg">${ic('crop')}Crop</button><button type="button" class="btn quiet sm" data-cmd="bgphotos">${ic('replace')}Another photo</button></div>` : '') +
          (isPattern ? range('bg.scale', 'Pattern size', b.scale || 20, 2, 100, 1, 'n0') + `<div class="fe-row"><span class="fe-lbl">Colour behind the pattern</span>${colorBtn('bg.color', b.color || '#F7F3EE', { label: 'Colour behind the pattern' })}</div>` : '') +
          range('bg.blur', 'Blur', b.blur || 0, 0, 5, 0.1, 'n1') + range('bg.dim', 'Dim', b.dim || 0, 0, 0.95, 0.01, 'pct') +
          (b.dim ? `<div class="fe-row"><span class="fe-lbl">Dim colour</span>${colorBtn('bg.dimColor', b.dimColor || '#000000', { label: 'Dim colour' })}</div>` : '');
      }
      const typeName = b.type === 'color' ? 'Plain colour' : b.type === 'gradient' ? 'Gradient' : b.type === 'photo' ? 'Album photo' : isPattern ? 'Pattern' : 'Image';
      const tones = [...new Set(lib.backgrounds.map((x) => x.tone).filter(Boolean))];
      const bgs = lib.backgrounds.filter((x) => S.bgTone === 'all' || x.tone === S.bgTone);
      const ownImgs = [...new Set([...S.uploads, ...(b.type === 'image' && String(b.src || '').startsWith('/media/') ? [b.src] : [])])];
      const photoPick = S.bgPick ? `<div class="fe-phgrid small">${ALL.map((m) => `<button type="button" class="fe-ph" data-bgphoto="${esc(m.id)}" title="${esc(m.name || '')}"><img src="${esc(m.thumb || m.url)}" alt="" loading="lazy" draggable="false"></button>`).join('')}</div>` : '';
      return `<section class="fe-cur"><h3 class="fe-h3">Now: ${typeName}</h3>${cur}</section>
        <h3 class="fe-h3">Plain colours</h3>
        <div class="fe-swatches">${[['silk', 'Occasion colour'], ['accent', 'Occasion second colour']].map(([k, l]) => `<button type="button" class="fe-sw big" data-bgcolor="${k}" title="${l}" style="background:${resolve(k)}"></button>`).join('')}${BG_SWATCHES.map((c) => `<button type="button" class="fe-sw big" data-bgcolor="${c}" title="${c}" style="background:${c}"></button>`).join('')}</div>
        <h3 class="fe-h3">Gradients</h3>
        <div class="fe-swatches">${GRADS.map((g, k) => `<button type="button" class="fe-sw big grad" data-grad="${k}" title="Gradient" style="background:${g[3] ? `radial-gradient(circle at 50% 40%, ${resolve(g[0])}, ${resolve(g[1])})` : `linear-gradient(${g[2]}deg, ${resolve(g[0])}, ${resolve(g[1])})`}"></button>`).join('')}</div>
        ${!tplMode && ALL.length ? `<h3 class="fe-h3">An album photo</h3><p class="fe-note">A photo across the page, softened with blur and dim so photos and words stand out on it.</p>
          <button type="button" class="btn quiet sm" data-cmd="bgphotos">${ic('photos')}${S.bgPick ? 'Hide the photos' : 'Choose a photo'}</button>${photoPick}` : ''}
        ${tplMode ? `<h3 class="fe-h3">A photo spot</h3><p class="fe-note">The page background takes one of the album’s photos.</p><button type="button" class="btn quiet sm" data-cmd="bgspot">${ic('photos')}Use a photo as the background</button>` : ''}
        <h3 class="fe-h3">Images</h3>
        ${tones.length > 1 ? `<div class="fe-chips" role="group" aria-label="Tone"><button type="button" class="fe-chip" data-tone="all" aria-pressed="${S.bgTone === 'all'}">All</button>${tones.map((t) => `<button type="button" class="fe-chip" data-tone="${esc(t)}" aria-pressed="${S.bgTone === t}">${esc(t[0].toUpperCase() + t.slice(1))}</button>`).join('')}</div>` : ''}
        ${S.lib ? (bgs.length ? `<div class="fe-bggrid">${bgs.map((x) => `<button type="button" class="fe-bgtile${b.type === 'image' && !b.repeat && b.src === x.src ? ' on' : ''}" data-bgimg="${esc(x.src)}" title="${esc(x.name || '')}" style="aspect-ratio:${ratio}"><img src="${esc(x.thumb || x.src)}" alt="" loading="lazy"></button>`).join('')}</div>` : '<p class="fe-note">No background images in the library yet.</p>') : loading}
        <h3 class="fe-h3">Patterns</h3>
        ${S.lib ? (lib.patterns.length ? `<div class="fe-bggrid pat">${lib.patterns.map((x) => `<button type="button" class="fe-bgtile pat${isPattern && b.src === x.src ? ' on' : ''}" data-pattern="${esc(x.src)}" title="${esc(x.name || '')}" style="background:url('${esc(x.thumb || x.src)}') repeat ${resolve(isPattern ? b.color : '') || '#F7F3EE'};background-size:42px"></button>`).join('')}</div>` : '<p class="fe-note">No patterns in the library yet.</p>') : ''}
        ${album.id && !tplMode ? `<h3 class="fe-h3">Your own</h3>${ownImgs.length ? `<div class="fe-bggrid">${ownImgs.map((u) => `<button type="button" class="fe-bgtile" data-bgimg="${esc(u)}" style="aspect-ratio:${ratio}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
          <label class="fe-upload">${ic('upload')}<span>Upload a background</span><small>JPG or PNG, ideally the shape of the page</small><input type="file" accept="image/*" data-upload="bg" hidden></label>` : ''}`;
    }

    function layerName(e) {
      if (e.type === 'photo') return e.m || tplMode ? 'Photo' : 'Empty photo spot';
      if (e.type === 'text') { const v = textValue(e).replace(/\s+/g, ' ').trim(); return v ? v.slice(0, 34) : 'Words'; }
      if (e.type === 'shape') return SHAPE_NAMES[e.shape] || 'Shape';
      const a = S.lib && S.lib.art.find((x) => x.src === e.src);
      return (a && a.name) || 'Ornament';
    }
    function typeName(e) { return e.type === 'photo' ? 'Photo' : e.type === 'text' ? 'Words' : e.type === 'shape' ? (e.shape === 'line' ? 'Line' : 'Shape') : 'Ornament'; }
    function layerThumb(e, i) {
      if (e.type === 'photo') { const ph = lookup(tplMode ? '__s' + i : e.m); return ph ? `<img src="${esc(ph.thumb || ph.src)}" alt="">` : ic('photos'); }
      if (e.type === 'text') return `<b style="font-family:${esc(PT().FONTS[e.font] || PT().FONTS.display)}">Aa</b>`;
      if (e.type === 'shape') return e.shape === 'line' ? `<span class="fe-lt-line" style="background:${resolve(e.stroke || e.fill) || '#000'}"></span>` : `<span class="fe-lt-sh" style="${PT().shapeCss(e.shape, e.radius)}background:${resolve(e.fill) || 'transparent'};${e.stroke ? `box-shadow:inset 0 0 0 2px ${resolve(e.stroke)}` : ''}"></span>`;
      return e.tint ? `<i class="fe-lt-art" style="-webkit-mask:url('${esc(e.src)}') center/contain no-repeat;mask:url('${esc(e.src)}') center/contain no-repeat;background:${resolve(e.tint)}"></i>` : `<img src="${esc(e.src)}" alt="">`;
    }
    function panelLayers() {
      if (!els().length) return '<div class="fe-empty"><p><b>The page is empty.</b> Add a photo, words or an ornament, or pick a ready-made design.</p></div>';
      const rows = els().map((e, i) => ({ e, i })).reverse().map(({ e, i }) => `<li class="fe-layer${S.sel.includes(i) ? ' on' : ''}" data-layer="${i}">
          <span class="fe-grip" aria-hidden="true">${ic('grip')}</span><span class="fe-lt">${layerThumb(e, i)}</span>
          <button type="button" class="fe-lname" data-lsel="${i}">${esc(layerName(e))}</button>
          <button type="button" class="fe-ib sm${e.lock ? ' locked' : ''}" data-llock="${i}" aria-label="${e.lock ? 'Unlock' : 'Lock'} ${esc(layerName(e))}" title="${e.lock ? 'Unlock' : 'Lock'}">${ic(e.lock ? 'lock' : 'unlock')}</button></li>`).join('');
      return `<p class="fe-note">The top of the list is in front. Drag to change the order.</p><ol class="fe-layers">${rows}</ol>`;
    }

    /* ======================================================================
       inspector (right)
       ====================================================================== */
    function fmt(kind, v) {
      v = +v;
      if (kind === 'pct') return Math.round(v * 100) + '%';
      if (kind === 'rad') return Math.round(v * 200) + '%';
      if (kind === 'deg') return Math.round(v) + '°';
      if (kind === 'd1') { const d = Math.round((v - 1) * 100); return (d > 0 ? '+' : '') + d; }
      if (kind === 'n0') return String(Math.round(v));
      if (kind === 'n2') return v.toFixed(2);
      return v.toFixed(1);
    }
    function range(prop, label, val, min, max, step, kind, t = '') {
      return `<label class="fe-range"><span>${label}</span><input type="range" data-p="${prop}" ${t ? `data-t="${t}"` : ''} data-fmt="${kind}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${fmt(kind, val)}</output></label>`;
    }
    function seg(prop, cur, items, t = '', icons = false) {
      return `<div class="fe-seg${icons ? ' icons' : ''}" role="group">${items.map(([v, l, icn]) =>
        `<button type="button" data-set="${prop}" data-v="${esc(v)}" ${t ? `data-t="${t}"` : ''} aria-pressed="${String(cur == null ? '' : cur) === String(v)}" title="${esc(l)}" ${icn ? `aria-label="${esc(l)}"` : ''}>${icn ? ic(icn) : esc(l)}</button>`).join('')}</div>`;
    }
    function colorBtn(prop, value, { label = 'Colour', none = false, t = '' } = {}) {
      const c = resolve(value);
      return `<button type="button" class="fe-color" data-color="${prop}" ${t ? `data-t="${t}"` : ''} data-none="${none ? 1 : 0}" title="${esc(label)}" aria-label="${esc(label)}: ${esc(value || 'none')}">` +
        `<i style="${c ? `background:${c}` : ''}" class="${c ? '' : 'none'}"></i><span>${esc(value === 'accent' ? 'Occasion 2' : value === 'silk' ? 'Occasion' : c ? c.toUpperCase() : 'None')}</span></button>`;
    }
    const sec = (title, body, cls = '') => `<section class="fe-isec${cls ? ' ' + cls : ''}"><h3 class="fe-h3">${title}</h3>${body}</section>`;
    function geoFields(e) {
      const pw = 100 * pagesN();
      const f = (k, label, v) => `<label class="fe-num"><span>${label}</span><input type="number" step="0.1" data-geo="${k}" value="${(Math.round(v * 10) / 10)}"></label>`;
      return `<div class="fe-geo">${f('x', 'X', e.x * pw)}${f('y', 'Y', e.y * 100)}${f('w', 'W', e.w * pw)}${f('h', 'H', e.h * 100)}</div>`;
    }
    function syncGeo() {
      if (S.sel.length !== 1) return;
      const e = els()[S.sel[0]], pw = 100 * pagesN();
      if (!e) return;
      const v = { x: e.x * pw, y: e.y * 100, w: e.w * pw, h: e.h * 100 };
      insp.querySelectorAll('[data-geo]').forEach((n) => { if (n !== document.activeElement) n.value = Math.round(v[n.dataset.geo] * 10) / 10; });
      const r = insp.querySelector('[data-p="rot"]'); if (r) { r.value = e.rot || 0; r.nextElementSibling.textContent = fmt('deg', e.rot || 0); }
    }
    const alignRow = (multi) => `<div class="fe-iconrow">${[['l', 'al', 'Align left'], ['c', 'ac', 'Align centres'], ['r', 'ar', 'Align right'], ['t', 'at', 'Align top'], ['m', 'am', 'Align middles'], ['b', 'ab', 'Align bottom']].map(([k, icn, l]) =>
      `<button type="button" class="fe-ib" data-align="${k}" title="${l}${multi ? '' : ' of the page'}" aria-label="${l}${multi ? '' : ' of the page'}">${ic(icn)}</button>`).join('')}${multi ? `<button type="button" class="fe-ib" data-cmd="disth" title="Space evenly across" aria-label="Space evenly across">${ic('dh')}</button><button type="button" class="fe-ib" data-cmd="distv" title="Space evenly down" aria-label="Space evenly down">${ic('dv')}</button>` : ''}</div>`;
    const arrange = (e) => `<div class="fe-iconrow">
        <button type="button" class="fe-ib" data-cmd="front" title="Bring to front (Shift+])" aria-label="Bring to front">${ic('front')}</button>
        <button type="button" class="fe-ib" data-cmd="fwd" title="Bring forward (])" aria-label="Bring forward">${ic('fwd')}</button>
        <button type="button" class="fe-ib" data-cmd="bwd" title="Send backward ([)" aria-label="Send backward">${ic('bwd')}</button>
        <button type="button" class="fe-ib" data-cmd="back" title="Send to back (Shift+[)" aria-label="Send to back">${ic('back')}</button>
        <button type="button" class="fe-ib" data-cmd="flipx" title="Flip across" aria-label="Flip across" aria-pressed="${!!(e && e.flipX)}">${ic('flipx')}</button>
        <button type="button" class="fe-ib" data-cmd="flipy" title="Flip upside down" aria-label="Flip upside down" aria-pressed="${!!(e && e.flipY)}">${ic('flipy')}</button>
      </div>`;
    const actions = (locked) => `<div class="fe-actions">
        <button type="button" class="btn quiet sm" data-cmd="dup" title="Duplicate (Ctrl+D)">${ic('dup')}Duplicate</button>
        <button type="button" class="btn quiet sm" data-cmd="lock" title="Lock in place">${ic(locked ? 'unlock' : 'lock')}${locked ? 'Unlock' : 'Lock'}</button>
        <button type="button" class="btn quiet sm danger" data-cmd="del" title="Delete (Del)">${ic('trash')}Delete</button></div>`;

    function paintInsp() {
      if (isPhone() && S.panel !== 'props') { if (S.panel) return; }
      const keep = insp.scrollTop;
      const list = selEls();
      let h = '';
      if (!list.length) h = inspPage();
      else if (list.length > 1) {
        const nPh = list.filter((e) => e.type === 'photo').length;
        h = `<header class="fe-ihead"><h2>${list.length} items</h2><button type="button" class="link" data-cmd="deselect">Done</button></header>` +
          (nPh >= 2 ? sec('Photo grid', `<p class="fe-note">Lays the ${nPh} selected photos out as an even grid inside the space they cover now.</p>
            <div class="fe-row2"><label class="fe-field inline"><span>Columns</span><select data-gridcols>${[['', 'Best fit'], ...[1, 2, 3, 4, 5, 6].filter((c) => c <= nPh).map((c) => [String(c), String(c)])].map(([v, l]) => `<option value="${v}" ${String(S.gridCols || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
            <label class="fe-range"><span>Gutter</span><input type="range" data-gridgap min="0" max="6" step="0.1" value="${S.gridGap == null ? 0.8 : S.gridGap}"><output>${(S.gridGap == null ? 0.8 : S.gridGap).toFixed(1)}</output></label>
            <button type="button" class="btn sm" data-cmd="grid">${ic('designs')}Arrange as a grid</button>`) : '') +
          sec('Line up', alignRow(true) + '<p class="fe-note">Lines up the selected items with each other. Spacing needs three or more.</p>') +
          sec('Arrange', arrange() + range('opacity', 'See-through', (list[0].opacity == null ? 1 : list[0].opacity), 0, 1, 0.01, 'pct')) + actions(list.every((e) => e.lock));
      } else {
        const e = list[0], i = S.sel[0];
        h = `<header class="fe-ihead"><h2>${typeName(e)}</h2><button type="button" class="link" data-cmd="deselect">Done</button></header>`;
        if (e.type === 'photo') h += inspPhoto(e, i);
        if (e.type === 'text') h += inspText(e, i);
        if (e.type === 'shape') h += inspShape(e);
        if (e.type === 'art') h += inspArt(e);
        h += sec('Position', alignRow(false) + geoFields(e) + range('rot', 'Rotation', e.rot || 0, -180, 180, 1, 'deg') + range('opacity', 'See-through', e.opacity == null ? 1 : e.opacity, 0, 1, 0.01, 'pct'));
        h += sec('Arrange', arrange(e)) + actions(!!e.lock);
      }
      insp.innerHTML = h;
      insp.scrollTop = keep;
    }
    function inspPage() {
      const b = S.page.bg || {};
      const swatch = b.type === 'color' ? `background:${resolve(b.color)}` : b.type === 'gradient' ? `background:linear-gradient(${b.angle || 180}deg, ${resolve((b.colors || [])[0])}, ${resolve((b.colors || [])[1] || (b.colors || [])[0])})` : '';
      let h = `<header class="fe-ihead"><h2>${tplMode ? 'Design' : mode === 'cover' ? esc(opts.title || 'Cover') : 'Page'}</h2></header>`;
      if (tplMode) {
        const types = M && M.TYPES ? Object.entries(M.TYPES).filter(([k, t]) => t.label) : [];
        h += sec('About this design', `<label class="fe-field"><span>Name</span><input data-meta="name" maxlength="60" value="${esc(S.meta.name)}" placeholder="For example Haldi trio with names"></label>
          <span class="fe-lbl">Used for</span>${seg('meta.kind', S.meta.kind, [['page', 'Album pages'], ['cover', 'Covers']])}
          <span class="fe-lbl">Occasions</span><div class="fe-chips wrap">${types.map(([k, t]) => `<button type="button" class="fe-chip" data-occ="${k}" aria-pressed="${S.meta.occasions.includes(k)}">${esc(t.label)}</button>`).join('')}</div>
          <p class="fe-note">None picked: offered for every occasion.</p>
          <label class="fe-check"><input type="checkbox" data-meta="live" ${S.meta.hidden ? '' : 'checked'}><span>Offer it to studios</span></label>`);
      }
      h += sec('Background', `<button type="button" class="fe-bgsum" data-panel="bg"><span class="fe-bgsw" style="${swatch}">${b.type === 'image' || b.type === 'photo' ? `<img src="${esc(b.type === 'image' ? b.src : (lookup(tplMode ? '__s7' : b.m) || {}).thumb || '')}" alt="">` : ''}</span><span>Change the background</span></button>`);
      if (mode !== 'cover') {
        h += sec('Size', `${seg('spread', S.page.s ? '1' : '', [['', 'One page'], ['1', 'Two pages']])}<p class="fe-note">${S.page.s ? 'The design runs across both pages of an open album. The dashed line is the fold.' : 'Make it two pages to design across the fold.'}</p>`);
      }
      h += sec('On this page', `<p class="fe-note">${els().length} of ${MAX_ELS} items. Click an item to change it; drag across the page to select several.</p>
        <div class="fe-actions"><button type="button" class="btn quiet sm" data-cmd="selall" ${els().length ? '' : 'disabled'}>Select all</button><button type="button" class="btn quiet sm danger" data-cmd="clear" ${els().length ? '' : 'disabled'}>${ic('trash')}Clear page</button></div>`);
      h += `<p class="fe-note fe-tipline">Tip: hold Shift to keep shapes in proportion, Alt while dragging to copy, Ctrl to stop snapping. <button type="button" class="link" data-cmd="help">All shortcuts</button></p>`;
      return h;
    }
    function inspPhoto(e, i) {
      const ph = lookup(tplMode ? '__s' + i : e.m);
      const f = e.filter || {};
      const presetOn = FILTERS.find(([, , v]) => JSON.stringify(v || {}) === JSON.stringify(f));
      const thumb = ph ? ph.thumb || ph.src : '';
      const filterCss = (v) => { if (!v) return ''; const p = []; if (v.brightness) p.push(`brightness(${v.brightness})`); if (v.contrast) p.push(`contrast(${v.contrast})`); if (v.saturate != null) p.push(`saturate(${v.saturate})`); if (v.grayscale) p.push(`grayscale(${v.grayscale})`); if (v.sepia) p.push(`sepia(${v.sepia})`); return 'filter:' + p.join(' '); };
      let h = sec('Photo', `<div class="fe-photohead">${thumb ? `<img src="${esc(thumb)}" alt="">` : `<span class="fe-nophoto">${ic('photos')}</span>`}
          <div class="fe-actions col">${tplMode ? '<p class="fe-note">A spot for one of the album’s photos.</p>' : `<button type="button" class="btn quiet sm" data-cmd="replace">${ic('replace')}${e.m ? 'Replace' : 'Choose a photo'}</button>`}
          ${ph ? `<button type="button" class="btn quiet sm" data-cmd="crop">${ic('crop')}Crop</button>` : ''}</div></div>
        ${e.m ? `<div class="fe-actions"><button type="button" class="btn quiet sm" data-cmd="matchphoto" title="Change the spot to the photo’s own shape, so all of it shows">${ic('fitbox')}Show whole photo</button>${e.c ? `<button type="button" class="btn quiet sm" data-cmd="resetcrop">${ic('fit')}Fill the spot</button>` : ''}</div>` : ''}`);
      h += sec('Fade the edge', `<select class="fe-select" data-p="fade.side" data-t="photo" aria-label="Which edge fades">${FADES.map(([v, l]) => `<option value="${v}" ${((e.fade || {}).side || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${e.fade && e.fade.side ? range('fade.size', 'How far it fades', e.fade.size || 0.3, 0.05, 0.9, 0.01, 'pct', 'photo') : '<p class="fe-note">Melts the photo into the background, like a hero photo running off the page.</p>'}`);
      h += sec('Shape', `<div class="fe-shapegrid mini">${PT().SHAPES.filter((s) => s !== 'line').map((s) => `<button type="button" class="fe-shapebtn${(e.shape || 'rect') === s ? ' on' : ''}" data-set="shape" data-v="${s}" data-t="photo" title="${SHAPE_NAMES[s]}" aria-label="${SHAPE_NAMES[s]}" aria-pressed="${(e.shape || 'rect') === s}"><span class="fe-sh" style="${PT().shapeCss(s, 0.12)}"></span></button>`).join('')}</div>
        ${e.shape === 'rounded' ? range('radius', 'Corner', e.radius == null ? 0.08 : e.radius, 0, 0.5, 0.01, 'rad', 'photo') : ''}`);
      h += sec('Frame', `${seg('frame', e.frame || '', [['', 'None'], ['polaroid', 'Print'], ['mat', 'Mat']], 'photo')}
        ${range('border.w', 'Border', (e.border && e.border.w) || 0, 0, 5, 0.1, 'n1', 'photo')}
        ${e.border && e.border.w ? `<div class="fe-row"><span class="fe-lbl">Border colour</span>${colorBtn('border.color', e.border.color || '#ffffff', { label: 'Border colour', t: 'photo' })}</div>` : ''}
        <span class="fe-lbl">Shadow</span>${seg('shadow', e.shadow || '', [['', 'None'], ['soft', 'Soft'], ['strong', 'Deep'], ['glow', 'Glow']], 'photo')}`);
      h += sec('Look', `<div class="fe-filters">${FILTERS.map(([k, l, v]) => `<button type="button" class="fe-filter${presetOn && presetOn[0] === k ? ' on' : ''}" data-filter="${k}" title="${l}">${thumb ? `<img src="${esc(thumb)}" alt="" style="${filterCss(v)}">` : '<span></span>'}<small>${l}</small></button>`).join('')}</div>
        <details class="fe-adjust" ${Object.keys(f).length && !presetOn ? 'open' : ''}><summary>Adjust</summary>${ADJUST.map(([k, l, lo, hi, def]) => range('filter.' + k, l, f[k] == null ? def : f[k], lo, hi, 0.01, k === 'grayscale' || k === 'sepia' ? 'pct' : k === 'blur' ? 'n2' : 'd1', 'photo')).join('')}
        <button type="button" class="link" data-filter="original">Reset the look</button></details>`);
      return h;
    }
    function inspText(e, i) {
      const auto = AUTO_ROLES.includes(e.role) ? (PT().autoText(e.role, VA) || (e.role === 'section' ? opts.section || '' : '')) : '';
      const fontName = (PT().FONT_NAMES || {})[e.font] || e.font || 'Rozha One';
      let h = sec('Words', `<label class="fe-field"><textarea data-p="text" data-t="text" rows="3" maxlength="500" placeholder="${esc(auto ? auto + ' (from the album details)' : 'Type here')}">${esc(e.text || '')}</textarea></label>
        <label class="fe-field"><span>Fills in</span><select data-p="role" data-t="text">${ROLES.map(([k, l]) => `<option value="${k}" ${(e.role || 'free') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${AUTO_ROLES.includes(e.role) ? `<p class="fe-note">${tplMode ? 'Each album shows its own ' + (ROLES.find((r) => r[0] === e.role) || ['', 'details'])[1].toLowerCase() + ' here.' : 'Left empty, it shows ' + (auto ? '“' + esc(auto) + '”' : 'the album details') + ' and follows any change to them.'}</p>` : ''}
        <p class="fe-note">Double-click the words on the page to type there.</p>`);
      h += sec('Font', `<button type="button" class="fe-fontbtn" data-cmd="fonts" aria-haspopup="listbox" style="font-family:${esc(PT().FONTS[e.font] || PT().FONTS.display)}">${esc(fontName)}${ic('chev')}</button>
        ${range('size', 'Size', e.size || 5, 0.5, 40, 0.1, 'n1', 'text')}
        <div class="fe-row"><span class="fe-lbl">Colour</span>${colorBtn('color', e.color || '#2A2530', { label: 'Text colour', t: 'text' })}</div>
        <div class="fe-row2">${seg('align', e.align || 'center', [['left', 'Align left', 'tl'], ['center', 'Centre', 'tc'], ['right', 'Align right', 'tr']], 'text', true)}${seg('valign', e.valign || '', [['top', 'Top', 'vt'], ['', 'Middle', 'vm'], ['bottom', 'Bottom', 'vb']], 'text', true)}</div>
        <div class="fe-row2"><label class="fe-field inline"><span>Weight</span><select data-p="weight" data-t="text">${[['', 'Usual'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold'], ['800', 'Heavy']].map(([v, l]) => `<option value="${v}" ${String(e.weight || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button type="button" class="fe-ib tog" data-tog="italic" data-t="text" aria-pressed="${!!e.italic}" title="Italic" aria-label="Italic">${ic('italic')}</button>
          <button type="button" class="fe-ib tog" data-tog="upper" data-t="text" aria-pressed="${!!e.upper}" title="Capital letters" aria-label="Capital letters">${ic('upper')}</button></div>
        ${range('spacing', 'Letter spacing', e.spacing || 0, -0.1, 1, 0.01, 'n2', 'text')}
        ${range('line', 'Line height', e.line || 1.15, 0.7, 3, 0.05, 'n2', 'text')}`);
      h += sec('Effects', `<span class="fe-lbl">Shadow</span>${seg('shadow', e.shadow || '', [['', 'None'], ['soft', 'Soft'], ['strong', 'Deep'], ['glow', 'Glow']], 'text')}
        <div class="fe-row"><span class="fe-lbl">Band behind the words</span>${colorBtn('bg', e.bg || '', { label: 'Band colour', none: true, t: 'text' })}</div>
        <button type="button" class="btn quiet sm" data-cmd="fittext">${ic('fitbox')}Fit the box to the words</button>`);
      return h;
    }
    function inspShape(e) {
      if (e.shape === 'line') {
        return sec('Line', `<div class="fe-row"><span class="fe-lbl">Colour</span>${colorBtn('stroke', e.stroke || e.fill || '#000000', { label: 'Line colour', t: 'shape' })}</div>
          ${range('strokeW', 'Thickness', e.strokeW || 0.3, 0.05, 10, 0.05, 'n2', 'shape')}`);
      }
      return sec('Shape', `<div class="fe-shapegrid mini">${PT().SHAPES.filter((s) => s !== 'line').map((s) => `<button type="button" class="fe-shapebtn${e.shape === s ? ' on' : ''}" data-set="shape" data-v="${s}" data-t="shape" title="${SHAPE_NAMES[s]}" aria-label="${SHAPE_NAMES[s]}" aria-pressed="${e.shape === s}"><span class="fe-sh fill" style="${PT().shapeCss(s, 0.12)}"></span></button>`).join('')}</div>
        ${e.shape === 'rounded' ? range('radius', 'Corner', e.radius == null ? 0.08 : e.radius, 0, 0.5, 0.01, 'rad', 'shape') : ''}`) +
        sec('Colour', `<div class="fe-row"><span class="fe-lbl">Fill</span>${colorBtn('fill', e.fill || '', { label: 'Fill colour', none: true, t: 'shape' })}</div>
          <div class="fe-row"><span class="fe-lbl">Outline</span>${colorBtn('stroke', e.stroke || '', { label: 'Outline colour', none: true, t: 'shape' })}</div>
          ${e.stroke ? range('strokeW', 'Outline width', e.strokeW || 0.3, 0, 10, 0.05, 'n2', 'shape') : ''}
          ${['hexagon', 'diamond', 'triangle', 'octagon', 'star', 'slant', 'heart', 'blob', 'scallop', 'flower'].includes(e.shape) && e.stroke ? '<p class="fe-note">Outlines show on rectangles, rounded shapes, circles and arches.</p>' : ''}`);
    }
    function inspArt(e) {
      const a = S.lib && S.lib.art.find((x) => x.src === e.src);
      return sec('Ornament', `<div class="fe-photohead"><span class="fe-artprev">${layerThumb(e)}</span><div class="fe-actions col"><b>${esc((a && a.name) || 'Ornament')}</b><button type="button" class="btn quiet sm" data-cmd="swapart">${ic('replace')}Swap</button></div></div>
        <div class="fe-row"><span class="fe-lbl">Colour</span>${colorBtn('tint', e.tint || '', { label: 'Ornament colour', none: true, t: 'art' })}</div>
        <p class="fe-note">${e.tint ? 'Drawn in one colour. Choose None for its own colours.' : 'In its own colours. Pick a colour to draw it in one colour (best for line ornaments).'}</p>`);
    }

    /* ---------- setting values ---------- */
    function getPath(o, path) { return path.split('.').reduce((v, k) => (v == null ? v : v[k]), o); }
    function setPath(o, path, v) {
      const ks = path.split('.'), last = ks.pop();
      let t = o;
      ks.forEach((k) => { if (t[k] == null || typeof t[k] !== 'object') t[k] = /^\d+$/.test(k) ? [] : {}; t = t[k]; });
      if (v === undefined || v === '' || v === null) { if (Array.isArray(t)) t[last] = v; else delete t[last]; } else t[last] = v;
    }
    function tidy(e) {
      if (e.fade) { if (!e.fade.side) delete e.fade; else e.fade.size = clamp(+e.fade.size || 0.3, 0.05, 0.9); }
      if (e.border) { if (!e.border.w) delete e.border; else if (!e.border.color) e.border.color = '#ffffff'; }
      if (e.filter) {
        const def = { brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0, blur: 0 };
        Object.keys(e.filter).forEach((k) => { if (Math.abs(e.filter[k] - def[k]) < 0.005) delete e.filter[k]; });
        if (!Object.keys(e.filter).length) delete e.filter;
      }
      if (e.opacity != null && e.opacity >= 1) delete e.opacity;
      if (e.rot === 0) delete e.rot;
      ['spacing', 'weight', 'valign', 'shadow', 'frame', 'bg', 'tint', 'fill', 'stroke'].forEach((k) => { if (e[k] === '' || e[k] === 0 && k !== 'spacing') delete e[k]; });
      if (e.spacing === 0) delete e.spacing;
      if (e.type === 'text' && e.role === 'free') delete e.role;
    }
    function setProp(prop, value, { final = false, t = '' } = {}) {
      if (prop.startsWith('bg.')) {
        const b = S.page.bg;
        setPath(S.page, prop, value);
        if (b.type !== 'gradient') { delete b.angle; }
        if (prop === 'bg.radial' && !value) delete b.radial;
        if (b.blur === 0) delete b.blur;
        if (b.dim === 0) { delete b.dim; }
        render();
        if (final) { commit('bg:' + prop); if (prop === 'bg.dim' || prop === 'bg.radial') paintDrawer(); }
        return;
      }
      if (prop.startsWith('meta.')) { S.meta[prop.slice(5)] = value; if (final) { commit(); paintInsp(); } return; }
      const idx = S.sel.filter((i) => !t || els()[i].type === t);
      idx.forEach((i) => {
        const e = els()[i];
        if (prop === 'rot') { let r = +value; if (r > 180) r -= 360; e.rot = r; }
        else setPath(e, prop, value);
        if (prop === 'filter.' + (prop.split('.')[1] || '') && !e.filter) e.filter = {};
        tidy(e);
      });
      render(idx);
      if (prop.startsWith('fade.')) idx.forEach((i) => { const n = paper.querySelector(`[data-el="${i}"]`), e = els()[i]; if (n) { n.style.maskImage = ''; n.style.webkitMaskImage = ''; n.style.cssText += fadeCss(e.fade); } });
      paintOverlay(); paintHud();
      if (final) commit('p:' + prop);
    }
    function applyFilter(key) {
      const f = FILTERS.find((x) => x[0] === key);
      if (!f) return;
      S.sel.forEach((i) => { const e = els()[i]; if (e.type !== 'photo') return; if (f[2]) e.filter = clone(f[2]); else delete e.filter; });
      render(S.sel); commit(); paintInsp();
    }

    /* ---------- popovers: colours, fonts, zoom, the right-click menu ---------- */
    const POPOVER = typeof HTMLElement.prototype.showPopover === 'function';
    function closePop() { root.querySelectorAll('.fe-pop').forEach((p) => { if (p.tagName === 'DIALOG' && p.open) p.close(); p.remove(); }); S.popFor = null; }
    function placePop(pop, anchor, at) {
      root.appendChild(pop);
      if (POPOVER) { pop.popover = 'manual'; pop.showPopover(); }
      const rr = POPOVER ? { left: 0, top: 0 } : root.getBoundingClientRect(), pr = pop.getBoundingClientRect();
      let x, y;
      if (at) { x = at.x; y = at.y; } else { const r = anchor.getBoundingClientRect(); x = r.left; y = r.bottom + 6; if (y + pr.height > innerHeight - 10) y = Math.max(10, r.top - pr.height - 6); }
      x = clamp(x, 10, innerWidth - pr.width - 10); y = clamp(y, 10, innerHeight - pr.height - 10);
      pop.style.left = (x - rr.left) + 'px'; pop.style.top = (y - rr.top) + 'px';
    }
    function colorPop(anchor) {
      closePop();
      const prop = anchor.dataset.color, t = anchor.dataset.t || '', none = anchor.dataset.none === '1';
      const isBg = prop.startsWith('bg.'), isTint = prop === 'arttint';
      const cur = isTint ? S.artTint : isBg ? getPath(S.page, prop) : (selEls().find((e) => !t || e.type === t) ? getPath(selEls().find((e) => !t || e.type === t), prop) : '');
      const curHex = resolve(cur) || '#ffffff';
      const alphaOk = !isTint && prop !== 'bg.colors.0' && prop !== 'bg.colors.1';
      const alpha = COLOR_RE.test(cur || '') && cur.length === 9 ? parseInt(cur.slice(7), 16) / 255 : 1;
      const pop = document.createElement('div');
      pop.className = 'fe-pop fe-cpop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', anchor.getAttribute('title') || 'Colour');
      const sw = (c, l) => `<button type="button" class="fe-sw" data-pick="${c}" title="${esc(l || c)}" style="background:${resolve(c)}" aria-pressed="${String(cur).toLowerCase() === String(c).toLowerCase()}"></button>`;
      const rec = recent();
      pop.innerHTML = `<p class="fe-lbl">Occasion colours</p><div class="fe-swatches">${sw('silk', 'Occasion colour, follows the album')}${sw('accent', 'Occasion second colour, follows the album')}${none ? `<button type="button" class="fe-sw none" data-pick="" title="None" aria-label="None"></button>` : ''}</div>
        <p class="fe-lbl">Colours</p><div class="fe-swatches">${SWATCHES.map((c) => sw(c)).join('')}</div>
        ${rec.length ? `<p class="fe-lbl">Recent</p><div class="fe-swatches">${rec.map((c) => sw(c)).join('')}</div>` : ''}
        <div class="fe-custom"><input type="color" value="${curHex.slice(0, 7)}" aria-label="Any colour"><input type="text" class="fe-hex" value="${esc((COLOR_RE.test(cur || '') ? cur : curHex).toUpperCase())}" maxlength="9" aria-label="Colour code" spellcheck="false"></div>
        ${alphaOk ? `<label class="fe-range"><span>Strength</span><input type="range" class="fe-alpha" min="0.05" max="1" step="0.01" value="${alpha}"><output>${Math.round(alpha * 100)}%</output></label>` : ''}`;
      placePop(pop, anchor);
      S.popFor = anchor;
      const apply = (val, final) => {
        if (isTint) { S.artTint = val || '#C9A227'; if (final) { paintDrawer(); } return; }
        if (prop === 'bg.color' || prop.startsWith('bg.')) { setProp(prop, val || undefined, { final }); if (final) paintDrawer(); }
        else setProp(prop, val, { final, t });
        if (final) { remember(val); paintInsp(); }
      };
      const withAlpha = (hex) => { const a = pop.querySelector('.fe-alpha'); const v = a ? +a.value : 1; return v >= 0.995 ? hex.slice(0, 7) : hex.slice(0, 7) + Math.round(v * 255).toString(16).padStart(2, '0'); };
      pop.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-pick]');
        if (!b) return;
        const v = b.dataset.pick;
        apply(v && v.startsWith('#') ? withAlpha(v) : v, true);
        closePop();
        if (anchor.isConnected) anchor.focus();
      });
      const picker = pop.querySelector('input[type=color]'), hex = pop.querySelector('.fe-hex'), al = pop.querySelector('.fe-alpha');
      picker.addEventListener('input', () => { hex.value = withAlpha(picker.value).toUpperCase(); apply(withAlpha(picker.value), false); });
      picker.addEventListener('change', () => apply(withAlpha(picker.value), true));
      hex.addEventListener('change', () => { let v = hex.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map((c) => c + c).join(''); if (COLOR_RE.test(v)) { picker.value = v.slice(0, 7); apply(v, true); } else hex.value = curHex.toUpperCase(); });
      if (al) {
        al.addEventListener('input', () => { al.nextElementSibling.textContent = Math.round(al.value * 100) + '%'; const base = COLOR_RE.test(hex.value) ? hex.value : picker.value; apply(withAlpha(base), false); });
        al.addEventListener('change', () => { const base = COLOR_RE.test(hex.value) ? hex.value : picker.value; hex.value = withAlpha(base).toUpperCase(); apply(withAlpha(base), true); });
      }
      const first = pop.querySelector('[aria-pressed="true"]') || pop.querySelector('button');
      if (first) first.focus();
    }
    function fontPop(anchor) {
      closePop();
      const e = selEls().find((x) => x.type === 'text');
      if (!e) return;
      const libFonts = (S.lib && S.lib.fonts) || [];
      const keys = Object.keys(PT().FONTS);
      const info = (k) => { const f = libFonts.find((x) => x.key === k) || {}; return { cat: (f.category ? f.category[0].toUpperCase() + f.category.slice(1) : '') || FONT_CAT[k] || 'Serif', deva: f.devanagari != null ? !!f.devanagari : !!FONT_DEVA[k], sample: f.sample || '' }; };
      const names = PT().autoText('names', VA) || 'Aarav & Diya';
      const cats = [...new Set([...CAT_ORDER, ...keys.map((k) => info(k).cat)])];
      const pop = document.createElement('div');
      pop.className = 'fe-pop fe-fpop';
      pop.setAttribute('role', 'listbox');
      pop.setAttribute('aria-label', 'Fonts');
      pop.innerHTML = cats.map((c) => {
        const ks = keys.filter((k) => info(k).cat === c);
        if (!ks.length) return '';
        return `<p class="fe-lbl">${esc(c)}</p>` + ks.map((k) => { const inf = info(k); return `<button type="button" role="option" class="fe-font${e.font === k ? ' on' : ''}" data-font="${k}" aria-selected="${e.font === k}">
          <span style="font-family:${esc(PT().FONTS[k])}">${esc(inf.sample || names)}</span><small>${esc(PT().FONT_NAMES[k] || k)}${inf.deva ? ` <em style="font-family:${esc(PT().FONTS[k])}">हिन्दी</em>` : ''}</small></button>`; }).join('');
      }).join('');
      placePop(pop, anchor);
      pop.addEventListener('click', (ev) => { const b = ev.target.closest('[data-font]'); if (!b) return; setProp('font', b.dataset.font, { final: true, t: 'text' }); closePop(); paintInsp(); });
      pop.addEventListener('mouseover', (ev) => { const b = ev.target.closest('[data-font]'); if (b) setProp('font', b.dataset.font, { t: 'text' }); });
      pop.addEventListener('mouseleave', () => { setProp('font', e.font, { t: 'text' }); });
      const was = e.font;
      S.popRestore = () => { if (selEls().find((x) => x.type === 'text')) setProp('font', was, { t: 'text' }); };
      (pop.querySelector('.on') || pop.querySelector('button')).focus();
      (pop.querySelector('.on') || pop.querySelector('button')).scrollIntoView({ block: 'center' });
    }
    function zoomPop(anchor) {
      closePop();
      const pop = document.createElement('div');
      pop.className = 'fe-pop fe-menu';
      pop.setAttribute('role', 'menu');
      pop.innerHTML = [['zoomfit', 'Fit to screen', 'Ctrl+0'], ['zoom100', '100%', 'Ctrl+1'], ['zoom200', '200%', ''], ['zoom50', '50%', '']].map(([c, l, k]) =>
        `<button type="button" role="menuitem" data-cmd="${c}">${l}<kbd>${k}</kbd></button>`).join('');
      placePop(pop, anchor);
      pop.querySelector('button').focus();
    }
    function contextMenu(ev) {
      closePop();
      const has = S.sel.length > 0;
      const items = has ? [['copy', 'Copy', 'Ctrl+C'], ['paste', 'Paste', 'Ctrl+V'], ['dup', 'Duplicate', 'Ctrl+D'], ['-'], ['front', 'Bring to front', 'Shift+]'], ['fwd', 'Bring forward', ']'],
        ['bwd', 'Send backward', '['], ['back', 'Send to back', 'Shift+['], ['-'], ['lock', selEls().every((e) => e.lock) ? 'Unlock' : 'Lock', ''], ['del', 'Delete', 'Del']]
        : [['paste', 'Paste', 'Ctrl+V'], ['selall', 'Select all', 'Ctrl+A'], ['-'], ['openbg', 'Change the background', '']];
      const pop = document.createElement('div');
      pop.className = 'fe-pop fe-menu';
      pop.setAttribute('role', 'menu');
      pop.innerHTML = items.map(([c, l, k]) => (c === '-' ? '<hr>' : `<button type="button" role="menuitem" data-cmd="${c}" ${c === 'paste' && !CLIP ? 'disabled' : ''}>${l}<kbd>${k || ''}</kbd></button>`)).join('');
      placePop(pop, null, { x: ev.clientX, y: ev.clientY });
    }
    function help() {
      closePop();
      const rows = [['Ctrl+Z', 'Undo'], ['Shift+Ctrl+Z or Ctrl+Y', 'Redo'], ['Ctrl+C, Ctrl+V', 'Copy and paste (also between pages)'], ['Ctrl+D', 'Duplicate'], ['Delete', 'Delete the selection'],
        ['Arrow keys', 'Nudge (Shift: further)'], ['Shift+click', 'Select several'], ['Drag across the page', 'Select everything it touches'], ['Ctrl+A', 'Select all'], ['Esc', 'Deselect, or close the editor'],
        ['] and [', 'Bring forward, send backward (Shift: all the way)'], ['Shift while resizing', 'Keep the proportions'], ['Shift while rotating', 'Turn in 15° steps'], ['Alt while dragging', 'Drag a copy'],
        ['Ctrl while dragging', 'No snapping'], ['Double-click words', 'Type on the page'], ['Double-click a photo', 'Crop it'], ['Enter', 'Type in the selected words'],
        ['Ctrl + mouse wheel', 'Zoom'], ['Ctrl+0, Ctrl+1', 'Fit, 100%'], ['Space + drag', 'Move around the page'], ['G, R', 'Margins and fold, rulers'], ['Ctrl+S', 'Save']];
      const pop = document.createElement('dialog');
      pop.className = 'fe-pop fe-help';
      pop.setAttribute('aria-labelledby', 'fe-help-title');
      pop.setAttribute('closedby', 'any');
      pop.addEventListener('close', () => { pop.remove(); });
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        // click outside closes it where closedby is not supported; the press and the release must both be outside
        const outside = (e) => { const r = pop.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
        let pressedOutside = false;
        pop.addEventListener('pointerdown', (e) => { pressedOutside = outside(e); });
        pop.addEventListener('pointerup', (e) => { if (pressedOutside && outside(e)) pop.close(); });
      }
      pop.innerHTML = `<header><h2 id="fe-help-title">Keyboard shortcuts</h2><button type="button" class="fe-ib sm" data-cmd="closepop" aria-label="Close" autofocus>${ic('close')}</button></header>
        <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="fe-note">On a Mac, use Cmd instead of Ctrl. Drag from a ruler to add a guide line; drag it off the page to remove it.</p>`;
      root.appendChild(pop);
      if (pop.showModal) pop.showModal();
      pop.querySelector('button').focus();
    }

    /* ======================================================================
       commands
       ====================================================================== */
    function cmd(c, el) {
      const one = S.sel.length === 1 ? S.sel[0] : -1;
      switch (c) {
        case 'close': requestClose(); break;
        case 'save': save(); break;
        case 'undo': travel(-1); break;
        case 'redo': travel(1); break;
        case 'zoomin': zoomStep(1); break;
        case 'zoomout': zoomStep(-1); break;
        case 'zoommenu': zoomPop(el); return;
        case 'zoomfit': zoomFit(); break;
        case 'zoom100': setZoom(ZOOM_100); break;
        case 'zoom200': setZoom(ZOOM_100 * 2); break;
        case 'zoom50': setZoom(ZOOM_100 / 2); break;
        case 'guides': S.guidesOn = !S.guidesOn; paintOverlay(); paintTop(); break;
        case 'rulers': S.rulersOn = !S.rulersOn; paintRail(); requestAnimationFrame(layout); break;
        case 'help': help(); return;
        case 'closepop': closePop(); break;
        case 'closepanel': S.panel = null; paintRail(); requestAnimationFrame(layout); break;
        case 'deselect': select([]); break;
        case 'selall': select(els().map((_, i) => i), { keepPanel: true }); break;
        case 'clear': clearPage(); break;
        case 'copy': copySel(); break;
        case 'cut': copySel(); removeSel(); break;
        case 'paste': paste(); break;
        case 'dup': duplicateSel(); break;
        case 'del': removeSel(); break;
        case 'lock': toggleLock(); break;
        case 'front': case 'back': case 'fwd': case 'bwd': restack(c); break;
        case 'flipx': flip('x'); paintInsp(); break;
        case 'flipy': flip('y'); paintInsp(); break;
        case 'disth': distribute('h'); break;
        case 'grid': if (S.gridGap == null) S.gridGap = 0.8; gridSel(); break;
        case 'distv': distribute('v'); break;
        case 'crop': if (one >= 0) cropPhoto(one); break;
        case 'replace': if (one >= 0) { S.replacing = one; S.panel = 'photos'; paintRail(); paintDrawer(); requestAnimationFrame(layout); } break;
        case 'cancelreplace': S.replacing = -1; paintDrawer(); break;
        case 'matchphoto': if (one >= 0) matchPhoto(one); break;
        case 'resetcrop': if (one >= 0) { delete els()[one].c; render([one]); commit(); paintInsp(); } break;
        case 'fittext': if (one >= 0) fitTextBox(one); break;
        case 'fonts': fontPop(el); return;
        case 'swapart': if (one >= 0) { S.swapping = one; S.panel = 'art'; paintRail(); paintDrawer(); requestAnimationFrame(layout); } break;
        case 'cancelswap': S.swapping = -1; paintDrawer(); break;
        case 'cropbg': cropBg(); break;
        case 'bgphotos': S.bgPick = !S.bgPick; if (S.panel !== 'bg') { S.panel = 'bg'; paintRail(); } paintDrawer(); break;
        case 'bgspot': setBg({ type: 'photo', m: null, dim: 0.3, dimColor: '#000000' }); break;
        case 'openbg': S.panel = 'bg'; paintRail(); paintDrawer(); requestAnimationFrame(layout); break;
        case 'swapgrad': { const b = S.page.bg; if (b.colors) { b.colors = [b.colors[1] || b.colors[0], b.colors[0]]; setBg(b); } break; }
        default: return;
      }
      if (!['zoommenu', 'fonts', 'help'].includes(c)) closePop();
    }

    /* ---------- events: clicks ---------- */
    root.addEventListener('click', (ev) => {
      const t = ev.target;
      if (S.suppressClick) { S.suppressClick = false; return; }
      if (!t.closest('.fe-pop') && !t.closest('[data-color], [data-cmd="fonts"], [data-cmd="zoommenu"]')) { if (S.popRestore && root.querySelector('.fe-fpop')) S.popRestore(); S.popRestore = null; closePop(); }
      const c = t.closest('[data-cmd]');
      if (c && !c.disabled) { cmd(c.dataset.cmd, c); return; }
      const pb = t.closest('[data-panel]');
      if (pb) { if (pb.classList.contains('fe-bgsum')) { S.panel = 'bg'; paintRail(); paintDrawer(); requestAnimationFrame(layout); } else openPanel(pb.dataset.panel); return; }
      const col = t.closest('[data-color]');
      if (col) { if (S.popFor === col) closePop(); else colorPop(col); return; }
      // panels
      const d = t.closest('[data-design]');
      if (d) { const [src, key] = d.dataset.design.split(/:(.*)/); applyDesign((S.designs || []).find((x) => x.source === src && x.key === key)); return; }
      const dk = t.closest('[data-dkind]'); if (dk) { S.designKind = dk.dataset.dkind; paintDrawer(); return; }
      const docc = t.closest('[data-docc]'); if (docc) { S.designOcc = docc.dataset.docc; paintDrawer(); return; }
      const dtag = t.closest('[data-dtag]'); if (dtag) { S.designTag = dtag.dataset.dtag; paintDrawer(); return; }
      const pf = t.closest('[data-pfilter]'); if (pf) { S.photoFilter = pf.dataset.pfilter; paintDrawer(); return; }
      const ph = t.closest('[data-ph]'); if (ph) { fillEmptyOrAdd(ph.dataset.ph); return; }
      const spot = t.closest('[data-spot]'); if (spot) { addSpot(spot.dataset.spot); return; }
      const tx = t.closest('[data-text]'); if (tx) { addText(tx.dataset.text); return; }
      const sh = t.closest('[data-shape]'); if (sh) { addShape(sh.dataset.shape); return; }
      const qk = t.closest('[data-quick]'); if (qk) { addQuick(qk.dataset.quick); return; }
      const ac = t.closest('[data-acat]'); if (ac) { S.artCat = ac.dataset.acat; paintDrawer(); return; }
      const ar = t.closest('[data-art]'); if (ar) { const a = S.lib && S.lib.art.find((x) => (x.key || x.src) === ar.dataset.art); if (a) addArt(a); return; }
      const as = t.closest('[data-artsrc]'); if (as) { addArt({ src: as.dataset.artsrc }); return; }
      const bc = t.closest('[data-bgcolor]'); if (bc) { setBg({ type: 'color', color: bc.dataset.bgcolor }); return; }
      const gr = t.closest('[data-grad]'); if (gr) { const g = GRADS[+gr.dataset.grad]; const bg = { type: 'gradient', colors: [g[0], g[1]], angle: g[2] }; if (g[3]) bg.radial = true; setBg(bg); return; }
      const bi = t.closest('[data-bgimg]'); if (bi) { const b = S.page.bg || {}; setBg({ type: 'image', src: bi.dataset.bgimg, ...(b.dim && (b.type === 'image' || b.type === 'photo') ? { dim: b.dim, dimColor: b.dimColor } : {}) }); return; }
      const pa = t.closest('[data-pattern]'); if (pa) { const p = S.lib.patterns.find((x) => x.src === pa.dataset.pattern) || {}; const b = S.page.bg || {}; setBg({ type: 'image', src: pa.dataset.pattern, repeat: true, scale: clamp(+p.scale || 20, 2, 100), color: b.type === 'color' ? b.color : b.type === 'image' && b.color ? b.color : '#F7F3EE' }); return; }
      const bp = t.closest('[data-bgphoto]'); if (bp) { const b = S.page.bg || {}; setBg({ type: 'photo', m: bp.dataset.bgphoto, blur: b.type === 'photo' ? b.blur || 0 : 0.6, dim: b.type === 'photo' ? b.dim || 0 : 0.3, dimColor: (b.type === 'photo' && b.dimColor) || '#000000' }); return; }
      const tone = t.closest('[data-tone]'); if (tone) { S.bgTone = tone.dataset.tone; paintDrawer(); return; }
      const ls = t.closest('[data-lsel]'); if (ls) { const i = +ls.dataset.lsel; if (ev.shiftKey) select(S.sel.includes(i) ? S.sel.filter((k) => k !== i) : [...S.sel, i], { keepPanel: true }); else select([i], { keepPanel: true }); return; }
      const ll = t.closest('[data-llock]'); if (ll) { const e = els()[+ll.dataset.llock]; if (e) { if (e.lock) delete e.lock; else e.lock = true; render(); commit(); paintOverlay(); paintInsp(); } return; }
      // inspector
      const st = t.closest('[data-set]');
      if (st) {
        const p = st.dataset.set, v = st.dataset.v;
        if (p === 'spread') { setSpread(v === '1'); return; }
        if (p === 'meta.kind') { S.meta.kind = v; if (v === 'cover' && S.page.s) setSpread(false); commit(); paintInsp(); if (S.panel === 'designs') paintDrawer(); return; }
        if (p.startsWith('bg.')) { setProp(p, v === '1' ? true : v || undefined, { final: true }); paintDrawer(); return; }
        setProp(p, v, { final: true, t: st.dataset.t || '' });
        if (p === 'shape' && v === 'rounded') S.sel.forEach((i) => { const e = els()[i]; if (e.radius == null) e.radius = 0.08; });
        paintInsp();
        return;
      }
      const tg = t.closest('[data-tog]');
      if (tg) { const k = tg.dataset.tog; const on = !selEls().filter((e) => e.type === 'text').every((e) => e[k]); setProp(k, on ? true : undefined, { final: true, t: 'text' }); paintInsp(); return; }
      const al = t.closest('[data-align]'); if (al) { align(al.dataset.align); return; }
      const fl = t.closest('[data-filter]'); if (fl) { applyFilter(fl.dataset.filter); return; }
      const oc = t.closest('[data-occ]');
      if (oc) { const k = oc.dataset.occ; S.meta.occasions = S.meta.occasions.includes(k) ? S.meta.occasions.filter((x) => x !== k) : [...S.meta.occasions, k].slice(0, 12); commit(); paintInsp(); if (S.panel === 'designs') paintDrawer(); return; }
    });

    /* ---------- events: inputs ---------- */
    let raf = 0;
    root.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.dataset.q === 'design') { S.designQuery = t.value; paintDesignGrid(); return; }
      if (t.dataset.q === 'art') { S.artQuery = t.value; paintArtGrid(); return; }
      if (t.dataset.meta === 'name') { S.meta.name = t.value; paintTop(); return; }
      if (t.matches('[data-gridgap]')) { S.gridGap = +t.value; t.nextElementSibling.textContent = (+t.value).toFixed(1); return; }
      if (t.dataset.p) {
        const out = t.nextElementSibling;
        if (out && out.tagName === 'OUTPUT') out.textContent = fmt(t.dataset.fmt, t.value);
        const v = t.type === 'range' ? +t.value : t.value;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => setProp(t.dataset.p, v, { t: t.dataset.t || '' }));
      }
    });
    root.addEventListener('change', async (ev) => {
      const t = ev.target;
      if (t.dataset.meta === 'name') { commit(); return; }
      if (t.dataset.meta === 'live') { S.meta.hidden = !t.checked; commit(); return; }
      if (t.matches('[data-gridcols]')) { S.gridCols = +t.value || 0; return; }
      if (t.dataset.p) {
        cancelAnimationFrame(raf);
        const v = t.type === 'range' ? +t.value : t.value;
        setProp(t.dataset.p, t.dataset.p === 'weight' ? (v ? +v : undefined) : v, { final: true, t: t.dataset.t || '' });
        if (['role', 'weight', 'border.w', 'bg.dim', 'radius', 'fade.side'].includes(t.dataset.p)) paintInsp();
        if (t.dataset.p.startsWith('bg.')) paintInsp();
        return;
      }
      if (t.dataset.geo) {
        const e = els()[S.sel[0]];
        if (!e) return;
        const pw = 100 * pagesN(), k = t.dataset.geo, v = +t.value;
        if (!Number.isFinite(v)) return;
        if (k === 'x') e.x = r4(clamp(v / pw, -1, 2)); if (k === 'y') e.y = r4(clamp(v / 100, -1, 2));
        if (k === 'w') e.w = r4(clamp(v / pw, 0.002, 3)); if (k === 'h') e.h = r4(clamp(v / 100, 0.002, 3));
        placeEl(S.sel[0]); commit(); paintOverlay(); paintHud();
        return;
      }
      if (t.dataset.upload && t.files && t.files[0]) {
        const label = t.closest('label'); if (label) label.classList.add('busy');
        try {
          const url = await uploadImage(t.files[0], { png: t.dataset.upload === 'art' });
          if (t.dataset.upload === 'bg') { setBg({ type: 'image', src: url }); toast('Background uploaded'); }
          else { await addArt({ src: url }); paintDrawer(); toast('Ornament uploaded'); }
        } catch (err) { toast('The upload did not work: ' + err.message); }
        if (label && label.isConnected) label.classList.remove('busy');
      }
    });

    /* ---------- pointer: select, move, resize, rotate, marquee, guides, pan ---------- */
    stage.addEventListener('contextmenu', (ev) => {
      const n = ev.target.closest('.fe-paper [data-el]') ? hitEl(ev) : null;
      if (!n && !ev.target.closest('.fe-stage')) return;
      ev.preventDefault();
      if (n) { const i = +n.dataset.el; if (!S.sel.includes(i)) select([i], { keepPanel: true }); }
      contextMenu(ev);
    });
    stage.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.button !== 1) return;
      closePop();
      if (S.editing >= 0 && ev.target.closest('.fe-editing')) return;    // placing the caret
      if (S.editing >= 0) endTextEdit(true);
      const p = pt(ev);
      if (S.space || ev.button === 1) { D_start({ kind: 'pan', sx: ev.clientX, sy: ev.clientY, l: stage.scrollLeft, t: stage.scrollTop }, ev); return; }
      const h = ev.target.closest('[data-h]');
      if (h && S.sel.length === 1) { beginTransform(h.dataset.h, ev, p); return; }
      const ug = ev.target.closest('[data-ug]');
      if (ug) { const axis = ug.dataset.ug[0], k = +ug.dataset.ug.slice(1); D_start({ kind: 'guide', axis, k }, ev); return; }
      const n = ev.target.closest('.fe-paper [data-el]') ? hitEl(ev) : null;
      if (n) {
        const i = +n.dataset.el;
        if (ev.shiftKey) {
          select(S.sel.includes(i) ? S.sel.filter((k) => k !== i) : [...S.sel, i], { keepPanel: true });
          if (!S.sel.includes(i)) return;
        } else if (!S.sel.includes(i)) select([i]);
        const movable = S.sel.filter((k) => !els()[k].lock);
        D_start({ kind: 'move', x0: p.x, y0: p.y, clicked: i, wasShift: ev.shiftKey, alt: ev.altKey, orig: movable.map((k) => ({ k, x: els()[k].x, y: els()[k].y })) }, ev);
        return;
      }
      // empty space: drag a selection rectangle
      D_start({ kind: 'marq', x0: p.x, y0: p.y, base: ev.shiftKey ? S.sel.slice() : [] }, ev);
    });
    function beginTransform(h, ev, p) {
      const i = S.sel[0], e = els()[i];
      if (!e || e.lock) return;
      const W = G.W, H = G.H, w = e.w * W, hh = e.h * H, cx = (e.x + e.w / 2) * W, cy = (e.y + e.h / 2) * H;
      const th = ((e.rot || 0) * Math.PI) / 180;
      if (h === 'rot') { D_start({ kind: 'rot', i, cx, cy, orig: clone(e) }, ev); return; }
      const hx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, hy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
      const ax = (-hx * w) / 2, ay = (-hy * hh) / 2;
      const Ax = cx + ax * Math.cos(th) - ay * Math.sin(th), Ay = cy + ax * Math.sin(th) + ay * Math.cos(th);
      D_start({ kind: 'resize', i, hx, hy, Ax, Ay, th, w0: w, h0: hh, orig: clone(e), lines: snapLines(new Set([i])) }, ev);
    }
    function D_start(d, ev) {
      S.drag = Object.assign(d, { id: ev.pointerId, sx0: ev.clientX, sy0: ev.clientY, started: d.kind === 'guide' || d.kind === 'pan' });
      try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      ev.preventDefault();
      stage.focus({ preventScroll: true });
    }
    stage.addEventListener('pointermove', (ev) => {
      const D = S.drag;
      if (!D) { hover(ev); return; }
      if (ev.pointerId !== D.id) return;
      if (!D.started) { if (Math.hypot(ev.clientX - D.sx0, ev.clientY - D.sy0) < 3) return; D.started = true; if (D.kind === 'move') startMove(D); }
      const p = pt(ev);
      if (D.kind === 'pan') { stage.scrollLeft = D.l - (ev.clientX - D.sx); stage.scrollTop = D.t - (ev.clientY - D.sy); paintRulers(); return; }
      if (D.kind === 'guide') { const v = D.axis === 'v' ? p.x / G.W : p.y / G.H; S.uguides[D.axis][D.k] = v; paintOverlay(); return; }
      if (D.kind === 'marq') {
        const r = { l: Math.min(D.x0, p.x), t: Math.min(D.y0, p.y), r: Math.max(D.x0, p.x), b: Math.max(D.y0, p.y) };
        D.rect = r;
        const hit = els().map((e, i) => ({ a: aabb(e), i })).filter(({ a }) => a.r > r.l && a.l < r.r && a.b > r.t && a.t < r.b).map((x) => x.i);
        S.sel = [...new Set([...D.base, ...hit])];
        paintOverlay();
        return;
      }
      if (D.kind === 'move') return doMove(D, p, ev);
      if (D.kind === 'resize') return doResize(D, p, ev);
      if (D.kind === 'rot') return doRotate(D, p, ev);
    });
    function startMove(D) {
      if (D.alt && D.orig.length && room(D.orig.length)) {   // Alt-drag: leave the originals, drag copies
        const start = els().length;
        D.orig.forEach((o) => { const c = clone(els()[o.k]); delete c.lock; els().push(c); });
        S.sel = D.orig.map((_, n) => start + n);
        D.orig = D.orig.map((o, n) => ({ k: start + n, x: o.x, y: o.y }));
        render();
      }
      D.lines = snapLines(new Set(D.orig.map((o) => o.k)));
      D.box0 = unionBox(D.orig.map((o) => o.k));
      root.classList.add('fe-moving');
    }
    function doMove(D, p, ev) {
      if (!D.orig.length || !D.box0) return;
      let dx = p.x - D.x0, dy = p.y - D.y0;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const b = D.box0;
      D.gx = []; D.gy = [];
      if (!(ev.ctrlKey || ev.metaKey)) {
        const vx = [b.l + dx, b.cx + dx, b.r + dx], vy = [b.t + dy, b.cy + dy, b.b + dy];
        const sx = ev.shiftKey && dx === 0 ? null : snapAxis(vx, D.lines.xs, SNAP), sy = ev.shiftKey && dy === 0 ? null : snapAxis(vy, D.lines.ys, SNAP);
        if (sx != null) { dx += sx; D.gx = hits([b.l + dx, b.cx + dx, b.r + dx], D.lines.xs); }
        if (sy != null) { dy += sy; D.gy = hits([b.t + dy, b.cy + dy, b.b + dy], D.lines.ys); }
      }
      D.orig.forEach((o) => { const e = els()[o.k]; e.x = r4(clamp(o.x + dx / G.W, -1, 2 - e.w)); e.y = r4(clamp(o.y + dy / G.H, -1, 2 - e.h)); placeEl(o.k); });
      const pw = 100 * pagesN();
      D.read = { x: p.x + 14, y: p.y + 18, t: `x ${(((b.l + dx) / G.W) * pw).toFixed(1)}  y ${(((b.t + dy) / G.H) * 100).toFixed(1)}` };
      paintOverlay(); paintRulers();
    }
    function doResize(D, p, ev) {
      const e = els()[D.i], o = D.orig;
      const cos = Math.cos(D.th), sin = Math.sin(D.th);
      const vx = p.x - D.Ax, vy = p.y - D.Ay;
      const lx = vx * cos + vy * sin, ly = -vx * sin + vy * cos;
      let nw = D.hx ? Math.max(MIN_PX, D.hx * lx) : D.w0, nh = D.hy ? Math.max(MIN_PX, D.hy * ly) : D.h0;
      const corner = D.hx && D.hy;
      const keep = ev.shiftKey || (corner && (e.type === 'text' || e.type === 'art'));
      D.gx = []; D.gy = [];
      if (keep) {
        if (corner) { const s = Math.max(nw / D.w0, nh / D.h0); nw = D.w0 * s; nh = D.h0 * s; } else if (D.hx) nh = (D.h0 * nw) / D.w0; else nw = (D.w0 * nh) / D.h0;
      } else if (!D.th && !(ev.ctrlKey || ev.metaKey)) {
        // snap the moving edges
        if (D.hx) { const edge = D.Ax + D.hx * nw, s = snapAxis([edge], D.lines.xs, SNAP); if (s != null) { nw = Math.max(MIN_PX, nw + D.hx * s); D.gx = [D.Ax + D.hx * nw]; } }
        if (D.hy) { const edge = D.Ay + D.hy * nh, s = snapAxis([edge], D.lines.ys, SNAP); if (s != null) { nh = Math.max(MIN_PX, nh + D.hy * s); D.gy = [D.Ay + D.hy * nh]; } }
      }
      const ox = (D.hx * nw) / 2, oy = (D.hy * nh) / 2;
      const cx = D.Ax + ox * cos - oy * sin, cy = D.Ay + ox * sin + oy * cos;
      e.w = r4(nw / G.W); e.h = r4(nh / G.H); e.x = r4(cx / G.W - e.w / 2); e.y = r4(cy / G.H - e.h / 2);
      if (e.type === 'text' && corner && keep) e.size = Math.round(clamp(o.size * (nh / D.h0), 0.5, 40) * 10) / 10;
      placeEl(D.i);
      const pw = 100 * pagesN();
      D.read = { x: p.x + 14, y: p.y + 18, t: `${((nw / G.W) * pw).toFixed(1)} × ${((nh / G.H) * 100).toFixed(1)}${e.type === 'text' && corner && keep ? `  size ${e.size}` : ''}` };
      paintOverlay();
    }
    function doRotate(D, p, ev) {
      const e = els()[D.i];
      let a = (Math.atan2(p.y - D.cy, p.x - D.cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      else { const near = Math.round(a / 90) * 90; if (Math.abs(a - near) < 3) a = near; }
      a = ((a + 540) % 360) - 180;
      if (Math.abs(a) < 0.01 || Math.abs(Math.abs(a) - 360) < 0.01) a = 0;
      e.rot = Math.round(a * 10) / 10;
      if (!e.rot) delete e.rot;
      placeEl(D.i);
      D.read = { x: p.x + 14, y: p.y + 18, t: `${Math.round(e.rot || 0)}°` };
      paintOverlay();
    }
    function endDrag(ev, cancel) {
      const D = S.drag;
      if (!D || (ev && ev.pointerId !== D.id)) return;
      S.drag = null;
      root.classList.remove('fe-moving');
      if (D.kind === 'guide') {
        const v = S.uguides[D.axis][D.k];
        if (cancel || v == null || v < -0.01 || v > 1.01) S.uguides[D.axis].splice(D.k, 1);
        paintOverlay(); return;
      }
      if (D.kind === 'pan') return;
      if (!D.started) {
        if (D.kind === 'marq' && !D.base.length) select([]);
        else if (D.kind === 'move' && !D.wasShift && S.sel.length > 1) select([D.clicked]);
        paintOverlay();
        return;
      }
      S.suppressClick = true; setTimeout(() => { S.suppressClick = false; }, 0);
      if (D.kind === 'marq') { select(S.sel, { keepPanel: true }); return; }
      if (cancel) { travelTo(); return; }
      render(); commit(D.kind); paintOverlay(); paintInsp(); paintRulers(); paintHud();
    }
    function travelTo() { const s = S.hist[S.hi], cut = s.lastIndexOf('|'); S.page = JSON.parse(s.slice(0, cut)); S.sel = S.sel.filter((k) => k < els().length); render(); paintOverlay(); }
    stage.addEventListener('pointerup', (ev) => endDrag(ev, false));
    stage.addEventListener('pointercancel', (ev) => endDrag(ev, true));
    stage.addEventListener('lostpointercapture', (ev) => { if (S.drag && S.drag.id === ev.pointerId) endDrag(ev, false); });
    function hover(ev) {
      const n = ev.target.closest && ev.target.closest('.fe-paper [data-el]') ? hitEl(ev) : null;
      const i = n ? +n.dataset.el : -1;
      if (i !== S.hover) { S.hover = i; paintOverlay(); }
    }
    stage.addEventListener('pointerleave', () => { if (S.hover >= 0 && !S.drag) { S.hover = -1; paintOverlay(); } });
    stage.addEventListener('dblclick', (ev) => {
      const n = ev.target.closest('.fe-paper [data-el]') ? hitEl(ev) : null;
      if (!n) return;
      const i = +n.dataset.el, e = els()[i];
      if (!e) return;
      if (e.type === 'text') startTextEdit(i);
      else if (e.type === 'photo') { if (e.m || tplMode) cropPhoto(i); else { S.replacing = i; S.panel = 'photos'; paintRail(); paintDrawer(); requestAnimationFrame(layout); } }
      else if (e.type === 'art') cmd('swapart');
    });
    stage.addEventListener('wheel', (ev) => {
      if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); setZoom(S.z * Math.pow(1.0018, -ev.deltaY), { x: ev.clientX, y: ev.clientY }); }
    }, { passive: false });
    stage.addEventListener('scroll', () => paintRulers(), { passive: true });

    // a guide from the rulers
    const fromRuler = (axis) => (ev) => {
      if (ev.button !== 0) return;
      S.uguides[axis].push(-1);
      D_start({ kind: 'guide', axis, k: S.uguides[axis].length - 1 }, ev);
    };
    rx.addEventListener('pointerdown', fromRuler('h'));
    ry.addEventListener('pointerdown', fromRuler('v'));
    for (const r of [rx, ry]) {
      r.addEventListener('pointermove', (ev) => { if (S.drag && S.drag.kind === 'guide' && ev.pointerId === S.drag.id) { const p = pt(ev); S.uguides[S.drag.axis][S.drag.k] = S.drag.axis === 'v' ? p.x / G.W : p.y / G.H; paintOverlay(); } });
      r.addEventListener('pointerup', (ev) => endDrag(ev, false));
    }

    /* ---------- dragging photos and ornaments from the panels ---------- */
    let tdrag = null;
    dbody.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.pointerType === 'touch') return;
      const ph = ev.target.closest('[data-ph]'), at = ev.target.closest('[data-art], [data-artsrc]'), ly = ev.target.closest('.fe-layer');
      if (ly && !ev.target.closest('button[data-llock]')) { tdrag = { kind: 'layer', i: +ly.dataset.layer, li: ly, x0: ev.clientX, y0: ev.clientY, id: ev.pointerId }; return; }
      if (!ph && !at) return;
      const img = (ph || at).querySelector('img, i');
      tdrag = { kind: ph ? 'photo' : 'art', id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, m: ph && ph.dataset.ph, art: at && (at.dataset.art || at.dataset.artsrc), own: at && !!at.dataset.artsrc, src: img && img.src };
    });
    addEventListener('pointermove', onTrayMove, { passive: false });
    addEventListener('pointerup', onTrayUp);
    function onTrayMove(ev) {
      const d = tdrag;
      if (!d || ev.pointerId !== d.id) return;
      if (!d.started) { if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return; d.started = true;
        if (d.kind !== 'layer') { d.ghost = document.createElement('div'); d.ghost.className = 'fe-ghost'; d.ghost.innerHTML = d.src ? `<img src="${esc(d.src)}" alt="">` : ''; root.appendChild(d.ghost); }
        else d.li.classList.add('lifted');
      }
      ev.preventDefault();
      if (d.kind === 'layer') {
        const list = [...dbody.querySelectorAll('.fe-layer')];
        let mark = dbody.querySelector('.fe-insert');
        if (!mark) { mark = document.createElement('span'); mark.className = 'fe-insert'; dbody.querySelector('.fe-layers').appendChild(mark); }
        let best = null;
        list.forEach((li) => { const r = li.getBoundingClientRect(); const dist = Math.abs(ev.clientY - (r.top + r.height / 2)); if (!best || dist < best.dist) best = { li, r, dist, below: ev.clientY > r.top + r.height / 2 }; });
        if (best) {
          const host = dbody.querySelector('.fe-layers').getBoundingClientRect();
          mark.style.top = ((best.below ? best.r.bottom : best.r.top) - host.top) + 'px';
          // the list shows the top layer first, so "below" in the list means further back
          const k = +best.li.dataset.layer;
          let to = best.below ? k : k + 1;
          if (to > d.i) to -= 1;
          d.to = clamp(to, 0, els().length - 1);
        }
        return;
      }
      d.ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -50%)`;
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      // a photo dropped on a photo replaces it, even with words or a frame lying over it
      const n = d.kind === 'photo' && under && under.closest('.fe-paper') ? document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest && x.closest('.fe-paper [data-el]')).find((x) => x && els()[+x.dataset.el] && els()[+x.dataset.el].type === 'photo') : null;
      d.target = null; S.dropOn = -1;
      paper.querySelectorAll('.fe-dropon').forEach((x) => x.classList.remove('fe-dropon'));
      if (n) { n.classList.add('fe-dropon'); d.target = { replace: +n.dataset.el }; }
      else if (under && under.closest('.fe-stage')) { const p = pt(ev); d.target = { at: { cx: clamp(p.x / G.W, 0, 1), cy: clamp(p.y / G.H, 0, 1) } }; }
    }
    async function onTrayUp(ev) {
      const d = tdrag;
      if (!d || ev.pointerId !== d.id) return;
      tdrag = null;
      if (d.ghost) d.ghost.remove();
      paper.querySelectorAll('.fe-dropon').forEach((x) => x.classList.remove('fe-dropon'));
      const mark = dbody.querySelector('.fe-insert'); if (mark) mark.remove();
      if (!d.started) return;
      S.suppressClick = true; setTimeout(() => { S.suppressClick = false; }, 0);
      if (d.kind === 'layer') { d.li.classList.remove('lifted'); if (d.to != null) moveLayer(d.i, d.to); return; }
      if (!d.target) return;
      if (d.kind === 'photo') {
        if (d.target.replace != null) { replacePhoto(d.target.replace, d.m); select([d.target.replace], { keepPanel: true }); toast('Photo replaced'); }
        else addPhoto(d.m, d.target.at);
      } else {
        const a = d.own ? { src: d.art } : S.lib.art.find((x) => (x.key || x.src) === d.art);
        if (!a) return;
        const before = els().length;
        await addArt(a);
        if (els().length > before && d.target.at) { const e = els()[els().length - 1]; e.x = r4(d.target.at.cx - e.w / 2); e.y = r4(d.target.at.cy - e.h / 2); render(); commit(); paintOverlay(); }
      }
    }

    /* ---------- keyboard ---------- */
    function onKey(e) {
      if (!root.isConnected) return;
      if (e.isComposing || e.keyCode === 229) return;
      if (document.querySelector('.crop-overlay, .crop-dialog[open]')) return;
      const t = e.target;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (S.editing >= 0) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const i = S.editing; endTextEdit(true); select([i], { keepPanel: true }); }
        else if (mod && k === 's') { e.preventDefault(); e.stopPropagation(); endTextEdit(true); save(); }
        return;
      }
      const pop = root.querySelector('.fe-pop');
      if (pop && pop.matches('dialog')) return;
      if (pop && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (S.popRestore && root.querySelector('.fe-fpop')) S.popRestore(); S.popRestore = null; const a = S.popFor; closePop(); if (a && a.isConnected) a.focus(); return; }
      if (pop && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && pop.matches('.fe-menu, .fe-fpop')) {
        e.preventDefault(); e.stopPropagation();
        const items = [...pop.querySelectorAll('button:not([disabled])')], n = items.indexOf(document.activeElement);
        items[(n + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        return;
      }
      if (mod && k === 's') { e.preventDefault(); e.stopPropagation(); save(); return; }
      const inField = t.closest && t.closest('input, textarea, select, [contenteditable]');
      if (inField) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); t.blur(); } return; }
      e.stopPropagation();
      if (e.key === ' ' && !t.closest('button, a')) { e.preventDefault(); if (!S.space) { S.space = true; root.classList.add('fe-pan'); } return; }
      if (mod && !e.shiftKey && k === 'z') { e.preventDefault(); travel(-1); return; }
      if ((mod && e.shiftKey && k === 'z') || (mod && k === 'y')) { e.preventDefault(); travel(1); return; }
      if (mod && k === 'c') { e.preventDefault(); copySel(); return; }
      if (mod && k === 'x') { e.preventDefault(); copySel(); removeSel(); return; }
      if (mod && k === 'v') { e.preventDefault(); paste(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (mod && k === 'a') { e.preventDefault(); cmd('selall'); return; }
      if (mod && (k === '0')) { e.preventDefault(); zoomFit(); return; }
      if (mod && (k === '1')) { e.preventDefault(); setZoom(ZOOM_100); return; }
      if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomStep(1); return; }
      if (mod && k === '-') { e.preventDefault(); zoomStep(-1); return; }
      if (mod || e.altKey) return;
      if (e.key === 'Escape') { e.preventDefault(); if (S.sel.length) select([]); else requestClose(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (S.sel.length) { e.preventDefault(); removeSel(); } return; }
      if (e.key.startsWith('Arrow') && S.sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        moveBy(dx / G.W, dy / G.H, 'nudge');
        return;
      }
      if (e.key === 'Enter' && S.sel.length === 1 && els()[S.sel[0]].type === 'text' && !t.closest('button')) { e.preventDefault(); startTextEdit(S.sel[0]); return; }
      if (e.key === ']' || e.key === '}') { restack(e.shiftKey ? 'front' : 'fwd'); return; }
      if (e.key === '[' || e.key === '{') { restack(e.shiftKey ? 'back' : 'bwd'); return; }
      if (e.key === '?') { help(); return; }
      if (k === 'g') { cmd('guides'); return; }
      if (k === 'r') { cmd('rulers'); return; }
    }
    function onKeyUp(e) { if (e.key === ' ' && S.space) { S.space = false; root.classList.remove('fe-pan'); } }
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKeyUp, true);

    /* ---------- save, close ---------- */
    function cleanOut() {
      const p = S.page, out = { v: 2 };
      if (p.s && mode !== 'cover') out.s = 1;
      const b = clone(p.bg || { type: 'color', color: '#F7F3EE' });
      if (b.type === 'photo' && tplMode) b.m = null;
      out.bg = b;
      out.els = els().slice(0, MAX_ELS).map((e0) => {
        const e = clone(e0);
        e.x = r4(clamp(e.x, -1, 2)); e.y = r4(clamp(e.y, -1, 2)); e.w = r4(clamp(e.w, 0.002, 3)); e.h = r4(clamp(e.h, 0.002, 3));
        if (e.rot) e.rot = Math.round(clamp(e.rot, -360, 360) * 10) / 10;
        if (e.type === 'photo' && (tplMode || !e.m)) e.m = null;
        if (e.type === 'text') { e.text = String(e.text || '').slice(0, 500); e.size = clamp(+e.size || 5, 0.5, 40); }
        tidy(e);
        return e;
      }).filter((e) => e.type !== 'art' || e.src);
      return out;
    }
    const plain = (msg) => (/failed to fetch|networkerror|load failed/i.test(msg || '') ? 'The server could not be reached. Check the internet connection and try again.' : msg || 'Something went wrong. Try again.');
    async function save() {
      if (S.saving) return;
      endTextEdit(true);
      const page = cleanOut();
      if (tplMode) {
        if (!S.meta.name.trim()) { S.error = 'Give the design a name, so studios can find it.'; select([]); paintTop(); const n = insp.querySelector('[data-meta="name"]'); if (n) n.focus(); return; }
        if (!page.els.length) { S.error = 'Add at least one photo spot, words or an ornament.'; paintTop(); return; }
      }
      S.saving = true; S.error = ''; paintTop();
      try {
        await opts.onSave(page, tplMode ? Object.assign({}, S.meta, { name: S.meta.name.trim() }) : undefined);
        S.savedSnap = snapshot(); S.justSaved = true;
      } catch (err) {
        S.error = 'Not saved. ' + plain(err && err.message);
        toast(S.error);
      }
      S.saving = false; paintTop();
    }
    function requestClose() {
      if (S.editing >= 0) endTextEdit(true);
      if (dirty() && !confirm('Close the editor without saving? Your changes to this page will be lost.')) return;
      close(true);
    }
    function close(callBack) {
      removeEventListener('keydown', onKey, true);
      removeEventListener('keyup', onKeyUp, true);
      removeEventListener('pointermove', onTrayMove);
      removeEventListener('pointerup', onTrayUp);
      removeEventListener('resize', onResize);
      removeEventListener('beforeunload', onBeforeUnload);
      if (nav) nav.removeEventListener('navigate', onNavigate);
      if (ro) ro.disconnect();
      closePop();
      adopt.disconnect();
      closing = true;
      if (root.open) root.close();
      if (toastEl && toastHome && toastHome.parent) toastHome.parent.insertBefore(toastEl, toastHome.next && toastHome.next.parentNode === toastHome.parent ? toastHome.next : null);
      root.remove();
      document.body.classList.remove('fe-open');
      if (OPEN && OPEN.root === root) OPEN = null;
      if (callBack && opts.onClose) opts.onClose();
    }
    function onBeforeUnload(e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } }
    const nav = window.navigation && typeof window.navigation.addEventListener === 'function' ? window.navigation : null;
    function onNavigate(e) {
      if (!e.hashChange) return;
      if (dirty() && e.cancelable && !confirm('Leave the editor without saving? Your changes to this page will be lost.')) { e.preventDefault(); return; }
      close(false);
    }
    let closing = false;
    root.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      if (ev.target !== root || root.querySelector('.crop-overlay, dialog[open]')) return;   // Esc in the crop dialog or the shortcuts
      if (S.sel.length) select([]); else requestClose();
    });
    root.addEventListener('close', () => { if (!closing && root.isConnected) { root.showModal(); if (dirty()) toast('Save or close the editor with the buttons at the top.'); } });
    addEventListener('beforeunload', onBeforeUnload);
    if (nav) nav.addEventListener('navigate', onNavigate);
    const onResize = () => { layout(); };
    addEventListener('resize', onResize);
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (S.fit) layout(); else paintRulers(); }) : null;
    if (ro) ro.observe(stage);

    /* ---------- start ---------- */
    OPEN = { root, close };
    render();
    S.panel = isPhone() ? null : els().length ? (tplMode ? 'photos' : 'photos') : 'designs';
    paintRail(); paintDrawer(); paintInsp();
    requestAnimationFrame(() => { zoomFit(); paintTop(); });
    library().then((lib) => {
      if (!root.isConnected) return;
      S.lib = lib;
      if (['bg', 'art'].includes(S.panel)) paintDrawer();
      paintInsp();
    });
    designs(ctx).then((list) => {
      if (!root.isConnected) return;
      S.designs = list;
      if (S.page.s && mode !== 'cover') { S.designTag = 'spread'; if (!designList().length) S.designTag = 'all'; }
      if (S.panel === 'designs') {
        if (!designList().length && S.designOcc === 'mine') S.designOcc = 'all';
        if (!designList().length && !els().length) { S.panel = isPhone() ? null : 'photos'; paintRail(); }
        paintDrawer();
      }
    });
    root.querySelector('.fe-save').focus({ preventScroll: true });
    return { close: requestClose };
  }

  window.FreeEditor = { open, fill, library, designs, fadeCss, libraryUrl: '' };
})();
