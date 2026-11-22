// Page sequences for albums whose photos or designed pages were uploaded from the admin page.
// Same rules as tools/build-album.mjs: cover alone, endpapers, spreads start on a left page, back cover alone on the left.
// Which extra pages appear (endpapers, welcome, section pages, thank you) is chosen per album: see pageOptions().

const count = (list) => list.reduce((n, p) => n + (p.spread || p.wide ? 2 : 1), 0);
const url = (key) => (key ? '/media/' + key : '');
export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'photos';

export const PAGE_OPTIONS = ['endpapers', 'welcome', 'sections', 'thanks'];
// Defaults: albums laid out from photos get every extra page; designed albums already have their own, so only endpapers.
export function pageOptions(saved, designed) {
  const def = { endpapers: true, welcome: !designed, sections: !designed, thanks: !designed };
  const out = { ...def };
  for (const k of PAGE_OPTIONS) if (saved && typeof saved[k] === 'boolean') out[k] = saved[k];
  return out;
}

const headOf = (o) => (o.endpapers ? [{ generated: 'cover', title: 'Cover' }, { generated: 'inside-front' }] : [{ generated: 'cover', title: 'Cover' }]);
const filler = (o) => (o.endpapers ? { generated: 'flyleaf' } : { blank: true });
// index of the next page in the book; odd = a left page (the cover is page 0, alone on the right)
const nextIndex = (o, body) => headOf(o).length + count(body);

function wrap(body, o) {
  const head = headOf(o);
  const tail = o.endpapers ? [{ generated: 'inside-back' }, { generated: 'back', title: 'Back cover' }] : [{ generated: 'back', title: 'Back cover' }];
  if ((head.length + count(body) + tail.length) % 2 === 1) body.push(filler(o));   // the back cover must be alone on a left page
  return [...head, ...body, ...tail];
}

// Designed pages (images or PDF pages): used as they are, starting on a left page.
export function designedPages(pages, opts) {
  const o = pageOptions(opts, true);
  const body = [];
  if (o.welcome) body.push({ generated: 'title', title: 'Welcome' });
  if (nextIndex(o, body) % 2 === 0) body.push(filler(o));
  for (const p of pages) {
    if (p.spread && nextIndex(o, body) % 2 === 0) body.push({ blank: true });
    const zoom = url(p.full_key || p.key);   // the full-quality copy, when one was kept, for zooming in
    body.push(p.spread ? { spread: url(p.key), thumb: url(p.thumb_key), zoom } : { src: url(p.key), thumb: url(p.thumb_key), zoom });
  }
  if (o.thanks) body.push({ generated: 'closing', title: 'Thank you' });
  return wrap(body, o);
}

export function pageRatioOf(pages) {
  const p = pages[0];
  if (!p || !p.width || !p.height) return 1.5;
  const r = p.width / p.height;
  return p.spread ? r / 2 : r;
}

// Photos only: a welcome page, a section page per ceremony, then landscape photos full-page, portraits in pairs,
// and photos that hold two pages across a spread.
export function photoPages(photos, opts) {
  const o = pageOptions(opts, false);
  const order = [];
  const bySection = new Map();
  for (const p of photos) {
    const key = p.section || '';
    if (!bySection.has(key)) { bySection.set(key, []); order.push(key); }
    bySection.get(key).push(p);
  }
  const body = o.welcome ? [{ generated: 'title', title: 'Welcome' }] : [];
  const sections = [];
  for (const sec of order) {
    const list = bySection.get(sec);
    const named = sec || order.length > 1, title = sec || 'Moments', from = body.length;
    if (named) {
      // page numbers start at 1; this is the section page, or the section's first photo when section pages are off
      sections.push({ key: slug(sec), title, count: list.length, page: nextIndex(o, body) + 1 });
      if (o.sections) body.push({ generated: 'divider', text: title, title });
    }
    let pending = null;
    const ph = (p) => ({ src: url(p.key), thumb: url(p.thumb_key), zoom: url(p.full_key || p.key), w: p.width, h: p.height });
    const flush = () => { if (pending) body.push({ layout: 'single', photos: [ph(pending)] }); pending = null; };
    for (const p of list) {
      if (p.spread) {
        // one image holding two pages: it must open on a left page, so a waiting portrait (or a filler) fills the gap
        const onRight = () => nextIndex(o, body) % 2 === 0;
        if (pending && onRight()) flush();
        if (onRight()) body.push(filler(o));
        body.push({ spread: url(p.key), thumb: url(p.thumb_key), zoom: url(p.full_key || p.key) });   // a waiting portrait stays for the next one
      } else if (p.width / p.height > 1.1) { flush(); body.push({ layout: 'full', photos: [ph(p)] }); }
      else if (pending) { body.push({ layout: 'pair', photos: [ph(pending), ph(p)] }); pending = null; }
      else pending = p;
    }
    flush();
    // without a section page, the section's first photo page carries its name for the contents list
    const first = !o.sections && named && body.slice(from).find((e) => e.layout || e.spread);
    if (first) first.title = title;
  }
  if (o.thanks) body.push({ generated: 'closing', title: 'Thank you' });
  const gallery = photos.map((p) => ({
    id: p.id, section: slug(p.section), display: url(p.key), thumb: url(p.thumb_key), download: url(p.full_key || p.key),
    width: p.width, height: p.height, blur: '',
  }));
  return { pages: wrap(body, o), sections, gallery };
}

// Pages from the page editor (albums.composed). Photo ids become URLs; two-page designs start on a left page.
export function composedPages(list, media, opts) {
  const o = pageOptions(opts, false);
  const byId = new Map(media.map((m) => [m.id, m]));
  const body = [];
  let section = '';   // the last section page's name, for "section" text boxes left empty
  for (const pg of list) {
    if (pg.gen === 'divider') section = pg.text || 'Moments';
    if (pg.gen) {
      const title = pg.gen === 'divider' ? pg.text || 'Moments' : pg.gen === 'title' ? 'Welcome' : 'Thank you';
      body.push({ generated: pg.gen, text: pg.text || '', title });
      continue;
    }
    const asPhoto = (m) => ({ src: url(m.key), thumb: url(m.thumb_key || m.key), zoom: url(m.full_key || m.key), w: m.width, h: m.height });
    if (pg.v === 2) {
      // free-form page: the viewer looks photos up by id
      const media = {};
      for (const id of [...pg.els.filter((e) => e.type === 'photo').map((e) => e.m), pg.bg && pg.bg.m]) { const m = id && byId.get(id); if (m) media[id] = asPhoto(m); }
      const page = { composed: { ...pg, section }, media };
      if (pg.s) { if (nextIndex(o, body) % 2 === 0) body.push(filler(o)); page.wide = true; }
      body.push(page);
      continue;
    }
    const photos = (pg.p || []).map((x) => {
      const m = x && x.m && byId.get(x.m);
      return m ? { src: url(m.key), thumb: url(m.thumb_key || m.key), zoom: url(m.full_key || m.key), w: m.width, h: m.height } : null;
    });
    const page = { composed: { t: pg.t, p: (pg.p || []).map((x) => (x && x.c ? { c: x.c } : {})), tx: pg.tx, bg: pg.bg, section }, photos };
    if (pg.s) {
      if (nextIndex(o, body) % 2 === 0) body.push(filler(o));
      page.wide = true;
    }
    body.push(page);
  }
  return wrap(body, o);
}

// An album without photos or pages yet still opens: front cover, endpapers, back cover.
export function coverOnly(opts) {
  return wrap([], pageOptions(opts, false));
}
