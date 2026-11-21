// Contact sheets for eyeballing a build: build/contact-sheets/<id>-pages.jpg (as spreads) and <id>-gallery.jpg.
import sharp from 'sharp';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { FONTS } from './album-pages.mjs';
import { escMarkup, pool } from './util.mjs';

const BG = '#26242B', LABEL = '#B9B4BF';

async function label(text, size = 22) {
  const { data, info } = await sharp({ text: { text: `<span foreground="${LABEL}">${escMarkup(text)}</span>`,
    font: `${FONTS.mukta.family} ${size}`, fontfile: FONTS.mukta.file, rgba: true, dpi: 72 } })
    .png().toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

async function sheet(cells, { cellW, cellH, cols, gap, labelH, file }) {
  const rows = Math.ceil(cells.length / cols);
  const W = cols * cellW + (cols + 1) * gap, H = rows * (cellH + labelH) + (rows + 1) * gap;
  const layers = [];
  await pool(cells, 8, async (c, i) => {
    const x = gap + (i % cols) * (cellW + gap), y = gap + Math.floor(i / cols) * (cellH + labelH + gap);
    for (const part of c.parts) {
      const img = await sharp(part.file).resize(part.w, part.h, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
      layers.push({ input: img.data, left: x + part.x + Math.round((part.w - img.info.width) / 2),
        top: y + Math.round((cellH - img.info.height) / 2) });
    }
    if (c.label) {
      const l = await label(c.label);
      layers.push({ input: l.input, left: x + Math.round((cellW - l.width) / 2), top: y + cellH + 8 });
    }
  });
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(layers)
    .jpeg({ quality: 82, mozjpeg: true }).toFile(file);
  return file;
}

export async function writeContactSheets({ root, albumId, outDir, album }) {
  const dir = join(root, 'build', 'contact-sheets');
  await fsp.mkdir(dir, { recursive: true });
  const pw = 432, ph = Math.round(pw * album.pageHeight / album.pageWidth);

  // flatten: spreads become two halves, template pages a labelled swatch (the viewer draws them live)
  const swatch = async (text, color) => {
    const layers = [];
    if (text) { const l = await label(text, 20); layers.push({ input: l.input, left: Math.max(0, Math.round((pw - l.width) / 2)), top: Math.round((ph - l.height) / 2) }); }
    return sharp({ create: { width: pw, height: ph, channels: 3, background: color } }).composite(layers).png().toBuffer();
  };
  const flat = [];
  for (const p of album.pages) {
    if (p.generated) flat.push(await swatch(`${p.generated} (template: ${album.template})`, album.theme?.silk || '#0F3D3E'));
    else if (p.blank) flat.push(await swatch('', '#F4EEE6'));
    else if (p.spread) {
      const file = join(outDir, p.thumb);
      const m = await sharp(file).metadata();
      const half = Math.floor(m.width / 2);
      flat.push(await sharp(file).extract({ left: 0, top: 0, width: half, height: m.height }).png().toBuffer());
      flat.push(await sharp(file).extract({ left: half, top: 0, width: m.width - half, height: m.height }).png().toBuffer());
    } else flat.push(join(outDir, p.thumb));
  }

  // pages as the viewer shows them: cover alone on the right, then pairs, back cover alone on the left
  const pages = flat.map((file, i) => ({ file, n: i + 1 }));
  const spreads = [[null, pages[0]]];
  for (let i = 1; i < pages.length; i += 2) spreads.push([pages[i], pages[i + 1] ?? null]);
  const pageCells = spreads.map(([l, r]) => ({
    label: [l?.n, r?.n].filter(Boolean).join('–'),
    parts: [l && { file: l.file, x: 0, w: pw, h: ph }, r && { file: r.file, x: pw, w: pw, h: ph }].filter(Boolean),
  }));
  const a = await sheet(pageCells, { cellW: pw * 2, cellH: ph, cols: 4, gap: 40, labelH: 40,
    file: join(dir, `${albumId}-pages.jpg`) });

  const g = 260;
  const galleryCells = album.gallery.map((p) => ({
    label: `${p.id.slice(0, 4)} ${p.section}`,
    parts: [{ file: join(outDir, p.thumb), x: 0, w: g, h: g }],
  }));
  const b = await sheet(galleryCells, { cellW: g, cellH: g, cols: 8, gap: 28, labelH: 40,
    file: join(dir, `${albumId}-gallery.jpg`) });
  return [a, b];
}
