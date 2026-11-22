/* Page design builder for the master (admin #templates).
   A library of the master's page designs (with the built-in ones as starting points) and an editor where photo spots
   and text boxes are drawn on the page: drag, resize, snap, nudge, undo, and a live render through PageTemplates.render.
   Saved designs go to /api/admin/master/page-templates and are offered to every studio's page editor.
   The data format and its limits are in assets/js/page-templates.js and lib/pages.js (cleanTemplate).

   window.TemplateDesigner.mount(host, ctx), ctx = { api, toast, esc, M, CT, PT, user, ratioOf, prepareImage, typeLabel, closeModal } */
(function () {
  'use strict';

  const SLOT_MAX = 12, TEXT_MAX = 8;               // the server keeps at most this many (lib/pages.js)
  const MIN = 0.02;                                // smallest width / height the server accepts
  const SNAP_PX = 6;                               // how close (in screen pixels) an edge must be to snap
  const GRID = 20;                                 // grid lines per page (every 5%)
  const PAGE_M = 0.045;                            // the built-in designs' outer margin
  const HEX = /^#[0-9a-f]{6}$/i;
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pctTxt = (v) => String(Math.round(v * 1000) / 10);

  const ROLES = [
    ['names', 'Couple’s names', 'Shows the names from each album.'],
    ['date', 'Date', 'Shows the date of each album.'],
    ['place', 'Place', 'Shows the place of each album.'],
    ['title', 'Album title', 'Shows the album’s title, or the names when it has none.'],
    ['section', 'Section heading', 'Shows the name of the part of the album the page opens, such as Haldi.'],
    ['caption', 'Caption', 'Words the studio writes for each page.'],
    ['free', 'Free text', 'Fixed words that the studio can change.'],
  ];
  const ROLE = Object.fromEntries(ROLES.map(([k, l, h]) => [k, { label: l, hint: h }]));
  const AUTO_ROLES = ['names', 'date', 'place', 'title'];
  const TEXT_DEFAULTS = {
    names: { w: 0.6, h: 0.16, font: 'display', size: 8, color: 'silk' },
    title: { w: 0.6, h: 0.13, font: 'display', size: 6.5, color: 'silk' },
    section: { w: 0.6, h: 0.13, font: 'display', size: 6.5, color: 'silk', text: 'The wedding day' },
    date: { w: 0.4, h: 0.07, font: 'ui', size: 3.2, color: 'ink' },
    place: { w: 0.4, h: 0.07, font: 'ui', size: 3.2, color: 'ink' },
    caption: { w: 0.3, h: 0.22, font: 'display', size: 4.2, color: 'ink', align: 'left', text: 'A few words about this moment' },
    free: { w: 0.4, h: 0.09, font: 'ui', size: 3.6, color: 'ink', text: 'Your words here' },
  };
  const BGS = [['paper', 'Paper', '#F7F3EE'], ['white', 'White', '#FFFFFF'], ['silk', 'Silk, in the occasion’s colour', null], ['dark', 'Dark', '#17151C']];
  const COLORS = [['ink', 'Ink'], ['accent', 'Accent, the occasion’s second colour'], ['light', 'Light'], ['silk', 'Silk, the occasion’s colour']];
  const FRAMES = [['none', 'None'], ['mat', 'Mat'], ['shadow', 'Shadow'], ['polaroid', 'Polaroid']];
  const SHAPES = [['square', 'Square'], ['round', 'Rounded'], ['circle', 'Circle'], ['arch', 'Arch']];
  const WEIGHTS = [['', 'Usual weight'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semi-bold'], ['700', 'Bold']];
  const RATIOS = [[1.5, 'Landscape', 'M3 7h18v11H3z'], [1, 'Square', 'M5 5h14v14H5z'], [0.707, 'Portrait', 'M7 3h10v18H7z']];

  // sample photos for the previews: drawn scenes, so nothing private is shown
  const svgUri = (body, bg) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420" preserveAspectRatio="xMidYMid slice">${bg}${body}</svg>`);
  const lin = (id, stops, x2 = 0, y2 = 1) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`;
  const SAMPLES = [
    svgUri('<circle cx="420" cy="170" r="46" fill="#FFE2B0" opacity=".9"/><path d="M0 300 Q120 230 240 280 T480 258 T600 272 V420 H0Z" fill="#3B2440"/><path d="M0 344 Q180 290 340 332 T600 320 V420 H0Z" fill="#24162A"/><path d="M262 338 v-60 a13 13 0 0 1 26 0 v60 M300 338 v-68 a13 13 0 0 1 26 0 v68" fill="#140c18"/><circle cx="275" cy="262" r="12" fill="#140c18"/><circle cx="313" cy="254" r="12" fill="#140c18"/>',
      lin('a', [[0, '#F6B26B'], [0.55, '#E0726C'], [1, '#5B3A5E']]) + '<rect width="600" height="420" fill="url(#a)"/>'),
    svgUri([[80, 90, 54, '#F7931E'], [200, 300, 70, '#FFB627'], [330, 120, 40, '#F26B1D'], [470, 260, 88, '#FFC93C'], [560, 80, 46, '#F7931E'], [140, 380, 50, '#F26B1D'], [380, 380, 36, '#FFD23F']]
      .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".85"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="#C2410C" opacity=".5"/>`).join(''),
      lin('b', [[0, '#FFE38A'], [1, '#F4A100']]) + '<rect width="600" height="420" fill="url(#b)"/>'),
    svgUri('<path d="M170 420 V210 Q170 90 300 60 Q430 90 430 210 V420 Z" fill="#F7E7C6" opacity=".14"/><path d="M200 420 V220 Q200 120 300 96 Q400 120 400 220 V420 Z" fill="none" stroke="#E9B949" stroke-width="5"/>' +
      Array.from({ length: 13 }, (_, i) => `<circle cx="${60 + i * 40}" cy="${40 + Math.sin(i / 1.6) * 16}" r="5" fill="#FFD27A"/>`).join('') + '<rect y="380" width="600" height="40" fill="#08201F"/>',
      lin('c', [[0, '#1B5C58'], [1, '#0A2B2A']]) + '<rect width="600" height="420" fill="url(#c)"/>'),
    svgUri('<g fill="none" stroke="#6B2F14" stroke-width="5" opacity=".75"><circle cx="300" cy="210" r="56"/><circle cx="300" cy="210" r="96"/><circle cx="300" cy="210" r="140" stroke-dasharray="4 14"/></g>' +
      Array.from({ length: 12 }, (_, i) => `<ellipse cx="300" cy="96" rx="13" ry="30" fill="#6B2F14" opacity=".7" transform="rotate(${i * 30} 300 210)"/>`).join('') + '<circle cx="300" cy="210" r="18" fill="#6B2F14"/>',
      lin('d', [[0, '#B5C46A'], [1, '#5E7A2E']]) + '<rect width="600" height="420" fill="url(#d)"/>'),
    svgUri([[90, 110, 50, '#FF7AB0'], [230, 260, 80, '#FFB347'], [380, 90, 36, '#FF5C8A'], [500, 230, 64, '#FFD27A'], [140, 360, 40, '#E86AF0'], [420, 360, 52, '#FF7AB0']]
      .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity=".42"/>`).join(''),
      lin('e', [[0, '#3A1640'], [1, '#170A1E']]) + '<rect width="600" height="420" fill="url(#e)"/>'),
    svgUri('<path d="M300 92 a34 34 0 1 1 0.1 0Z" fill="#5A1426"/><path d="M226 420 C236 260 252 170 300 150 C348 170 364 260 374 420Z" fill="#7A1C33"/><path d="M262 120 C220 170 200 300 180 420 H226 C236 260 252 170 300 150Z" fill="#C8255F" opacity=".75"/>',
      lin('f', [[0, '#FFD9C2'], [1, '#F2A48C']]) + '<rect width="600" height="420" fill="url(#f)"/>'),
    svgUri('<path d="M0 300 H90 V230 h20 v-30 a20 20 0 0 1 40 0 v30 h20 V170 a40 40 0 0 1 80 0 V230 h30 V150 a50 50 0 0 1 100 0 V230 h20 v-20 a22 22 0 0 1 44 0 v20 H600 V300Z" fill="#F4E9DA"/><rect y="300" width="600" height="120" fill="#7FA8B8"/><path d="M0 330 H600 M0 360 H600" stroke="#B6D3DD" stroke-width="3" opacity=".6"/>',
      lin('g', [[0, '#9EC5D3'], [1, '#F1D9B5']]) + '<rect width="600" height="420" fill="url(#g)"/>'),
    svgUri([[70, 80, 60], [210, 200, 90], [360, 70, 44], [520, 180, 76], [160, 360, 58], [450, 370, 66]]
      .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? '#D8F0A8' : '#8BC34A'}" opacity=".38"/>`).join(''),
      lin('h', [[0, '#2E5E2A'], [1, '#14301A']]) + '<rect width="600" height="420" fill="url(#h)"/>'),
  ];
  const samplePhotos = (n, offset = 0) => Array.from({ length: n }, (_, i) => ({ src: SAMPLES[(i + offset) % SAMPLES.length] }));

  const ICONS = {
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    text: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    fwd: '<path d="M5 4h14M12 20V9M7.5 13.5L12 9l4.5 4.5"/>',
    back: '<path d="M5 20h14M12 4v11M7.5 10.5L12 15l4.5-4.5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    grid: '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    snap: '<path d="M6 4h4v8a2 2 0 004 0V4h4v8a6 6 0 01-12 0z"/><path d="M6 8h4M14 8h4"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 6 10 6a9.6 9.6 0 004.6-1.1"/>',
    spread: '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    backarrow: '<path d="M15 18l-6-6 6-6"/>',
    reset: '<path d="M4 12a8 8 0 108-8M4 4v5h5"/>',
  };
  const ic = (n, cls = '') => `<svg class="td-ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  let C = null, host = null, st = null;

  /* ---------- sample album (for the live render) ---------- */
  function sampleAlbum() {
    const t = C.M.TYPES[st.occasion] || C.M.TYPES.wedding;
    return { names: ['Shubham', 'Shraddha'], title: 'Shubham & Shraddha', date: '2026-02-12', location: 'Udaipur, Rajasthan', theme: { silk: t.silk, accent: t.accent } };
  }
  // PageTemplates.render writes the display font stack with double quotes inside a double-quoted style attribute,
  // which ends the attribute early (text loses its size and colour). Until that is fixed there, swap the quotes here.
  const fixQuotes = (html) => html;   // page-templates.js already writes the font names safely
  function renderTpl(tpl, offset = 0, editable = false) {
    return fixQuotes(C.PT.render({ t: tpl.key || 'draft', p: [], tx: [], section: 'The wedding day' },
      { tpl, album: sampleAlbum(), photos: samplePhotos(tpl.slots.length, offset), editable }));
  }

  /* ---------- mounting ---------- */
  function mount(h, ctx) {
    C = ctx; host = h;
    st = { view: 'library', list: [], loaded: false, occasion: 'wedding', ratio: 1.5, grid: true, snap: true, preview: false };
    host.classList.add('td');
    showLibrary();
  }
  const active = () => host && host.isConnected && st && st.view === 'editor';
  const snap = () => JSON.stringify(st.doc);
  const dirty = () => active() && snap() !== st.savedJson;

  // leaving the editor with unsaved work: ask first. The admin routes on hashchange, which is too late to stay,
  // so the navigation is stopped before it happens: with the Navigation API where the browser has it, else on link clicks.
  const LEAVE_Q = 'Leave this page design without saving? Your changes will be lost.';
  const mayLeave = () => { if (!dirty()) return true; if (confirm(LEAVE_Q)) { st.savedJson = snap(); return true; } return false; };
  let guarded = false;
  function guardOnce() {
    if (guarded) return; guarded = true;
    const nav = window.navigation && typeof window.navigation.addEventListener === 'function' ? window.navigation : null;
    if (nav) {
      nav.addEventListener('navigate', (e) => {
        if (!dirty() || !e.hashChange || !e.cancelable || new URL(e.destination.url).hash === '#templates') return;
        if (!mayLeave()) e.preventDefault();
      });
    } else {
      document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || a.getAttribute('href') === '#templates' || !dirty()) return;
        if (!mayLeave()) { e.preventDefault(); e.stopPropagation(); }
      }, true);
    }
    addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
    addEventListener('keydown', onKey);
    addEventListener('resize', () => { if (active()) layout(); });
  }

  /* ======================================================================
     Library
     ====================================================================== */
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function describe(t) {
    const parts = [];
    if (t.slots.length) parts.push(plural(t.slots.length, 'photo', 'photos'));
    if ((t.texts || []).length) parts.push(plural(t.texts.length, 'text box', 'text boxes'));
    if (t.spread) parts.push('across two pages');
    return parts.join(', ');
  }
  async function showLibrary() {
    guardOnce();
    st.view = 'library';
    host.innerHTML = `<div class="td-lib"><header class="td-lib-head">
        <div><h1 class="display td-lib-title">Page designs</h1>
        <p class="td-lede">Draw a page once and every studio can use it in its albums. Photo spots take the studio’s photos; text boxes fill in each couple’s names, date and place.</p></div>
        <button class="btn" type="button" data-act="new">${ic('plus')}New page design</button></header>
        <div id="tdLib"><p class="hint">Loading designs…</p></div></div>`;
    host.querySelector('[data-act="new"]').onclick = () => openEditor(blankDoc(), null, false);
    try {
      const d = await C.api('page-templates');
      st.list = d.templates || [];
      st.list.forEach((t) => C.PT.define(t));
      st.loaded = true;
    } catch (err) { C.toast(err.message); }
    if (!host.isConnected || st.view !== 'library') return;
    paintLibrary();
  }

  function paintLibrary() {
    const lib = host.querySelector('#tdLib');
    if (!lib) return;
    const mine = st.list;
    const builtin = C.PT.list().filter((t) => !String(t.key).startsWith('c-'));
    const card = (t, own) => {
      const ar = 1.5 * (t.spread ? 2 : 1);
      const occ = (t.occasions || []).map((o) => C.typeLabel(o)).join(', ');
      return `<article class="td-card${t.spread ? ' is-spread' : ''}${t.hidden ? ' is-hidden' : ''}" data-key="${C.esc(t.key)}">
        <button type="button" class="td-thumb" data-act="${own ? 'edit' : 'start'}" style="--ar:${ar}" aria-label="${own ? 'Edit' : 'Start from'} ${C.esc(t.name)}">${renderTpl(t, own ? 0 : 2)}</button>
        <div class="td-card-text">
          <h3>${C.esc(t.name)}</h3>
          <p class="td-meta">${C.esc(describe(t))}${occ ? `<br>For ${C.esc(occ)}` : ''}</p>
          ${own ? `<p class="td-status ${t.hidden ? 'off' : 'on'}">${t.hidden ? 'Hidden from studios' : 'Offered to studios'}</p>` : ''}
        </div>
        <div class="td-card-actions">${own
          ? `<button type="button" class="td-act" data-act="edit">${ic('edit')}Edit</button>
             <button type="button" class="td-act" data-act="dup">${ic('dup')}Duplicate</button>
             <button type="button" class="td-act" data-act="toggle">${ic(t.hidden ? 'eye' : 'eyeoff')}${t.hidden ? 'Show to studios' : 'Hide'}</button>
             <button type="button" class="td-act danger" data-act="delete">${ic('trash')}Delete</button>`
          : `<button type="button" class="td-act" data-act="start">${ic('dup')}Start from this</button>`}</div>
      </article>`;
    };
    lib.innerHTML = `
      <section class="td-sec">
        <h2 class="td-sec-title">Your designs ${mine.length ? `<span class="td-count">${mine.length}</span>` : ''}</h2>
        ${mine.length ? `<div class="td-grid">${mine.map((t) => card(t, true)).join('')}</div>`
          : `<div class="td-empty"><p><b>No designs of your own yet.</b> Start with a blank page, or pick one of the ready-made designs below and change it.</p>
             <button class="btn quiet" type="button" data-act="new">${ic('plus')}New page design</button></div>`}
      </section>
      <section class="td-sec">
        <h2 class="td-sec-title">Ready-made designs</h2>
        <p class="hint td-sec-hint">Every studio already has these. Start from one to make your own version; the original stays as it is.</p>
        <div class="td-grid td-grid-small">${builtin.map((t) => card(t, false)).join('')}</div>
      </section>`;
    lib.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'new') return openEditor(blankDoc(), null, false);
      const key = b.closest('[data-key]').dataset.key;
      const own = mine.find((t) => t.key === key);
      const t = own || C.PT.get(key);
      if (!t) return;
      if (b.dataset.act === 'edit') openEditor(docFrom(t), key, false);
      else if (b.dataset.act === 'dup' || b.dataset.act === 'start') openEditor(Object.assign(docFrom(t), { name: ('Copy of ' + t.name).slice(0, 60), live: true }), null, true);
      else if (b.dataset.act === 'toggle') setHidden(own, !own.hidden, b);
      else if (b.dataset.act === 'delete') removeDesign(own, b);
    };
  }

  async function setHidden(t, hidden, btn) {
    btn.disabled = true;
    try {
      const { template } = await C.api('master/page-templates/' + encodeURIComponent(t.key), { method: 'PUT', body: { hidden } });
      C.PT.define(template);
      st.list = st.list.map((x) => (x.key === t.key ? template : x));
      C.toast(hidden ? `“${t.name}” is hidden from studios` : `“${t.name}” is offered to studios again`);
      paintLibrary();
    } catch (err) { C.toast(err.message); btn.disabled = false; }
  }
  async function removeDesign(t, btn) {
    if (!confirm(`Delete “${t.name}” for good?\n\nAlbum pages that use it will show their photos in a simple framed layout instead.`)) return;
    btn.disabled = true;
    try {
      await C.api('master/page-templates/' + encodeURIComponent(t.key), { method: 'DELETE' });
      C.PT.forget(t.key);
      st.list = st.list.filter((x) => x.key !== t.key);
      C.toast(`Deleted “${t.name}”`);
      paintLibrary();
    } catch (err) { C.toast(err.message); btn.disabled = false; }
  }

  /* ======================================================================
     Editor: document, history
     ====================================================================== */
  function blankDoc() { return { name: '', spread: false, bg: 'paper', slots: [], texts: [], auto: false, occasions: [], live: true }; }
  function docFrom(t) {
    const clone = (o) => JSON.parse(JSON.stringify(o || []));
    return { name: t.name || '', spread: !!t.spread, bg: t.bg || 'paper', slots: clone(t.slots), texts: clone(t.texts),
      auto: t.auto !== false && !(t.texts || []).length, occasions: (t.occasions || []).slice(), live: !t.hidden };
  }
  function commit() {
    st.msg = '';
    const s = snap();
    if (st.hist[st.hi] === s) { paintChrome(); return; }
    st.hist = st.hist.slice(0, st.hi + 1);
    st.hist.push(s);
    if (st.hist.length > 200) st.hist.shift();
    st.hi = st.hist.length - 1;
    paintChrome();
  }
  function travel(step) {
    const i = st.hi + step;
    if (i < 0 || i >= st.hist.length) return;
    st.hi = i;
    st.doc = JSON.parse(st.hist[i]);
    if (st.sel && !elOf(st.sel)) st.sel = null;
    paintAll(); layout();
  }
  const list = (k) => (k === 's' ? st.doc.slots : st.doc.texts);
  const elOf = (sel) => sel && list(sel.k)[sel.i];
  const cur = () => elOf(st.sel);

  // what is sent to the server: only the fields cleanTemplate keeps, rounded
  function payload() {
    const d = st.doc;
    const slots = d.slots.map((s) => {
      const o = { x: r4(s.x), y: r4(s.y), w: r4(s.w), h: r4(s.h) };
      if (s.r === 'circle' || s.r === 'arch') o.r = s.r; else if (+s.r > 0) o.r = r4(+s.r);
      if (s.frame && s.frame !== 'none') o.frame = s.frame;
      if (s.rot) o.rot = Math.round(s.rot * 10) / 10;
      return o;
    });
    const texts = d.texts.map((t) => {
      const o = { x: r4(t.x), y: r4(t.y), w: r4(t.w), h: r4(t.h), role: t.role, font: t.font === 'ui' ? 'ui' : 'display',
        size: Math.round(t.size * 10) / 10, align: t.align || 'center', color: t.color || 'ink' };
      if (t.text && t.text.trim()) o.text = t.text.trim().slice(0, 200);
      if (t.weight) o.weight = +t.weight;
      return o;
    });
    return { name: d.name.trim(), spread: !!d.spread, bg: d.bg, slots, texts, auto: !!d.auto && !texts.length, occasions: d.occasions };
  }

  /* problems that stop a save, and warnings worth a look */
  function check() {
    const d = st.doc, errors = [], warnings = [];
    if (!d.name.trim()) errors.push({ msg: 'Give the design a name, so studios can find it.', focus: 'name' });
    if (!d.slots.length && !d.texts.length) errors.push({ msg: 'Add at least one photo spot or text box.' });
    const inside = (e) => {
      const ix = Math.max(0, Math.min(1, e.x + e.w) - Math.max(0, e.x)), iy = Math.max(0, Math.min(1, e.y + e.h) - Math.max(0, e.y));
      return (ix * iy) / (e.w * e.h);
    };
    d.slots.forEach((s, i) => { if (inside(s) < 0.5) warnings.push({ msg: `Photo ${i + 1} is mostly outside the page.`, sel: { k: 's', i } }); });
    d.texts.forEach((t, i) => {
      if (t.size * 1.12 / 100 > t.h + 0.002) warnings.push({ msg: `The words in “${ROLE[t.role].label}” are taller than their box and will be cut off. Make the box taller or the words smaller.`, sel: { k: 't', i } });
    });
    return { errors, warnings };
  }

  /* ======================================================================
     Editor: layout and painting
     ====================================================================== */
  function openEditor(doc, key, isCopy) {
    guardOnce();
    st.view = 'editor';
    st.key = key; st.doc = doc; st.sel = null; st.preview = false; st.menu = false;
    st.hist = [snap()]; st.hi = 0;
    st.savedJson = isCopy ? null : snap();
    st.msg = '';
    host.innerHTML = `<div class="td-ed${st.preview ? ' is-preview' : ''}">
      <header class="td-bar">
        <button type="button" class="icon-btn td-backbtn" data-act="leave" title="All page designs" aria-label="All page designs">${ic('backarrow')}</button>
        <label class="td-namebox"><span class="sr">Design name</span>
          <input id="tdName" class="display" maxlength="60" placeholder="Name this design" autocomplete="off" spellcheck="false"></label>
        <span class="td-state" id="tdState" aria-live="polite"></span>
        <div class="td-bar-tools">
          <button type="button" class="icon-btn" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${ic('undo')}</button>
          <button type="button" class="icon-btn" data-act="redo" title="Redo (Shift+Ctrl+Z)" aria-label="Redo">${ic('redo')}</button>
          <button type="button" class="btn" data-act="save" id="tdSave">Save design</button>
        </div>
      </header>
      <p class="td-msg" id="tdMsg" role="alert" hidden></p>
      <div class="td-work">
        <div class="td-stagecol">
          <div class="td-toolbar" role="toolbar" aria-label="Add and arrange">
            <button type="button" class="td-tool" data-act="add-slot" id="tdAddSlot">${ic('photo')}<span>Photo spot</span></button>
            <div class="td-addtext">
              <button type="button" class="td-tool" data-act="text-menu" id="tdAddText" aria-haspopup="menu" aria-expanded="false">${ic('text')}<span>Text box</span>${ic('chevron', 'td-chev')}</button>
              <div class="td-menu" id="tdMenu" role="menu" hidden>${ROLES.map(([k, l, h]) => `<button type="button" role="menuitem" data-add-text="${k}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>
            </div>
            <span class="td-sep" aria-hidden="true"></span>
            <button type="button" class="td-tool icon" data-act="dup" title="Duplicate (Ctrl+D)" aria-label="Duplicate">${ic('dup')}</button>
            <button type="button" class="td-tool icon" data-act="fwd" title="Bring forward (])" aria-label="Bring forward">${ic('fwd')}</button>
            <button type="button" class="td-tool icon" data-act="bwd" title="Send backward ([)" aria-label="Send backward">${ic('back')}</button>
            <button type="button" class="td-tool icon" data-act="del" title="Delete (Del)" aria-label="Delete">${ic('trash')}</button>
            <span class="td-sep" aria-hidden="true"></span>
            <label class="td-switch" title="The design covers both pages of an open album"><input type="checkbox" id="tdSpread"><span class="td-knob" aria-hidden="true"></span>Two-page design</label>
            <span class="td-counts" id="tdCounts"></span>
          </div>
          <div class="td-well" id="tdWell">
            <div class="td-sheet" id="tdSheet">
              <div class="td-render" id="tdRender"></div>
              <div class="td-gridlines" id="tdGrid" aria-hidden="true"></div>
              <div class="td-fold" aria-hidden="true"></div>
              <div class="td-overlay" id="tdOverlay"></div>
              <div class="td-crops" aria-hidden="true">${['tl', 'tr', 'bl', 'br'].map((c) => `<i class="td-crop ${c} h"></i><i class="td-crop ${c} v"></i>`).join('')}<i class="td-crop fold t"></i><i class="td-crop fold b"></i></div>
            </div>
            <p class="td-wellhint" id="tdWellHint"></p>
          </div>
          <div class="td-foot">
            <div class="td-seg" role="group" aria-label="Album shape">${RATIOS.map(([r, l, d]) => `<button type="button" data-ratio="${r}" title="${l} album" aria-label="${l} album"><svg class="td-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${l}</span></button>`).join('')}</div>
            <span class="td-foot-gap"></span>
            <button type="button" class="td-toggle" data-tog="grid" aria-pressed="true" title="Show the grid">${ic('grid')}<span>Grid</span></button>
            <button type="button" class="td-toggle" data-tog="snap" aria-pressed="true" title="Snap to the grid, the page and other boxes (hold Alt to place freely)">${ic('snap')}<span>Snap</span></button>
            <button type="button" class="td-toggle" data-tog="preview" aria-pressed="false" title="See the page without outlines">${ic('eye')}<span>Preview</span></button>
            <label class="td-occ" title="Preview in the colours of an occasion"><span class="td-occ-dot" id="tdOccDot" aria-hidden="true"></span><span class="sr">Preview colours</span>
              <select id="tdOcc">${Object.keys(C.M.TYPES).map((k) => `<option value="${k}"${k === st.occasion ? ' selected' : ''}>${C.esc(C.typeLabel(k))}</option>`).join('')}</select></label>
          </div>
        </div>
        <aside class="td-inspector" id="tdInspector" aria-label="Properties"></aside>
      </div></div>`;
    wireEditor();
    paintAll();
    requestAnimationFrame(layout);
    if (!key && !isCopy) host.querySelector('#tdName').focus();
  }

  const $ = (s) => host.querySelector(s);
  const sheetRatio = () => st.ratio * (st.doc.spread ? 2 : 1);

  function layout() {
    const well = $('#tdWell'), sheet = $('#tdSheet');
    if (!well || !sheet) return;
    const narrow = matchMedia('(max-width: 900px)').matches;
    const pad = narrow ? 26 : 64;
    const ar = sheetRatio();
    let w, h;
    if (narrow) {
      w = well.clientWidth - pad * 2; h = w / ar;
      const maxH = Math.max(220, innerHeight * 0.55);
      if (h > maxH) { h = maxH; w = h * ar; }
      well.style.height = Math.round(h + pad * 2 + 14) + 'px';
    } else {
      well.style.height = '';
      const W = well.clientWidth - pad * 2, H = well.clientHeight - pad * 2 - 10;
      if (W / H > ar) { h = H; w = H * ar; } else { w = W; h = W / ar; }
    }
    sheet.style.width = Math.max(40, Math.floor(w)) + 'px';
    sheet.style.height = Math.max(30, Math.floor(h)) + 'px';
  }

  function paintAll() { paintCanvas(); paintInspector(); paintChrome(); }

  function draftTpl() {
    const d = st.doc;
    return { key: st.key || 'draft', name: d.name, spread: d.spread, bg: d.bg, slots: d.slots, texts: d.texts };
  }
  function paintCanvas() {
    const sheet = $('#tdSheet');
    if (!sheet) return;
    const d = st.doc;
    sheet.classList.toggle('is-spread', !!d.spread);
    $('#tdRender').innerHTML = renderTpl(draftTpl(), 0, false);
    // grid: a line every 5% of each page
    const cols = GRID * (d.spread ? 2 : 1);
    $('#tdGrid').style.setProperty('--gx', (100 / cols) + '%');
    $('#tdGrid').style.setProperty('--gy', (100 / GRID) + '%');
    paintOverlay();
    const hint = $('#tdWellHint');
    hint.textContent = d.slots.length || d.texts.length ? '' : 'Add a photo spot or a text box to begin.';
  }
  const box = (e) => `left:${e.x * 100}%;top:${e.y * 100}%;width:${e.w * 100}%;height:${e.h * 100}%`;
  function paintOverlay(guides = []) {
    const ov = $('#tdOverlay');
    if (!ov) return;
    const d = st.doc;
    let html = '';
    d.slots.forEach((s, i) => {
      const on = st.sel && st.sel.k === 's' && st.sel.i === i;
      html += `<div class="td-box td-slot${on ? ' is-sel' : ''}${s.r === 'circle' ? ' is-circle' : s.r === 'arch' ? ' is-arch' : ''}" data-k="s" data-i="${i}" style="${box(s)}"><span class="td-tag">${i + 1}</span></div>`;
    });
    d.texts.forEach((t, i) => {
      const on = st.sel && st.sel.k === 't' && st.sel.i === i;
      html += `<div class="td-box td-txt${on ? ' is-sel' : ''}" data-k="t" data-i="${i}" style="${box(t)}"><span class="td-tag">${C.esc(ROLE[t.role] ? ROLE[t.role].label : 'Text')}</span></div>`;
    });
    const e = cur();
    if (e) {
      html += `<div class="td-selframe${st.sel.k === 't' ? ' is-text' : ''}" style="${box(e)}">` +
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => `<i class="td-h ${h}" data-h="${h}"></i>`).join('') +
        `<span class="td-dim">${pctTxt(e.w)} × ${pctTxt(e.h)}</span></div>`;
    }
    guides.forEach((g) => { html += `<i class="td-guide ${g.ax}" style="${g.ax === 'x' ? 'left' : 'top'}:${g.v * 100}%"></i>`; });
    ov.innerHTML = html;
  }

  function paintChrome() {
    if (!active()) return;
    const d = st.doc;
    const name = $('#tdName');
    if (document.activeElement !== name) name.value = d.name;
    const isDirty = snap() !== st.savedJson;
    const state = $('#tdState');
    state.textContent = !st.key ? (isDirty || st.savedJson === null ? 'Not saved yet' : 'New design') : isDirty ? 'Unsaved changes' : 'Saved';
    state.className = 'td-state' + (isDirty ? ' is-dirty' : '');
    $('#tdSave').disabled = !!st.key && !isDirty;
    host.querySelector('[data-act="undo"]').disabled = st.hi <= 0;
    host.querySelector('[data-act="redo"]').disabled = st.hi >= st.hist.length - 1;
    const sel = !!cur();
    ['dup', 'fwd', 'bwd', 'del'].forEach((a) => { host.querySelector(`.td-toolbar [data-act="${a}"]`).disabled = !sel; });
    if (sel) {
      const n = list(st.sel.k).length;
      host.querySelector('.td-toolbar [data-act="fwd"]').disabled = st.sel.i >= n - 1;
      host.querySelector('.td-toolbar [data-act="bwd"]').disabled = st.sel.i <= 0;
      host.querySelector('.td-toolbar [data-act="dup"]').disabled = n >= (st.sel.k === 's' ? SLOT_MAX : TEXT_MAX);
    }
    $('#tdAddSlot').disabled = d.slots.length >= SLOT_MAX;
    $('#tdAddText').disabled = d.texts.length >= TEXT_MAX;
    $('#tdCounts').textContent = `${d.slots.length} of ${SLOT_MAX} photos, ${d.texts.length} of ${TEXT_MAX} texts`;
    $('#tdCounts').title = `Up to ${SLOT_MAX} photo spots and ${TEXT_MAX} text boxes`;
    host.querySelectorAll('[data-ratio]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ratio === st.ratio)));
    $('#tdSpread').checked = !!d.spread;
    const occ = C.M.TYPES[st.occasion] || C.M.TYPES.wedding;
    $('#tdOccDot').style.background = `linear-gradient(135deg, ${occ.silk} 50%, ${occ.accent} 50%)`;
    host.querySelectorAll('[data-tog]').forEach((b) => b.setAttribute('aria-pressed', String(!!st[b.dataset.tog])));
    host.querySelector('.td-ed').classList.toggle('is-preview', st.preview);
    host.querySelector('.td-ed').classList.toggle('no-grid', !st.grid);
    if (st.msg) { $('#tdMsg').hidden = false; $('#tdMsg').textContent = st.msg; } else $('#tdMsg').hidden = true;
  }

  /* ---------- inspector ---------- */
  const seg = (field, opts, value, cls = '') => `<div class="td-seg td-seg-in ${cls}" role="group">${opts.map(([v, l, inner]) =>
    `<button type="button" data-set="${field}" data-v="${v}" aria-pressed="${String(v) === String(value)}" title="${C.esc(l)}">${inner || C.esc(l)}</button>`).join('')}</div>`;
  const num = (f, v, label, { min, max, step = 0.1, unit = '%' } = {}) =>
    `<label class="td-num"><span>${label}</span><input type="number" data-f="${f}" value="${v}" min="${min}" max="${max}" step="${step}" inputmode="decimal"><em>${unit}</em></label>`;
  function geometry(e) {
    return `<div class="td-group"><h4>Position and size</h4>
      <div class="td-nums">${num('x', pctTxt(e.x), 'Left')}${num('y', pctTxt(e.y), 'Top')}${num('w', pctTxt(e.w), 'Width')}${num('h', pctTxt(e.h), 'Height')}</div>
      <p class="td-note">${st.doc.spread ? 'In % of both pages together (width) and of the page height.' : 'In % of the page.'} Arrow keys move it, with Shift in bigger steps.</p></div>`;
  }
  function themeColors() {
    const a = sampleAlbum(), bg = st.doc.bg;
    const dark = bg === 'silk' || bg === 'dark' || (HEX.test(bg) && lum(bg) < 0.45);
    return { ink: dark ? '#F1ECE3' : '#2A2530', accent: a.theme.accent, light: '#FBF7F0', silk: dark ? '#FBF7F0' : a.theme.silk, silkBg: a.theme.silk };
  }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

  function paintInspector() {
    const ins = $('#tdInspector');
    if (!ins) return;
    const e = cur(), d = st.doc;
    let html = '';
    if (e && st.sel.k === 's') {
      const shape = e.r === 'circle' ? 'circle' : e.r === 'arch' ? 'arch' : +e.r > 0 ? 'round' : 'square';
      html += `<div class="td-ins-head"><h3 class="display">Photo ${st.sel.i + 1}</h3><p class="td-note">Studios put photo ${st.sel.i + 1} of the page here.</p></div>
        ${geometry(e)}
        <div class="td-group"><h4>Shape</h4>${seg('shape', SHAPES.map(([v, l]) => [v, l]), shape)}
          ${shape === 'round' ? `<label class="td-range"><span>Corner</span><input type="range" data-f="r" min="1" max="50" step="1" value="${Math.round(+e.r * 100)}"><output>${Math.round(+e.r * 100)}%</output></label>` : ''}</div>
        <div class="td-group"><h4>Frame</h4>${seg('frame', FRAMES, e.frame || 'none')}</div>
        <div class="td-group"><h4>Tilt</h4><label class="td-range"><span class="sr">Tilt in degrees</span><input type="range" data-f="rot" min="-45" max="45" step="0.5" value="${+e.rot || 0}"><output>${+e.rot || 0}°</output>
          <button type="button" class="td-mini" data-set="rot0" title="Straighten" aria-label="Straighten">${ic('reset')}</button></label></div>`;
    } else if (e) {
      const c = themeColors();
      const custom = HEX.test(e.color || '');
      html += `<div class="td-ins-head"><h3 class="display">${C.esc(ROLE[e.role].label)}</h3><p class="td-note">Text box ${st.sel.i + 1} of ${d.texts.length}</p></div>
        <div class="td-group"><label class="field td-field"><span>What it shows</span><select data-f="role">${ROLES.map(([k, l]) => `<option value="${k}"${k === e.role ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="td-note">${ROLE[e.role].hint}</p>
          <label class="field td-field"><span>${AUTO_ROLES.includes(e.role) ? 'Words to use when an album has none' : 'Sample words'}</span><input data-f="text" maxlength="200" value="${C.esc(e.text || '')}" placeholder="${AUTO_ROLES.includes(e.role) ? 'Filled in from the album' : 'Type the words'}"></label></div>
        <div class="td-group"><h4>Lettering</h4>
          ${seg('font', [['display', 'Rozha One, a decorative serif', '<span class="td-font-d">Rozha</span>'], ['ui', 'Mukta, a simple sans-serif', '<span class="td-font-u">Mukta</span>']], e.font === 'ui' ? 'ui' : 'display', 'td-fonts')}
          <label class="td-range"><span>Size</span><input type="range" data-f="size" min="1" max="30" step="0.1" value="${e.size}"><output>${e.size}</output></label>
          <div class="td-row">${seg('align', [['left', 'Align left', ic('left')], ['center', 'Centre', ic('center')], ['right', 'Align right', ic('right')]], e.align || 'center', 'td-icons')}
            <label class="td-weight"><span class="sr">Weight</span><select data-f="weight">${WEIGHTS.map(([v, l]) => `<option value="${v}"${String(e.weight || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <p class="td-note">Size is in % of the page height, so the words keep their place on every album shape.</p></div>
        <div class="td-group"><h4>Colour</h4><div class="td-swatches">${COLORS.map(([k, l]) =>
          `<button type="button" class="td-sw" data-set="color" data-v="${k}" aria-pressed="${e.color === k}" title="${l}" aria-label="${l}" style="--sw:${c[k]}"></button>`).join('')}
          <label class="td-sw td-sw-custom" title="Choose any colour" aria-pressed="${custom}" style="--sw:${custom ? e.color : 'transparent'}"><input type="color" data-f="color" value="${custom ? e.color : '#8a4b2a'}" aria-label="Choose any colour"></label></div>
          <p class="td-note">${custom ? 'Your own colour, the same in every album.' : C.esc(COLORS.find(([k]) => k === e.color)[1]) + (['accent', 'silk'].includes(e.color) ? ': changes with each album’s occasion.' : '.')}</p></div>
        ${geometry(e)}`;
    } else {
      const c = themeColors();
      const custom = HEX.test(d.bg);
      const { warnings } = check();
      html += `<div class="td-ins-head"><h3 class="display">The page</h3><p class="td-note">Click a photo spot or text box to change it.</p></div>
        <div class="td-group"><h4>Background</h4><div class="td-swatches">${BGS.map(([k, l, hex]) =>
          `<button type="button" class="td-sw" data-set="bg" data-v="${k}" aria-pressed="${d.bg === k}" title="${l}" aria-label="${l}" style="--sw:${hex || c.silkBg}"></button>`).join('')}
          <label class="td-sw td-sw-custom" title="Choose any colour" aria-pressed="${custom}" style="--sw:${custom ? d.bg : 'transparent'}"><input type="color" data-f="bg" value="${custom ? d.bg : '#e9dcc9'}" aria-label="Choose any background colour"></label></div>
          <p class="td-note">${custom ? 'Your own colour.' : C.esc(BGS.find(([k]) => k === d.bg)[1]) + '.'}</p></div>
        <div class="td-group"><h4>Occasions</h4><div class="td-chips">${Object.keys(C.M.TYPES).map((k) =>
          `<button type="button" class="td-chip" data-occ="${k}" aria-pressed="${d.occasions.includes(k)}">${C.esc(C.typeLabel(k))}</button>`).join('')}</div>
          <p class="td-note">${d.occasions.length ? 'Suggested first for these occasions.' : 'None picked: suggested for every occasion.'}</p></div>
        <div class="td-group"><h4>Use</h4>
          <label class="td-check${d.texts.length ? ' is-off' : ''}"><input type="checkbox" data-f="auto"${d.auto && !d.texts.length ? ' checked' : ''}${d.texts.length ? ' disabled' : ''}>
            <span>Use in automatic layouts<small>${d.texts.length ? 'Only designs without text boxes can be picked automatically.' : 'When a studio lays out an album automatically, this design can be picked for pages with ' + plural(d.slots.length || 1, 'photo', 'photos') + '.'}</small></span></label>
          <label class="td-check"><input type="checkbox" data-f="live"${d.live ? ' checked' : ''}>
            <span>Offer to studios<small>${d.live ? 'Studios see it in their page editor once it is saved.' : 'Kept hidden: only you can see it.'}</small></span></label></div>
        ${warnings.length ? `<div class="td-group td-warn"><h4>Worth a look</h4><ul>${warnings.map((w) => `<li><button type="button" class="link" data-goto="${w.sel.k}${w.sel.i}">${C.esc(w.msg)}</button></li>`).join('')}</ul></div>` : ''}`;
    }
    html += layersHtml();
    ins.innerHTML = html;
    // a new selection starts at the top of the panel
    const forKey = st.sel ? st.sel.k + st.sel.i : 'page';
    if (ins.dataset.for !== forKey) { ins.dataset.for = forKey; ins.scrollTop = 0; }
  }
  function layersHtml() {
    const d = st.doc;
    const rows = [];
    for (let i = d.texts.length - 1; i >= 0; i--) rows.push({ k: 't', i, label: ROLE[d.texts[i].role].label, sub: d.texts[i].text || (AUTO_ROLES.includes(d.texts[i].role) ? 'From the album' : '') });
    for (let i = d.slots.length - 1; i >= 0; i--) rows.push({ k: 's', i, label: 'Photo ' + (i + 1), sub: d.slots[i].frame && d.slots[i].frame !== 'none' ? FRAMES.find(([f]) => f === d.slots[i].frame)[1] : '' });
    if (!rows.length) return '';
    return `<div class="td-group td-layers"><h4>On this page <small>top to bottom</small></h4><ol>${rows.map((r) =>
      `<li><button type="button" data-pick="${r.k}${r.i}" aria-pressed="${!!(st.sel && st.sel.k === r.k && st.sel.i === r.i)}">${ic(r.k === 's' ? 'photo' : 'text')}<span>${C.esc(r.label)}</span>${r.sub ? `<small>${C.esc(r.sub)}</small>` : ''}</button></li>`).join('')}</ol></div>`;
  }
  // keep the numbers in step while dragging, without rebuilding the panel
  function syncNumbers() {
    const e = cur();
    if (!e) return;
    ['x', 'y', 'w', 'h'].forEach((f) => { const inp = host.querySelector(`#tdInspector [data-f="${f}"]`); if (inp && document.activeElement !== inp) inp.value = pctTxt(e[f]); });
  }

  /* ======================================================================
     Editor: changes
     ====================================================================== */
  function bounds(k, e) {
    if (k === 's') {
      e.w = clamp(e.w, MIN, 1.4); e.h = clamp(e.h, MIN, 1.4);
      e.x = clamp(e.x, -0.2, 1.2 - e.w); e.y = clamp(e.y, -0.2, 1.2 - e.h);
    } else {
      e.w = clamp(e.w, MIN, 1); e.h = clamp(e.h, MIN, 1);
      e.x = clamp(e.x, 0, 1 - e.w); e.y = clamp(e.y, 0, 1 - e.h);
    }
    return e;
  }
  function select(sel) {
    st.sel = sel && elOf(sel) ? sel : null;
    st.msg = '';
    paintOverlay(); paintInspector(); paintChrome();
  }
  function changed() { paintCanvas(); paintChrome(); }

  // a new box lands in the middle of the page (the left page of a two-page design), moved along if that spot is taken
  function place(e) {
    const span = st.doc.spread ? 0.5 : 1;
    e.x = (span - e.w) / 2; e.y = (1 - e.h) / 2;
    const all = [...st.doc.slots, ...st.doc.texts];
    for (let n = 0; n < 12 && all.some((o) => Math.abs(o.x - e.x) < 0.005 && Math.abs(o.y - e.y) < 0.005); n++) { e.x += 0.03; e.y += 0.03; }
    return e;
  }
  function addSlot() {
    if (st.doc.slots.length >= SLOT_MAX) return C.toast(`A design can have at most ${SLOT_MAX} photo spots.`);
    const half = st.doc.spread ? 0.5 : 1;
    const s = place(bounds('s', { x: 0, y: 0, w: 0.36 * half, h: 0.5 }));
    st.doc.slots.push(s);
    st.sel = { k: 's', i: st.doc.slots.length - 1 };
    commit(); paintAll();
  }
  function addText(role) {
    if (st.doc.texts.length >= TEXT_MAX) return C.toast(`A design can have at most ${TEXT_MAX} text boxes.`);
    const def = Object.assign({ align: 'center' }, TEXT_DEFAULTS[role]);
    const half = st.doc.spread ? 0.5 : 1;
    const t = place(bounds('t', { x: 0, y: 0, w: def.w * half, h: def.h, role, font: def.font, size: def.size, align: def.align, color: def.color }));
    if (def.text) t.text = def.text;
    st.doc.texts.push(t);
    st.sel = { k: 't', i: st.doc.texts.length - 1 };
    commit(); paintAll();
  }
  function duplicate() {
    const e = cur();
    if (!e) return;
    const arr = list(st.sel.k);
    if (arr.length >= (st.sel.k === 's' ? SLOT_MAX : TEXT_MAX)) return C.toast('There is no room for another one on this design.');
    const copy = bounds(st.sel.k, Object.assign({}, e, { x: e.x + 0.03, y: e.y + 0.03 }));
    arr.push(copy);
    st.sel = { k: st.sel.k, i: arr.length - 1 };
    commit(); paintAll();
  }
  function remove() {
    if (!cur()) return;
    list(st.sel.k).splice(st.sel.i, 1);
    st.sel = null;
    commit(); paintAll();
  }
  function restack(dir) {
    const e = cur();
    if (!e) return;
    const arr = list(st.sel.k), j = st.sel.i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[st.sel.i], arr[j]] = [arr[j], arr[st.sel.i]];
    st.sel.i = j;
    commit(); paintAll();
    C.toast(st.sel.k === 's' ? `Now photo ${j + 1}` : dir > 0 ? 'Brought forward' : 'Sent backward');
  }
  // one page <-> two pages: keep what is drawn the same size on the (left) page
  function setSpread(on) {
    const d = st.doc;
    if (!!d.spread === on) return;
    const f = on ? 0.5 : 2;
    const move = (k) => (e) => { e.x *= f; e.w *= f; bounds(k, e); };
    d.slots.forEach(move('s')); d.texts.forEach(move('t'));
    d.spread = on;
    commit(); paintAll(); layout();
  }
  let nudgeT = 0;
  function nudge(dx, dy) {
    const e = cur();
    if (!e) return;
    e.x += dx; e.y += dy;
    bounds(st.sel.k, e);
    changed(); syncNumbers();
    clearTimeout(nudgeT); nudgeT = setTimeout(commit, 450);
  }

  /* ---------- wiring ---------- */
  function wireEditor() {
    const name = $('#tdName');
    name.addEventListener('input', () => { st.doc.name = name.value; st.msg = ''; paintChrome(); });
    name.addEventListener('change', commit);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    host.querySelector('.td-ed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const menu = $('#tdMenu');
      if (!e.target.closest('.td-addtext') && !menu.hidden) toggleMenu(false);
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'leave') return leave();
      if (a === 'undo') return travel(-1);
      if (a === 'redo') return travel(1);
      if (a === 'save') return save();
      if (a === 'add-slot') return addSlot();
      if (a === 'text-menu') return toggleMenu(menu.hidden);
      if (a === 'dup') return duplicate();
      if (a === 'fwd') return restack(1);
      if (a === 'bwd') return restack(-1);
      if (a === 'del') return remove();
    });
    $('#tdMenu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-add-text]');
      if (b) { toggleMenu(false); addText(b.dataset.addText); }
    });
    host.querySelector('.td-foot').addEventListener('click', (e) => {
      const r = e.target.closest('[data-ratio]');
      if (r) { st.ratio = +r.dataset.ratio; paintChrome(); layout(); return; }
      const t = e.target.closest('[data-tog]');
      if (t) { st[t.dataset.tog] = !st[t.dataset.tog]; if (t.dataset.tog === 'preview' && st.preview) st.sel = null; paintAll(); }
    });
    $('#tdSpread').addEventListener('change', (e) => setSpread(e.target.checked));
    $('#tdOcc').addEventListener('change', (e) => { st.occasion = e.target.value; paintCanvas(); paintInspector(); paintChrome(); });

    // inspector
    const ins = $('#tdInspector');
    ins.addEventListener('input', (ev) => {
      const f = ev.target.dataset.f;
      if (!f) return;
      applyField(f, ev.target, false);
    });
    ins.addEventListener('change', (ev) => {
      const f = ev.target.dataset.f;
      if (!f) return;
      applyField(f, ev.target, true);
    });
    ins.addEventListener('click', (ev) => {
      const pick = ev.target.closest('[data-pick],[data-goto]');
      if (pick) { const v = pick.dataset.pick || pick.dataset.goto; return select({ k: v[0], i: +v.slice(1) }); }
      const occ = ev.target.closest('[data-occ]');
      if (occ) {
        const o = occ.dataset.occ, list2 = st.doc.occasions;
        st.doc.occasions = list2.includes(o) ? list2.filter((x) => x !== o) : [...list2, o];
        commit(); paintInspector(); return;
      }
      const b = ev.target.closest('[data-set]');
      if (!b) return;
      const e = cur(), v = b.dataset.v;
      switch (b.dataset.set) {
        case 'bg': st.doc.bg = v; break;
        case 'shape': e.r = v === 'circle' || v === 'arch' ? v : v === 'round' ? 0.06 : 0; break;
        case 'frame': if (v === 'none') delete e.frame; else e.frame = v; break;
        case 'rot0': e.rot = 0; break;
        case 'font': e.font = v; break;
        case 'align': e.align = v; break;
        case 'color': e.color = v; break;
        default: return;
      }
      commit(); paintCanvas(); paintInspector();
    });

    // canvas: select, move, resize
    const ov = $('#tdOverlay');
    ov.addEventListener('pointerdown', onPointerDown);
    ov.addEventListener('dblclick', (e) => {
      const b = e.target.closest('.td-txt');
      if (!b) return;
      const inp = host.querySelector('#tdInspector [data-f="text"]');
      if (inp) { inp.focus(); inp.select(); }
    });
    const well = $('#tdWell');
    well.addEventListener('pointerdown', (e) => { if (e.target === well || e.target.classList.contains('td-wellhint')) select(null); });
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (active()) layout(); else ro.disconnect(); }); ro.observe(well.parentElement); }
  }
  function toggleMenu(open) {
    $('#tdMenu').hidden = !open;
    $('#tdAddText').setAttribute('aria-expanded', String(open));
    if (open) $('#tdMenu button').focus();
  }

  function applyField(f, el, final) {
    const e = cur(), d = st.doc;
    const v = el.value;
    if (f === 'auto') { d.auto = el.checked; commit(); paintInspector(); return; }
    if (f === 'live') { d.live = el.checked; commit(); paintInspector(); return; }
    if (f === 'bg') { d.bg = v.toLowerCase(); paintCanvas(); if (final) { commit(); paintInspector(); } return; }
    if (!e) return;
    if (['x', 'y', 'w', 'h'].includes(f)) {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return;
      e[f] = n / 100;
      if (final) { bounds(st.sel.k, e); el.value = pctTxt(e[f]); commit(); }
      changed(); return;
    }
    if (f === 'r') { e.r = clamp(+v / 100, 0.01, 0.5); el.nextElementSibling.textContent = v + '%'; }
    else if (f === 'rot') { e.rot = clamp(+v, -45, 45); el.nextElementSibling.textContent = e.rot + '°'; }
    else if (f === 'size') { e.size = clamp(+v, 1, 30); el.nextElementSibling.textContent = e.size; }
    else if (f === 'text') e.text = v;
    else if (f === 'role') {
      e.role = v;
      if (!final) return;
      const def = TEXT_DEFAULTS[v];
      if (!e.text && def.text) e.text = def.text;
    } else if (f === 'weight') { if (v) e.weight = +v; else delete e.weight; }
    else if (f === 'color') { e.color = v.toLowerCase(); }
    paintCanvas();
    if (final) {
      commit();
      if (['role', 'color', 'size'].includes(f)) paintInspector();
    } else paintChrome();
  }

  /* ---------- pointer: move and resize with snapping ---------- */
  let drag = null;
  function onPointerDown(ev) {
    if (ev.button !== 0 || st.preview) return;
    const ov = $('#tdOverlay');
    const handle = ev.target.closest('[data-h]');
    const b = ev.target.closest('.td-box');
    if (!handle && !b) { select(null); return; }
    const rect = $('#tdSheet').getBoundingClientRect();
    let later = null;
    if (b && !handle) {
      // a press inside the current selection drags the selection, even where another box lies on top of it;
      // a click without a drag then selects the box on top
      const sel = { k: b.dataset.k, i: +b.dataset.i }, s = cur();
      const fx = (ev.clientX - rect.left) / rect.width, fy = (ev.clientY - rect.top) / rect.height;
      const same = st.sel && st.sel.k === sel.k && st.sel.i === sel.i;
      if (!same && s && fx >= s.x && fx <= s.x + s.w && fy >= s.y && fy <= s.y + s.h) later = sel;
      else if (!same) select(sel);
    }
    const e = cur();
    if (!e) return;
    ev.preventDefault();
    drag = { mode: handle ? handle.dataset.h : 'move', x0: ev.clientX, y0: ev.clientY, start: Object.assign({}, e), W: rect.width, H: rect.height, moved: false, id: ev.pointerId, later };
    ov.setPointerCapture(ev.pointerId);
    ov.addEventListener('pointermove', onPointerMove);
    ov.addEventListener('pointerup', onPointerUp);
    ov.addEventListener('pointercancel', onPointerUp);
  }
  function targets() {
    const d = st.doc;
    const xs = d.spread ? [0, 0.25, 0.5, 0.75, 1, PAGE_M / 2, 0.5 - PAGE_M / 2, 0.5 + PAGE_M / 2, 1 - PAGE_M / 2] : [0, 0.5, 1, PAGE_M, 1 - PAGE_M];
    const ys = [0, 0.5, 1, PAGE_M, 1 - PAGE_M];
    const add = (k) => (o, i) => {
      if (st.sel.k === k && st.sel.i === i) return;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    };
    d.slots.forEach(add('s')); d.texts.forEach(add('t'));
    return { xs, ys };
  }
  // the best snap for a set of moving positions: { d: shift to apply, at: line } or null
  function snapAxis(vals, lines, step, thr) {
    let best = null;
    for (const v of vals) for (const t of lines) { const dd = t - v; if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, at: t }; }
    if (best || !st.grid) return best;
    for (const v of vals) { const t = Math.round(v / step) * step; const dd = t - v; if (Math.abs(dd) <= thr && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, at: t, grid: true }; }
    return best;
  }
  function onPointerMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    let dx = (ev.clientX - drag.x0) / drag.W, dy = (ev.clientY - drag.y0) / drag.H;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 3) return;
    drag.moved = true;
    const e = cur(), s = drag.start, k = st.sel.k;
    const useSnap = st.snap && !ev.altKey;
    const thrX = SNAP_PX / drag.W, thrY = SNAP_PX / drag.H;
    const stepX = 1 / (GRID * (st.doc.spread ? 2 : 1)), stepY = 1 / GRID;
    const T = useSnap ? targets() : null;
    const guides = [];
    if (drag.mode === 'move') {
      if (ev.shiftKey) { if (Math.abs(dx) * drag.W > Math.abs(dy) * drag.H) dy = 0; else dx = 0; }
      e.x = s.x + dx; e.y = s.y + dy;
      bounds(k, e);
      if (useSnap) {
        const sx = ev.shiftKey && dx === 0 ? null : snapAxis([e.x, e.x + e.w / 2, e.x + e.w], T.xs, stepX, thrX);
        const sy = ev.shiftKey && dy === 0 ? null : snapAxis([e.y, e.y + e.h / 2, e.y + e.h], T.ys, stepY, thrY);
        if (sx) { e.x += sx.d; if (!sx.grid) guides.push({ ax: 'x', v: sx.at }); }
        if (sy) { e.y += sy.d; if (!sy.grid) guides.push({ ax: 'y', v: sy.at }); }
        bounds(k, e);
      }
    } else {
      const h = drag.mode;
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      if (h.includes('w')) x1 = s.x + dx;
      if (h.includes('e')) x2 = s.x + s.w + dx;
      if (h.includes('n')) y1 = s.y + dy;
      if (h.includes('s')) y2 = s.y + s.h + dy;
      const corner = h.length === 2;
      if (corner && ev.shiftKey) {
        // keep the shape: scale from the opposite corner
        let nw = Math.max(MIN, x2 - x1), nh = Math.max(MIN, y2 - y1);
        const f = Math.abs(nw / s.w - 1) > Math.abs(nh / s.h - 1) ? nw / s.w : nh / s.h;
        nw = s.w * f; nh = s.h * f;
        if (h.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
        if (h.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
      } else if (useSnap) {
        if (h.includes('w')) { const r = snapAxis([x1], T.xs, stepX, thrX); if (r) { x1 += r.d; if (!r.grid) guides.push({ ax: 'x', v: r.at }); } }
        if (h.includes('e')) { const r = snapAxis([x2], T.xs, stepX, thrX); if (r) { x2 += r.d; if (!r.grid) guides.push({ ax: 'x', v: r.at }); } }
        if (h.includes('n')) { const r = snapAxis([y1], T.ys, stepY, thrY); if (r) { y1 += r.d; if (!r.grid) guides.push({ ax: 'y', v: r.at }); } }
        if (h.includes('s')) { const r = snapAxis([y2], T.ys, stepY, thrY); if (r) { y2 += r.d; if (!r.grid) guides.push({ ax: 'y', v: r.at }); } }
      }
      // never turn inside out
      if (x2 - x1 < MIN) { if (h.includes('w')) x1 = x2 - MIN; else x2 = x1 + MIN; }
      if (y2 - y1 < MIN) { if (h.includes('n')) y1 = y2 - MIN; else y2 = y1 + MIN; }
      const lo = k === 's' ? -0.2 : 0, hi = k === 's' ? 1.2 : 1;
      x1 = Math.max(lo, x1); y1 = Math.max(lo, y1); x2 = Math.min(hi, x2); y2 = Math.min(hi, y2);
      Object.assign(e, { x: x1, y: y1, w: Math.max(MIN, x2 - x1), h: Math.max(MIN, y2 - y1) });
    }
    $('#tdRender').innerHTML = renderTpl(draftTpl(), 0, false);
    paintOverlay(guides);
    syncNumbers();
  }
  function onPointerUp(ev) {
    const ov = $('#tdOverlay');
    if (ov) {
      ov.removeEventListener('pointermove', onPointerMove);
      ov.removeEventListener('pointerup', onPointerUp);
      ov.removeEventListener('pointercancel', onPointerUp);
      try { ov.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ }
    }
    const moved = drag && drag.moved, later = drag && drag.later;
    drag = null;
    if (!active()) return;
    if (moved) { commit(); paintOverlay(); paintInspector(); } else if (later) select(later);
  }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (!active()) return;
    const mod = e.ctrlKey || e.metaKey;
    const field = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    const typing = field && !(field.tagName === 'INPUT' && ['checkbox', 'radio', 'range', 'color', 'button'].includes(field.type));
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (field && (/^Arrow|^Page|^Home|^End| /.test(e.key) || e.key === ' ')) return;   // a slider or tick box keeps its own keys
    if (document.body.classList.contains('modal-open')) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey ? 1 : -1); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); travel(1); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Escape') { if (!$('#tdMenu').hidden) toggleMenu(false); else select(null); return; }
    if (!cur()) return;
    const step = e.shiftKey ? 0.05 : 0.005;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); nudge(...moves[e.key]); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    if (e.key === ']') { restack(1); return; }
    if (e.key === '[') { restack(-1); }
  }

  /* ---------- save, leave ---------- */
  function leave() {
    if (!mayLeave()) return;
    showLibrary();
  }
  let saving = false;
  async function save() {
    if (saving || !active()) return;
    const { errors } = check();
    if (errors.length) {
      st.msg = errors.map((x) => x.msg).join(' ');
      paintChrome();
      if (errors[0].focus === 'name') $('#tdName').focus();
      return;
    }
    st.msg = '';
    const body = payload();
    const btn = $('#tdSave');
    saving = true; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      let res;
      if (st.key) res = await C.api('master/page-templates/' + encodeURIComponent(st.key), { method: 'PUT', body: Object.assign(body, { hidden: !st.doc.live }) });
      else {
        res = await C.api('master/page-templates', { method: 'POST', body });
        if (!st.doc.live) res = await C.api('master/page-templates/' + encodeURIComponent(res.template.key), { method: 'PUT', body: { hidden: true } });
      }
      const t = res.template;
      C.PT.define(t);
      const was = st.list.findIndex((x) => x.key === t.key);
      if (was >= 0) st.list[was] = t; else st.list.unshift(t);
      st.key = t.key;
      st.savedJson = snap();
      C.toast(t.hidden ? `Saved “${t.name}”, hidden from studios` : `Saved “${t.name}”. Studios can use it now.`);
    } catch (err) {
      st.msg = 'Not saved: ' + err.message;
    } finally {
      saving = false;
      if (active()) { btn.textContent = 'Save design'; paintChrome(); }
    }
  }

  window.TemplateDesigner = { mount };
})();
