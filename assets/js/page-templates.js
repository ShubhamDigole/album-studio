/* Page designs for albums made from photos: the layout engine shared by the viewer, the page editor and the
   master's template designer.

   A template is plain data, in fractions of the page (or of the two-page spread when spread: true), so one
   template fits any album shape:
     { key, name, spread?, auto?, bg: 'paper'|'white'|'silk'|'dark'|'#rrggbb',
       slots: [{ x, y, w, h, r?: corner 0..0.5 | 'circle' | 'arch', frame?: 'none'|'mat'|'shadow'|'polaroid', rot?: degrees }],
       texts: [{ x, y, w, h, role: 'names'|'date'|'place'|'title'|'section'|'caption'|'free', text?, font: 'display'|'ui',
                 size: % of page height, align: 'left'|'center'|'right', color: 'ink'|'accent'|'light'|'silk'|'#rrggbb', weight? }] }

   A page of an album is { t: template key, p: [{ m: media id, c: [cx, cy, zoom] }], tx: [text per text box], bg?, s?: 1 for spreads }.
   Rendered pages are HTML: absolutely positioned boxes in a container that sizes text with cqh units.

   PageTemplates.render(page, { album, tpl, photos, half, small, zoom, lazy, editable })  -> HTML string
   PageTemplates.autoLayout(photos, { ratio, density, sections, welcome, thanks, seed })   -> pages
*/
(function () {
  'use strict';

  const M = 0.045;                       // outer margin
  const G = 0.025;                       // gap between photos
  const inner = 1 - 2 * M;

  // ---------- built-in templates ----------
  const T = [];
  const add = (t) => { T.push(Object.assign({ auto: true, bg: 'paper', texts: [] }, t)); };

  add({ key: 'full-bleed', name: 'Full page', slots: [{ x: 0, y: 0, w: 1, h: 1 }] });
  add({ key: 'full-mat', name: 'Framed', slots: [{ x: M, y: M * 1.4, w: inner, h: 1 - M * 2.8, frame: 'shadow' }] });
  add({ key: 'portrait-center', name: 'Portrait', slots: [{ x: 0.3, y: 0.08, w: 0.4, h: 0.84, frame: 'shadow' }] });
  add({ key: 'circle-names', name: 'Circle and names', auto: false, slots: [{ x: 0.08, y: 0.14, w: 0.4, h: 0.72, r: 'circle', frame: 'shadow' }],
    texts: [{ x: 0.52, y: 0.3, w: 0.42, h: 0.26, role: 'names', font: 'display', size: 9, align: 'center', color: 'silk' },
      { x: 0.52, y: 0.6, w: 0.42, h: 0.1, role: 'date', font: 'ui', size: 3.4, align: 'center', color: 'ink' }] });
  add({ key: 'arch-title', name: 'Arch and title', auto: false, slots: [{ x: 0.34, y: 0.1, w: 0.32, h: 0.6, r: 'arch', frame: 'shadow' }],
    texts: [{ x: 0.1, y: 0.74, w: 0.8, h: 0.12, role: 'names', font: 'display', size: 7, align: 'center', color: 'silk' },
      { x: 0.1, y: 0.87, w: 0.8, h: 0.07, role: 'date', font: 'ui', size: 3, align: 'center', color: 'ink' }] });

  const half = (inner - G) / 2;
  add({ key: 'two-side', name: 'Two side by side', slots: [{ x: M, y: M * 1.4, w: half, h: 1 - M * 2.8 }, { x: M + half + G, y: M * 1.4, w: half, h: 1 - M * 2.8 }] });
  add({ key: 'two-stacked', name: 'Two stacked', slots: [{ x: 0.18, y: M, w: 0.64, h: (1 - 2 * M - G) / 2 }, { x: 0.18, y: M + (1 - 2 * M - G) / 2 + G, w: 0.64, h: (1 - 2 * M - G) / 2 }] });
  add({ key: 'two-offset', name: 'Two, offset', bg: 'white', slots: [{ x: 0.06, y: 0.08, w: 0.5, h: 0.62, frame: 'shadow' }, { x: 0.47, y: 0.32, w: 0.47, h: 0.6, frame: 'shadow' }] });

  const third = (inner - 2 * G) / 3;
  add({ key: 'three-cols', name: 'Three columns', slots: [0, 1, 2].map((i) => ({ x: M + i * (third + G), y: M * 1.4, w: third, h: 1 - M * 2.8 })) });
  add({ key: 'big-left-two', name: 'One large, two small', slots: [{ x: M, y: M, w: 0.58, h: inner },
    { x: M + 0.58 + G, y: M, w: inner - 0.58 - G, h: (inner - G) / 2 }, { x: M + 0.58 + G, y: M + (inner - G) / 2 + G, w: inner - 0.58 - G, h: (inner - G) / 2 }] });
  add({ key: 'big-top-two', name: 'Large above, two below', slots: [{ x: M, y: M, w: inner, h: 0.56 },
    { x: M, y: M + 0.56 + G, w: half, h: inner - 0.56 - G }, { x: M + half + G, y: M + 0.56 + G, w: half, h: inner - 0.56 - G }] });
  add({ key: 'polaroids-3', name: 'Three prints', bg: 'paper', slots: [
    { x: 0.06, y: 0.14, w: 0.3, h: 0.62, frame: 'polaroid', rot: -5 },
    { x: 0.35, y: 0.2, w: 0.3, h: 0.62, frame: 'polaroid', rot: 3 },
    { x: 0.64, y: 0.12, w: 0.3, h: 0.62, frame: 'polaroid', rot: -2 }] });

  add({ key: 'grid-4', name: 'Grid of four', slots: [0, 1, 2, 3].map((i) => ({ x: M + (i % 2) * (half + G), y: M + Math.floor(i / 2) * ((inner - G) / 2 + G), w: half, h: (inner - G) / 2 })) });
  add({ key: 'mosaic-4', name: 'One large, three small', slots: [{ x: M, y: M, w: 0.6, h: inner },
    ...[0, 1, 2].map((i) => ({ x: M + 0.6 + G, y: M + i * ((inner - 2 * G) / 3 + G), w: inner - 0.6 - G, h: (inner - 2 * G) / 3 }))] });
  add({ key: 'strip-4', name: 'Four in a row', slots: [0, 1, 2, 3].map((i) => ({ x: M + i * ((inner - 3 * G) / 4 + G), y: 0.2, w: (inner - 3 * G) / 4, h: 0.6 })) });
  add({ key: 'grid-6', name: 'Grid of six', slots: [0, 1, 2, 3, 4, 5].map((i) => ({ x: M + (i % 3) * (third + G), y: M + Math.floor(i / 3) * ((inner - G) / 2 + G), w: third, h: (inner - G) / 2 })) });

  add({ key: 'photo-caption', name: 'Photo with words', auto: false, slots: [{ x: M, y: M, w: 0.6, h: inner }],
    texts: [{ x: 0.7, y: 0.3, w: 0.26, h: 0.4, role: 'caption', text: 'A few words about this moment', font: 'display', size: 4.4, align: 'left', color: 'silk' }] });
  add({ key: 'photo-band', name: 'Photo with a title band', auto: false, slots: [{ x: 0, y: 0, w: 1, h: 0.8 }],
    texts: [{ x: 0.06, y: 0.82, w: 0.88, h: 0.15, role: 'section', font: 'display', size: 6.5, align: 'center', color: 'silk' }] });

  // two-page spreads
  add({ key: 'spread-full', name: 'Across two pages', spread: true, slots: [{ x: 0, y: 0, w: 1, h: 1 }] });
  add({ key: 'spread-feature', name: 'Feature spread', spread: true, slots: [{ x: 0, y: 0, w: 0.5, h: 1 },
    { x: 0.5 + M / 2, y: M, w: 0.5 - M, h: (inner - G) / 2 }, { x: 0.5 + M / 2, y: M + (inner - G) / 2 + G, w: 0.5 - M, h: (inner - G) / 2 }] });
  add({ key: 'spread-strip', name: 'Story strip', spread: true, bg: 'white', slots: [0, 1, 2, 3, 4].map((i) => ({ x: 0.03 + i * 0.19, y: 0.18, w: 0.17, h: 0.64, frame: 'shadow' })) });

  const BUILTIN = Object.fromEntries(T.map((t) => [t.key, t]));
  const custom = {};   // master-made templates, added with PageTemplates.define()

  function get(key) { return custom[key] || BUILTIN[key] || null; }
  function list({ includeHidden = false } = {}) { return [...T, ...Object.values(custom).filter((t) => includeHidden || !t.hidden)]; }
  function define(t) { if (t && t.key) custom[t.key] = Object.assign({ auto: false, bg: 'paper', texts: [], slots: [] }, t); }
  function forget(key) { delete custom[key]; }

  // ---------- rendering ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (n) => (Math.round(n * 100000) / 1000) + '%';
  const HEX = /^#[0-9a-f]{6}$/i;
  function themeOf(album) {
    const th = (album && album.theme) || {};
    return { silk: th.silk || '#0F3D3E', accent: th.accent || '#C8255F' };
  }
  function bgCss(bg, th) {
    if (HEX.test(bg || '')) return bg;
    if (bg === 'white') return '#FFFFFF';
    if (bg === 'silk') return `radial-gradient(120% 90% at 30% 20%, color-mix(in srgb, ${th.silk} 80%, #fff 20%), ${th.silk} 60%, color-mix(in srgb, ${th.silk} 75%, #000 25%))`;
    if (bg === 'dark') return '#17151C';
    return '#F7F3EE';   // paper
  }
  const onDark = (bg) => bg === 'silk' || bg === 'dark' || (HEX.test(bg || '') && lum(bg) < 0.45);
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
  function textColor(c, th, dark) {
    if (HEX.test(c || '')) return c;
    if (c === 'accent') return th.accent;
    if (c === 'light') return '#FBF7F0';
    if (c === 'silk') return dark ? '#FBF7F0' : th.silk;
    return dark ? '#F1ECE3' : '#2A2530';   // ink
  }
  function autoText(role, album) {
    const a = album || {};
    const names = (a.names || []).filter(Boolean);
    if (role === 'names') return names.length ? names.join(' & ') : a.title || '';
    if (role === 'title') return a.title || names.join(' & ');
    if (role === 'date') {
      if (!a.date) return '';
      const d = new Date(a.date + 'T00:00:00');
      return isNaN(d) ? a.date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (role === 'place') return a.location || '';
    return '';
  }
  // crop: cx, cy = focus point (0..1), z = zoom (>= 1)
  function cropStyle(c) {
    const [cx = 0.5, cy = 0.5, z = 1] = c || [];
    return `object-position:${pct(cx)} ${pct(cy)};transform:scale(${Math.max(1, Math.min(4, z))});transform-origin:${pct(cx)} ${pct(cy)}`;
  }
  function slotShape(s) {
    if (s.r === 'circle') return 'border-radius:50%';
    if (s.r === 'arch') return 'border-radius:50% 50% 3% 3% / 32% 32% 3% 3%';
    return s.r ? `border-radius:${Math.min(50, s.r * 100)}%` : '';
  }

  /* page: { t, p, tx, bg }; photos: [{ src, thumb, zoom, w, h }] aligned with page.p (already resolved to URLs).
     half: 'left' | 'right' renders one half of a spread template. */
  function render(page, opts = {}) {
    if (page && page.v === 2) return renderFree(page, opts);
    const tpl = opts.tpl || get(page.t) || BUILTIN['full-mat'];
    const th = themeOf(opts.album);
    const bg = page.bg || tpl.bg || 'paper';
    const dark = onDark(bg);
    const photos = opts.photos || [];
    const pick = (ph) => (!ph ? '' : opts.small ? ph.thumb || ph.src : opts.zoom ? ph.zoom || ph.src : ph.src);
    let html = '';
    tpl.slots.forEach((s, i) => {
      const ph = photos[i];
      const placed = (page.p || [])[i] || {};
      const frame = s.frame || 'none';
      const src = pick(ph);
      const img = src ? `<img alt="" ${opts.lazy ? 'data-src' : 'src'}="${esc(src)}" style="${cropStyle(placed.c)}" draggable="false">`
        : `<span class="pt-empty">${opts.editable ? 'Drop a photo here' : ''}</span>`;
      html += `<div class="pt-slot pt-${frame}" data-slot="${i}" style="left:${pct(s.x)};top:${pct(s.y)};width:${pct(s.w)};height:${pct(s.h)};${slotShape(s)}${s.rot ? `;transform:rotate(${+s.rot}deg)` : ''}"><div class="pt-photo" style="${slotShape(s)}">${img}</div></div>`;
    });
    (tpl.texts || []).forEach((t, i) => {
      const own = (page.tx || [])[i];
      const value = own != null && own !== '' ? own : autoText(t.role, opts.album) || (t.role === 'section' ? (page.section || '') : '') || t.text || '';
      if (!value && !opts.editable) return;
      const font = t.font === 'ui' ? 'var(--pt-ui, Mukta, system-ui, sans-serif)' : "var(--pt-display, 'Rozha One', Georgia, serif)";
      html += `<div class="pt-text${opts.editable ? ' pt-edit' : ''}" data-text="${i}" style="left:${pct(t.x)};top:${pct(t.y)};width:${pct(t.w)};height:${pct(t.h)};` +
        `font-family:${font};font-size:${(+t.size || 4)}cqh;text-align:${t.align || 'center'};color:${textColor(t.color, th, dark)};` +
        `justify-content:${t.align === 'left' ? 'flex-start' : t.align === 'right' ? 'flex-end' : 'center'};font-weight:${t.weight || (t.font === 'ui' ? 500 : 400)}">` +
        `<span>${esc(value) || (opts.editable ? '<i>Text</i>' : '')}</span></div>`;
    });
    const spread = !!tpl.spread;
    const inner = `<div class="pt-canvas${spread ? ' pt-spread' : ''}${opts.half ? ' pt-half-' + opts.half : ''}" style="background:${bgCss(bg, th)}">${html}</div>`;
    return `<div class="pt-page${dark ? ' pt-dark' : ''}">${inner}</div>`;
  }


  /* ---------- free-form pages (v: 2): layers placed freely, made in the advanced editor ----------
     page = { v: 2, s?: 1 (two pages), bg: Background, els: [Element, …] }   (paint order = array order)
     Background: { type: 'color', color } | { type: 'gradient', colors: [a, b], angle?, radial? }
               | { type: 'image', src, repeat?, scale?, blur?, dim?, dimColor? } | { type: 'photo', m, c?, blur?, dim?, dimColor? }
     Element (fractions of the page or spread; rot in degrees; opacity 0..1; flipX/flipY; lock):
       { type: 'photo', m, c: [cx, cy, z], shape, radius?, border?: { w, color }, shadow?: 'soft'|'strong'|'glow',
         frame?: 'polaroid'|'mat', filter?: { brightness, contrast, saturate, grayscale, sepia, blur } }
       { type: 'text', text, role?, font, size (% of page height), color, align, weight?, italic?, spacing? (em),
         line? (line height), shadow?: 'soft'|'strong'|'glow', upper?, bg? (colour behind the words), valign? }
       { type: 'shape', shape, fill?, stroke?, strokeW? (% of page height), radius? }
       { type: 'art', src, tint? }   (an ornament from the library: with tint the SVG is drawn in that colour)
     src values are site paths: /assets/library/… or /media/a/<album>/… (uploads). Colours: #rrggbb or #rrggbbaa, or 'accent'/'silk'. */
  const FONTS = {
    display: "'Rozha One', Georgia, serif", ui: "Mukta, system-ui, sans-serif",
    playfair: "'Playfair Display', Georgia, serif", cormorant: "'Cormorant Garamond', Georgia, serif",
    cinzel: "Cinzel, Georgia, serif", marcellus: "Marcellus, Georgia, serif",
    greatvibes: "'Great Vibes', cursive", parisienne: "Parisienne, cursive", dancing: "'Dancing Script', cursive",
    montserrat: "Montserrat, system-ui, sans-serif", poppins: "Poppins, system-ui, sans-serif",
    yatra: "'Yatra One', 'Rozha One', serif", tiro: "'Tiro Devanagari Hindi', Georgia, serif",
  };
  const FONT_NAMES = { display: 'Rozha One', ui: 'Mukta', playfair: 'Playfair Display', cormorant: 'Cormorant Garamond', cinzel: 'Cinzel',
    marcellus: 'Marcellus', greatvibes: 'Great Vibes', parisienne: 'Parisienne', dancing: 'Dancing Script', montserrat: 'Montserrat',
    poppins: 'Poppins', yatra: 'Yatra One', tiro: 'Tiro Devanagari Hindi' };
  // shapes for photos and plain shapes. CSS shapes stay responsive; heart, blob, scallop and flower use an SVG mask
  const POLY = {
    hexagon: 'polygon(25% 2%,75% 2%,100% 50%,75% 98%,25% 98%,0 50%)',
    diamond: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
    triangle: 'polygon(50% 0,100% 100%,0 100%)',
    octagon: 'polygon(29% 0,71% 0,100% 29%,100% 71%,71% 100%,29% 100%,0 71%,0 29%)',
    star: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
    slant: 'polygon(8% 0,100% 0,92% 100%,0 100%)',
  };
  const MASK = {
    heart: 'M50 92 C22 72 4 56 4 34 C4 17 17 6 31 6 C40 6 46 11 50 18 C54 11 60 6 69 6 C83 6 96 17 96 34 C96 56 78 72 50 92Z',
    blob: 'M52 3C70 2 91 13 96 34C101 55 94 79 74 92C55 104 27 99 13 82C-1 66 0 41 10 24C19 9 35 4 52 3Z',
    scallop: (() => { let d = ''; for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2; const p = (a, r) => (50 + Math.cos(a) * r).toFixed(2) + ' ' + (50 + Math.sin(a) * r).toFixed(2); d += (i ? '' : 'M' + p(a0, 44)) + ' Q' + p((a0 + a1) / 2, 54) + ' ' + p(a1, 44); } return d + 'Z'; })(),
    flower: (() => { let d = ''; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, b = ((i + 1) / 8) * Math.PI * 2, m = (a + b) / 2; const p = (t, r) => (50 + Math.cos(t) * r).toFixed(2) + ' ' + (50 + Math.sin(t) * r).toFixed(2); d += (i ? '' : 'M' + p(a, 30)) + ' C' + p(a, 58) + ' ' + p(b, 58) + ' ' + p(b, 30); } return d + 'Z'; })(),
  };
  const SHAPES = ['rect', 'rounded', 'circle', 'arch', 'hexagon', 'diamond', 'triangle', 'octagon', 'star', 'slant', 'heart', 'blob', 'scallop', 'flower', 'line'];
  // single quotes around the URL; the SVG uses double quotes, which encodeURIComponent turns into %22 (safe inside style="…")
  const maskUrl = (d) => "url('data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + d + '"/></svg>') + "')";
  function shapeCss(shape, radius) {
    if (shape === 'circle') return 'border-radius:50%;';
    if (shape === 'rounded') return `border-radius:${Math.min(50, (radius == null ? 0.08 : radius) * 100)}%;`;
    if (shape === 'arch') return 'border-radius:50% 50% 0 0 / 38% 38% 0 0;';
    if (POLY[shape]) return `clip-path:${POLY[shape]};`;
    if (MASK[shape]) { const u = maskUrl(MASK[shape]); return `-webkit-mask:${u} center/100% 100% no-repeat;mask:${u} center/100% 100% no-repeat;`; }
    return '';
  }
  const COLOR_RE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  const colorOf = (c, th, fallback) => (c === 'accent' ? th.accent : c === 'silk' ? th.silk : COLOR_RE.test(c || '') ? c : fallback);
  const SHADOW = { soft: '0 0.6cqh 2.2cqh rgba(20,14,8,.32)', strong: '0 1.2cqh 3.6cqh rgba(0,0,0,.5)', glow: '0 0 2.4cqh rgba(255,236,200,.75)' };
  const TEXT_SHADOW = { soft: '0 .25cqh .9cqh rgba(0,0,0,.35)', strong: '0 .35cqh 1.4cqh rgba(0,0,0,.7)', glow: '0 0 1.6cqh rgba(255,240,210,.9)' };
  function filterCss(f) {
    if (!f) return '';
    const parts = [];
    if (f.brightness != null && f.brightness !== 1) parts.push(`brightness(${+f.brightness})`);
    if (f.contrast != null && f.contrast !== 1) parts.push(`contrast(${+f.contrast})`);
    if (f.saturate != null && f.saturate !== 1) parts.push(`saturate(${+f.saturate})`);
    if (f.grayscale) parts.push(`grayscale(${+f.grayscale})`);
    if (f.sepia) parts.push(`sepia(${+f.sepia})`);
    if (f.blur) parts.push(`blur(${+f.blur}cqh)`);
    return parts.length ? 'filter:' + parts.join(' ') + ';' : '';
  }
  function boxCss(e, i) {
    const tf = [];
    if (e.rot) tf.push(`rotate(${+e.rot}deg)`);
    if (e.flipX || e.flipY) tf.push(`scale(${e.flipX ? -1 : 1},${e.flipY ? -1 : 1})`);
    return `left:${pct(e.x)};top:${pct(e.y)};width:${pct(e.w)};height:${pct(e.h)};z-index:${i + 1};` +
      (tf.length ? `transform:${tf.join(' ')};` : '') + (e.opacity != null && e.opacity < 1 ? `opacity:${+e.opacity};` : '');
  }
  function photoLookup(opts) {
    const m = opts.media || {};
    return (id) => (!id ? null : typeof m === 'function' ? m(id) : m[id] || null);
  }
  function bgFreeCss(bg, th, lookup, opts) {
    bg = bg || { type: 'color', color: '#F7F3EE' };
    if (bg.type === 'gradient') {
      const [a, b] = (bg.colors || []).map((c) => colorOf(c, th, '#F7F3EE'));
      return { css: bg.radial ? `background:radial-gradient(circle at 50% 40%, ${a}, ${b || a});` : `background:linear-gradient(${+bg.angle || 180}deg, ${a}, ${b || a});`, layer: '' };
    }
    if (bg.type === 'image' || bg.type === 'photo') {
      const ph = bg.type === 'photo' ? lookup(bg.m) : null;
      const src = bg.type === 'image' ? bg.src : ph ? (opts.small ? ph.thumb || ph.src : ph.src) : '';
      const crop = bg.type === 'photo' ? cropStyle(bg.c) : '';
      const img = !src ? '' : bg.repeat
        ? `<div class="pe-bg-img" style="background:url('${esc(src)}') repeat;background-size:${(+bg.scale || 20)}cqh;${bg.blur ? `filter:blur(${+bg.blur}cqh);` : ''}"></div>`
        : `<img class="pe-bg-img" alt="" ${opts.lazy ? 'data-src' : 'src'}="${esc(src)}" style="${crop};${bg.blur ? `filter:blur(${+bg.blur}cqh);` : ''}" draggable="false">`;
      const dim = bg.dim ? `<div class="pe-bg-dim" style="background:${colorOf(bg.dimColor, th, '#000000')};opacity:${+bg.dim}"></div>` : '';
      return { css: `background:${colorOf(bg.color, th, '#1b1b1b')};`, layer: img + dim };
    }
    return { css: `background:${colorOf(bg.color, th, '#F7F3EE')};`, layer: '' };
  }
  function elementHtml(e, i, th, lookup, opts) {
    const box = boxCss(e, i);
    const edit = opts.editable ? ` data-el="${i}" tabindex="-1"` : '';
    if (e.type === 'photo') {
      const ph = lookup(e.m);
      const src = ph ? (opts.small ? ph.thumb || ph.src : opts.zoom ? ph.zoom || ph.src : ph.src) : '';
      const frame = e.frame === 'polaroid' ? ' pe-polaroid' : e.frame === 'mat' ? ' pe-mat' : '';
      const shadow = SHADOW[e.shadow] ? `filter:drop-shadow(${SHADOW[e.shadow]});` : '';
      const border = e.border && e.border.w ? `box-shadow:inset 0 0 0 ${+e.border.w}cqh ${colorOf(e.border.color, th, '#ffffff')};` : '';
      const img = src ? `<img alt="" ${opts.lazy ? 'data-src' : 'src'}="${esc(src)}" style="${cropStyle(e.c)};${filterCss(e.filter)}" draggable="false">`
        : `<span class="pt-empty">${opts.editable ? 'Drop a photo here' : ''}</span>`;
      return `<div class="pe-el pe-photo${frame}" style="${box}${shadow}"${edit}><div class="pe-clip" style="${shapeCss(e.shape, e.radius)}">${img}<i class="pe-border" style="${shapeCss(e.shape, e.radius)}${border}"></i></div></div>`;
    }
    if (e.type === 'text') {
      const value = (e.text != null && e.text !== '' ? e.text : autoText(e.role, opts.album) || (e.role === 'section' ? opts.section || '' : '')) || '';
      if (!value && !opts.editable) return '';
      const st = `font-family:${FONTS[e.font] || FONTS.display};font-size:${(+e.size || 5)}cqh;color:${colorOf(e.color, th, '#2A2530')};text-align:${e.align || 'center'};` +
        `font-weight:${+e.weight || (e.font === 'ui' || e.font === 'montserrat' || e.font === 'poppins' ? 500 : 400)};${e.italic ? 'font-style:italic;' : ''}` +
        `${e.spacing ? `letter-spacing:${+e.spacing}em;` : ''}line-height:${+e.line || 1.15};${TEXT_SHADOW[e.shadow] ? `text-shadow:${TEXT_SHADOW[e.shadow]};` : ''}` +
        `${e.upper ? 'text-transform:uppercase;' : ''}${e.bg ? `background:${colorOf(e.bg, th, 'transparent')};` : ''}` +
        `align-items:${e.valign === 'top' ? 'flex-start' : e.valign === 'bottom' ? 'flex-end' : 'center'};`;
      const html = esc(value).replace(/\n/g, '<br>') || (opts.editable ? '<i>Your words</i>' : '');
      return `<div class="pe-el pe-text" style="${box}${st}"${edit}><span>${html}</span></div>`;
    }
    if (e.type === 'shape') {
      const fill = e.fill ? colorOf(e.fill, th, 'transparent') : 'transparent';
      const stroke = e.stroke && e.strokeW ? `box-shadow:inset 0 0 0 ${+e.strokeW}cqh ${colorOf(e.stroke, th, '#000000')};` : '';
      if (e.shape === 'line') return `<div class="pe-el pe-shape" style="${box}"${edit}><i class="pe-line" style="background:${colorOf(e.stroke || e.fill, th, '#000000')};height:${(+e.strokeW || 0.3)}cqh"></i></div>`;
      return `<div class="pe-el pe-shape" style="${box}"${edit}><i style="${shapeCss(e.shape, e.radius)}background:${fill};${stroke}"></i></div>`;
    }
    if (e.type === 'art') {
      if (!e.src) return '';
      if (e.tint) {
        const u = `url('${esc(e.src)}')`;
        return `<div class="pe-el pe-art" style="${box}"${edit}><i style="-webkit-mask:${u} center/contain no-repeat;mask:${u} center/contain no-repeat;background:${colorOf(e.tint, th, '#C9A227')}"></i></div>`;
      }
      return `<div class="pe-el pe-art" style="${box}"${edit}><img alt="" src="${esc(e.src)}" draggable="false"></div>`;
    }
    return '';
  }
  function renderFree(page, opts = {}) {
    const th = themeOf(opts.album);
    const lookup = photoLookup(opts);
    const bg = bgFreeCss(page.bg, th, lookup, opts);
    const els = (page.els || []).map((e, i) => elementHtml(e, i, th, lookup, Object.assign({ section: page.section }, opts))).join('');
    const spread = !!page.s;
    return `<div class="pt-page pe-page"><div class="pt-canvas${spread ? ' pt-spread' : ''}${opts.half ? ' pt-half-' + opts.half : ''}" style="${bg.css}">${bg.layer}${els}</div></div>`;
  }

  // a template page (v1) as free layers, so the advanced editor can change anything on it
  function toElements(page, { album } = {}) {
    const tpl = get(page.t) || BUILTIN['full-mat'];
    const th = themeOf(album);
    const bgKey = page.bg || tpl.bg || 'paper';
    const bg = bgKey === 'silk' ? { type: 'gradient', colors: ['silk', 'silk'], radial: true } : { type: 'color', color: HEX.test(bgKey) ? bgKey : bgKey === 'white' ? '#FFFFFF' : bgKey === 'dark' ? '#17151C' : '#F7F3EE' };
    const dark = onDark(bgKey);
    const els = [];
    tpl.slots.forEach((sl, i) => {
      const placed = (page.p || [])[i] || {};
      const e = { type: 'photo', x: sl.x, y: sl.y, w: sl.w, h: sl.h, m: placed.m || null };
      if (placed.c) e.c = placed.c;
      e.shape = sl.r === 'circle' ? 'circle' : sl.r === 'arch' ? 'arch' : sl.r ? 'rounded' : 'rect';
      if (typeof sl.r === 'number') e.radius = sl.r;
      if (sl.rot) e.rot = sl.rot;
      if (sl.frame === 'shadow') e.shadow = 'soft';
      if (sl.frame === 'polaroid') { e.frame = 'polaroid'; e.shadow = 'soft'; }
      if (sl.frame === 'mat') { e.border = { w: 1.1, color: '#ffffff' }; e.shadow = 'soft'; }
      els.push(e);
    });
    (tpl.texts || []).forEach((t, i) => {
      const own = (page.tx || [])[i];
      els.push({ type: 'text', x: t.x, y: t.y, w: t.w, h: t.h, role: t.role, text: own || '', font: t.font === 'ui' ? 'ui' : 'display',
        size: t.size, align: t.align || 'center', color: COLOR_RE.test(t.color || '') ? t.color : t.color === 'accent' ? 'accent' : t.color === 'silk' ? (dark ? '#FBF7F0' : 'silk') : t.color === 'light' ? '#FBF7F0' : dark ? '#F1ECE3' : '#2A2530' });
    });
    const out = { v: 2, bg, els };
    if (tpl.spread || page.s) out.s = 1;
    return out;
  }
  // every photo id a page uses (both formats), e.g. to mark photos as used
  function photoIds(page) {
    if (!page) return [];
    if (page.v === 2) return [...(page.els || []).filter((e) => e.type === 'photo' && e.m).map((e) => e.m), ...(page.bg && page.bg.type === 'photo' && page.bg.m ? [page.bg.m] : [])];
    return (page.p || []).map((x) => x && x.m).filter(Boolean);
  }

  // ---------- automatic layout ----------
  function rng(seed) {   // mulberry32: the same seed gives the same album, "Shuffle" picks a new seed
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const slotAR = (s, ratio, spread) => (s.w * ratio * (spread ? 2 : 1) * (s.frame === 'polaroid' ? 0.9 : 1)) / (s.h * (s.frame === 'polaroid' ? 0.78 : 1));
  // how badly k photos fit a template's slots, trying the order that fits best (k <= 4) or the given order
  function fit(photos, tpl, ratio) {
    const ars = tpl.slots.map((s) => slotAR(s, ratio, tpl.spread));
    const cost = (order) => order.reduce((sum, ph, i) => sum + Math.abs(Math.log((ph.w / ph.h) / ars[i])), 0);
    if (photos.length > 4) return { cost: cost(photos), order: photos };
    let best = null;
    const perm = (rest, acc) => {
      if (!rest.length) { const c = cost(acc); if (!best || c < best.cost) best = { cost: c, order: acc }; return; }
      rest.forEach((x, i) => perm(rest.filter((_, j) => j !== i), [...acc, x]));
    };
    perm(photos, []);
    return best;
  }
  const DENSITY = {   // how many photos per page, with weights
    fewer: [[1, 0.35], [2, 0.4], [3, 0.2], [4, 0.05]],
    balanced: [[1, 0.18], [2, 0.32], [3, 0.3], [4, 0.17], [6, 0.03]],
    more: [[2, 0.2], [3, 0.3], [4, 0.35], [6, 0.15]],
  };
  function weighted(r, pairs) { let x = r() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) { if ((x -= w) <= 0) return v; } return pairs[0][0]; }

  /* photos: [{ id, w, h, section }] in album order. Returns pages: { gen } entries for the welcome, section and thank-you
     pages, and { t, p: [{ m, c }], s? } photo pages. */
  function autoLayout(photos, { ratio = 1.5, density = 'balanced', sections = true, welcome = true, thanks = true, seed = 1, templates } = {}) {
    const r = rng(seed);
    const pool = (templates || list()).filter((t) => t.auto !== false && t.slots.length && !(t.texts || []).length);
    const bySize = {};
    pool.forEach((t) => { const k = t.slots.length + (t.spread ? 's' : ''); (bySize[k] = bySize[k] || []).push(t); });
    const out = [];
    if (welcome) out.push({ gen: 'title' });
    const groups = [];
    photos.forEach((ph) => { const key = ph.section || ''; let g = groups.find((x) => x.key === key); if (!g) groups.push(g = { key, list: [] }); g.list.push(ph); });
    let last = '', sinceSpread = 0;
    for (const g of groups) {
      if (sections && (g.key || groups.length > 1)) out.push({ gen: 'divider', text: g.key || 'Moments' });
      const q = g.list.slice();
      while (q.length) {
        const head = q[0];
        // a panorama, or now and then a wide photo, goes across two pages
        const wide = head.w / head.h;
        if ((wide > 1.9 || (wide > 1.3 && sinceSpread > 6 && r() < 0.35)) && bySize['1s']) {
          out.push({ t: 'spread-full', s: 1, p: [{ m: q.shift().id }] });
          sinceSpread = 0; last = 'spread-full';
          continue;
        }
        if (sinceSpread > 8 && q.length >= 3 && bySize['3s'] && r() < 0.3) {
          const take = q.splice(0, 3);
          const best = fit(take, bySize['3s'][0], ratio);
          out.push({ t: bySize['3s'][0].key, s: 1, p: best.order.map((ph) => ({ m: ph.id })) });
          sinceSpread = 0; last = bySize['3s'][0].key;
          continue;
        }
        let k = weighted(r, DENSITY[density] || DENSITY.balanced);
        k = Math.min(k, q.length);
        while (k > 1 && !bySize[k]) k--;
        if (q.length - k === 1 && k > 1 && bySize[k + 1]) k++;   // do not leave one photo alone at the end of a section
        const take = q.splice(0, k);
        const scored = (bySize[k] || bySize[1]).map((t) => ({ t, f: fit(take, t, ratio) }))
          .map((x) => ({ ...x, score: x.f.cost + (x.t.key === last ? 1.5 : 0) + r() * 0.35 }))
          .sort((a, b) => a.score - b.score);
        const choice = scored[0];
        out.push({ t: choice.t.key, p: choice.f.order.map((ph) => ({ m: ph.id })) });
        last = choice.t.key; sinceSpread++;
      }
    }
    if (thanks) out.push({ gen: 'closing' });
    return out;
  }

  window.PageTemplates = { list, get, define, forget, render, renderFree, toElements, photoIds, autoLayout, autoText, BUILTIN, cropStyle, slotAR,
    FONTS, FONT_NAMES, SHAPES, POLY, MASK, shapeCss };
})();
