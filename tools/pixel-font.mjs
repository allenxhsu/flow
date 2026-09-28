// Flow Pixel: the app's pixel font, drawn here glyph by glyph (original
// 5×7 bitmaps) and written out as a small TrueType font embedded in
// src/pixel-font.css — so the page carries its own type and loads nothing
// from another origin.
//
//   node tools/pixel-font.mjs          # regenerate src/pixel-font.css
//   node tools/pixel-font.mjs --check  # fail if the file is out of date
//
// One pixel is 128 units of a 1024-unit em (8 pixel rows to the em), so the
// font is crisp at multiples of 8px: 16px draws each pixel as 2 CSS pixels.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const P = 128;
const UPM = 1024;
const ASCENT = 8 * P;
const DESCENT = 2 * P;

// Rows top to bottom: 0–6 sit on the baseline (caps are 7 tall, x-height 5),
// rows 7–8 hang below it. '#' is ink. A glyph's width is its row length.
const G = {
  ' ': ['...'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  c: ['....', '....', '.###', '#...', '#...', '#...', '.###'],
  d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..'],
  g: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  i: ['#', '.', '#', '#', '#', '#', '#'],
  j: ['..#', '...', '..#', '..#', '..#', '..#', '..#', '#.#', '.#.'],
  k: ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#'],
  l: ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
  r: ['....', '....', '#.##', '##..', '#...', '#...', '#...'],
  s: ['....', '....', '.###', '#...', '.##.', '...#', '###.'],
  t: ['.#..', '.#..', '####', '.#..', '.#..', '.#..', '..##'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '"': ['#.#', '#.#'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  "'": ['#', '#'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '*': ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..'],
  ',': ['..', '..', '..', '..', '..', '.#', '.#', '#.'],
  '-': ['....', '....', '....', '####'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ':': ['.', '#', '.', '.', '.', '#'],
  ';': ['..', '.#', '..', '..', '..', '.#', '.#', '#.'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '=': ['....', '....', '####', '....', '####'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
  '[': ['##', '#.', '#.', '#.', '#.', '#.', '##'],
  '\\': ['#....', '#....', '.#...', '..#..', '...#.', '....#', '....#'],
  ']': ['##', '.#', '.#', '.#', '.#', '.#', '##'],
  '^': ['..#..', '.#.#.', '#...#'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '`': ['#.', '.#'],
  '{': ['..#', '.#.', '.#.', '#..', '.#.', '.#.', '..#'],
  '|': ['#', '#', '#', '#', '#', '#', '#'],
  '}': ['#..', '.#.', '.#.', '..#', '.#.', '.#.', '#..'],
  '~': ['.....', '.....', '.##.#', '#.##.'],
  '·': ['.', '.', '.', '#'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '÷': ['.....', '..#..', '.....', '#####', '.....', '..#..'],
  '−': ['.....', '.....', '.....', '#####'],
  '–': ['.....', '.....', '.....', '#####'],
  '—': ['.......', '.......', '.......', '#######'],
  '…': ['.....', '.....', '.....', '.....', '.....', '.....', '#.#.#'],
  '‘': ['.#', '#.', '#.'],
  '’': ['.#', '.#', '#.'],
  '“': ['.#.#', '#.#.', '#.#.'],
  '”': ['.#.#', '.#.#', '#.#.'],
  '°': ['.#.', '#.#', '.#.'],
  '≈': ['.....', '.##.#', '#.##.', '.....', '.##.#', '#.##.'],
  '≤': ['...#', '..#.', '.#..', '..#.', '...#', '....', '####'],
  '≥': ['#...', '.#..', '..#.', '.#..', '#...', '....', '####'],
  '▶': ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  '▸': ['...', '#..', '##.', '###', '##.', '#..'],
  '◆': ['.....', '..#..', '.###.', '#####', '.###.', '..#..'],
  '▲': ['.....', '..#..', '..#..', '.###.', '.###.', '#####', '#####'],
  '✓': ['.....', '....#', '...#.', '#.#..', '.#...'],
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..'],
  '←': ['.....', '..#..', '.#...', '#####', '.#...', '..#..'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  '↓': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '♥': ['.....', '.#.#.', '#####', '#####', '.###.', '..#..'],
  '☰': ['#####', '.....', '#####', '.....', '#####'],
};

/** A glyph's ink as rectangles in font units: runs per row, stacked where rows repeat. */
function rects(rows) {
  const out = [];
  let open = [];
  rows.forEach((row, r) => {
    const runs = [];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let e = x;
      while (row[e + 1] === '#') e++;
      runs.push([x, e + 1]);
      x = e;
    }
    const next = [];
    for (const [a, b] of runs) {
      const same = open.find((o) => o.a === a && o.b === b && o.r1 === r);
      if (same) { same.r1 = r + 1; next.push(same); open = open.filter((o) => o !== same); } else next.push({ a, b, r0: r, r1: r + 1 });
    }
    out.push(...open);
    open = next;
  });
  out.push(...open);
  // Row r spans from (6 − r) to (7 − r) pixels above the baseline.
  return out.map(({ a, b, r0, r1 }) => ({ x0: a * P, x1: b * P, y0: (7 - r1) * P, y1: (7 - r0) * P }));
}

class Buf {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 255); return this; }
  u16(v) { return this.u8(v >> 8).u8(v); }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { return this.u16(Math.floor(v / 65536) & 65535).u16(v & 65535); }
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  add(bytes) { for (const b of bytes) this.u8(b); return this; }
  pad() { while (this.bytes.length % 4) this.u8(0); return this; }
  get length() { return this.bytes.length; }
}

function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) sum = (sum + (((bytes[i] << 24) >>> 0) + ((bytes[i + 1] || 0) << 16) + ((bytes[i + 2] || 0) << 8) + (bytes[i + 3] || 0))) % 4294967296;
  return sum;
}

/** The font as TrueType bytes. */
export function buildFont() {
  const chars = Object.keys(G).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const notdef = ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'];
  const glyphs = [{ rows: notdef }, ...chars.map((c) => ({ ch: c, rows: G[c] }))];
  let maxPoints = 0; let maxContours = 0;
  let bxMin = 0; let byMin = 0; let bxMax = 0; let byMax = 0;
  const glyf = new Buf();
  const offsets = [];
  const metrics = [];
  for (const g of glyphs) {
    const width = Math.max(...g.rows.map((r) => r.length));
    const rs = rects(g.rows);
    offsets.push(glyf.length);
    const adv = (width + 1) * P;
    if (!rs.length) { metrics.push([adv, 0]); continue; }
    const xMin = Math.min(...rs.map((r) => r.x0)); const xMax = Math.max(...rs.map((r) => r.x1));
    const yMin = Math.min(...rs.map((r) => r.y0)); const yMax = Math.max(...rs.map((r) => r.y1));
    bxMin = Math.min(bxMin, xMin); byMin = Math.min(byMin, yMin); bxMax = Math.max(bxMax, xMax); byMax = Math.max(byMax, yMax);
    metrics.push([adv, xMin]);
    maxPoints = Math.max(maxPoints, rs.length * 4); maxContours = Math.max(maxContours, rs.length);
    glyf.i16(rs.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
    rs.forEach((_, i) => glyf.u16(i * 4 + 3));
    glyf.u16(0);
    // Clockwise: up the left side, across the top, down the right.
    const pts = rs.flatMap((r) => [[r.x0, r.y0], [r.x0, r.y1], [r.x1, r.y1], [r.x1, r.y0]]);
    for (let i = 0; i < pts.length; i++) glyf.u8(1);
    let px = 0; for (const [x] of pts) { glyf.i16(x - px); px = x; }
    let py = 0; for (const [, y] of pts) { glyf.i16(y - py); py = y; }
    glyf.pad();
  }
  offsets.push(glyf.length);
  const n = glyphs.length;

  const loca = new Buf(); for (const o of offsets) loca.u32(o);
  const hmtx = new Buf(); for (const [adv, lsb] of metrics) hmtx.u16(adv).i16(lsb);
  const advMax = Math.max(...metrics.map((m) => m[0]));

  const head = new Buf().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5F0F3CF5).u16(0x0009).u16(UPM)
    .u32(0).u32(0).u32(0).u32(0).i16(bxMin).i16(byMin).i16(bxMax).i16(byMax).u16(0).u16(8).i16(2).i16(1).i16(0);
  const hhea = new Buf().u32(0x00010000).i16(ASCENT).i16(-DESCENT).i16(0).u16(advMax).i16(0).i16(0).i16(bxMax)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(n);
  const maxp = new Buf().u32(0x00010000).u16(n).u16(maxPoints).u16(maxContours).u16(0).u16(0).u16(2)
    .u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  // cmap: one segment per character, format 4, for Unicode and Windows BMP.
  const codes = chars.map((c, i) => [c.codePointAt(0), i + 1]);
  const segs = [...codes, [0xFFFF, 0]];
  const segX2 = segs.length * 2;
  const pow = 2 ** Math.floor(Math.log2(segs.length));
  const sub = new Buf().u16(4).u16(16 + segs.length * 8).u16(0).u16(segX2).u16(pow * 2).u16(Math.log2(pow)).u16(segX2 - pow * 2);
  for (const [c] of segs) sub.u16(c);
  sub.u16(0);
  for (const [c] of segs) sub.u16(c);
  for (const [c, gid] of segs) sub.u16(c === 0xFFFF ? 1 : (gid - c + 65536) % 65536);
  for (let i = 0; i < segs.length; i++) sub.u16(0);
  const cmap = new Buf().u16(0).u16(2).u16(0).u16(3).u32(20).u16(3).u16(1).u32(20).add(sub.bytes);

  const names = [[1, 'Flow Pixel'], [2, 'Regular'], [3, 'Flow Pixel Regular 1.0'], [4, 'Flow Pixel'], [5, 'Version 1.0'], [6, 'FlowPixel-Regular']];
  const strings = names.map(([, s]) => [...s].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255]));
  const name = new Buf().u16(0).u16(names.length).u16(6 + names.length * 12);
  let at = 0;
  names.forEach(([id], i) => { name.u16(3).u16(1).u16(0x0409).u16(id).u16(strings[i].length).u16(at); at += strings[i].length; });
  for (const s of strings) name.add(s);

  const post = new Buf().u32(0x00030000).u32(0).i16(-P).i16(P).u32(0).u32(0).u32(0).u32(0).u32(0);

  const avg = Math.round(metrics.slice(1).reduce((s, m) => s + m[0], 0) / (n - 1));
  const os2 = new Buf().u16(4).i16(avg).u16(400).u16(5).u16(0)
    .i16(3 * P).i16(3 * P).i16(0).i16(P).i16(3 * P).i16(3 * P).i16(0).i16(4 * P).i16(P).i16(3 * P)
    .i16(0).add([2, 11, 6, 9, 0, 0, 0, 0, 0, 0])
    .u32(0x00000003).u32(0).u32(0).u32(0).tag('FLOW').u16(0x00C0)
    .u16(Math.min(...codes.map((c) => c[0]))).u16(Math.min(0xFFFF, Math.max(...codes.map((c) => c[0]))))
    .i16(ASCENT).i16(-DESCENT).i16(0).u16(ASCENT).u16(DESCENT).u32(1).u32(0)
    .i16(5 * P).i16(7 * P).u16(0).u16(32).u16(1);

  const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const pow2 = 2 ** Math.floor(Math.log2(tags.length));
  const font = new Buf().u32(0x00010000).u16(tags.length).u16(pow2 * 16).u16(Math.log2(pow2)).u16(tags.length * 16 - pow2 * 16);
  let offset = 12 + tags.length * 16;
  const body = new Buf();
  const dir = [];
  let headAt = 0;
  for (const t of tags) {
    const bytes = tables[t].bytes;
    if (t === 'head') headAt = offset;
    dir.push([t, checksum(bytes), offset, bytes.length]);
    body.add(bytes).pad();
    offset = 12 + tags.length * 16 + body.length;
  }
  for (const [t, sum, off, len] of dir) font.tag(t).u32(sum).u32(off).u32(len);
  font.add(body.bytes);
  const out = Uint8Array.from(font.bytes);
  const adjust = (0xB1B0AFBA - checksum(out) + 4294967296) % 4294967296;
  new DataView(out.buffer).setUint32(headAt + 8, adjust);
  return out;
}

/** The stylesheet that carries the font. */
export function fontFaceCss() {
  const b64 = Buffer.from(buildFont()).toString('base64');
  return `/* Flow Pixel: original 5×7 pixel type, generated by tools/pixel-font.mjs. Do not edit by hand. */
@font-face {
  font-family: 'Flow Pixel';
  src: url(data:font/ttf;base64,${b64}) format('truetype');
  font-display: block;
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = new URL('../src/pixel-font.css', import.meta.url);
  const css = fontFaceCss();
  if (process.argv.includes('--check')) {
    let cur = '';
    try { cur = readFileSync(file, 'utf8'); } catch { /* missing */ }
    if (cur !== css) { console.error('src/pixel-font.css is out of date: node tools/pixel-font.mjs'); process.exit(1); }
    console.log('src/pixel-font.css is up to date');
  } else {
    writeFileSync(file, css);
    console.log(`wrote src/pixel-font.css (${css.length} bytes)`);
  }
}
