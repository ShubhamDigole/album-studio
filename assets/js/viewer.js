/* ==========================================================================
   Wedding Album Viewer
   Realistic page-flip album viewer (FlipHTML5-style) built on StPageFlip (MIT).

   Album data sources (first match wins):
     ?album=<url-to-json>   fetch JSON (use this for a backend / API later)
     ?id=<folder>           loads albums/<folder>/album.js   (works from file://)
     default                albums/demo/album.js
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('albumviewer:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('albumviewer:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  const el = {
    app: $('#app'), bg: $('#bg'), stage: $('#stage'), shift: $('#bookShift'), shadow: $('#bookShadow'),
    zoomLayer: $('#zoomLayer'), zoomSheet: $('#zoomSheet'), zoomBadge: $('#zoomBadge'),
    thumbsDrawer: $('#thumbsDrawer'), thumbsTrack: $('#thumbsTrack'), tocPanel: $('#tocPanel'), tocList: $('#tocList'),
    pageInput: $('#pageInput'), pageTotal: $('#pageTotal'), progress: $('#progress'), progressTip: $('#progressTip'),
    autoplayBtn: $('#autoplayBtn'), soundBtn: $('#soundBtn'), fsBtn: $('#fsBtn'), downloadBtn: $('#downloadBtn'), tocBtn: $('#tocBtn'),
    shareModal: $('#shareModal'), helpModal: $('#helpModal'), toast: $('#toast'),
    loader: $('#loader'), loaderBar: $('#loaderBar'), loaderPct: $('#loaderPct'), loaderTitle: $('#loaderTitle'),
  };

  const DEFAULTS = {
    type: 'wedding', title: '', subtitle: '', names: [], studio: {}, pageWidth: 1296, pageHeight: 864,
    hardCover: true, music: '', autoplayInterval: 4, downloadUrl: '', flipTime: 900, theme: {}, pages: [], gallery: [],
  };
  const M = window.AlbumMeta;

  const S = {
    album: null, pages: [], pageEls: [], pf: null, book: null,
    portrait: false, pw: 0, ph: 0, current: 0, shiftX: 0,
    autoplay: false, autoplayTimer: null, sound: store.get('sound', true),
    thumbsBuilt: false, busy: false,
  };

  /* ------------------------------------------------------------------------
     Album loading (see album-meta.js: API on a server, albums/<id>/album.js from file://)
     ------------------------------------------------------------------------ */
  function normalize(data, base) {
    const album = Object.assign({}, DEFAULTS, data);
    const abs = (u) => (u ? new URL(u, base).href : '');
    const pages = [];
    (album.pages || []).forEach((p) => {
      if (typeof p === 'string') p = { src: p };
      if (p.spread) {
        const src = abs(p.spread), thumb = abs(p.thumb || p.spread), zoom = abs(p.zoom || p.spread);
        pages.push({ src, thumb, zoom, half: 'left', title: p.title || '' });
        pages.push({ src, thumb, zoom, half: 'right', title: '' });
      } else if (p.generated) {
        // drawn live from the album's cover template (cover-templates.js)
        pages.push({ gen: p.generated, text: p.text || '', title: p.title || '' });
      } else if (p.layout) {
        // a page laid out live from uploaded photos (full / pair / single)
        pages.push({ layout: p.layout, photos: (p.photos || []).map((x) => ({ src: abs(x.src), thumb: abs(x.thumb || x.src), zoom: abs(x.zoom || x.src), w: x.w, h: x.h })), title: p.title || '' });
      } else if (p.blank) {
        pages.push({ blank: true, title: p.title || '' });
      } else {
        pages.push({ src: abs(p.src), thumb: abs(p.thumb || p.src), zoom: abs(p.zoom || p.src), title: p.title || '' });
      }
    });
    // An even count keeps the back cover alone on the last sheet, like a real book
    if (pages.length % 2 === 1) pages.splice(Math.max(pages.length - 1, 0), 0, { blank: true, title: '' });
    const n = pages.length;
    if (album.hardCover && n >= 4) [0, 1, n - 2, n - 1].forEach((i) => { pages[i].hard = true; });
    album.studio = album.studio || {};
    album.theme = album.theme || {};
    album.coverPhotoUrl = abs(album.cover);
    return { album, pages };
  }

  /* ------------------------------------------------------------------------
     Layout
     ------------------------------------------------------------------------ */
  function measure() {
    const r = el.stage.getBoundingClientRect();
    const short = innerHeight <= 500 && innerWidth > innerHeight;   // a phone held sideways: no side arrows (see viewer.css)
    const small = r.width < 720 || short;
    const padX = small ? 10 : 84;   // leave room for the side arrows
    const padY = short ? 8 : small ? 14 : 36;
    const aw = Math.max(120, r.width - padX * 2);
    const ah = Math.max(80, r.height - padY * 2);
    const ratio = S.album.pageWidth / S.album.pageHeight;
    const pwLandscape = Math.min(aw / 2, ah * ratio);
    const pwPortrait = Math.min(aw, ah * ratio);
    // single-page mode when the screen is narrower than ~one page (phones, portrait tablets)
    const portrait = aw / ah < ratio * 1.1 || pwLandscape < 150;
    const pw = Math.floor(portrait ? pwPortrait : pwLandscape);
    return { portrait, pw, ph: Math.floor(pw / ratio) };
  }

  function visiblePages(idx = S.current) {
    const n = S.pages.length;
    if (S.portrait) return [idx];
    if (idx <= 0) return [0];
    if (idx >= n - 1 && n % 2 === 0) return [n - 1];
    const left = idx % 2 === 1 ? idx : idx - 1;
    return [left, Math.min(left + 1, n - 1)];
  }

  // Centre the closed book: the front cover sits on the right half, the back cover on the left.
  function shiftFor(idx) {
    if (S.portrait) return 0;
    const v = visiblePages(idx);
    if (v.length !== 1) return 0;
    return v[0] === 0 ? -S.pw / 2 : S.pw / 2;
  }

  function applyShift(x, animate = true) {
    S.shiftX = x;
    el.shift.classList.toggle('no-anim', !animate);
    el.shift.style.transform = 'translateX(' + x + 'px)';
    el.shadow.style.left = x < 0 ? '52%' : '4%';
    el.shadow.style.right = x > 0 ? '52%' : '4%';
    if (!animate) { void el.shift.offsetWidth; el.shift.classList.remove('no-anim'); }
  }

  /* ------------------------------------------------------------------------
     Book building
     ------------------------------------------------------------------------ */
  // Generated pages (cover, end page, endpapers) are SVG drawn from the album details.
  function genSvg(kind, text) {
    if (!window.CoverTemplates) return '';
    const a = S.album;
    return window.CoverTemplates.render(kind, Object.assign({}, a, { theme: M.theme(a) }), { ratio: a.pageWidth / a.pageHeight, text });
  }
  // HTML for a photo layout page; thumbnails use the small images
  // small: thumbnails (drawers, contents); zoom: the full-quality copies, when zoomed in
  function layoutHtml(p, small, lazy, zoom) {
    const img = (x) => '<img alt="" ' + (lazy ? 'data-src' : 'src') + '="' + (small ? x.thumb : zoom ? x.zoom || x.src : x.src) + '">';
    return '<div class="lay lay-' + p.layout + '">' + p.photos.map((x) =>
      '<figure style="aspect-ratio:' + (x.w || 3) + ' / ' + (x.h || 2) + '">' + img(x) + '</figure>').join('') + '</div>';
  }
  function pageVisual(p, cls) {
    if (p.layout) return '<span class="gen' + (cls ? ' ' + cls : '') + '">' + layoutHtml(p, true) + '</span>';
    if (p.gen) return '<span class="gen' + (cls ? ' ' + cls : '') + '">' + genSvg(p.gen, p.text) + '</span>';
    if (p.blank) return '';
    return '<img loading="lazy" alt="" src="' + p.thumb + '"' + (p.half ? ' class="half-' + p.half + '"' : '') + '>';
  }

  function createPageEl(p, i) {
    const n = S.pages.length;
    const page = document.createElement('div');
    page.className = 'page';
    if (p.hard) { page.dataset.density = 'hard'; page.classList.add('is-hard'); }
    if (i === 0 || i === n - 1) page.classList.add('is-cover');
    const inner = document.createElement('div');
    inner.className = 'page-inner';
    page.appendChild(inner);
    if (p.layout) {
      inner.innerHTML = layoutHtml(p, false, true);
      page.classList.add('is-loaded', 'is-layout');
    } else if (p.gen) {
      inner.innerHTML = genSvg(p.gen, p.text);
      inner.classList.add('gen');
      page.classList.add('is-loaded', 'is-generated');
    } else if (p.blank) {
      page.classList.add('is-loaded');
    } else {
      const spinner = document.createElement('div');
      spinner.className = 'page-spinner';
      const img = document.createElement('img');
      img.alt = p.title || 'Page ' + (i + 1);
      img.decoding = 'async';
      img.draggable = false;
      if (p.half) img.classList.add('half-' + p.half);
      img.dataset.src = p.src;
      img.addEventListener('load', () => { img.classList.add('loaded'); page.classList.add('is-loaded'); });
      img.addEventListener('error', () => {
        page.classList.add('is-loaded');
        const err = document.createElement('div');
        err.className = 'page-error';
        err.textContent = 'Image unavailable';
        inner.appendChild(err);
      });
      inner.appendChild(img);
      page.appendChild(spinner);
    }
    return page;
  }

  function loadPageImage(i) {
    const page = S.pageEls[i];
    if (!page) return null;
    page.querySelectorAll('img[data-src]').forEach((im) => { if (!im.getAttribute('src')) im.src = im.dataset.src; });
    return page.querySelector('.page-inner > img');
  }

  function ensureLoaded(idx) {
    for (let i = idx - 3; i <= idx + 6; i++) if (i >= 0 && i < S.pages.length) loadPageImage(i);
  }

  function build(startPage) {
    const m = measure();
    if (S.pf) { try { S.pf.destroy(); } catch (e) { /* already gone */ } S.pf = null; }
    S.portrait = m.portrait; S.pw = m.pw; S.ph = m.ph;

    const book = document.createElement('div');
    book.className = 'book';
    book.style.width = (m.portrait ? m.pw : m.pw * 2) + 'px';
    book.style.height = m.ph + 'px';
    el.shift.appendChild(book);
    S.book = book;

    S.pageEls = S.pages.map(createPageEl);
    S.pageEls.forEach((p) => book.appendChild(p));

    const pf = new St.PageFlip(book, {
      width: S.album.pageWidth,
      height: S.album.pageHeight,
      size: 'stretch',
      // The library switches to single-page mode when width < 2 * minWidth; we decide the mode ourselves.
      minWidth: m.portrait ? m.pw : 10,
      maxWidth: 10000, minHeight: 10, maxHeight: 10000,
      autoSize: false,
      showCover: true,
      usePortrait: true,
      drawShadow: true,
      maxShadowOpacity: 0.55,
      flippingTime: S.album.flipTime,
      startPage: clamp(startPage, 0, S.pages.length - 1),
      mobileScrollSupport: false,
      showPageCorners: true,
      disableFlipByClick: true,   // single click flips via our own handler (so double-click can zoom)
      swipeDistance: 30,
    });
    pf.loadFromHTML(S.pageEls);
    book.style.minWidth = ''; book.style.minHeight = ''; book.style.maxWidth = '';
    S.pf = pf;

    pf.on('flip', (e) => onPageChange(e.data));
    pf.on('changeState', (e) => onStateChange(e.data));
    pf.on('changeOrientation', () => applyShift(shiftFor(S.current), false));

    S.current = pf.getCurrentPageIndex();
    ensureLoaded(S.current);
    applyShift(shiftFor(S.current), false);
    updateUI();
  }

  function relayout() {
    if (!S.pf) return;
    if (S.zoom) exitZoom(false);
    const m = measure();
    if (m.portrait !== S.portrait) { build(S.current); return; }
    if (m.pw === S.pw && m.ph === S.ph) return;
    S.pw = m.pw; S.ph = m.ph;
    S.book.style.width = (m.portrait ? m.pw : m.pw * 2) + 'px';
    S.book.style.height = m.ph + 'px';
    S.pf.update();
    if (S.pf.getOrientation() !== (m.portrait ? 'portrait' : 'landscape')) { build(S.current); return; }
    applyShift(shiftFor(S.current), false);
  }

  /* ------------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------------ */
  function canFlip() { return S.pf && S.pf.getState() === 'read'; }

  function goTo(idx) {
    if (!S.pf) return;
    idx = clamp(idx, 0, S.pages.length - 1);
    if (S.zoom) exitZoom(false);
    const target = visiblePages(idx)[0];
    if (target === visiblePages()[0]) return;
    ensureLoaded(idx);
    applyShift(shiftFor(idx));              // move the book while the page turns
    S.pf.flip(idx);
  }
  function next() {
    if (!S.pf) return;
    if (S.zoom) exitZoom(false);
    const v = visiblePages();
    const last = v[v.length - 1];
    if (last >= S.pages.length - 1) return;
    ensureLoaded(last + 1);
    applyShift(shiftFor(last + 1));
    S.pf.flipNext();
  }
  function prev() {
    if (!S.pf) return;
    if (S.zoom) exitZoom(false);
    const first = visiblePages()[0];
    if (first <= 0) return;
    ensureLoaded(first - 1);
    applyShift(shiftFor(first - 1));
    S.pf.flipPrev();
  }

  function onStateChange(state) {
    if (state === 'flipping') {
      Sound.flip(visiblePages().some((i) => S.pages[i] && S.pages[i].hard));
      if (S.shiftX !== 0 && !S.portrait) applyShift(0);   // leaving a closed cover
    } else if (state === 'read') {
      applyShift(shiftFor(S.current));                    // also restores after a cancelled drag
    }
  }

  function onPageChange(idx) {
    S.current = idx;
    ensureLoaded(idx);
    applyShift(shiftFor(idx));
    updateUI();
    try { history.replaceState(null, '', '#p=' + (idx + 1)); } catch (e) { /* file:// in some browsers */ }
    if (S.autoplay) scheduleAutoplay();
  }

  function pageLabel(idx = S.current) {
    const v = visiblePages(idx);
    return v.length > 1 ? (v[0] + 1) + '–' + (v[1] + 1) : String(v[0] + 1);
  }

  function updateUI() {
    const n = S.pages.length;
    const v = visiblePages();
    if (document.activeElement !== el.pageInput) el.pageInput.value = pageLabel();
    el.pageTotal.textContent = n;
    el.progress.max = n;
    el.progress.value = v[0] + 1;
    el.progress.style.setProperty('--pct', (n > 1 ? (v[0] / (n - 1)) * 100 : 0) + '%');
    const atStart = v[0] <= 0, atEnd = v[v.length - 1] >= n - 1;
    $$('[data-action="prev"],[data-action="first"]').forEach((b) => { b.disabled = atStart; });
    $$('[data-action="next"],[data-action="last"]').forEach((b) => { b.disabled = atEnd; });
    if (S.thumbsBuilt) {
      $$('.thumb', el.thumbsTrack).forEach((t) => {
        const pages = t.dataset.pages.split(',').map(Number);
        t.classList.toggle('current', pages.some((p) => v.includes(p)));
      });
    }
    let currentToc = null;
    $$('button', el.tocList).forEach((b) => { if (+b.dataset.page <= v[v.length - 1]) currentToc = b; b.classList.remove('current'); });
    if (currentToc) currentToc.classList.add('current');
  }

  /* ------------------------------------------------------------------------
     Click / tap on the book: single = flip, double = zoom
     ------------------------------------------------------------------------ */
  function setupTapHandling() {
    let down = null, lastTap = null, singleTimer = null;
    el.shift.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) { down = null; return; }
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.shift.addEventListener('pointerup', (e) => {
      if (!down || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 400;
      down = null;
      if (moved > 8 || !quick) return;
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        clearTimeout(singleTimer); lastTap = null;
        enterZoom(2.2, e.clientX, e.clientY);
        return;
      }
      const tap = { x: e.clientX, y: e.clientY, t: now, page: S.current };
      lastTap = tap;
      clearTimeout(singleTimer);
      singleTimer = setTimeout(() => {
        lastTap = null;
        // the library may already be turning the page (corner click) – don't double flip
        if (!canFlip() || S.current !== tap.page) return;
        const r = S.book.getBoundingClientRect();
        const rel = (tap.x - r.left) / r.width;
        if (S.portrait ? rel < 0.3 : rel < 0.5) prev(); else next();
      }, 300);
    });
  }

  /* ------------------------------------------------------------------------
     Zoom & pan (separate high-resolution layer so the flip engine stays untouched)
     ------------------------------------------------------------------------ */
  const MAX_ZOOM = 5;
  S.zoom = null;

  function stagePoint(cx, cy) {
    const r = el.stage.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top, w: r.width, h: r.height };
  }

  function enterZoom(scale, cx, cy) {
    if (!S.pf || S.zoom || !canFlip()) return;
    const v = visiblePages();
    el.zoomSheet.innerHTML = '';
    // a panorama spread is shown as one image so no seam appears between the halves
    const pano = v.length === 2 && S.pages[v[0]].half === 'left' && S.pages[v[1]].half === 'right' && S.pages[v[0]].src === S.pages[v[1]].src;
    (pano ? [v[0]] : v).forEach((i) => {
      const p = S.pages[i];
      const box = document.createElement('div');
      box.className = 'zp';
      box.style.width = (pano ? S.pw * 2 : S.pw) + 'px';
      box.style.height = S.ph + 'px';
      if (p.layout) {
        box.innerHTML = layoutHtml(p, false, false, true);
        box.classList.add('gen');
      } else if (p.gen) {
        box.innerHTML = genSvg(p.gen, p.text);
        box.classList.add('gen');
      } else if (!p.blank) {
        const img = document.createElement('img');
        img.alt = '';
        if (p.half && !pano) img.className = 'half-' + p.half;
        img.src = p.zoom || p.src;
        box.appendChild(img);
      }
      el.zoomSheet.appendChild(box);
    });
    const sp = stagePoint(0, 0);
    const w = v.length * S.pw, h = S.ph;
    // the visible page(s) are always centred on the stage (see applyShift)
    S.zoom = { s: 1, w, h, x: (sp.w - w) / 2, y: (sp.h - h) / 2 };
    el.zoomLayer.hidden = false;
    S.book.classList.add('is-hidden');
    el.shadow.style.opacity = '0';
    renderZoom(false);
    requestAnimationFrame(() => {
      const c = cx == null ? { x: sp.w / 2, y: sp.h / 2 } : stagePoint(cx, cy);
      zoomTo(scale, c.x, c.y, true);
    });
    stopAutoplay();
  }

  function exitZoom(animate = true) {
    if (!S.zoom) return;
    const finish = () => {
      el.zoomLayer.hidden = true;
      el.zoomSheet.innerHTML = '';
      el.zoomBadge.hidden = true;
      if (S.book) S.book.classList.remove('is-hidden');
      el.shadow.style.opacity = '';
      S.zoom = null;
    };
    if (!animate) { finish(); return; }
    const sp = stagePoint(0, 0);
    zoomTo(1, sp.w / 2, sp.h / 2, true);
    setTimeout(finish, 360);
  }

  function clampZoom() {
    const z = S.zoom, sp = stagePoint(0, 0);
    const sw = z.w * z.s, sh = z.h * z.s;
    z.x = sw <= sp.w ? (sp.w - sw) / 2 : clamp(z.x, sp.w - sw, 0);
    z.y = sh <= sp.h ? (sp.h - sh) / 2 : clamp(z.y, sp.h - sh, 0);
  }

  function renderZoom(animate) {
    const z = S.zoom;
    el.zoomSheet.classList.toggle('animate', !!animate);
    el.zoomSheet.style.transform = 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')';
    el.zoomBadge.hidden = z.s <= 1.01;
    el.zoomBadge.textContent = Math.round(z.s * 100) + '%, drag to move, double-click to close';
  }

  function zoomTo(s, px, py, animate) {
    const z = S.zoom;
    if (!z) return;
    s = clamp(s, 1, MAX_ZOOM);
    const ux = (px - z.x) / z.s, uy = (py - z.y) / z.s;   // keep the point under the cursor fixed
    z.s = s; z.x = px - ux * s; z.y = py - uy * s;
    clampZoom();
    renderZoom(animate);
  }

  function zoomStep(dir) {
    const sp = stagePoint(0, 0);
    if (!S.zoom) { if (dir > 0) enterZoom(1.6); return; }
    const s = dir > 0 ? S.zoom.s * 1.5 : S.zoom.s / 1.5;
    if (s <= 1.02) exitZoom(); else zoomTo(s, sp.w / 2, sp.h / 2, true);
  }

  function setupZoomGestures() {
    const pointers = new Map();
    let pan = null, pinch = null, lastTap = 0;
    const layer = el.zoomLayer;

    layer.addEventListener('pointerdown', (e) => {
      layer.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        pan = { x: e.clientX, y: e.clientY, zx: S.zoom.x, zy: S.zoom.y, moved: 0 };
        layer.classList.add('dragging');
      } else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: S.zoom.s, mid };
        pan = null;
      }
    });
    layer.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !S.zoom) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomTo(pinch.s * (d / pinch.d), pinch.mid.x, pinch.mid.y, false);
      } else if (pan) {
        pan.moved = Math.max(pan.moved, Math.hypot(e.clientX - pan.x, e.clientY - pan.y));
        S.zoom.x = pan.zx + (e.clientX - pan.x);
        S.zoom.y = pan.zy + (e.clientY - pan.y);
        clampZoom(); renderZoom(false);
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      layer.classList.remove('dragging');
      if (pinch && pointers.size < 2) {
        pinch = null;
        if (S.zoom && S.zoom.s < 1.05) exitZoom();
        return;
      }
      if (pan && pan.moved < 6 && e.type === 'pointerup') {
        const now = performance.now();
        if (now - lastTap < 320) { lastTap = 0; exitZoom(); } else lastTap = now;
      }
      pan = null;
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);

    el.stage.addEventListener('wheel', (e) => {
      if (!S.pf) return;
      e.preventDefault();
      if (!S.zoom) { if (e.deltaY < 0) enterZoom(1.25, e.clientX, e.clientY); return; }
      const p = stagePoint(e.clientX, e.clientY);
      const s = S.zoom.s * Math.exp(-e.deltaY * 0.0018);
      if (s <= 1.0) exitZoom(); else zoomTo(s, p.x, p.y, false);
    }, { passive: false });
  }

  /* ------------------------------------------------------------------------
     Sound: synthesized page-turn rustle + optional background music
     ------------------------------------------------------------------------ */
  const Sound = {
    ctx: null, noise: null, music: null,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          this.ctx = new AC();
          const len = Math.floor(this.ctx.sampleRate * 0.8);
          this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = this.noise.getChannelData(0);
          let last = 0;
          for (let i = 0; i < len; i++) {           // slightly "brown" noise sounds more like paper
            const w = Math.random() * 2 - 1;
            last = (last + 0.08 * w) / 1.08;
            d[i] = w * 0.55 + last * 3.2;
          }
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      if (S.sound) this.playMusic();
    },
    flip(hard) {
      if (!S.sound || !this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + 0.01;
      const burst = (start, dur, f1, f2, gain, q) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.playbackRate.value = 0.9 + Math.random() * 0.2;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = q;
        bp.frequency.setValueAtTime(f1, start);
        bp.frequency.exponentialRampToValueAtTime(f2, start + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(gain, start + dur * 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        src.connect(bp); bp.connect(g); g.connect(ctx.destination);
        src.start(start, Math.random() * 0.2); src.stop(start + dur + 0.05);
      };
      if (hard) {
        burst(t, 0.35, 700, 260, 0.5, 0.9);
        burst(t + 0.62, 0.16, 420, 160, 0.7, 1.2);      // board landing "thud"
      } else {
        burst(t, 0.42, 3200, 1100, 0.32, 0.7);          // swoosh
        burst(t + 0.05, 0.22, 5200, 2600, 0.12, 2.5);   // paper crinkle
        burst(t + 0.55, 0.14, 1600, 700, 0.18, 1.0);    // page settles
      }
    },
    playMusic() {
      if (!S.album.music) return;
      if (!this.music) {
        this.music = new Audio(S.album.musicUrl);
        this.music.loop = true;
        this.music.volume = 0;
      }
      const a = this.music;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* blocked until a user gesture */ });
      cancelAnimationFrame(this._fade);
      const step = () => { a.volume = Math.min(0.55, a.volume + 0.01); if (a.volume < 0.55) this._fade = requestAnimationFrame(step); };
      step();
    },
    stopMusic() { if (this.music) this.music.pause(); },
  };

  function setSound(on, fromUser = true) {
    S.sound = on;
    store.set('sound', on);
    el.soundBtn.querySelector('use').setAttribute('href', on ? '#i-sound' : '#i-mute');
    el.soundBtn.title = on ? 'Sound off' : 'Sound on';
    if (!on) Sound.stopMusic();
    else if (fromUser) Sound.unlock();   // audio may only start inside a user gesture
  }

  /* ------------------------------------------------------------------------
     Auto flip (slideshow)
     ------------------------------------------------------------------------ */
  function scheduleAutoplay() {
    clearTimeout(S.autoplayTimer);
    S.autoplayTimer = setTimeout(() => {
      if (!S.autoplay) return;
      if (!canFlip()) { scheduleAutoplay(); return; }
      const v = visiblePages();
      if (v[v.length - 1] >= S.pages.length - 1) {
        // back to the start with a soft fade
        el.shift.style.transition = 'opacity .5s';
        el.shift.style.opacity = '0';
        setTimeout(() => {
          S.pf.turnToPage(0);
          el.shift.style.opacity = '';
          setTimeout(() => { el.shift.style.transition = ''; }, 500);
        }, 500);
      } else next();
    }, Math.max(1.5, +S.album.autoplayInterval || 4) * 1000);
  }
  function startAutoplay() {
    if (S.zoom) exitZoom(false);
    S.autoplay = true;
    el.autoplayBtn.classList.add('active');
    el.autoplayBtn.querySelector('use').setAttribute('href', '#i-pause');
    el.autoplayBtn.title = 'Pause slideshow';
    if (canFlip()) next();
    scheduleAutoplay();
  }
  function stopAutoplay() {
    S.autoplay = false;
    clearTimeout(S.autoplayTimer);
    el.autoplayBtn.classList.remove('active');
    el.autoplayBtn.querySelector('use').setAttribute('href', '#i-play');
    el.autoplayBtn.title = 'Play slideshow';
  }

  /* ------------------------------------------------------------------------
     Thumbnails, contents, slider
     ------------------------------------------------------------------------ */
  function spreads() {
    const n = S.pages.length, out = [[0]];
    for (let i = 1; i < n - 1; i += 2) out.push(i + 1 < n - 1 ? [i, i + 1] : [i]);
    if (n > 1) out.push([n - 1]);
    return out;
  }

  function thumbImg(p) { return pageVisual(p); }

  function buildThumbs() {
    if (S.thumbsBuilt) return;
    const ratio = S.album.pageWidth / S.album.pageHeight;
    el.thumbsTrack.innerHTML = spreads().map((sp) => {
      const imgs = sp.map((i) => '<span style="aspect-ratio:' + ratio + '">' + thumbImg(S.pages[i]) + '</span>').join('');
      const label = sp.length > 1 ? (sp[0] + 1) + '–' + (sp[1] + 1) : String(sp[0] + 1);
      return '<button class="thumb" data-pages="' + sp.join(',') + '"><div class="thumb-imgs">' + imgs + '</div><span>' + label + '</span></button>';
    }).join('');
    el.thumbsTrack.addEventListener('click', (e) => {
      const b = e.target.closest('.thumb');
      if (b) goTo(+b.dataset.pages.split(',')[0]);
    });
    S.thumbsBuilt = true;
    updateUI();
  }

  function toggleThumbs(force) {
    const open = force != null ? force : !el.thumbsDrawer.classList.contains('open');
    if (open) { buildThumbs(); togglePanel(false); }
    el.thumbsDrawer.classList.toggle('open', open);
    $('[data-action="thumbs"]').classList.toggle('active', open);
    if (open) {
      const cur = $('.thumb.current', el.thumbsTrack);
      if (cur) setTimeout(() => cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }), 60);
    }
  }

  function buildToc() {
    const items = S.pages.map((p, i) => ({ p, i })).filter((x) => x.p.title);
    if (!items.length) { el.tocBtn.hidden = true; return; }
    el.tocList.innerHTML = items.map(({ p, i }) =>
      '<li><button data-page="' + i + '">' +
      '<span class="toc-thumb">' + pageVisual(p) + '</span>' +
      '<span class="toc-name"></span><span class="toc-page">' + (i + 1) + '</span></button></li>').join('');
    $$('.toc-name', el.tocList).forEach((n, k) => { n.textContent = items[k].p.title; });
    el.tocList.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      goTo(+b.dataset.page);
      if (window.innerWidth < 900) togglePanel(false);
    });
  }

  function togglePanel(force) {
    const open = force != null ? force : !el.tocPanel.classList.contains('open');
    if (open) { toggleThumbs(false); if (window.innerWidth < 900) toggleBless(false); }
    el.tocPanel.classList.toggle('open', open);
    el.tocBtn.classList.toggle('active', open);
  }

  /* ------------------------------------------------------------------------
     Blessings (guestbook) – only when the album is served by the backend
     ------------------------------------------------------------------------ */
  const blessEl = { panel: $('#blessPanel'), btn: $('#blessBtn') };
  let guestbook = null;

  function toggleBless(force) {
    if (!guestbook) return;
    const open = force != null ? force : !blessEl.panel.classList.contains('open');
    if (open) { toggleThumbs(false); if (window.innerWidth < 900) togglePanel(false); stopAutoplay(); if (!guestbook.loaded) guestbook.load(); }
    blessEl.panel.classList.toggle('open', open);
    blessEl.btn.classList.toggle('active', open);
  }

  function setupBlessings() {
    blessEl.btn.hidden = false;
    guestbook = window.Guestbook.mount({ albumId: S.album.id, list: $('#blessList'), form: $('#blessForm'), note: $('#blessNote'), more: $('#blessMore') });
  }

  function applyMode(mode) {
    M.setMode(mode);
    const btn = $('#themeBtn');
    btn.querySelector('use').setAttribute('href', mode === 'dark' ? '#i-sun' : '#i-moon');
    btn.title = mode === 'dark' ? 'Light background' : 'Dark background';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#0F3D3E';
  }

  function setupSlider() {
    const tip = el.progressTip;
    const showTip = () => {
      const i = +el.progress.value - 1;
      const p = S.pages[i];
      const pct = (i / Math.max(1, S.pages.length - 1));
      const w = el.progress.getBoundingClientRect().width;
      tip.style.left = clamp(pct * w, 60, w - 60) + 'px';
      tip.innerHTML = (p && !p.blank ? '<span class="tip-thumb">' + pageVisual(p) + '</span>' : '') + 'Page ' + (i + 1);
      tip.classList.add('show');
    };
    el.progress.addEventListener('input', showTip);
    el.progress.addEventListener('change', () => { tip.classList.remove('show'); goTo(+el.progress.value - 1); });
    el.progress.addEventListener('pointerup', () => tip.classList.remove('show'));
    el.progress.addEventListener('blur', () => tip.classList.remove('show'));
  }

  function setupPageInput() {
    const inp = el.pageInput;
    inp.addEventListener('focus', () => { inp.value = ''; });
    inp.addEventListener('blur', () => { inp.value = pageLabel(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = parseInt(inp.value, 10);
        if (!isNaN(n)) goTo(n - 1);
        inp.blur();
      } else if (e.key === 'Escape') inp.blur();
    });
  }

  /* ------------------------------------------------------------------------
     Share, fullscreen, modals, toast
     ------------------------------------------------------------------------ */
  function shareUrl() {
    const base = location.href.split('#')[0];
    return $('#shareCurrent').checked ? base + '#p=' + (S.current + 1) : base;
  }
  function refreshShare() {
    const url = shareUrl(), title = S.album.title;
    $('#shareUrl').value = url;
    $('#shareWa').href = 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url);
    $('#shareFb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    $('#shareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
    $('#shareMail').href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(title + '\n' + url);
  }
  async function copyLink() {
    const url = shareUrl();
    try { await navigator.clipboard.writeText(url); }
    catch (e) { const i = $('#shareUrl'); i.select(); document.execCommand('copy'); }
    toast('Link copied');
  }

  function openModal(m) { closeModals(); m.hidden = false; stopAutoplay(); }
  function closeModals() { [el.shareModal, el.helpModal].forEach((m) => { m.hidden = true; }); }

  let toastTimer;
  function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFullscreen() {
    const d = document.documentElement;
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (d.requestFullscreen) d.requestFullscreen().catch(() => toast('Full screen is not available here'));
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
    else toast('This device does not support full screen');
  }
  function onFullscreenChange() {
    const fs = isFullscreen();
    el.app.classList.toggle('is-fullscreen', fs);
    el.fsBtn.querySelector('use').setAttribute('href', fs ? '#i-exit-fullscreen' : '#i-fullscreen');
    el.fsBtn.title = fs ? 'Exit full screen' : 'Full screen';
  }

  /* ------------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------------ */
  const actions = {
    first: () => goTo(0),
    last: () => goTo(S.pages.length - 1),
    prev: () => { stopAutoplay(); prev(); },
    next: () => { stopAutoplay(); next(); },
    thumbs: () => toggleThumbs(),
    toc: () => togglePanel(),
    bless: () => toggleBless(),
    theme: () => applyMode(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
    'zoom-in': () => zoomStep(1),
    'zoom-out': () => zoomStep(-1),
    autoplay: () => (S.autoplay ? stopAutoplay() : startAutoplay()),
    sound: () => setSound(!S.sound),
    share: () => { refreshShare(); openModal(el.shareModal); },
    help: () => openModal(el.helpModal),
    fullscreen: toggleFullscreen,
    'close-modal': closeModals,
    'copy-link': copyLink,
  };

  function wire() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (b && actions[b.dataset.action]) { e.preventDefault(); actions[b.dataset.action](); }
      if (e.target.classList.contains('modal')) closeModals();
    });
    $('#shareCurrent').addEventListener('change', refreshShare);

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown') { actions.next(); e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'PageUp') { actions.prev(); e.preventDefault(); }
      else if (k === 'Home') actions.first();
      else if (k === 'End') actions.last();
      else if (k === '+' || k === '=') zoomStep(1);
      else if (k === '-' || k === '_') zoomStep(-1);
      else if (k === 'f' || k === 'F') toggleFullscreen();
      else if (k === 'p' || k === 'P') actions.autoplay();
      else if (k === 'm' || k === 'M') actions.sound();
      else if (k === 't' || k === 'T') toggleThumbs();
      else if (k === 'Escape') {
        if (!el.shareModal.hidden || !el.helpModal.hidden) closeModals();
        else if (S.zoom) exitZoom();
        else { toggleThumbs(false); togglePanel(false); toggleBless(false); }
      }
    });

    // browsers only allow audio after a user gesture
    const unlock = () => { Sound.unlock(); document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true); };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    let rt;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(relayout, 120); };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(el.stage);
    else window.addEventListener('resize', onResize);

    window.addEventListener('hashchange', () => {
      const m = /p=(\d+)/.exec(location.hash);
      if (m && +m[1] - 1 !== S.current) goTo(+m[1] - 1);
    });

    setupTapHandling();
    setupZoomGestures();
    setupSlider();
    setupPageInput();
  }

  function applyBranding() {
    const a = S.album, st = a.studio;
    a.title = M.title(a);
    document.title = a.title;
    $('#albumTitle').textContent = a.title;
    $('#albumSubtitle').textContent = M.subtitle(a);
    $('#brandName').textContent = st.name ? 'Photographs by ' + st.name : '';
    if (st.url) $('#brand').href = st.url; else $('#brand').removeAttribute('href');
    if (st.logo) { const l = $('#brandLogo'); l.src = st.logoUrl; l.alt = st.name || ''; l.hidden = false; }
    M.applyTheme(a);
    applyMode(M.getMode());
    if (a.downloadUrl) { el.downloadBtn.href = a.downloadUrlAbs; el.downloadBtn.hidden = false; }
    if (a.gallery && a.gallery.length) {
      const g = $('#galleryLink');
      g.href = 'gallery.html?' + new URLSearchParams(location.search).toString();
      g.hidden = false;
    }
    el.loaderTitle.textContent = a.title;
  }

  function preload(indices, onProgress) {
    let done = 0;
    const list = indices.filter((i) => S.pages[i] && !S.pages[i].blank);
    if (!list.length) { onProgress(1); return Promise.resolve(); }
    return Promise.all(list.map((i) => new Promise((res) => {
      const img = loadPageImage(i);
      const fin = () => { done++; onProgress(done / list.length); res(); };
      if (!img) return fin();
      if (img.complete && img.naturalWidth) return fin();
      img.addEventListener('load', fin, { once: true });
      img.addEventListener('error', fin, { once: true });
    })));
  }

  async function init() {
    try {
      if (!window.St || !window.St.PageFlip) throw new Error('page-flip library failed to load');
      const { data, base, api } = await M.load();
      const { album, pages } = normalize(data, base);
      S.album = album;
      applyBranding();
      if (!pages.length) throw new Error('This album has no pages yet. Build the photos with tools/build-album.mjs.');
      const abs = (u) => (u ? new URL(u, base).href : '');
      album.musicUrl = abs(album.music);
      // built-in songs that need an attribution (CC BY) are credited in the "How to view" box
      if (/^\/assets\/music\//.test(album.music)) {
        fetch('/assets/music/tracks.json').then((r) => (r.ok ? r.json() : [])).then((list) => {
          const t = (list || []).find((x) => x.file === album.music);
          const el2 = document.getElementById('musicCredit');
          if (t && el2) { el2.textContent = 'Music: ' + (t.credit || (t.title + (t.artist ? ' by ' + t.artist : '') + (t.license ? ' (' + t.license + ')' : ''))); el2.hidden = false; }
        }).catch(() => {});
      }
      album.downloadUrlAbs = abs(album.downloadUrl);
      if (album.studio.logo) { album.studio.logoUrl = abs(album.studio.logo); $('#brandLogo').src = album.studio.logoUrl; }
      if (album.downloadUrl) el.downloadBtn.href = album.downloadUrlAbs;
      S.pages = pages;
      if (api) {
        setupBlessings();
        fetch('/api/view/' + encodeURIComponent(album.id), { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      }
      const m = /p=(\d+)/.exec(location.hash);
      const start = m ? clamp(+m[1] - 1, 0, pages.length - 1) : 0;
      build(start);
      buildToc();
      wire();
      setSound(S.sound, false);

      const v = visiblePages(start);
      const first = [...v, v[v.length - 1] + 1, v[v.length - 1] + 2];
      const timeout = new Promise((r) => setTimeout(r, 10000));
      await Promise.race([preload(first, (f) => {
        el.loaderBar.style.width = Math.round(f * 100) + '%';
        el.loaderPct.textContent = 'Opening the album, ' + Math.round(f * 100) + '%';
      }), timeout]);

      el.app.classList.remove('is-loading');
      el.shift.classList.add('intro');
      setTimeout(() => el.shift.classList.remove('intro'), 1100);
      const touch = matchMedia('(pointer:coarse)').matches;
      if (touch && S.portrait && album.pageWidth > album.pageHeight && innerHeight > innerWidth) {
        setTimeout(() => toast('Tip: rotate your phone to see full spreads', 3800), 1200);
      } else if (!store.get('hintShown', false)) {
        setTimeout(() => toast(touch
          ? 'Swipe or tap to turn the page. Double-tap to look closer.'
          : 'Click a page or drag its corner to turn it. Double-click to look closer.', 4200), 1200);
        store.set('hintShown', true);
      }
    } catch (err) {
      console.error(err);
      el.loaderTitle.textContent = 'This album did not open';
      el.loaderTitle.style.animation = 'none';
      el.loaderPct.textContent = String(err.message || err);
      $('.loader-bar').hidden = true;
    }
  }

  // Small public API – handy for a future dynamic app (e.g. AlbumViewer.goTo(10))
  window.AlbumViewer = { goTo: (n) => goTo(n), next, prev, get state() { return S; } };

  init();
})();
