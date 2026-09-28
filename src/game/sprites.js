// flow/src/game/sprites.js — the chibi people: original pixel sprites drawn
// from run-length rows, 16×19, four directions, three walking frames. A big
// head on a short body; colours come from the hero settings or a person's
// sprite options in the world pack.

const rl = (...runs) => runs.map(([c, n]) => c.repeat(n)).join('');

const TOP = [
  rl([' ', 4], ['o', 8], [' ', 4]), rl([' ', 2], ['o', 2], ['h', 2], ['L', 3], ['h', 3], ['o', 2], [' ', 2]),
  rl([' ', 1], ['o', 1], ['h', 2], ['L', 4], ['h', 6], ['o', 1], [' ', 1]), rl(['o', 1], ['h', 3], ['L', 2], ['h', 7], ['H', 2], ['o', 1]),
  rl(['o', 1], ['h', 12], ['H', 2], ['o', 1]),
];
const HEAD = {
  down: [...TOP,
    rl(['o', 1], ['h', 3], ['s', 7], ['S', 1], ['h', 3], ['o', 1]), rl(['o', 1], ['h', 2], ['s', 8], ['S', 2], ['h', 2], ['o', 1]),
    rl(['o', 1], ['h', 1], ['s', 2], ['E', 1], ['e', 1], ['s', 4], ['E', 1], ['e', 1], ['s', 1], ['S', 1], ['h', 1], ['o', 1]),
    rl(['o', 1], ['h', 1], ['s', 2], ['e', 2], ['s', 4], ['e', 2], ['S', 2], ['h', 1], ['o', 1]),
    rl([' ', 1], ['o', 1], ['p', 1], ['s', 8], ['S', 2], ['p', 1], ['o', 1], [' ', 1]),
    rl([' ', 2], ['o', 1], ['s', 4], ['m', 2], ['s', 2], ['S', 2], ['o', 1], [' ', 2]), rl([' ', 3], ['o', 10], [' ', 3])],
  up: [...TOP,
    rl(['o', 1], ['h', 14], ['o', 1]), rl(['o', 1], ['h', 14], ['o', 1]), rl(['o', 1], ['h', 14], ['o', 1]), rl(['o', 1], ['H', 14], ['o', 1]),
    rl([' ', 1], ['o', 1], ['H', 12], ['o', 1], [' ', 1]), rl([' ', 2], ['o', 1], ['s', 10], ['o', 1], [' ', 2]), rl([' ', 3], ['o', 10], [' ', 3])],
  left: [...TOP,
    rl(['o', 1], ['s', 4], ['h', 10], ['o', 1]), rl(['o', 1], ['s', 6], ['h', 8], ['o', 1]),
    rl(['o', 1], ['s', 1], ['E', 1], ['e', 1], ['s', 4], ['h', 7], ['o', 1]), rl(['o', 1], ['s', 1], ['e', 2], ['S', 4], ['h', 7], ['o', 1]),
    rl([' ', 1], ['o', 1], ['s', 1], ['p', 1], ['s', 5], ['h', 6], ['o', 1]),
    rl([' ', 2], ['o', 1], ['m', 1], ['s', 6], ['h', 3], ['o', 1], [' ', 2]), rl([' ', 3], ['o', 10], [' ', 3])],
};
const BODY = (dir) => (dir === 'left' ? [
  rl([' ', 4], ['o', 1], ['w', 6], ['o', 1], [' ', 4]),
  rl([' ', 4], ['o', 1], ['w', 2], ['s', 2], ['W', 2], ['o', 1], [' ', 4]), rl([' ', 4], ['o', 1], ['w', 2], ['s', 2], ['W', 2], ['o', 1], [' ', 4]),
  rl([' ', 4], ['o', 1], ['j', 6], ['o', 1], [' ', 4]),
] : [
  rl([' ', 3], ['o', 1], ['w', 2], ['s', 3], ['w', 2], ['W', 2], ['o', 1], [' ', 2]),
  rl([' ', 2], ['o', 1], ['s', 1], ['w', 3], ['c', 1], ['w', 3], ['W', 2], ['S', 1], ['o', 1], [' ', 1]), rl([' ', 2], ['o', 1], ['s', 1], ['w', 3], ['c', 1], ['w', 3], ['W', 2], ['S', 1], ['o', 1], [' ', 1]),
  rl([' ', 3], ['o', 1], ['k', 3], ['K', 2], ['k', 3], ['o', 1], [' ', 3]),
]);
const LEGS = (frame) => [
  rl([' ', 4], ['o', 1], ['j', 1], ['i', 1], ['j', 1], ['J', 3], ['o', 1], [' ', 4]),
  frame === 1 ? rl([' ', 4], ['o', 1], ['b', 3], ['J', 3], ['o', 1], [' ', 4]) : frame === 2 ? rl([' ', 4], ['o', 1], ['j', 3], ['b', 3], ['o', 1], [' ', 4]) : rl([' ', 4], ['o', 1], ['b', 6], ['o', 1], [' ', 4]),
  frame === 1 ? rl([' ', 4], ['o', 4], [' ', 8]) : frame === 2 ? rl([' ', 8], ['o', 4], [' ', 4]) : rl([' ', 4], ['o', 3], [' ', 1], ['o', 3], [' ', 5]),
];

/** The rows of one frame, facing `dir` (right is left mirrored by the painter). */
export function spriteRows(dir, frame = 0) {
  const src = dir === 'right' ? 'left' : dir;
  return [...HEAD[src], ...BODY(src), ...LEGS(frame)];
}

/** Lighten (a > 0) or darken (a < 0) a #rrggbb colour. */
export function shade(hex, a) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const f = a < 0 ? 0 : 255;
  const t = Math.abs(a);
  const m = (v) => Math.round(v + (f - v) * t);
  const h = (v) => m(v).toString(16).padStart(2, '0');
  return `#${h(n >> 16)}${h((n >> 8) & 255)}${h(n & 255)}`;
}

/** The palette for a person: hair, skin, shirt, trousers (and their shades) from options. */
export function paletteFor(o = {}) {
  const hair = o.hair || '#5e3c2a';
  const skin = o.skin || '#f8c8a0';
  const shirt = o.shirt || '#fbfbf6';
  const trousers = o.trousers || '#4a6cb4';
  return {
    o: '#5a4038', h: hair, H: o.hairShade || shade(hair, -0.2), L: shade(hair, 0.25), s: skin, S: shade(skin, -0.1), e: '#282030', E: '#ffffff',
    m: '#d88870', p: '#f4a8a0', i: shade(trousers, 0.2), c: '#c8ccd8', k: '#5a3a28', K: '#d8b050',
    w: shirt, W: o.shirtShade || shade(shirt, -0.14), j: trousers, J: o.trousersShade || shade(trousers, -0.2), b: o.shoes || '#7a4a2a',
  };
}

/** Canvases for every direction and frame: `${dir}${frame}` → 16×19 canvas. */
export function makeSprites(doc, options = {}) {
  const pal = paletteFor(options);
  const out = {};
  for (const dir of ['down', 'up', 'left', 'right']) for (const f of [0, 1, 2]) {
    const rows = spriteRows(dir, f);
    const c = doc.createElement('canvas');
    c.width = 16; c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((row, j) => [...row.padEnd(16)].forEach((ch, i) => {
      if (ch === ' ' || !pal[ch]) return;
      x.fillStyle = pal[ch];
      x.fillRect(dir === 'right' ? 15 - i : i, j, 1, 1);
    }));
    out[`${dir}${f}`] = c;
  }
  return out;
}
