/* Shared album helpers for the viewer, gallery and admin pages. */
(function () {
  'use strict';

  // Each album type gets its own silk (backdrop) and accent colour.
  const TYPES = {
    wedding:       { label: 'Wedding',           silk: '#0F3D3E', accent: '#C8255F' },
    engagement:    { label: 'Engagement',        silk: '#3B1E3F', accent: '#EFA00B' },
    'pre-wedding': { label: 'Pre-wedding shoot', silk: '#1F3A5F', accent: '#E86A92' },
    haldi:         { label: 'Haldi',             silk: '#7A5200', accent: '#F7C948' },
    mehendi:       { label: 'Mehendi',           silk: '#23452B', accent: '#C9A227' },
    sangeet:       { label: 'Sangeet',           silk: '#2E1F5E', accent: '#F05A9D' },
    reception:     { label: 'Reception',         silk: '#14213D', accent: '#E0B44C' },
    anniversary:   { label: 'Anniversary',       silk: '#5A1426', accent: '#E7B75F' },
    birthday:      { label: 'Birthday',          silk: '#14454F', accent: '#F2A541' },
    'baby-shower': { label: 'Baby shower',       silk: '#2F4858', accent: '#F6BD60' },
    maternity:     { label: 'Maternity shoot',   silk: '#4A3F5C', accent: '#E9A6A6' },
    other:         { label: '',                  silk: '#2B2D42', accent: '#EF8354' },
  };

  function formatDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const d = new Date(iso + 'T00:00:00Z');
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  }

  function title(a) {
    if (a.title) return a.title;
    return (a.names || []).filter(Boolean).join(' & ') || 'Photo album';
  }

  // "Wedding in Udaipur on 12 February 2026"
  function subtitle(a) {
    if (a.subtitle) return a.subtitle;
    const t = TYPES[a.type] || TYPES.other;
    const date = formatDate(a.date);
    if (t.label) {
      let s = t.label;
      if (a.location) s += ' in ' + a.location;
      if (date) s += ' on ' + date;
      return s === t.label && !a.location && !date ? t.label : s;
    }
    return [a.location, date].filter(Boolean).join(', ');
  }

  function theme(a) {
    const t = TYPES[a.type] || TYPES.wedding;
    const th = a.theme || {};
    return { silk: th.silk || t.silk, accent: th.accent || a.accent || t.accent };
  }

  function applyTheme(a, root = document.documentElement) {
    const th = theme(a);
    root.style.setProperty('--silk', th.silk);
    root.style.setProperty('--accent', th.accent);
  }

  // Light / dark preference shared by all pages.
  const THEME_KEY = 'albumviewer:theme';
  function getMode() {
    try { const m = localStorage.getItem(THEME_KEY); if (m === 'light' || m === 'dark') return m; } catch (e) { /* ignore */ }
    return 'dark';   // dark by default; the viewer and gallery have a switch for light
  }
  function setMode(m) {
    document.documentElement.dataset.theme = m;
    try { localStorage.setItem(THEME_KEY, m); } catch (e) { /* ignore */ }
  }
  document.documentElement.dataset.theme = getMode();

  // On a real server use the API; from file:// fall back to albums/<id>/album.js.
  async function load(id) {
    const qs = new URLSearchParams(location.search);
    const jsonUrl = qs.get('album');
    const fromJson = async (href) => {
      const url = new URL(href, location.href);
      const res = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
      const type = res.headers.get('Content-Type') || '';
      if (!res.ok || !type.includes('json')) {
        let msg = 'The album could not be loaded (' + res.status + ').';
        try { msg = (await res.json()).error || msg; } catch (e) { /* not json */ }
        const err = new Error(msg);
        err.status = res.ok ? 404 : res.status;   // html instead of json = no backend here
        throw err;
      }
      const data = await res.json();
      return { data, base: new URL(data.base || '', url).href, api: url.pathname.startsWith('/api/') };
    };
    if (jsonUrl) return fromJson(jsonUrl);
    id = (id || qs.get('id') || 'demo').replace(/[^a-z0-9_-]/gi, '');
    if (location.protocol !== 'file:') {
      try { return await fromJson('/api/album/' + id); }
      catch (e) {
        // 404 / 405 / network error = no backend or no such album there -> try the static album.js below
        if (e.status && e.status !== 404 && e.status !== 405 && e.status !== 501) throw e;
      }
    }
    const src = 'albums/' + id + '/album.js';
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('No album called "' + id + '" was found.'));
      document.head.appendChild(s);
    });
    if (!window.ALBUM_DATA) throw new Error(src + ' did not define window.ALBUM_DATA');
    return { data: window.ALBUM_DATA, base: new URL(src, location.href).href, api: false };
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.AlbumMeta = { TYPES, formatDate, title, subtitle, theme, applyTheme, getMode, setMode, load, esc };
})();
