/* Admin: studio accounts, album shelf, new-album wizard, album details with the front cover / back cover / endpaper
   picker, uploads (photos, designed pages, PDF), blessings, the master's studio approvals and the studio profile. */
(function () {
  'use strict';
  const M = window.AlbumMeta, CT = window.CoverTemplates;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = M.esc;
  const view = $('#view');
  const state = { user: null, pendingStudios: 0, albums: [], unregistered: [], filter: 'all', q: '', draft: null, current: null, studios: null };

  // shown in photo designs until real photos exist
  const PHOTO_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#F6B26B"/><stop offset=".55" stop-color="#E0726C"/><stop offset="1" stop-color="#5B3A5E"/></linearGradient></defs>' +
    '<rect width="300" height="200" fill="url(#s)"/><circle cx="210" cy="92" r="24" fill="#FFE2B0" opacity=".9"/>' +
    '<path d="M0 150 Q60 110 120 140 T240 128 T300 136 V200 H0Z" fill="#3B2440"/><path d="M0 172 Q90 140 170 166 T300 160 V200 H0Z" fill="#24162A"/>' +
    '<path d="M132 168 v-26 a6 6 0 0 1 12 0 v26 M150 168 v-30 a6 6 0 0 1 12 0 v30" fill="#140c18"/></svg>');
  const ACCENTS = ['#C8255F', '#EFA00B', '#D7263D', '#1B6CA8', '#5B8C2A', '#8E6BBF', '#E86A92'];
  const PARTS = [['cover', 'Front cover'], ['back', 'Back cover'], ['endpaper', 'Endpaper']];
  const SPREAD_RATIO = 1.9;   // wider than this, an image is taken to hold two pages side by side
  const PART_KIND = { cover: 'cover', back: 'back', endpaper: 'inside-front' };

  /* ---------- helpers ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800);
  }
  async function api(path, opts = {}) {
    const res = await fetch('/api/admin/' + path, {
      credentials: 'same-origin', method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.form || (opts.body ? JSON.stringify(opts.body) : undefined),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !['login', 'signup'].includes(path)) { showSignin(); throw new Error(data.error || 'Sign in again.'); }
    if (!res.ok) throw new Error(data.error || 'The server answered ' + res.status + '.');
    return data;
  }
  const typeLabel = (t) => (M.TYPES[t] || {}).label || 'Other';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const bytes = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB');

  /* ---------- covers ---------- */
  function ratioOf(a) {
    if (a.media && a.media.pages && a.media.pages.length) {
      const p = a.media.pages[0];
      return p.spread ? p.width / p.height / 2 : p.width / p.height;
    }
    const b = a.built || {};
    return b.pageWidth ? b.pageWidth / b.pageHeight : 1.5;
  }
  function photoOf(a) {
    return (a.built && a.built.cover) || (a.uploads && a.uploads.cover) || (a.media && a.media.cover) || '';
  }
  // render a part (cover / back / inside-front) with placeholders for empty details
  function partSvg(a, kind = 'cover', override) {
    const design = Object.assign({}, a.designView || {}, override || {});
    const data = Object.assign({}, a, { design, theme: M.theme(a) });
    return CT.render(kind, data, { ratio: ratioOf(a), placeholders: true, photo: photoOf(a) || PHOTO_PLACEHOLDER });
  }
  // the extra pages the album adds around the photos; ticks are saved in design.pages (only the ones that differ from the default)
  const EXTRA_PAGES = [
    ['endpapers', 'Endpapers', 'inside-front', 'Patterned pages just inside the front and back cover'],
    ['welcome', 'Welcome page', 'title', 'The names, place and date, before the first photo'],
    ['sections', 'Section pages', 'divider', 'The ceremony name (Haldi, Mehendi…) before each section of photos'],
    ['thanks', 'Thank-you page', 'closing', 'A closing page at the end of the album'],
  ];
  const isDesigned = (a) => !!(a.media && a.media.pages && a.media.pages.length);
  // same defaults as lib/layout.js pageOptions(): designed albums only get endpapers unless ticked
  const pageDefaults = (designed) => ({ endpapers: true, welcome: !designed, sections: !designed, thanks: !designed });
  function pageChoices(a) {
    const def = pageDefaults(isDesigned(a)), saved = (a.design && a.design.pages) || {};
    return Object.fromEntries(Object.keys(def).map((k) => [k, typeof saved[k] === 'boolean' ? saved[k] : def[k]]));
  }
  function pageSvg(a, kind, text) {
    const data = Object.assign({}, a, { design: Object.assign({}, a.designView || {}), theme: M.theme(a) });
    return CT.render(kind, data, { ratio: ratioOf(a), placeholders: true, photo: photoOf(a) || PHOTO_PLACEHOLDER, text });
  }
  function bookHtml(a, { kind = 'cover', cls = '', ribbon = false } = {}) {
    const r = ratioOf(a);
    return `<div class="book ${cls}" style="--ratio:${r}">${ribbon ? '<span class="ribbon" title="Draft"></span>' : ''}` +
      `<div class="leaves"></div><div class="board">${partSvg(a, kind)}</div></div>`;
  }

  /* ---------- sign in / sign up ---------- */
  function showAuth(which) {
    $('#loginForm').hidden = which !== 'login';
    $('#signupForm').hidden = which !== 'signup';
    $('#signupDone').hidden = which !== 'done';
  }
  function showSignin() {
    $('#signin').hidden = false; $('#shell').hidden = true;
    const samples = [
      { names: ['Aarav', 'Ananya'], type: 'wedding', template: 'jharokha', date: '2026-02-12', location: 'Udaipur' },
      { names: ['Kabir', 'Ira'], type: 'engagement', template: 'mandala', date: '2026-12-14', location: 'Jaipur' },
      { names: ['Rohan', 'Meera'], type: 'sangeet', template: 'toran', date: '2025-11-30', location: 'Pune' },
    ];
    $('#signinArt').innerHTML = samples.map((s, i) =>
      `<div class="fan" style="transform: translate(-50%, -50%) rotate(${[-12, -3, 7][i]}deg) translate(${[-40, 0, 46][i]}px, ${[24, 0, -18][i]}px)">${partSvg(s)}</div>`).join('');
    showAuth('login');
  }
  document.querySelectorAll('[data-auth]').forEach((b) => b.addEventListener('click', () => showAuth(b.dataset.auth)));

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = $('#loginNote');
    note.className = 'form-note'; note.textContent = 'Signing in…';
    try {
      await api('login', { method: 'POST', body: { email: e.target.email.value, password: e.target.password.value } });
      e.target.reset(); note.textContent = '';
      await start();
    } catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
  });
  $('#signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, note = $('#signupNote');
    note.className = 'form-note'; note.textContent = 'Creating your account…';
    try {
      await api('signup', { method: 'POST', body: { studioName: f.studioName.value, name: f.name.value, email: f.email.value, phone: f.phone.value, city: f.city.value, password: f.password.value } });
      f.reset(); note.textContent = '';
      showAuth('done');
    } catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
  });
  $('#signOut').addEventListener('click', async () => {
    await fetch('/api/admin/session', { method: 'DELETE', credentials: 'same-origin' });
    location.hash = ''; state.user = null;
    showSignin();
  });

  function applyMode(mode) {
    M.setMode(mode);
    const b = $('#themeBtn');
    b.querySelector('use').setAttribute('href', mode === 'dark' ? '#i-sun' : '#i-moon');
    b.title = mode === 'dark' ? 'Light background' : 'Dark background';
  }
  $('#themeBtn').addEventListener('click', () => applyMode(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  applyMode(M.getMode());

  function paintNav() {
    const u = state.user;
    $('#who').textContent = u.isMaster ? 'Master' : (u.studio && u.studio.name) || '';
    $('#navStudios').hidden = !u.isMaster;
    $('#navStudio').hidden = u.isMaster;
    const badge = $('#pendingBadge');
    badge.hidden = !state.pendingStudios;
    badge.textContent = state.pendingStudios;
    const cur = location.hash.replace(/^#/, '').split('/')[0];
    document.querySelectorAll('#nav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.nav === (cur === 'studios' ? 'studios' : cur === 'studio' ? 'studio' : 'albums')));
  }

  /* ---------- routing ---------- */
  function route() {
    const parts = location.hash.replace(/^#/, '').split('/').map(decodeURIComponent);
    window.scrollTo(0, 0);
    closeModal();
    paintNav();
    $('#searchBox').hidden = !!parts[0];
    if (!parts[0]) return shelf();
    if (parts[0] === 'new') return wizardDetails(null);
    if (parts[0] === 'add') return wizardDetails(parts[1]);
    if (parts[0] === 'album') return albumPage(parts[1], parts[2] || 'details');
    if (parts[0] === 'studios' && state.user.isMaster) return studiosPage();
    if (parts[0] === 'studio') return studioPage();
    return shelf();
  }
  addEventListener('hashchange', () => { if (state.user) route(); });

  /* ---------- shelf ---------- */
  async function shelf() {
    view.innerHTML = '';
    try {
      const data = await api('albums');
      state.albums = data.albums; state.unregistered = data.unregistered || [];
      renderShelf();
    } catch (err) { toast(err.message); }
  }

  function renderShelf() {
    const all = state.albums;
    const views30 = all.reduce((n, a) => n + a.stats.views30, 0);
    const pending = all.reduce((n, a) => n + a.stats.pending, 0);
    const types = [...new Set(all.map((a) => a.type))];
    const q = state.q.trim().toLowerCase();
    const shown = all.filter((a) => (state.filter === 'all' || (state.filter === 'draft' ? a.status === 'draft' : a.type === state.filter)) &&
      (!q || [M.title(a), a.location, a.id, a.ownerStudio, ...(a.names || [])].join(' ').toLowerCase().includes(q)));
    const studioLine = state.user.isMaster && state.pendingStudios
      ? ` <a class="warn" href="#studios">${plural(state.pendingStudios, 'studio is', 'studios are')} waiting for approval.</a>` : '';
    const intro = all.length
      ? `<b>${plural(all.length, 'album', 'albums')}</b> on ${state.user.isMaster ? 'all shelves' : 'your shelf'}, with <b>${plural(views30, 'view', 'views')}</b> in the last 30 days` +
        (pending ? ` and <span class="warn">${plural(pending, 'blessing', 'blessings')} waiting for you</span>.` : '.') + studioLine
      : 'Your shelf is empty. Start an album with its details and covers; the photos can come later.' + studioLine;
    const filters = all.length ? `<div class="filters" role="group" aria-label="Show">` +
      [['all', 'All albums'], ...types.map((t) => [t, typeLabel(t)]), ...(all.some((a) => a.status === 'draft') ? [['draft', 'Drafts']] : [])]
        .map(([k, l]) => `<button data-filter="${esc(k)}" aria-pressed="${state.filter === k}">${esc(l)}</button>`).join('') + '</div>' : '';

    const items = shown.map((a, i) => `
      <a class="shelf-item" href="#album/${encodeURIComponent(a.id)}" style="animation-delay:${Math.min(i, 12) * 40}ms">
        ${bookHtml(a, { ribbon: a.status === 'draft' })}
        <h3>${esc(M.title(a))}</h3>
        <p class="sub">${esc(M.subtitle(a) || typeLabel(a.type))}${a.status === 'draft' ? ', draft' : ''}</p>
        ${state.user.isMaster ? `<p class="owner"><svg class="i"><use href="#i-store"/></svg>${esc(a.ownerStudio || 'No studio')}</p>` : ''}
        <div class="meta-row">
          <span title="Views"><svg><use href="#i-eye"/></svg>${a.stats.views}</span>
          <span title="Hearts"><svg><use href="#i-heart"/></svg>${a.stats.hearts}</span>
          <span title="Blessings" class="${a.stats.pending ? 'pending' : ''}"><svg><use href="#i-bless"/></svg>${a.stats.messages}${a.stats.pending ? ', ' + a.stats.pending + ' new' : ''}</span>
        </div>
      </a>`).join('');
    const ghosts = (state.filter === 'all' && !q ? state.unregistered : []).map((b) => `
      <a class="shelf-item" href="#add/${encodeURIComponent(b.id)}">
        <div class="book ghost"><div class="board">${b.cover ? `<img src="${esc(b.cover)}" alt="">` : ''}</div></div>
        <h3>${esc(b.title || b.id)}</h3><p class="sub">${plural(b.photos, 'photo', 'photos')} built. Add the details to put it on the shelf.</p>
      </a>`).join('');
    const add = state.filter === 'all' && !q ? `
      <a class="shelf-item" href="#new">
        <div class="book new"><div class="board"><svg><use href="#i-plus"/></svg></div></div>
        <h3>Start a new album</h3><p class="sub">Add the details, then pick or upload the covers</p>
      </a>` : '';
    view.innerHTML = `<p class="intro">${intro}</p>${filters}<div class="shelf">${items}${ghosts}${add}</div>` +
      (!shown.length && all.length && q ? `<p class="hint">No album matches "${esc(state.q)}".</p>` : '');
    view.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderShelf(); }));
  }
  $('#search').addEventListener('input', (e) => { state.q = e.target.value; if (!location.hash.replace('#', '')) renderShelf(); });

  /* ---------- design picker (grid with occasion filter) ---------- */
  function occasionChips(type, current) {
    const occ = Object.keys(M.TYPES);
    const chips = [['suggested', 'Suggested for ' + typeLabel(type).toLowerCase()], ['all', 'All designs'], ['photos', 'With photos'],
      ...occ.filter((o) => o !== type).map((o) => [o, typeLabel(o)])];
    return `<div class="filters occ" role="group" aria-label="Show designs">` +
      chips.map(([k, l]) => `<button type="button" data-occ="${k}" aria-pressed="${current === k}">${esc(l)}</button>`).join('') + '</div>';
  }
  function designsFor(type, occ) {
    const list = CT.list;
    if (occ === 'all') return list;
    if (occ === 'photos') return list.filter((t) => t.slots > 0);
    const want = occ === 'suggested' ? type : occ;
    const hits = list.filter((t) => (t.occasions || []).includes(want));
    return hits.length ? hits : list;
  }
  // cards rendered for one part of an album; selected = current key
  function designCards(a, part, keys, selected) {
    const kind = PART_KIND[part];
    return keys.map((t, i) => `
      <button type="button" class="tpl" data-key="${t.key}" aria-pressed="${t.key === selected}" style="animation-delay:${Math.min(i, 10) * 40}ms">
        <div class="frame" style="--ratio:${ratioOf(a)}">${partSvg(a, kind, { [part]: { template: t.key } })}<span class="check"><svg><use href="#i-check"/></svg></span></div>
        <h3>${esc(t.name)}</h3><p>${esc(t.description || '')}${t.slots ? `. Holds ${plural(t.slots, 'photo', 'photos')}.` : ''}</p>
      </button>`).join('');
  }
  function mountPicker(host, { album, part, getSelected, onPick }) {
    let occ = 'suggested';
    function draw() {
      host.innerHTML = occasionChips(album.type, occ) + `<div class="templates">${designCards(album, part, designsFor(album.type, occ), getSelected())}</div>`;
    }
    host.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-occ]');
      if (chip) { occ = chip.dataset.occ; draw(); return; }
      const card = e.target.closest('.tpl');
      if (card) {
        host.querySelectorAll('.tpl').forEach((x) => x.setAttribute('aria-pressed', String(x === card)));
        onPick(card.dataset.key);
      }
    });
    draw();
    return { redraw: draw };
  }
  const currentKey = (a, part) => (a.designView && a.designView[part] && a.designView[part].template) ||
    (part === 'cover' ? a.template : '') || (part !== 'cover' && a.designView && a.designView.cover && a.designView.cover.template) ||
    a.template || CT.defaultFor(a.type);

  /* ---------- new album: one page with the details, covers and endpaper ---------- */
  function blankDraft() {
    let studio = {};
    try { studio = JSON.parse(localStorage.getItem('albumviewer:studio') || '{}'); } catch (e) { /* ignore */ }
    return { id: '', type: 'wedding', names: ['', ''], title: '', date: '', location: '', studio, music: '', downloadUrl: '', accent: '',
      template: '', designView: {}, pending: {}, status: 'draft', requireApproval: false, studioId: '' };
  }
  function wizardDetails(presetId) {
    if (presetId) {
      const b = state.unregistered.find((x) => x.id === presetId) || { id: presetId };
      if (!state.draft || state.draft.id !== presetId || state.draft.saved) {
        state.draft = Object.assign(blankDraft(), { id: presetId, type: b.type || 'wedding', names: (b.names && b.names.length ? b.names : ['', '']).slice(),
          date: b.date || '', location: b.location || '', template: b.template || '' });
        state.draft.built = { pageWidth: b.pageWidth, pageHeight: b.pageHeight, cover: b.cover };
        state.draft.idLocked = true;
      }
    } else if (!state.draft || state.draft.saved || state.draft.idLocked) state.draft = blankDraft();
    view.innerHTML = `
      <div class="crumbs"><a href="#"><svg class="i"><use href="#i-back"/></svg>All albums</a></div>
      <h1 class="page-title display">A new album</h1>
      <p class="lede">Fill in the details, then choose a design for the front cover, back cover and endpaper, or upload your own from your computer. Everything except the album link can be changed later.</p>
      <div id="editorHost"></div>`;
    mountEditor($('#editorHost'), state.draft, { isNew: true });
  }

  /* ---------- details editor (new + edit) ---------- */
  function slugFor(a) {
    const clean = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const base = clean((a.names || []).filter(Boolean).join('-') || a.title) || clean(a.type) || 'album';
    return (base + (a.date ? '-' + a.date.slice(0, 4) : '')).slice(0, 64);
  }
  async function studioOptions(selected) {
    if (!state.user.isMaster) return '';
    if (!state.studios) state.studios = (await api('master/studios')).studios;
    return `<section class="sheet"><div><h2>Studio</h2><p class="why">The studio this album belongs to. Its owner can edit it.</p></div>
      <div class="fields"><label class="field"><span>Belongs to</span><select name="studioId"><option value="">No studio (master only)</option>` +
      state.studios.map((s) => `<option value="${esc(s.id)}"${s.id === selected ? ' selected' : ''}>${esc(s.name)}${s.status !== 'active' ? ' (' + s.status + ')' : ''}</option>`).join('') +
      '</select></label></div></section>';
  }

  async function mountEditor(host, a, { isNew }) {
    const names = (a.names && a.names.length ? a.names : ['', '']).slice();
    while (names.length < 2) names.push('');
    const st = a.studio || {};
    const studioSheet = await studioOptions(a.studioId || '');
    const fallbackStudio = (state.user.studio && state.user.studio.name) || '';
    host.innerHTML = `
      <form class="editor" id="albumForm" novalidate>
        <div>
          <section class="sheet"><div><h2>Who and what</h2><p class="why">The names are the title of the album, on the cover and at the top of every page.</p></div>
            <div class="fields">
              <label class="field"><span>Occasion</span><select name="type">${Object.entries(M.TYPES).map(([k, t]) => `<option value="${k}"${k === a.type ? ' selected' : ''}>${esc(t.label || 'Other')}</option>`).join('')}</select></label>
              <div class="names" id="names"></div>
              <button type="button" class="link" id="addName">Add another name</button>
              <label class="field"><span>Title <em>optional, for example "The Sharma family". The names are used when this is empty.</em></span><input name="title" maxlength="120" value="${esc(a.title || '')}" /></label>
            </div></section>
          <section class="sheet"><div><h2>When and where</h2><p class="why">Shown as "Wedding in Udaipur on 12 February 2026".</p></div>
            <div class="fields two">
              <label class="field"><span>Date</span><input type="date" name="date" value="${esc(a.date || '')}" /></label>
              <label class="field"><span>Location</span><input name="location" maxlength="120" value="${esc(a.location || '')}" placeholder="Udaipur" /></label>
            </div></section>
          <section class="sheet"><div><h2>Front cover, back cover and endpaper</h2><p class="why">Pick a design for each, or upload the studio's own custom design from your computer. Empty details show sample text until you fill them in.</p></div>
            <div class="fields"><div class="parts" id="parts"></div>
              <div class="cover-spread">
                <label class="btn quiet upload-btn"><svg><use href="#i-upload"/></svg>Upload back + front cover as one image<input type="file" accept="image/*" data-cover-spread hidden /></label>
                <p class="hint">For a cover designed as one wide image: the left half becomes the back cover and the right half the front cover.</p>
              </div>
              ${isNew ? '<p class="hint">Uploaded images are saved with the album when you create it.</p>' : ''}</div></section>
          <section class="sheet"><div><h2>Extra pages</h2><p class="why">Pages the album adds around your photos. Untick any you don't want.${isDesigned(a) ? ' This album uses your designed pages, so only the endpapers are on unless you tick more.' : ''}</p></div>
            <div class="fields"><div class="extras" id="extras">${EXTRA_PAGES.map(([k, l, , hint]) => {
              const off = k === 'sections' && isDesigned(a);
              return `<label class="extra${off ? ' off' : ''}"><span class="extra-img" data-extra-img="${k}" style="--ratio:${ratioOf(a)}"></span>
                <span class="extra-row"><input type="checkbox" name="pg_${k}"${pageChoices(a)[k] ? ' checked' : ''}${off ? ' disabled' : ''} /><b>${l}</b></span>
                <small>${off ? 'Only for albums laid out from photos' : hint}</small></label>`;
            }).join('')}</div></div></section>
          ${isNew ? `<section class="sheet"><div><h2>Album link</h2><p class="why">Guests open the album at this address. It cannot be changed later.</p></div>
            <div class="fields"><label class="field"><span>Link</span><input name="id" maxlength="64" value="${esc(a.id || '')}" ${a.idLocked ? 'readonly' : ''} /></label>
            <p class="hint" id="linkHint"></p></div></section>` : ''}
          ${studioSheet}
          <section class="sheet"><div><h2>Photographer credit</h2><p class="why">Printed on the back cover. Leave empty to use ${fallbackStudio ? `your studio profile (${esc(fallbackStudio)})` : 'the studio profile'}.</p></div>
            <div class="fields">
              <label class="field"><span>Studio name</span><input name="studioName" maxlength="100" value="${esc(st.name || '')}" placeholder="${esc(fallbackStudio)}" /></label>
              <div class="two">
                <label class="field"><span>Phone</span><input name="studioPhone" maxlength="40" inputmode="tel" value="${esc(st.phone || '')}" /></label>
                <label class="field"><span>Website</span><input name="studioUrl" maxlength="300" placeholder="https://" value="${esc(st.url || '')}" /></label>
              </div>
            </div></section>
          <section class="sheet"><div><h2>Colour</h2><p class="why">The accent on the cover, buttons and highlights. Each occasion has its own.</p></div>
            <div class="fields"><div class="swatches" id="swatches"></div></div></section>
          <section class="sheet"><div><h2>Extras</h2><p class="why">Optional. Music plays softly after a guest's first click.</p></div>
            <div class="fields">
              <label class="field"><span>Background music <em>a web address of an mp3</em></span><input name="music" maxlength="300" value="${esc(a.music || '')}" placeholder="https://…/song.mp3" /></label>
              <label class="field"><span>Download all photos <em>for example a Google Drive folder</em></span><input name="downloadUrl" maxlength="500" value="${esc(a.downloadUrl || '')}" placeholder="https://drive.google.com/…" /></label>
            </div></section>
          <section class="sheet"><div><h2>Who can open it</h2><p class="why">Drafts stay on your shelf until you publish them.</p></div>
            <div class="fields">
              <div class="choice">
                <label><input type="radio" name="status" value="draft"${a.status !== 'published' ? ' checked' : ''} /><span>Draft</span><small>Only you can open it</small></label>
                <label><input type="radio" name="status" value="published"${a.status === 'published' ? ' checked' : ''} /><span>Published</span><small>Anyone with the link (and the guest password, if one is set) can open it</small></label>
              </div>
              <label class="check"><input type="checkbox" name="requireApproval"${a.requireApproval ? ' checked' : ''} /> Read blessings before guests see them</label>
            </div></section>
          <div class="save-bar">
            <button class="btn" type="submit" id="saveBtn">${isNew ? 'Create album' : 'Save changes'}</button>
            <p class="form-note" id="formNote" role="status"></p>
            ${isNew ? '' : '<button class="btn danger" type="button" id="deleteBtn">Delete album</button>'}
          </div>
        </div>
        <aside class="preview" aria-label="Preview">
          <div class="preview-tabs" role="group" aria-label="Show">
            ${PARTS.map(([k, l], i) => `<button type="button" data-kind="${PART_KIND[k]}" aria-pressed="${i === 0}">${l}</button>`).join('')}
          </div>
          <div id="pvBook"></div>
          <p class="link-line" id="pvLink"></p>
        </aside>
      </form>`;

    const form = $('#albumForm');
    const box = $('#names');
    function nameRow(value, i) {
      const row = document.createElement('div');
      row.className = 'name-row';
      row.innerHTML = `<label class="field"><span>${i === 0 ? 'Name' : 'And'}</span><input name="name" maxlength="60" /></label>`;
      row.querySelector('input').value = value || '';
      if (i > 1) {
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'btn quiet'; rm.textContent = 'Remove';
        rm.addEventListener('click', () => { row.remove(); refresh(); });
        row.appendChild(rm);
      }
      return row;
    }
    names.forEach((n, i) => box.appendChild(nameRow(n, i)));
    $('#addName').addEventListener('click', () => {
      if (box.children.length >= 6) { toast('An album can have at most 6 names.'); return; }
      box.appendChild(nameRow('', box.children.length));
      box.lastChild.querySelector('input').focus();
    });

    let accent = a.accent || '';
    function drawSwatches() {
      const def = (M.TYPES[form.elements.type.value] || M.TYPES.wedding).accent;
      $('#swatches').innerHTML =
        `<button type="button" class="swatch" data-c="" title="The colour for this occasion" aria-pressed="${!accent}" style="background:${def}"></button>` +
        ACCENTS.filter((c) => c.toLowerCase() !== def.toLowerCase()).map((c) => `<button type="button" class="swatch" data-c="${c}" title="${c}" aria-pressed="${accent.toLowerCase() === c.toLowerCase()}" style="background:${c}"></button>`).join('') +
        `<label title="Any colour"><span class="sr">Any colour</span><input type="color" value="${accent || def}" /></label>`;
    }
    $('#swatches').addEventListener('click', (e) => { const b = e.target.closest('.swatch'); if (!b) return; accent = b.dataset.c; drawSwatches(); refresh(); });
    $('#swatches').addEventListener('input', (e) => { if (e.target.type === 'color') { accent = e.target.value; refresh(); } });

    let kind = 'cover', idTouched = !!a.idLocked || !isNew;
    form.querySelectorAll('.preview-tabs button').forEach((b) => b.addEventListener('click', () => {
      kind = b.dataset.kind;
      form.querySelectorAll('.preview-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      refresh();
    }));

    function read() {
      const f = form.elements;
      return {
        id: isNew ? f.id.value.trim().toLowerCase() : a.id,
        type: f.type.value,
        title: f.title.value.trim(),
        names: Array.from(form.querySelectorAll('input[name="name"]')).map((i) => i.value.trim()).filter(Boolean),
        date: f.date.value,
        location: f.location.value.trim(),
        studio: { name: f.studioName.value.trim(), phone: f.studioPhone.value.trim(), url: f.studioUrl.value.trim() },
        music: f.music.value.trim(),
        downloadUrl: f.downloadUrl.value.trim(),
        accent,
        template: a.template || '',
        status: form.querySelector('input[name="status"]:checked').value,
        requireApproval: f.requireApproval.checked,
        studioId: f.studioId ? f.studioId.value : undefined,
        pages: (() => {
          const def = pageDefaults(isDesigned(a)), out = {};
          for (const k of Object.keys(def)) { const box = f['pg_' + k]; if (box && !box.disabled && box.checked !== def[k]) out[k] = box.checked; }
          return out;
        })(),
      };
    }
    // the preview album: what is typed, plus the chosen designs and photos
    function shown() {
      const v = read();
      if (!v.studio.name && fallbackStudio) v.studio.name = fallbackStudio;
      return Object.assign({}, a, v);
    }
    function drawParts() {
      const s = shown();
      $('#parts').innerHTML = PARTS.map(([k, l]) => {
        const dv = (s.designView || {})[k] || {};
        const t = CT.list.find((x) => x.key === currentKey(s, k));
        return `<div class="part" data-part="${k}">
          <button type="button" class="part-img" data-open="${k}" style="--ratio:${ratioOf(s)}" aria-label="Choose a design for the ${l.toLowerCase()}">${partSvg(s, PART_KIND[k])}</button>
          <span class="part-name">${l}</span>
          <span class="part-sub">${dv.upload ? 'Your own image' : 'Design: ' + esc(t ? t.name : '')}</span>
          <div class="part-actions">
            <button type="button" class="btn quiet sm" data-open="${k}"><svg><use href="#i-book"/></svg>Designs</button>
            <label class="btn quiet sm upload-btn"><svg><use href="#i-upload"/></svg>${dv.upload ? 'Replace' : 'Upload'}<input type="file" accept="image/*" data-part-upload="${k}" hidden /></label>
          </div>
          ${dv.upload ? `<button type="button" class="link part-remove" data-part-remove="${k}">Remove, use a design</button>` : ''}
        </div>`;
      }).join('');
    }
    function refresh() {
      const v = read();
      if (isNew && !idTouched) { form.elements.id.value = slugFor(v); v.id = form.elements.id.value; }
      $('#pvBook').innerHTML = bookHtml(shown(), { kind, cls: 'open' });
      $('#pvLink').innerHTML = 'Guests open it at <code>' + esc(location.origin + '/a/' + (v.id || 'album-link')) + '</code>';
      if (isNew && $('#linkHint')) $('#linkHint').textContent = /^[a-z0-9][a-z0-9-]{1,63}$/.test(v.id) ? '' : 'Use lowercase letters, numbers and dashes.';
      if (isNew) Object.assign(state.draft, v, { names: v.names.length ? v.names : state.draft.names, studioId: v.studioId || '' });
      drawParts();
      const sv = shown();
      EXTRA_PAGES.forEach(([k, , kind]) => { const el = form.querySelector(`[data-extra-img="${k}"]`); if (el) el.innerHTML = pageSvg(sv, kind, 'Haldi'); });
    }
    $('#parts').addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-part-remove]');
      if (rm) {
        try { await setPartDesign(a, { part: rm.dataset.partRemove, removeUpload: true }, isNew); refresh(); toast('Your image was removed'); } catch (err) { toast(err.message); }
        return;
      }
      const b = e.target.closest('[data-open]'); if (!b) return;
      openDesignModal(a, b.dataset.open, { isDraft: isNew, preview: shown, onChange: refresh });
    });
    $('#parts').addEventListener('change', async (e) => {
      const input = e.target;
      if (!input.dataset.partUpload || !input.files || !input.files[0]) return;
      const label = input.closest('label');
      label.classList.add('busy');
      const name = PARTS.find((x) => x[0] === input.dataset.partUpload)[1];
      try {
        const how = await uploadPart(a, input.dataset.partUpload, input.files[0], { isDraft: isNew });
        refresh(); toast(how === 'split' ? 'Split into the back cover and front cover' : name + (isNew ? ' added' : ' uploaded'));
      } catch (err) { toast(err.message); label.classList.remove('busy'); }
    });
    form.querySelector('[data-cover-spread]').addEventListener('change', async (e) => {
      const input = e.target;
      if (!input.files || !input.files[0]) return;
      const label = input.closest('label');
      label.classList.add('busy');
      try { await uploadCoverSpread(a, input.files[0], isNew); refresh(); toast('Split into the back cover and front cover'); }
      catch (err) { toast(err.message); }
      finally { label.classList.remove('busy'); input.value = ''; }
    });
    form.addEventListener('input', (e) => {
      if (e.target.type === 'file') return;   // handled on change; redrawing here would remove the input first
      if (e.target.name === 'id') idTouched = true;
      if (e.target.name === 'type') drawSwatches();
      refresh();
    });
    drawSwatches();
    refresh();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = read();
      const note = $('#formNote');
      note.className = 'form-note';
      if (!v.names.length && !v.title) { note.className = 'form-note error'; note.textContent = 'Add at least one name or a title.'; return; }
      if (isNew && !/^[a-z0-9][a-z0-9-]{1,63}$/.test(v.id)) { note.className = 'form-note error'; note.textContent = 'The album link may only use lowercase letters, numbers and dashes.'; return; }
      const btn = $('#saveBtn');
      btn.disabled = true;
      note.textContent = isNew ? 'Creating…' : 'Saving…';
      try {
        if (isNew) {
          const design = {};
          for (const [k] of PARTS) { const t = state.draft.designView && state.draft.designView[k] && state.draft.designView[k].template; if (t) design[k] = { template: t }; }
          if (Object.keys(v.pages).length) design.pages = v.pages;
          await api('albums', { method: 'POST', body: Object.assign({}, v, { template: state.draft.template || '', design }) });
          state.draft.saved = true;
          if (Object.keys(state.draft.pending || {}).length) {
            note.textContent = 'Uploading your images…';
            try { await sendPending(Object.assign(state.draft, { id: v.id })); }
            catch (err) { toast('The album was created, but an image did not upload: ' + err.message); location.hash = '#album/' + encodeURIComponent(v.id); return; }
          }
          toast('Album created');
          location.hash = '#album/' + encodeURIComponent(v.id) + '/photos';
        } else {
          const r = await api('albums/' + encodeURIComponent(a.id), { method: 'PUT', body: v });
          Object.assign(a, r.album, { designView: a.designView });
          note.textContent = 'Saved';
          toast('Changes saved');
          paintHero(a);
        }
        try { localStorage.setItem('albumviewer:studio', JSON.stringify(v.studio)); } catch (err) { /* ignore */ }
      } catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
      finally { btn.disabled = false; }
    });

    const del = $('#deleteBtn');
    if (del) del.addEventListener('click', async () => {
      if (!confirm(`Delete "${M.title(a)}"? Its details, uploaded photos, blessings, hearts and view counts are removed for good.`)) return;
      try { await api('albums/' + encodeURIComponent(a.id), { method: 'DELETE' }); toast('Album deleted'); location.hash = ''; }
      catch (err) { toast(err.message); }
    });
  }

  /* ---------- the front cover / back cover / endpaper modal ---------- */
  function closeModal() { const m = $('#modal'); if (m) { m.hidden = true; $('#modalCard').innerHTML = ''; document.body.classList.remove('modal-open'); } }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  /* Your own image for a part (or a photo in a design's slot). For a new album that is not created yet,
     the image is kept in the browser (a.pending) and shown from a blob URL, then uploaded by sendPending(). */
  function postDesignFile(id, part, file, slot) {
    const form = new FormData();
    form.append('kind', 'design'); form.append('part', part);
    if (slot !== undefined) form.append('slot', String(slot));
    form.append('file', file, 'design.jpg');
    return api('albums/' + encodeURIComponent(id) + '/upload', { method: 'POST', form });
  }
  function dropPending(a, part, wholeOnly) {
    for (const [k, p] of Object.entries(a.pending || {})) {
      if (p.part === part && (!wholeOnly || p.slot === undefined)) { URL.revokeObjectURL(p.url); delete a.pending[k]; }
    }
  }
  // one image with the back cover on the left half and the front cover on the right half (as printed on a real album)
  async function splitHalves(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const half = Math.floor(bmp.width / 2);
    const cut = (sx) => {
      const c = document.createElement('canvas');
      c.width = half; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, sx, 0, half, bmp.height, 0, 0, half, bmp.height);
      return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    };
    const out = [await cut(0), await cut(bmp.width - half)];
    bmp.close && bmp.close();
    return out;
  }
  async function uploadCoverSpread(a, file, isDraft) {
    const [left, right] = await splitHalves(file);
    await uploadPart(a, 'back', left, { isDraft, whole: true });
    await uploadPart(a, 'cover', right, { isDraft, whole: true });
  }
  async function imageRatio(file) {
    const bmp = await createImageBitmap(file);
    const r = bmp.width / bmp.height;
    bmp.close && bmp.close();
    return r;
  }
  // returns 'split' when a wide cover image was split into back + front cover
  async function uploadPart(a, part, file, { slot, isDraft, whole } = {}) {
    if (!whole && slot === undefined && (part === 'cover' || part === 'back') && await imageRatio(file) > SPREAD_RATIO &&
      confirm('This image looks like the back cover and front cover together.\n\nOK: split it, left half as the back cover and right half as the front cover.\nCancel: use the whole image as the ' + (part === 'cover' ? 'front' : 'back') + ' cover.')) {
      await uploadCoverSpread(a, file, isDraft);
      return 'split';
    }
    const img = await prepareImage(file, 3000, 0);
    if (isDraft) {
      a.pending = a.pending || {};
      const k = part + (slot === undefined ? '' : ':' + slot);
      if (a.pending[k]) URL.revokeObjectURL(a.pending[k].url);
      const url = URL.createObjectURL(img.file);
      a.pending[k] = { part, slot, file: img.file, url };
      a.designView = Object.assign({}, a.designView);
      const d = a.designView[part] = Object.assign({}, a.designView[part]);
      if (slot === undefined) d.upload = url;
      else { d.photos = (d.photos || []).slice(); d.photos[slot] = url; }
      return;
    }
    await postDesignFile(a.id, part, img.file, slot);
    const fresh = await api('albums/' + encodeURIComponent(a.id));
    a.design = fresh.album.design; a.designView = fresh.designView;
  }
  async function sendPending(a) {
    for (const [k, p] of Object.entries(a.pending || {})) {
      await postDesignFile(a.id, p.part, p.file, p.slot);
      URL.revokeObjectURL(p.url); delete a.pending[k];
    }
  }
  // pick a design / remove your image / use an album photo / fill a slot
  async function setPartDesign(a, body, isDraft) {
    if (isDraft) {
      a.designView = Object.assign({}, a.designView);
      const d = Object.assign({}, a.designView[body.part]);
      if (body.removeUpload || body.template) { dropPending(a, body.part, true); delete d.upload; }
      if (body.template) { d.template = body.template; if (body.part === 'cover') a.template = body.template; }
      a.designView[body.part] = d;
      return;
    }
    const r = await api('albums/' + encodeURIComponent(a.id) + '/design', { method: 'PUT', body });
    a.design = r.design; a.designView = r.designView;
  }

  function openDesignModal(a, startPart, { isDraft, preview, onChange }) {
    // a fresh card each time, so listeners from an earlier opening go away
    const old = $('#modalCard'); const card = old.cloneNode(false); old.replaceWith(card);
    let part = startPart;
    $('#modal').hidden = false;
    document.body.classList.add('modal-open');
    function photosOfAlbum() { return (a.media && a.media.photos) || []; }
    function pagesOfAlbum() { return (a.media && a.media.pages) || []; }
    const saveDesign = (body) => setPartDesign(a, body, isDraft);
    const uploadDesign = (file, slot) => uploadPart(a, part, file, { slot, isDraft });

    function draw() {
      const p = preview ? Object.assign(preview(), { designView: a.designView, template: a.template }) : a;
      const dv = (a.designView || {})[part] || {};
      const key = currentKey(p, part);
      const t = CT.list.find((x) => x.key === key) || { slots: 0 };
      const slots = part === 'cover' && !dv.upload ? (t.slots || 0) : 0;
      const hasMedia = photosOfAlbum().length || pagesOfAlbum().length;
      const label = PARTS.find((x) => x[0] === part)[1];
      card.innerHTML = `
        <div class="modal-head"><h2 class="display" id="modalTitle">Front cover, back cover and endpaper</h2>
          <button class="icon-btn" type="button" data-close aria-label="Close"><svg><use href="#i-close"/></svg></button></div>
        <nav class="tabs modal-tabs">${PARTS.map(([k, l]) => `<button type="button" class="tab" data-part="${k}" ${k === part ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</nav>
        <div class="modal-body">
          <div class="current">
            <div class="current-img" style="--ratio:${ratioOf(p)}">${partSvg(p, PART_KIND[part])}</div>
            <div class="current-info">
              <h3>${dv.upload ? 'Your own ' + label.toLowerCase() : esc(t.name || 'Design')}</h3>
              <p class="hint">${dv.upload ? 'Shown exactly as uploaded. Pick a design below to go back to a design.' : esc(t.description || '')}</p>
              <div class="own-actions">
                <label class="btn upload-btn"><svg><use href="#i-upload"/></svg>${dv.upload ? 'Replace with another image' : 'Upload your own ' + label.toLowerCase()}
                  <input type="file" accept="image/*" data-own hidden /></label>
                ${!isDraft && hasMedia ? '<button type="button" class="btn quiet" data-choose-part><svg><use href="#i-photos"/></svg>Choose from album photos</button>' : ''}
                ${dv.upload ? '<button type="button" class="link" data-remove>Remove your image</button>' : ''}
              </div>
              <p class="hint">${dv.upload ? '' : 'A custom design made by the studio, from your computer. JPG or PNG, ideally the same shape as the album pages. '}${isDraft ? 'It is saved when you create the album.' : hasMedia ? '' : 'Once the album has photos you can also pick one of them.'}</p>
              ${slots ? `<div class="slots"><p class="slots-title">Photos in this design</p>${Array.from({ length: slots }, (_, i) => {
                const src = (dv.photos || [])[i] || (i === 0 ? photoOf(p) : '');
                return `<div class="slot"><span class="slot-img">${src ? `<img src="${esc(src)}" alt="">` : ''}</span>
                  <label class="link">Upload<input type="file" accept="image/*" data-slot="${i}" hidden /></label>
                  ${!isDraft && photosOfAlbum().length ? `<button type="button" class="link" data-choose="${i}">Choose from album</button>` : ''}</div>`;
              }).join('')}</div>` : ''}
            </div>
          </div>
          <div class="chooser" id="chooser" hidden></div>
          <p class="slots-title picker-title">Or pick a design for the ${label.toLowerCase()}</p>
          <div id="modalPicker"></div>
        </div>`;
      mountPicker($('#modalPicker'), {
        album: p, part, getSelected: () => (dv.upload ? '' : key),
        onPick: async (k) => {
          try { await saveDesign({ part, template: k }); if (part === 'cover' && !isDraft) a.template = a.template; draw(); onChange && onChange(); toast('Design saved'); }
          catch (err) { toast(err.message); }
        },
      });
    }
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) { closeModal(); return; }
      const tab = e.target.closest('[data-part]');
      if (tab && tab.classList.contains('tab')) { part = tab.dataset.part; draw(); return; }
      if (e.target.closest('[data-remove]')) {
        try { await saveDesign({ part, removeUpload: true }); draw(); onChange && onChange(); toast('Your image was removed'); } catch (err) { toast(err.message); }
        return;
      }
      if (e.target.closest('[data-choose-part]')) {
        // use an album photo or designed page as this whole part
        const label = PARTS.find((x) => x[0] === part)[1].toLowerCase();
        const box = $('#chooser');
        box.hidden = false;
        box.innerHTML = `<p class="slots-title">Choose a photo for the ${label}</p><div class="chooser-grid">` +
          [...photosOfAlbum(), ...pagesOfAlbum()].map((m) => `<button type="button" data-use="${esc(m.id)}" title="${esc(m.name || '')}"><img src="${esc(m.thumb)}" alt="" loading="lazy"></button>`).join('') + '</div>';
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        box.onclick = async (ev) => {
          const b = ev.target.closest('[data-use]'); if (!b) return;
          try { await saveDesign({ part, useMedia: b.dataset.use }); draw(); onChange && onChange(); toast(`Photo set as the ${label}`); } catch (err) { toast(err.message); }
        };
        return;
      }
      const choose = e.target.closest('[data-choose]');
      if (choose) {
        const slot = +choose.dataset.choose;
        const box = $('#chooser');
        box.hidden = false;
        box.innerHTML = '<p class="slots-title">Choose a photo for this spot</p><div class="chooser-grid">' +
          photosOfAlbum().map((m) => `<button type="button" data-media="${esc(m.id)}"><img src="${esc(m.thumb)}" alt="" loading="lazy"></button>`).join('') + '</div>';
        box.onclick = async (ev) => {
          const b = ev.target.closest('[data-media]'); if (!b) return;
          try { await saveDesign({ part, setSlot: slot, mediaId: b.dataset.media }); draw(); onChange && onChange(); toast('Photo placed'); } catch (err) { toast(err.message); }
        };
      }
    });
    card.addEventListener('change', async (e) => {
      const input = e.target;
      if (!input.files || !input.files[0]) return;
      const label = input.closest('label');
      if (label) label.classList.add('busy');
      try {
        const how = await uploadDesign(input.files[0], input.dataset.slot !== undefined ? +input.dataset.slot : undefined);
        draw(); onChange && onChange(); toast(how === 'split' ? 'Split into the back cover and front cover' : 'Uploaded');
      } catch (err) { toast(err.message); if (label) label.classList.remove('busy'); }
    });
    draw();
  }

  /* ---------- album page ---------- */
  function viewsChart(daily) {
    const days = [];
    const map = Object.fromEntries((daily || []).map((d) => [d.day, d.count]));
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push(map[d] || 0); }
    const max = Math.max(1, ...days), total = days.reduce((x, y) => x + y, 0);
    const bars = days.map((n, i) => { const h = n ? Math.max(4, (n / max) * 60) : 2; return `<rect class="${n ? '' : 'zero'}" x="${i * 17.3}" y="${64 - h}" width="12" height="${h}" rx="2"><title>${n} on ${new Date(Date.now() - (29 - i) * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</title></rect>`; }).join('');
    return `<div class="views"><p><b>${plural(total, 'view', 'views')}</b> in the last 30 days</p><svg viewBox="0 0 520 64" preserveAspectRatio="none" role="img" aria-label="Views per day">${bars}</svg></div>`;
  }

  function paintHero(a) {
    const host = $('#hero');
    if (!host) return;
    const s = state.current.stats, b = a.built, md = a.media || { photos: [], pages: [] };
    const content = md.pages.length ? plural(md.pages.length, 'designed page', 'designed pages')
      : md.photos.length ? plural(md.photos.length, 'photo', 'photos')
        : b ? plural(b.photos, 'photo', 'photos') + ', ' + plural(b.pages, 'page', 'pages') : 'No photos yet';
    host.innerHTML = `
      ${bookHtml(a, { ribbon: a.status === 'draft' })}
      <div>
        <h1 class="display">${esc(M.title(a))}</h1>
        <p class="sub">${esc(M.subtitle(a) || typeLabel(a.type))}</p>
        <div class="chips">
          <span class="chip ${a.status === 'published' ? 'live' : ''}">${a.status === 'published' ? 'Published' : 'Draft'}</span>
          <span class="chip">${esc(typeLabel(a.type))}</span>
          <span class="chip">${esc(content)}</span>
          <span class="chip">${plural(s.hearts, 'heart', 'hearts')}</span>
          ${state.user.isMaster && state.current.studio ? `<span class="chip">${esc(state.current.studio.name)}</span>` : ''}
        </div>
        <div class="actions">
          <a class="btn" href="/a/${encodeURIComponent(a.id)}" target="_blank" rel="noopener"><svg><use href="#i-book"/></svg>Open album</a>
          <a class="btn quiet" href="/g/${encodeURIComponent(a.id)}" target="_blank" rel="noopener"><svg><use href="#i-photos"/></svg>Photos</a>
          <button class="btn quiet" type="button" id="copyLink"><svg><use href="#i-link"/></svg>Copy guest link</button>
        </div>
        ${viewsChart(s.daily)}
      </div>`;
    $('#copyLink').addEventListener('click', async () => {
      const url = location.origin + '/a/' + a.id;
      try { await navigator.clipboard.writeText(url); toast('Guest link copied'); } catch (e) { prompt('Copy this link', url); }
    });
  }

  async function loadAlbum(id) {
    const d = await api('albums/' + encodeURIComponent(id));
    return Object.assign(d.album, { built: d.built, designView: d.designView, media: d.media, _studio: d.studio, _stats: d.stats });
  }

  async function albumPage(id, tab) {
    let a;
    try { a = await loadAlbum(id); }
    catch (err) { toast(err.message); location.hash = ''; return; }
    state.current = { album: a, stats: a._stats, studio: a._studio };
    const q = encodeURIComponent(id);
    const n = (a.media.photos.length + a.media.pages.length);
    const tabLink = (k, label, extra = '') => `<a class="tab" href="#album/${q}/${k}" ${tab === k ? 'aria-current="page"' : ''}>${label}${extra}</a>`;
    view.innerHTML = `
      <div class="crumbs"><a href="#"><svg class="i"><use href="#i-back"/></svg>All albums</a></div>
      <section class="hero" id="hero"></section>
      <nav class="tabs">${tabLink('details', 'Details')}${tabLink('photos', 'Photos and pages', n ? ` <span class="count soft">${n}</span>` : '')}${tabLink('blessings', 'Blessings', a._stats.pending ? ` <span class="count">${a._stats.pending} new</span>` : '')}</nav>
      <div id="tabBody"></div>`;
    paintHero(a);
    const body = $('#tabBody');
    if (tab === 'photos') photosTab(body, a);
    else if (tab === 'blessings') blessingsTab(body, a);
    else mountEditor(body, a, { isNew: false });
  }

  /* ---------- photos and pages ---------- */
  // Resize in the browser before upload: smaller files, and re-encoding drops EXIF/GPS.
  async function prepareImage(file, maxSide = 2400, thumbSide = 480) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (bmp.width / bmp.height > SPREAD_RATIO) maxSide = Math.round(maxSide * 1.6);   // two pages in one image: keep each page sharp
    const enc = async (side, q) => {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise((res) => c.toBlob((b) => res({ blob: b, w: c.width, h: c.height }), 'image/jpeg', q));
    };
    const main = await enc(maxSide, 0.86);
    const thumb = thumbSide ? await enc(thumbSide, 0.8) : null;
    bmp.close && bmp.close();
    return { file: main.blob, thumb: thumb && thumb.blob, width: main.w, height: main.h };
  }
  // Render PDF pages to images with pdf.js (in the browser).
  async function pdfPages(file, onProgress) {
    const pdfjs = await import('/assets/js/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/assets/js/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const v0 = page.getViewport({ scale: 1 });
      const scale = 3000 / Math.max(v0.width, v0.height);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
      out.push(new File([blob], `${file.name.replace(/\.pdf$/i, '')}-page-${String(i).padStart(3, '0')}.jpg`, { type: 'image/jpeg' }));
      onProgress && onProgress(i, doc.numPages);
      page.cleanup();
    }
    return out;
  }

  /* ---------- Google Drive (shared links, Drive API v3 with a browser API key) ---------- */
  async function googleKey() {
    if (!state.config) state.config = await api('config');
    if (!state.config.googleApiKey) throw new Error('Google Drive import is not set up yet: add a GOOGLE_API_KEY (see README, "Google Drive").');
    return state.config.googleApiKey;
  }
  function driveTarget(link) {
    const s = String(link || '').trim();
    let m = s.match(/\/folders\/([\w-]{10,})/);
    if (m) return { folder: m[1] };
    m = s.match(/\/file\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/\/d\/([\w-]{10,})/);
    if (m) return { file: m[1] };
    if (/^[\w-]{20,}$/.test(s)) return { folder: s };
    throw new Error('That does not look like a Google Drive folder or file link.');
  }
  async function driveGet(url) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 404 || res.status === 403) {
      throw new Error('Drive did not allow access. Share the folder or file as "Anyone with the link", then try again.');
    }
    if (res.status === 400) throw new Error('Google rejected the request. Check that the Google API key allows the Drive API.');
    throw new Error('Google Drive answered ' + res.status + '. Try again in a moment.');
  }
  async function driveFiles(link, kind) {
    const key = await googleKey();
    const target = driveTarget(link);
    const base = 'https://www.googleapis.com/drive/v3/files';
    const common = '&supportsAllDrives=true&key=' + encodeURIComponent(key);
    let items = [];
    if (target.file) {
      items = [await (await driveGet(`${base}/${target.file}?fields=id,name,mimeType,size${common}`)).json()];
    } else {
      let token = '';
      do {
        const q = encodeURIComponent(`'${target.folder}' in parents and trashed = false`);
        const r = await (await driveGet(`${base}?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&includeItemsFromAllDrives=true${common}${token ? '&pageToken=' + token : ''}`)).json();
        items.push(...(r.files || []));
        token = r.nextPageToken || '';
      } while (token);
    }
    const ok = (t) => (kind === 'page' ? /^image\/|^application\/pdf$/ : /^image\//).test(t || '');
    const files = items.filter((f) => ok(f.mimeType) && !/heic|heif/i.test(f.mimeType)).map((f) => ({
      name: f.name, type: f.mimeType,
      load: async () => {
        const blob = await (await driveGet(`${base}/${f.id}?alt=media${common}`)).blob();
        return new File([blob], f.name, { type: f.mimeType });
      },
    }));
    if (!files.length) throw new Error(kind === 'page' ? 'No images or PDFs were found at that link.' : 'No photos were found at that link (JPEG, PNG or WebP).');
    return files;
  }

  function photosTab(body, a) {
    const md = a.media;
    const sections = [...new Set(md.photos.map((p) => p.section).filter(Boolean))];
    const hasCover = !!((a.designView || {}).cover || {}).upload;
    const dvAll = a.designView || {};
    const coverTile = (part, label) => {
      const own = (dvAll[part] || {}).upload;
      return `<div class="cover-tile">
        <span class="cover-img" style="--ratio:${ratioOf(a)}">${partSvg(a, PART_KIND[part])}</span>
        <div class="cover-meta"><b>${label}</b><span class="hint">${own ? 'Your own image' : 'Design: ' + esc((CT.list.find((t) => t.key === currentKey(a, part)) || {}).name || '')}</span>
          <div class="own-actions">
            <label class="btn quiet upload-btn"><svg><use href="#i-upload"/></svg>${own ? 'Replace' : 'Upload ' + label.toLowerCase()}<input type="file" accept="image/*" data-cover="${part}" hidden /></label>
            ${own ? `<button type="button" class="link" data-cover-remove="${part}">Remove</button>` : ''}
          </div></div></div>`;
    };
    body.innerHTML = `
      <div class="uploader">
        <section class="up-card covers-card">
          <h3>Front and back cover</h3>
          <p class="hint">Upload your own designed front cover and back cover from your computer. You can also do this in Details, where you can pick a design instead.</p>
          <div class="cover-tiles">${coverTile('back', 'Back cover')}${coverTile('cover', 'Front cover')}</div>
          <label class="btn quiet upload-btn"><svg><use href="#i-upload"/></svg>Upload back + front cover as one image<input type="file" accept="image/*" data-cover-spread hidden /></label>
          <p class="hint">The left half becomes the back cover, the right half the front cover.</p>
        </section>
        <section class="up-card">
          <h3>Photos</h3>
          <p class="hint">For the photo gallery and the automatic album layout. Upload one ceremony at a time.</p>
          <label class="field"><span>Ceremony or section</span><input id="upSection" list="sectionList" maxlength="60" placeholder="Haldi" /></label>
          <datalist id="sectionList">${['Haldi', 'Mehendi', 'Sangeet', 'Wedding', 'Reception', ...sections].filter((v, i, arr) => arr.indexOf(v) === i).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
          <label class="drop" data-drop="photo"><svg><use href="#i-upload"/></svg><span>Choose photos or drop them here</span><small>JPEG, PNG or WebP. They are resized to 2400 px and location data is removed.</small>
            <input type="file" accept="image/*" multiple hidden data-pick="photo" /></label>
        </section>
        <section class="up-card">
          <h3>Designed album pages</h3>
          <p class="hint">Already designed the album? Upload its pages as images, in order, or one PDF. They replace the automatic layout.</p>
          <label class="check"><input type="checkbox" id="upCover"${hasCover ? '' : ' checked'} /> Use the first page as the cover</label>
          <label class="check"><input type="checkbox" id="upBack" /> Use the last page as the back cover</label>
          <label class="check"><input type="checkbox" id="upSpreads" /> The pages are two-page spreads <em class="hint">(found automatically for wide pages)</em></label>
          <label class="drop" data-drop="page"><svg><use href="#i-pdf"/></svg><span>Choose pages or a PDF</span><small>Images are sorted by file name. A PDF is turned into images in your browser.</small>
            <input type="file" accept="image/*,application/pdf" multiple hidden data-pick="page" /></label>
        </section>
        <section class="up-card drive-card" hidden>
          <div class="drive-text">
            <h3><svg class="drive-logo"><use href="#i-drive"/></svg>From Google Drive</h3>
            <p class="hint">Paste the link of a Drive folder or file that is shared as "Anyone with the link". Photos use the section above; pages and PDFs use the options above.</p>
          </div>
          <div class="drive-form">
            <label class="field"><span>Drive link</span><input id="driveLink" type="url" placeholder="https://drive.google.com/drive/folders/…" /></label>
            <div class="choice row">
              <label><input type="radio" name="driveAs" value="photo" checked /><span>As photos</span></label>
              <label><input type="radio" name="driveAs" value="page" /><span>As designed pages or a PDF</span></label>
            </div>
            <div class="form-row"><button class="btn" type="button" id="driveGo"><svg><use href="#i-drive"/></svg>Import from Drive</button>
              <p class="form-note" id="driveNote"></p></div>
          </div>
        </section>
      </div>
      <ol class="up-progress" id="upProgress"></ol>
      ${md.pages.length ? `<div class="media-head"><h3>Album pages <span class="count soft">${md.pages.length}</span></h3><p class="hint">Guests see these pages, with the front cover, back cover and endpaper around them. Drag a page, or use its arrows, to change the order.</p></div>
        <div class="media-grid pages" data-sort="page">${pageLabels(md.pages.map((m) => !!m.spread)).map((l, i) => mediaTile(md.pages[i], l)).join('')}</div>` : ''}
      ${md.photos.length ? `<div class="media-head"><h3>Photos <span class="count soft">${md.photos.length}</span></h3><p class="hint">${md.pages.length ? 'Shown in the photo gallery.' : 'Laid out in the album automatically and shown in the photo gallery.'} Drag a photo to change the order within its section.</p></div>
        ${groupBy(md.photos, (p) => p.section || 'Moments').map(([sec, list]) => `<h4 class="sec">${esc(sec)} <span class="hint">${list.length}</span></h4>
          <div class="media-grid" data-sort="photo">${list.map((m) => mediaTile(m)).join('')}</div>`).join('')}` : ''}
      ${!md.pages.length && !md.photos.length ? `<p class="hint empty-media">${a.built ? 'This album uses the photos built on your computer. Uploads here replace them.' : 'No photos yet. Upload photos or designed pages above.'}</p>` : ''}`;

    body.querySelectorAll('[data-drop]').forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); handleFiles(zone.dataset.drop, [...e.dataTransfer.files]); });
    });
    body.querySelectorAll('[data-pick]').forEach((input) => input.addEventListener('change', () => handleFiles(input.dataset.pick, [...input.files])));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Remove this ' + (b.dataset.kind === 'page' ? 'page' : 'photo') + ' from the album?')) return;
      try { await api(`albums/${encodeURIComponent(a.id)}/media/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); const g = b.closest('.media-grid'); b.closest('.media-tile').remove(); relabel(g); toast('Removed'); }
      catch (err) { toast(err.message); }
    }));

    // front / back cover from the computer
    body.querySelectorAll('[data-cover]').forEach((input) => input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return;
      const label = input.closest('label');
      label.classList.add('busy');
      try {
        const how = await uploadPart(a, input.dataset.cover, f, {});
        toast(how === 'split' ? 'Split into the back cover and front cover' : input.dataset.cover === 'cover' ? 'Front cover uploaded' : 'Back cover uploaded');
        albumPage(a.id, 'photos');
      } catch (err) { toast(err.message); label.classList.remove('busy'); }
    }));
    body.querySelector('[data-cover-spread]').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const label = e.target.closest('label');
      label.classList.add('busy');
      try { await uploadCoverSpread(a, f, false); toast('Split into the back cover and front cover'); albumPage(a.id, 'photos'); }
      catch (err) { toast(err.message); label.classList.remove('busy'); }
    });
    // one image = two pages, or just one
    // order: drag tiles, or use the arrows; pages renumber at once and the order is saved
    let saveTimer = null;
    const saveOrder = (kind) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const ids = [...body.querySelectorAll(`[data-sort="${kind}"] .media-tile`)].map((t) => t.dataset.id);
        try { await api(`albums/${encodeURIComponent(a.id)}/order`, { method: 'PUT', body: { kind, ids } }); toast(kind === 'page' ? 'Page order saved' : 'Photo order saved'); }
        catch (err) { toast(err.message); }
      }, 500);
    };
    const relabel = (grid) => {
      if (grid.dataset.sort !== 'page') return;
      const tiles = [...grid.querySelectorAll('.media-tile')];
      pageLabels(tiles.map((t) => t.dataset.two === '1')).forEach((l, i) => { tiles[i].querySelector('figcaption').textContent = l; });
    };
    body.querySelectorAll('[data-sort]').forEach((grid) => makeSortable(grid, () => { relabel(grid); saveOrder(grid.dataset.sort); }));
    body.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const tile = b.closest('.media-tile'), grid = tile.parentNode;
      const back = +b.dataset.move < 0;
      const other = back ? tile.previousElementSibling : tile.nextElementSibling;
      if (!other) return;
      grid.insertBefore(tile, back ? other : other.nextElementSibling);
      b.focus();
      tile.classList.remove('moved'); void tile.offsetWidth; tile.classList.add('moved');
      relabel(grid); saveOrder(grid.dataset.sort);
    }));
    body.querySelectorAll('[data-spread]').forEach((b) => b.addEventListener('click', async () => {
      const spread = b.dataset.spread === '1';
      b.disabled = true;
      try {
        await api(`albums/${encodeURIComponent(a.id)}/media/${encodeURIComponent(b.dataset.mid)}`, { method: 'PATCH', body: { spread } });
        toast(spread ? 'Shown as two pages' : 'Shown as one page');
        albumPage(a.id, 'photos');
      } catch (err) { toast(err.message); b.disabled = false; }
    }));
    body.querySelectorAll('[data-cover-remove]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('albums/' + encodeURIComponent(a.id) + '/design', { method: 'PUT', body: { part: b.dataset.coverRemove, removeUpload: true } }); toast('Removed'); albumPage(a.id, 'photos'); }
      catch (err) { toast(err.message); }
    }));
    // Google Drive import only shows once a Google API key is configured
    (async () => {
      try { if (!state.config) state.config = await api('config'); } catch (e) { state.config = {}; }
      const card = body.querySelector('.drive-card');
      if (card) card.hidden = !state.config.googleApiKey;
    })();

    $('#driveGo').addEventListener('click', async () => {
      const note = $('#driveNote'), btn = $('#driveGo');
      note.className = 'form-note';
      btn.disabled = true;
      try {
        const kind = body.querySelector('input[name="driveAs"]:checked').value;
        note.textContent = 'Reading the Drive link…';
        const files = await driveFiles($('#driveLink').value, kind);
        note.textContent = plural(files.length, 'file', 'files') + ' found in Drive';
        await handleFiles(kind, files);
      } catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
      finally { btn.disabled = false; }
    });

    // files may be real Files (computer) or lazy Drive files { name, type, load() } downloaded when their turn comes
    async function handleFiles(kind, files) {
      files = files.filter((f) => /^image\/|application\/pdf/.test(f.type)).sort((x, y) => x.name.localeCompare(y.name, 'en', { numeric: true }));
      if (!files.length) { toast('Choose image or PDF files.'); return; }
      const list = $('#upProgress');
      const item = (name) => { const li = document.createElement('li'); li.innerHTML = '<span class="n"></span><span class="s">Waiting</span>'; li.querySelector('.n').textContent = name; list.appendChild(li); return li; };
      const set = (li, text, cls) => { li.querySelector('.s').textContent = text; if (cls) li.className = cls; };
      const real = async (f, li) => { if (typeof f.load !== 'function') return f; set(li, 'Downloading from Drive'); return f.load(); };
      let pages = [];
      if (kind === 'page') {
        for (const f of files) {
          if (f.type === 'application/pdf') {
            const li = item(f.name);
            try { pages.push(...await pdfPages(await real(f, li), (i, n) => set(li, `Reading page ${i} of ${n}`))); set(li, 'Read', 'done'); }
            catch (err) { set(li, err.message && /Drive/.test(err.message) ? err.message : 'This PDF could not be read', 'error'); }
          } else pages.push(f);
        }
        if (!pages.length) return;
      }
      const section = ($('#upSection') && $('#upSection').value.trim()) || '';
      const useCover = kind === 'page' && $('#upCover').checked;
      const useBack = kind === 'page' && $('#upBack').checked && pages.length > 1;
      const forceSpreads = kind === 'page' && $('#upSpreads').checked;
      const queue = (kind === 'page' ? pages : files).map((f, i) => ({ f, i, li: item(f.name) }));
      const total = queue.length;
      let base = kind === 'page' ? a.media.pages.length : a.media.photos.length;
      let done = 0, failed = 0;
      async function one({ f, i, li }) {
        try {
          const file = await real(f, li);
          set(li, 'Preparing');
          const asCover = useCover && i === 0, asBack = useBack && i === total - 1;
          if (asCover && await imageRatio(file) > SPREAD_RATIO) {
            // a wide first page is the whole cover: back cover on the left, front cover on the right
            set(li, 'Uploading');
            await uploadCoverSpread(a, file, false);
            set(li, 'Split into the back and front cover', 'done');
            done++;
            return;
          }
          const img = await prepareImage(file, asCover || asBack ? 3000 : kind === 'page' ? 3200 : 2400, asCover || asBack ? 0 : 480);
          const form = new FormData();
          if (asCover || asBack) {
            form.append('kind', 'design'); form.append('part', asCover ? 'cover' : 'back');
          } else {
            form.append('kind', kind);
            form.append('width', img.width); form.append('height', img.height);
            form.append('position', String(base + i)); form.append('name', f.name);
            if (kind === 'photo') form.append('section', section);
            form.append('spread', (kind === 'page' && forceSpreads) || img.width / img.height > SPREAD_RATIO ? '1' : '0');
            form.append('thumb', img.thumb, 'thumb.jpg');
          }
          form.append('file', img.file, 'image.jpg');
          set(li, 'Uploading');
          await api('albums/' + encodeURIComponent(a.id) + '/upload', { method: 'POST', form });
          set(li, asCover ? 'Set as cover' : asBack ? 'Set as back cover' : 'Done', 'done');
        } catch (err) { failed++; set(li, err.message, 'error'); }
        done++;
      }
      // three at a time
      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await one(queue.shift()); });
      await Promise.all(workers);
      toast(failed ? `${done - failed} uploaded, ${failed} failed` : `${plural(done, 'file', 'files')} uploaded`);
      setTimeout(() => albumPage(a.id, 'photos').then(() => { const l = $('#upProgress'); if (l && failed) l.scrollIntoView(); }), 600);
    }
  }
  function mediaTile(m, label) {
    // landscape images can be one page, or two pages designed as a single image
    const toggle = m.spread || m.width / m.height > 1.3
      ? `<button type="button" class="spread-toggle" data-spread="${m.spread ? '0' : '1'}" data-mid="${esc(m.id)}" title="${m.spread ? 'This image is shown across two pages' : 'Use this when the image holds two album pages side by side'}">${m.spread ? '<b>Two pages</b><span>Make it one page</span>' : '<b>One page</b><span>Split into two pages</span>'}</button>` : '';
    const noun = m.kind === 'page' ? 'page' : 'photo';
    return `<figure class="media-tile${m.spread ? ' spread' : ''}" data-id="${esc(m.id)}" data-two="${m.spread ? 1 : 0}"><img src="${esc(m.thumb)}" alt="" loading="lazy" draggable="false">
      <div class="move" role="group" aria-label="Move this ${noun}">
        <button type="button" class="mv" data-move="-1" title="Move earlier" aria-label="Move this ${noun} earlier"><svg><use href="#i-back"/></svg></button>
        <span class="grip" title="Drag to move" aria-hidden="true"><svg viewBox="0 0 10 16"><circle cx="3" cy="3" r="1.4"/><circle cx="7" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="7" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="7" cy="13" r="1.4"/></svg></span>
        <button type="button" class="mv next" data-move="1" title="Move later" aria-label="Move this ${noun} later"><svg><use href="#i-back"/></svg></button>
      </div>
      <figcaption>${esc(label || m.name || '')}</figcaption>${toggle}
      <button type="button" class="icon-btn del" data-del="${esc(m.id)}" data-kind="${m.kind}" title="Remove"><svg><use href="#i-trash"/></svg></button></figure>`;
  }
  // "Page 1", "Pages 2–3" ... for a list of one-page / two-page flags
  function pageLabels(twos) {
    let n = 0;
    return twos.map((two) => { const at = ++n; if (two) n++; return two ? `Pages ${at}–${at + 1}` : `Page ${at}`; });
  }
  // Drag tiles within a grid. Mouse: drag anywhere on the tile. Touch: drag the grip, so the page still scrolls.
  function makeSortable(grid, onChange) {
    let d = null;
    const order = () => [...grid.children].map((t) => t.dataset.id).join(',');
    grid.addEventListener('dragstart', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      const tile = e.target.closest('.media-tile');
      if (!tile || e.button !== 0 || e.target.closest('button, a, input, label')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.grip')) return;
      d = { tile, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, order: order() };
      addEventListener('pointermove', move, { passive: false });
      addEventListener('pointerup', end);
      addEventListener('pointercancel', end);
    });
    function start() {
      const r = d.tile.getBoundingClientRect();
      d.dx = d.x0 - r.left; d.dy = d.y0 - r.top;
      d.ghost = d.tile.cloneNode(true);
      d.ghost.classList.add('drag-ghost');
      Object.assign(d.ghost.style, { width: r.width + 'px', height: r.height + 'px' });
      document.body.appendChild(d.ghost);
      d.tile.classList.add('drag-place');
      document.body.classList.add('is-dragging');
      d.started = true;
      const tick = () => {   // scroll near the window edges, and keep placing while scrolling
        if (!d || !d.started) return;
        const edge = 70;
        if (d.y < edge) scrollBy(0, -Math.ceil((edge - d.y) / 4));
        else if (d.y > innerHeight - edge) scrollBy(0, Math.ceil((d.y - innerHeight + edge) / 4));
        place();
        d.raf = requestAnimationFrame(tick);
      };
      d.raf = requestAnimationFrame(tick);
    }
    function move(e) {
      if (!d || e.pointerId !== d.id) return;
      d.x = e.clientX; d.y = e.clientY;
      if (!d.started) { if (Math.hypot(d.x - d.x0, d.y - d.y0) < 6) return; start(); }
      e.preventDefault();
      d.ghost.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px) rotate(-1.5deg)`;
    }
    function place() {
      const el = document.elementFromPoint(d.x, d.y);
      const over = el && el.closest('.media-tile');
      if (!over || over === d.tile || over.parentNode !== grid) return;
      const r = over.getBoundingClientRect();
      const ref = d.x > r.left + r.width / 2 ? over.nextElementSibling : over;
      if (ref === d.tile || ref === d.tile.nextElementSibling) return;
      // move the tile, then slide the others into their new places
      const tiles = [...grid.children], before = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
      grid.insertBefore(d.tile, ref);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      tiles.forEach((t) => {
        if (t === d.tile) return;
        const a = before.get(t), b = t.getBoundingClientRect();
        if (a.left !== b.left || a.top !== b.top) t.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
      });
    }
    function end(e) {
      if (!d || e.pointerId !== d.id) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      if (d.started) {
        cancelAnimationFrame(d.raf);
        d.ghost.remove();
        d.tile.classList.remove('drag-place');
        document.body.classList.remove('is-dragging');
        if (order() !== d.order) onChange();
      }
      d = null;
    }
  }
  function groupBy(list, fn) {
    const m = new Map();
    list.forEach((x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return [...m.entries()];
  }

  /* ---------- blessings ---------- */
  async function blessingsTab(body, a) {
    body.innerHTML = '<ol class="mod-list" id="modList"></ol>';
    const list = $('#modList');
    try {
      const { messages } = await api('guestbook/' + encodeURIComponent(a.id));
      if (!messages.length) { list.outerHTML = '<p class="hint" style="margin-top:26px">No blessings yet. Guests write them from the album and the photo gallery.</p>'; return; }
      messages.forEach((m) => list.appendChild(modItem(m)));
    } catch (err) { toast(err.message); }
  }
  function modItem(m) {
    const li = document.createElement('li');
    li.className = m.approved ? '' : 'hidden-msg';
    li.innerHTML = '<span class="avatar"></span><div class="who"><span></span><span class="when"></span></div><p></p><div class="mod-actions"></div>';
    li.querySelector('.avatar').textContent = (Array.from(m.name.trim())[0] || '?').toUpperCase();
    li.querySelector('.who span').textContent = m.name;
    if (!m.approved) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'Hidden from guests'; li.querySelector('.who span').appendChild(t); }
    li.querySelector('.when').textContent = new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    li.querySelector('p').textContent = m.message;
    const actions = li.querySelector('.mod-actions');
    const toggle = document.createElement('button');
    toggle.className = 'btn quiet';
    toggle.textContent = m.approved ? 'Hide' : 'Show to guests';
    toggle.addEventListener('click', async () => {
      try { await api('guestbook/' + m.id, { method: 'PATCH', body: { approved: !m.approved } }); m.approved = !m.approved; li.replaceWith(modItem(m)); }
      catch (err) { toast(err.message); }
    });
    const del = document.createElement('button');
    del.className = 'btn quiet';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this message for good?')) return;
      try { await api('guestbook/' + m.id, { method: 'DELETE' }); li.remove(); toast('Message deleted'); }
      catch (err) { toast(err.message); }
    });
    actions.append(toggle, del);
    return li;
  }

  /* ---------- master: studios ---------- */
  async function studiosPage() {
    view.innerHTML = '';
    let studios;
    try { studios = (await api('master/studios')).studios; state.studios = studios; }
    catch (err) { toast(err.message); return; }
    state.pendingStudios = studios.filter((s) => s.status === 'pending').length;
    paintNav();
    const label = { pending: 'Waiting for approval', active: 'Active', suspended: 'Switched off' };
    view.innerHTML = `
      <h1 class="page-title display">Studios</h1>
      <p class="lede">${plural(studios.length, 'studio has', 'studios have')} an account. New studios sign up themselves and wait here until you approve them.</p>
      <div class="studio-list">${studios.map((s) => `
        <article class="studio-row ${s.status}">
          <span class="avatar">${esc((Array.from(s.name.trim())[0] || '?').toUpperCase())}</span>
          <div class="studio-main"><h3>${esc(s.name)}</h3>
            <p class="hint">${esc([s.owner_name, s.owner_email, s.phone, s.city].filter(Boolean).join(', '))}</p>
            <p class="hint">Joined ${new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${plural(s.albums, 'album', 'albums')}, ${plural(s.views30, 'view', 'views')} in 30 days, ${bytes(s.bytes)} uploaded</p></div>
          <span class="chip ${s.status === 'active' ? 'live' : s.status === 'pending' ? 'wait' : ''}">${label[s.status] || s.status}</span>
          <div class="studio-actions">
            ${s.status !== 'active' ? `<button class="btn" data-status="active" data-id="${esc(s.id)}">${s.status === 'pending' ? 'Approve' : 'Switch back on'}</button>` : ''}
            ${s.status !== 'suspended' ? `<button class="btn quiet" data-status="suspended" data-id="${esc(s.id)}">${s.status === 'pending' ? 'Decline' : 'Switch off'}</button>` : ''}
          </div>
        </article>`).join('') || '<p class="hint">No studios yet. Share the sign-up page: ' + esc(location.origin) + '/admin</p>'}</div>`;
    view.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.status === 'suspended' && !confirm('Switch this studio off? Its owner is signed out and its albums go offline until you switch it back on.')) return;
      try { await api('master/studios/' + encodeURIComponent(b.dataset.id), { method: 'PATCH', body: { status: b.dataset.status } }); toast(b.dataset.status === 'active' ? 'Studio approved' : 'Studio switched off'); studiosPage(); }
      catch (err) { toast(err.message); }
    }));
  }

  /* ---------- your studio ---------- */
  async function studioPage() {
    view.innerHTML = '';
    let s;
    try { s = (await api('studio')).studio; } catch (err) { toast(err.message); return; }
    view.innerHTML = `
      <h1 class="page-title display">${s ? esc(s.name) : 'Your account'}</h1>
      <p class="lede">${s ? 'Your studio details are printed on the back cover of every album that does not set its own.' : 'The master account has no studio profile.'}</p>
      ${s ? `<form class="sheet-form" id="studioForm">
        <section class="sheet"><div><h2>Studio profile</h2></div><div class="fields">
          <label class="field"><span>Studio name</span><input name="name" maxlength="80" value="${esc(s.name)}" required /></label>
          <div class="two"><label class="field"><span>Phone</span><input name="phone" maxlength="40" value="${esc(s.phone)}" /></label>
          <label class="field"><span>City</span><input name="city" maxlength="80" value="${esc(s.city)}" /></label></div>
          <label class="field"><span>Website</span><input name="url" maxlength="300" placeholder="https://" value="${esc(s.url)}" /></label>
          <div class="form-row"><button class="btn" type="submit">Save profile</button><p class="form-note" id="studioNote"></p></div>
        </div></section></form>` : ''}
      <form class="sheet-form" id="pwForm">
        <section class="sheet"><div><h2>Password</h2><p class="why">${esc(state.user.email)}</p></div><div class="fields">
          <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required /></label>
          <label class="field"><span>New password <em>at least 8 characters</em></span><input type="password" name="next" minlength="8" autocomplete="new-password" required /></label>
          <div class="form-row"><button class="btn quiet" type="submit">Change password</button><p class="form-note" id="pwNote"></p></div>
        </div></section></form>`;
    const sf = $('#studioForm');
    if (sf) sf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const note = $('#studioNote');
      try { await api('studio', { method: 'PUT', body: { name: sf.name.value, phone: sf.phone.value, city: sf.city.value, url: sf.url.value } }); note.className = 'form-note'; note.textContent = 'Saved'; state.user.studio.name = sf.name.value; paintNav(); }
      catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
    });
    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, note = $('#pwNote');
      try { await api('account', { method: 'PUT', body: { currentPassword: f.current.value, newPassword: f.next.value } }); f.reset(); note.className = 'form-note'; note.textContent = 'Password changed'; }
      catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
    });
  }

  /* ---------- start ---------- */
  async function start() {
    const d = await fetch('/api/admin/session', { credentials: 'same-origin' }).then((r) => r.json());
    if (!d.user) { showSignin(); return; }
    state.user = d.user; state.pendingStudios = d.pendingStudios || 0; state.studios = null;
    $('#signin').hidden = true; $('#shell').hidden = false;
    route();
  }
  document.fonts.ready.then(start).catch(() => {
    showSignin();
    $('#loginNote').textContent = 'The admin page needs the backend. Start it with npm run dev.';
  });
})();
