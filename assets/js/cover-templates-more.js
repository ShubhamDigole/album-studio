/* ==========================================================================
   More cover designs, registered on top of cover-templates.js (load after it).
   Each design draws cover, back (end page) and a 60x60 endpaper motif as SVG,
   using the album's silk/accent colours so it follows the album theme.
   ========================================================================== */
(function (root) {
  'use strict';
  const CT = root.CoverTemplates;
  if (!CT || !CT.register) return;
  const { MARIGOLD, ORANGE, JASMINE, PAPER, KOHL, DISPLAY, UI, TAU, esc, f, fit, t, nameBlock, placeLine, silkBg,
    petal, marigold, studioBlock, photoSlot } = CT.helpers;

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
  function hex(c) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  // blend colour a towards b by k (0..1); falls back to a for non-hex colours
  function mix(a, b, k) {
    const A = hex(a), B = hex(b);
    if (!A || !B) return a;
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
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
  const initials = (d) => d.initials.join(d.initials.length > 1 ? ' ' : '');

  /* ======================================================================
     rings (engagement): two interlocked bands, one gold, one rose gold,
     a solitaire set on the gold one
     ====================================================================== */
  function ringDefs(id) {
    return `<defs><linearGradient id="${id}rose" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBD9C5"/><stop offset=".45" stop-color="#D99577"/><stop offset="1" stop-color="#8E4F3A"/></linearGradient>
      <linearGradient id="${id}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCE7A6"/><stop offset=".45" stop-color="${MARIGOLD}"/><stop offset="1" stop-color="#9A6408"/></linearGradient>
      <linearGradient id="${id}dia" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#E3F1F8"/><stop offset="1" stop-color="#9FC3D6"/></linearGradient>
      <radialGradient id="${id}halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE8B0" stop-opacity=".22"/><stop offset="1" stop-color="#FFE8B0" stop-opacity="0"/></radialGradient></defs>`;
  }
  function band(cx, cy, R, grad) {
    const w = R * 0.17;
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="${f(w + 5)}"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="none" stroke="${grad}" stroke-width="${f(w)}"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R - w * 0.28)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="${f(w * 0.12)}"/>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R + w * 0.36)}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="1.2"/>`;
  }
  function diamond(x, y, w, id) {
    const h1 = w * 0.3, h2 = w * 0.62, tw = w * 0.56;
    const c = `M${f(x - w / 2)} ${f(y)} L${f(x - tw / 2)} ${f(y - h1)} H${f(x + tw / 2)} L${f(x + w / 2)} ${f(y)} Z`;
    const p = `M${f(x - w / 2)} ${f(y)} L${f(x)} ${f(y + h2)} L${f(x + w / 2)} ${f(y)} Z`;
    let s = `<path d="${c}" fill="url(#${id}dia)"/><path d="${p}" fill="url(#${id}dia)"/>`;
    s += `<g fill="none" stroke="#5E8FA8" stroke-width="1.3" stroke-opacity=".55">` +
      `<path d="${c}"/><path d="${p}"/>` +
      `<path d="M${f(x - tw / 2)} ${f(y - h1)} L${f(x - w * 0.18)} ${f(y)} L${f(x)} ${f(y - h1)} L${f(x + w * 0.18)} ${f(y)} L${f(x + tw / 2)} ${f(y - h1)}"/>` +
      `<path d="M${f(x - w * 0.18)} ${f(y)} L${f(x)} ${f(y + h2)} L${f(x + w * 0.18)} ${f(y)}"/></g>`;
    s += `<path d="M${f(x - w * 0.18)} ${f(y)} L${f(x)} ${f(y + h2)} L${f(x - w / 2)} ${f(y)}Z" fill="#fff" opacity=".35"/>`;
    s += `<path d="${glint(x + w * 0.2, y - h1 - 6, w * 0.32)}" fill="#fff"/>`;
    return s;
  }
  function ringsArt(cx, cy, R, id) {
    const ax = cx - R * 0.5, bx = cx + R * 0.5;
    let s = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 2.4)}" fill="url(#${id}halo)"/>`;
    // the solitaire's prongs and stone sit on top of ring A
    const dy = cy - R - R * 0.34, w = R * 0.58;
    s += band(ax, cy, R, `url(#${id}gold)`) + band(bx, cy, R, `url(#${id}rose)`);
    // ring A passes over ring B at the upper crossing
    const yI = cy - Math.sqrt(R * R - (R * 0.5) ** 2);
    s += `<defs><clipPath id="${id}ov"><rect x="${f(cx - R * 0.32)}" y="${f(yI - R * 0.3)}" width="${f(R * 0.64)}" height="${f(R * 0.6)}"/></clipPath></defs>`;
    s += `<g clip-path="url(#${id}ov)">${band(ax, cy, R, `url(#${id}gold)`)}</g>`;
    s += `<path d="M${f(ax - w * 0.32)} ${f(cy - R)} L${f(ax - w * 0.42)} ${f(dy + 2)} M${f(ax + w * 0.32)} ${f(cy - R)} L${f(ax + w * 0.42)} ${f(dy + 2)}" stroke="url(#${id}gold)" stroke-width="${f(R * 0.05)}" stroke-linecap="round"/>`;
    s += `<path d="M${f(ax - R * 0.17)} ${f(cy - R + 2)} Q${f(ax)} ${f(cy - R - R * 0.2)} ${f(ax + R * 0.17)} ${f(cy - R + 2)}" fill="url(#${id}gold)"/>`;
    s += diamond(ax, dy, w, id);
    return s;
  }
  CT.register('rings', {
    name: 'Two rings',
    occasions: ['engagement', 'anniversary', 'wedding'],
    description: 'A gold and a rose-gold band interlocked, a solitaire catching the light',
    slots: 0,
    motif: (c) => `<g fill="none" stroke="${c}" stroke-width="2.2"><circle cx="24" cy="32" r="11"/><circle cx="36" cy="32" r="11"/><path d="M20 19 L24 14 L28 19 Z" fill="${c}" stroke="none"/></g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + ringDefs(id);
      // faint rings of light spreading from the stone
      for (let i = 1; i <= 7; i++) s += `<circle cx="${f(W / 2 - H * 0.065)}" cy="${f(H * 0.29)}" r="${f(H * (0.18 + i * 0.09))}" fill="none" stroke="#fff" stroke-width="1.2" opacity="${f(0.07 - i * 0.008)}"/>`;
      s += ringsArt(W / 2, H * 0.31, H * 0.13, id);
      const st = stack(d, W / 2, H * 0.7, Math.min(W * 0.7, H * 0.8), H * 0.105, { amp: th.accent });
      return s + st.svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + ringDefs(id);
      s += ringsArt(W / 2, H * 0.25, H * 0.085, id);
      s += t(W / 2, H * 0.5, initials(d), { size: fit(initials(d), W * 0.4, H * 0.08) });
      return s + studioBlock(d, W / 2, H * 0.66);
    },
  });

  /* ======================================================================
     polaroids (pre-wedding, 3 photos): instant prints pegged to a twine
     ====================================================================== */
  function twineY(x, W, y0, sag) { const k = x / W; return y0 + 4 * k * (1 - k) * sag; }
  function polaroid(id, n, px, py, cw, rot, photo, caption, th) {
    const m = cw * 0.06, pw = cw - 2 * m, ch = cw * 1.2;
    let s = `<g transform="translate(${f(px)} ${f(py)}) rotate(${rot})">`;
    s += `<rect x="${f(-cw / 2 + 6)}" y="${f(10)}" width="${f(cw)}" height="${f(ch)}" fill="#000" opacity=".28" filter="url(#${id}soft)"/>`;
    s += `<rect x="${f(-cw / 2)}" y="0" width="${f(cw)}" height="${f(ch)}" fill="#FBF8F2"/>`;
    s += `<rect x="${f(-cw / 2)}" y="0" width="${f(cw)}" height="${f(ch)}" fill="url(#${id}paper)"/>`;
    s += photoSlot(id, n, -pw / 2, m, pw, pw, photo, { stroke: '#000', sw: 0.6 });
    if (caption) s += t(0, m + pw + (ch - m - pw) * 0.62, caption, { size: fit(caption, pw * 0.9, 34), color: th.silk });
    // wooden peg across the twine
    s += `<rect x="-9" y="-30" width="18" height="58" rx="3" fill="#D9B78A"/><rect x="-9" y="-30" width="9" height="58" rx="3" fill="#B98F5E"/><rect x="-11" y="-6" width="22" height="7" rx="2" fill="#8C8C8C"/>`;
    return s + '</g>';
  }
  CT.register('polaroids', {
    name: 'Polaroids on a line',
    occasions: ['pre-wedding', 'engagement', 'birthday', 'other'],
    description: 'Three instant prints pegged to a twine, names written underneath',
    slots: 3,
    motif: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><rect x="16" y="12" width="28" height="34" transform="rotate(-6 30 30)"/><rect x="20" y="16" width="20" height="20" transform="rotate(-6 30 30)"/></g>`,
    cover(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk);
      s += `<defs><filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
        <linearGradient id="${id}paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#E9DFCF" stop-opacity=".5"/></linearGradient></defs>`;
      const wide = isWide(W, H);
      const cw = wide ? H * 0.37 : W * 0.3, y0 = H * 0.08, sag = H * 0.06;
      s += `<path d="M-10 ${f(y0 - 6)} Q${f(W / 2)} ${f(y0 + sag * 2)} ${f(W + 10)} ${f(y0 - 6)}" fill="none" stroke="#E8DCC4" stroke-width="2.4" opacity=".75"/>`;
      s += `<path d="M-10 ${f(y0 - 6)} Q${f(W / 2)} ${f(y0 + sag * 2)} ${f(W + 10)} ${f(y0 - 6)}" fill="none" stroke="#8C7A5B" stroke-width="2.4" stroke-dasharray="3 5" opacity=".6"/>`;
      const cards = wide ? [[0.2, -6], [0.5, 2.5], [0.8, -3.5]] : [[0.18, -6], [0.5, 2.5], [0.82, -3.5]];
      const caps = ['', d.place, ''];
      cards.forEach(([k, rot], i) => {
        const x = W * k;
        s += polaroid(id, i, x, twineY(x, W, y0 - 6, sag) + (i === 1 ? 6 : 0), cw * (i === 1 ? 1.04 : 1), rot, photos[i], caps[i], th);
      });
      const p = pairLine(d, W / 2, H * 0.835, W * 0.84, H * 0.11, { amp: th.accent });
      s += p.svg + lineSvg([placeLine(d).join(', ')], W / 2, H * 0.835 + 70, { size: 32 });
      return s;
    },
    back(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk);
      s += `<defs><filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
        <linearGradient id="${id}paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#E9DFCF" stop-opacity=".5"/></linearGradient></defs>`;
      // one print, its caption the couple's initials
      const cw = H * 0.26;
      s += polaroid(id, 0, W / 2, H * 0.1, cw, -3, photos[1] || photos[0], initials(d), th);
      return s + studioBlock(d, W / 2, H * 0.62);
    },
  });

  /* ======================================================================
     haldi-splash (haldi): a thick turmeric splash with marigold petals
     ====================================================================== */
  function splashPath(cx, cy, rx, ry, seed, arms = 7) {
    const r = rng(seed);
    const ph = [r() * TAU, r() * TAU, r() * TAU];
    const A = Array.from({ length: arms }, () => ({ a: r() * TAU, amp: 0.12 + r() * 0.22, w: 0.06 + r() * 0.08 }));
    const pts = [], drops = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU;
      let k = 1 + 0.05 * Math.sin(3 * th + ph[0]) + 0.04 * Math.sin(5 * th + ph[1]) + 0.025 * Math.sin(11 * th + ph[2]);
      A.forEach((arm) => { let dd = Math.abs(th - arm.a); dd = Math.min(dd, TAU - dd); k += arm.amp * Math.exp(-((dd / arm.w) ** 2)); });
      pts.push([cx + Math.cos(th) * rx * k, cy + Math.sin(th) * ry * k]);
    }
    A.forEach((arm, j) => {
      const reach = 1 + arm.amp;
      for (let q = 0; q < 3; q++) {
        const kk = reach + 0.09 + q * (0.08 + r() * 0.06), sz = (14 - q * 4) * (0.7 + r() * 0.6) * (rx / 400);
        drops.push([cx + Math.cos(arm.a + (r() - 0.5) * 0.08) * rx * kk, cy + Math.sin(arm.a + (r() - 0.5) * 0.08) * ry * kk, Math.max(2.5, sz)]);
      }
      if (j % 2) drops.push([cx + Math.cos(arm.a + 0.3) * rx * 1.18, cy + Math.sin(arm.a + 0.3) * ry * 1.18, 4 * (rx / 400)]);
    });
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, kk = 1.08 + r() * 0.35;
      drops.push([cx + Math.cos(a) * rx * kk, cy + Math.sin(a) * ry * kk, 1.5 + r() * 3.5]);
    }
    return { d: smooth(pts), drops };
  }
  function splash(cx, cy, rx, ry, seed, fill, id, arms) {
    const sp = splashPath(cx, cy, rx, ry, seed, arms);
    let s = `<path d="${sp.d}" fill="#000" opacity=".2" transform="translate(5 8)"/>`;
    s += `<path d="${sp.d}" fill="${fill}"/>`;
    s += `<path d="${sp.d}" fill="url(#${id}paste)"/>`;
    s += sp.drops.map(([x, y, r]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`).join('');
    return s;
  }
  function haldiDefs(id, th) {
    return `<defs><radialGradient id="${id}paste" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#FFF6C8" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#B86E00" stop-opacity=".35"/></radialGradient></defs>`;
  }
  function petalsAround(W, H, seed, avoid, count, colors) {
    const r = rng(seed);
    let s = '';
    for (let i = 0, made = 0; i < count * 6 && made < count; i++) {
      const x = r() * W, y = r() * H;
      if (avoid && ((x - avoid.cx) / avoid.rx) ** 2 + ((y - avoid.cy) / avoid.ry) ** 2 < 1) continue;
      made++;
      const sz = 16 + r() * 18, c = colors[Math.floor(r() * colors.length)];
      s += `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(r() * 360)})" d="${petal(sz, sz * 0.42)}" fill="${c}" opacity="${f(0.75 + r() * 0.25)}"/>`;
    }
    return s;
  }
  CT.register('haldi-splash', {
    name: 'Haldi splash',
    occasions: ['haldi', 'mehendi'],
    description: 'A thick splash of turmeric paste with scattered marigold petals',
    slots: 0,
    motif: (c) => `<g fill="${c}"><path d="${splashPath(28, 30, 15, 13, 5, 5).d}"/><circle cx="50" cy="14" r="3"/><circle cx="8" cy="50" r="2"/></g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + haldiDefs(id, th);
      const rx = Math.min(W * 0.4, H * 0.56), ry = H * 0.33, cx = W / 2, cy = H * 0.5;
      s += splash(W * 0.04, H * 0.06, H * 0.16, H * 0.13, 11, mix(th.accent, th.silk, 0.25), id, 5);
      s += splash(W * 0.97, H * 0.95, H * 0.19, H * 0.15, 23, mix(th.accent, th.silk, 0.25), id, 5);
      s += petalsAround(W, H, 4, { cx, cy, rx: rx * 1.35, ry: ry * 1.4 }, 22, [ORANGE, MARIGOLD, '#FFB703']);
      s += splash(cx, cy, rx, ry, 3, th.accent, id, 7);
      const ink = mix(th.silk, '#000', 0.25);
      return s + stack(d, cx, cy, rx * 1.25, H * 0.12, { color: ink, amp: ORANGE, weight: 500, opacity: 0.9 }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + haldiDefs(id, th);
      s += petalsAround(W, H, 9, { cx: W / 2, cy: H * 0.5, rx: W * 0.3, ry: H * 0.4 }, 12, [ORANGE, MARIGOLD]);
      s += splash(W / 2, H * 0.32, H * 0.15, H * 0.13, 17, th.accent, id, 5);
      const ink = mix(th.silk, '#000', 0.25);
      s += t(W / 2, H * 0.32 + H * 0.028, initials(d), { size: fit(initials(d), H * 0.24, H * 0.08), color: ink });
      return s + studioBlock(d, W / 2, H * 0.64);
    },
  });

  /* ======================================================================
     henna (mehendi): fine mehendi line work, finger-band borders and a
     scalloped medallion
     ====================================================================== */
  function scallops(cx, cy, r, n, close = true) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r, x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
      const ch = Math.hypot(x1 - x0, y1 - y0) / 2;
      s += (i ? '' : `M${f(x0)} ${f(y0)}`) + ` A${f(ch)} ${f(ch)} 0 0 1 ${f(x1)} ${f(y1)}`;
    }
    return s + (close ? 'Z' : '');
  }
  function dotsRing(cx, cy, r, n, rad, color) {
    let s = '';
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; s += `<circle cx="${f(cx + Math.cos(a) * r)}" cy="${f(cy + Math.sin(a) * r)}" r="${f(rad)}" fill="${color}"/>`; }
    return s;
  }
  function hennaMedallion(cx, cy, R, c, { core = true } = {}) {
    let s = `<g fill="none" stroke="${c}" stroke-width="${f(Math.max(1.2, R / 120))}" stroke-linecap="round">`;
    if (core) {
      s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.07)}" fill="${c}"/>`;
      for (let i = 0; i < 8; i++) s += `<path transform="translate(${f(cx)} ${f(cy)}) rotate(${i * 45}) translate(0 ${f(-R * 0.1)})" d="${petal(R * 0.2, R * 0.07)}"/>`;
      s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.33)}"/>`;
    }
    s += `<path d="${scallops(cx, cy, R * 0.4, 18)}"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.5)}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.52)}"/>`;
    for (let i = 0; i < 24; i++) {
      s += `<path transform="translate(${f(cx)} ${f(cy)}) rotate(${f(i * 15)}) translate(0 ${f(-R * 0.53)})" d="${petal(R * 0.2, R * 0.05)}"/>`;
      s += `<path transform="translate(${f(cx)} ${f(cy)}) rotate(${f(i * 15)})" d="M0 ${f(-R * 0.56)} V${f(-R * 0.69)}" stroke-width="${f(Math.max(0.8, R / 220))}"/>`;
    }
    s += `<path d="${scallops(cx, cy, R * 0.76, 36)}"/><path d="${scallops(cx, cy, R * 0.83, 36)}" stroke-dasharray="2 5"/>`;
    s += '</g>';
    s += dotsRing(cx, cy, R * 0.9, 36, Math.max(1.4, R * 0.012), c);
    s += dotsRing(cx, cy, R * 0.97, 72, Math.max(1, R * 0.007), c);
    if (core) s += dotsRing(cx, cy, R * 0.37, 18, Math.max(1.2, R * 0.009), c);
    return s;
  }
  // a mehendi finger band: stacked rows of lattice, scallops, dots and vines
  function hennaBand(x, w, H, c, seed) {
    const r = rng(seed);
    let s = `<g fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round">`;
    let y = 26;
    const rule = (yy) => `<path d="M${f(x)} ${f(yy)} H${f(x + w)} M${f(x)} ${f(yy + 6)} H${f(x + w)}"/>`;
    const rows = ['lattice', 'scallop', 'vine', 'dots', 'flowers', 'scallop', 'lattice', 'vine'];
    let k = Math.floor(r() * 3);
    while (y < H - 60) {
      s += rule(y); y += 6;
      const kind = rows[k++ % rows.length];
      const left = H - 26 - y;
      if (kind === 'lattice') {
        const h = Math.min(w * 1.1, left), n = 4, cw = w / n;
        let p = '';
        for (let i = -n; i <= n * 2; i++) p += `M${f(x + i * cw)} ${f(y)} L${f(x + i * cw + h)} ${f(y + h)} M${f(x + i * cw)} ${f(y)} L${f(x + i * cw - h)} ${f(y + h)}`;
        s += `<svg x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" overflow="hidden"><path d="${p}" stroke-width="1"/></svg>`;
        y += h;
      } else if (kind === 'scallop') {
        const n = 4, cw = w / n;
        for (let i = 0; i < n; i++) {
          s += `<path d="M${f(x + i * cw)} ${f(y + 4)} A${f(cw / 2)} ${f(cw / 2)} 0 0 0 ${f(x + (i + 1) * cw)} ${f(y + 4)}"/>`;
          s += `<path d="M${f(x + i * cw + 6)} ${f(y + 4)} A${f(cw / 2 - 6)} ${f(cw / 2 - 6)} 0 0 0 ${f(x + (i + 1) * cw - 6)} ${f(y + 4)}" stroke-dasharray="1.5 4"/>`;
          s += `<circle cx="${f(x + (i + 0.5) * cw)}" cy="${f(y + cw / 2 + 12)}" r="2.2" fill="${c}" stroke="none"/>`;
        }
        y += cw / 2 + 24;
      } else if (kind === 'vine') {
        const h = Math.min(w * 1.6, left);
        let p = `M${f(x + w / 2)} ${f(y)}`;
        for (let yy = y; yy < y + h; yy += 40) p += ` q${f(w * 0.22)} 10 0 20 q${f(-w * 0.22)} 10 0 20`;
        s += `<path d="${p}"/>`;
        for (let yy = y + 10, i = 0; yy < y + h - 10; yy += 20, i++) {
          const side = i % 2 ? -1 : 1;
          s += `<path transform="translate(${f(x + w / 2 + side * w * 0.06)} ${f(yy)}) rotate(${side * 62})" d="${leaf(w * 0.32, w * 0.09, 0)}"/>`;
        }
        y += h;
      } else if (kind === 'dots') {
        for (let i = 0; i < 6; i++) s += `<circle cx="${f(x + (i + 0.5) * (w / 6))}" cy="${f(y + 12)}" r="2.6" fill="${c}" stroke="none"/>`;
        y += 26;
      } else {
        const n = 2, cw = w / n;
        for (let i = 0; i < n; i++) {
          const fx = x + (i + 0.5) * cw, fy = y + cw / 2 + 4;
          for (let p = 0; p < 6; p++) s += `<path transform="translate(${f(fx)} ${f(fy)}) rotate(${p * 60})" d="${petal(cw * 0.36, cw * 0.13)}"/>`;
          s += `<circle cx="${f(fx)}" cy="${f(fy)}" r="3" fill="${c}" stroke="none"/>`;
        }
        y += cw + 8;
      }
    }
    s += rule(Math.min(y, H - 32));
    return s + '</g>';
  }
  CT.register('henna', {
    name: 'Henna',
    occasions: ['mehendi', 'haldi', 'sangeet'],
    description: 'Fine mehendi line work: finger-band borders and a scalloped medallion',
    slots: 0,
    motif: (c) => `<g fill="none" stroke="${c}" stroke-width="1.6"><path d="${scallops(30, 30, 12, 10)}"/><circle cx="30" cy="30" r="5"/></g><circle cx="30" cy="30" r="2" fill="${c}"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const bw = Math.min(W * 0.11, 150), gap = Math.min(W * 0.035, 48);
      const line = mix(th.accent, '#fff', 0.15);
      s += hennaBand(gap, bw, H, line, 3) + hennaBand(W - gap - bw, bw, H, line, 7);
      const R = H * 0.2;
      s += hennaMedallion(W / 2, H * 0.27, R, line);
      const st = stack(d, W / 2, H * 0.71, W - 2 * (gap + bw) - 80, H * 0.1, { amp: line });
      return s + st.svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const bw = Math.min(W * 0.11, 150), gap = Math.min(W * 0.035, 48);
      const line = mix(th.accent, '#fff', 0.15);
      s += hennaBand(gap, bw, H, line, 11) + hennaBand(W - gap - bw, bw, H, line, 13);
      const R = H * 0.19;
      s += hennaMedallion(W / 2, H * 0.33, R, line, { core: false });
      s += t(W / 2, H * 0.33 + R * 0.12, initials(d), { size: fit(initials(d), R * 0.6, R * 0.34) });
      return s + studioBlock(d, W / 2, H * 0.67);
    },
  });

  /* ======================================================================
     dhol-beats (sangeet): a laced dhol with phumman tassels, its beat
     spreading in rings
     ====================================================================== */
  function dhol(cx, cy, L, r, rot, th, id) {
    const rx = r * 0.3, hl = L / 2;
    let s = `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${rot})">`;
    // strap
    s += `<path d="M${f(-hl * 0.7)} ${f(-r * 0.92)} C${f(-hl * 0.5)} ${f(-r * 2.3)} ${f(hl * 0.5)} ${f(-r * 2.3)} ${f(hl * 0.7)} ${f(-r * 0.92)}" fill="none" stroke="${mix(th.accent, '#000', 0.35)}" stroke-width="${f(r * 0.13)}" stroke-linecap="round"/>`;
    s += `<path d="M${f(-hl * 0.7)} ${f(-r * 0.92)} C${f(-hl * 0.5)} ${f(-r * 2.3)} ${f(hl * 0.5)} ${f(-r * 2.3)} ${f(hl * 0.7)} ${f(-r * 0.92)}" fill="none" stroke="${MARIGOLD}" stroke-width="2" stroke-dasharray="6 6"/>`;
    const body = `M${f(-hl)} ${f(-r)} Q0 ${f(-r * 1.14)} ${f(hl)} ${f(-r)} L${f(hl)} ${f(r)} Q0 ${f(r * 1.14)} ${f(-hl)} ${f(r)} A${f(rx)} ${f(r)} 0 0 1 ${f(-hl)} ${f(-r)}Z`;
    s += `<path d="${body}" fill="#000" opacity=".3" transform="translate(10 16)"/>`;
    s += `<path d="${body}" fill="${th.accent}"/><path d="${body}" fill="url(#${id}cyl)"/>`;
    // rim bands near each end
    [-hl + L * 0.07, hl - L * 0.07].forEach((x) => {
      s += `<path d="M${f(x)} ${f(-r * 0.99)} A${f(rx)} ${f(r * 0.99)} 0 0 1 ${f(x)} ${f(r * 0.99)}" fill="none" stroke="url(#${id}foil)" stroke-width="${f(r * 0.09)}"/>`;
    });
    // rope lacing zigzag with metal rings at the turns
    const n = 10, xl = -hl + L * 0.12, xr = hl - L * 0.12;
    let z = '', rings = '';
    for (let k = 0; k <= n; k++) {
      const y = -r * 0.93 * Math.cos((Math.PI * k) / n), x = k % 2 ? xr : xl;
      z += (k ? 'L' : 'M') + f(x) + ' ' + f(y);
      rings += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.04)}" fill="none" stroke="#E9E4DA" stroke-width="2"/>`;
    }
    s += `<path d="${z}" fill="none" stroke="#2A160E" stroke-width="5" opacity=".35" transform="translate(2 3)"/><path d="${z}" fill="none" stroke="${MARIGOLD}" stroke-width="4" stroke-linejoin="round"/>` + rings;
    // visible playing face
    s += `<ellipse cx="${f(hl)}" cy="0" rx="${f(rx * 1.04)}" ry="${f(r * 1.04)}" fill="url(#${id}foil)"/>`;
    s += `<ellipse cx="${f(hl)}" cy="0" rx="${f(rx * 0.86)}" ry="${f(r * 0.92)}" fill="#F3E6CC"/>`;
    s += `<ellipse cx="${f(hl + rx * 0.1)}" cy="${f(-r * 0.1)}" rx="${f(rx * 0.4)}" ry="${f(r * 0.45)}" fill="#fff" opacity=".35"/>`;
    // phumman tassels hanging under each rim
    [-hl + L * 0.07, hl - L * 0.07].forEach((x, j) => {
      const y0 = r * 0.98;
      [[-0.07, 0.42, ORANGE], [0.05, 0.3, mix(th.accent, '#fff', 0.25)], [0.15, 0.48, MARIGOLD]].forEach(([dx, len, c]) => {
        const tx = x + dx * r * (j ? 1 : -1), ty = y0 + len * r;
        s += `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(tx)}" y2="${f(ty)}" stroke="${MARIGOLD}" stroke-width="2"/>`;
        s += marigold(tx, ty + r * 0.08, r * 0.1, c);
      });
    });
    return s + '</g>';
  }
  function dholDefs(id) {
    return `<defs><linearGradient id="${id}cyl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".28" stop-color="#000" stop-opacity=".05"/>
      <stop offset=".4" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient></defs>`;
  }
  function beatRings(cx, cy, from, step, count, color) {
    let s = '';
    for (let i = 0; i < count; i++) s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(from + i * step)}" fill="none" stroke="${color}" stroke-width="${i % 3 === 0 ? 3 : 1.4}" opacity="${f(0.32 - i * 0.025)}"/>`;
    return s;
  }
  CT.register('dhol-beats', {
    name: 'Dhol beats',
    occasions: ['sangeet', 'wedding'],
    description: 'A laced dhol with phumman tassels, its beat spreading in rings',
    slots: 0,
    motif: (c) => `<g fill="none" stroke="${c}" stroke-width="2"><rect x="12" y="20" width="36" height="22" rx="4"/><path d="M16 22 L24 40 L32 22 L40 40 L46 24"/></g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + dholDefs(id);
      if (isWide(W, H)) {
        const cx = W * 0.3, cy = H * 0.56;
        s += beatRings(cx, cy, H * 0.3, H * 0.075, 12, th.accent);
        s += dhol(cx, cy, H * 0.5, H * 0.16, -16, th, id);
        s += stack(d, W * 0.7, H * 0.5, W * 0.46, H * 0.13, { amp: th.accent }).svg;
      } else {
        const cx = W / 2, cy = H * 0.31, L = Math.min(H * 0.42, W * 0.5);
        s += beatRings(cx, cy, L * 0.62, H * 0.07, 10, th.accent);
        s += dhol(cx, cy, L, L * 0.3, -10, th, id);
        s += stack(d, W / 2, H * 0.74, W * 0.8, H * 0.1, { amp: th.accent }).svg;
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + dholDefs(id);
      s += beatRings(W / 2, H * 0.3, H * 0.2, H * 0.06, 8, th.accent);
      s += dhol(W / 2, H * 0.3, H * 0.3, H * 0.09, -8, th, id);
      s += t(W / 2, H * 0.55, initials(d), { size: fit(initials(d), W * 0.4, H * 0.075) });
      return s + studioBlock(d, W / 2, H * 0.68);
    },
  });

  /* ======================================================================
     fairy-lights (reception): warm string lights crossing the night
     ====================================================================== */
  function lightDefs(id, th) {
    return `<defs><radialGradient id="${id}glow"><stop offset="0" stop-color="#FFE2A0" stop-opacity=".75"/><stop offset=".35" stop-color="#FFC861" stop-opacity=".25"/><stop offset="1" stop-color="#FFC861" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}bk"><stop offset="0" stop-color="${mix(th.accent, '#fff', 0.3)}" stop-opacity=".22"/><stop offset=".7" stop-color="${th.accent}" stop-opacity=".12"/><stop offset="1" stop-color="${th.accent}" stop-opacity="0"/></radialGradient>
      <filter id="${id}tg" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="14"/></filter></defs>`;
  }
  function bulb(x, y, s, bright, id) {
    return `<circle cx="${f(x)}" cy="${f(y + s * 0.9)}" r="${f(s * 3.4 * bright)}" fill="url(#${id}glow)"/>` +
      `<rect x="${f(x - s * 0.28)}" y="${f(y - s * 0.1)}" width="${f(s * 0.56)}" height="${f(s * 0.45)}" fill="#3B3A36"/>` +
      `<path transform="translate(${f(x)} ${f(y + s * 1.55)}) rotate(180)" d="${petal(s * 1.25, s * 0.55)}" fill="${bright > 0.8 ? '#FFF1C9' : '#F7D58C'}"/>`;
  }
  function strand(x0, y0, x1, y1, sag, step, seed, id, size = 9) {
    const r = rng(seed);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
    let s = `<path d="M${f(x0)} ${f(y0)} Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}" fill="none" stroke="#E8DFC8" stroke-opacity=".35" stroke-width="1.6"/>`;
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step));
    for (let i = 1; i < n; i++) {
      const k = i / n, x = (1 - k) ** 2 * x0 + 2 * k * (1 - k) * mx + k * k * x1, y = (1 - k) ** 2 * y0 + 2 * k * (1 - k) * my + k * k * y1;
      s += bulb(x, y, size, 0.55 + r() * 0.45, id);
    }
    return s;
  }
  function curtain(x, len, step, id, size = 8) {
    let s = `<line x1="${f(x)}" y1="0" x2="${f(x)}" y2="${f(len)}" stroke="#E8DFC8" stroke-opacity=".3" stroke-width="1.3"/>`;
    for (let y = step * 0.6; y < len; y += step) s += bulb(x, y, size, 0.7, id);
    return s;
  }
  function bokeh(W, H, seed, count, y0, y1, id) {
    const r = rng(seed);
    let s = '';
    for (let i = 0; i < count; i++) s += `<circle cx="${f(r() * W)}" cy="${f(y0 + r() * (y1 - y0))}" r="${f(18 + r() * 60)}" fill="url(#${id}bk)"/>`;
    return s;
  }
  CT.register('fairy-lights', {
    name: 'Fairy lights',
    occasions: ['reception', 'sangeet', 'anniversary'],
    description: 'Strings of warm bulbs criss-crossing a night sky, names softly glowing',
    slots: 0,
    motif: (c) => `<path d="M0 14 Q30 34 60 14" fill="none" stroke="${c}" stroke-width="1.5"/><path transform="translate(30 38) rotate(180)" d="${petal(12, 5)}" fill="${c}"/><circle cx="30" cy="24" r="2.5" fill="${c}"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + lightDefs(id, th);
      s += bokeh(W, H, 5, Math.round(W / 50), H * 0.25, H * 1.05, id);
      s += strand(-20, H * 0.03, W + 20, H * 0.15, H * 0.16, 70, 1, id, 8);
      s += strand(-20, H * 0.2, W + 20, H * 0.02, H * 0.14, 64, 2, id, 9);
      s += strand(-20, H * 0.09, W + 20, H * 0.08, H * 0.26, 58, 3, id, 10);
      const cw = Math.min(W * 0.11, 140);
      [0.18, 0.5, 0.82].forEach((k, i) => { s += curtain(cw * k, H * (0.5 + i * 0.1), 46, id) + curtain(W - cw * k, H * (0.58 - i * 0.06), 46, id); });
      const inner = W - 2 * cw - 60;
      const glow = stack(d, W / 2, H * 0.66, inner * 0.92, H * 0.12, { color: '#FFD27A', amp: '#FFD27A', lineColor: '#FFD27A', opacity: 0.5 });
      s += `<g filter="url(#${id}tg)" opacity=".55">${glow.svg}</g>`;
      return s + stack(d, W / 2, H * 0.66, inner * 0.92, H * 0.12, { amp: th.accent }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + lightDefs(id, th);
      s += bokeh(W, H, 8, Math.round(W / 70), H * 0.3, H, id);
      s += strand(-20, H * 0.04, W + 20, H * 0.04, H * 0.2, 64, 4, id, 9);
      const ini = initials(d);
      s += `<g filter="url(#${id}tg)" opacity=".6">${t(W / 2, H * 0.44, ini, { size: fit(ini, W * 0.4, H * 0.11), color: '#FFD27A' })}</g>`;
      s += t(W / 2, H * 0.44, ini, { size: fit(ini, W * 0.4, H * 0.11) });
      return s + studioBlock(d, W / 2, H * 0.64);
    },
  });

  /* ======================================================================
     golden-years (anniversary): an engraved guilloche rosette in gold,
     like the edge of an heirloom locket
     ====================================================================== */
  function guilloche(cx, cy, r0, amp, k, copies, stroke, sw, opacity) {
    let s = `<g fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}">`;
    const N = 540;
    for (let c = 0; c < copies; c++) {
      const ph = (c / copies) * (TAU / k);
      let p = '';
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, rr = r0 + amp * Math.sin(k * a + ph * k);
        p += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
      }
      s += `<path d="${p}"/>`;
    }
    return s + '</g>';
  }
  function guillocheBand(y, W, h, copies, stroke, opacity) {
    let s = `<g fill="none" stroke="${stroke}" stroke-width="1" opacity="${opacity}">`;
    const per = h * 2.4;
    for (let c = 0; c < copies; c++) {
      let p = '';
      for (let x = -10; x <= W + 10; x += 6) p += (x > -10 ? 'L' : 'M') + f(x) + ' ' + f(y + h / 2 + (h / 2) * Math.sin((x / per) * TAU + (c / copies) * TAU));
      s += `<path d="${p}"/>`;
    }
    return s + `<path d="M0 ${f(y - 6)} H${W} M0 ${f(y + h + 6)} H${W}" stroke-width="1.4"/></g>`;
  }
  function locket(cx, cy, R, id, d, th) {
    let s = guilloche(cx, cy, R * 0.79, R * 0.15, 18, 22, `url(#${id}foil)`, 1.1, 0.9);
    s += guilloche(cx, cy, R * 0.79, R * 0.15, 18, 2, '#FFF1C9', 1.4, 0.5);
    s += guilloche(cx, cy, R * 0.6, R * 0.025, 60, 3, MARIGOLD, 1, 0.8);
    s += guilloche(cx, cy, R * 0.975, R * 0.018, 90, 2, MARIGOLD, 1, 0.75);
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.565)}" fill="${th.silk}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.565)}" fill="url(#${id}fo)" opacity=".5"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.565)}" fill="none" stroke="url(#${id}foil)" stroke-width="4"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.535)}" fill="none" stroke="${MARIGOLD}" stroke-width="1" opacity=".7"/>`;
    return s;
  }
  CT.register('golden-years', {
    name: 'Golden years',
    occasions: ['anniversary', 'wedding', 'reception'],
    description: 'An engraved guilloche rosette in gold, the names set in its centre',
    slots: 0,
    motif: (c) => `<g fill="none" stroke="${c}" stroke-width="1.2">${[0, 1, 2, 3].map((i) => `<ellipse cx="30" cy="30" rx="20" ry="8" transform="rotate(${i * 45} 30 30)"/>`).join('')}</g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += guillocheBand(H * 0.035, W, 22, 5, MARIGOLD, 0.55) + guillocheBand(H * 0.965 - 22, W, 22, 5, MARIGOLD, 0.55);
      const R = Math.min(H * 0.43, W * 0.47), cy = H / 2;
      s += locket(W / 2, cy, R, id, d, th);
      const inner = R * 0.565;
      const st = stack(d, W / 2, cy, inner * 1.45, inner * 0.36, { size: 30, gap: 38, first: 44 });
      return s + st.svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += guillocheBand(H * 0.035, W, 22, 5, MARIGOLD, 0.55) + guillocheBand(H * 0.965 - 22, W, 22, 5, MARIGOLD, 0.55);
      const R = H * 0.24;
      s += locket(W / 2, H * 0.34, R, id, d, th);
      s += t(W / 2, H * 0.34 + R * 0.14, initials(d), { size: fit(initials(d), R * 0.8, R * 0.42) });
      return s + studioBlock(d, W / 2, H * 0.68);
    },
  });

  /* ======================================================================
     balloons (birthday): a glossy bunch of balloons, strings gathered
     ====================================================================== */
  const balloonPath = (a, b) => `M0 ${f(-b)} C${f(a * 1.12)} ${f(-b)} ${f(a * 1.06)} ${f(b * 0.38)} 0 ${f(b)} C${f(-a * 1.06)} ${f(b * 0.38)} ${f(-a * 1.12)} ${f(-b)} 0 ${f(-b)}Z`;
  function balloonDefs(id) {
    return `<defs><radialGradient id="${id}bh" cx=".34" cy=".28" r=".62"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}bd" cx=".42" cy=".38" r=".7"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient></defs>`;
  }
  function balloon(x, y, a, rot, fill, id) {
    const b = a * 1.22;
    let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})">`;
    s += `<path d="${balloonPath(a, b)}" fill="${fill}"/><path d="${balloonPath(a, b)}" fill="url(#${id}bd)"/><path d="${balloonPath(a, b)}" fill="url(#${id}bh)"/>`;
    s += `<ellipse cx="${f(-a * 0.42)}" cy="${f(-b * 0.45)}" rx="${f(a * 0.12)}" ry="${f(a * 0.26)}" transform="rotate(28 ${f(-a * 0.42)} ${f(-b * 0.45)})" fill="#fff" opacity=".6"/>`;
    s += `<path d="M0 ${f(b - 2)} l${f(-a * 0.09)} ${f(a * 0.13)} h${f(a * 0.18)} z" fill="${fill}"/>`;
    return s + '</g>';
  }
  // a bunch laid out in a unit box (x 0..1, y 0..1), scaled into the given box
  const BUNCH = [[0.18, 0.4, 0.17, -14, 0], [0.5, 0.18, 0.18, 2, 1], [0.8, 0.36, 0.16, 15, 2], [0.36, 0.62, 0.15, -8, 3], [0.66, 0.6, 0.16, 9, 0], [0.24, 0.13, 0.13, -10, 2], [0.85, 0.1, 0.12, 12, 3], [0.52, 0.42, 0.15, -2, 2]];
  function bunch(bx, by, bw, bh, gx, gy, th, id) {
    const pal = [th.accent, '#F6F0E4', `url(#${id}foil)`, mix(th.accent, ORANGE, 0.55)];
    const sc = Math.min(bw, bh * 1.1);
    let strings = '', balls = '';
    const order = BUNCH.map((v, i) => [v, i]).sort((p, q) => p[0][1] - q[0][1]);
    order.forEach(([[ux, uy, us, rot, ci]], i) => {
      const x = bx + ux * bw, y = by + uy * bh, a = us * sc, b = a * 1.22;
      const kx = x - Math.sin((rot * Math.PI) / 180) * b, ky = y + Math.cos((rot * Math.PI) / 180) * b;
      strings += `<path d="M${f(kx)} ${f(ky + a * 0.12)} C${f(kx + (i % 2 ? 20 : -20))} ${f(ky + (gy - ky) * 0.4)} ${f(gx + (kx - gx) * 0.2)} ${f(gy - (gy - ky) * 0.35)} ${f(gx)} ${f(gy)}" fill="none" stroke="#F2EBDD" stroke-opacity=".6" stroke-width="1.6"/>`;
      balls += balloon(x, y, a, rot, pal[ci], id);
    });
    // ribbon bow where the strings meet
    const bow = `<g transform="translate(${f(gx)} ${f(gy)})" fill="${th.accent}"><path d="M0 0 C-30 -22 -46 6 -40 14 C-34 22 -12 8 0 0Z"/><path d="M0 0 C30 -22 46 6 40 14 C34 22 12 8 0 0Z"/>` +
      `<path d="M-3 2 L-16 46 L-6 40 L0 50Z" opacity=".85"/><path d="M3 2 L14 48 L4 41Z" opacity=".85"/><circle r="7"/></g>`;
    return strings + balls + bow;
  }
  CT.register('balloons', {
    name: 'Balloons',
    occasions: ['birthday', 'baby-shower', 'other'],
    description: 'A glossy bunch of balloons, pearl, gold and the album colour',
    slots: 0,
    motif: (c) => `<g transform="translate(30 24)"><path d="${balloonPath(11, 13.5)}" fill="${c}"/></g><path d="M30 38 Q26 46 31 56" fill="none" stroke="${c}" stroke-width="1.2"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + balloonDefs(id);
      // a sprinkle of tiny gold dots
      const r = rng(21);
      for (let i = 0; i < 40; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(1.5 + r() * 2.5)}" fill="${MARIGOLD}" opacity="${f(0.25 + r() * 0.4)}"/>`;
      if (isWide(W, H)) {
        s += bunch(W * 0.5, H * 0.08, W * 0.44, H * 0.6, W * 0.73, H * 0.86, th, id);
        s += stack(d, W * 0.08, H * 0.52, W * 0.42, H * 0.17, { anchor: 'start', amp: th.accent }).svg;
      } else {
        s += bunch(W * 0.44, H * 0.06, W * 0.54, H * 0.46, W * 0.74, H * 0.74, th, id);
        s += stack(d, W * 0.08, H * 0.7, W * 0.52, H * 0.15, { anchor: 'start', amp: th.accent }).svg;
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + balloonDefs(id);
      s += balloon(W / 2 - H * 0.07, H * 0.2, H * 0.07, -10, th.accent, id) + balloon(W / 2 + H * 0.06, H * 0.16, H * 0.075, 8, `url(#${id}foil)`, id);
      s += `<path d="M${f(W / 2 - H * 0.085)} ${f(H * 0.29)} Q${f(W / 2 - 20)} ${f(H * 0.36)} ${f(W / 2)} ${f(H * 0.4)} M${f(W / 2 + H * 0.045)} ${f(H * 0.26)} Q${f(W / 2 + 20)} ${f(H * 0.34)} ${f(W / 2)} ${f(H * 0.4)}" fill="none" stroke="#F2EBDD" stroke-opacity=".6" stroke-width="1.6"/>`;
      s += t(W / 2, H * 0.53, initials(d), { size: fit(initials(d), W * 0.4, H * 0.08) });
      return s + studioBlock(d, W / 2, H * 0.66);
    },
  });

  /* ======================================================================
     moon-stars (baby shower, maternity): a crib mobile, crescent moon,
     stars and clouds on threads
     ====================================================================== */
  const crescent = (R) => `M0 ${f(-R)} A${f(R)} ${f(R)} 0 1 0 0 ${f(R)} A${f(R * 0.62)} ${f(R)} 0 1 1 0 ${f(-R)}Z`;
  const cloud = (w) => { const h = w * 0.5; return `M${f(-w / 2)} ${f(h * 0.3)} a${f(h * 0.32)} ${f(h * 0.32)} 0 0 1 ${f(w * 0.12)} ${f(-h * 0.55)} a${f(h * 0.42)} ${f(h * 0.42)} 0 0 1 ${f(w * 0.32)} ${f(-h * 0.25)} a${f(h * 0.36)} ${f(h * 0.36)} 0 0 1 ${f(w * 0.36)} ${f(h * 0.3)} a${f(h * 0.28)} ${f(h * 0.28)} 0 0 1 ${f(w * 0.2)} ${f(h * 0.5)}Z`; };
  function starrySky(W, H, seed, n) {
    const r = rng(seed);
    let s = '';
    for (let i = 0; i < n; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(0.8 + r() * 1.8)}" fill="#FFF6E0" opacity="${f(0.2 + r() * 0.5)}"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="${glint(r() * W, r() * H, 6 + r() * 8)}" fill="#FFF6E0" opacity=".55"/>`;
    return s;
  }
  function mobile(cx, top, span, scale, th, id) {
    const barY = top + 30 * scale;
    let s = `<line x1="${f(cx)}" y1="${f(top - 400)}" x2="${f(cx)}" y2="${f(barY - 18 * scale)}" stroke="#F2EBDD" stroke-opacity=".5" stroke-width="1.4"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(barY - 14 * scale)}" r="${f(6 * scale)}" fill="none" stroke="url(#${id}foil)" stroke-width="2.5"/>`;
    const items = [[-0.5, 0.15, 'star', 0.85], [-0.26, 0.23, 'cloud', 1], [0, 0.11, 'moon', 1], [0.26, 0.25, 'star', 1.1], [0.5, 0.12, 'cloud', 0.85]];
    let hang = '';
    items.forEach(([k, len, kind, sz]) => {
      const x = cx + k * span, bend = (k * k) * 26 * scale, y0 = barY + bend, y1 = y0 + len * 1000 * scale;
      hang += `<line x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y1)}" stroke="#F2EBDD" stroke-opacity=".5" stroke-width="1.2"/>`;
      if (kind === 'moon') {
        const R = 92 * scale * sz;
        hang += `<g transform="translate(${f(x + R * 0.41)} ${f(y1 + R * 0.9)}) rotate(-24)"><path d="${crescent(R)}" fill="url(#${id}foil)"/>` +
          `<path d="M${f(-R * 0.62)} ${f(-R * 0.05)} q${f(R * 0.09)} ${f(R * 0.08)} ${f(R * 0.18)} 0" fill="none" stroke="#7A4E06" stroke-width="${f(2.2 * scale)}" stroke-linecap="round" opacity=".6"/></g>`;
      } else if (kind === 'star') {
        const R = 40 * scale * sz;
        hang += `<path d="${star(x, y1 + R * 0.95, R, R * 0.48)}" fill="${th.accent}" stroke="${th.accent}" stroke-width="${f(7 * scale)}" stroke-linejoin="round"/>`;
      } else {
        const w = 120 * scale * sz;
        hang += `<g transform="translate(${f(x)} ${f(y1 + w * 0.3)})"><path d="${cloud(w)}" fill="#F6F0E4"/><path d="${cloud(w)}" fill="#000" opacity=".06" transform="translate(0 ${f(w * 0.06)}) scale(1 .7)"/></g>`;
      }
    });
    // curved wooden bar
    s += hang + `<path d="M${f(cx - span * 0.56)} ${f(barY + 0.25 * 26 * scale * 1.2)} Q${f(cx)} ${f(barY - 30 * scale)} ${f(cx + span * 0.56)} ${f(barY + 0.25 * 26 * scale * 1.2)}" fill="none" stroke="url(#${id}foil)" stroke-width="${f(5 * scale)}" stroke-linecap="round"/>`;
    return s;
  }
  CT.register('moon-stars', {
    name: 'Moon and stars',
    occasions: ['baby-shower', 'maternity', 'birthday'],
    description: 'A crib mobile of a crescent moon, stars and clouds on threads',
    slots: 0,
    motif: (c) => `<g transform="translate(24 30) rotate(-24)"><path d="${crescent(13)}" fill="${c}"/></g><path d="${star(44, 18, 7, 3.2)}" fill="${c}"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + starrySky(W, H, 31, Math.round(W / 9));
      const span = Math.min(W * 0.66, H * 0.86), scale = span / 560;
      s += mobile(W / 2, H * 0.03, span, scale, th, id);
      return s + stack(d, W / 2, H * 0.76, Math.min(W * 0.8, H * 0.9), H * 0.095, { amp: th.accent }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + starrySky(W, H, 37, Math.round(W / 14));
      s += `<g transform="translate(${f(W / 2)} ${f(H * 0.3)}) rotate(-24)"><path d="${crescent(H * 0.13)}" fill="url(#${id}foil)"/></g>`;
      s += `<path d="${star(W / 2 + H * 0.12, H * 0.2, 22, 10)}" fill="${th.accent}" stroke="${th.accent}" stroke-width="5" stroke-linejoin="round"/>`;
      s += t(W / 2, H * 0.54, initials(d), { size: fit(initials(d), W * 0.4, H * 0.075) });
      return s + studioBlock(d, W / 2, H * 0.67);
    },
  });

  /* ======================================================================
     minimal-foil (other): quiet silk, a notched foil frame, the names
     stamped in gold over a debossed initial
     ====================================================================== */
  function notchedFrame(x, y, w, h, n) {
    return `M${f(x + n)} ${f(y)} H${f(x + w - n)} A${n} ${n} 0 0 0 ${f(x + w)} ${f(y + n)} V${f(y + h - n)} A${n} ${n} 0 0 0 ${f(x + w - n)} ${f(y + h)} H${f(x + n)} A${n} ${n} 0 0 0 ${f(x)} ${f(y + h - n)} V${f(y + n)} A${n} ${n} 0 0 0 ${f(x + n)} ${f(y)}Z`;
  }
  function rule(cx, y, w, id) {
    return `<path d="M${f(cx - w / 2)} ${f(y)} H${f(cx - 14)} M${f(cx + 14)} ${f(y)} H${f(cx + w / 2)}" stroke="${MARIGOLD}" stroke-width="1.6"/>` +
      `<path d="M${f(cx)} ${f(y - 8)} L${f(cx + 8)} ${f(y)} L${f(cx)} ${f(y + 8)} L${f(cx - 8)} ${f(y)}Z" fill="url(#${id}foil)"/>`;
  }
  function frame(W, H, id) {
    const m = Math.min(W, H) * 0.045;
    return `<path d="${notchedFrame(m, m, W - 2 * m, H - 2 * m, 34)}" fill="none" stroke="url(#${id}foil)" stroke-width="2.4"/>` +
      `<path d="${notchedFrame(m + 12, m + 12, W - 2 * m - 24, H - 2 * m - 24, 24)}" fill="none" stroke="${MARIGOLD}" stroke-width="1" opacity=".5"/>`;
  }
  CT.register('minimal-foil', {
    name: 'Foil on silk',
    occasions: ['other', 'anniversary', 'reception', 'birthday'],
    description: 'Quiet silk, a notched gold frame and the names stamped in foil',
    slots: 0,
    motif: (c) => `<path d="${notchedFrame(16, 16, 28, 28, 6)}" fill="none" stroke="${c}" stroke-width="1.6"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + frame(W, H, id);
      const big = d.initials[0] || '';
      s += t(W / 2, H * 0.86, big, { size: H * 1.05, color: '#fff', opacity: 0.045 });
      const st = stack(d, W / 2, H * 0.53, Math.min(W * 0.7, H * 0.85), H * 0.12, { color: `url(#${id}foil)`, amp: JASMINE, lineColor: JASMINE });
      s += rule(W / 2, st.top - 34, 180, id) + st.svg + rule(W / 2, st.bottom + 40, 180, id);
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + frame(W, H, id);
      const ini = initials(d);
      s += t(W / 2, H * 0.44, ini, { size: fit(ini, W * 0.4, H * 0.12), color: `url(#${id}foil)` });
      s += rule(W / 2, H * 0.52, 140, id);
      return s + studioBlock(d, W / 2, H * 0.66);
    },
  });

  /* ======================================================================
     PHOTO DESIGNS
     ====================================================================== */
  const archD = (x, y, w, h) => `M${f(x)} ${f(y + h)} V${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} V${f(y + h)} Z`;
  // a faint carved-stone jaali: eight-pointed stars on a lattice
  function jaaliDefs(id, color, op = 0.06) {
    return `<defs><pattern id="${id}jl" width="56" height="56" patternUnits="userSpaceOnUse"><g fill="none" stroke="${color}" stroke-width="1.4" opacity="${op}">` +
      `<path d="${star(28, 28, 17, 10, 8, -90)}"/><path d="M0 0 L12 12 M56 0 L44 12 M0 56 L12 44 M56 56 L44 44"/><circle cx="28" cy="28" r="4"/></g></pattern></defs>`;
  }

  /* ---- arch-window: one tall arched photo, names beside it ---- */
  function archFrame(id, x, y, w, h, photo) {
    let s = `<path d="${archD(x - 22, y - 22, w + 44, h + 22)}" fill="#000" opacity=".22"/>`;
    s += photoSlot(id, 0, x, y, w, h, photo, { shape: 'arch', stroke: `url(#${id}foil)`, sw: 5 });
    s += `<path d="${archD(x - 16, y - 16, w + 32, h + 16)}" fill="none" stroke="${MARIGOLD}" stroke-width="1.3" opacity=".75"/>`;
    // finial at the crown and a plinth under the opening
    s += `<g transform="translate(${f(x + w / 2)} ${f(y - 18)})"><path d="${petal(46, 15)}" fill="url(#${id}foil)"/><circle cy="4" r="7" fill="url(#${id}foil)"/></g>`;
    s += `<rect x="${f(x - 34)}" y="${f(y + h)}" width="${f(w + 68)}" height="10" fill="url(#${id}foil)"/><rect x="${f(x - 24)}" y="${f(y + h + 14)}" width="${f(w + 48)}" height="4" fill="${MARIGOLD}" opacity=".7"/>`;
    return s;
  }
  CT.register('arch-window', {
    name: 'Arch window',
    occasions: ['wedding', 'engagement', 'reception', 'anniversary'],
    description: 'One tall arched photo in a gold frame, a stone jaali behind',
    slots: 1,
    motif: (c) => `<path d="${archD(18, 10, 24, 40)}" fill="none" stroke="${c}" stroke-width="2"/>`,
    cover(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk) + jaaliDefs(id, '#fff', 0.07) + `<rect width="${W}" height="${H}" fill="url(#${id}jl)"/>`;
      if (isWide(W, H)) {
        const w = H * 0.46, h = H * 0.72, x = W * 0.09, y = H * 0.12;
        s += archFrame(id, x, y, w, h, photos[0]);
        const nx = (x + w + 40 + W) / 2;
        s += stack(d, nx, H * 0.5, W - (x + w + 40) - W * 0.1, H * 0.13, { amp: th.accent }).svg;
      } else {
        const w = Math.min(H * 0.38, W * 0.5), h = H * 0.5, x = (W - w) / 2, y = H * 0.1;
        s += archFrame(id, x, y, w, h, photos[0]);
        s += pairLine(d, W / 2, H * 0.77, W * 0.84, H * 0.1, { amp: th.accent }).svg;
        s += lineSvg(placeLine(d), W / 2, H * 0.845, { gap: 42 });
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + jaaliDefs(id, '#fff', 0.07) + `<rect width="${W}" height="${H}" fill="url(#${id}jl)"/>`;
      const w = H * 0.22, h = H * 0.3, x = (W - w) / 2, y = H * 0.12;
      s += `<path d="${archD(x, y, w, h)}" fill="${th.silk}"/><path d="${archD(x, y, w, h)}" fill="#000" opacity=".25" stroke="url(#${id}foil)" stroke-width="4"/>`;
      s += `<path d="${archD(x - 12, y - 12, w + 24, h + 12)}" fill="none" stroke="${MARIGOLD}" stroke-width="1.2" opacity=".7"/>`;
      s += t(W / 2, y + h * 0.68, initials(d), { size: fit(initials(d), w * 0.75, H * 0.075) });
      return s + studioBlock(d, W / 2, H * 0.62);
    },
  });

  /* ---- split-frame: photo on one side, a silk panel with a scalloped sari edge ---- */
  function scallopEdgeV(x, H, r, dir) {
    // vertical edge at x made of half circles bulging in direction dir (+1 right, -1 left)
    let p = `M${f(x)} -2`;
    for (let y = 0; y < H + 2 * r; y += 2 * r) p += ` A${f(r)} ${f(r)} 0 0 ${dir > 0 ? 1 : 0} ${f(x)} ${f(y + 2 * r)}`;
    return p;
  }
  function scallopEdgeH(y, W, r) {
    let p = `M-2 ${f(y)}`;
    for (let x = 0; x < W + 2 * r; x += 2 * r) p += ` A${f(r)} ${f(r)} 0 0 0 ${f(x + 2 * r)} ${f(y)}`;
    return p;
  }
  CT.register('split-frame', {
    name: 'Sari border split',
    occasions: ['pre-wedding', 'anniversary', 'maternity', 'birthday', 'other'],
    description: 'A full-height photo beside a silk panel with a scalloped sari edge',
    slots: 1,
    motif: (c) => `<path d="M30 0 A6 6 0 0 1 30 12 A6 6 0 0 1 30 24 A6 6 0 0 1 30 36 A6 6 0 0 1 30 48 A6 6 0 0 1 30 60" fill="none" stroke="${c}" stroke-width="2"/><circle cx="20" cy="18" r="2" fill="${c}"/><circle cx="20" cy="42" r="2" fill="${c}"/>`,
    cover(W, H, d, th, id, photos = []) {
      let s = `<rect width="${W}" height="${H}" fill="${th.silk}"/>`;
      const r = 18;
      if (isWide(W, H)) {
        const px = W * 0.42;
        s += photoSlot(id, 0, px, 0, W - px, H, photos[0], { stroke: 'none', sw: 0 });
        s += `<g><path d="M0 0 H${f(px)} ${scallopEdgeV(px, H, r, 1).slice(1).replace(/^[^A]*/, '')} V${H} H0Z" fill="${th.silk}"/></g>`;
        s += `<clipPath id="${id}pn"><path d="M0 0 H${f(px)} ${scallopEdgeV(px, H, r, 1).slice(1).replace(/^[^A]*/, '')} V${H} H0Z"/></clipPath>`;
        s += `<g clip-path="url(#${id}pn)">${silkBg(id, px + r + 2, H, th.silk)}</g>`;
        s += `<path d="${scallopEdgeV(px, H, r, 1)}" fill="none" stroke="url(#${id}foil)" stroke-width="3"/>`;
        s += `<path d="${scallopEdgeV(px - 12, H, r, 1)}" fill="none" stroke="${MARIGOLD}" stroke-width="1" opacity=".6"/>`;
        for (let y = r; y < H; y += 2 * r) s += `<circle cx="${f(px - 26)}" cy="${f(y)}" r="2.6" fill="${MARIGOLD}" opacity=".8"/>`;
        s += stack(d, px * 0.48, H * 0.5, px * 0.76, H * 0.11, { amp: th.accent }).svg;
      } else {
        const py = H * 0.6;
        s += photoSlot(id, 0, 0, 0, W, py + r, photos[0], { stroke: 'none', sw: 0 });
        const panel = `M-2 ${f(H + 2)} V${f(py)} ${scallopEdgeH(py, W, r).replace(/^M[^A]*/, '')} V${f(H + 2)}Z`;
        s += `<clipPath id="${id}pn"><path d="${panel}"/></clipPath><g clip-path="url(#${id}pn)">${silkBg(id, W, H, th.silk)}</g>`;
        s += `<path d="${scallopEdgeH(py, W, r)}" fill="none" stroke="url(#${id}foil)" stroke-width="3"/>`;
        for (let x = r; x < W; x += 2 * r) s += `<circle cx="${f(x)}" cy="${f(py + 30)}" r="2.6" fill="${MARIGOLD}" opacity=".8"/>`;
        s += pairLine(d, W / 2, H * 0.795, W * 0.86, H * 0.095, { amp: th.accent }).svg;
        s += lineSvg(placeLine(d), W / 2, H * 0.865, { gap: 40 });
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const r = 18;
      s += `<path d="${scallopEdgeH(H * 0.08, W, r)}" fill="none" stroke="url(#${id}foil)" stroke-width="3"/>`;
      s += `<path d="${scallopEdgeH(H * 0.08, W, r)}" fill="none" stroke="url(#${id}foil)" stroke-width="3" transform="translate(0 ${H}) scale(1 -1)"/>`;
      s += t(W / 2, H * 0.43, initials(d), { size: fit(initials(d), W * 0.4, H * 0.1) });
      return s + studioBlock(d, W / 2, H * 0.6);
    },
  });

  /* ---- garland-ring: round photo inside a varmala of marigold, roses and mango leaves ---- */
  function rose(x, y, r, c) {
    return `<g transform="translate(${f(x)} ${f(y)})"><circle r="${f(r)}" fill="${c}"/>` +
      `<path d="M${f(-r * 0.7)} ${f(-r * 0.1)} A${f(r * 0.7)} ${f(r * 0.7)} 0 0 1 ${f(r * 0.6)} ${f(-r * 0.35)} M${f(-r * 0.45)} ${f(r * 0.3)} A${f(r * 0.5)} ${f(r * 0.5)} 0 0 0 ${f(r * 0.5)} ${f(r * 0.1)} M${f(-r * 0.2)} ${f(-r * 0.05)} A${f(r * 0.22)} ${f(r * 0.22)} 0 1 1 ${f(r * 0.15)} ${f(r * 0.12)}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="${f(r * 0.12)}" stroke-linecap="round"/></g>`;
  }
  function varmala(cx, cy, R, th, seed) {
    const r = rng(seed);
    const n = Math.max(14, Math.round((TAU * R) / (R * 0.2)));
    const fr = (TAU * R) / n * 0.62;
    let leaves = '', flowers = '', buds = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const la = a + Math.PI / n;
      leaves += `<path transform="translate(${f(cx + Math.cos(la) * R * 1.04)} ${f(cy + Math.sin(la) * R * 1.04)}) rotate(${f((la * 180) / Math.PI + 90)})" d="${leaf(fr * 1.5, fr * 0.36, 0.1)}" fill="${i % 2 ? '#2F6B3A' : '#3F8A48'}"/>`;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      if (i % 3 === 2) flowers += rose(x, y, fr * 0.78, th.accent);
      else flowers += marigold(x, y, fr * (0.86 + r() * 0.1), i % 3 ? ORANGE : MARIGOLD);
    }
    // a string of jasmine buds just inside
    const nb = Math.round(n * 3.2);
    for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU; buds += `<ellipse cx="${f(cx + Math.cos(a) * (R - fr * 1.1))}" cy="${f(cy + Math.sin(a) * (R - fr * 1.1))}" rx="${f(fr * 0.16)}" ry="${f(fr * 0.24)}" transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(cx + Math.cos(a) * (R - fr * 1.1))} ${f(cy + Math.sin(a) * (R - fr * 1.1))})" fill="#FBF7F1"/>`; }
    return leaves + buds + flowers;
  }
  CT.register('garland-ring', {
    name: 'Varmala ring',
    occasions: ['engagement', 'haldi', 'mehendi', 'anniversary', 'baby-shower'],
    description: 'A round photo inside a varmala of marigolds, roses and mango leaves',
    slots: 1,
    motif: (c) => `<circle cx="30" cy="30" r="15" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="4 3"/>${marigold(30, 15, 5, c)}${marigold(30, 45, 5, c)}`,
    cover(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk);
      let cx, cy, R;
      if (isWide(W, H)) { cx = W * 0.3; cy = H / 2; R = H * 0.3; } else { cx = W / 2; cy = H * 0.34; R = Math.min(H * 0.22, W * 0.3); }
      s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 1.3)}" fill="#000" opacity=".12"/>`;
      s += photoSlot(id, 0, cx - R * 0.9, cy - R * 0.9, R * 1.8, R * 1.8, photos[0], { shape: 'circle', stroke: `url(#${id}foil)`, sw: 4 });
      s += varmala(cx, cy, R * 1.04, th, 4);
      if (isWide(W, H)) s += stack(d, W * 0.72, H * 0.5, W * 0.44, H * 0.13, { amp: th.accent }).svg;
      else {
        s += pairLine(d, W / 2, H * 0.77, W * 0.86, H * 0.1, { amp: th.accent }).svg;
        s += lineSvg(placeLine(d), W / 2, H * 0.845, { gap: 42 });
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const R = H * 0.14, cy = H * 0.32;
      s += varmala(W / 2, cy, R, th, 9);
      s += t(W / 2, cy + R * 0.2, initials(d), { size: fit(initials(d), R * 1.2, R * 0.6) });
      return s + studioBlock(d, W / 2, H * 0.62);
    },
  });

  /* ---- filmstrip: four frames on a strip of 35mm film ---- */
  function film(id, cx, cy, W, fw, fh, rot, photos, count, n0 = 0) {
    const band = Math.max(30, fh * 0.2), sh = fh + band * 2, g = fw * 0.08;
    const total = count * fw + (count - 1) * g;
    const x0 = cx - total / 2, len = Math.max(W * 1.4, total + 200);
    let s = `<g transform="rotate(${rot} ${f(cx)} ${f(cy)})">`;
    s += `<rect x="${f(cx - len / 2)}" y="${f(cy - sh / 2 + 12)}" width="${f(len)}" height="${f(sh)}" fill="#000" opacity=".3" filter="url(#${id}fs)"/>`;
    s += `<rect x="${f(cx - len / 2)}" y="${f(cy - sh / 2)}" width="${f(len)}" height="${f(sh)}" fill="#24201B"/>`;
    // sprocket holes
    const hw = band * 0.34, hh = band * 0.44, step = hw * 2.2;
    for (let x = cx - len / 2 + step / 2; x < cx + len / 2; x += step) {
      s += `<rect x="${f(x)}" y="${f(cy - sh / 2 + (band - hh) / 2)}" width="${f(hw)}" height="${f(hh)}" rx="${f(hw * 0.25)}" fill="#E9E2D3" opacity=".88"/>`;
      s += `<rect x="${f(x)}" y="${f(cy + sh / 2 - band + (band - hh) / 2)}" width="${f(hw)}" height="${f(hh)}" rx="${f(hw * 0.25)}" fill="#E9E2D3" opacity=".88"/>`;
    }
    for (let i = 0; i < count; i++) {
      const x = x0 + i * (fw + g);
      s += photoSlot(id, n0 + i, x, cy - fh / 2, fw, fh, photos[i], { stroke: '#000', sw: 1, radius: 4 });
      // amber edge marks
      s += `<path d="M${f(x + fw * 0.1)} ${f(cy + sh / 2 - 6)} l10 -6 v12z" fill="#E8A33D" opacity=".85"/><rect x="${f(x + fw * 0.1 + 18)}" y="${f(cy + sh / 2 - 8)}" width="${f(fw * 0.18)}" height="4" fill="#E8A33D" opacity=".6"/>`;
    }
    return s + '</g>';
  }
  const filmDefs = (id, th) => `<defs><filter id="${id}fs" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
    <radialGradient id="${id}leak" cx="1" cy="0" r="1"><stop offset="0" stop-color="${mix(th.accent, '#FFD27A', 0.4)}" stop-opacity=".45"/><stop offset=".6" stop-color="${th.accent}" stop-opacity="0"/></radialGradient></defs>`;
  CT.register('filmstrip', {
    name: 'Filmstrip',
    occasions: ['pre-wedding', 'sangeet', 'birthday', 'other'],
    description: 'Four photos on a strip of 35mm film running across the cover',
    slots: 4,
    motif: (c) => `<g fill="${c}"><rect x="10" y="8" width="40" height="44" fill="none" stroke="${c}" stroke-width="2"/><rect x="13" y="11" width="4" height="5"/><rect x="13" y="44" width="4" height="5"/><rect x="43" y="11" width="4" height="5"/><rect x="43" y="44" width="4" height="5"/></g>`,
    cover(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk) + filmDefs(id, th) + `<rect width="${W}" height="${H}" fill="url(#${id}leak)"/>`;
      const fw = (Math.min(W, H * 1.5) * 0.9) / 4.24, fh = fw * 0.72;
      s += film(id, W / 2, H * 0.38, W, fw, fh, -4, photos, 4);
      s += pairLine(d, W / 2, H * 0.79, W * 0.86, H * 0.11, { amp: th.accent }).svg;
      s += lineSvg([placeLine(d).join(', ')], W / 2, H * 0.79 + 70, { size: 32 });
      return s;
    },
    back(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk) + filmDefs(id, th) + `<rect width="${W}" height="${H}" fill="url(#${id}leak)"/>`;
      const fw = H * 0.2;
      s += film(id, W / 2, H * 0.22, W, fw, fw * 0.72, 3, photos.slice(2), 2);
      s += t(W / 2, H * 0.52, initials(d), { size: fit(initials(d), W * 0.4, H * 0.08) });
      return s + studioBlock(d, W / 2, H * 0.65);
    },
  });

  /* ---- torn-paper: a photo with handmade paper torn across it ---- */
  function tornEdge(len, seed, amp = 7) {
    const r = rng(seed), pts = [];
    let wob = 0;
    for (let v = -10; v <= len + 10; v += 7) { wob += (r() - 0.5) * 3; wob *= 0.9; pts.push([v, wob * 2 + (r() - 0.5) * amp + Math.sin(v / 90) * 6]); }
    return pts;
  }
  function paperFibres(x, y, w, h, seed) {
    const r = rng(seed);
    let s = `<g stroke="#8C7B63" stroke-width="1" opacity=".18" fill="none">`;
    for (let i = 0; i < (w * h) / 2600; i++) { const px = x + r() * w, py = y + r() * h, a = r() * TAU, l = 6 + r() * 14; s += `<path d="M${f(px)} ${f(py)} q${f(Math.cos(a) * l * 0.5 + 3)} ${f(Math.sin(a) * l * 0.5 - 3)} ${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}"/>`; }
    return s + '</g>';
  }
  function tornPaper(W, H, d, th, id, photos, wide) {
    let s = `<rect width="${W}" height="${H}" fill="${th.silk}"/>`;
    s += `<defs><filter id="${id}ts" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter></defs>`;
    const ink = mix(th.silk, '#000', 0.15);
    let paper, rim;
    if (wide) {
      const ex = W * 0.6;
      s += photoSlot(id, 0, 0, 0, ex + 40, H, photos[0], { stroke: 'none', sw: 0 });
      const e = tornEdge(H, 7), e2 = tornEdge(H, 8, 9);
      paper = `M${W + 2} -2 L${e.map(([v, o]) => `${f(ex + o)} ${f(v)}`).join(' L')} L${W + 2} ${H + 2}Z`;
      rim = `M${W + 2} -2 L${e2.map(([v, o]) => `${f(ex - 9 + o)} ${f(v)}`).join(' L')} L${W + 2} ${H + 2}Z`;
      s += `<path d="${rim}" fill="#000" opacity=".35" filter="url(#${id}ts)" transform="translate(-6 0)"/>`;
      s += `<path d="${rim}" fill="#FFFDF8"/><path d="${paper}" fill="${PAPER}"/>`;
      s += `<g clip-path="url(#${id}pc)">${paperFibres(ex - 20, 0, W - ex + 20, H, 3)}</g><defs><clipPath id="${id}pc"><path d="${paper}"/></clipPath></defs>`;
      // a strip of washi tape holding the tear
      s += `<rect x="${f(ex - 70)}" y="${f(H * 0.06)}" width="150" height="42" transform="rotate(-24 ${f(ex)} ${f(H * 0.06 + 21)})" fill="${th.accent}" opacity=".7"/>`;
      const cx = (ex + W) / 2 + 10;
      s += stack(d, cx, H * 0.52, (W - ex) * 0.78, H * 0.12, { color: th.silk, amp: th.accent, lineColor: KOHL, opacity: 0.8 }).svg;
    } else {
      const ey = H * 0.58;
      s += photoSlot(id, 0, 0, 0, W, ey + 40, photos[0], { stroke: 'none', sw: 0 });
      const e = tornEdge(W, 7), e2 = tornEdge(W, 8, 9);
      paper = `M-2 ${H + 2} L${e.map(([v, o]) => `${f(v)} ${f(ey + o)}`).join(' L')} L${W + 2} ${H + 2}Z`;
      rim = `M-2 ${H + 2} L${e2.map(([v, o]) => `${f(v)} ${f(ey - 9 + o)}`).join(' L')} L${W + 2} ${H + 2}Z`;
      s += `<path d="${rim}" fill="#000" opacity=".35" filter="url(#${id}ts)" transform="translate(0 -6)"/>`;
      s += `<path d="${rim}" fill="#FFFDF8"/><path d="${paper}" fill="${PAPER}"/>`;
      s += `<g clip-path="url(#${id}pc)">${paperFibres(0, ey - 20, W, H - ey + 20, 3)}</g><defs><clipPath id="${id}pc"><path d="${paper}"/></clipPath></defs>`;
      s += `<rect x="${f(W * 0.08)}" y="${f(ey - 40)}" width="140" height="40" transform="rotate(-12 ${f(W * 0.08 + 70)} ${f(ey - 20)})" fill="${th.accent}" opacity=".7"/>`;
      s += pairLine(d, W / 2, H * 0.79, W * 0.84, H * 0.1, { color: th.silk, amp: th.accent }).svg;
      s += lineSvg(placeLine(d), W / 2, H * 0.86, { color: KOHL, opacity: 0.8, gap: 40 });
    }
    return s;
  }
  CT.register('torn-paper', {
    name: 'Torn paper',
    occasions: ['haldi', 'mehendi', 'birthday', 'pre-wedding', 'other'],
    description: 'A photo with a sheet of handmade paper torn across it, held by tape',
    slots: 1,
    motif: (c) => `<path d="M8 18 L16 15 L22 19 L30 14 L37 18 L44 15 L52 19 V46 H8Z" fill="none" stroke="${c}" stroke-width="1.8"/>`,
    cover(W, H, d, th, id, photos = []) { return tornPaper(W, H, d, th, id, photos, isWide(W, H)); },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      // a torn paper label carrying the studio's name
      const lw = Math.min(W * 0.7, 640), lh = H * 0.44, lx = (W - lw) / 2, ly = H * 0.38;
      const top = tornEdge(lw, 3), bot = tornEdge(lw, 4);
      const label = `M${top.map(([v, o]) => `${f(lx + v)} ${f(ly + o)}`).join(' L')} L${bot.slice().reverse().map(([v, o]) => `${f(lx + v)} ${f(ly + lh + o)}`).join(' L')}Z`;
      s += `<defs><filter id="${id}ts" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="8"/></filter></defs>`;
      s += `<path d="${label}" fill="#000" opacity=".35" filter="url(#${id}ts)" transform="translate(0 10)"/><path d="${label}" fill="${PAPER}"/>`;
      s += `<rect x="${f(W / 2 - 70)}" y="${f(ly - 22)}" width="140" height="40" transform="rotate(-4 ${f(W / 2)} ${f(ly)})" fill="${th.accent}" opacity=".7"/>`;
      s += t(W / 2, H * 0.24, initials(d), { size: fit(initials(d), W * 0.4, H * 0.1) });
      return s + studioBlock(d, W / 2, ly + lh * 0.3, th.silk);
    },
  });

  /* ---- jharokha-trio: three arched windows in a row ---- */
  function trio(id, W, H, photos, top, bottom, aw, mid) {
    const g = aw * 0.16, total = aw * 2 + mid + g * 2, x0 = (W - total) / 2;
    const xs = [x0, x0 + aw + g, x0 + aw + g + mid + g], ws = [aw, mid, aw];
    let s = '';
    // cornice and plinth that tie the windows together
    s += `<rect x="${f(x0 - 40)}" y="${f(bottom)}" width="${f(total + 80)}" height="12" fill="url(#${id}foil)"/><rect x="${f(x0 - 26)}" y="${f(bottom + 18)}" width="${f(total + 52)}" height="4" fill="${MARIGOLD}" opacity=".7"/>`;
    xs.forEach((x, i) => {
      const w = ws[i], y = i === 1 ? top : top + (mid - aw) * 0.6 + aw * 0.22, h = bottom - y;
      s += `<path d="${CT.helpers.cuspedArch(x + w / 2, y - w * 0.16, w * 1.2, bottom, 9, 0.3)}" fill="#000" opacity=".22"/>`;
      s += `<path d="${CT.helpers.cuspedArch(x + w / 2, y - w * 0.16, w * 1.2, bottom, 9, 0.3)}" fill="none" stroke="${MARIGOLD}" stroke-width="1.5" opacity=".8"/>`;
      s += photoSlot(id, i, x, y, w, h, photos[i], { shape: 'arch', stroke: `url(#${id}foil)`, sw: 4 });
      s += `<g transform="translate(${f(x + w / 2)} ${f(y - w * 0.18)})"><path d="${petal(w * 0.16, w * 0.05)}" fill="url(#${id}foil)"/></g>`;
    });
    return s;
  }
  CT.register('jharokha-trio', {
    name: 'Three windows',
    occasions: ['wedding', 'reception', 'sangeet'],
    description: 'Three photos in carved arched windows, like a palace facade',
    slots: 3,
    motif: (c) => `<g fill="none" stroke="${c}" stroke-width="1.8"><path d="${archD(8, 20, 12, 30)}"/><path d="${archD(24, 12, 12, 38)}"/><path d="${archD(40, 20, 12, 30)}"/></g>`,
    cover(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk);
      const n = Math.ceil(W / (H * 0.22)) + 1;
      for (let i = 0; i < n; i++) s += `<path d="${CT.helpers.cuspedArch(i * H * 0.22, H * 0.66, H * 0.18, H, 7, 0.25)}" fill="#fff" opacity=".03"/>`;
      const aw = Math.min(H * 0.25, W * 0.24), mid = aw * 1.14;
      s += trio(id, W, H, photos, H * 0.13, H * 0.66, aw, mid);
      s += pairLine(d, W / 2, H * 0.83, W * 0.84, H * 0.1, { amp: th.accent }).svg;
      s += lineSvg([placeLine(d).join(', ')], W / 2, H * 0.83 + 62, { size: 32 });
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const w = H * 0.24, top = H * 0.12, bottom = H * 0.48;
      s += `<path d="${CT.helpers.cuspedArch(W / 2, top, w, bottom, 9, 0.3)}" fill="#000" opacity=".22" stroke="url(#${id}foil)" stroke-width="3"/>`;
      s += `<rect x="${f(W / 2 - w * 0.7)}" y="${f(bottom)}" width="${f(w * 1.4)}" height="10" fill="url(#${id}foil)"/>`;
      s += t(W / 2, H * 0.4, initials(d), { size: fit(initials(d), w * 0.7, H * 0.08) });
      return s + studioBlock(d, W / 2, H * 0.64);
    },
  });

  /* ---- postage-stamp: the photo as a perforated stamp, franked with the date and place ---- */
  function stamp(id, x, y, w, h, rot, photo, d, th) {
    const hr = Math.max(7, w * 0.022), step = hr * 2.6;
    let holes = '';
    for (let xx = x; xx <= x + w + 0.1; xx += (w) / Math.round(w / step)) holes += `<circle cx="${f(xx)}" cy="${f(y)}" r="${f(hr)}"/><circle cx="${f(xx)}" cy="${f(y + h)}" r="${f(hr)}"/>`;
    for (let yy = y; yy <= y + h + 0.1; yy += (h) / Math.round(h / step)) holes += `<circle cx="${f(x)}" cy="${f(yy)}" r="${f(hr)}"/><circle cx="${f(x + w)}" cy="${f(yy)}" r="${f(hr)}"/>`;
    const m = w * 0.07, ph = h - m - h * 0.17;
    let s = `<defs><mask id="${id}perf"><rect x="${f(x - 20)}" y="${f(y - 20)}" width="${f(w + 40)}" height="${f(h + 40)}" fill="#fff"/><g fill="#000">${holes}</g></mask>
      <filter id="${id}ss" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter></defs>`;
    s += `<g transform="rotate(${rot} ${f(x + w / 2)} ${f(y + h / 2)})">`;
    s += `<rect x="${f(x + 6)}" y="${f(y + 14)}" width="${f(w)}" height="${f(h)}" fill="#000" opacity=".35" filter="url(#${id}ss)"/>`;
    s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#FBF8F1" mask="url(#${id}perf)"/>`;
    s += photoSlot(id, 0, x + m, y + m, w - 2 * m, ph, photo, { stroke: th.silk, sw: 1.5 });
    const by = y + m + ph + (h - m - ph) * 0.62;
    if (d.place) s += t(x + m, by, d.place, { size: fit(d.place, w * 0.55, 36), color: th.silk, anchor: 'start' });
    const yr = (d.date.match(/\d{4}$/) || [''])[0];
    if (yr) s += t(x + w - m, by, yr, { size: 36, color: th.accent, anchor: 'end' });
    return s + '</g>';
  }
  function postmark(id, cx, cy, R, d, ink, waves = true, backing = '') {
    // a soft disc behind the mark keeps the date readable where it overlaps the photo
    let s = backing ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 1.04)}" fill="${backing}" opacity=".82"/>` : '';
    s += `<g fill="none" stroke="${ink}" opacity=".85"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" stroke-width="3"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.9)}" stroke-width="1.5"/>`;
    if (waves) for (let i = 0; i < 5; i++) {
      let p = `M${f(cx + R * 1.1)} ${f(cy - R * 0.55 + i * R * 0.28)}`;
      for (let k = 0; k < 4; k++) p += ` q${f(R * 0.25)} ${f(-R * 0.12)} ${f(R * 0.5)} 0 t${f(R * 0.5)} 0`;
      s += `<path d="${p}" stroke-width="3"/>`;
    }
    s += '</g>';
    const parts = (d.date || '').match(/^(.*)\s(\d{4})$/);
    const top = parts ? parts[1] : d.date, yr = parts ? parts[2] : '';
    s += `<defs><path id="${id}pm" d="M${f(cx - R * 0.72)} ${f(cy)} A${f(R * 0.72)} ${f(R * 0.72)} 0 0 1 ${f(cx + R * 0.72)} ${f(cy)}"/></defs>`;
    if (d.place) s += `<text font-family="${UI}" font-size="30" fill="${ink}" opacity=".9" text-anchor="middle"><textPath href="#${id}pm" startOffset="50%">${esc(d.place)}</textPath></text>`;
    if (top) s += t(cx, cy + R * 0.2, top, { size: Math.max(30, fit(top, R * 1.6, 32)), color: ink, family: UI, opacity: 0.9 });
    if (yr) s += t(cx, cy + R * 0.5, yr, { size: 30, color: ink, family: UI, opacity: 0.9 });
    return s;
  }
  CT.register('postage-stamp', {
    name: 'Postage stamp',
    occasions: ['pre-wedding', 'engagement', 'anniversary', 'other'],
    description: 'The photo as a perforated stamp, franked with the place and date',
    slots: 1,
    motif: (c) => `<rect x="14" y="12" width="32" height="38" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="3 3"/><circle cx="44" cy="16" r="9" fill="none" stroke="${c}" stroke-width="1.4"/>`,
    cover(W, H, d, th, id, photos = []) {
      let s = silkBg(id, W, H, th.silk);
      const ink = mix(th.accent, '#fff', 0.15);
      if (isWide(W, H)) {
        const w = H * 0.52, h = H * 0.68, x = W * 0.1, y = H * 0.15;
        s += stamp(id, x, y, w, h, -3, photos[0], d, th);
        s += postmark(id, x + w * 1.1, y + h * 0.02, H * 0.12, d, ink, false, th.silk);
        s += stack(d, W * 0.72, H * 0.52, W * 0.42, H * 0.13, { amp: th.accent, lines: [] }).svg;
      } else {
        const w = Math.min(H * 0.4, W * 0.52), h = w * 1.28, x = (W - w) / 2, y = H * 0.07;
        s += stamp(id, x, y, w, h, -3, photos[0], d, th);
        const pr = Math.min(H * 0.12, W * 0.15);   // keep the whole mark inside the page
        s += postmark(id, Math.min(x + w * 1.08, W - pr * 1.15), Math.max(y + h * 0.05, pr * 1.2), pr, d, ink, false, th.silk);
        s += pairLine(d, W / 2, H * 0.84, W * 0.86, H * 0.11, { amp: th.accent }).svg;
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const ink = mix(th.accent, '#fff', 0.15);
      s += postmark(id, W / 2 - H * 0.12, H * 0.3, H * 0.13, d, ink, true);
      return s + studioBlock(d, W / 2, H * 0.6);
    },
  });

  /* ======================================================================
     ILLUSTRATED DESIGNS
     ====================================================================== */

  /* ---- confetti (birthday): a burst of paper confetti and curling streamers ---- */
  function confetti(W, H, seed, count, th, id, avoid) {
    const r = rng(seed);
    const pal = [th.accent, MARIGOLD, '#F6F0E4', mix(th.accent, '#fff', 0.45), ORANGE, `url(#${id}foil)`];
    let s = '';
    // curling streamers from the top edge
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.3 + r() * 0.4) * (W / 5), len = H * (0.18 + r() * 0.2), c = pal[i % 4];
      let p = `M${f(x)} -10`, y = -10, dir = r() > 0.5 ? 1 : -1;
      while (y < len) { p += ` q${f(dir * 26)} 18 0 36`; y += 36; dir = -dir; }
      s += `<path d="${p}" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" opacity=".9"/>`;
    }
    for (let i = 0, made = 0; i < count * 4 && made < count; i++) {
      const x = r() * W, y = Math.pow(r(), 1.35) * H;
      if (avoid && ((x - avoid.cx) / avoid.rx) ** 2 + ((y - avoid.cy) / avoid.ry) ** 2 < 1) continue;
      made++;
      const c = pal[Math.floor(r() * pal.length)], rot = r() * 360, k = r(), sz = 0.7 + r() * 0.8;
      const tr = `transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(sz)})"`;
      if (k < 0.42) s += `<rect ${tr} x="-5" y="-11" width="10" height="22" rx="1" fill="${c}"/>`;
      else if (k < 0.62) s += `<circle ${tr} r="6" fill="${c}"/>`;
      else if (k < 0.78) s += `<path ${tr} d="M0 -8 L8 6 L-8 6Z" fill="${c}"/>`;
      else if (k < 0.92) s += `<path ${tr} d="M-14 0 q3.5 -7 7 0 t7 0 t7 0 t7 0" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>`;
      else s += `<path ${tr} d="${star(0, 0, 9, 4)}" fill="${c}"/>`;
    }
    return s;
  }
  CT.register('confetti', {
    name: 'Confetti',
    occasions: ['birthday', 'sangeet', 'reception', 'other'],
    description: 'A shower of paper confetti and curling streamers around the name',
    slots: 0,
    motif: (c) => `<g fill="${c}"><rect x="12" y="10" width="6" height="13" transform="rotate(25 15 16)"/><circle cx="42" cy="18" r="4"/><path d="M26 40 L33 52 L19 52Z"/><path d="M40 40 q3 -5 6 0 t6 0" fill="none" stroke="${c}" stroke-width="2"/></g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const cy = H * 0.57;
      s += confetti(W, H, 12, Math.round(W / 7), th, id, { cx: W / 2, cy, rx: Math.min(W * 0.4, H * 0.5), ry: H * 0.27 });
      return s + stack(d, W / 2, cy, Math.min(W * 0.72, H * 0.9), H * 0.16, { amp: th.accent }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += confetti(W, H * 0.6, 19, Math.round(W / 16), th, id, { cx: W / 2, cy: H * 0.45, rx: W * 0.25, ry: H * 0.12 });
      s += t(W / 2, H * 0.47, initials(d), { size: fit(initials(d), W * 0.4, H * 0.1) });
      return s + studioBlock(d, W / 2, H * 0.64);
    },
  });

  /* ---- kalash (wedding): a brass kalash with mango leaves and coconut, two diyas ---- */
  function kalashDefs(id) {
    return `<defs><linearGradient id="${id}brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A4A0C"/><stop offset=".3" stop-color="#E9B44C"/><stop offset=".42" stop-color="#FFE7A3"/><stop offset=".6" stop-color="#D49A2E"/><stop offset="1" stop-color="#6B3F08"/></linearGradient>
      <linearGradient id="${id}mango" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1F5A2B"/><stop offset="1" stop-color="#5FA055"/></linearGradient>
      <radialGradient id="${id}flame" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".75"/><stop offset=".4" stop-color="#FFB347" stop-opacity=".25"/><stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient></defs>`;
  }
  function kalash(cx, by, S, th, id) {
    const k = (x, y) => `${f(cx + x * S)} ${f(by + y * S)}`;
    let s = `<ellipse cx="${f(cx)}" cy="${f(by + 4)}" rx="${f(S * 0.42)}" ry="${f(S * 0.05)}" fill="#000" opacity=".3"/>`;
    // mango leaves fanning out of the mouth
    [-62, -38, -14, 14, 38, 62].forEach((a, i) => {
      s += `<g transform="translate(${k(0, -0.95)}) rotate(${a})"><path d="${leaf(S * (0.5 - Math.abs(a) / 600), S * 0.09, a > 0 ? 0.12 : -0.12)}" fill="url(#${id}mango)"/><path d="M0 0 V${f(-S * 0.42)}" stroke="#A8D08D" stroke-width="1.4" opacity=".7"/></g>`;
    });
    // coconut
    s += `<ellipse cx="${f(cx)}" cy="${f(by - S * 1.12)}" rx="${f(S * 0.17)}" ry="${f(S * 0.22)}" fill="#6B4423"/>`;
    s += `<path d="M${k(-0.12, -1.25)} Q${k(0, -1.0)} ${k(0.12, -1.25)} M${k(-0.15, -1.15)} Q${k(0, -0.95)} ${k(0.15, -1.15)}" fill="none" stroke="#3E2612" stroke-width="2" opacity=".6"/>`;
    s += `<path d="M${k(-0.02, -1.33)} q${f(-S * 0.04)} ${f(-S * 0.06)} ${f(-S * 0.02)} ${f(-S * 0.1)} M${k(0.02, -1.33)} q${f(S * 0.04)} ${f(-S * 0.06)} ${f(S * 0.03)} ${f(-S * 0.09)}" fill="none" stroke="#8B5A2B" stroke-width="3" stroke-linecap="round"/>`;
    s += `<path d="M${k(-0.17, -1.06)} Q${k(0, -1.0)} ${k(0.17, -1.06)}" fill="none" stroke="#C8102E" stroke-width="${f(S * 0.025)}"/>`;
    // the pot
    const pot = `M${k(-0.22, 0)} L${k(0.22, 0)} L${k(0.17, -0.07)} C${k(0.66, -0.14)} ${k(0.66, -0.7)} ${k(0.2, -0.8)} L${k(0.17, -0.87)} C${k(0.26, -0.89)} ${k(0.35, -0.9)} ${k(0.33, -0.96)} L${k(-0.33, -0.96)} C${k(-0.35, -0.9)} ${k(-0.26, -0.89)} ${k(-0.17, -0.87)} L${k(-0.2, -0.8)} C${k(-0.66, -0.7)} ${k(-0.66, -0.14)} ${k(-0.17, -0.07)} Z`;
    s += `<path d="${pot}" fill="url(#${id}brass)"/>`;
    // red mauli thread at the neck and a band of kumkum dots on the belly
    for (let i = 0; i < 3; i++) s += `<path d="M${k(-0.2, -0.79 - i * 0.025)} Q${k(0, -0.76 - i * 0.025)} ${k(0.2, -0.79 - i * 0.025)}" fill="none" stroke="${i === 1 ? MARIGOLD : '#C8102E'}" stroke-width="${f(S * 0.012)}"/>`;
    s += `<path d="M${k(-0.5, -0.42)} Q${k(0, -0.33)} ${k(0.5, -0.42)}" fill="none" stroke="#7A4A0C" stroke-width="2" opacity=".6"/>`;
    s += `<path d="M${k(-0.5, -0.48)} Q${k(0, -0.39)} ${k(0.5, -0.48)}" fill="none" stroke="#7A4A0C" stroke-width="2" opacity=".6"/>`;
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.13, y = -0.445 + 0.09 * (1 - (x / 0.5) ** 2) * 0.9;
      s += `<circle cx="${f(cx + x * S)}" cy="${f(by + y * S)}" r="${f(S * 0.016)}" fill="#C8102E"/>`;
    }
    s += `<path transform="translate(${k(0, -0.62)})" d="${petal(S * 0.1, S * 0.05)}" fill="#C8102E" opacity=".85"/><circle cx="${f(cx)}" cy="${f(by - 0.6 * S)}" r="${f(S * 0.018)}" fill="${MARIGOLD}"/>`;
    return s;
  }
  function diya(x, y, s, id) {
    return `<circle cx="${f(x)}" cy="${f(y - s * 0.9)}" r="${f(s * 2.2)}" fill="url(#${id}flame)"/>` +
      `<path d="M${f(x - s)} ${f(y - s * 0.3)} Q${f(x)} ${f(y + s * 0.6)} ${f(x + s * 1.25)} ${f(y - s * 0.45)} L${f(x + s * 0.75)} ${f(y - s * 0.3)} Z" fill="url(#${id}brass)"/>` +
      `<path d="M${f(x - s)} ${f(y - s * 0.3)} Q${f(x)} ${f(y + s * 0.6)} ${f(x + s * 1.25)} ${f(y - s * 0.45)} Q${f(x)} ${f(y - s * 0.1)} ${f(x - s)} ${f(y - s * 0.3)}Z" fill="#8C4A12"/>` +
      `<path transform="translate(${f(x + s * 0.55)} ${f(y - s * 0.4)})" d="${petal(s * 0.9, s * 0.25)}" fill="#FFD36B"/><path transform="translate(${f(x + s * 0.55)} ${f(y - s * 0.42)})" d="${petal(s * 0.45, s * 0.12)}" fill="#fff" opacity=".8"/>`;
  }
  CT.register('kalash', {
    name: 'Kalash',
    occasions: ['wedding', 'haldi', 'other'],
    description: 'A brass kalash crowned with mango leaves and coconut, two diyas lit beside it',
    slots: 0,
    motif: (c) => `<path d="M22 50 H38 L35 46 C50 44 50 28 37 24 L36 21 H24 L23 24 C10 28 10 44 25 46Z" fill="${c}"/><path d="M30 20 L22 8 M30 20 L30 6 M30 20 L38 8" stroke="${c}" stroke-width="2"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + kalashDefs(id);
      if (isWide(W, H)) {
        const cx = W * 0.3, by = H * 0.84, S = H * 0.46;
        s += `<circle cx="${f(cx)}" cy="${f(by - S * 0.75)}" r="${f(S * 1.05)}" fill="url(#${id}flame)" opacity=".5"/>`;
        s += kalash(cx, by, S, th, id) + diya(cx - S * 0.68, by, S * 0.09, id) + diya(cx + S * 0.6, by, S * 0.09, id);
        s += stack(d, W * 0.7, H * 0.5, W * 0.46, H * 0.13, { amp: th.accent }).svg;
      } else {
        const cx = W / 2, by = H * 0.56, S = H * 0.33;
        s += `<circle cx="${f(cx)}" cy="${f(by - S * 0.75)}" r="${f(S * 1.05)}" fill="url(#${id}flame)" opacity=".5"/>`;
        s += kalash(cx, by, S, th, id) + diya(cx - S * 0.8, by, S * 0.1, id) + diya(cx + S * 0.7, by, S * 0.1, id);
        s += stack(d, W / 2, H * 0.78, W * 0.84, H * 0.085, { amp: th.accent }).svg;
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + kalashDefs(id);
      s += kalash(W / 2, H * 0.46, H * 0.25, th, id);
      s += zariLine(W, H * 0.53, id);
      return s + studioBlock(d, W / 2, H * 0.66);
    },
  });
  const zariLine = (W, y, id) => `<rect x="${f(W / 2 - 120)}" y="${f(y)}" width="240" height="3" fill="${MARIGOLD}"/>`;

  /* ---- peacock (sangeet, wedding): a fan of peacock feathers ---- */
  function feather(x, y, len, ang, seed) {
    const r = rng(seed);
    const a = (ang * Math.PI) / 180, bend = len * 0.06;
    let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang + 90)})">`;
    // in local space the shaft runs from (0,0) up to (0,-len)
    const bx = (t) => bend * Math.sin(t * Math.PI);
    let barbs = '';
    const N = 70;
    for (let i = 8; i < N; i++) {
      const tt = i / N, sy = -tt * len, sx = bx(tt);
      const eyeT = 0.82, w = len * 0.13 * Math.sin(Math.min(1, tt / eyeT) * Math.PI * 0.5) * (tt > eyeT ? Math.max(0.3, 1 - (tt - eyeT) / (1 - eyeT) * 0.8) : 1);
      [-1, 1].forEach((side) => {
        const ex = sx + side * w * (0.85 + r() * 0.3), ey = sy - w * 0.9;
        barbs += `M${f(sx)} ${f(sy)} Q${f(sx + side * w * 0.5)} ${f(sy - w * 0.2)} ${f(ex)} ${f(ey)}`;
      });
    }
    s += `<path d="${barbs}" fill="none" stroke="#8DB86B" stroke-width="1" opacity=".55"/>`;
    s += `<path d="M0 0 Q${f(bend * 2)} ${f(-len * 0.5)} 0 ${f(-len * 0.98)}" fill="none" stroke="#D8C38A" stroke-width="2"/>`;
    const ey = -len * 0.84, ex = bx(0.84);
    s += `<g transform="translate(${f(ex)} ${f(ey)})">` +
      `<ellipse rx="${f(len * 0.085)}" ry="${f(len * 0.11)}" fill="#C9A227"/>` +
      `<ellipse cy="${f(len * 0.008)}" rx="${f(len * 0.066)}" ry="${f(len * 0.086)}" fill="#2E8B57"/>` +
      `<ellipse cy="${f(len * 0.016)}" rx="${f(len * 0.05)}" ry="${f(len * 0.064)}" fill="#1B9AAA"/>` +
      `<path d="M0 ${f(-len * 0.03)} C${f(len * 0.045)} ${f(-len * 0.03)} ${f(len * 0.04)} ${f(len * 0.05)} 0 ${f(len * 0.06)} C${f(-len * 0.04)} ${f(len * 0.05)} ${f(-len * 0.045)} ${f(-len * 0.03)} 0 ${f(-len * 0.03)}Z" fill="#0B2A6F"/>` +
      `<ellipse cx="${f(-len * 0.01)}" cy="${f(len * 0.004)}" rx="${f(len * 0.012)}" ry="${f(len * 0.02)}" fill="#3FA7D6" opacity=".7"/></g>`;
    return s + '</g>';
  }
  function fan(ox, oy, base, from, to, count, seed, scale) {
    let s = '';
    for (let i = 0; i < count; i++) {
      const k = i / (count - 1), ang = from + (to - from) * k;
      const len = base * (0.78 + 0.22 * Math.sin(k * Math.PI)) * scale;
      s += feather(ox, oy, len, ang, seed + i);
    }
    return s;
  }
  CT.register('peacock', {
    name: 'Peacock feathers',
    occasions: ['sangeet', 'wedding', 'mehendi'],
    description: 'A fan of peacock feathers sweeping in from the corner',
    slots: 0,
    motif: (c) => `<g transform="translate(30 56)"><path d="M0 0 V-46" stroke="${c}" stroke-width="1.4"/><ellipse cy="-38" rx="7" ry="10" fill="none" stroke="${c}" stroke-width="1.6"/><ellipse cy="-36" rx="3" ry="4.5" fill="${c}"/></g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      const wide = isWide(W, H);
      s += fan(W + 30, H + 40, H * (wide ? 0.92 : 0.78), -178, -92, 9, 40, 1);
      s += stack(d, W * 0.08, wide ? H * 0.36 : H * 0.3, wide ? W * 0.5 : W * 0.6, H * 0.13, { anchor: 'start', amp: th.accent }).svg;
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += feather(W / 2 - H * 0.2, H * 0.52, H * 0.42, -60, 3);
      s += t(W / 2, H * 0.6, initials(d), { size: fit(initials(d), W * 0.4, H * 0.08) });
      return s + studioBlock(d, W / 2, H * 0.72);
    },
  });

  /* ---- deco-sunburst (reception): art deco rays, stepped panel, corner fans ---- */
  function stepped(x, y, w, h, st) {
    // a panel whose top steps in three times, ziggurat style
    const s = st;
    return `M${f(x)} ${f(y + h)} V${f(y + 3 * s)} H${f(x + s)} V${f(y + 2 * s)} H${f(x + 2 * s)} V${f(y + s)} H${f(x + 3 * s)} V${f(y)} H${f(x + w - 3 * s)} V${f(y + s)} H${f(x + w - 2 * s)} V${f(y + 2 * s)} H${f(x + w - s)} V${f(y + 3 * s)} H${f(x + w)} V${f(y + h)} Z`;
  }
  function sunburst(cx, cy, R, n, id, op) {
    let s = `<g fill="url(#${id}foil)" opacity="${op}">`;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 0.5) / n) * Math.PI;
      s += `<path d="M${f(cx)} ${f(cy)} L${f(cx + Math.cos(a0) * R)} ${f(cy + Math.sin(a0) * R)} L${f(cx + Math.cos(a1) * R)} ${f(cy + Math.sin(a1) * R)}Z"/>`;
    }
    return s + '</g>';
  }
  function decoFan(x, y, R, rot, c) {
    let s = `<g transform="translate(${f(x)} ${f(y)}) rotate(${rot})" fill="none" stroke="${c}" stroke-width="1.6">`;
    for (let i = 1; i <= 3; i++) s += `<path d="M${f(R * i / 3)} 0 A${f(R * i / 3)} ${f(R * i / 3)} 0 0 1 0 ${f(R * i / 3)}"/>`;
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; s += `<path d="M${f(Math.cos(a) * R * 0.33)} ${f(Math.sin(a) * R * 0.33)} L${f(Math.cos(a) * R)} ${f(Math.sin(a) * R)}"/>`; }
    return s + '</g>';
  }
  CT.register('deco-sunburst', {
    name: 'Art deco sunburst',
    occasions: ['reception', 'anniversary', 'other'],
    description: 'Gilded art deco rays behind a stepped panel, fans in the corners',
    slots: 0,
    motif: (c) => decoFan(8, 8, 44, 0, c),
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += sunburst(W / 2, H * 1.02, Math.hypot(W, H), 44, id, 0.16);
      const m = 34;
      [[m, m, 0], [W - m, m, 90], [W - m, H - m, 180], [m, H - m, 270]].forEach(([x, y, r]) => { s += decoFan(x, y, H * 0.16, r, MARIGOLD); });
      const pw = Math.min(W * 0.5, H * 0.66), ph = H * 0.72, px = (W - pw) / 2, py = H * 0.14, st = 18;
      // speed lines either side of the panel
      for (let i = 0; i < 3; i++) {
        const y = H * 0.53 + (i - 1) * 14;
        if (px - H * 0.2 - 30 > 60) s += `<rect x="${f(H * 0.2)}" y="${f(y)}" width="${f(px - H * 0.2 - 30)}" height="2" fill="${MARIGOLD}" opacity=".7"/><rect x="${f(px + pw + 30)}" y="${f(y)}" width="${f(W - H * 0.2 - px - pw - 30)}" height="2" fill="${MARIGOLD}" opacity=".7"/>`;
      }
      s += `<path d="${stepped(px, py, pw, ph, st)}" fill="${th.silk}"/><path d="${stepped(px, py, pw, ph, st)}" fill="#000" opacity=".18"/>`;
      s += `<path d="${stepped(px, py, pw, ph, st)}" fill="none" stroke="url(#${id}foil)" stroke-width="4"/>`;
      s += `<path d="${stepped(px + 14, py + 14, pw - 28, ph - 28, st)}" fill="none" stroke="${MARIGOLD}" stroke-width="1.2" opacity=".75"/>`;
      // a small half sun crowning the names
      s += `<g transform="translate(${f(W / 2)} ${f(py + H * 0.17)})">${sunburst(0, 0, H * 0.075, 14, id, 0.9)}<circle r="${f(H * 0.03)}" fill="url(#${id}foil)"/></g>`;
      s += `<rect x="${f(W / 2 - H * 0.09)}" y="${f(py + H * 0.17)}" width="${f(H * 0.18)}" height="3" fill="${MARIGOLD}"/>`;
      return s + stack(d, W / 2, py + ph * 0.62, pw * 0.8, H * 0.11, { amp: th.accent }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += sunburst(W / 2, H * 0.5, H * 0.36, 30, id, 0.18);
      s += `<circle cx="${f(W / 2)}" cy="${f(H * 0.42)}" r="${f(H * 0.1)}" fill="${th.silk}" stroke="url(#${id}foil)" stroke-width="3"/>`;
      s += t(W / 2, H * 0.42 + H * 0.025, initials(d), { size: fit(initials(d), H * 0.15, H * 0.07) });
      return s + studioBlock(d, W / 2, H * 0.66);
    },
  });

  /* ---- rangoli: a powder rangoli drawn at the threshold, diyas on its rim ---- */
  function rangoli(cx, cy, R, th, seed, id) {
    const r = rng(seed);
    const deep = mix(th.accent, '#7A1030', 0.45), light = mix(th.accent, '#fff', 0.45);
    let s = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="#000" opacity=".12"/>`;
    const ring = (n, r0, len, wid, fill, off = 0) => {
      let g = '';
      for (let i = 0; i < n; i++) g += `<path transform="translate(${f(cx)} ${f(cy)}) rotate(${f((i + off) * 360 / n)}) translate(0 ${f(-r0)})" d="${petal(len, wid)}" fill="${fill}"/>`;
      return g;
    };
    s += ring(32, R * 0.86, R * 0.13, R * 0.045, '#F6F0E4');
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.86)}" fill="${deep}"/>`;
    s += ring(24, R * 0.58, R * 0.28, R * 0.1, MARIGOLD);
    s += ring(24, R * 0.58, R * 0.2, R * 0.06, ORANGE);
    s += `<path d="${scallops(cx, cy, R * 0.6, 24)}" fill="${light}"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.6)}" fill="#2F7D4F"/>`;
    s += ring(12, R * 0.3, R * 0.28, R * 0.12, th.accent, 0.5);
    s += ring(12, R * 0.3, R * 0.18, R * 0.06, light, 0.5);
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.3)}" fill="${MARIGOLD}"/>`;
    s += ring(8, R * 0.04, R * 0.24, R * 0.08, deep);
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R * 0.07)}" fill="#F6F0E4"/>`;
    s += dotsRing(cx, cy, R * 0.92, 48, R * 0.012, '#F6F0E4');
    s += dotsRing(cx, cy, R * 0.83, 40, R * 0.01, MARIGOLD);
    // powder grain
    let g = '';
    for (let i = 0; i < 500; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * R * 0.98; g += `<circle cx="${f(cx + Math.cos(a) * rr)}" cy="${f(cy + Math.sin(a) * rr)}" r="${f(0.8 + r() * 1.4)}"/>`; }
    return s + `<g fill="#fff" opacity=".16">${g}</g>`;
  }
  CT.register('rangoli', {
    name: 'Rangoli',
    occasions: ['other', 'haldi', 'mehendi', 'sangeet'],
    description: 'A colour-powder rangoli at the threshold, diyas lit along its rim',
    slots: 0,
    motif: (c) => `<g fill="${c}">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path transform="translate(30 30) rotate(${i * 45}) translate(0 -4)" d="${petal(13, 4)}"/>`).join('')}</g>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + kalashDefs(id);
      const R = Math.min(H * 0.5, W * 0.46), cy = H + R * 0.12;
      s += rangoli(W / 2, cy, R, th, 5, id);
      [-58, -32, 0, 32, 58].forEach((a) => {
        const rad = ((a - 90) * Math.PI) / 180;
        s += diya(W / 2 + Math.cos(rad) * R * 1.07, cy + Math.sin(rad) * R * 1.07 + 10, H * 0.022, id);
      });
      return s + stack(d, W / 2, H * 0.28, Math.min(W * 0.84, H * 1.1), H * 0.1, { amp: th.accent, lines: [placeLine(d).join(', ')], first: 46 }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += rangoli(W / 2, H * 0.3, H * 0.19, th, 8, id);
      return s + studioBlock(d, W / 2, H * 0.64);
    },
  });

  /* ---- footprints (baby shower): tiny footprints walking under soft clouds ---- */
  function foot(x, y, s, rot, flip, c) {
    const sx = flip ? -1 : 1;
    const sole = `M0 ${f(s * 0.95)} C${f(s * 0.32)} ${f(s * 0.95)} ${f(s * 0.36)} ${f(s * 0.5)} ${f(s * 0.3)} ${f(s * 0.2)} C${f(s * 0.26)} ${f(-s * 0.05)} ${f(s * 0.42)} ${f(-s * 0.25)} ${f(s * 0.36)} ${f(-s * 0.45)} C${f(s * 0.28)} ${f(-s * 0.72)} ${f(-s * 0.3)} ${f(-s * 0.72)} ${f(-s * 0.36)} ${f(-s * 0.38)} C${f(-s * 0.4)} ${f(-s * 0.1)} ${f(-s * 0.25)} ${f(s * 0.2)} ${f(-s * 0.3)} ${f(s * 0.5)} C${f(-s * 0.34)} ${f(s * 0.8)} ${f(-s * 0.25)} ${f(s * 0.95)} 0 ${f(s * 0.95)}Z`;
    let g = `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${sx} 1)" fill="${c}"><path d="${sole}"/>`;
    [[0.3, -0.86, 0.13], [0.06, -0.95, 0.1], [-0.12, -0.93, 0.085], [-0.27, -0.85, 0.075], [-0.38, -0.72, 0.065]].forEach(([tx, ty, tr]) => { g += `<circle cx="${f(tx * s)}" cy="${f(ty * s)}" r="${f(tr * s)}"/>`; });
    return g + '</g>';
  }
  CT.register('footprints', {
    name: 'Little footprints',
    occasions: ['baby-shower', 'maternity', 'birthday'],
    description: 'Tiny footprints padding across the page under soft clouds',
    slots: 0,
    motif: (c) => foot(22, 32, 13, -10, false, c) + foot(40, 26, 13, 10, true, c),
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + starrySky(W, H * 0.6, 3, Math.round(W / 30));
      const cl = '#F6F0E4';
      [[0.1, 0.12, 1.4, 0.9], [0.86, 0.09, 1.1, 0.85], [0.68, 0.2, 0.7, 0.55], [0.24, 0.26, 0.6, 0.5]].forEach(([x, y, k, o]) => { s += `<g transform="translate(${f(W * x)} ${f(H * y)})" opacity="${o}"><path d="${cloud(H * 0.2 * k)}" fill="${cl}"/></g>`; });
      // a gentle wandering trail along the bottom
      const n = Math.max(6, Math.round(W / 190)), fs = H * 0.05;
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n, x = W * (0.06 + 0.88 * k), y = H * (0.86 - 0.05 * Math.sin(k * Math.PI * 1.6)) + (i % 2 ? -fs * 0.7 : fs * 0.7);
        s += foot(x, y, fs, 78 + Math.cos(k * Math.PI * 1.6) * 12, i % 2 === 0, th.accent).replace('<g ', `<g opacity="${f(0.45 + 0.55 * k)}" `);
      }
      return s + stack(d, W / 2, H * 0.48, Math.min(W * 0.8, H * 0.9), H * 0.11, { amp: th.accent }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += foot(W / 2 - H * 0.04, H * 0.3, H * 0.07, -8, false, th.accent) + foot(W / 2 + H * 0.04, H * 0.27, H * 0.07, 8, true, th.accent);
      s += t(W / 2, H * 0.5, initials(d), { size: fit(initials(d), W * 0.4, H * 0.075) });
      return s + studioBlock(d, W / 2, H * 0.64);
    },
  });

  /* ---- bloom-bump (maternity): a single gold line drawing of a mother-to-be, flowers opening at the bump ---- */
  const FRONT = [[0.47, 0], [0.53, 0.012], [0.566, 0.05], [0.575, 0.085], [0.6, 0.113], [0.582, 0.126], [0.589, 0.14], [0.58, 0.152], [0.576, 0.168], [0.548, 0.188], [0.538, 0.22], [0.552, 0.252], [0.585, 0.3], [0.603, 0.35], [0.577, 0.392], [0.6, 0.432], [0.662, 0.5], [0.69, 0.57], [0.672, 0.638], [0.624, 0.688], [0.602, 0.73], [0.61, 0.82], [0.6, 0.92]];
  const BACK = [[0.47, 0], [0.425, 0.018], [0.405, 0.062], [0.418, 0.11], [0.44, 0.155], [0.448, 0.2], [0.44, 0.27], [0.428, 0.36], [0.44, 0.45], [0.468, 0.54], [0.474, 0.62], [0.482, 0.72], [0.5, 0.82], [0.515, 0.92]];
  const ARM = [[0.5, 0.25], [0.478, 0.33], [0.482, 0.43], [0.53, 0.53], [0.6, 0.59], [0.655, 0.6]];
  function bloomFigure(x, y, S, th, id) {
    const P = (pts) => pts.map(([a, b]) => [x + (a - 0.5) * S, y + b * S]);
    let s = `<g fill="none" stroke="url(#${id}foil)" stroke-width="${f(Math.max(3, S * 0.005))}" stroke-linecap="round" stroke-linejoin="round">`;
    s += `<path d="${smooth(P(FRONT), false)}"/><path d="${smooth(P(BACK), false)}"/><path d="${smooth(P(ARM), false)}"/>`;
    s += `<circle cx="${f(x + (0.4 - 0.5) * S)}" cy="${f(y + 0.045 * S)}" r="${f(S * 0.03)}"/>`;
    s += '</g>';
    // blooms opening along the bump
    const fl = (a, b, rr, c) => {
      const cx = x + (a - 0.5) * S, cy = y + b * S;
      let g = '';
      for (let i = 0; i < 6; i++) g += `<path transform="translate(${f(cx)} ${f(cy)}) rotate(${i * 60 + 15})" d="${petal(rr, rr * 0.42)}" fill="${c}"/>`;
      return g + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rr * 0.22)}" fill="${MARIGOLD}"/>`;
    };
    const lf = (a, b, len, rot) => `<path transform="translate(${f(x + (a - 0.5) * S)} ${f(y + b * S)}) rotate(${rot})" d="${leaf(len * S, len * S * 0.22, 0.1)}" fill="${mix(th.silk, '#9BC48A', 0.55)}"/>`;
    s += lf(0.69, 0.56, 0.08, 60) + lf(0.68, 0.62, 0.07, 110) + lf(0.66, 0.5, 0.06, 20) + lf(0.64, 0.66, 0.06, 140);
    s += fl(0.705, 0.53, S * 0.03, th.accent) + fl(0.725, 0.6, S * 0.038, mix(th.accent, '#fff', 0.35)) + fl(0.69, 0.665, S * 0.026, th.accent);
    s += `<circle cx="${f(x + 0.23 * S)}" cy="${f(y + 0.49 * S)}" r="${f(S * 0.008)}" fill="${MARIGOLD}"/><circle cx="${f(x + 0.25 * S)}" cy="${f(y + 0.7 * S)}" r="${f(S * 0.006)}" fill="${MARIGOLD}"/>`;
    return s;
  }
  CT.register('bloom-bump', {
    name: 'In bloom',
    occasions: ['maternity', 'baby-shower'],
    description: 'A single gold line drawing of a mother-to-be, flowers opening at the bump',
    slots: 0,
    motif: (c) => `<path d="M24 6 C30 6 32 14 30 20 C36 26 40 34 36 42 C34 48 30 50 30 56" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="38" cy="34" r="3" fill="${c}"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      if (isWide(W, H)) {
        const S = H * 0.92;
        s += `<circle cx="${f(W * 0.3 + S * 0.15)}" cy="${f(H * 0.55)}" r="${f(H * 0.3)}" fill="${th.accent}" opacity=".08"/>`;
        s += bloomFigure(W * 0.3, H * 0.06, S, th, id);
        s += stack(d, W * 0.7, H * 0.5, W * 0.44, H * 0.13, { amp: th.accent }).svg;
      } else {
        const S = H * 0.9;
        s += `<circle cx="${f(W * 0.22 + S * 0.15)}" cy="${f(H * 0.55)}" r="${f(H * 0.26)}" fill="${th.accent}" opacity=".08"/>`;
        s += bloomFigure(W * 0.22, H * 0.06, S, th, id);
        s += stack(d, W * 0.7, H * 0.52, W * 0.5, H * 0.1, { amp: th.accent, lines: [d.date, d.place].filter(Boolean) }).svg;
      }
      return s;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk);
      s += bloomFigure(W / 2 - H * 0.06, H * 0.08, H * 0.42, th, id);
      s += t(W / 2, H * 0.6, initials(d), { size: fit(initials(d), W * 0.4, H * 0.07) });
      return s + studioBlock(d, W / 2, H * 0.71);
    },
  });

  /* ---- marigold-corners (haldi): heaped marigolds and mango leaves in two corners ---- */
  function genda(cx, cy, r, base, seed) {
    const rr = rng(seed);
    const dark = mix(base, '#8A3B00', 0.35), light = mix(base, '#FFE08A', 0.35);
    let s = `<g transform="translate(${f(cx)} ${f(cy)})">`;
    [[16, 0.72, 0.32, dark], [13, 0.5, 0.3, base], [9, 0.28, 0.26, light], [6, 0.1, 0.2, base]].forEach(([n, rad, pr, c]) => {
      const off = rr() * TAU;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU; s += `<circle cx="${f(Math.cos(a) * r * rad)}" cy="${f(Math.sin(a) * r * rad)}" r="${f(r * pr * (0.85 + rr() * 0.3))}" fill="${c}"/>`; }
    });
    return s + `<circle r="${f(r * 0.12)}" fill="${dark}"/></g>`;
  }
  function gendaHeap(ox, oy, sx, sy, scale, seed, th, id) {
    const r = rng(seed);
    let leaves = '', flowers = '';
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * 90 + (r() - 0.5) * 12, rad = (a * Math.PI) / 180, d0 = (190 + r() * 120) * scale;
      const x = ox + sx * Math.cos(rad) * d0, y = oy + sy * Math.sin(rad) * d0;
      const ang = (Math.atan2(sy * Math.sin(rad), sx * Math.cos(rad)) * 180) / Math.PI + 90;
      leaves += `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})" d="${leaf(150 * scale, 32 * scale, 0.12)}" fill="url(#${id}mango)"/>` +
        `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})" d="M0 0 V${f(-140 * scale)}" stroke="#A8D08D" stroke-width="1.4" opacity=".6"/>`;
    }
    const spots = [];
    for (let ring = 0; ring < 3; ring++) {
      const n = 3 + ring * 2;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) / n) * 90 + (r() - 0.5) * 10, rad = (a * Math.PI) / 180, d0 = (40 + ring * 95 + r() * 20) * scale;
        spots.push([ox + sx * Math.cos(rad) * d0, oy + sy * Math.sin(rad) * d0, (64 - ring * 8) * scale * (0.85 + r() * 0.3), ring]);
      }
    }
    spots.sort((p, q) => q[3] - p[3]).forEach(([x, y, rad], i) => { flowers += genda(x, y, rad, i % 3 === 0 ? ORANGE : i % 3 === 1 ? MARIGOLD : '#F5B700', seed * 31 + i); });
    return leaves + flowers;
  }
  CT.register('marigold-corners', {
    name: 'Marigold corners',
    occasions: ['haldi', 'wedding', 'mehendi'],
    description: 'Heaps of marigolds and mango leaves tucked into two corners',
    slots: 0,
    motif: (c) => marigold(20, 20, 9, c) + `<path transform="translate(42 44) rotate(40)" d="${leaf(20, 5, 0.1)}" fill="${c}"/>`,
    cover(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + kalashDefs(id);
      const sc = Math.min(1.15, Math.min(W, H) / 900);
      s += gendaHeap(-20, -20, 1, 1, sc, 3, th, id) + gendaHeap(W + 20, H + 20, -1, -1, sc, 7, th, id);
      // loose petals drifting between the heaps
      s += petalsAround(W, H, 13, { cx: W / 2, cy: H / 2, rx: W * 0.36, ry: H * 0.3 }, 14, [ORANGE, MARIGOLD]);
      return s + stack(d, W / 2, H * 0.5, Math.min(W * 0.6, H * 0.8), H * 0.12, { amp: th.accent }).svg;
    },
    back(W, H, d, th, id) {
      let s = silkBg(id, W, H, th.silk) + kalashDefs(id);
      s += gendaHeap(W + 20, -20, -1, 1, 0.8, 11, th, id);
      s += t(W / 2, H * 0.42, initials(d), { size: fit(initials(d), W * 0.4, H * 0.1) });
      return s + studioBlock(d, W / 2, H * 0.6);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
