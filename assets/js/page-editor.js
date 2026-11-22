/* The page editor: album pages made from the album's photos with the page designs in page-templates.js.

   Studio owners either let the editor lay out every photo ("Create pages from my photos") or build pages one by one:
   pick a design, drag photos onto its spots, crop them (crop.js), add words, choose a background and reorder pages.
   Saved as albums.composed through PUT /api/admin/albums/:id/pages (format: lib/pages.js cleanComposed).

   PageEditor.mount(host, ctx)  ctx = { api, toast, esc, M, CT, PT, ratioOf, album, ... } (see admin.js editorContext) */
(function () {
  'use strict';

  const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <symbol id="pe-undo" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></symbol>
    <symbol id="pe-shuffle" viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></symbol>
    <symbol id="pe-left" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></symbol>
    <symbol id="pe-right" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>
    <symbol id="pe-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></symbol>
    <symbol id="pe-crop" viewBox="0 0 24 24"><path d="M6 2v14a2 2 0 002 2h14"/><path d="M18 22V8a2 2 0 00-2-2H2"/></symbol>
    <symbol id="pe-out" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></symbol>
  </defs></svg>`;
  const ROLE_LABEL = { names: 'Names', date: 'Date', place: 'Place', title: 'Title', section: 'Section name', caption: 'Words', free: 'Words' };
  const BGS = [['paper', 'Paper'], ['white', 'White'], ['silk', 'Silk'], ['dark', 'Dark']];
  const DENSITIES = [['fewer', 'Fewer', 'Bigger photos, one to three on a page'], ['balanced', 'Balanced', 'A mix of one to four'], ['more', 'More', 'Up to six on a page']];
  const GEN_NAME = { title: 'Welcome page', divider: 'Section page', closing: 'Thank-you page' };

  function mount(host, ctx) {
    if (host._peCleanup) host._peCleanup();
    const { api, toast, esc, M, CT, PT, album } = ctx;
    const id = album.id, q = encodeURIComponent(id);
    const ratio = ctx.ratioOf(album) || 1.5;
    const media = album.media || { photos: [], pages: [] };
    const photos = media.photos || [], designed = media.pages || [];
    const all = [...photos, ...designed];
    const byId = new Map(all.map((m) => [m.id, m]));
    const view = Object.assign({}, album, { theme: M.theme(album), design: album.designView || {} });
    const choices = pageChoices(album);
    const sectionsOf = [...new Set(photos.map((p) => p.section || ''))];
    const hasSections = sectionsOf.length > 1 || (sectionsOf.length === 1 && sectionsOf[0] !== '');

    const S = {
      mode: 'loading', pages: null, saved: false, dirty: false, manual: false, sel: 0, spot: -1, filter: 'all',
      undo: [], density: 'balanced', opts: { welcome: choices.welcome, sections: choices.sections && hasSections, thanks: choices.thanks },
      seed: 1 + Math.floor(Math.random() * 99999), saving: false, justSaved: false, drag: null, suppressClick: false,
    };

    /* ---------- helpers ---------- */
    const tplOf = (pg) => (pg && !pg.gen ? PT.get(pg.t) || PT.get('full-mat') : null);
    const isTwo = (pg) => !!(pg && !pg.gen && (tplOf(pg) || {}).spread);
    const cur = () => (S.pages || [])[S.sel];
    const phOf = (mid) => { const m = mid && byId.get(mid); return m ? { src: m.url, thumb: m.thumb || m.url, zoom: m.full || m.url, w: m.width, h: m.height } : null; };
    const photosFor = (pg) => (pg.p || []).map((x) => phOf(x && x.m));
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const ptRender = (pg, opts) => PT.render(pg, opts);
    function pageHtml(pg, { small = false, editable = false, tpl } = {}) {
      if (pg.gen) return CT.render(pg.gen, view, { ratio, text: pg.text, placeholders: true });
      return ptRender(pg, { album: view, photos: photosFor(pg), small, editable, tpl });
    }
    function fitSlots(pg) {
      if (!PT.get(pg.t)) return pg;   // a design that no longer exists: keep the photos as they are
      const n = PT.get(pg.t).slots.length;
      pg.p = (pg.p || []).slice(0, n);
      while (pg.p.length < n) pg.p.push({ m: null });
      return pg;
    }
    function markSpread(pg) {
      if (pg.t) { fitSlots(pg); if ((PT.get(pg.t) || {}).spread) pg.s = 1; else delete pg.s; }
      return pg;
    }
    function usedCounts() {
      const n = new Map();
      (S.pages || []).forEach((pg) => (pg.p || []).forEach((x) => { if (x && x.m) n.set(x.m, (n.get(x.m) || 0) + 1); }));
      return n;
    }
    // the section a page belongs to: the nearest section page before it, else its first photo's section
    function sectionFor(i) {
      for (let k = i; k >= 0; k--) { const pg = S.pages[k]; if (pg.gen === 'divider') return pg.text || ''; }
      const pg = S.pages[i]; const m = pg && (pg.p || []).map((x) => x.m && byId.get(x.m)).find(Boolean);
      return (m && m.section) || '';
    }
    const autoValue = (t) => PT.autoText(t.role, view) || t.text || '';

    // The book as guests see it: cover alone on the right, then pairs; two-page designs open on a left page.
    // Same rules as lib/layout.js composedPages().
    function book() {
      const leaves = [{ kind: 'cover' }];
      if (choices.endpapers) leaves.push({ kind: 'inside-front' });
      let n = leaves.length;
      (S.pages || []).forEach((pg, i) => {
        const two = isTwo(pg);
        if (two && n % 2 === 0) { leaves.push({ kind: 'filler' }); n++; }
        leaves.push({ kind: 'page', i, two }); n += two ? 2 : 1;
      });
      const tail = choices.endpapers ? 2 : 1;
      if ((n + tail) % 2 === 1) { leaves.push({ kind: 'filler' }); n++; }
      if (choices.endpapers) leaves.push({ kind: 'inside-back' });
      leaves.push({ kind: 'back' });
      let at = 0;
      leaves.forEach((l) => { l.at = at; at += l.two ? 2 : 1; });
      const groups = [[leaves[0]]];
      let g = null;
      leaves.slice(1).forEach((l) => { if (l.at % 2 === 1) { g = [l]; groups.push(g); } else g.push(l); });
      return { leaves, groups };
    }
    const ctxSvg = {};
    function contextSvg(kind) {
      if (ctxSvg[kind]) return ctxSvg[kind];
      if (kind === 'filler' && !choices.endpapers) return (ctxSvg[kind] = '<span class="pe-blank"></span>');
      const k = kind === 'filler' ? 'inside-front' : kind;
      const photo = (media.cover) || (photos[0] && photos[0].url) || '';
      try { ctxSvg[kind] = CT.render(k, view, { ratio, placeholders: true, photo }); } catch (e) { ctxSvg[kind] = '<span class="pe-blank"></span>'; }
      return ctxSvg[kind];
    }
    const CONTEXT_NAME = { cover: 'Front cover', 'inside-front': 'Endpaper', 'inside-back': 'Endpaper', filler: 'Blank page', back: 'Back cover' };

    /* ---------- editing with undo ---------- */
    function snapshot() { S.undo.push(JSON.stringify({ pages: S.pages, sel: S.sel })); if (S.undo.length > 80) S.undo.shift(); }
    function edit(fn, { manual = true } = {}) {
      snapshot();
      fn();
      S.dirty = true; S.justSaved = false;
      if (manual) S.manual = true;
      clampSel();
      paint();
    }
    function undo() {
      const last = S.undo.pop();
      if (!last) return;
      const o = JSON.parse(last);
      S.pages = o.pages; S.sel = o.sel; S.spot = -1; S.dirty = true; S.justSaved = false;
      clampSel(); paint();
      toast('Undone');
    }
    function clampSel() {
      const n = (S.pages || []).length;
      if (S.sel >= n) S.sel = n - 1;
      if (S.sel < 0) S.sel = 0;
      const pg = cur();
      if (!pg || pg.gen || S.spot >= (pg.p || []).length) S.spot = -1;
    }

    /* ---------- actions ---------- */
    function select(i, { focus } = {}) {
      if (!S.pages || i < 0 || i >= S.pages.length) return;
      S.sel = i; S.spot = -1;
      paint();
      if (focus) { const b = host.querySelector(`.pe-leaf[data-i="${i}"]`); if (b) b.focus(); }
    }
    // flow: placed by clicking; the next empty spot is then selected, so the next photo click fills it
    function place(mid, slot, { flow = false } = {}) {
      const pg = cur();
      if (!pg || pg.gen) return;
      edit(() => {
        fitSlots(pg);
        pg.p[slot] = { m: mid };
        const next = pg.p.findIndex((x, k) => k > slot && !x.m);
        S.spot = flow ? next : slot;
      });
    }
    function swap(a, b) {
      const pg = cur();
      if (!pg || a === b) return;
      edit(() => { fitSlots(pg); const t = pg.p[a]; pg.p[a] = pg.p[b]; pg.p[b] = t; S.spot = b; });
    }
    function removePhoto(slot) {
      const pg = cur();
      if (!pg || pg.gen || !pg.p[slot] || !pg.p[slot].m) return;
      edit(() => { pg.p[slot] = { m: null }; });
    }
    async function adjust(slot) {
      const pg = cur();
      const x = pg && pg.p && pg.p[slot];
      const m = x && x.m && byId.get(x.m);
      if (!m) return;
      const tpl = tplOf(pg), s = tpl.slots[slot];
      const aspect = PT.slotAR(s, ratio, tpl.spread);   // already the photo area inside a polaroid frame
      const shape = s.r === 'circle' ? 'circle' : s.r === 'arch' ? 'arch' : 'rect';
      const c = await window.Crop.open({ src: m.full || m.url, aspect, crop: x.c, shape, title: 'Adjust the photo' });
      if (!c) return;
      edit(() => { pg.p[slot] = c[0] === 0.5 && c[1] === 0.5 && c[2] === 1 ? { m: x.m } : { m: x.m, c }; S.spot = slot; });
      const el = host.querySelector(`.pe-page .pt-slot[data-slot="${slot}"]`);
      if (el) el.focus();
    }
    function setDesign(key) {
      const pg = cur();
      const tpl = PT.get(key);
      if (!pg || pg.gen || !tpl || pg.t === key) return;
      edit(() => {
        // photos keep their order and their crop (the focus point and zoom still frame the same subject)
        const old = (pg.p || []).filter((x) => x && x.m);
        const n = tpl.slots.length;
        pg.p = old.slice(0, n).map((x) => (x.c ? { m: x.m, c: x.c } : { m: x.m }));
        pg.t = key;
        delete pg.tx;
        const sec = (tpl.texts || []).findIndex((t) => t.role === 'section');
        if (sec >= 0) { const name = sectionFor(S.sel); if (name) { pg.tx = []; pg.tx[sec] = name; } }
        markSpread(pg);
        S.spot = -1;
        if (old.length > n) toast(plural(old.length - n, 'photo went', 'photos went') + ' back to the photo tray');
      });
    }
    function setBg(bg) {
      const pg = cur();
      if (!pg || pg.gen) return;
      const def = (tplOf(pg) || {}).bg || 'paper';
      edit(() => { if (bg === def) delete pg.bg; else pg.bg = bg; });
    }
    function movePage(from, to) {
      if (to < 0 || to >= S.pages.length || from === to) return;
      edit(() => { const [pg] = S.pages.splice(from, 1); S.pages.splice(to, 0, pg); S.sel = to; });
    }
    function newPhotoPage() { return markSpread({ t: 'full-mat', p: [] }); }
    function addPage(kind) {
      const at = S.pages.length ? S.sel + 1 : 0;
      let pg;
      if (kind === 'photo') pg = newPhotoPage();
      else if (kind === 'divider') pg = { gen: 'divider', text: 'New section' };
      else pg = { gen: kind };
      edit(() => {
        if (kind === 'title') { S.pages.unshift(pg); S.sel = 0; return; }
        if (kind === 'closing') { S.pages.push(pg); S.sel = S.pages.length - 1; return; }
        S.pages.splice(at, 0, pg); S.sel = at;
      });
      if (kind === 'divider') { const inp = host.querySelector('[data-gen-text]'); if (inp) { inp.focus(); inp.select(); } }
    }
    function duplicatePage() {
      const pg = cur();
      if (!pg) return;
      edit(() => { S.pages.splice(S.sel + 1, 0, clone(pg)); S.sel += 1; });
      toast('Page copied');
    }
    function deletePage() {
      const pg = cur();
      if (!pg) return;
      const n = (pg.p || []).filter((x) => x && x.m).length;
      edit(() => { S.pages.splice(S.sel, 1); });
      toast(n ? `Page removed. Its ${plural(n, 'photo is', 'photos are')} back in the tray.` : 'Page removed');
    }
    function layoutPhotos(list, opts) {
      return PT.autoLayout(list, Object.assign({ ratio, density: S.density, seed: S.seed }, opts)).map(markSpread);
    }
    function shuffle() {
      if (!S.pages || !S.pages.length) return;
      if (S.manual && !confirm('Shuffle the designs?\n\nNew designs are picked for every photo page. The photos stay in the same order and section pages stay where they are, but crops, words and designs you chose on photo pages are replaced.')) return;
      S.seed = 1 + Math.floor(Math.random() * 99999);
      edit(() => {
        const out = []; let run = [];
        const flush = () => {
          if (run.length) out.push(...layoutPhotos(run, { sections: false, welcome: false, thanks: false }));
          run = [];
        };
        for (const pg of S.pages) {
          if (pg.gen) { flush(); out.push(pg); continue; }
          (pg.p || []).forEach((x) => { const m = x && x.m && byId.get(x.m); if (m) run.push({ id: m.id, w: m.width, h: m.height, section: '' }); });
        }
        flush();
        S.pages = out; S.spot = -1; S.manual = false;
        if (S.sel >= out.length) S.sel = 0;
      }, { manual: false });
      toast('New designs picked');
    }
    function previewPages() {
      const src = photos.length ? photos : designed;
      return layoutPhotos(src.map((m) => ({ id: m.id, w: m.width, h: m.height, section: m.section || '' })),
        { sections: S.opts.sections, welcome: S.opts.welcome, thanks: S.opts.thanks });
    }
    function create(blank) {
      snapshot();
      if (blank) {
        S.pages = [];
        if (S.opts.welcome) S.pages.push({ gen: 'title' });
        S.pages.push(newPhotoPage());
        if (S.opts.thanks) S.pages.push({ gen: 'closing' });
        S.sel = S.opts.welcome ? 1 : 0;
      } else {
        S.pages = previewPages();
        S.sel = Math.max(0, S.pages.findIndex((p) => !p.gen));
      }
      S.mode = 'edit'; S.dirty = true; S.manual = false; S.spot = -1; S.undo = [];
      paint();
      scrollToEditor();
      toast(blank ? 'Empty page added. Pick a design and drag photos onto it.' : `${plural(S.pages.length, 'page', 'pages')} made. Change anything, then save.`);
    }
    const cleanPages = () => S.pages.map((pg) => {
      if (pg.gen) return pg.text ? { gen: pg.gen, text: pg.text } : { gen: pg.gen };
      const out = { t: pg.t, p: (pg.p || []).map((x) => (x && x.c ? { m: x.m || null, c: x.c } : { m: (x && x.m) || null })) };
      if (Array.isArray(pg.tx) && pg.tx.some((s) => s)) out.tx = Array.from(pg.tx, (s) => s || '');
      if (pg.bg) out.bg = pg.bg;
      if (isTwo(pg)) out.s = 1;
      return out;
    });
    async function save() {
      if (S.saving || !S.pages) return;
      if (!S.pages.length) { toast('Add at least one page before saving.'); return; }
      S.saving = true; paintBar();
      try {
        await api(`albums/${q}/pages`, { method: 'PUT', body: { pages: cleanPages() } });
        S.dirty = false; S.saved = true; S.justSaved = true;
        toast('Album pages saved');
      } catch (err) { toast(err.message); }
      S.saving = false; paintBar();
    }
    async function useAutomatic() {
      const msg = S.saved
        ? 'Go back to the automatic layout?\n\nThe pages made here are removed and guests see the photos laid out automatically again.'
        : 'Throw away these pages and keep the automatic layout?';
      if (!confirm(msg)) return;
      const was = S.saved;
      try {
        if (was) await api(`albums/${q}/pages`, { method: 'DELETE' });
        S.pages = null; S.saved = false; S.dirty = false; S.manual = false; S.undo = []; S.mode = 'intro';
        paint();
        toast(was ? 'Back to the automatic layout' : 'The automatic layout is kept');
      } catch (err) { toast(err.message); }
    }

    /* ---------- painting ---------- */
    host.innerHTML = `<section class="pe" aria-label="Album page editor">${ICONS}<div class="pe-body"><p class="hint">Loading the album pages…</p></div></section>`;
    const root = host.querySelector('.pe'), body = root.querySelector('.pe-body');
    root.style.setProperty('--pe-r', ratio);

    function paint() {
      if (S.mode === 'empty') return paintEmpty();
      if (S.mode === 'intro') return paintIntro();
      if (S.mode !== 'edit') return;
      if (!body.querySelector('.pe-work')) {
        body.innerHTML = `
          <header class="pe-bar"><div class="pe-status" role="status" aria-live="polite"></div><div class="pe-bar-actions"></div></header>
          <div class="pe-strip-wrap"><div class="pe-strip" aria-label="Pages of the album, as guests turn them"></div></div>
          <div class="pe-work">
            <aside class="pe-tray" aria-label="Photos"></aside>
            <div class="pe-center">
              <div class="pe-pagebar"></div>
              <div class="pe-stage"></div>
              <div class="pe-spotbar" aria-live="polite"></div>
            </div>
            <aside class="pe-insp" aria-label="Page settings"></aside>
          </div>`;
      }
      paintBar(); paintStrip(); paintCanvas(); paintTray(); paintInspector();
    }

    function paintBar() {
      const bar = body.querySelector('.pe-bar');
      if (!bar) return;
      const status = bar.querySelector('.pe-status'), acts = bar.querySelector('.pe-bar-actions');
      let st;
      if (S.saving) st = '<span class="pe-dot busy"></span>Saving…';
      else if (S.dirty) st = `<span class="pe-dot warn"></span><span><b>Unsaved changes.</b> ${S.saved ? 'Guests still see the last saved pages.' : 'Guests still see the automatic layout.'}</span>`;
      else st = `<span class="pe-dot ok"></span><span>${S.justSaved ? '<b>Saved.</b> Guests now see these pages.' : 'Guests see these pages.'} <a class="link" href="/a/${q}" target="_blank" rel="noopener">Open the album</a></span>`;
      status.innerHTML = st;
      const n = (S.pages || []).length;
      acts.innerHTML = `
        <button type="button" class="btn quiet" data-act="undo" ${S.undo.length ? '' : 'disabled'} title="Undo (Ctrl+Z)"><svg><use href="#pe-undo"/></svg>Undo</button>
        <button type="button" class="btn quiet" data-act="shuffle" ${n ? '' : 'disabled'} title="New designs for every photo page, same photo order"><svg><use href="#pe-shuffle"/></svg>Shuffle designs</button>
        <button type="button" class="btn quiet pe-auto" data-act="auto">Use automatic layout instead</button>
        <button type="button" class="btn" data-act="save" ${S.saving || !n ? 'disabled' : ''}><svg><use href="#i-check"/></svg>${S.saving ? 'Saving…' : 'Save pages'}</button>`;
    }

    function paintStrip() {
      const strip = body.querySelector('.pe-strip');
      const keep = strip.scrollLeft, hadFocus = strip.contains(document.activeElement);
      const { groups } = book();
      strip.innerHTML = groups.map((g) => {
        const first = g[0], last = g[g.length - 1];
        const from = first.at, to = last.at + (last.two ? 1 : 0);
        const label = first.kind === 'cover' ? 'Cover' : last.kind === 'back' ? 'Back' : from === to ? String(from) : `${from}–${to}`;
        const leaves = g.map((l) => {
          if (l.kind !== 'page') {
            return `<span class="pe-leaf pe-ctx${l.kind === 'cover' ? ' right' : l.at % 2 ? ' left' : ' right'}" title="${CONTEXT_NAME[l.kind]}${l.kind === 'cover' || l.kind === 'back' ? ' (change it in Details)' : ''}" style="--w:1">` +
              `<span class="pe-thumb">${contextSvg(l.kind)}</span></span>`;
          }
          const pg = S.pages[l.i];
          const name = pg.gen ? GEN_NAME[pg.gen] + (pg.gen === 'divider' && pg.text ? ': ' + pg.text : '') : ((tplOf(pg) || {}).name || 'Page');
          const empty = !pg.gen && !(pg.p || []).some((x) => x && x.m);
          return `<button type="button" class="pe-leaf${l.two ? ' two' : l.at % 2 ? ' left' : ' right'}${l.i === S.sel ? ' on' : ''}${empty ? ' empty' : ''}" data-i="${l.i}" style="--w:${l.two ? 2 : 1}"` +
            ` aria-label="${l.two ? `Pages ${l.at} and ${l.at + 1}` : `Page ${l.at}`}: ${esc(name)}" ${l.i === S.sel ? 'aria-current="true"' : ''}>` +
            `<span class="pe-thumb">${pageHtml(pg, { small: true })}</span></button>`;
        }).join('');
        return `<div class="pe-sp${first.kind === 'cover' ? ' cover' : ''}"><div class="pe-sp-pages">${leaves}</div><span class="pe-sp-n">${label}</span></div>`;
      }).join('') + `<div class="pe-sp pe-sp-add"><button type="button" class="pe-add-tile" data-act="add-menu" aria-haspopup="true"><svg class="i"><use href="#i-plus"/></svg>Add a page</button><span class="pe-sp-n">&nbsp;</span></div>`;
      strip.scrollLeft = keep;
      const on = strip.querySelector('.pe-leaf.on');
      if (on) {
        const r = on.getBoundingClientRect(), sr = strip.getBoundingClientRect();
        if (r.left < sr.left + 20 || r.right > sr.right - 20) strip.scrollLeft += (r.left + r.width / 2) - (sr.left + sr.width / 2);
        if (hadFocus) on.focus({ preventScroll: true });
      }
    }

    function leafOf(i) { return book().leaves.find((l) => l.kind === 'page' && l.i === i); }

    function paintCanvas() {
      const stage = body.querySelector('.pe-stage'), pagebar = body.querySelector('.pe-pagebar');
      const focusedSlot = document.activeElement && document.activeElement.closest && document.activeElement.closest('.pe-stage .pt-slot');
      const fIdx = focusedSlot ? +focusedSlot.dataset.slot : -1;
      const pg = cur();
      if (!pg) {
        pagebar.innerHTML = '<h3 class="pe-where">No pages</h3>';
        stage.innerHTML = `<div class="pe-none"><p>This album has no pages yet.</p><button type="button" class="btn" data-add="photo"><svg><use href="#i-plus"/></svg>Add a page</button></div>`;
        body.querySelector('.pe-spotbar').innerHTML = '';
        return;
      }
      const l = leafOf(S.sel), two = l.two, side = two ? 'two' : l.at % 2 ? 'left' : 'right';
      const where = two ? `Pages ${l.at} and ${l.at + 1}` : `Page ${l.at}`;
      const sideText = two ? 'across both pages' : l.at % 2 ? 'left-hand page' : 'right-hand page';
      pagebar.innerHTML = `
        <h3 class="pe-where">${where} <small>${sideText}</small></h3>
        <div class="pe-page-acts">
          <button type="button" class="icon-btn" data-act="earlier" ${S.sel === 0 ? 'disabled' : ''} title="Move this page earlier" aria-label="Move this page earlier"><svg><use href="#pe-left"/></svg></button>
          <button type="button" class="icon-btn" data-act="later" ${S.sel >= S.pages.length - 1 ? 'disabled' : ''} title="Move this page later" aria-label="Move this page later"><svg><use href="#pe-right"/></svg></button>
          <button type="button" class="btn quiet sm" data-act="duplicate" title="Add a copy of this page after it"><svg><use href="#pe-copy"/></svg>Duplicate</button>
          <button type="button" class="btn quiet sm" data-act="delete" title="Remove this page; its photos go back to the tray"><svg><use href="#i-trash"/></svg>Delete</button>
          <button type="button" class="btn quiet sm" data-act="add-menu" aria-haspopup="true"><svg><use href="#i-plus"/></svg>Add page</button>
        </div>`;
      stage.innerHTML = `<div class="pe-page ${side}${pg.gen ? ' gen' : ''}" style="--r:${two ? ratio * 2 : ratio}">${pageHtml(pg, { editable: true })}</div>`;
      if (!pg.gen) {
        const tpl = tplOf(pg);
        stage.querySelectorAll('.pt-slot').forEach((el) => {
          const i = +el.dataset.slot, x = (pg.p || [])[i], m = x && x.m && byId.get(x.m);
          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `Photo spot ${i + 1} of ${tpl.slots.length}${m ? ': ' + (m.name || 'photo') : ', empty'}`);
          el.classList.toggle('pe-has', !!m);
          el.classList.toggle('pe-on', i === S.spot);
          if (i === S.spot) el.setAttribute('aria-pressed', 'true');
        });
        stage.querySelectorAll('.pt-text').forEach((el) => { el.title = 'Change these words on the right'; });
        if (fIdx >= 0) { const f = stage.querySelector(`.pt-slot[data-slot="${fIdx}"]`); if (f) f.focus({ preventScroll: true }); }
      }
      paintSpotbar();
    }

    function paintSpotbar() {
      const bar = body.querySelector('.pe-spotbar'), pg = cur();
      if (!bar || !pg) return;
      if (pg.gen) {
        const what = pg.gen === 'divider' ? 'A section page: it opens a part of the album, such as Haldi or Wedding. Change its words on the right.'
          : pg.gen === 'title' ? 'The welcome page shows the names, place and date from the album details.'
            : 'The thank-you page closes the album.';
        bar.innerHTML = `<p class="pe-tip">${what}</p>`;
        return;
      }
      const tpl = tplOf(pg), x = (pg.p || [])[S.spot], m = x && x.m && byId.get(x.m);
      if (S.spot < 0) {
        bar.innerHTML = `<p class="pe-tip">Drag photos from the tray onto the page, or drag one spot onto another to swap them. Click a spot to crop or change its photo.</p>`;
      } else if (!m) {
        bar.innerHTML = `<p class="pe-tip"><b>Spot ${S.spot + 1} of ${tpl.slots.length} is empty.</b> Click a photo in the tray to put it here.</p>
          <button type="button" class="link" data-act="deselect">Done</button>`;
      } else {
        bar.innerHTML = `<p class="pe-tip"><b>Spot ${S.spot + 1} of ${tpl.slots.length}</b> <span class="pe-name">${esc(m.name || '')}</span>${x.c ? ' <span class="pe-cropped">cropped</span>' : ''}</p>
          <div class="pe-spot-acts">
            <button type="button" class="btn sm" data-act="adjust"><svg><use href="#pe-crop"/></svg>Adjust</button>
            <button type="button" class="btn quiet sm" data-act="remove"><svg><use href="#i-close"/></svg>Take photo off</button>
            <button type="button" class="link" data-act="deselect">Done</button>
          </div>`;
      }
    }

    function paintTray() {
      const tray = body.querySelector('.pe-tray');
      const grid = tray.querySelector('.pe-tray-grid');
      const keep = grid ? grid.scrollTop : 0;
      const used = usedCounts();
      const unused = all.filter((m) => !used.has(m.id)).length;
      if (S.filter === 'unused' && !unused) S.filter = 'all';
      const show = (m) => S.filter === 'all' || !used.has(m.id);
      const tile = (m) => {
        const n = used.get(m.id) || 0;
        return `<button type="button" class="pe-ph${n ? ' used' : ''}" data-m="${esc(m.id)}" title="${esc(m.name || '')}${n ? (n > 1 ? `, on ${n} pages` : ', on a page') : ', not used yet'}">` +
          `<img src="${esc(m.thumb || m.url)}" alt="${esc(m.name || 'Photo')}" loading="lazy" draggable="false">${n ? `<span class="pe-used" aria-hidden="true"><svg><use href="#i-check"/></svg>${n > 1 ? n : ''}</span>` : ''}</button>`;
      };
      let html = '';
      const secs = [];
      photos.forEach((m) => { if (!show(m)) return; const k = m.section || ''; let s = secs.find((x) => x.k === k); if (!s) secs.push(s = { k, list: [] }); s.list.push(m); });
      secs.forEach((s) => { html += (secs.length > 1 || s.k ? `<p class="pe-tray-sec">${esc(s.k || 'Other photos')}</p>` : '') + `<div class="pe-tray-tiles">${s.list.map(tile).join('')}</div>`; });
      const dp = designed.filter(show);
      if (dp.length) html += `<p class="pe-tray-sec">Designed pages</p><div class="pe-tray-tiles">${dp.map(tile).join('')}</div>`;
      if (!html) html = '<p class="hint">Every photo is on a page.</p>';
      tray.innerHTML = `
        <div class="pe-tray-head">
          <h3>Photos</h3>
          <div class="pe-seg" role="group" aria-label="Show">
            <button type="button" data-filter="all" aria-pressed="${S.filter === 'all'}">All <span>${all.length}</span></button>
            <button type="button" data-filter="unused" aria-pressed="${S.filter === 'unused'}" ${unused ? '' : 'disabled'}>Not used <span>${unused}</span></button>
          </div>
        </div>
        <div class="pe-tray-grid">${html}</div>
        <p class="pe-tray-foot">Drop a photo here to take it off the page.</p>`;
      tray.querySelector('.pe-tray-grid').scrollTop = keep;
    }

    function paintInspector() {
      const insp = body.querySelector('.pe-insp');
      const pg = cur();
      const keep = insp.scrollTop;
      if (!pg) { insp.innerHTML = ''; return; }
      if (pg.gen) {
        let html = `<section class="pe-sec"><h3>${GEN_NAME[pg.gen]}</h3>`;
        if (pg.gen === 'divider') {
          html += `<label class="field"><span>Section name</span><input data-gen-text maxlength="80" value="${esc(pg.text || '')}" placeholder="Moments"></label>
            <p class="hint">For example Haldi, Mehendi, Sangeet or Wedding.</p>`;
        } else if (pg.gen === 'title') {
          html += `<p class="hint">Drawn from the album details: ${esc((album.names || []).filter(Boolean).join(' & ') || 'the names')}${album.location ? ', ' + esc(album.location) : ''}${album.date ? ', ' + esc(M.formatDate(album.date)) : ''}.</p>
            <p class="hint"><a class="link" href="#album/${q}/details">Change the album details</a></p>`;
        } else html += '<p class="hint">Closes the album with a thank-you in the style of the cover.</p>';
        insp.innerHTML = html + '</section>';
        return;
      }
      const tpl = tplOf(pg);
      const bg = pg.bg || tpl.bg || 'paper';
      const th = M.theme(album);
      let html = `<section class="pe-sec"><h3>Background</h3><div class="pe-bgs" role="radiogroup" aria-label="Background">${BGS.map(([k, label]) =>
        `<button type="button" role="radio" aria-checked="${bg === k}" data-bg="${k}" class="pe-bg"><span class="pe-sw sw-${k}" style="--r:${ratio}${k === 'silk' ? `;--silk-c:${th.silk}` : ''}"></span>${label}</button>`).join('')}</div></section>`;
      if ((tpl.texts || []).length) {
        html += `<section class="pe-sec"><h3>Words on this page</h3>${tpl.texts.map((t, i) => {
          const own = (pg.tx || [])[i] || '';
          const auto = t.role === 'section' ? '' : autoValue(t);
          return `<label class="field"><span>${ROLE_LABEL[t.role] || 'Words'}</span><input data-tx="${i}" maxlength="300" value="${esc(own)}" placeholder="${esc(auto || 'Type here')}"></label>`;
        }).join('')}<p class="hint">Leave a box empty to use the album details shown in grey.</p></section>`;
      }
      const n = tpl.slots.length;
      const list = PT.list().slice();
      if (!PT.list().includes(tpl)) list.unshift(tpl);
      const order = list.map((t, k) => ({ t, k, d: Math.abs(t.slots.length - n) + (t.spread ? 0.5 : 0) })).sort((a, b) => a.d - b.d || a.k - b.k);
      const compact = photosFor(pg).filter(Boolean);
      const tiles = order.map(({ t }) => {
        const on = t.key === pg.t;
        const preview = { t: t.key, p: [], bg: pg.bg };
        return `<button type="button" class="pe-design${t.spread ? ' two' : ''}" data-t="${esc(t.key)}" aria-pressed="${on}" title="${esc(t.name)}">` +
          `<span class="pe-dthumb" style="--r:${t.spread ? ratio * 2 : ratio}">${ptRender(preview, { album: view, photos: compact, small: true, tpl: t })}</span>` +
          `<span class="pe-dname">${esc(t.name)}${t.spread ? ' <em>two pages</em>' : ''}<small>${plural(t.slots.length, 'photo', 'photos')}</small></span></button>`;
      }).join('');
      html += `<section class="pe-sec pe-sec-designs"><h3>Design <small>${esc(tpl.name || '')}</small></h3><p class="hint">Designs for ${plural(n, 'photo', 'photos')} come first. Photos keep their order when you switch.</p><div class="pe-designs">${tiles}</div></section>`;
      insp.innerHTML = html;
      insp.scrollTop = keep;
    }

    function paintEmpty() {
      const illus = ptRender({ t: 'big-left-two', p: [] }, { album: view });
      const illus2 = ptRender({ t: 'two-offset', p: [] }, { album: view });
      body.innerHTML = `<div class="pe-hello">
        <div class="pe-hello-copy">
          <h2 class="display">Add photos first</h2>
          <p>Album pages are made from the album's photos. Upload them, then come back here to lay out the pages yourself or let the album do it for you.</p>
          <div class="pe-hello-acts"><a class="btn" href="#album/${q}/photos"><svg><use href="#i-upload"/></svg>Add photos</a></div>
        </div>
        <div class="pe-hello-art" aria-hidden="true"><div class="pe-mini-spread" style="--r:${ratio}"><span class="pe-mini left">${illus}</span><span class="pe-mini right">${illus2}</span></div></div>
      </div>`;
    }

    function paintIntro() {
      const src = photos.length ? photos : designed;
      const prev = previewPages();
      const nPhotoPages = prev.filter((p) => !p.gen).length;
      const nSections = prev.filter((p) => p.gen === 'divider').length;
      // preview: the first spreads of the book (welcome page on the right of the endpaper, then pairs)
      const save = S.pages; S.pages = prev;
      const { groups } = book();
      S.pages = save;
      const spreads = groups.filter((g) => g.some((l) => l.kind === 'page')).slice(0, 6).map((g) =>
        `<div class="pe-isp">${g.map((l) => `<span class="pe-ileaf${l.two ? ' two' : ''}" style="--w:${l.two ? 2 : 1}">${l.kind === 'page' ? pageHtml(prev[l.i], { small: true }) : contextSvg(l.kind)}</span>`).join('')}</div>`).join('');
      const extras = [];
      if (S.opts.welcome) extras.push('a welcome page');
      if (nSections) extras.push(plural(nSections, 'section page', 'section pages'));
      if (S.opts.thanks) extras.push('a thank-you page');
      const tick = (k, label, hint) => `<label class="pe-tick"><input type="checkbox" data-opt="${k}" ${S.opts[k] ? 'checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`;
      body.innerHTML = `<div class="pe-intro">
        <div class="pe-intro-copy">
          <h2 class="display">Make the album pages</h2>
          <p>Right now the album lays itself out: each landscape photo gets a page and portraits share one. Make the pages here to choose a design for every page, crop photos and add your own words.</p>
          ${designed.length ? '<p class="hint">Saved pages from here are shown instead of the designed pages you uploaded.</p>' : ''}
          <fieldset class="pe-density"><legend>Photos per page</legend>
            ${DENSITIES.map(([k, label, hint]) => `<label><input type="radio" name="pe-density" value="${k}" ${S.density === k ? 'checked' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`).join('')}
          </fieldset>
          <fieldset class="pe-extras"><legend>Extra pages</legend>
            ${tick('welcome', 'Welcome page', 'Names, place and date before the first photo')}
            ${hasSections ? tick('sections', 'Section pages', 'The ceremony name before each part: ' + esc(sectionsOf.filter(Boolean).slice(0, 4).join(', '))) : ''}
            ${tick('thanks', 'Thank-you page', 'A closing page at the end')}
          </fieldset>
          <div class="pe-intro-acts">
            <button type="button" class="btn" data-act="create"><svg><use href="#i-book"/></svg>Create pages from my photos</button>
            <button type="button" class="btn quiet" data-act="blank">Start with an empty page</button>
          </div>
          <p class="hint">Nothing changes for guests until you save the pages.</p>
        </div>
        <div class="pe-intro-preview">
          <div class="pe-intro-book" style="--r:${ratio}">${spreads}</div>
          <p class="pe-intro-sum"><b>${plural(src.length, photos.length ? 'photo' : 'designed page', photos.length ? 'photos' : 'designed pages')}</b> on ${plural(nPhotoPages, 'page', 'pages')}${extras.length ? ', with ' + extras.join(', ').replace(/, ([^,]*)$/, ' and $1') : ''}.
            <button type="button" class="link" data-act="reroll">Try other designs</button></p>
        </div>
      </div>`;
    }

    function scrollToEditor() {
      const tabs = host.previousElementSibling;
      const target = tabs && tabs.classList.contains('tabs') ? tabs : host;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (target.getBoundingClientRect().top > 80) target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }

    /* ---------- add-page menu ---------- */
    function openAddMenu(btn) {
      closeMenus();
      const hasTitle = S.pages.some((p) => p.gen === 'title'), hasClosing = S.pages.some((p) => p.gen === 'closing');
      const menu = document.createElement('div');
      menu.className = 'pe-menu';
      menu.setAttribute('role', 'menu');
      menu.innerHTML = `<button type="button" role="menuitem" data-add="photo"><b>Page for photos</b><small>After this page; pick a design for it</small></button>
        <button type="button" role="menuitem" data-add="divider"><b>Section page</b><small>Opens a part such as Haldi or Wedding</small></button>
        ${hasTitle ? '' : '<button type="button" role="menuitem" data-add="title"><b>Welcome page</b><small>At the start of the album</small></button>'}
        ${hasClosing ? '' : '<button type="button" role="menuitem" data-add="closing"><b>Thank-you page</b><small>At the end of the album</small></button>'}`;
      root.appendChild(menu);
      const r = btn.getBoundingClientRect(), rr = root.getBoundingClientRect();
      const w = Math.min(280, innerWidth - 24);
      let left = r.left - rr.left;
      if (r.left + w > innerWidth - 12) left = r.right - rr.left - w;
      menu.style.left = Math.max(0, left) + 'px';
      menu.style.top = (r.bottom - rr.top + 6) + 'px';
      menu.style.width = w + 'px';
      menu.querySelector('button').focus();
      S.menuFrom = btn;
    }
    function closeMenus(restore) {
      root.querySelectorAll('.pe-menu').forEach((m) => m.remove());
      if (restore && S.menuFrom && S.menuFrom.isConnected) S.menuFrom.focus();
      S.menuFrom = null;
    }

    /* ---------- clicks ---------- */
    root.addEventListener('click', (e) => {
      if (S.suppressClick) { S.suppressClick = false; e.preventDefault(); return; }
      const t = e.target;
      if (!t.closest('.pe-menu') && !t.closest('[data-act="add-menu"]')) closeMenus();
      const add = t.closest('[data-add]');
      if (add) { closeMenus(); addPage(add.dataset.add); return; }
      const act = t.closest('[data-act]');
      if (act) {
        const a = act.dataset.act;
        if (a === 'save') save();
        else if (a === 'undo') undo();
        else if (a === 'shuffle') shuffle();
        else if (a === 'auto') useAutomatic();
        else if (a === 'create') create(false);
        else if (a === 'blank') create(true);
        else if (a === 'reroll') { S.seed = 1 + Math.floor(Math.random() * 99999); paintIntro(); }
        else if (a === 'earlier') movePage(S.sel, S.sel - 1);
        else if (a === 'later') movePage(S.sel, S.sel + 1);
        else if (a === 'duplicate') duplicatePage();
        else if (a === 'delete') deletePage();
        else if (a === 'add-menu') { if (root.querySelector('.pe-menu') && S.menuFrom === act) closeMenus(); else openAddMenu(act); }
        else if (a === 'adjust') adjust(S.spot);
        else if (a === 'remove') removePhoto(S.spot);
        else if (a === 'deselect') { S.spot = -1; paintCanvas(); }
        return;
      }
      const leaf = t.closest('.pe-leaf[data-i]');
      if (leaf) { select(+leaf.dataset.i); return; }
      const f = t.closest('[data-filter]');
      if (f) { S.filter = f.dataset.filter; paintTray(); return; }
      const ph = t.closest('.pe-ph');
      if (ph) { trayPick(ph.dataset.m); return; }
      const d = t.closest('.pe-design');
      if (d) { setDesign(d.dataset.t); return; }
      const b = t.closest('[data-bg]');
      if (b) { setBg(b.dataset.bg); return; }
      const slot = t.closest('.pe-stage .pt-slot');
      if (slot) { S.spot = +slot.dataset.slot; paintCanvas(); maybeShowTray(); return; }
      const text = t.closest('.pe-stage .pt-text');
      if (text) { const inp = host.querySelector(`[data-tx="${text.dataset.text}"]`); if (inp) { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); } return; }
      if (t.closest('.pe-stage') && S.spot >= 0) { S.spot = -1; paintCanvas(); }
    });
    root.addEventListener('dblclick', (e) => {
      const slot = e.target.closest('.pe-stage .pt-slot.pe-has');
      if (slot) adjust(+slot.dataset.slot);
    });
    function trayPick(mid) {
      const pg = cur();
      if (!pg) return;
      if (pg.gen) { toast('This page has no photo spots. Pick a photo page in the strip above.'); return; }
      fitSlots(pg);
      let slot = S.spot;
      if (slot < 0) slot = pg.p.findIndex((x) => !x.m);
      if (slot < 0) { toast('Every spot on this page has a photo. Click a spot first to replace its photo.'); return; }
      place(mid, slot, { flow: S.spot < 0 ? false : true });
    }
    function maybeShowTray() {
      const pg = cur();
      if (S.spot < 0 || !pg || (pg.p[S.spot] || {}).m || innerWidth > 1100) return;
      const tray = body.querySelector('.pe-tray');
      if (tray) tray.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /* ---------- typing ---------- */
    let typingSnap = false;
    root.addEventListener('focusin', (e) => {
      if (e.target.matches('[data-tx], [data-gen-text]')) typingSnap = false;
    });
    root.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches('[data-tx], [data-gen-text]')) {
        const pg = cur();
        if (!typingSnap) { snapshot(); typingSnap = true; }
        if (el.matches('[data-gen-text]')) pg.text = el.value;
        else { pg.tx = Array.from(pg.tx || []); pg.tx[+el.dataset.tx] = el.value; }
        S.dirty = true; S.manual = true; S.justSaved = false;
        paintBar(); paintStrip();
        if (pg.gen) { const page = body.querySelector('.pe-stage .pe-page'); if (page) page.innerHTML = pageHtml(pg, { editable: true }); }
        else paintCanvas();
        return;
      }
      if (S.mode !== 'intro') return;
      let again = null;
      if (el.name === 'pe-density') { S.density = el.value; again = `input[name="pe-density"][value="${el.value}"]`; }
      else if (el.dataset.opt) { S.opts[el.dataset.opt] = el.checked; again = `[data-opt="${el.dataset.opt}"]`; }
      if (!again) return;
      paintIntro();
      // keep keyboard focus on the control that was changed once the preview is redrawn
      const f = body.querySelector(again); if (f) f.focus();
    });

    /* ---------- dragging: photos onto spots, spot to spot, pages along the strip ---------- */
    root.addEventListener('dragstart', (e) => e.preventDefault());
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || S.mode !== 'edit') return;
      const t = e.target;
      let src = null;
      const ph = t.closest('.pe-ph');
      const slot = t.closest('.pe-stage .pt-slot.pe-has');
      const leaf = t.closest('.pe-leaf[data-i]');
      if (ph) src = { kind: 'photo', m: ph.dataset.m, img: ph.querySelector('img').src };
      else if (slot) { const x = cur().p[+slot.dataset.slot]; const m = byId.get(x.m); src = { kind: 'slot', i: +slot.dataset.slot, m: x.m, img: m ? m.thumb || m.url : '' }; }
      else if (leaf) src = { kind: 'page', i: +leaf.dataset.i, el: leaf };
      if (!src) return;
      if (e.pointerType === 'touch') return;   // phones: tap a spot, then a photo; arrows move pages
      S.drag = Object.assign(src, { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false });
      addEventListener('pointermove', onMove, { passive: false });
      addEventListener('pointerup', onUp);
      addEventListener('pointercancel', onCancel);
    });
    function startDrag(d) {
      d.started = true;
      const g = document.createElement('div');
      g.className = 'pe-ghost' + (d.kind === 'page' ? ' page' : '');
      if (d.kind === 'page') {
        const thumb = d.el.querySelector('.pe-thumb');
        g.innerHTML = thumb.innerHTML;
        const r = thumb.getBoundingClientRect();
        g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
        d.el.classList.add('pe-lifted');
      } else g.innerHTML = `<img alt="" src="${esc(d.img)}">`;
      document.body.appendChild(g);
      d.ghost = g;
      document.body.classList.add('pe-dragging');
      if (d.kind === 'slot') body.querySelector(`.pe-stage .pt-slot[data-slot="${d.i}"]`).classList.add('pe-lifted');
      if (d.kind !== 'page') root.classList.add('pe-drag-photo');
    }
    function onMove(e) {
      const d = S.drag;
      if (!d || e.pointerId !== d.id) return;
      d.x = e.clientX; d.y = e.clientY;
      if (!d.started) { if (Math.hypot(d.x - d.x0, d.y - d.y0) < 6) return; startDrag(d); }
      e.preventDefault();
      d.ghost.style.transform = `translate(${d.x}px, ${d.y}px) translate(-50%, -50%)`;
      body.querySelectorAll('.pe-over').forEach((el) => el.classList.remove('pe-over'));
      const el = document.elementFromPoint(d.x, d.y);
      d.target = null;
      if (d.kind === 'page') return markInsert(d);
      const slot = el && el.closest('.pe-stage .pt-slot');
      if (slot && !(d.kind === 'slot' && +slot.dataset.slot === d.i)) { slot.classList.add('pe-over'); d.target = { slot: +slot.dataset.slot }; return; }
      const tray = el && el.closest('.pe-tray');
      if (tray && d.kind === 'slot') { tray.classList.add('pe-over'); d.target = { tray: true }; }
    }
    // where a page dropped on the strip goes: before or after the page under the pointer
    function markInsert(d) {
      const strip = body.querySelector('.pe-strip');
      let mark = strip.querySelector('.pe-insert');
      const leaves = [...strip.querySelectorAll('.pe-leaf[data-i]')];
      let best = null;
      leaves.forEach((l) => {
        const r = l.getBoundingClientRect();
        const dist = d.x < r.left ? r.left - d.x : d.x > r.right ? d.x - r.right : 0;
        if (!best || dist < best.dist) best = { l, r, dist, after: d.x > r.left + r.width / 2 };
      });
      const sr = strip.getBoundingClientRect();
      if (!best || d.y < sr.top - 60 || d.y > sr.bottom + 60) { if (mark) mark.hidden = true; d.target = null; return; }
      let to = +best.l.dataset.i + (best.after ? 1 : 0);
      if (to > d.i) to -= 1;   // removing the page first shifts the ones after it
      d.target = { to };
      if (!mark) { mark = document.createElement('span'); mark.className = 'pe-insert'; strip.appendChild(mark); }
      mark.hidden = to === d.i;
      mark.style.left = ((best.after ? best.r.right + 5 : best.r.left - 5) - sr.left + strip.scrollLeft) + 'px';
      // scroll the strip near its edges
      if (d.x < sr.left + 40) strip.scrollLeft -= 12; else if (d.x > sr.right - 40) strip.scrollLeft += 12;
    }
    function endDrag() {
      const d = S.drag;
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onCancel);
      if (d && d.ghost) d.ghost.remove();
      document.body.classList.remove('pe-dragging');
      root.classList.remove('pe-drag-photo');
      body.querySelectorAll('.pe-over, .pe-lifted').forEach((el) => el.classList.remove('pe-over', 'pe-lifted'));
      const mark = body.querySelector('.pe-insert'); if (mark) mark.remove();
      S.drag = null;
      return d;
    }
    function onCancel() { endDrag(); }
    function onUp(e) {
      const d = S.drag;
      if (!d || e.pointerId !== d.id) return;
      endDrag();
      if (!d.started) return;
      S.suppressClick = true;
      setTimeout(() => { S.suppressClick = false; }, 0);
      const tg = d.target;
      if (!tg) return;
      if (d.kind === 'page') { movePage(d.i, tg.to); return; }
      if (tg.tray && d.kind === 'slot') { removePhoto(d.i); toast('Photo taken off the page'); return; }
      if (tg.slot === undefined) return;
      if (d.kind === 'photo') place(d.m, tg.slot);
      else if (d.kind === 'slot') swap(d.i, tg.slot);
    }

    /* ---------- keyboard ---------- */
    function onKey(e) {
      if (!host.isConnected) { cleanup(); return; }
      const modal = document.getElementById('modal');
      if (S.mode !== 'edit' || document.querySelector('.crop-overlay') || (modal && !modal.hidden)) return;
      const inField = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (e.key === 'Escape' && root.querySelector('.pe-menu')) { closeMenus(true); return; }
      if (inField) return;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (mod || e.altKey) return;
      const inEditor = root.contains(e.target) || e.target === document.body;
      if (!inEditor) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (e.target.closest('.pe-menu, .pe-bgs, .pe-seg')) return;
        e.preventDefault();
        const fromStrip = !!e.target.closest('.pe-strip');
        select(S.sel + (e.key === 'ArrowLeft' ? -1 : 1), { focus: fromStrip });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.spot >= 0) {
        e.preventDefault();
        removePhoto(S.spot);
      } else if (e.key === 'Escape' && S.spot >= 0) {
        S.spot = -1; paintCanvas();
      } else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pe-stage .pt-slot')) {
        e.preventDefault();
        const i = +e.target.closest('.pt-slot').dataset.slot;
        if (S.spot === i && e.key === 'Enter' && (cur().p[i] || {}).m) adjust(i);
        else { S.spot = i; paintCanvas(); }
      }
    }
    // menus: arrow keys move between items
    root.addEventListener('keydown', (e) => {
      const menu = e.target.closest('.pe-menu');
      if (!menu || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault(); e.stopPropagation();
      const items = [...menu.querySelectorAll('button')], k = items.indexOf(e.target);
      items[(k + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
    });

    /* ---------- leaving with unsaved changes ----------
       The admin routes on hashchange, which is too late to stay, so the navigation is stopped before it happens:
       with the Navigation API where the browser has it (links, back button, location.hash), else on link clicks. */
    const isHere = (url) => { const u = new URL(url, location.href); return u.pathname === location.pathname && (u.hash === `#album/${q}/pages` || u.hash === `#album/${id}/pages`); };
    const mayLeave = () => {
      if (!S.dirty) return true;
      if (confirm('The album pages have unsaved changes. Leave without saving them?')) { S.dirty = false; return true; }
      return false;
    };
    function onNavigate(e) {
      if (!host.isConnected) { cleanup(); return; }
      if (!S.dirty || !e.hashChange || !e.cancelable || isHere(e.destination.url)) return;
      if (!mayLeave()) e.preventDefault();
    }
    function onLinkClick(e) {
      if (!host.isConnected) { cleanup(); return; }
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || !S.dirty || isHere(a.href)) return;
      if (!mayLeave()) { e.preventDefault(); e.stopPropagation(); }
    }
    const nav = window.navigation && typeof window.navigation.addEventListener === 'function' ? window.navigation : null;
    function onBeforeUnload(e) { if (host.isConnected && S.dirty) { e.preventDefault(); e.returnValue = ''; } }
    function cleanup() {
      if (nav) nav.removeEventListener('navigate', onNavigate); else document.removeEventListener('click', onLinkClick, true);
      removeEventListener('keydown', onKey);
      removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocClick);
      if (S.drag) endDrag();
      host._peCleanup = null;
    }
    function onDocClick(e) { if (!root.contains(e.target)) closeMenus(); }
    if (nav) nav.addEventListener('navigate', onNavigate); else document.addEventListener('click', onLinkClick, true);
    addEventListener('keydown', onKey);
    addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocClick);
    host._peCleanup = cleanup;

    /* ---------- load ---------- */
    (async () => {
      if (!all.length) { S.mode = 'empty'; paint(); return; }
      try {
        const [saved, designs] = await Promise.all([
          api(`albums/${q}/pages`),
          api('page-templates').catch(() => ({ templates: [] })),
        ]);
        (designs.templates || []).forEach((t) => PT.define(t));
        Object.values(saved.templates || {}).forEach((t) => PT.define(t));
        if (saved.pages && saved.pages.length) {
          let gone = 0;
          S.pages = saved.pages.map((pg) => {
            if (pg.gen) return pg;
            const p = (pg.p || []).map((x) => { if (x && x.m && !byId.has(x.m)) { gone++; return { m: null }; } return x || { m: null }; });
            return fitSlots(Object.assign({}, pg, { p }));
          });
          S.saved = true; S.manual = true; S.mode = 'edit';
          S.sel = Math.max(0, S.pages.findIndex((p) => !p.gen));
          if (gone) { S.dirty = true; toast(`${plural(gone, 'photo was', 'photos were')} removed from the album, so ${gone === 1 ? 'its spot is' : 'their spots are'} empty now. Save to keep this.`); }
        } else S.mode = 'intro';
        paint();
        if (S.mode === 'edit') requestAnimationFrame(scrollToEditor);
      } catch (err) {
        body.innerHTML = `<p class="hint">The album pages could not be loaded: ${esc(err.message)}</p>`;
      }
    })();
  }

  // same defaults as admin.js pageChoices() and lib/layout.js pageOptions()
  function pageChoices(a) {
    const designed = !!(a.media && a.media.pages && a.media.pages.length);
    const def = { endpapers: true, welcome: !designed, sections: !designed, thanks: !designed };
    const saved = (a.design && a.design.pages) || {};
    const out = {};
    Object.keys(def).forEach((k) => { out[k] = typeof saved[k] === 'boolean' ? saved[k] : def[k]; });
    return out;
  }

  window.PageEditor = { mount };
})();
