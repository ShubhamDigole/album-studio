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
  function rgb(c) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  // blend colour a towards b by k (0..1); falls back to a for non-hex colours
  function mix(a, b, k) {
    const A = rgb(a), B = rgb(b);
    if (!A || !B) return a;
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }

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
      <linearGradient id="${id}foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7D27A"/><stop offset=".5" stop-color="${MARIGOLD}"/><stop offset="1" stop-color="#B7740A"/></linearGradient>
      <filter id="${id}gr" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4" result="n"/>
        <feColorMatrix in="n" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -1.85" result="w"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 1.25" result="b"/>
        <feMerge><feMergeNode in="w"/><feMergeNode in="b"/></feMerge></filter>`;
  }
  function silkBg(id, W, H, silk) {
    return `<rect width="${W}" height="${H}" fill="${silk}"/><rect width="${W}" height="${H}" fill="url(#${id}tw)"/>` +
      `<rect width="${W}" height="${H}" fill="url(#${id}sh)"/><rect width="${W}" height="${H}" fill="url(#${id}fo)"/>` + grain(id, W, H);
  }
  // fine fibre grain, like raw silk or cotton paper
  const grain = (id, W, H, op = 0.16) => `<rect width="${W}" height="${H}" filter="url(#${id}gr)" opacity="${op}"/>`;
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
  // a genda flower seen from above: three rings of ruffled petals, darker underneath
  function marigold(cx, cy, r, color) {
    const dark = mix(color, '#7A2E00', 0.38), light = mix(color, '#FFE7A0', 0.3);
    let p = `<g transform="translate(${f(cx)} ${f(cy)})"><circle r="${f(r * 1.02)}" fill="${dark}"/>`;
    [[12, 0.66, 0.4, dark, 0], [10, 0.48, 0.36, color, 0.3], [7, 0.27, 0.3, light, 0.1]].forEach(([n, rad, pr, c, off]) => {
      for (let i = 0; i < n; i++) { const a = (i / n + off) * TAU; p += `<circle cx="${f(Math.cos(a) * r * rad)}" cy="${f(Math.sin(a) * r * rad)}" r="${f(r * pr)}" fill="${c}"/>`; }
    });
    return p + `<circle r="${f(r * 0.14)}" fill="${dark}"/></g>`;
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
  // initials as a lockup: "S & S" with a smaller ampersand in the accent colour
  function iniLock(cx, y, d, maxW, maxSize, { color = JASMINE, amp = MARIGOLD, anchor = 'middle' } = {}) {
    const ini = d.initials;
    if (ini.length < 2) return t(cx, y, ini[0] || '', { size: fit(ini[0] || '', maxW, maxSize), color, anchor });
    const size = fit(ini[0] + ini[1] + '&', maxW, maxSize), k = size * 0.5;
    return `<text x="${f(cx)}" y="${f(y)}" font-family="${DISPLAY}" font-size="${f(size)}" fill="${color}" text-anchor="${anchor}">${esc(ini[0])}` +
      `<tspan font-size="${f(k)}" fill="${amp}" dx="${f(size * 0.1)}" dy="${f(-size * 0.12)}">&amp;</tspan><tspan dx="${f(size * 0.1)}" dy="${f(size * 0.12)}">${esc(ini[1])}</tspan></text>`;
  }
  function monogram(cx, cy, r, d, { ring = MARIGOLD, color = JASMINE, size } = {}) {
    const fs = size || fit('SS&', r * 1.35, r * 0.85);
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${ring}" stroke-width="2.2"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.9)}" fill="none" stroke="${ring}" stroke-width="1" opacity=".6"/>` +
      iniLock(cx, cy + fs * 0.34, d, r * 1.35, fs, { color, amp: ring });
  }
  function studioBlock(d, cx, y, color = JASMINE, maxW = 600) {
    if (!d.studio) return '';
    let s = t(cx, y, 'Photographs by', { size: 28, color, family: UI, opacity: 0.75 }) + t(cx, y + 56, d.studio, { size: fit(d.studio, maxW, 48), color });
    d.contact.forEach((c, i) => { s += t(cx, y + 108 + i * 36, c, { size: 27, color, family: UI, opacity: 0.75 }); });
    return s;
  }

  /* ---------- small utilities ---------- */
  // deterministic generator (mulberry32) so every render of a design is identical
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const isWide = (W, H) => W >= H * 1.25;

  // closed (or open) Catmull-Rom curve through points, as cubic beziers
  function smooth(pts, closed = true) {
    const n = pts.length;
    const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    let s = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      s += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return s + (closed ? 'Z' : '');
  }
  function star(cx, cy, R, r, n = 5, rot = -90) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const a = (rot + (i * 180) / n) * Math.PI / 180, rr = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
    }
    return d + 'Z';
  }
  // four-pointed glint with concave sides
  const glint = (x, y, s) => `M${f(x)} ${f(y - s)} Q${f(x)} ${f(y)} ${f(x + s * 0.7)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)} Q${f(x)} ${f(y)} ${f(x - s * 0.7)} ${f(y)} Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Z`;
  // a leaf pointing up from (0,0), length len, half-width wid, with a slight lean
  const leaf = (len, wid, lean = 0.15) => `M0 0 C${f(wid * 1.1)} ${f(-len * 0.25)} ${f(wid * (0.9 + lean))} ${f(-len * 0.7)} ${f(len * lean * 0.3)} ${f(-len)} C${f(-wid * (0.9 - lean))} ${f(-len * 0.7)} ${f(-wid * 1.1)} ${f(-len * 0.25)} 0 0Z`;

  // names on one line, "Aarav & Ananya", the ampersand in the accent colour
  function pairLine(d, x, y, maxW, maxSize, { anchor = 'middle', color = JASMINE, amp = MARIGOLD } = {}) {
    const txt = d.pair ? `${d.names[0]} & ${d.names[1]}` : d.title;
    const size = fit(txt, maxW, maxSize);
    const inner = d.pair ? `${esc(d.names[0])} <tspan fill="${amp}">&amp;</tspan> ${esc(d.names[1])}` : esc(d.title);
    return { size, svg: `<text x="${f(x)}" y="${f(y)}" font-family="${DISPLAY}" font-size="${f(size)}" fill="${color}" text-anchor="${anchor}">${inner}</text>` };
  }
  function lineSvg(lines, x, y, { anchor = 'middle', color = JASMINE, size = 32, gap = 44, opacity = 0.88, weight = 400 } = {}) {
    return lines.map((l, i) => t(x, y + i * gap, l, { size, color, family: UI, anchor, opacity, weight })).join('');
  }
  // name block + place/date lines, centred vertically on cy
  function stack(d, cx, cy, maxW, maxSize, o = {}) {
    const { anchor = 'middle', color = JASMINE, amp = MARIGOLD, lineColor = color, size = 32, gap = 44, first = 50, opacity = 0.88, weight = 400, lines = placeLine(d), pre = '' } = o;
    const probe = nameBlock(d, cx, 0, maxW, maxSize, { anchor, color, amp });
    const total = probe.bottom + (lines.length ? first + (lines.length - 1) * gap : 0);
    const top = cy - total / 2;
    const nb = nameBlock(d, cx, top, maxW, maxSize, { anchor, color, amp });
    return { top, bottom: top + total, svg: pre + nb.svg + lineSvg(lines, cx, nb.bottom + first, { anchor, color: lineColor, size, gap, opacity, weight }) };
  }

  // dense points along a Catmull-Rom curve through pts, `per` samples per segment
  function curvePts(pts, closed = true, per = 12) {
    const n = pts.length, out = [];
    const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let j = 0; j < per; j++) {
        const u = j / per, u2 = u * u, u3 = u2 * u;
        out.push([0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3)));
      }
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }
  function rose(x, y, r, c) {
    return `<g transform="translate(${f(x)} ${f(y)})"><circle r="${f(r)}" fill="${c}"/>` +
      `<path d="M${f(-r * 0.7)} ${f(-r * 0.1)} A${f(r * 0.7)} ${f(r * 0.7)} 0 0 1 ${f(r * 0.6)} ${f(-r * 0.35)} M${f(-r * 0.45)} ${f(r * 0.3)} A${f(r * 0.5)} ${f(r * 0.5)} 0 0 0 ${f(r * 0.5)} ${f(r * 0.1)} M${f(-r * 0.2)} ${f(-r * 0.05)} A${f(r * 0.22)} ${f(r * 0.22)} 0 1 1 ${f(r * 0.15)} ${f(r * 0.12)}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="${f(r * 0.12)}" stroke-linecap="round"/></g>`;
  }

  /* ---- toran: bandhanwar, swags and ladis ---- */
  function toranDefs(id, th) {
    return `<defs><linearGradient id="${id}mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E4D2B"/><stop offset=".6" stop-color="#3F7F3E"/><stop offset="1" stop-color="#7DAA4F"/></linearGradient>
      <radialGradient id="${id}warm"><stop offset="0" stop-color="#FFD58A" stop-opacity=".16"/><stop offset="1" stop-color="#FFD58A" stop-opacity="0"/></radialGradient></defs>`;
  }
  const rosy = (th) => mix(th.accent, '#B0124A', 0.55);
  // a small brass bell (ghungroo) hanging at x,y
  function bell(x, y, k, id) {
    return `<path d="M${f(x - 8 * k)} ${f(y + 13 * k)} C${f(x - 8 * k)} ${f(y + 2 * k)} ${f(x - 4 * k)} ${f(y)} ${f(x)} ${f(y)} C${f(x + 4 * k)} ${f(y)} ${f(x + 8 * k)} ${f(y + 2 * k)} ${f(x + 8 * k)} ${f(y + 13 * k)} Z" fill="url(#${id}foil)"/>` +
      `<circle cx="${f(x)}" cy="${f(y + 15 * k)}" r="${f(2.6 * k)}" fill="#8A5A0A"/>`;
  }
  // a hanging string of marigolds with rose buds and jasmine, ending in a bell
  function ladi(x, y0, len, k, th, seed) {
    const r = rng(seed);
    let s = `<line x1="${f(x)}" y1="${f(y0 - 40 * k)}" x2="${f(x)}" y2="${f(y0 + len)}" stroke="${MARIGOLD}" stroke-width="${f(1.4 * k)}" opacity=".6"/>`;
    let i = 0, y = y0;
    for (; y < y0 + len - 20 * k; y += 27 * k, i++) {
      if (i % 5 === 4) s += rose(x, y, 10 * k, rosy(th));
      else s += marigold(x, y, 12.5 * k, r() < 0.3 ? ORANGE : r() < 0.5 ? '#F5B700' : MARIGOLD);
      if (i % 5 === 3) s += `<ellipse cx="${f(x)}" cy="${f(y + 14 * k)}" rx="${f(3 * k)}" ry="${f(5 * k)}" fill="${JASMINE}"/>`;
    }
    return s;
  }
  function bandhanwar(W, H, k, th, id, swags) {
    const r = rng(17), vb = 62 * k, band = mix(th.silk, '#000000', 0.38), sr = 15 * k;
    let leaves = '';
    const n = Math.ceil(W / (36 * k));
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * W, L = (84 + (i % 2) * 22 + r() * 8) * k, a = 180 + (r() - 0.5) * 12;
      leaves += `<g transform="translate(${f(x)} ${f(vb - 6 * k)}) rotate(${f(a)})"><path d="${leaf(L, 18 * k, 0.06)}" fill="url(#${id}mg)"/>` +
        `<path d="M0 0 V${f(-L * 0.92)}" stroke="#A8D08D" stroke-width="${f(1.2 * k)}" opacity=".55"/></g>`;
    }
    // the cloth band, brocaded, its lower edge scalloped and edged in zari
    let edge = `M0 ${f(vb)}`;
    for (let x = 0; x < W + 2 * sr; x += 2 * sr) edge += ` A${f(sr)} ${f(sr)} 0 0 0 ${f(x + 2 * sr)} ${f(vb)}`;
    let s = leaves + `<path d="M0 0 H${W + 40} V${f(vb)} ${edge.slice(edge.indexOf('A') - 1)} L0 ${f(vb)} Z" fill="${band}"/>`;
    s += `<path d="${edge}" fill="none" stroke="url(#${id}foil)" stroke-width="${f(2.4 * k)}"/>`;
    s += `<rect y="${f(8 * k)}" width="${W}" height="${f(2 * k)}" fill="url(#${id}foil)"/><rect y="${f(vb - 12 * k)}" width="${W}" height="${f(2.5 * k)}" fill="url(#${id}foil)"/>`;
    let brocade = '';
    for (let x = 22 * k; x < W; x += 44 * k) {
      const y = vb * 0.47;
      brocade += `<path d="M${f(x)} ${f(y - 9 * k)} L${f(x + 7 * k)} ${f(y)} L${f(x)} ${f(y + 9 * k)} L${f(x - 7 * k)} ${f(y)}Z"/><circle cx="${f(x + 22 * k)}" cy="${f(y)}" r="${f(2 * k)}"/>`;
    }
    s += `<g fill="url(#${id}foil)" opacity=".85">${brocade}</g>`;
    // marigold swags between hanging points, a drop of flowers and a bell at each point
    const y0 = vb + 8 * k, sag = 74 * k;
    let sw = '';
    for (let j = 0; j < swags; j++) {
      const x0 = (j / swags) * W, x1 = ((j + 1) / swags) * W, steps = Math.round((x1 - x0) / (16 * k));
      for (let q = 0; q <= steps; q++) {
        const u = q / steps, x = x0 + (x1 - x0) * u, y = y0 + 4 * u * (1 - u) * sag;
        sw += marigold(x, y, 13 * k, q % 3 === 0 ? ORANGE : q % 3 === 1 ? MARIGOLD : '#F5B700');
      }
    }
    for (let j = 0; j <= swags; j++) {
      const x = (j / swags) * W;
      let dr = `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y0 + 96 * k)}" stroke="${MARIGOLD}" stroke-width="${f(1.4 * k)}"/>`;
      dr += marigold(x, y0 + 24 * k, 12 * k, ORANGE) + marigold(x, y0 + 48 * k, 11 * k, MARIGOLD) + rose(x, y0 + 70 * k, 9.5 * k, rosy(th)) + bell(x, y0 + 84 * k, k, id);
      sw += dr;
    }
    return s + sw;
  }
  function marigoldRule(cx, y, w, k, id) {
    return `<path d="M${f(cx - w / 2)} ${f(y)} H${f(cx - 24 * k)} M${f(cx + 24 * k)} ${f(y)} H${f(cx + w / 2)}" stroke="${MARIGOLD}" stroke-width="${f(1.6 * k)}"/>` +
      marigold(cx, y, 12 * k, MARIGOLD) + `<circle cx="${f(cx - w / 2 - 8 * k)}" cy="${f(y)}" r="${f(2.5 * k)}" fill="${MARIGOLD}"/><circle cx="${f(cx + w / 2 + 8 * k)}" cy="${f(y)}" r="${f(2.5 * k)}" fill="${MARIGOLD}"/>`;
  }

  /* ---- lotus: a Pichwai pond ---- */
  function lotusDefs(id) {
    return `<defs><linearGradient id="${id}lp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFF4F4"/><stop offset=".5" stop-color="#F7BCCD"/><stop offset="1" stop-color="#D9467A"/></linearGradient>
      <linearGradient id="${id}lb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#F9D3DD"/><stop offset="1" stop-color="#C8325F"/></linearGradient></defs>`;
  }
  function lotusFlower(x, y, s, id, tilt = 0) {
    const sw = f(Math.max(1, s * 0.012));
    const p = (a, len, wid, op = 1) => `<g transform="rotate(${a})"><path d="${petal(len, wid)}" fill="url(#${id}lp)" stroke="#B8325F" stroke-opacity=".55" stroke-width="${sw}" opacity="${op}"/>` +
      `<path d="M0 ${f(-len * 0.12)} V${f(-len * 0.8)}" stroke="#C8466F" stroke-opacity=".35" stroke-width="${sw}"/></g>`;
    let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${tilt})">`;
    g += `<path transform="rotate(-100)" d="${leaf(s * 0.32, s * 0.08, 0)}" fill="#3B7A45"/><path transform="rotate(100)" d="${leaf(s * 0.32, s * 0.08, 0)}" fill="#3B7A45"/>`;
    [-68, 68].forEach((a) => { g += p(a, s * 0.7, s * 0.2, 0.9); });
    [-44, 44].forEach((a) => { g += p(a, s * 0.86, s * 0.24); });
    g += `<ellipse cy="${f(-s * 0.36)}" rx="${f(s * 0.2)}" ry="${f(s * 0.07)}" fill="#E9B44C"/>`;
    for (let i = -4; i <= 4; i++) g += `<circle cx="${f(i * s * 0.045)}" cy="${f(-s * 0.4 - Math.cos(i / 3) * s * 0.03)}" r="${f(s * 0.014)}" fill="#FFE7A0"/>`;
    [-22, 22].forEach((a) => { g += p(a, s * 0.93, s * 0.25); });
    g += p(0, s, s * 0.26);
    return g + '</g>';
  }
  function lotusBud(x, y, s, id, tilt) {
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${tilt})"><path transform="rotate(-14)" d="${petal(s * 0.8, s * 0.2)}" fill="url(#${id}lb)" opacity=".85"/>` +
      `<path transform="rotate(14)" d="${petal(s * 0.8, s * 0.2)}" fill="url(#${id}lb)" opacity=".85"/><path d="${petal(s, s * 0.26)}" fill="url(#${id}lb)" stroke="#9E2850" stroke-opacity=".5" stroke-width="1.2"/></g>`;
  }
  // a round lily pad seen at an angle, notched, with radiating veins
  function pad(x, y, r, flat, c, rot) {
    const a1 = (rot - 12) * Math.PI / 180, a2 = (rot + 12) * Math.PI / 180;
    let s = `<g transform="translate(${f(x)} ${f(y)}) scale(1 ${f(flat)})">`;
    s += `<path d="M0 0 L${f(Math.cos(a2) * r)} ${f(Math.sin(a2) * r)} A${f(r)} ${f(r)} 0 1 1 ${f(Math.cos(a1) * r)} ${f(Math.sin(a1) * r)} Z" fill="${c}" stroke="${mix(c, '#000000', 0.35)}" stroke-width="2"/>`;
    let v = '';
    for (let i = 1; i < 10; i++) { const a = a2 + (i / 10) * (TAU - 0.42); v += `M0 0 L${f(Math.cos(a) * r * 0.9)} ${f(Math.sin(a) * r * 0.9)}`; }
    return s + `<path d="${v}" stroke="${mix(c, '#FFFFFF', 0.3)}" stroke-width="1.4" opacity=".45" fill="none"/></g>`;
  }
  function pond(W, H, m, top, th, id, seed, small = false) {
    const r = rng(seed), k = H / 1000, x0 = m + 14, x1 = W - m - 14, bot = H - m - 14;
    const greens = ['#2F6B45', '#3B7D4F', '#285C3D', '#4C8C58'].map((g) => mix(g, th.silk, 0.18));
    let s = `<defs><clipPath id="${id}pd"><rect x="${f(x0)}" y="${f(top - H * 0.3)}" width="${f(x1 - x0)}" height="${f(bot - top + H * 0.3)}"/></clipPath></defs><g clip-path="url(#${id}pd)">`;
    s += `<rect x="${f(x0)}" y="${f(top)}" width="${f(x1 - x0)}" height="${f(bot - top)}" fill="${mix(th.silk, '#000000', 0.28)}"/>`;
    let w = '';
    for (let y = top + 14 * k; y < bot; y += 20 * k) for (let x = x0 + r() * 40 * k; x < x1; x += (46 + r() * 30) * k) w += `M${f(x)} ${f(y)} q${f(7 * k)} ${f(-6 * k)} ${f(14 * k)} 0 q${f(7 * k)} ${f(-6 * k)} ${f(14 * k)} 0`;
    s += `<path d="${w}" fill="none" stroke="${mix(th.silk, '#FFFFFF', 0.35)}" stroke-width="${f(1.3 * k)}" opacity=".45"/>`;
    const rows = small ? 3 : 5, ph = bot - top;
    const flowers = (rowY, size, count, off) => {
      let g = '';
      for (let i = 0; i < count; i++) {
        const x = x0 + (x1 - x0) * ((i + off + (r() - 0.5) * 0.3) / count), h = size * (0.55 + r() * 0.35), fy = rowY - h;
        g += `<path d="M${f(x)} ${f(rowY + 6 * k)} Q${f(x + (r() - 0.5) * 20 * k)} ${f(rowY - h * 0.5)} ${f(x)} ${f(fy)}" stroke="#3E7A47" stroke-width="${f(3 * k)}" fill="none"/>`;
        g += i % 3 === 1 ? lotusBud(x, fy, size * 0.6, id, (r() - 0.5) * 16) : lotusFlower(x, fy, size * (0.85 + r() * 0.2), id, (r() - 0.5) * 10);
      }
      return g;
    };
    for (let q = 0; q < rows; q++) {
      const y = top + ((q + 0.55) / rows) * ph, pr = (small ? 30 + q * 14 : 24 + q * 15) * k, flat = 0.34 + q * 0.06;
      for (let x = x0 - pr * r(); x < x1 + pr; x += pr * (1.6 + r() * 0.5)) s += pad(x, y + (r() - 0.5) * 8 * k, pr * (0.85 + r() * 0.3), flat, greens[Math.floor(r() * 4)], r() * 360);
      if (!small && q === 1) s += flowers(y, 70 * k, Math.max(3, Math.round(W / (300 * k))), 0.5);
      if (!small && q === 3) s += flowers(y, 104 * k, Math.max(2, Math.round(W / (420 * k))), 0.5);
      if (small && q === 1) s += flowers(y, 60 * k, Math.max(3, Math.round(W / (320 * k))), 0.5);
    }
    return s + '</g>';
  }
  function pichwaiFrame(W, H, m, id) {
    let s = `<rect x="${f(m)}" y="${f(m)}" width="${f(W - 2 * m)}" height="${f(H - 2 * m)}" fill="none" stroke="url(#${id}foil)" stroke-width="3"/>`;
    s += `<rect x="${f(m + 14)}" y="${f(m + 14)}" width="${f(W - 2 * m - 28)}" height="${f(H - 2 * m - 28)}" fill="none" stroke="${MARIGOLD}" stroke-width="1.3" opacity=".75"/>`;
    let dots = '';
    for (let x = m + 30; x < W - m - 20; x += 22) dots += `<circle cx="${f(x)}" cy="${f(m + 7)}" r="1.7"/><circle cx="${f(x)}" cy="${f(H - m - 7)}" r="1.7"/>`;
    for (let y = m + 30; y < H - m - 20; y += 22) dots += `<circle cx="${f(m + 7)}" cy="${f(y)}" r="1.7"/><circle cx="${f(W - m - 7)}" cy="${f(y)}" r="1.7"/>`;
    s += `<g fill="${MARIGOLD}" opacity=".7">${dots}</g>`;
    [[m, m], [W - m, m], [m, H - m], [W - m, H - m]].forEach(([x, y]) => { s += `<rect x="${f(x - 9)}" y="${f(y - 9)}" width="18" height="18" transform="rotate(45 ${f(x)} ${f(y)})" fill="url(#${id}foil)"/>`; });
    return s;
  }

  /* ---- paisley: a grand Kashmiri buta ---- */
  // the buta outline around a bulb of radius 1 at the origin, its tip curling right at the top
  const BUTA = [[0, 1], [-0.62, 0.84], [-0.97, 0.32], [-1, -0.3], [-0.84, -0.9], [-0.5, -1.45], [-0.05, -1.86], [0.4, -2.12], [0.8, -2.2], [1.02, -2.05], [0.96, -1.84], [0.74, -1.8], [0.62, -1.62], [0.74, -1.1], [0.94, -0.55], [1.02, 0.04], [0.86, 0.6], [0.5, 0.92]];
  const butaPts = (cx, cy, S, k = 1, oy = 0) => BUTA.map(([x, y]) => [cx + x * S * k, cy + (y - oy) * S * k + oy * S]);
  const butaPath = (cx, cy, S, k = 1) => smooth(butaPts(cx, cy, S, k, -0.25));
  function butiGround(W, H, th, id) {
    const c = mix(th.silk, '#FFFFFF', 0.09);
    return `<defs><pattern id="${id}bt" width="96" height="96" patternUnits="userSpaceOnUse"><g fill="${c}"><path d="${butaPath(24, 30, 8)}"/>` +
      `<path transform="translate(72 78) scale(-1 1) translate(-72 -78)" d="${butaPath(72, 78, 8)}"/></g><circle cx="72" cy="22" r="1.6" fill="${MARIGOLD}" opacity=".35"/><circle cx="24" cy="70" r="1.6" fill="${MARIGOLD}" opacity=".35"/></pattern></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#${id}bt)"/>`;
  }
  function pallu(W, y, th, id) {
    const k = 1;
    let s = `<rect y="${f(y - 18)}" width="${W}" height="36" fill="${mix(th.silk, '#000000', 0.3)}"/>`;
    s += `<rect y="${f(y - 18)}" width="${W}" height="1.6" fill="url(#${id}foil)"/><rect y="${f(y + 16.4)}" width="${W}" height="1.6" fill="url(#${id}foil)"/>`;
    let b = '';
    for (let x = 20, i = 0; x < W; x += 40 * k, i++) b += i % 2 ? `<path transform="translate(${f(2 * x)} 0) scale(-1 1)" d="${butaPath(x, y + 2, 6)}"/>` : `<path d="${butaPath(x, y + 2, 6)}"/>`;
    return s + `<g fill="url(#${id}foil)" opacity=".85">${b}</g>`;
  }
  function grandButa(cx, cy, S, th, id, simple = false) {
    const out = butaPts(cx, cy, S, 1, -0.25);
    let s = `<path d="${smooth(out)}" fill="${mix(th.silk, '#000000', 0.22)}"/>`;
    // outward fringe of small petals along the outline
    const dense = curvePts(out, true, 10);
    let fr = '';
    for (let i = 0; i < dense.length; i += 3) {
      const [x, y] = dense[i], [xa, ya] = dense[(i + 1) % dense.length], [xb, yb] = dense[(i - 1 + dense.length) % dense.length];
      const ang = Math.atan2(yb - ya, xb - xa) * 180 / Math.PI;   // the outline runs counter-clockwise, so this points outward
      fr += `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})" d="${petal(S * 0.11, S * 0.035)}"/>`;
    }
    s += `<g fill="url(#${id}foil)">${fr}</g>`;
    s += `<path d="${smooth(out)}" fill="none" stroke="url(#${id}foil)" stroke-width="${f(S * 0.03)}"/>`;
    s += `<path d="${butaPath(cx, cy, S, 0.84)}" fill="none" stroke="${MARIGOLD}" stroke-width="${f(Math.max(1.2, S * 0.008))}" opacity=".85"/>`;
    s += `<path d="${butaPath(cx, cy, S, 0.74)}" fill="none" stroke="${MARIGOLD}" stroke-width="${f(Math.max(1, S * 0.007))}" stroke-dasharray="${f(S * 0.015)} ${f(S * 0.03)}" opacity=".7"/>`;
    const P = (x, y) => [cx + x * S, cy + y * S];
    if (!simple) {
      // a flowering stem climbing from the rosette into the tip
      const stem = [P(0, 0.05), P(-0.22, -0.55), P(-0.2, -1.05), P(0.08, -1.5), P(0.42, -1.82)];
      s += `<path d="${smooth(stem, false)}" fill="none" stroke="url(#${id}foil)" stroke-width="${f(S * 0.014)}" stroke-linecap="round"/>`;
      const sp = curvePts(stem, false, 8);
      let lv = '';
      for (let i = 6; i < sp.length - 2; i += 5) {
        const [x, y] = sp[i], [xn, yn] = sp[i + 1], a = Math.atan2(yn - y, xn - x) * 180 / Math.PI, side = (i / 5) % 2 ? 1 : -1;
        lv += `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(a + 90 + side * 55)})" d="${leaf(S * 0.2, S * 0.06, 0.1 * side)}"/>`;
      }
      s += `<g fill="${mix(MARIGOLD, th.silk, 0.15)}" opacity=".9">${lv}</g>`;
      const [tx, ty] = P(0.42, -1.82);
      for (let i = 0; i < 5; i++) s += `<path transform="translate(${f(tx)} ${f(ty)}) rotate(${i * 72})" d="${petal(S * 0.09, S * 0.04)}" fill="${th.accent}"/>`;
      s += `<circle cx="${f(tx)}" cy="${f(ty)}" r="${f(S * 0.025)}" fill="${MARIGOLD}"/>`;
    }
    // the rosette in the bulb
    const [rx, ry] = P(0, 0.08), R = S * (simple ? 0.32 : 0.42);
    let ro = `<circle cx="${f(rx)}" cy="${f(ry)}" r="${f(R * 1.05)}" fill="${mix(th.silk, '#000000', 0.3)}" stroke="url(#${id}foil)" stroke-width="${f(S * 0.01)}"/>`;
    for (let i = 0; i < 12; i++) ro += `<path transform="translate(${f(rx)} ${f(ry)}) rotate(${i * 30}) translate(0 ${f(-R * 0.3)})" d="${petal(R * 0.66, R * 0.2)}" fill="none" stroke="url(#${id}foil)" stroke-width="${f(Math.max(1.2, S * 0.008))}"/>`;
    for (let i = 0; i < 6; i++) ro += `<path transform="translate(${f(rx)} ${f(ry)}) rotate(${i * 60 + 15})" d="${petal(R * 0.42, R * 0.17)}" fill="${th.accent}"/>`;
    ro += `<circle cx="${f(rx)}" cy="${f(ry)}" r="${f(R * 0.12)}" fill="url(#${id}foil)"/>`;
    return s + ro;
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
        const steps = Math.floor(W / 26);
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * W, y = H * 0.03 + Math.sin((i / steps) * Math.PI) * H * 0.03;
          garland += marigold(x, y, 15, i % 3 === 0 ? ORANGE : MARIGOLD);
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
        s += iniLock(W / 2, H * 0.4, d, aw * 0.7, H * 0.12);
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
        // a large tone-on-tone mandala pressed into the silk, its heart picked out in foil
        const mx = isWide(W, H) ? W * 0.79 : W * 0.86;
        s += `<circle cx="${f(mx)}" cy="${f(H * 0.5)}" r="${f(H * 0.7)}" fill="url(#${id}mp)"/><defs><radialGradient id="${id}mp"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
        s += mandala(mx, H * 0.5, H * 0.66, mix(th.silk, '#FFFFFF', 0.2), 1, 1.8);
        s += mandala(mx, H * 0.5, H * 0.3, `url(#${id}foil)`, 1, 1.7);
        s += `<circle cx="${f(mx)}" cy="${f(H * 0.5)}" r="${f(H * 0.022)}" fill="url(#${id}foil)"/>`;
        const x = W * 0.08;
        s += `<rect x="${f(x)}" y="${f(H * 0.2)}" width="64" height="4" fill="url(#${id}foil)"/>`;
        const nb = nameBlock(d, x, H * 0.24, W * 0.5, H * 0.15, { anchor: 'start' });
        s += nb.svg;
        placeLine(d).forEach((l, i) => { s += t(x, nb.bottom + 62 + i * 42, l, { size: 33, family: UI, anchor: 'start', opacity: 0.88 }); });
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk);
        s += mandala(W / 2, H * 0.4, H * 0.34, mix(th.silk, '#FFFFFF', 0.2), 1, 1.6);
        s += `<circle cx="${f(W / 2)}" cy="${f(H * 0.4)}" r="${f(H * 0.11)}" fill="${th.silk}"/>`;
        s += monogram(W / 2, H * 0.4, H * 0.1, d);
        return s + studioBlock(d, W / 2, H * 0.74);
      },
    },

    toran: {
      name: 'Marigold toran',
      occasions: ['haldi', 'sangeet', 'wedding', 'mehendi'],
      description: 'A bandhanwar of mango leaves and marigold swags, long ladis framing the names',
      motif: (c) => marigold(30, 30, 12, c),
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk) + toranDefs(id, th);
        const k = H / 1000, wide = isWide(W, H);
        s += `<ellipse cx="${f(W / 2)}" cy="${f(H * 0.6)}" rx="${f(W * 0.42)}" ry="${f(H * 0.36)}" fill="url(#${id}warm)"/>`;
        // long ladis down both sides, the outermost the longest
        const xs = wide ? [0.035, 0.08, 0.125] : [0.045, 0.1, 0.155];
        const lens = [0.8, 0.62, 0.46];
        xs.forEach((x, i) => { s += ladi(W * x, H * 0.12, H * lens[i], k, th, i * 3 + 1) + ladi(W * (1 - x), H * 0.12, H * lens[i], k, th, i * 3 + 2); });
        s += bandhanwar(W, H, k * 1.3, th, id, wide ? 4 : 2);
        const inner = W * (1 - 2 * xs[2]) - 80 * k;
        const st = stack(d, W / 2, H * 0.6, Math.min(inner * 0.86, H * 1.1), H * 0.13, { amp: MARIGOLD });
        s += st.svg;
        s += marigoldRule(W / 2, st.top - 46 * k, Math.min(inner * 0.5, 300 * k), k, id);
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk) + toranDefs(id, th);
        const k = H / 1000;
        s += bandhanwar(W, H, k, th, id, isWide(W, H) ? 3 : 2);
        s += monogram(W / 2, H * 0.44, H * 0.1, d);
        return s + studioBlock(d, W / 2, H * 0.66);
      },
    },

    lotus: {
      name: 'Lotus pond',
      occasions: ['wedding', 'anniversary', 'baby-shower', 'maternity', 'reception'],
      description: 'A Pichwai lotus pond: pads, buds and open lotuses inside a painted gold border',
      motif: (c) => `<g transform="translate(30 46) scale(.14)" fill="none" stroke="${c}" stroke-width="12"><path d="${petal(205, 48)}"/><path transform="rotate(-40)" d="${petal(170, 46)}"/><path transform="rotate(40)" d="${petal(170, 46)}"/></g>`,
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk) + lotusDefs(id, th);
        const wide = isWide(W, H), m = H * 0.045;
        const top = H * (wide ? 0.6 : 0.64);
        s += pond(W, H, m, top, th, id, 3);
        s += pichwaiFrame(W, H, m, id);
        const st = stack(d, W / 2, top * 0.5 + m * 0.6, Math.min(W * 0.74, H * 0.95), H * 0.12, { amp: th.accent === MARIGOLD ? JASMINE : MARIGOLD });
        return s + st.svg;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk) + lotusDefs(id, th);
        const m = H * 0.045;
        s += pond(W, H, m, H * 0.78, th, id, 9, true);
        s += pichwaiFrame(W, H, m, id);
        s += lotusFlower(W / 2, H * 0.3, H * 0.15, id, 0);
        s += iniLock(W / 2, H * 0.44, d, W * 0.4, H * 0.07);
        return s + studioBlock(d, W / 2, H * 0.55);
      },
    },

    paisley: {
      name: 'Paisley',
      occasions: ['mehendi', 'wedding', 'engagement', 'reception'],
      description: 'One grand Kashmiri buta in foil line work on a brocade of tiny butis',
      motif: (c) => `<path d="${butaPath(28, 40, 10)}" fill="none" stroke="${c}" stroke-width="1.8"/><circle cx="28" cy="40" r="3" fill="${c}"/>`,
      cover(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk) + butiGround(W, H, th, id);
        const wide = isWide(W, H);
        s += pallu(W, H * 0.045, th, id) + pallu(W, H * 0.955, th, id);
        if (wide) {
          const S = H * 0.235;
          s += grandButa(W * 0.29, H * 0.64, S, th, id);
          s += stack(d, W * 0.68, H * 0.5, W * 0.48, H * 0.13, { amp: th.accent }).svg;
        } else {
          const S = Math.min(H * 0.135, W * 0.2);
          s += grandButa(W / 2 - S * 0.05, H * 0.42, S, th, id);
          s += stack(d, W / 2, H * 0.76, W * 0.84, H * 0.1, { amp: th.accent }).svg;
        }
        return s;
      },
      back(W, H, d, th, id) {
        let s = silkBg(id, W, H, th.silk) + butiGround(W, H, th, id);
        s += pallu(W, H * 0.045, th, id) + pallu(W, H * 0.955, th, id);
        s += grandButa(W / 2, H * 0.36, H * 0.09, th, id, true);
        s += iniLock(W / 2, H * 0.55, d, W * 0.4, H * 0.07);
        return s + studioBlock(d, W / 2, H * 0.67);
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

  // Endpapers: a tone-on-tone brocade lining woven from the design's motif, a few foil dots in the gaps.
  // A design may draw its own with endpaper(W, H, d, th, id, isBack).
  function endpaper(W, H, d, th, id, tpl, isBack) {
    if (tpl.endpaper) return tpl.endpaper(W, H, d, th, id, isBack);
    const motif = (tpl.motif || TEMPLATES.jharokha.motif);
    const T = 150, k = 1.25, o = 30 * k;
    const weave = mix(th.silk, '#FFFFFF', 0.24), deep = mix(th.silk, '#000000', 0.25);
    let s = `<defs><pattern id="${id}ep" width="${T}" height="${T}" patternUnits="userSpaceOnUse">` +
      [[0, 0], [T, 0], [0, T], [T, T]].map(([x, y]) => `<g transform="translate(${f(x - o)} ${f(y - o)}) scale(${k})">${motif(weave)}</g>`).join('') +
      `<g transform="translate(${f(T / 2 - o)} ${f(T / 2 - o)}) scale(${k})" opacity=".5">${motif(MARIGOLD)}</g>` +
      `<g fill="${MARIGOLD}" opacity=".55"><circle cx="${T / 2}" cy="0" r="2.2"/><circle cx="${T / 2}" cy="${T}" r="2.2"/><circle cx="0" cy="${T / 2}" r="2.2"/><circle cx="${T}" cy="${T / 2}" r="2.2"/></g></pattern>` +
      `<radialGradient id="${id}ev" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="${deep}" stop-opacity="0"/><stop offset="1" stop-color="${deep}" stop-opacity=".7"/></radialGradient></defs>`;
    s += `<rect width="${W}" height="${H}" fill="${th.silk}"/><rect width="${W}" height="${H}" fill="url(#${id}sh)"/>`;
    // centre the weave on the page so it sits symmetrically at every ratio
    s += `<g transform="translate(${f((W / 2) % T - T)} ${f((H / 2) % T - T)})"><rect width="${W + 2 * T}" height="${H + 2 * T}" fill="url(#${id}ep)"/></g>`;
    s += `<rect width="${W}" height="${H}" fill="url(#${id}ev)"/>` + grain(id, W, H, 0.12);
    if (isBack && d.studio) s += studioCard(W, H, d, th, id);
    return s;
  }
  // an ivory card with a foil edge carrying the studio's name, for the inside back cover
  function studioCard(W, H, d, th, id) {
    const sz = fit(d.studio, Math.min(W * 0.5, 560), 40);
    const cw = Math.min(W * 0.62, Math.max(420, sz * 0.56 * d.studio.length + 140)), ch = 190 + d.contact.length * 30, x = (W - cw) / 2, y = (H - ch) / 2;
    let s = `<rect x="${f(x + 6)}" y="${f(y + 10)}" width="${f(cw)}" height="${f(ch)}" fill="#000" opacity=".25"/>`;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(cw)}" height="${f(ch)}" fill="${JASMINE}"/>`;
    s += `<rect x="${f(x + 12)}" y="${f(y + 12)}" width="${f(cw - 24)}" height="${f(ch - 24)}" fill="none" stroke="url(#${id}foil)" stroke-width="2"/>`;
    s += t(W / 2, y + 70, 'Photographs by', { size: 24, color: KOHL, family: UI, opacity: 0.6 });
    s += t(W / 2, y + 122, d.studio, { size: sz, color: th.silk });
    d.contact.forEach((c, i) => { s += t(W / 2, y + 162 + i * 30, c, { size: 23, color: KOHL, family: UI, opacity: 0.6 }); });
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
    return { key: TEMPLATES[want] ? want : defaultFor(album.type), photos: pick.photos || [], upload: pick.upload || '', crops: pick.crops || [] };
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
    CROPS = ['cover', 'back'].includes(kind) || kind.startsWith('inside') || kind === 'flyleaf' ? pick.crops : [];   // read by photoSlot while drawing
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
  // crops of the part being drawn: [cx, cy, zoom, photo aspect] per spot (set by render; see Crop in crop.js)
  let CROPS = [];
  function croppedImage(href, x, y, w, h, c, cid) {
    const [cx = 0.5, cy = 0.5, z = 1, ar] = c;
    let dw, dh;
    if (ar > w / h) { dh = h; dw = h * ar; } else { dw = w; dh = w / ar; }   // like object-fit: cover
    dw *= z; dh *= z;
    return `<image href="${esc(href)}" x="${f(x - (dw - w) * cx)}" y="${f(y - (dh - h) * cy)}" width="${f(dw)}" height="${f(dh)}" preserveAspectRatio="none" clip-path="url(#${cid})"/>`;
  }
  function photoSlot(id, n, x, y, w, h, href, { shape = 'rect', stroke = MARIGOLD, sw = 4, radius = 0 } = {}) {
    const cid = id + 'slot' + n;
    let clip;
    if (shape === 'circle') clip = `<circle cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(Math.min(w, h) / 2)}"/>`;
    else if (shape === 'arch') clip = `<path d="M${f(x)} ${f(y + h)} V${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} V${f(y + h)} Z"/>`;
    else clip = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${radius}"/>`;
    const crop = CROPS && CROPS[n];
    const fill = href && crop && crop[3]
      ? croppedImage(href, x, y, w, h, crop, cid)
      : href
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
    helpers: { MARIGOLD, ORANGE, JASMINE, PAPER, KOHL, DISPLAY, UI, TAU, esc, f, fit, t, details, nameBlock, placeLine, silkBg, mix, grain, iniLock, studioCard,
      rng, isWide, smooth, star, glint, leaf, pairLine, lineSvg, stack, curvePts, rose,
      cuspedArch, petal, mandala, marigold, ambi, lotus, zari, monogram, studioBlock, photoSlot, endpaperOf: (tpl) => tpl.motif },
  };
})(typeof window !== 'undefined' ? window : globalThis);
