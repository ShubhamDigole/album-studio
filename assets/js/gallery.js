/* Photo gallery: justified rows per section, lightbox, hearts, downloads, blessings. */
(function () {
  'use strict';
  const M = window.AlbumMeta;
  const $ = (s, r = document) => r.querySelector(s);
  const ROW_H = () => (innerWidth < 760 ? 150 : 240);

  const S = { album: null, base: '', api: false, photos: [], sections: [], filter: 'all', counts: {}, mine: new Set(), view: [], index: -1 };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  const abs = (u) => (u ? new URL(u, S.base).href : '');

  function fileName(p) {
    const name = M.title(S.album).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'photo';
    return name + '-' + p.id + '.jpg';
  }

  /* ---------- header & filters ---------- */
  function renderHeader() {
    const a = S.album;
    const t = M.title(a);
    document.title = 'Photos, ' + t;
    $('#title').textContent = t;
    $('#subtitle').textContent = M.subtitle(a);
    const st = a.studio || {};
    const studio = $('#studio');
    studio.textContent = st.name ? 'Photographs by ' + st.name : '';
    if (st.url) studio.href = st.url; else studio.removeAttribute('href');
    $('#albumLink').href = 'index.html?' + new URLSearchParams(location.search).toString();
    if (a.downloadUrl) { const d = $('#downloadAll'); d.href = abs(a.downloadUrl); d.hidden = false; }
    $('#foot').textContent = st.name ? 'Photographs by ' + st.name + (st.phone ? ', ' + st.phone : '') : '';
  }

  function renderFilters() {
    const nav = $('#filters');
    const items = [{ key: 'all', label: 'All photos', n: S.photos.length }]
      .concat(S.sections.map((s) => ({ key: s.key, label: s.title, n: S.photos.filter((p) => p.section === s.key).length })).filter((s) => s.n));
    if (S.api) items.push({ key: 'favourites', label: 'My favourites', n: S.mine.size, heart: true });
    nav.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(S.filter === it.key));
      b.innerHTML = (it.heart ? '<svg><use href="#i-heart"/></svg>' : '') + '<span></span> <span class="n"></span>';
      b.querySelector('span').textContent = it.label;
      b.querySelector('.n').textContent = it.n;
      b.addEventListener('click', () => { S.filter = it.key; renderFilters(); renderPhotos(); window.scrollTo({ top: $('#filters').offsetTop, behavior: 'smooth' }); });
      nav.appendChild(b);
    });
  }

  /* ---------- photo rows ---------- */
  function photoButton(p) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ph';
    const r = p.width / p.height;
    b.style.flexGrow = r;
    b.style.flexBasis = (r * ROW_H()) + 'px';
    b.style.aspectRatio = p.width + ' / ' + p.height;
    if (p.blur) b.style.backgroundImage = 'url("' + p.blur + '")';
    b.setAttribute('aria-label', 'Open photo ' + p.n);
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = abs(p.thumb);
    img.addEventListener('load', () => img.classList.add('loaded'));
    b.appendChild(img);
    if (S.api) {
      const h = document.createElement('span');
      h.className = 'hearts';
      h.dataset.photo = p.id;
      h.innerHTML = '<svg><use href="#i-heart"/></svg><span></span>';
      b.appendChild(h);
      paintHeart(h, p.id);
    }
    b.addEventListener('click', () => openLightbox(S.view.indexOf(p)));
    return b;
  }

  function paintHeart(elm, id) {
    const n = S.counts[id] || 0;
    elm.classList.toggle('mine', S.mine.has(id));
    elm.classList.toggle('has', n > 0);
    elm.querySelector('span').textContent = n > 0 ? n : '';
  }

  function renderPhotos() {
    const main = $('#photos');
    main.innerHTML = '';
    let groups;
    if (S.filter === 'favourites') {
      groups = [{ title: 'My favourites', photos: S.photos.filter((p) => S.mine.has(p.id)) }];
    } else {
      const secs = S.filter === 'all' ? S.sections : S.sections.filter((s) => s.key === S.filter);
      groups = secs.map((s) => ({ title: s.title, photos: S.photos.filter((p) => p.section === s.key) })).filter((g) => g.photos.length);
      if (S.filter === 'all') {
        const known = new Set(S.sections.map((s) => s.key));
        const rest = S.photos.filter((p) => !known.has(p.section));
        if (rest.length) groups.unshift({ title: '', photos: rest });
      }
    }
    S.view = groups.flatMap((g) => g.photos);
    if (!S.view.length) {
      main.innerHTML = S.filter === 'favourites'
        ? '<div class="empty-state"><h2 class="display">No favourites yet</h2>Tap the heart on any photo to keep it here.</div>'
        : '<div class="empty-state"><h2 class="display">No photos here yet</h2>The photographer has not added photos to this album.</div>';
      return;
    }
    groups.forEach((g) => {
      const sec = document.createElement('section');
      sec.className = 'group';
      if (g.title) {
        const h = document.createElement('h2');
        h.className = 'display';
        h.textContent = g.title;
        const small = document.createElement('small');
        small.textContent = g.photos.length === 1 ? '1 photo' : g.photos.length + ' photos';
        h.appendChild(small);
        sec.appendChild(h);
      }
      const rows = document.createElement('div');
      rows.className = 'rows';
      g.photos.forEach((p) => rows.appendChild(photoButton(p)));
      sec.appendChild(rows);
      main.appendChild(sec);
    });
  }

  /* ---------- hearts ---------- */
  async function loadHearts() {
    try {
      const res = await fetch('/api/favorites/' + encodeURIComponent(S.album.id), { credentials: 'same-origin' });
      if (!res.ok) return;
      const d = await res.json();
      S.counts = d.counts || {};
      S.mine = new Set(d.mine || []);
      document.querySelectorAll('.hearts').forEach((h) => paintHeart(h, h.dataset.photo));
      renderFilters();
    } catch (e) { /* hearts are optional */ }
  }

  async function toggleHeart(p) {
    const add = !S.mine.has(p.id);
    // optimistic update, rolled back on failure
    if (add) { S.mine.add(p.id); S.counts[p.id] = (S.counts[p.id] || 0) + 1; }
    else { S.mine.delete(p.id); S.counts[p.id] = Math.max(0, (S.counts[p.id] || 1) - 1); }
    refreshHeartUI(p);
    try {
      const res = await fetch('/api/favorite/' + encodeURIComponent(S.album.id) + '/' + encodeURIComponent(p.id), { method: add ? 'POST' : 'DELETE', credentials: 'same-origin' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Your heart was not saved. Try again.');
      S.counts[p.id] = d.count;
      refreshHeartUI(p);
    } catch (e) {
      if (add) { S.mine.delete(p.id); S.counts[p.id]--; } else { S.mine.add(p.id); S.counts[p.id]++; }
      refreshHeartUI(p);
      toast(e.message);
    }
  }

  function refreshHeartUI(p) {
    document.querySelectorAll('.hearts[data-photo="' + p.id + '"]').forEach((h) => paintHeart(h, p.id));
    if (S.index > -1 && S.view[S.index] === p) paintLightboxHeart(p);
    const fav = Array.from(document.querySelectorAll('#filters .n')).pop();
    if (S.api && fav) fav.textContent = S.mine.size;
  }

  /* ---------- lightbox ---------- */
  const lb = { root: $('#lightbox'), img: $('#lbImg'), count: $('#lbCount'), heart: $('#lbHeart'), dl: $('#lbDownload'), prev: $('#lbPrev'), next: $('#lbNext') };
  let lastFocus = null;

  function paintLightboxHeart(p) {
    lb.heart.classList.toggle('mine', S.mine.has(p.id));
    lb.heart.title = S.mine.has(p.id) ? 'Remove from favourites' : 'Add to favourites';
    const n = S.counts[p.id] || 0;
    lb.heart.querySelector('span').textContent = n ? n : '';
  }

  function showPhoto(i) {
    S.index = (i + S.view.length) % S.view.length;
    const p = S.view[S.index];
    lb.img.style.opacity = '.35';
    lb.img.style.backgroundImage = p.blur ? 'url("' + p.blur + '")' : '';
    const img = new Image();
    img.onload = () => { if (S.view[S.index] === p) { lb.img.src = img.src; lb.img.style.opacity = '1'; } };
    img.src = abs(p.display);
    if (!lb.img.src) lb.img.src = abs(p.thumb);
    const sec = S.sections.find((s) => s.key === p.section);
    lb.count.textContent = (S.index + 1) + ' of ' + S.view.length + (sec ? ' in ' + sec.title : '');
    lb.dl.href = abs(p.download || p.display);
    lb.dl.setAttribute('download', fileName(p));
    lb.prev.disabled = S.view.length < 2;
    lb.next.disabled = S.view.length < 2;
    if (S.api) { lb.heart.hidden = false; paintLightboxHeart(p); }
    [S.index - 1, S.index + 1].forEach((k) => { const q = S.view[(k + S.view.length) % S.view.length]; if (q) new Image().src = abs(q.display); });
  }

  function openLightbox(i) {
    lastFocus = document.activeElement;
    lb.root.hidden = false;
    document.body.style.overflow = 'hidden';
    lb.img.removeAttribute('src');
    showPhoto(i);
    $('#lbClose').focus();
  }
  function closeLightbox() {
    lb.root.hidden = true;
    document.body.style.overflow = '';
    S.index = -1;
    if (lastFocus) lastFocus.focus();
  }

  function setupLightbox() {
    $('#lbClose').addEventListener('click', closeLightbox);
    lb.prev.addEventListener('click', () => showPhoto(S.index - 1));
    lb.next.addEventListener('click', () => showPhoto(S.index + 1));
    lb.heart.addEventListener('click', () => toggleHeart(S.view[S.index]));
    $('#lbStage').addEventListener('click', (e) => { if (e.target.id === 'lbStage') closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (lb.root.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showPhoto(S.index - 1);
      else if (e.key === 'ArrowRight') showPhoto(S.index + 1);
      else if (e.key === 'Tab') {   // keep focus inside the dialog
        const f = Array.from(lb.root.querySelectorAll('button:not([hidden]):not(:disabled), a[href]'));
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
      }
    });
    let sx = null, sy = 0;
    lb.root.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    lb.root.addEventListener('pointerup', (e) => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) showPhoto(S.index + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------- theme ---------- */
  function applyMode(mode) {
    M.setMode(mode);
    const btn = $('#themeBtn');
    btn.querySelector('use').setAttribute('href', mode === 'dark' ? '#i-sun' : '#i-moon');
    btn.title = mode === 'dark' ? 'Light background' : 'Dark background';
  }

  async function init() {
    applyMode(M.getMode());
    $('#themeBtn').addEventListener('click', () => applyMode(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    try {
      const { data, base, api } = await M.load();
      S.album = data; S.base = base; S.api = api;
      M.applyTheme(data);
      renderHeader();
      S.photos = (data.gallery || []).map((p, i) => ({ ...p, n: i + 1 }));
      S.sections = data.sections || [];
      renderFilters();
      renderPhotos();
      setupLightbox();
      let rt;
      addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => document.querySelectorAll('.ph').forEach((b) => { const r = parseFloat(b.style.flexGrow); b.style.flexBasis = (r * ROW_H()) + 'px'; }), 150); });
      if (api) {
        loadHearts();
        $('#blessings').hidden = false;
        window.Guestbook.mount({ albumId: data.id, list: $('#blessList'), form: $('#blessForm'), note: $('#blessNote'), more: $('#blessMore') }).load();
        fetch('/api/view/' + encodeURIComponent(data.id), { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      }
    } catch (err) {
      $('#title').textContent = 'This album did not open';
      $('#subtitle').textContent = err.message;
      $('.hero-actions').hidden = true;
    }
  }

  init();
})();
