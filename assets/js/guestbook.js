/* Blessings (guestbook) widget shared by the viewer and the gallery.
   Guest input is always rendered with textContent, never parsed as HTML. */
(function () {
  'use strict';

  function timeAgo(ms) {
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (s < 60) return 'just now';
    if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
    if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  }

  function item(m) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="who"><span></span><span class="when"></span></div><p></p>';
    li.querySelector('.who span').textContent = m.name;
    li.querySelector('.when').textContent = timeAgo(m.created_at);
    li.querySelector('p').textContent = m.message;
    return li;
  }

  function mount({ albumId, list, form, note, more }) {
    const api = '/api/guestbook/' + encodeURIComponent(albumId);
    let before = 0, loaded = false;

    function empty(text) { list.replaceChildren(); const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; list.appendChild(li); }

    async function load(older = false) {
      try {
        const res = await fetch(api + (older && before ? '?before=' + before : ''), { credentials: 'same-origin' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!older) list.replaceChildren();
        data.messages.forEach((m) => list.appendChild(item(m)));
        if (data.messages.length) before = data.messages[data.messages.length - 1].id;
        if (more) more.hidden = !data.more;
        if (!list.children.length) empty('No messages yet. Be the first to write one.');
        loaded = true;
      } catch (e) {
        empty('Messages could not be loaded. Check your connection and try again.');
      }
    }

    if (more) more.addEventListener('click', () => load(true));
    form.addEventListener('keydown', (e) => e.stopPropagation());   // typing must not trigger page shortcuts
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      note.className = 'form-note';
      note.textContent = 'Sending…';
      try {
        const res = await fetch(api, {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fd.get('name'), message: fd.get('message') }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Your message was not sent. Try again.');
        form.elements.message.value = '';
        if (data.approved) {
          const e1 = list.querySelector('.empty');
          if (e1) e1.remove();
          list.prepend(item(data.message));
          note.textContent = 'Thank you. Your blessing has been added.';
        } else {
          note.textContent = 'Thank you. Your blessing will appear once the family approves it.';
        }
      } catch (err) {
        note.className = 'form-note error';
        note.textContent = err.message;
      } finally { btn.disabled = false; }
    });

    return { load, get loaded() { return loaded; } };
  }

  window.Guestbook = { mount, timeAgo };
})();
