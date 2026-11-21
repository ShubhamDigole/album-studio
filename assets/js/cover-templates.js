/* ==========================================================================
   Cover templates: front cover, back cover (end page) and endpapers drawn as
   live SVG from the album's details. Used by the viewer and the admin page.

   CoverTemplates.render(kind, album, { ratio, photo, placeholders })
       kind: cover | back | inside-front | inside-back | flyleaf
       album.design = { cover: {template, photos:[url]}, back: {template}, endpaper: {template} }   (each optional)
   CoverTemplates.list            [{ key, name, description, occasions, slots }]
   CoverTemplates.register(key, def)   add a design; def = { name, description, occasions, slots,
                                        cover(W,H,d,th,id,photos), back(W,H,d,th,id,photos), motif(color) }
   CoverTemplates.helpers          drawing helpers for designs registered from other files
   ========================================================================== */
(function (root) {
  'use strict';

  const MARIGOLD = '#EFA00B', ORANGE = '#E8641B', JASMINE = '#FBF7F1', PAPER = '#F4EEE6', KOHL = '#1D1A26';
  const DISPLAY = "'Rozha One', Georgia, serif";
  const UI = "Mukta, 'Segoe UI', sans-serif";
  let uid = 0;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (n) => Math.round(n * 10) / 10;
  const TAU = Math.PI * 2;

  /* ---------- album details -> text ---------- */
  const TYPE_LABELS = {
    wedding: 'Wedding', engagement: 'Engagement', 'pre-wedding': 'Pre-wedding', haldi: 'Haldi', mehendi: 'Mehendi',
    sangeet: 'Sangeet', reception: 'Reception', anniversary: 'Anniversary', birthday: 'Birthday',
    'baby-shower': 'Baby shower', maternity: 'Maternity', other: '',
  };
  function fmtDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
  }
  // sample values shown in previews while the details are still empty
  const SAMPLE_NAMES = { birthday: ['Aanya'], 'baby-shower': ['Baby Sharma'], anniversary: ['Meera', 'Rohan'] };
  function details(a, placeholders) {
    let names = (a.names || []).filter(Boolean);
    if (placeholders) {
      if (!names.length && !a.title) names = SAMPLE_NAMES[a.type] || ['Aarav', 'Ananya'];
      a = Object.assign({}, a, { date: a.date || '2026-02-14', location: a.location || 'Udaipur',
        studio: Object.assign({}, a.studio || {}, { name: (a.studio && a.studio.name) || 'Your studio' }) });
    }
    const title = a.title || names.join(' & ') || 'Our album';
    const seg = (t) => { try { return (new Intl.Segmenter().segment(t.trim())[Symbol.iterator]().next().value || {}).segment || ''; } catch (e) { return t.trim()[0] || ''; } };
    const initials = (names.length ? names.slice(0, 2) : [title]).map((n) => seg(n).toUpperCase());
    const studio = a.studio || {};
    return {
      names, title, initials,
      // two names stack as "Name / & / Name" unless a custom title was given
      pair: names.length === 2 && (!a.title || a.title === names.join(' & ')),
      date: fmtDate(a.date),
      place: a.location || '',
      label: TYPE_LABELS[a.type] || '',
      studio: studio.name || '',
      contact: [studio.phone, (studio.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean),
    };
  }

  /* ---------- text helpers ---------- */
  // Rozha One is wide: about 0.56 em per latin character, Devanagari a little more.
  function fit(text, maxW, maxSize) {
    const n = Array.from(text).length || 1;
    const k = /[ऀ-ॿ]/.test(text) ? 0.5 : 0.56;
    return Math.min(maxSize, maxW / (n * k));
  }
  function t(x, y, str, { size, color = JASMINE, family = DISPLAY, anchor = 'middle', opacity = 1, weight = 400, spacing = 0 }) {
    return `<text x="${f(x)}" y="${f(y)}" font-family="${family}" font-size="${f(size)}" font-weight="${weight}" fill="${color}"` +
      ` text-anchor="${anchor}"${opacity < 1 ? ` opacity="${opacity}"` : ''}${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(str)}</text>`;
  }
  // Names as one block: "Aarav / & / Ananya" or a title split over up to two lines. Returns svg + height used.
  function nameBlock(d, cx, top, maxW, maxSize, { anchor = 'middle', color = JASMINE, amp = MARIGOLD } = {}) {
    let out = '', y = top;
    if (d.pair) {
      const size = Math.min(fit(d.names[0], maxW, maxSize), fit(d.names[1], maxW, maxSize));
      y += size * 0.82;
      out += t(cx, y, d.names[0], { size, color, anchor });
      y += size * 0.62;
      out += t(anchor === 'start' ? cx + size * 0.08 : cx, y, '&', { size: size * 0.5, color: amp, anchor });
      y += size * 0.92;
      out += t(cx, y, d.names[1], { size, color, anchor });
      return { svg: out, bottom: y + size * 0.22 };
    }
    const words = d.title.split(/\s+/);
    let lines = [d.title];
    if (d.title.length > 16 && words.length > 1) {
      let best = 1, diff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const dl = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
        if (dl < diff) { diff = dl; best = i; }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    const size = Math.min(...lines.map((l) => fit(l, maxW, maxSize)));
    lines.forEach((l) => { y += size * 0.95; out += t(cx, y, l, { size, color, anchor }); });
    return { svg: out, bottom: y + size * 0.25 };
  }
  function placeLine(d) {
    return [d.label && d.place ? `${d.label} in ${d.place}` : (d.label || d.place), d.date].filter(Boolean);
  }

  /* ---------- shared drawing ---------- */
  function silkDefs(id, silk) {
    return `<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".36" stop-color="#fff" stop-opacity=".075"/>
        <stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".74" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <pattern id="${id}tw" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="7" fill="#fff" opacity=".035"/></pattern>
      <radialGradient id="${id}fo" cx=".5" cy=".46" r=".78"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></radialGradient>
      <linearGradient id="${id}foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7D27A"/><stop offset=".5" stop-color="${MARIGOLD}"/><stop offset="1" stop-color="#B7740A"/></linearGradient>`;
  }
  function silkBg(id, W, H, silk) {
    return `<rect width="${W}" height="${H}" fill="${silk}"/><rect width="${W}" height="${H}" fill="url(#${id}tw)"/>` +
      `<rect width="${W}" height="${H}" fill="url(#${id}sh)"/><rect width="${W}" height="${H}" fill="url(#${id}fo)"/>`;
  }
  // a pointed arch with cusped (multi-foil) edge, like a Rajasthani jharokha
  function cuspedArch(cx, top, w, bottom, lobes = 9, cusp = 0.32) {
    const half = w / 2, spring = top + w * 0.62;
    const r = w * 0.78;           // radius of each side of the pointed arch
    const pts = [];
    // left side: centre at (cx - half + r, spring), from angle 180deg up to the apex
    const cL = { x: cx - half + r, y: spring }, cR = { x: cx + half - r, y: spring };
    const apexAng = Math.acos((cx - cL.x) / r);  // angle where the two arcs meet
    const a0 = Math.PI, a1 = TAU - apexAng;
    const n = Math.ceil(lobes / 2);
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([cL.x + r * Math.cos(a), cL.y + r * Math.sin(a)]); }
    const right = [];
    for (let i = n - 1; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); right.push([cR.x - r * Math.cos(a), cR.y + r * Math.sin(a)]); }
    const all = pts.concat(right);
    let d = `M${f(cx - half)} ${f(bottom)} L${f(all[0][0])} ${f(all[0][1])}`;
    for (let i = 1; i < all.length; i++) {
      const [x0, y0] = all[i - 1], [x1, y1] = all[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      d += ` A${f(seg * (0.5 + cusp))} ${f(seg * (0.5 + cusp))} 0 0 1 ${f(x1)} ${f(y1)}`;
    }
    return d + ` L${f(cx + half)} ${f(bottom)} Z`;
  }
  function petal(len, wid) { return `M0 0 C${f(wid)} ${f(-len * 0.35)} ${f(wid * 0.6)} ${f(-len * 0.85)} 0 ${f(-len)} C${f(-wid * 0.6)} ${f(-len * 0.85)} ${f(-wid)} ${f(-len * 0.35)} 0 0Z`; }
  function mandala(cx, cy, R, stroke, opacity = 1, sw = 2) {
    let g = `<g transform="translate(${f(cx)} ${f(cy)})" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}">`;
    const rings = [0.16, 0.3, 0.46, 0.62, 0.8, 1];
    rings.forEach((k, ri) => {
      const r = R * k, prev = ri ? R * rings[ri - 1] : 0;
      const count = 8 + ri * 4;
      const len = (r - prev) * 0.95, wid = (TAU * r / count) * 0.36;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * 360 + (ri % 2 ? 180 / count : 0);
        g += `<path transform="rotate(${f(a)}) translate(0 ${f(-prev)})" d="${petal(len, wid)}"/>`;
      }
      g += `<circle r="${f(r)}" stroke-width="${sw * 0.6}"/>`;
      if (ri % 2 === 0) {
        const dots = count * 2;
        for (let i = 0; i < dots; i++) { const a = (i / dots) * TAU; g += `<circle cx="${f(Math.cos(a) * (r + R * 0.03))}" cy="${f(Math.sin(a) * (r + R * 0.03))}" r="${f(sw * 1.4)}" fill="${stroke}" stroke="none"/>`; }
      }
    });
    return g + `<circle r="${f(R * 0.06)}" fill="${stroke}"/></g>`;
  }
  function marigold(cx, cy, r, color) {
    let p = `<g transform="translate(${f(cx)} ${f(cy)})">`;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; p += `<circle cx="${f(Math.cos(a) * r * 0.62)}" cy="${f(Math.sin(a) * r * 0.62)}" r="${f(r * 0.48)}" fill="${color}"/>`; }
    return p + `<circle r="${f(r * 0.55)}" fill="${color}"/><circle r="${f(r * 0.32)}" fill="#000" opacity=".12"/></g>`;
  }
  const AMBI = 'M0 46 C-30 46 -44 16 -34 -10 C-24 -36 8 -48 26 -34 C40 -22 36 -2 22 2 C12 5 6 -4 13 -11 C17 -15 23 -12 22 -7';
  function ambi(x, y, s, rot, { fill = 'none', stroke = 'none', sw = 2, opacity = 1 } = {}) {
    return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)})" d="${AMBI}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw / s)}" opacity="${opacity}" stroke-linecap="round"/>`;
  }
  function lotus(cx, cy, s, fill, edge) {
    let g = `<g transform="translate(${f(cx)} ${f(cy)}) scale(${f(s)})" stroke="${edge}" stroke-width="2">`;
    [[-62, 150, 46], [62, 150, 46], [-36, 170, 50], [36, 170, 50]].forEach(([a, l, w]) => { g += `<path transform="rotate(${a})" d="${petal(l, w)}" fill="${fill}" opacity=".7"/>`; });
    [[-18, 190, 46], [18, 190, 46], [0, 205, 48]].forEach(([a, l, w]) => { g += `<path transform="rotate(${a})" d="${petal(l, w)}" fill="${fill}"/>`; });
    return g + '</g>';
  }
  function zari(y, W, color, h = 26) {
    let g = `<g fill="${color}" opacity=".9"><rect x="0" y="${f(y)}" width="${W}" height="1.6"/><rect x="0" y="${f(y + h)}" width="${W}" height="1.6"/>`;
    for (let x = 20; x < W; x += 40) g += `<path d="M${x} ${f(y + 6)}c4 3 4 ${f(h - 12)} 0 ${f(h - 12)}-4-3-4-${f(h - 12)} 0-${f(h - 12)}z"/><circle cx="${x - 20}" cy="${f(y + h / 2)}" r="2"/>`;
    return g + '</g>';
  }
  function monogram(cx, cy, r, d, { ring = MARIGOLD, color = JASMINE, size } = {}) {
    const txt = d.initials.join(d.initials.length > 1 ? ' ' : '');
    const fs = size || fit(txt, r * 1.5, r * 0.9);
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${ring}" stroke-width="2.2"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.9)}" fill="none" stroke="${ring}" stroke-width="1" opacity=".6"/>` +
      t(cx, cy + fs * 0.34, txt, { size: fs, color });
  }
  function studioBlock(d, cx, y, color = JASMINE) {
    if (!d.studio) return '';
    let s = t(cx, y, 'Photographs by', { size: 28, color, family: UI, opacity: 0.75 }) + t(cx, y + 56, d.studio, { size: 48, color });
    d.contact.forEach((c, i) => { s += t(cx, y + 108 + i * 36, c, { size: 27, color, family: UI, opacity: 0.75 }); });
    return s;
  }

  /* ---------- templates ---------- */
  const TEMPLATES = {
    jharokha: {
      name: 'Jharokha',
      occasions: ['wedding', 'reception', 'sangeet', 'other'],
      description: 'A carved Rajasthani arch with a marigold toran',
      motif: (c) => `<path d="${cuspedArch(30, 8, 36, 56, 7)}" fill="none" stroke="${c}" stroke-width="2"/>`,
      cover(W, H, d, th, id) {
        const aw = Math.min(W * 0.44, H * 0.6), top = H * 0.19, bottom = H * 0.86;
        let s = silkBg(id, W, H, th.silk);
        // arcade of faint arches behind
        const n = Math.ceil(W / (H * 0.22)) + 1;
        for (let i = 0; i < n; i++) s += `<path d="${cuspedArch(i * H * 0.22, H * 0.62, H * 0.18, H, 7, 0.25)}" fill="#fff" opacity=".035"/>`;
        // toran: a sagging garland across the top with hanging drops
        let garland = '';
        const steps = Math.floor(W / 34);
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * W, y = H * 0.03 + Math.sin((i / steps) * Math.PI) * H * 0.03;
          garland += marigold(x, y, 11, i % 3 === 0 ? ORANGE : MARIGOLD);
          if (i % 4 === 2) garland += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x)}" y2="${f(y + 40)}" stroke="${MARIGOLD}" stroke-width="1.5"/>` + `<path transform="translate(${f(x)} ${f(y + 40)}) rotate(180)" d="${petal(24, 9)}" fill="${th.accent}"/>`;
        }
        s += `<g>${garland}</g>`;
        s += `<path d="${cuspedArch(W / 2, top, aw * 1.08, bottom + 8)}" fill="#000" opacity=".22"/>`;
        s += `<path d="${cuspedArch(W / 2, top, aw * 1.08, bottom + 8)}" fill="none" stroke="url(#${id}foil)" stroke-width="4"/>`;
        s += `<path d="${cuspedArch(W / 2, top + aw * 0.06, aw * 0.96, bottom)}" fill="none" stroke="${MARIGOLD}" stroke-width="1.4" opacity=".75"/>`;
        // finial
        s += `<g transform="translate(${f(W / 2)} ${f(top - 6)})"><path d="${petal(44, 14)}" fill="url(#${id}foil)"/><circle cy="4" r="7" fill="url(#${id}foil)"/></g>`;
        const nb = nameBlock(d, W / 2, H * 0.36, aw * 0.78, H * 0.13);
        s += nb.svg;
        placeLine(d).forEach((l, i) => { s += t(W / 2, Math.min(nb.bottom + 50 + i * 42, bottom - 64 + i * 42), l, { size: 32, family: UI, opacity: 0.88 }); });
        return s + zari(H - 54, W, MARIGOLD);
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        const n = Math.ceil(W / (H * 0.22)) + 1;
        for (let i = 0; i < n; i++) s += `<path d="${cuspedArch(i * H * 0.22, H * 0.62, H * 0.18, H, 7, 0.25)}" fill="#fff" opacity=".035"/>`;
        const aw = H * 0.3;
        s += `<path d="${cuspedArch(W / 2, H * 0.12, aw, H * 0.5)}" fill="#000" opacity=".2" stroke="url(#${id}foil)" stroke-width="3"/>`;
        s += t(W / 2, H * 0.4, d.initials.join(' '), { size: fit(d.initials.join(' '), aw * 0.7, H * 0.12) });
        return s + studioBlock(d, W / 2, H * 0.64) + zari(H - 54, W, MARIGOLD);
      },
    },

    mandala: {
      name: 'Mandala',
      occasions: ['wedding', 'engagement', 'mehendi', 'anniversary', 'other'],
      description: 'A large hand-drawn mandala rising behind the names',
      motif: (c) => mandala(30, 30, 15, c, 1, 0.8),
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        s += mandala(W * 0.8, H * 0.5, H * 0.66, th.accent, 0.55, 2.2);
        s += mandala(W * 0.8, H * 0.5, H * 0.3, MARIGOLD, 0.8, 1.6);
        s += mandala(0, H, H * 0.36, '#fff', 0.08, 2);
        const x = W * 0.08;
        s += `<rect x="${f(x)}" y="${f(H * 0.2)}" width="64" height="4" fill="url(#${id}foil)"/>`;
        const nb = nameBlock(d, x, H * 0.24, W * 0.5, H * 0.15, { anchor: 'start' });
        s += nb.svg;
        placeLine(d).forEach((l, i) => { s += t(x, nb.bottom + 46 + i * 36, l, { size: 33, family: UI, anchor: 'start', opacity: 0.88 }); });
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        s += mandala(W / 2, H * 0.4, H * 0.34, th.accent, 0.5, 2);
        s += `<circle cx="${f(W / 2)}" cy="${f(H * 0.4)}" r="${f(H * 0.11)}" fill="${th.silk}"/>`;
        s += monogram(W / 2, H * 0.4, H * 0.1, d);
        return s + studioBlock(d, W / 2, H * 0.74);
      },
    },

    toran: {
      name: 'Marigold toran',
      occasions: ['haldi', 'sangeet', 'wedding', 'mehendi'],
      description: 'Strings of marigold and festive bunting from the top edge',
      motif: (c) => marigold(30, 30, 12, c),
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        // bunting
        const flags = Math.floor(W / 60);
        let b = `<path d="M0 ${f(H * 0.02)} Q${f(W / 2)} ${f(H * 0.12)} ${W} ${f(H * 0.02)}" fill="none" stroke="${MARIGOLD}" stroke-width="2"/>`;
        for (let i = 0; i < flags; i++) {
          const x = (i + 0.5) * (W / flags), tt = x / W, y = H * 0.02 + 4 * tt * (1 - tt) * H * 0.05;
          b += `<path d="M${f(x - 22)} ${f(y)} L${f(x + 22)} ${f(y)} L${f(x)} ${f(y + 46)}Z" fill="${i % 2 ? th.accent : MARIGOLD}" opacity=".95"/>`;
        }
        // hanging strands, longer at the sides so the middle stays clear for the names
        const strands = 11;
        for (let i = 0; i < strands; i++) {
          const x = (i + 0.5) * (W / strands), off = Math.abs(i - (strands - 1) / 2) / ((strands - 1) / 2);
          const len = H * (0.12 + off * 0.5), tt = x / W, y0 = H * 0.02 + 4 * tt * (1 - tt) * H * 0.05;
          let str = `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y0 + len)}" stroke="${MARIGOLD}" stroke-width="1.3" opacity=".7"/>`;
          for (let y = y0 + 30; y < y0 + len; y += 25) str += marigold(x, y, 11, Math.round(y / 25) % 4 === 0 ? ORANGE : MARIGOLD);
          str += `<path transform="translate(${f(x)} ${f(y0 + len + 6)}) rotate(180)" d="${petal(30, 10)}" fill="${th.accent}"/>`;
          s += str;
        }
        s += b;
        const nb = nameBlock(d, W / 2, H * 0.42, W * 0.5, H * 0.13);
        s += nb.svg;
        placeLine(d).forEach((l, i) => { s += t(W / 2, nb.bottom + 44 + i * 42, l, { size: 32, family: UI, opacity: 0.88 }); });
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        for (let i = 0; i < 7; i++) {
          const x = (i + 0.5) * (W / 7), len = H * (0.08 + (i % 2) * 0.06);
          s += `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${f(len)}" stroke="${MARIGOLD}" stroke-width="1.3" opacity=".7"/>`;
          for (let y = 22; y < len; y += 25) s += marigold(x, y, 10, MARIGOLD);
        }
        s += monogram(W / 2, H * 0.42, H * 0.12, d);
        return s + studioBlock(d, W / 2, H * 0.68);
      },
    },

    lotus: {
      name: 'Lotus pond',
      occasions: ['wedding', 'anniversary', 'baby-shower', 'maternity', 'reception'],
      description: 'A lotus opening on still water, ripples and lily pads',
      motif: (c) => `<g transform="translate(30 44) scale(.14)" fill="none" stroke="${c}" stroke-width="12"><path d="${petal(205, 48)}"/><path transform="rotate(-40)" d="${petal(170, 46)}"/><path transform="rotate(40)" d="${petal(170, 46)}"/></g>`,
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        s += `<defs><linearGradient id="${id}pt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="#FFE3EC"/></linearGradient></defs>`;
        const cy = H * 0.84;
        for (let i = 1; i <= 6; i++) s += `<ellipse cx="${f(W / 2)}" cy="${f(cy + 18)}" rx="${f(i * W * 0.085)}" ry="${f(i * H * 0.022)}" fill="none" stroke="#fff" stroke-width="1.5" opacity="${f(0.16 - i * 0.02)}"/>`;
        [[0.2, 0.9, 70, 20], [0.3, 0.97, 50, -30], [0.74, 0.92, 80, 160], [0.86, 0.86, 46, 200], [0.12, 0.8, 38, 90]].forEach(([x, y, r, rot]) => {
          s += `<path transform="translate(${f(W * x)} ${f(H * y)}) rotate(${rot}) scale(1 .38)" d="M0 0 L${r} -8 A${r} ${r} 0 1 1 ${r} 8Z" fill="#000" opacity=".22" stroke="${MARIGOLD}" stroke-width="1.5" stroke-opacity=".4"/>`;
        });
        s += lotus(W / 2, cy, H / 1000 * 1.05, `url(#${id}pt)`, MARIGOLD);
        const nb = nameBlock(d, W / 2, H * 0.12, W * 0.6, H * 0.13);
        s += nb.svg;
        placeLine(d).forEach((l, i) => { s += t(W / 2, nb.bottom + 42 + i * 42, l, { size: 32, family: UI, opacity: 0.88 }); });
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        s += `<defs><linearGradient id="${id}pt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="#FFE3EC"/></linearGradient></defs>`;
        for (let i = 1; i <= 4; i++) s += `<ellipse cx="${f(W / 2)}" cy="${f(H * 0.46)}" rx="${f(i * 60)}" ry="${f(i * 15)}" fill="none" stroke="#fff" stroke-width="1.5" opacity="${f(0.14 - i * 0.025)}"/>`;
        s += lotus(W / 2, H * 0.44, H / 1000 * 0.6, `url(#${id}pt)`, MARIGOLD);
        s += t(W / 2, H * 0.6, d.initials.join(' '), { size: H * 0.07 });
        return s + studioBlock(d, W / 2, H * 0.72);
      },
    },

    paisley: {
      name: 'Paisley',
      occasions: ['mehendi', 'wedding', 'engagement', 'reception'],
      description: 'Tone-on-tone ambi scattered like brocade, with a foil label',
      motif: (c) => ambi(30, 28, 0.5, 20, { stroke: c, sw: 2 }),
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        // deterministic scatter
        let seed = 7;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 26; i++) {
          const x = rnd() * W, y = rnd() * H, sc = 1.2 + rnd() * 2.4, rot = rnd() * 360;
          if (i % 5 === 0) s += ambi(x, y, sc, rot, { stroke: MARIGOLD, sw: 2, opacity: 0.5 }) + ambi(x, y, sc * 0.62, rot, { stroke: MARIGOLD, sw: 1.4, opacity: 0.35 });
          else s += ambi(x, y, sc, rot, { fill: '#fff', opacity: 0.035 }) + ambi(x, y, sc, rot, { stroke: '#fff', sw: 1.6, opacity: 0.09 }) + ambi(x, y, sc * 0.6, rot, { stroke: '#fff', sw: 1.2, opacity: 0.08 });
        }
        const pw = Math.min(W * 0.56, H * 0.95), ph = H * 0.58, px = (W - pw) / 2, py = (H - ph) / 2, n = 26;
        const label = `M${px + n} ${py} H${px + pw - n} A${n} ${n} 0 0 0 ${px + pw} ${py + n} V${py + ph - n} A${n} ${n} 0 0 0 ${px + pw - n} ${py + ph} H${px + n} A${n} ${n} 0 0 0 ${px} ${py + ph - n} V${py + n} A${n} ${n} 0 0 0 ${px + n} ${py}Z`;
        s += `<path d="${label}" fill="${th.silk}"/><path d="${label}" fill="#000" opacity=".25"/>`;
        s += `<path d="${label}" fill="none" stroke="url(#${id}foil)" stroke-width="4"/>`;
        s += `<path d="${label}" transform="translate(${f(W / 2)} ${f(H / 2)}) scale(.94) translate(${f(-W / 2)} ${f(-H / 2)})" fill="none" stroke="${MARIGOLD}" stroke-width="1.2" opacity=".7"/>`;
        s += ambi(W / 2 - 14, py + 58, 0.75, 0, { fill: `url(#${id}foil)` });
        const nb = nameBlock(d, W / 2, py + ph * 0.18, pw * 0.8, ph * 0.22);
        s += nb.svg;
        placeLine(d).forEach((l, i) => { s += t(W / 2, Math.min(nb.bottom + 40 + i * 34, py + ph - 50 + i * 34), l, { size: 30, family: UI, opacity: 0.88 }); });
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        let seed = 3;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 18; i++) { const x = rnd() * W, y = rnd() * H, sc = 1 + rnd() * 2, r = rnd() * 360; s += ambi(x, y, sc, r, { stroke: '#fff', sw: 1.6, opacity: 0.09 }) + ambi(x, y, sc * 0.6, r, { stroke: '#fff', sw: 1.2, opacity: 0.07 }); }
        s += monogram(W / 2, H * 0.36, H * 0.12, d);
        return s + studioBlock(d, W / 2, H * 0.64);
      },
    },

    photo: {
      name: 'Photo cover',
      description: 'Your favourite photo full-bleed, names set over it',
      needsPhoto: true,
      slots: 1,
      occasions: ['wedding', 'engagement', 'pre-wedding', 'reception', 'anniversary', 'birthday', 'maternity', 'other'],
      motif: (c) => `<rect x="14" y="14" width="32" height="32" fill="none" stroke="${c}" stroke-width="2" transform="rotate(45 30 30)"/>`,
      cover(W, H, d, th, id, photos) {
        const photo = photos && photos[0];
        if (!photo) return TEMPLATES.jharokha.cover(W, H, d, th, id);
        let s = `<defs><linearGradient id="${id}ph" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="${th.silk}" stop-opacity="0"/><stop offset="1" stop-color="${th.silk}" stop-opacity=".95"/></linearGradient></defs>`;
        s += `<rect width="${W}" height="${H}" fill="${th.silk}"/><image href="${esc(photo)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
        s += `<rect width="${W}" height="${H}" fill="url(#${id}ph)"/>`;
        s += `<rect x="${f(W * 0.035)}" y="${f(H * 0.05)}" width="${f(W * 0.93)}" height="${f(H * 0.9)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>`;
        const x = W * 0.08;
        const lines = placeLine(d);
        const nameText = d.pair ? `${d.names[0]} & ${d.names[1]}` : d.title;
        const size = fit(nameText, W * 0.8, H * 0.12);
        const base = H * 0.86 - lines.length * 36;
        s += t(x, base, nameText, { size, anchor: 'start' });
        s += `<rect x="${f(x)}" y="${f(base + 24)}" width="64" height="3" fill="${MARIGOLD}"/>`;
        lines.forEach((l, i) => { s += t(x, base + 70 + i * 34, l, { size: 32, family: UI, anchor: 'start', opacity: 0.92 }); });
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        s += monogram(W / 2, H * 0.38, H * 0.12, d);
        return s + studioBlock(d, W / 2, H * 0.64);
      },
    },
  };

  // Endpapers: printed pattern paper inside the hard covers.
  function endpaper(W, H, d, th, id, tpl, isBack) {
    const motif = (tpl.motif || TEMPLATES.jharokha.motif);
    let s = `<defs><pattern id="${id}ep" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="scale(1.6)">` +
      `<g opacity=".5">${motif(th.silk)}</g><g transform="translate(30 30) scale(.4) translate(-30 -30)" opacity=".6">${motif(th.accent)}</g></pattern></defs>`;
    s += `<rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="${H}" fill="url(#${id}ep)" opacity=".55"/>`;
    if (isBack && d.studio) {
      s += `<rect x="${f(W / 2 - 260)}" y="${f(H / 2 - 70)}" width="520" height="140" fill="${PAPER}"/>`;
      s += t(W / 2, H / 2 - 8, 'Photographs by', { size: 22, color: KOHL, family: UI, opacity: 0.65 }) + t(W / 2, H / 2 + 38, d.studio, { size: 36, color: th.silk });
    }
    return s;
  }

  // the design used for an album type when nothing was chosen (falls back to jharokha if not registered)
  const DEFAULT_FOR = {
    wedding: 'jharokha', engagement: 'rings', 'pre-wedding': 'polaroids', haldi: 'haldi-splash', mehendi: 'henna',
    sangeet: 'dhol-beats', reception: 'fairy-lights', anniversary: 'golden-years', birthday: 'balloons',
    'baby-shower': 'moon-stars', maternity: 'moon-stars', other: 'minimal-foil',
  };
  function defaultFor(type) { return TEMPLATES[DEFAULT_FOR[type]] ? DEFAULT_FOR[type] : 'jharokha'; }
  function designFor(album, part) {
    const pick = (album.design && album.design[part]) || {};
    const want = pick.template || album.template || defaultFor(album.type);
    return { key: TEMPLATES[want] ? want : defaultFor(album.type), photos: pick.photos || [], upload: pick.upload || '' };
  }

  function render(kind, album, opts = {}) {
    const ratio = opts.ratio || (album.pageWidth && album.pageHeight ? album.pageWidth / album.pageHeight : 1.5);
    const H = 1000, W = Math.round(H * ratio);
    const part = kind === 'cover' ? 'cover' : kind === 'back' ? 'back' : 'endpaper';
    const pick = designFor(album, part);
    const tpl = TEMPLATES[pick.key];
    const th = { silk: (album.theme && album.theme.silk) || '#0F3D3E', accent: (album.theme && album.theme.accent) || '#C8255F' };
    const d = details(album, opts.placeholders);
    const id = 'ct' + (++uid) + '_';
    const photos = pick.photos.length ? pick.photos : [opts.photo || album.coverPhotoUrl].filter(Boolean);
    let body;
    if (kind === 'title' || kind === 'divider' || kind === 'closing') {
      // inner pages for albums made from uploaded photos: in the family of the cover design
      const c = TEMPLATES[designFor(album, 'cover').key];
      const motif = c.motif || TEMPLATES.jharokha.motif;
      const ink = '#1D1A26';
      if (kind === 'divider') {
        body = silkBg(id, W, H, th.silk) +
          `<g transform="translate(${f(W / 2 - 60)} ${f(H * 0.3)}) scale(2)" opacity=".9">${motif(MARIGOLD)}</g>` +
          t(W / 2, H * 0.6, opts.text || 'Moments', { size: fit(opts.text || 'Moments', W * 0.8, 150) }) +
          zari(H - 54, W, MARIGOLD);
      } else if (kind === 'title') {
        body = `<rect width="${W}" height="${H}" fill="#F7F3EE"/>` +
          `<g transform="translate(${f(W / 2 - 45)} ${f(H * 0.16)}) scale(1.5)">${motif(th.accent)}</g>` +
          nameBlock(d, W / 2, H * 0.3, W * 0.7, 130, { color: th.silk, amp: th.accent }).svg +
          placeLine(d).map((l, i) => t(W / 2, H * 0.8 + i * 44, l, { size: 32, color: ink, family: UI, opacity: 0.75 })).join('');
      } else {
        body = `<rect width="${W}" height="${H}" fill="#F7F3EE"/>` +
          t(W / 2, H * 0.46, 'Thank you', { size: fit('Thank you', W * 0.7, 130), color: th.silk }) +
          `<g transform="translate(${f(W / 2 - 30)} ${f(H * 0.54)})">${motif(th.accent)}</g>` +
          t(W / 2, H * 0.7, 'for being part of our story', { size: 32, color: ink, family: UI, opacity: 0.7 });
      }
    } else if (pick.upload) {
      // the photographer's own image for this part
      body = `<rect width="${W}" height="${H}" fill="${th.silk}"/><image href="${esc(pick.upload)}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
    } else if (kind === 'cover') body = tpl.cover(W, H, d, th, id, photos);
    else if (kind === 'back') body = (tpl.back || TEMPLATES.jharokha.back)(W, H, d, th, id, photos);
    else body = endpaper(W, H, d, th, id, tpl, kind === 'inside-back');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(d.title)}">` +
      `<defs>${silkDefs(id, th.silk)}</defs>${body}</svg>`;
  }

  // A photo window for designs with photo slots. shape: rect | circle | arch. Without a photo it shows a soft placeholder.
  function photoSlot(id, n, x, y, w, h, href, { shape = 'rect', stroke = MARIGOLD, sw = 4, radius = 0 } = {}) {
    const cid = id + 'slot' + n;
    let clip;
    if (shape === 'circle') clip = `<circle cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(Math.min(w, h) / 2)}"/>`;
    else if (shape === 'arch') clip = `<path d="M${f(x)} ${f(y + h)} V${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} V${f(y + h)} Z"/>`;
    else clip = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${radius}"/>`;
    const fill = href
      ? `<image href="${esc(href)}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`
      : `<g clip-path="url(#${cid})"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#000" opacity=".22"/>` +
        `<path d="M${f(x)} ${f(y + h)} L${f(x + w * 0.35)} ${f(y + h * 0.55)} L${f(x + w * 0.55)} ${f(y + h * 0.75)} L${f(x + w * 0.75)} ${f(y + h * 0.45)} L${f(x + w)} ${f(y + h * 0.8)} V${f(y + h)}Z" fill="#fff" opacity=".12"/>` +
        `<circle cx="${f(x + w * 0.72)}" cy="${f(y + h * 0.28)}" r="${f(Math.min(w, h) * 0.08)}" fill="#fff" opacity=".18"/></g>`;
    const outline = clip.replace(/\/>$/, ` fill="none" stroke="${stroke}" stroke-width="${sw}"/>`);
    return `<defs><clipPath id="${cid}">${clip}</clipPath></defs>${fill}${outline}`;
  }

  root.CoverTemplates = {
    render,
    get list() {
      return Object.entries(TEMPLATES).map(([key, v]) => ({ key, name: v.name, description: v.description,
        occasions: v.occasions || [], slots: v.slots || 0, needsPhoto: !!v.needsPhoto }));
    },
    get keys() { return Object.keys(TEMPLATES); },
    defaultFor,
    designFor,
    register(key, def) { TEMPLATES[key] = def; },
    helpers: { MARIGOLD, ORANGE, JASMINE, PAPER, KOHL, DISPLAY, UI, TAU, esc, f, fit, t, details, nameBlock, placeLine, silkBg,
      cuspedArch, petal, mandala, marigold, ambi, lotus, zari, monogram, studioBlock, photoSlot, endpaperOf: (tpl) => tpl.motif },
  };
})(typeof window !== 'undefined' ? window : globalThis);
