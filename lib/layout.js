// Page sequences for albums whose photos or designed pages were uploaded from the admin page.
// Same rules as tools/build-album.mjs: cover alone, endpapers, spreads start on a left page, inside back cover on the right.

const count = (list) => list.reduce((n, p) => n + (p.spread ? 2 : 1), 0);
const url = (key) => (key ? '/media/' + key : '');
export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'photos';

function wrap(body) {
  const head = [{ generated: 'cover', title: 'Cover' }, { generated: 'inside-front' }];
  if ((head.length + count(body)) % 2 === 1) body.push({ generated: 'flyleaf' });
  return [...head, ...body, { generated: 'inside-back' }, { generated: 'back', title: 'Back cover' }];
}

// Designed pages (images or PDF pages): used as they are.
export function designedPages(pages) {
  const body = [{ generated: 'flyleaf' }];   // faces the inside front cover so spreads open on a left page
  for (const p of pages) {
    if (p.spread && (2 + count(body)) % 2 === 0) body.push({ blank: true });
    body.push(p.spread ? { spread: url(p.key), thumb: url(p.thumb_key) } : { src: url(p.key), thumb: url(p.thumb_key) });
  }
  return wrap(body);
}

export function pageRatioOf(pages) {
  const p = pages[0];
  if (!p || !p.width || !p.height) return 1.5;
  const r = p.width / p.height;
  return p.spread ? r / 2 : r;
}

// Photos only: a title page, a divider per ceremony, then landscape photos full-page and portraits in pairs.
export function photoPages(photos) {
  const order = [];
  const bySection = new Map();
  for (const p of photos) {
    const key = p.section || '';
    if (!bySection.has(key)) { bySection.set(key, []); order.push(key); }
    bySection.get(key).push(p);
  }
  const body = [{ generated: 'title', title: 'Welcome' }];
  const sections = [];
  for (const sec of order) {
    const list = bySection.get(sec);
    if (sec || order.length > 1) {
      body.push({ generated: 'divider', text: sec || 'Moments', title: sec || 'Moments' });
      sections.push({ key: slug(sec), title: sec || 'Moments', count: list.length, page: 2 + count(body) });
    }
    let pending = null;
    const ph = (p) => ({ src: url(p.key), thumb: url(p.thumb_key), w: p.width, h: p.height });
    const flush = () => { if (pending) body.push({ layout: 'single', photos: [ph(pending)] }); pending = null; };
    for (const p of list) {
      if (p.width / p.height > 1.1) { flush(); body.push({ layout: 'full', photos: [ph(p)] }); }
      else if (pending) { body.push({ layout: 'pair', photos: [ph(pending), ph(p)] }); pending = null; }
      else pending = p;
    }
    flush();
  }
  body.push({ generated: 'closing', title: 'Thank you' });
  const gallery = photos.map((p) => ({
    id: p.id, section: slug(p.section), display: url(p.key), thumb: url(p.thumb_key), download: url(p.key),
    width: p.width, height: p.height, blur: '',
  }));
  return { pages: wrap(body), sections, gallery };
}

// An album without photos or pages yet still opens: front cover, endpapers, back cover.
export function coverOnly() {
  return wrap([]);
}
