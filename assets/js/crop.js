/* Crop a photo to the shape of its spot: drag to move, zoom with the slider, the mouse wheel or a pinch.
   Shared by the page editor and the cover photo spots. The result is [cx, cy, zoom]: the focus point (0..1)
   and zoom (1..4), applied by PageTemplates.cropStyle() (object-position + scale around the focus point).

   Crop.open({ src, aspect, crop, shape: 'rect'|'circle'|'arch', title }) -> Promise<[cx, cy, z] | null> */
(function () {
  'use strict';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function style(c) {
    const [cx, cy, z] = c;
    return `object-position:${(cx * 100).toFixed(2)}% ${(cy * 100).toFixed(2)}%;transform:scale(${z});transform-origin:${(cx * 100).toFixed(2)}% ${(cy * 100).toFixed(2)}%`;
  }

  function open({ src, aspect = 1.5, crop, shape = 'rect', title = 'Adjust the photo' } = {}) {
    return new Promise((resolve) => {
      let c = [crop && crop[0] != null ? crop[0] : 0.5, crop && crop[1] != null ? crop[1] : 0.5, crop && crop[2] ? crop[2] : 1];
      const start = c.slice();
      const wrap = document.createElement('div');
      wrap.className = 'crop-overlay';
      wrap.innerHTML = `
        <div class="crop-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="crop-head"><h2 class="display">${esc(title)}</h2></div>
          <p class="crop-help">Drag the photo to choose what shows. Zoom with the slider or the mouse wheel.</p>
          <div class="crop-stage"><div class="crop-frame crop-${esc(shape)}" style="aspect-ratio:${aspect}">
            <img alt="" src="${esc(src)}" draggable="false"><span class="crop-grid" aria-hidden="true"></span></div></div>
          <label class="crop-zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="${c[2]}" aria-label="Zoom"><output></output></label>
          <div class="crop-actions">
            <button type="button" class="btn quiet" data-crop="reset">Reset</button>
            <span class="crop-spacer"></span>
            <button type="button" class="btn quiet" data-crop="cancel">Cancel</button>
            <button type="button" class="btn" data-crop="ok">Use this</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const frame = wrap.querySelector('.crop-frame'), img = frame.querySelector('img');
      const range = wrap.querySelector('input[type=range]'), out = wrap.querySelector('output');
      // size the frame to fit the screen whatever the aspect
      const fitFrame = () => {
        const maxW = Math.min(720, innerWidth - 64), maxH = Math.min(520, innerHeight - 260);
        let w = maxW, h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
        frame.style.width = Math.round(w) + 'px';
      };
      const paint = () => { img.setAttribute('style', style(c)); range.value = c[2]; out.textContent = Math.round(c[2] * 100) + '%'; };
      fitFrame(); paint();
      addEventListener('resize', fitFrame);

      // drag: moving the picture right shows more of its left side, so the focus point moves left
      let drag = null;
      const pts = new Map();
      frame.addEventListener('pointerdown', (e) => {
        frame.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, c: c.slice() };
        else if (pts.size === 2) { const [a, b] = [...pts.values()]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: c[2], c: c.slice() }; }
      });
      frame.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId) || !drag) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = frame.getBoundingClientRect();
        if (drag.pinch && pts.size === 2) {
          const [a, b] = [...pts.values()];
          c[2] = clamp(drag.z * Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch, 1, 4);
        } else if (!drag.pinch) {
          const k = 1.6 / c[2];
          c[0] = clamp(drag.c[0] - ((e.clientX - drag.x) / r.width) * k, 0, 1);
          c[1] = clamp(drag.c[1] - ((e.clientY - drag.y) / r.height) * k, 0, 1);
        }
        paint();
      });
      const up = (e) => { pts.delete(e.pointerId); if (!pts.size) drag = null; };
      frame.addEventListener('pointerup', up);
      frame.addEventListener('pointercancel', up);
      frame.addEventListener('wheel', (e) => { e.preventDefault(); c[2] = clamp(c[2] * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 4); paint(); }, { passive: false });
      range.addEventListener('input', () => { c[2] = +range.value; paint(); });

      const close = (value) => {
        removeEventListener('resize', fitFrame);
        removeEventListener('keydown', onKey, true);
        wrap.remove();
        resolve(value);
      };
      const round = (v) => v.map((n) => Math.round(n * 1000) / 1000);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        else if (e.key === 'Enter') { e.stopPropagation(); close(round(c)); }
        else if (e.key.startsWith('Arrow')) {
          const step = e.shiftKey ? 0.05 : 0.01;
          if (e.key === 'ArrowLeft') c[0] = clamp(c[0] - step, 0, 1);
          if (e.key === 'ArrowRight') c[0] = clamp(c[0] + step, 0, 1);
          if (e.key === 'ArrowUp') c[1] = clamp(c[1] - step, 0, 1);
          if (e.key === 'ArrowDown') c[1] = clamp(c[1] + step, 0, 1);
          paint(); e.preventDefault();
        }
      };
      addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-crop]');
        if (e.target === wrap) return close(null);
        if (!b) return;
        if (b.dataset.crop === 'reset') { c = [0.5, 0.5, 1]; paint(); }
        else if (b.dataset.crop === 'cancel') close(null);
        else close(start.join() === c.join() ? round(c) : round(c));
      });
      wrap.querySelector('[data-crop="ok"]').focus();
    });
  }
  window.Crop = { open, style };
})();
