/* QR codes for album links, drawn from the vendored qrcode-generator 1.4.4 (MIT, Kazuhiko Arase).
   QR.svg(text)   -> an SVG string (crisp at any size, for the share box)
   QR.png(text)   -> a PNG data URL with a white border, for printing on cards and invitations */
(function () {
  'use strict';
  function matrix(text) {
    const q = window.qrcode(0, 'M');   // type 0 = smallest size that fits; M = 15% error correction
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    return { n, dark: (r, c) => q.isDark(r, c) };
  }
  function svg(text, { fg = '#14121a', bg = '#ffffff', margin = 2 } = {}) {
    const { n, dark } = matrix(text);
    const size = n + margin * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (dark(r, c)) d += 'M' + (c + margin) + ' ' + (r + margin) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR code for the album link">' +
      '<rect width="' + size + '" height="' + size + '" fill="' + bg + '"/><path d="' + d + '" fill="' + fg + '"/></svg>';
  }
  function png(text, { px = 1024, fg = '#14121a', bg = '#ffffff', margin = 4, caption = '' } = {}) {
    const { n, dark } = matrix(text);
    const cell = Math.floor(px / (n + margin * 2));
    const size = cell * (n + margin * 2);
    const capH = caption ? Math.round(size * 0.09) : 0;
    const c = document.createElement('canvas');
    c.width = size; c.height = size + capH;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = fg;
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (dark(r, col)) g.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
    if (caption) {
      g.font = '600 ' + Math.round(capH * 0.5) + 'px Mukta, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(caption, size / 2, size + capH * 0.35, size * 0.9);
    }
    return c.toDataURL('image/png');
  }
  function download(text, fileName, opts) {
    const a = document.createElement('a');
    a.href = png(text, opts);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
  }
  window.QR = { svg, png, download };
})();
