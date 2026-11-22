/* Studio onboarding: the first-time setup after a studio's first sign-in, and the "Your studio" page.
   Three short steps, each saved on its own (PUT /api/admin/studio), with a live preview of an album wearing the studio's
   name, logo and colour:
     1. Your studio      name, tagline, city, address, phone, WhatsApp, website, Instagram / Facebook / YouTube
     2. Your brand       logo (POST /api/admin/studio-logo) and the colour new albums start with
     3. Album defaults   occasion, cover design, song, extra pages, blessings, draft or published
   then a last screen that leads to the first album. Skipping (or finishing) sets onboarded_at; the step reached is
   remembered in the browser so a half-done setup opens where it was left.
   The same sections, stacked on one page, make the "Your studio" page (mountStudioPage).

   window.Onboarding = { needed(user, profile), mount(host, ctx), mountStudioPage(host, ctx) }
   ctx (from admin.js): { api, toast, esc, M, CT, user, profile, partSvg, loadSongs, onProfile(profile) } */
(function () {
  'use strict';

  const STEPS = [
    { key: 'studio', name: 'Your studio' },
    { key: 'brand', name: 'Your brand' },
    { key: 'defaults', name: 'Album defaults' },
  ];
  const COLOURS = ['#C8255F', '#D7263D', '#E86A92', '#EFA00B', '#C9A227', '#5B8C2A', '#1F7A6D', '#1B6CA8', '#3B4BA8', '#8E6BBF', '#6B3E26', '#2B2D42'];
  const EXTRA = [
    ['endpapers', 'Endpapers', 'Patterned pages just inside the covers'],
    ['welcome', 'Welcome page', 'The names, place and date before the first photo'],
    ['sections', 'Section pages', 'The ceremony name before each group of photos'],
    ['thanks', 'Thank-you page', 'A closing page at the end'],
  ];
  const SAMPLE_NAMES = ['Aarav', 'Ananya'];
  const stepKey = (id) => 'albumviewer:onboard:' + id;

  /* ---------- small helpers ---------- */
  let ctx = null;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => ctx.esc(s);
  const occLabel = (t) => (ctx.M.TYPES[t] || {}).label || 'Other';
  const waDigits = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };
  const bare = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  // the profile being edited (a copy; saved per step)
  function draftOf(p) {
    const d = Object.assign({ type: 'wedding', template: '', music: '', pages: {}, requireApproval: false, status: 'draft' }, p.defaults || {});
    d.pages = Object.assign({ endpapers: true, welcome: true, sections: true, thanks: true }, d.pages || {});
    return Object.assign({}, p, { defaults: d });
  }

  // a sample album wearing the studio's details, drawn by the cover engine
  function sample(p) {
    const d = p.defaults || {};
    return {
      type: d.type || 'wedding', names: SAMPLE_NAMES, title: '', date: '2026-02-12', location: p.city || 'Udaipur',
      studio: { name: p.name || 'Your studio', phone: p.phone || '', url: p.url || '' },
      accent: p.accent || '', template: d.template || '', designView: d.template ? { cover: { template: d.template } } : {},
    };
  }

  /* ---------- logo: resized in the browser (PNG keeps transparency; large ones fall back to WebP or JPEG) ---------- */
  const LOGO_SIDE = 640, LOGO_MAX = 2 * 1024 * 1024;
  async function prepareLogo(file) {
    if (!/^image\/(png|jpeg|webp|gif|bmp|avif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image for your logo.');
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('This image could not be read. Save it as PNG or JPEG and try again.'); }
    const k = Math.min(1, LOGO_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const enc = (type, q) => new Promise((res) => c.toBlob(res, type, q));
    let blob = await enc('image/png');
    if (blob.size > LOGO_MAX) { const w = await enc('image/webp', 0.9); if (w && w.type === 'image/webp') blob = w; }
    if (blob.size > LOGO_MAX) blob = await enc('image/jpeg', 0.88);
    if (blob.size > LOGO_MAX) throw new Error('This logo is still larger than 2 MB after resizing. Use a simpler image.');
    return blob;
  }

  /* ---------- sections (the same HTML in the wizard and on the studio page) ---------- */
  function field(name, label, value, { hint = '', type = 'text', max = 120, ph = '', attrs = '' } = {}) {
    return `<label class="field"><span>${label}${hint ? ` <em>${hint}</em>` : ''}</span>` +
      `<input type="${type}" name="${name}" maxlength="${max}" value="${esc(value || '')}" placeholder="${esc(ph)}" ${attrs} /></label>`;
  }
  function studioFields(p) {
    const sameWa = !!p.phone && waDigits(p.phone) === waDigits(p.whatsapp);
    return `
      <div class="ob-group">
        ${field('name', 'Studio name', p.name, { max: 80, attrs: 'required autocomplete="organization"' })}
        ${field('tagline', 'Tagline', p.tagline, { hint: 'optional, one line under your name', ph: 'Candid weddings across Maharashtra' })}
        <div class="two">
          ${field('city', 'City', p.city, { max: 80, attrs: 'autocomplete="address-level2"', ph: 'Pune' })}
          ${field('url', 'Website', bare(p.url), { max: 300, ph: 'yourstudio.in', attrs: 'inputmode="url" autocomplete="url"' })}
        </div>
        <label class="field"><span>Studio address <em>optional</em></span><textarea name="address" maxlength="300" rows="2" placeholder="Shop 4, Lane 5, Koregaon Park, Pune 411001">${esc(p.address || '')}</textarea></label>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">How clients reach you</h3>
        <div class="two">
          ${field('phone', 'Phone', p.phone, { max: 40, type: 'tel', ph: '+91 98200 00000', attrs: 'autocomplete="tel"' })}
          <div class="field wa-field">
            ${field('whatsapp', 'WhatsApp', sameWa ? '' : p.whatsapp, { max: 40, type: 'tel', ph: '+91 98200 00000', attrs: sameWa ? 'disabled' : '' })}
            <label class="check small"><input type="checkbox" name="waSame"${sameWa ? ' checked' : ''} /> Same number as the phone</label>
          </div>
        </div>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">Where clients see your work <em>optional, a @handle or a link</em></h3>
        <div class="socials">
          <label class="field social"><span><svg class="i"><use href="#i-insta"/></svg>Instagram</span><input name="instagram" maxlength="200" value="${esc(p.instagram || '')}" placeholder="@yourstudio" /></label>
          <label class="field social"><span><svg class="i"><use href="#i-fb"/></svg>Facebook</span><input name="facebook" maxlength="200" value="${esc(p.facebook || '')}" placeholder="facebook.com/yourstudio" /></label>
          <label class="field social"><span><svg class="i"><use href="#i-yt"/></svg>YouTube</span><input name="youtube" maxlength="200" value="${esc(p.youtube || '')}" placeholder="@yourstudio" /></label>
        </div>
      </div>`;
  }
  function brandFields(p) {
    return `
      <div class="ob-group">
        <h3 class="ob-sub">Logo</h3>
        <div class="logo-box" id="logoBox">${logoBoxInner(p)}</div>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">Colour for new albums</h3>
        <div class="ob-colours" id="obColours">${coloursInner(p)}</div>
        <p class="hint">Used on covers, buttons and highlights. "Each occasion's own" gives a haldi album turmeric yellow and a wedding album rani pink.</p>
      </div>`;
  }
  function logoBoxInner(p) {
    if (!p.logo) {
      return `<label class="logo-drop" id="logoDrop"><input type="file" accept="image/png,image/jpeg,image/webp" id="logoFile" hidden />
        <svg class="i"><use href="#i-upload"/></svg><b>Add your logo</b><small>PNG with a see-through background looks best. Drop it here or choose a file; we resize it for you.</small></label>`;
    }
    return `<div class="logo-tests">
        <figure class="on-dark"><div class="lt-box"><img src="${esc(p.logo)}" alt="Your logo in the album title bar" /><span>Photographs by ${esc(p.name || 'your studio')}</span></div><figcaption>In the album's title bar</figcaption></figure>
        <figure class="on-light"><img src="${esc(p.logo)}" alt="Your logo on a light background" /><figcaption>On light pages</figcaption></figure>
      </div>
      <div class="logo-actions"><label class="btn quiet sm"><svg><use href="#i-upload"/></svg>Replace<input type="file" accept="image/png,image/jpeg,image/webp" id="logoFile" hidden /></label>
        <button type="button" class="link" id="logoRemove">Remove logo</button></div>`;
  }
  function coloursInner(p) {
    const cur = (p.accent || '').toLowerCase();
    return `<button type="button" class="ob-colour own" data-c="" aria-pressed="${!cur}"><span class="dots">${['wedding', 'haldi', 'mehendi', 'sangeet'].map((t) => `<i style="background:${ctx.M.TYPES[t].accent}"></i>`).join('')}</span>Each occasion's own</button>` +
      COLOURS.map((c) => `<button type="button" class="swatch" data-c="${c.toLowerCase()}" title="${c}" aria-label="Colour ${c}" aria-pressed="${cur === c.toLowerCase()}" style="background:${c}"></button>`).join('') +
      `<label class="swatch-any" title="Any colour"><span class="sr">Any colour</span><input type="color" value="${esc(cur || '#c8255f')}" /></label>`;
  }
  function defaultsFields(p) {
    const d = p.defaults;
    return `
      <div class="ob-group">
        <h3 class="ob-sub">Occasion you shoot most</h3>
        <div class="ob-pills" role="radiogroup" aria-label="Occasion">${Object.keys(ctx.M.TYPES).map((t) =>
          `<label class="ob-pill"><input type="radio" name="dType" value="${t}"${t === d.type ? ' checked' : ''} /><span>${esc(occLabel(t))}</span></label>`).join('')}</div>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">Front cover design</h3>
        <div class="ob-designs" id="obDesigns"></div>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">Background music</h3>
        <div class="songs ob-songs" id="obSongs" role="radiogroup" aria-label="Background music"><p class="hint">Loading songs…</p></div>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">Extra pages around the photos</h3>
        <div class="ob-ticks">${EXTRA.map(([k, l, h]) => `<label class="check"><input type="checkbox" name="pg_${k}"${d.pages[k] !== false ? ' checked' : ''} /><span><b>${l}</b><small>${h}</small></span></label>`).join('')}</div>
      </div>
      <div class="ob-group">
        <h3 class="ob-sub">Blessings and publishing</h3>
        <label class="check"><input type="checkbox" name="dApproval"${d.requireApproval ? ' checked' : ''} /><span><b>Read blessings before guests see them</b><small>New messages wait for you on the album's Blessings tab</small></span></label>
        <div class="choice">
          <label><input type="radio" name="dStatus" value="draft"${d.status !== 'published' ? ' checked' : ''} /><span>Start as a draft</span><small>Only you can open a new album until you publish it</small></label>
          <label><input type="radio" name="dStatus" value="published"${d.status === 'published' ? ' checked' : ''} /><span>Publish straight away</span><small>Anyone with the link can open a new album as soon as it is created</small></label>
        </div>
      </div>`;
  }

  // read what is typed into a section's form back into the draft profile
  function readStudio(form, p) {
    const f = form.elements;
    for (const k of ['name', 'tagline', 'city', 'address', 'phone', 'url', 'instagram', 'facebook', 'youtube']) if (f[k]) p[k] = f[k].value.trim();
    if (f.whatsapp) p.whatsapp = f.waSame.checked ? p.phone : f.whatsapp.value.trim();
  }
  function readDefaults(form, p) {
    const f = form.elements, d = p.defaults;
    if (!f.dType) return;
    d.type = (form.querySelector('input[name="dType"]:checked') || {}).value || 'wedding';
    const song = form.querySelector('input[name="dSong"]:checked');
    if (song) d.music = song.value;
    for (const [k] of EXTRA) d.pages[k] = !!f['pg_' + k].checked;
    d.requireApproval = f.dApproval.checked;
    d.status = (form.querySelector('input[name="dStatus"]:checked') || {}).value || 'draft';
  }
  const studioBody = (p) => ({ name: p.name, tagline: p.tagline, city: p.city, address: p.address, phone: p.phone, whatsapp: p.whatsapp,
    url: p.url, instagram: p.instagram, facebook: p.facebook, youtube: p.youtube });
  const brandBody = (p) => ({ accent: p.accent || '' });
  const defaultsBody = (p) => ({ defaults: p.defaults });

  /* ---------- the live preview ---------- */
  function guestStrip(p) {
    const links = [p.whatsapp && ['i-wa', 'WhatsApp'], p.phone && ['i-phone', 'Call'], p.instagram && ['i-insta', 'Instagram'], p.url && ['i-globe', 'Website']].filter(Boolean);
    const th = ctx.M.theme(sample(p));
    return `<div class="guest-view" style="--g-silk:${th.silk};--g-accent:${th.accent}">
      <div class="gv-bar"><div class="gv-title"><b class="display">${SAMPLE_NAMES.join(' & ')}</b><small>${esc(occLabel(sample(p).type))} in ${esc(p.city || 'Udaipur')}</small></div>
        <div class="gv-brand">${p.logo ? `<img src="${esc(p.logo)}" alt="" />` : ''}<span>Photographs by ${esc(p.name || 'your studio')}</span></div></div>
      <div class="gv-book">${ctx.partSvg(sample(p), 'cover')}</div>
      <div class="gv-contact"><span>Contact the studio</span>${links.length ? links.map(([i, l]) => `<i title="${l}"><svg><use href="#${i}"/></svg></i>`).join('') : '<em>add a phone, WhatsApp or Instagram</em>'}</div>
    </div>`;
  }
  const VIEWS = {
    card: { label: 'Inside the back cover', kind: 'inside-back', cap: 'Your name, phone and website are printed inside the back cover of every album.' },
    back: { label: 'Back cover', kind: 'back', cap: 'The back cover carries your name too.' },
    guest: { label: 'What guests see', cap: 'Guests see your logo and name at the top, and can reach you from the album.' },
    cover: { label: 'Front cover', kind: 'cover', cap: 'New albums start with this occasion, design and colour. Each can still be changed per album.' },
  };
  function previewHtml(p, view) {
    const v = VIEWS[view];
    const body = view === 'guest' ? guestStrip(p)
      : `<div class="book open ob-book" style="--ratio:1.5"><div class="leaves"></div><div class="board${view === 'card' ? ' closeup' : ''}">${ctx.partSvg(sample(p), v.kind)}</div></div>`;
    return `${body}<p class="ob-cap">${v.cap}</p>`;
  }
  function mountPreview(host, getP, views, start) {
    let view = start;
    host.innerHTML = `<div class="ob-pv-tabs" role="group" aria-label="Preview">${views.map((k) => `<button type="button" data-view="${k}" aria-pressed="${k === view}">${VIEWS[k].label}</button>`).join('')}</div><div class="ob-pv-body"></div>`;
    let raf = 0;
    const draw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { host.querySelector('.ob-pv-body').innerHTML = previewHtml(getP(), view); }); };
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      view = b.dataset.view;
      host.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    });
    draw();
    return { draw, show(v) { view = v; host.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === v))); draw(); } };
  }

  /* ---------- behaviour of the sections ---------- */
  function wireStudio(form, p, onChange) {
    const f = form.elements;
    const syncWa = () => { f.whatsapp.disabled = f.waSame.checked; if (f.waSame.checked) f.whatsapp.value = ''; };
    f.waSame.addEventListener('change', () => { syncWa(); if (!f.waSame.checked) f.whatsapp.focus(); });
    syncWa();
    form.addEventListener('input', () => { readStudio(form, p); onChange(); });
  }
  function wireBrand(form, p, onChange) {
    const colours = $('#obColours', form), box = $('#logoBox', form);
    colours.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      p.accent = b.dataset.c; colours.innerHTML = coloursInner(p); onChange();
    });
    colours.addEventListener('input', (e) => { if (e.target.type === 'color') { p.accent = e.target.value.toLowerCase(); colours.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', 'false')); onChange(); } });
    async function upload(file) {
      box.classList.add('busy');
      try {
        const blob = await prepareLogo(file);
        const fd = new FormData();
        fd.append('file', blob, 'logo.' + (blob.type.split('/')[1] || 'png'));
        const r = await ctx.api('studio-logo', { method: 'POST', form: fd });
        p.logo = r.logo; ctx.onProfile(r.studio);
        ctx.toast('Logo saved');
      } catch (err) { ctx.toast(err.message); }
      box.classList.remove('busy');
      box.innerHTML = logoBoxInner(p); onChange();
    }
    box.addEventListener('change', (e) => { if (e.target.id === 'logoFile' && e.target.files[0]) upload(e.target.files[0]); });
    box.addEventListener('click', async (e) => {
      if (!e.target.closest('#logoRemove')) return;
      try { await ctx.api('studio-logo', { method: 'DELETE' }); p.logo = ''; ctx.onProfile(Object.assign({}, ctx.profile, { logo: '' })); box.innerHTML = logoBoxInner(p); onChange(); ctx.toast('Logo removed'); }
      catch (err) { ctx.toast(err.message); }
    });
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('over'); const file = e.dataTransfer.files && e.dataTransfer.files[0]; if (file) upload(file); });
  }

  const player = new Audio();
  player.preload = 'none';
  addEventListener('hashchange', () => player.pause());
  async function wireDefaults(form, p, onChange) {
    const designs = $('#obDesigns', form), songs = $('#obSongs', form);
    function drawDesigns() {
      const d = p.defaults, list = ctx.CT.list;
      let fit = list.filter((t) => (t.occasions || []).includes(d.type));
      if (!fit.length) fit = list;
      fit = fit.slice(0, 7);
      if (d.template && !fit.some((t) => t.key === d.template)) { const cur = list.find((t) => t.key === d.template); if (cur) fit.unshift(cur); }
      const own = ctx.CT.defaultFor(d.type);
      const card = (key, name) => {
        const s = Object.assign(sample(p), { template: key, designView: key ? { cover: { template: key } } : {} });
        return `<button type="button" class="ob-design" data-key="${key}" aria-pressed="${(d.template || '') === key}"><span class="ob-design-img">${ctx.partSvg(s, 'cover')}</span><span>${esc(name)}</span></button>`;
      };
      designs.innerHTML = card('', 'Suggested for each occasion') + fit.filter((t) => t.key !== own || d.template === own).map((t) => card(t.key, t.name)).join('');
    }
    designs.addEventListener('click', (e) => {
      const b = e.target.closest('.ob-design'); if (!b) return;
      p.defaults.template = b.dataset.key;
      designs.querySelectorAll('.ob-design').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onChange();
    });
    form.addEventListener('change', (e) => {
      if (e.target.name === 'dType') { readDefaults(form, p); drawDesigns(); drawSongs(); onChange(); }
    });
    form.addEventListener('input', (e) => { if (/^(pg_|d[A-Z])/.test(e.target.name || '')) { readDefaults(form, p); onChange(); } });

    let tracks = [];
    const mmss = (n) => (n ? Math.floor(n / 60) + ':' + String(Math.round(n % 60)).padStart(2, '0') : '');
    function syncPlay() {
      songs.querySelectorAll('[data-play]').forEach((b) => {
        const on = !player.paused && player.dataset.file === b.dataset.play;
        b.classList.toggle('on', on); b.querySelector('use').setAttribute('href', on ? '#i-pause' : '#i-play');
      });
    }
    function drawSongs() {
      const d = p.defaults, fits = (t) => (t.occasions || []).includes(d.type);
      const list = [...tracks.filter(fits), ...tracks.filter((t) => !fits(t))];
      songs.innerHTML = `<label class="song none"><input type="radio" name="dSong" value=""${!d.music ? ' checked' : ''} /><span class="song-text"><b>No music</b></span></label>` +
        list.map((t) => `<label class="song"><input type="radio" name="dSong" value="${esc(t.file)}"${d.music === t.file ? ' checked' : ''} />
          <span class="song-text"><b>${esc(t.title)}${fits(t) ? ` <em>Suits ${esc(occLabel(d.type).toLowerCase())}</em>` : ''}</b><small>${esc(t.mood || '')}</small></span>
          <span class="song-len">${mmss(t.seconds)}</span>
          <button type="button" class="icon-btn play" data-play="${esc(t.file)}" aria-label="Listen to ${esc(t.title)}" title="Listen"><svg><use href="#i-play"/></svg></button></label>`).join('');
      syncPlay();
    }
    songs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-play]'); if (!b) return;
      e.preventDefault();
      if (!player.paused && player.dataset.file === b.dataset.play) player.pause();
      else { player.src = b.dataset.play; player.dataset.file = b.dataset.play; player.currentTime = 0; player.play().catch(() => ctx.toast('This song could not be played.')); }
      syncPlay();
    });
    player.onplay = player.onpause = syncPlay;
    drawDesigns();
    try { tracks = (await ctx.loadSongs()).tracks || []; } catch (e) { tracks = []; }
    if (p.defaults.music && !tracks.some((t) => t.file === p.defaults.music)) p.defaults.music = '';
    drawSongs();
  }

  /* ---------- the wizard ---------- */
  function progressHtml(i) {
    return `<ol class="ob-progress" aria-label="Setup progress">${STEPS.map((s, k) =>
      `<li class="${k < i ? 'done' : k === i ? 'now' : ''}"${k === i ? ' aria-current="step"' : ''}><svg class="bud" aria-hidden="true"><use href="#i-bud"/></svg><span>${s.name}</span></li>`).join('')}</ol>`;
  }
  const STEP_TEXT = {
    studio: ['Tell guests who made the album', 'Your studio\'s name and contact details go inside the back cover of every album and onto the page guests open. Fill in what you have; everything can be changed later.'],
    brand: ['Add your logo and colour', 'Your logo sits next to your name at the top of every album. The colour is where new albums start.'],
    defaults: ['Set how new albums start', 'Pick what you choose most often, so a new album is nearly ready the moment you create it. You can still change anything per album.'],
  };

  function mount(host, c) {
    ctx = c;
    const p = draftOf(ctx.profile);
    let i = 0;
    try { i = Math.min(3, Math.max(0, +localStorage.getItem(stepKey(p.id)) || 0)); } catch (e) { /* ignore */ }
    let preview = null;

    function remember() { try { localStorage.setItem(stepKey(p.id), String(i)); } catch (e) { /* ignore */ } }
    async function finish(skipped) {
      try {
        const r = await ctx.api('studio', { method: 'PUT', body: { onboarded: true } });
        ctx.onProfile(r.studio);
        try { localStorage.removeItem(stepKey(p.id)); } catch (e) { /* ignore */ }
        if (skipped) ctx.toast('Setup skipped. You can finish it any time on Your studio.');
        return true;
      } catch (err) { ctx.toast(err.message); return false; }
    }

    function draw() {
      player.pause();
      remember();
      if (i >= STEPS.length) return drawDone();
      const step = STEPS[i], [title, lede] = STEP_TEXT[step.key];
      host.innerHTML = `
        <div class="ob">
          <div class="ob-main">
            <div class="ob-head">
              <p class="ob-count">Step ${i + 1} of ${STEPS.length}</p>
              <button type="button" class="link quiet-link" id="obSkip">Skip setup for now</button>
            </div>
            ${progressHtml(i)}
            <h1 class="display ob-title">${title}</h1>
            <p class="lede">${lede}</p>
            <form class="ob-form" id="obForm" novalidate>
              ${step.key === 'studio' ? studioFields(p) : step.key === 'brand' ? brandFields(p) : defaultsFields(p)}
              <div class="ob-actions">
                ${i > 0 ? '<button type="button" class="btn quiet" id="obBack"><svg><use href="#i-back"/></svg>Back</button>' : ''}
                <button type="submit" class="btn" id="obNext">${i === STEPS.length - 1 ? 'Save and finish' : 'Save and continue'}</button>
                <p class="form-note" id="obNote" role="alert"></p>
              </div>
            </form>
          </div>
          <aside class="ob-preview" id="obPreview" aria-label="Preview"></aside>
        </div>`;
      const form = $('#obForm', host);
      const views = step.key === 'studio' ? ['card', 'guest', 'back'] : step.key === 'brand' ? ['guest', 'cover'] : ['cover', 'guest'];
      preview = mountPreview($('#obPreview', host), () => p, views, views[0]);
      const changed = () => preview.draw();
      if (step.key === 'studio') wireStudio(form, p, changed);
      else if (step.key === 'brand') wireBrand(form, p, changed);
      else wireDefaults(form, p, changed);

      $('#obSkip', host).addEventListener('click', async () => {
        if (!confirm('Skip the setup? Your studio name is used as it is, and albums start with the usual defaults. You can finish the setup any time on Your studio.')) return;
        if (await finish(true)) ctx.go('');
      });
      const back = $('#obBack', host);
      if (back) back.addEventListener('click', () => { i--; draw(); window.scrollTo(0, 0); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const note = $('#obNote', host), btn = $('#obNext', host);
        note.className = 'form-note';
        if (step.key === 'studio') {
          readStudio(form, p);
          if (p.name.length < 2) { note.className = 'form-note error'; note.textContent = 'Enter your studio name (at least 2 characters).'; form.elements.name.focus(); return; }
        }
        if (step.key === 'defaults') readDefaults(form, p);
        const body = step.key === 'studio' ? studioBody(p) : step.key === 'brand' ? brandBody(p) : defaultsBody(p);
        btn.disabled = true; note.textContent = 'Saving…';
        try {
          const r = await ctx.api('studio', { method: 'PUT', body });
          ctx.onProfile(r.studio);
          if (step.key === 'studio') Object.assign(p, { url: r.studio.url, whatsapp: r.studio.whatsapp, instagram: r.studio.instagram, facebook: r.studio.facebook, youtube: r.studio.youtube });
          if (i === STEPS.length - 1 && !(await finish(false))) { btn.disabled = false; note.textContent = ''; return; }
          i++; draw(); window.scrollTo(0, 0);
        } catch (err) {
          btn.disabled = false; note.className = 'form-note error'; note.textContent = err.message;
          const m = /^(Studio name|Tagline|City|Address|Phone|WhatsApp|Website|Instagram|Facebook|YouTube)/.exec(err.message);
          const map = { 'Studio name': 'name', Tagline: 'tagline', City: 'city', Address: 'address', Phone: 'phone', WhatsApp: 'whatsapp', Website: 'url', Instagram: 'instagram', Facebook: 'facebook', YouTube: 'youtube' };
          if (m && form.elements[map[m[1]]]) { const el = form.elements[map[m[1]]]; if (el.disabled && form.elements.waSame) { form.elements.waSame.checked = false; el.disabled = false; el.value = p.whatsapp; } el.focus(); }
        }
      });
      const first = form.querySelector('input:not([type=hidden]):not([disabled])');
      if (first && step.key === 'studio' && !p.tagline) form.elements.tagline.focus();
    }

    function drawDone() {
      const checks = [
        [!!(p.phone || p.whatsapp), 'Phone or WhatsApp for guests to reach you'],
        [!!(p.url || p.instagram || p.facebook || p.youtube), 'Website or social pages'],
        [!!p.logo, 'Your logo at the top of every album'],
        [true, 'New albums start as ' + occLabel(p.defaults.type).toLowerCase() + ' albums' + (p.defaults.music ? ' with music' : '')],
      ];
      host.innerHTML = `
        <div class="ob ob-done">
          <div class="ob-main">
            ${progressHtml(STEPS.length)}
            <h1 class="display ob-title">${esc(p.name)} is ready</h1>
            <p class="lede">Every album you make now carries your name, contact details and colour. Your first album takes a few minutes: add the couple's names, pick a cover and drop in the photos.</p>
            <ul class="ob-summary">${checks.map(([ok, t]) => `<li class="${ok ? 'ok' : 'todo'}"><svg class="i"><use href="#${ok ? 'i-check' : 'i-plus'}"/></svg><span>${esc(t)}${ok ? '' : ' <a href="#studio">Add it on Your studio</a>'}</span></li>`).join('')}</ul>
            <div class="ob-actions">
              <a class="btn" href="#new"><svg><use href="#i-plus"/></svg>Create your first album</a>
              <a class="btn quiet" href="#">Go to your shelf</a>
            </div>
          </div>
          <aside class="ob-preview" id="obPreview" aria-label="Preview"></aside>
        </div>`;
      mountPreview($('#obPreview', host), () => p, ['guest', 'cover', 'card'], 'guest');
    }
    draw();
  }

  /* ---------- the "Your studio" page: the same sections on one page ---------- */
  function mountStudioPage(host, c) {
    ctx = c;
    const p = draftOf(ctx.profile);
    host.innerHTML = `
      <div class="ob ob-page">
        <form class="ob-main ob-form" id="spForm" novalidate>
          <section class="sheet"><div><h2>Studio details</h2><p class="why">Printed inside the back cover of every album that leaves its own credit empty, and shown to guests.</p></div><div class="fields">${studioFields(p)}</div></section>
          <section class="sheet"><div><h2>Brand</h2><p class="why">Your logo is saved as soon as you choose it.</p></div><div class="fields">${brandFields(p)}</div></section>
          <section class="sheet"><div><h2>Album defaults</h2><p class="why">What a new album starts with. Albums you already made keep their own choices.</p></div><div class="fields">${defaultsFields(p)}</div></section>
          <div class="save-bar"><button class="btn" type="submit" id="spSave">Save changes</button><p class="form-note" id="spNote" role="status"></p></div>
        </form>
        <aside class="ob-preview" id="obPreview" aria-label="Preview"></aside>
      </div>`;
    const form = $('#spForm', host);
    const preview = mountPreview($('#obPreview', host), () => p, ['guest', 'card', 'cover'], 'guest');
    const changed = () => preview.draw();
    wireStudio(form, p, changed);
    wireBrand(form, p, changed);
    wireDefaults(form, p, changed);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      readStudio(form, p); readDefaults(form, p);
      const note = $('#spNote', host), btn = $('#spSave', host);
      note.className = 'form-note';
      if (p.name.length < 2) { note.className = 'form-note error'; note.textContent = 'Enter your studio name (at least 2 characters).'; return; }
      btn.disabled = true; note.textContent = 'Saving…';
      try {
        const r = await ctx.api('studio', { method: 'PUT', body: Object.assign(studioBody(p), brandBody(p), defaultsBody(p), { onboarded: true }) });
        ctx.onProfile(r.studio);
        Object.assign(p, { url: r.studio.url, whatsapp: r.studio.whatsapp, instagram: r.studio.instagram, facebook: r.studio.facebook, youtube: r.studio.youtube });
        for (const k of ['url', 'instagram', 'facebook', 'youtube']) if (form.elements[k]) form.elements[k].value = k === 'url' ? bare(p.url) : p[k];
        note.textContent = 'Saved'; ctx.toast('Studio saved');
      } catch (err) { note.className = 'form-note error'; note.textContent = err.message; }
      finally { btn.disabled = false; }
    });
  }

  window.Onboarding = {
    needed(user, profile) { return !!(user && !user.isMaster && profile && !profile.onboardedAt); },
    mount, mountStudioPage, waDigits,
  };
})();
