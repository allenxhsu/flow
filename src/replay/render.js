// flow/src/replay/render.js — draws one frame of the replay on a 256×224
// canvas: the overworld, the hero, the HUD, the text box and the finale.
// Everything is drawn from the timeline position, so seeking is exact.

import {
  PALETTE, TILES, ICONS, HEART, HERO_SIT, HERO_CHEER, PYJAMAS, LINE_HEIGHT,
  glyphFor, measureText, wrapText, fitText, personColors, lookFor, heroGrid, carGrid, overlay, HARD_HAT,
} from './art.js';
import { TILE, MAP_W, MAP_H, ZONE_NAMES, ROAD_TILES, BUILDINGS, PROPS } from './world.js';
import { segmentAt, clockAt, heartsFor, outfitFor, nightFor, clockText, hourOf, minutesText, energyMarks, isEvent } from './schedule.js';
import { alongPath } from './plan.js';

export const SCREEN_W = 256;
export const SCREEN_H = 224;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;
const HUD_H = 18;
const BOX = { x: 4, y: 162, w: 248, h: 58 };
const P = PALETTE;

const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ─── sprites ────────────────────────────────────────────────────────────────

const cache = new Map();
/** A grid painted into a canvas once, then reused. `colors` fills the slots. */
function sprite(key, grid, colors = {}) {
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(grid[0].length, grid.length);
  const g = c.getContext('2d');
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = colors[ch] ?? P[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

const px = (g, x, y, w, h, c) => { g.fillStyle = P[c] ?? c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return h ^ (h >>> 16); };

// ─── text ───────────────────────────────────────────────────────────────────

function glyphCanvas(ch, color) {
  const g = glyphFor(ch);
  if (!g) return null;
  return { w: g.w, c: sprite(`glyph:${ch}:${color}`, g.rows.map((r) => r.replace(/#/g, 'X')), { X: P[color] ?? color }) };
}

/** Draw text with the pixel font; returns the width drawn. Options: scale, shadow. */
export function drawText(g, str, x, y, color = '4', { scale = 1, shadow = null } = {}) {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of Array.from(String(str))) {
    const gl = glyphCanvas(ch, color);
    if (!gl) continue;
    if (shadow) { const s = glyphCanvas(ch, shadow); g.drawImage(s.c, cx + scale, cy + scale, s.c.width * scale, s.c.height * scale); }
    g.drawImage(gl.c, cx, cy, gl.c.width * scale, gl.c.height * scale);
    cx += (gl.w + 1) * scale;
  }
  return cx - x;
}

const textW = (s, scale = 1) => measureText(s) * scale;
const centerText = (g, s, cx, y, color, opt = {}) => drawText(g, s, cx - Math.floor(textW(s, opt.scale || 1) / 2), y, color, opt);

/** A retro window: ink fill, chalk rule, stone inner rule. */
function frame(g, x, y, w, h, { fill = '0', edge = '4', inner = '2' } = {}) {
  px(g, x + 1, y, w - 2, h, fill); px(g, x, y + 1, w, h - 2, fill);
  px(g, x + 2, y + 1, w - 4, 1, edge); px(g, x + 2, y + h - 2, w - 4, 1, edge);
  px(g, x + 1, y + 2, 1, h - 4, edge); px(g, x + w - 2, y + 2, 1, h - 4, edge);
  if (inner) { px(g, x + 3, y + 3, w - 6, 1, inner); px(g, x + 3, y + h - 4, w - 6, 1, inner); px(g, x + 3, y + 3, 1, h - 6, inner); px(g, x + w - 4, y + 3, 1, h - 6, inner); }
}

// ─── the overworld, painted once ────────────────────────────────────────────

const ROOFS = { blue: ['f', 'e', '1'], red: ['c', 'b', '8'], green: ['7', '6', '5'], grey: ['3', '2', '1'], orange: ['d', 'c', '8'], brown: ['a', '9', '8'] };
const WALLS = { white: ['4', '3'], sand: ['a', '9'], grey: ['3', '2'], brown: ['9', '8'] };

const WINDOW = ['00000000', '0f4f0ff0', '0ff00ff0', '00000000', '0ff00ff0', '0ff00ff0', '00000000'];
const DOOR = ['.00000000.', '0888888880', '0899889980', '0899889980', '0888888880', '0899889980', '0899889980', '08999999d0', '0899889980', '0888888880', '0000000000'];
const GLASS_DOOR = ['0000000000', '0ff4f0fff0', '0f4ff0fff0', '0ffff0fff0', '0ffff0fff0', '0ffff0fff0', '0ffff0fff0', '0ffff0fff0', '0ffff0fff0', '0000000000', '0000000000'];

function tileAt(tiles, x, y) { return x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 'T' : tiles[y][x]; }

function paintTiles(g, tiles, waterFrame) {
  const water = waterFrame ? TILES.water.map((r) => r.slice(2) + r.slice(0, 2)) : TILES.water;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tiles[y][x];
      const X = x * TILE; const Y = y * TILE;
      const h = hash(x, y);
      const grass = h % 5 === 0 ? sprite('t:grassTuft', TILES.grassTuft) : sprite('t:grass', TILES.grass);
      const n = (dx, dy) => tileAt(tiles, x + dx, y + dy);
      if (t === '~' || t === 'd') {
        g.drawImage(sprite(`t:water${waterFrame}`, water), X, Y);
        const land = (c) => c !== '~' && c !== 'd';
        if (land(n(0, -1))) { px(g, X, Y, 16, 2, 'f'); for (let i = h % 3; i < 16; i += 3) px(g, X + i, Y, 1, 1, '4'); }
        if (land(n(0, 1))) px(g, X, Y + 15, 16, 1, '5');
        if (land(n(-1, 0))) px(g, X, Y, 1, 16, 'f');
        if (land(n(1, 0))) px(g, X + 15, Y, 1, 16, 'f');
        if (t === 'd') g.drawImage(sprite('t:dock', TILES.dock), X, Y + 3, 16, 10);
        continue;
      }
      if (ROAD_TILES.has(t)) {
        g.drawImage(sprite('t:asphalt', TILES.asphalt), X, Y);
        const road = (c) => ROAD_TILES.has(c);
        if (!road(n(0, -1))) { px(g, X, Y, 16, 1, '3'); px(g, X, Y + 1, 16, 1, '2'); }
        if (!road(n(0, 1))) { px(g, X, Y + 14, 16, 1, '2'); px(g, X, Y + 15, 16, 1, '3'); }
        if (!road(n(-1, 0))) { px(g, X, Y, 1, 16, '3'); px(g, X + 1, Y, 1, 16, '2'); }
        if (!road(n(1, 0))) { px(g, X + 14, Y, 1, 16, '2'); px(g, X + 15, Y, 1, 16, '3'); }
        if (t === '=') { px(g, X + 2, Y + 7, 5, 2, 'd'); px(g, X + 10, Y + 7, 5, 2, 'd'); }
        if (t === '|') { px(g, X + 7, Y + 2, 2, 5, 'd'); px(g, X + 7, Y + 10, 2, 5, 'd'); }
        continue;
      }
      if (t === ':' || t === '_') {
        g.drawImage(t === ':' ? sprite('t:path', TILES.path) : sprite('t:plaza', TILES.plaza), X, Y);
        const soft = (c) => !(c === ':' || c === '_' || ROAD_TILES.has(c) || c === 'd');
        if (t === ':') {
          const edge = (side) => {
            for (let i = 0; i < 16; i++) {
              const jag = (hash(x * 16 + i, y * 7 + side) % 3) === 0;
              const [a, b2] = side === 0 ? [[X + i, Y], [X + i, Y + 1]] : side === 1 ? [[X + i, Y + 15], [X + i, Y + 14]] : side === 2 ? [[X, Y + i], [X + 1, Y + i]] : [[X + 15, Y + i], [X + 14, Y + i]];
              px(g, a[0], a[1], 1, 1, '6');
              px(g, b2[0], b2[1], 1, 1, jag ? '6' : '8');
            }
          };
          if (soft(n(0, -1))) edge(0);
          if (soft(n(0, 1))) edge(1);
          if (soft(n(-1, 0))) edge(2);
          if (soft(n(1, 0))) edge(3);
        } else if (soft(n(0, 1))) px(g, X, Y + 15, 16, 1, '2');
        continue;
      }
      g.drawImage(grass, X, Y);
      if (t === '*') g.drawImage(sprite('t:flowers', TILES.flowers), X, Y);
      else if (t === 'T') g.drawImage(sprite('t:tree', TILES.tree), X, Y);
      else if (t === 'b') g.drawImage(sprite('t:bush', TILES.bush), X, Y);
      else if (t === 'x') g.drawImage(sprite('t:crate', TILES.crate), X, Y);
      else if (t === 'F') {
        const vertical = n(0, -1) === 'F' || n(0, 1) === 'F';
        const horizontal = n(-1, 0) === 'F' || n(1, 0) === 'F';
        g.drawImage(sprite(vertical && !horizontal ? 't:fenceV' : 't:fence', vertical && !horizontal ? TILES.fenceV : TILES.fence), X, Y);
      }
    }
  }
}

function shadow(g, x, y, w, h) { g.fillStyle = 'rgba(28,26,46,0.28)'; g.fillRect(x, y, w, h); }

function sign(g, cx, y, icon) {
  px(g, cx - 6, y, 12, 11, '0');
  px(g, cx - 5, y + 1, 10, 9, 'a');
  g.drawImage(sprite(`icon:${icon}`, ICONS[icon] || ICONS.pin), cx - 4, y + 2);
}

/** Paint one building; returns the window rectangles (lit at night). */
function paintBuilding(g, b) {
  const x0 = b.x * TILE; const y0 = b.y * TILE; const W = b.w * TILE; const H = b.h * TILE;
  const [rl, rb, rd] = ROOFS[b.roof] || ROOFS.grey;
  const [wb, ws] = WALLS[b.wall] || WALLS.white;
  const doorX = x0 + (b.door - b.x) * TILE;
  const windows = [];
  shadow(g, x0 + W, y0 + 6, 4, H - 4);
  shadow(g, x0 + 4, y0 + H, W, 3);

  if (b.style === 'tent') {
    for (let yy = 0; yy < H; yy++) {
      const half = Math.round(((yy + 3) / (H + 3)) * (W / 2));
      const cx = x0 + W / 2;
      px(g, cx - half, y0 + yy, half, 1, 'c');
      px(g, cx, y0 + yy, half, 1, '8');
      px(g, cx - half - 1, y0 + yy, 1, 1, '0'); px(g, cx + half, y0 + yy, 1, 1, '0');
    }
    px(g, x0, y0 + H - 1, W, 1, '0');
    for (let yy = 12; yy < H - 1; yy++) { const hw = Math.round((yy - 12) / 3); px(g, x0 + W / 2 - hw - 1, y0 + yy, hw * 2 + 2, 1, '0'); }
    px(g, x0 + W / 2 - 1, y0 - 3, 2, 4, '8');
    sign(g, doorX + 8 + 14, y0 + H - 12, b.icon);
    return windows;
  }

  const roofH = b.style === 'office' ? 10 : (b.h - 1) * TILE;
  // Roof
  if (b.style === 'factory') {
    px(g, x0, y0, W, roofH, '2');
    for (let yy = 0; yy < roofH; yy += 8) {
      px(g, x0, y0 + yy, W, 5, '3');
      px(g, x0, y0 + yy, W, 1, '4');
      px(g, x0, y0 + yy + 5, W, 1, '1');
      for (let xx = 2; xx < W - 2; xx += 6) px(g, x0 + xx, y0 + yy + 6, 4, 2, 'f');
    }
  } else if (b.style === 'warehouse') {
    for (let xx = 0; xx < W; xx++) px(g, x0 + xx, y0, 1, roofH, xx % 4 < 2 ? '3' : '2');
    px(g, x0, y0, W, 2, '4');
    px(g, x0, y0 + roofH - 3, W, 3, '1');
  } else if (b.style === 'office') {
    px(g, x0, y0, W, roofH, '2'); px(g, x0, y0, W, 2, '3'); px(g, x0, y0 + roofH - 2, W, 2, '1');
    px(g, x0 + 6, y0 + 3, 8, 4, '3'); px(g, x0 + 6, y0 + 6, 8, 1, '1');
  } else {
    px(g, x0, y0, W, roofH, rb);
    px(g, x0, y0, W, 3, rl);
    for (let yy = 6; yy < roofH - 3; yy += 4) {
      px(g, x0, y0 + yy, W, 1, rd);
      for (let xx = (yy / 4) % 2 ? 2 : 6; xx < W; xx += 8) px(g, x0 + xx, y0 + yy - 3, 1, 3, rd);
    }
    px(g, x0, y0 + roofH - 3, W, 3, rd);
  }
  // Walls
  const wy = y0 + roofH;
  const wallH = H - roofH;
  px(g, x0, wy, W, wallH, wb);
  px(g, x0, wy + wallH - 2, W, 2, ws);
  px(g, x0, wy, 1, wallH, ws); px(g, x0 + W - 1, wy, 1, wallH, ws);
  px(g, x0, wy, W, 1, '0');
  if (b.style === 'warehouse') for (let xx = 4; xx < W; xx += 6) px(g, x0 + xx, wy + 1, 1, wallH - 3, ws);
  if (b.style === 'factory') for (let xx = 4; xx < W; xx += 8) px(g, x0 + xx, wy + 1, 1, wallH - 3, ws);

  // Windows: every wall tile but the door's; offices have rows of them.
  const rows = b.style === 'office' ? Math.floor((wallH - 4) / 12) : 1;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < b.w; i++) {
      const tx = x0 + i * TILE;
      const bottom = r === rows - 1;
      if (bottom && (b.x + i === b.door || ((b.style === 'factory' || b.style === 'warehouse') && Math.abs(b.x + i - b.door) <= 1))) continue;
      const wy2 = b.style === 'office' ? wy + 3 + r * 12 : wy + 4;
      if (b.style === 'shop' && bottom) { g.drawImage(sprite('win', WINDOW), tx + 4, wy2 + 1); windows.push([tx + 5, wy2 + 2, 6, 4]); continue; }
      g.drawImage(sprite('win', WINDOW), tx + 4, wy2);
      windows.push([tx + 5, wy2 + 1, 6, 5]);
    }
  }
  // Doors
  if (b.style === 'factory' || b.style === 'warehouse') {
    const dx = doorX - 12; const dw = 40; const dh = Math.min(wallH - 2, 14);
    px(g, dx, wy + wallH - dh - 1, dw, dh + 1, '0');
    for (let yy = 1; yy < dh; yy++) px(g, dx + 1, wy + wallH - dh - 1 + yy, dw - 2, 1, yy % 2 ? '3' : '2');
    px(g, dx + 1, wy + wallH - 2, dw - 2, 1, 'd');
    for (let xx = 0; xx < dw - 2; xx += 4) px(g, dx + 1 + xx, wy + wallH - 2, 2, 1, '0');
  } else {
    g.drawImage(sprite(b.style === 'office' || b.style === 'shop' ? 'glassdoor' : 'door', b.style === 'office' || b.style === 'shop' ? GLASS_DOOR : DOOR), doorX + 3, wy + wallH - 11);
  }
  if (b.awning) {
    for (let xx = 0; xx < W; xx++) px(g, x0 + xx, wy, 1, 4, Math.floor(xx / 4) % 2 ? '4' : 'b');
    for (let xx = 0; xx < W; xx += 4) px(g, x0 + xx + 1, wy + 4, 2, 1, Math.floor(xx / 4) % 2 ? '4' : 'b');
  }
  // Outline, chimney, smokestacks, sign
  g.fillStyle = P[0];
  g.fillRect(x0 - 1, y0 - 1, W + 2, 1); g.fillRect(x0 - 1, y0 + H, W + 2, 1);
  g.fillRect(x0 - 1, y0, 1, H); g.fillRect(x0 + W, y0, 1, H);
  if (b.chimney) { px(g, x0 + W - 13, y0 - 7, 8, 12, '0'); px(g, x0 + W - 12, y0 - 6, 6, 10, 'b'); px(g, x0 + W - 12, y0 - 6, 6, 2, '1'); px(g, x0 + W - 12, y0 - 2, 1, 6, 'c'); }
  if (b.style === 'factory') {
    for (const sx of [x0 + W - 34, x0 + W - 18]) {
      px(g, sx - 1, y0 - 19, 10, 28, '0');
      px(g, sx, y0 - 18, 8, 26, 'b');
      px(g, sx, y0 - 18, 2, 26, 'c');
      px(g, sx + 6, y0 - 18, 2, 26, '8');
      px(g, sx, y0 - 14, 8, 2, '4');
      px(g, sx, y0 - 18, 8, 2, '1');
    }
  }
  sign(g, doorX + 8, wy - 12, b.icon);
  return windows;
}

function paintProp(g, p) {
  const X = p.x * TILE; const Y = p.y * TILE;
  if (p.kind === 'clothesline') {
    const W = p.w * TILE;
    px(g, X + 1, Y + 1, 2, 15, '8'); px(g, X + W - 3, Y + 1, 2, 15, '8');
    px(g, X + 2, Y + 3, W - 4, 1, '3');
    const clothes = [['b', 6, 8], ['f', 16, 10], ['d', 28, 6], ['4', 36, 7]];
    for (const [c, cx, h] of clothes) { px(g, X + cx - 1, Y + 3, 8, h + 2, '0'); px(g, X + cx, Y + 4, 6, h, c); }
    shadow(g, X + 2, Y + 15, W - 4, 1);
  } else if (p.kind === 'fountain') {
    const cx = X + 16; const cy = Y + 16;
    for (let yy = -16; yy < 16; yy++) for (let xx = -16; xx < 16; xx++) {
      const d = Math.hypot(xx + 0.5, (yy + 0.5) * 1.15);
      const c = d < 3 ? '3' : d < 11 ? ((xx * 3 + yy * 5) & 7 ? 'e' : 'f') : d < 12.5 ? '4' : d < 14.5 ? '3' : d < 15.5 ? '0' : null;
      if (c) px(g, cx + xx, cy + yy, 1, 1, c);
    }
    px(g, cx - 1, cy - 8, 2, 6, 'f'); px(g, cx - 3, cy - 9, 6, 2, '4');
  } else if (p.kind === 'bench') {
    px(g, X + 1, Y + 4, 14, 3, '8'); px(g, X + 1, Y + 8, 14, 4, '9'); px(g, X + 1, Y + 8, 14, 1, 'a');
    px(g, X + 2, Y + 12, 2, 3, '0'); px(g, X + 12, Y + 12, 2, 3, '0'); shadow(g, X + 2, Y + 15, 12, 1);
  } else if (p.kind === 'lamp') {
    px(g, X + 7, Y + 3, 2, 12, '1'); px(g, X + 5, Y + 14, 6, 2, '0');
    px(g, X + 4, Y, 8, 5, '0'); px(g, X + 5, Y + 1, 6, 3, 'd');
  } else if (p.kind === 'mailbox') {
    px(g, X + 7, Y + 8, 2, 8, '8'); px(g, X + 3, Y + 2, 10, 7, '0'); px(g, X + 4, Y + 3, 8, 5, 'e'); px(g, X + 4, Y + 3, 8, 1, 'f');
    px(g, X + 12, Y + 1, 2, 4, 'b');
  } else if (p.kind === 'barrel') {
    px(g, X + 3, Y + 2, 10, 13, '0'); px(g, X + 4, Y + 3, 8, 11, '9'); px(g, X + 4, Y + 3, 8, 2, 'a');
    px(g, X + 4, Y + 7, 8, 1, '8'); px(g, X + 4, Y + 11, 8, 1, '8'); px(g, X + 10, Y + 3, 2, 11, '8');
  }
}

function paintSignpost(g, x, y, icon = 'pin') {
  const X = x * TILE; const Y = y * TILE;
  px(g, X + 7, Y + 8, 2, 8, '8');
  px(g, X + 1, Y + 1, 14, 9, '0'); px(g, X + 2, Y + 2, 12, 7, 'a');
  g.drawImage(sprite(`icon:${icon}`, ICONS[icon] || ICONS.pin), X + 4, Y + 2);
  shadow(g, X + 7, Y + 15, 4, 1);
}

/** The static world, in two water frames, plus where the windows are. */
export function paintWorld(world, usedSpares) {
  const frames = [0, 1].map(() => makeCanvas(WORLD_W, WORLD_H));
  let windows = [];
  frames.forEach((c, f) => {
    const g = c.getContext('2d');
    paintTiles(g, world.tiles, f);
    for (const p of PROPS) paintProp(g, p);
    for (const s of usedSpares) paintSignpost(g, s.sign.x, s.sign.y, s.icon);
    const w = [];
    for (const b of BUILDINGS) w.push(...paintBuilding(g, b));
    windows = w;
  });
  return { frames, windows };
}

// ─── people and cars ────────────────────────────────────────────────────────

function personSprite(kind, look, pose, dir, frame, outfit) {
  const colors = personColors(look);
  if (outfit.pyjamas) Object.assign(colors, { T: PYJAMAS.shirt, U: '#6f9ccc', P: PYJAMAS.trousers, Q: '#6f9ccc' });
  const key = `p:${kind}:${JSON.stringify(colors)}:${pose}:${dir}:${frame}:${outfit.hardHat ? 1 : 0}:${look.long ? 1 : 0}`;
  let grid;
  if (pose === 'sit') grid = outfit.hardHat ? overlay(HERO_SIT, HARD_HAT.down, 2) : HERO_SIT;
  else if (pose === 'cheer') grid = HERO_CHEER;
  else grid = heroGrid(dir, frame, { hardHat: outfit.hardHat, longHair: !!look.long });
  return sprite(key, grid, colors);
}

function carSprite(dir) {
  return sprite(`car:${dir}`, carGrid(dir), { R: P.b, D: P[8], L: P.c });
}

function bubble(g, x, y, draw) {
  px(g, x + 1, y, 12, 12, '0'); px(g, x, y + 1, 14, 10, '0');
  px(g, x + 1, y + 1, 12, 10, '4');
  px(g, x + 5, y + 12, 4, 1, '0'); px(g, x + 6, y + 13, 2, 1, '0'); px(g, x + 6, y + 11, 2, 1, '4');
  draw(x + 3, y + 2);
}

const MOMENT_ICON = [[/drive/i, 'car'], [/chat|call|talk/i, 'chat'], [/laundry/i, 'basket'], [/meal|lunch|dinner|breakfast|eat/i, 'fork'], [/rest|nap|sleep/i, 'zz'], [/gym|run|walk/i, 'star']];
const momentIcon = (title) => (MOMENT_ICON.find(([re]) => re.test(title || '')) || [null, 'star'])[1];

// ─── the renderer ───────────────────────────────────────────────────────────

/**
 * A renderer bound to one canvas and one replay. draw(t, ms) paints the frame
 * at timeline second `t`; `ms` is a free-running clock for ambient motion.
 */
export function createRenderer(canvas, { replay, timeline, plan, world, places, items = [] }) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const usedSpares = [];
  for (const p of places.values()) if (p.spare && !usedSpares.includes(p.spare)) usedSpares.push({ ...p.spare, icon: p.zone === 'road' ? 'car' : 'pin' });
  const bg = paintWorld(world, usedSpares);
  const heroLook = { ...(replay.hero || {}) };
  let highlight = null;
  let camera = { x: 0, y: 0 };

  const focusOf = (at, pl) => {
    const seg = at.seg;
    if (pl.car?.path && pl.hero.hidden) { const c = alongPath(pl.car.path, ease(at.p)); return { x: c.x, y: c.y }; }
    if (pl.hero.path) return alongPath(pl.hero.path, at.p);
    return seg.type === 'finale' ? pl.hero.at : pl.hero.at || { x: 0, y: 0 };
  };

  function drawMap(at, pl, ms) {
    const f = focusOf(at, pl);
    camera = {
      x: Math.round(Math.max(0, Math.min(WORLD_W - SCREEN_W, f.x * TILE + 8 - SCREEN_W / 2))),
      y: Math.round(Math.max(0, Math.min(WORLD_H - SCREEN_H + 40, f.y * TILE + 8 - 92))),
    };
    const cx = camera.x; const cy = camera.y;
    g.fillStyle = P[0];
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.drawImage(bg.frames[Math.floor(ms / 600) % 2], -cx, -cy);

    // Smoke from the factory stacks.
    const factory = BUILDINGS.find((b) => b.style === 'factory');
    for (const [k, sx] of [[0, factory.x * TILE + factory.w * TILE - 34], [1, factory.x * TILE + factory.w * TILE - 18]]) {
      for (let i = 0; i < 3; i++) {
        const u = ((ms / 2400 + i / 3 + k * 0.17) % 1);
        const r = 2 + Math.round(u * 4);
        const x = sx + 4 + Math.round(u * 14) - cx; const y = factory.y * TILE - 20 - Math.round(u * 22) - cy;
        g.globalAlpha = 0.85 * (1 - u);
        px(g, x - r, y - r + 1, r * 2, r * 2 - 2, '3'); px(g, x - r + 1, y - r, r * 2 - 2, r * 2, '3');
        g.globalAlpha = 1;
      }
    }

    const seg = at.seg;
    const b = seg.beat;
    const actors = [];
    // The car: driving, or parked where it was left.
    let car = null;
    if (pl.car?.path) { const c = alongPath(pl.car.path, ease(at.p)); car = { x: c.x, y: c.y, dir: pl.car.path.length > 1 ? c.dir : pl.car.dir }; }
    else if (pl.car?.at) car = { ...pl.car.at, dir: pl.car.dir };
    const foot = (x, y, w) => { g.fillStyle = 'rgba(28,26,46,0.3)'; g.fillRect(Math.round(x) + (16 - w) / 2, Math.round(y) + 13, w, 3); g.fillRect(Math.round(x) + (16 - w) / 2 + 1, Math.round(y) + 12, w - 2, 5); };
    if (car) actors.push({ y: car.y, draw: () => { const bob = pl.car?.path && at.p < 1 ? ((ms / 90) | 0) % 2 : 0; g.drawImage(carSprite(car.dir), Math.round(car.x * TILE) - cx, Math.round(car.y * TILE) - cy - bob); } });

    // The hero.
    let hero = null;
    if (!pl.hero.hidden) {
      let pos; let dir = pl.hero.dir; let frame = 'stand'; let pose = 'stand';
      if (pl.hero.path) {
        const a = alongPath(pl.hero.path, at.p);
        pos = a; dir = a.dir; frame = at.p >= 1 ? 'stand' : (Math.floor(a.step * 2) % 2 ? 'a' : 'b');
      } else pos = { ...pl.hero.at };
      if (seg.type === 'beat') {
        if (b.kind === 'idle' || (b.kind === 'moment' && /meal|rest|lunch|dinner|breakfast|nap/i.test(b.title || ''))) pose = 'sit';
        if (b.kind === 'purchase') pose = 'cheer';
        if (b.kind === 'moment' && /walk/i.test(b.title || '') && !b.who) {
          // Pace up and down the floor.
          const range = [-2, -1, 1, 2].every((dx) => Number.isFinite(world.cost(pl.hero.at.x + dx, pl.hero.at.y))) ? 2 : 0;
          if (range) {
            const ph = (at.local / 1.6) % 1;
            const off = Math.sin(ph * Math.PI * 2) * range;
            pos.x += off; dir = Math.cos(ph * Math.PI * 2) > 0 ? 'right' : 'left';
            frame = Math.floor(at.local * 6) % 2 ? 'a' : 'b';
          }
        }
      }
      if (seg.type === 'intro') dir = 'down';
      const whereNow = pl.hero.path && at.p < 0.5 && pl.from ? pl.from : pl.here;
      const clock = clockAt(timeline, at);
      const outfit = outfitFor({ place: whereNow?.id, placeName: whereNow?.name, zone: whereNow?.zone, at: clock });
      hero = { x: pos.x, y: pos.y };
      actors.push({ y: pos.y, draw: () => {
        const bob = pose === 'cheer' ? 0 : (frame !== 'stand' ? 1 : 0);
        foot(pos.x * TILE - cx, pos.y * TILE - cy, 10);
        const hx = Math.round(pos.x * TILE) - cx; const hy = Math.round(pos.y * TILE) - cy - 2 - bob;
        g.drawImage(personSprite('hero', heroLook, pose, dir, frame, outfit), hx, hy);
        if (pose === 'sit' && b?.kind === 'moment' && /meal|lunch|dinner|breakfast/i.test(b.title || '')) {
          px(g, hx, hy + 12, 16, 6, '0'); px(g, hx + 1, hy + 13, 14, 3, 'a'); px(g, hx + 1, hy + 16, 14, 1, '9');
          px(g, hx + 5, hy + 13, 6, 2, '4'); px(g, hx + 6, hy + 13, 4, 1, 'c');
        }
      } });
    }
    // The person you are with.
    if (pl.npc && seg.type === 'beat') {
      const look = lookFor(pl.npc.name);
      actors.push({ y: pl.npc.y, draw: () => foot(pl.npc.x * TILE - cx, pl.npc.y * TILE - cy, 10) || g.drawImage(personSprite(`npc:${pl.npc.name}`, look, 'stand', pl.npc.dir, 'stand', {}), pl.npc.x * TILE - cx, pl.npc.y * TILE - cy - 2) });
    }
    actors.sort((a, b2) => a.y - b2.y).forEach((a) => a.draw());

    // Night falls: tint the map, light the windows and lamps.
    const clock = clockAt(timeline, at);
    const night = nightFor(clock == null ? null : hourOf(clock));
    if (night > 0) {
      g.fillStyle = `rgba(18,20,64,${night})`;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      g.globalAlpha = Math.min(1, night * 2);
      for (const [x, y, w, h] of bg.windows) px(g, x - cx, y - cy, w, h, 'd');
      for (const p of PROPS.filter((q) => q.kind === 'lamp')) {
        g.fillStyle = 'rgba(245,215,76,0.25)';
        g.fillRect(p.x * TILE - 6 - cx, p.y * TILE - 4 - cy, 28, 24);
        px(g, p.x * TILE + 5 - cx, p.y * TILE + 1 - cy, 6, 3, 'd');
      }
      g.globalAlpha = 1;
    }

    // Effects over the hero (or the car).
    const anchor = hero || car;
    if (anchor && seg.type === 'beat') {
      const ax = Math.round(anchor.x * TILE) - cx; const ay = Math.round(anchor.y * TILE) - cy - 2;
      const L = at.local;
      if (b.kind === 'done' && L < 1.8) {
        for (let k = 0; k < 3; k++) {
          const u = Math.min(1, L / 0.9);
          const gx = ax + 4 + Math.round((k - 1) * 12 * u); const gy = ay - 4 - Math.round(Math.sin(u * Math.PI) * 14 + u * 4);
          if (L < 1.2) g.drawImage(sprite('icon:gem', ICONS.gem), gx, gy);
        }
        const s = `+${b.points}`;
        drawText(g, s, ax + 17, ay - 2 - Math.round(Math.min(L, 1) * 8), 'd', { shadow: '0' });
      }
      if (b.kind === 'rework') {
        g.drawImage(sprite('icon:cloud', ICONS.cloud), ax + 4, ay - 14 + (((ms / 300) | 0) % 2));
        if (L < 2) { const s = `${b.points}`.replace('-', '−'); drawText(g, s, ax + 17, ay - 2 - Math.round(Math.min(L, 1) * 8), 'c', { shadow: '0' }); }
      }
      if (b.kind === 'purchase') {
        g.drawImage(sprite('icon:cake', ICONS.cake), ax + 4, ay - 9);
        if (L < 2) { const s = `${b.points}`.replace('-', '−'); drawText(g, s, ax + 17, ay - 2 - Math.round(Math.min(L, 1) * 8), 'c', { shadow: '0' }); }
      }
      if (b.kind === 'moment' && !/walk/i.test(b.title || '')) {
        const icon = momentIcon(b.title);
        if (pl.npc) {
          const talker = Math.floor(L / 0.9) % 2;
          const npcRight = pl.npc.x >= anchor.x;
          const nx = pl.npc.x * TILE - cx;
          const bx = talker ? (npcRight ? nx + 9 : nx - 7) : (npcRight ? ax - 7 : ax + 9);
          const by = (talker ? pl.npc.y * TILE - cy : ay) - 12;
          bubble(g, bx, by, (x, y) => { for (let k = 0; k < 3; k++) if (((ms / 250) | 0) % 4 > k) px(g, x + 1 + k * 3, y + 5, 2, 2, '0'); });
        } else if (icon !== 'car') {
          bubble(g, ax + 12, ay - 11, (x, y) => g.drawImage(sprite(`icon:${icon}`, ICONS[icon]), x, y));
        }
      }
      if (b.kind === 'idle') {
        bubble(g, ax + 12, ay - 9, (x, y) => { for (let k = 0; k < 3; k++) if (((ms / 220) | 0) % 4 > k) px(g, x + 1 + k * 3, y + 5, 2, 2, '0'); });
      }
    }

    // A tapped place blinks.
    if (highlight && ms - highlight.at < 2400 && ((ms / 200) | 0) % 2 === 0) {
      const r = highlight.rect;
      g.strokeStyle = P.d; g.lineWidth = 1;
      g.strokeRect(r.x - cx - 1.5, r.y - cy - 1.5, r.w + 3, r.h + 3);
    }
  }

  function drawHud(at) {
    const seg = at.seg;
    const idx = at.i;
    const prev = idx > 0 ? timeline.segments[idx - 1].hud : seg.hud;
    const count = seg.type === 'beat' && isEvent(seg.beat) ? Math.min(1, at.local / 0.8) : 1;
    const hud = seg.hud;
    px(g, 0, 0, SCREEN_W, HUD_H, '0');
    px(g, 0, HUD_H, SCREEN_W, 1, '1');
    heartsFor(hud.stamina).forEach((h, k) => {
      const colors = h === 'full' ? { L: P.b, R: P.b } : h === 'half' ? { L: P.b, R: P[1] } : { L: P[1], R: P[1] };
      const grid = h === 'empty' ? HEART.map((r) => r.replace('4', 'L')) : HEART;
      g.drawImage(sprite(`heart:${h}`, grid, colors), 4 + k * 8, 6);
    });
    g.drawImage(sprite('icon:flask', ICONS.flask), 47, 5);
    px(g, 56, 7, 44, 6, '3'); px(g, 57, 8, 42, 4, '1');
    const mana = Math.max(0, Math.min(10, hud.mana ?? 0));
    const mw = Math.round((42 * mana) / 10);
    if (mw > 0) { px(g, 57, 8, mw, 4, '6'); px(g, 57, 8, mw, 1, '7'); }
    g.drawImage(sprite('icon:gem', ICONS.gem), 106, 5);
    const pts = Math.round(prev.points + (hud.points - prev.points) * count);
    drawText(g, pts < 0 ? `−${-pts}` : String(pts), 117, 5, pts < 0 ? 'c' : '4');
    items.slice(0, 2).forEach((it, k) => {
      const x = 160 + k * 17;
      px(g, x, 2, 15, 14, '3'); px(g, x + 1, 3, 13, 12, '1');
      g.drawImage(sprite(`icon:${it.icon}`, ICONS[it.icon] || ICONS.star), x + 4, 5);
    });
    const clock = clockText(clockAt(timeline, at));
    drawText(g, clock, SCREEN_W - 4 - textW(clock), 5, 'a');
  }

  function drawBanners(at) {
    const seg = at.seg;
    let y = HUD_H + 5;
    if (seg.enterZone && at.local < 1.6 && seg.type === 'beat') {
      const s = `~ ${(ZONE_NAMES[seg.enterZone] || seg.enterZone).toUpperCase()} ~`;
      const w = textW(s) + 16;
      frame(g, (SCREEN_W - w) >> 1, y, w, 17, { fill: '0', edge: '3', inner: null });
      centerText(g, s, SCREEN_W / 2, y + 5, '4');
      y += 20;
    }
    if (seg.type !== 'beat' || at.local > 2.4) return;
    for (const s of seg.banners.slice(0, 2)) {
      const w = textW(s) + 16;
      const slide = Math.min(0, Math.round((at.local - 0.25) * 60));
      frame(g, (SCREEN_W - w) >> 1, y + slide, w, 17, { fill: '0', edge: 'd', inner: null });
      centerText(g, s, SCREEN_W / 2, y + slide + 5, 'd');
      y += 20;
    }
  }

  function drawTextBox(at, ms) {
    const seg = at.seg;
    const b = seg.beat;
    if (seg.type !== 'beat' || !isEvent(b)) return;
    frame(g, BOX.x, BOX.y, BOX.w, BOX.h);
    if (b.who) {
      const w = textW(b.who) + 12;
      frame(g, BOX.x + 6, BOX.y - 13, w, 16, { fill: '0', edge: 'd', inner: null });
      drawText(g, b.who, BOX.x + 12, BOX.y - 8, 'd');
    }
    const head = `${clockText(b.start)}  ${b.placeName || ''}`;
    drawText(g, fitText(head, BOX.w - 16), BOX.x + 8, BOX.y + 7, '3');
    const lines = wrapText(b.text || '', BOX.w - 16).slice(0, 3);
    let budget = Math.floor(at.local * 42);
    const total = lines.reduce((n, l) => n + Array.from(l).length, 0);
    lines.forEach((line, k) => {
      const chars = Array.from(line);
      const shown = chars.slice(0, Math.max(0, budget)).join('');
      budget -= chars.length;
      let x = BOX.x + 8;
      const y = BOX.y + 20 + k * LINE_HEIGHT;
      // Points are gold when earned, amber when spent.
      for (const tok of shown.split(/(\s+)/)) {
        const color = /^\+\d/.test(tok) ? 'd' : /^[−-]\d/.test(tok) ? 'c' : '4';
        x += drawText(g, tok, x, y, color);
      }
    });
    if (Math.floor(at.local * 42) >= total && ((ms / 350) | 0) % 2 === 0) drawText(g, '▼', BOX.x + BOX.w - 14, BOX.y + BOX.h - 12, 'd');
  }

  function drawIntro(at) {
    const a = Math.min(1, (timeline.segments[0].dur - at.local) / 0.5);
    g.fillStyle = `rgba(28,26,46,${0.55 * Math.max(0, a)})`;
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    if (at.local > timeline.segments[0].dur - 0.4) return;
    frame(g, 36, 70, 184, 64);
    centerText(g, 'DAY REPLAY', SCREEN_W / 2, 82, 'd', { scale: 2, shadow: '8' });
    const d = new Date(`${replay.day}T12:00:00`);
    const date = Number.isNaN(d.getTime()) ? String(replay.day || '') : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    centerText(g, date, SCREEN_W / 2, 108, '4');
  }

  // ─── the finale ───────────────────────────────────────────────────────────

  function finaleFrame(title, k) {
    px(g, 0, 0, SCREEN_W, SCREEN_H, '0');
    for (let i = 0; i < 40; i++) { const h = hash(i, 7); px(g, h % SCREEN_W, (h >>> 9) % SCREEN_H, 1, 1, i % 3 ? '1' : '2'); }
    frame(g, 4, 4, SCREEN_W - 8, SCREEN_H - 8, { fill: '0', edge: '4', inner: '1' });
    centerText(g, title, SCREEN_W / 2, 14, 'd', { scale: 2, shadow: '8' });
    for (let i = 0; i < 4; i++) px(g, SCREEN_W / 2 - 14 + i * 8, SCREEN_H - 14, 4, 4, i === k ? 'd' : '1');
  }

  function drawTotals(L) {
    const f = replay.finale || {};
    finaleFrame('DAY COMPLETE', 0);
    const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
    const rows = [
      ['gem', 'Points earned', sign(f.points || 0), 'd'],
      ['cake', 'Spent', f.spent ? `−${f.spent}` : '0', f.spent ? 'c' : '4'],
      ['hammer', 'Tasks done', String(f.tasks || 0), '4'],
      ['chat', 'Moments', String(f.moments || 0), '4'],
      ['cloud', 'Rework', String(f.reworks || 0), f.reworks ? 'c' : '4'],
      ['star', 'Best combo', f.bestCombo ? `×${f.bestCombo}` : '—', '4'],
      ['box', 'Best batch', f.bestBatch ? `×${f.bestBatch}` : '—', '4'],
      ['up', 'Level', String(f.level ?? 1), '7'],
      ['gem', 'Balance', f.balance < 0 ? `−${-f.balance}` : String(f.balance ?? 0), f.balance < 0 ? 'c' : 'd'],
    ];
    rows.forEach(([icon, label, value, color], k) => {
      if (L < 0.2 + k * 0.25) return;
      const y = 40 + k * 17;
      g.drawImage(sprite(`icon:${icon}`, ICONS[icon]), 30, y);
      drawText(g, label, 46, y, '3');
      drawText(g, value, 226 - textW(value), y, color);
      for (let x = 50 + textW(label); x < 220 - textW(value); x += 4) px(g, x, y + 6, 1, 1, '1');
    });
  }

  function drawEnergy(L) {
    finaleFrame('ENERGY', 1);
    const series = (replay.series || []).filter((s) => Number.isFinite(s.at));
    const X0 = 30; const X1 = 236; const Y0 = 50; const Y1 = 132;
    g.drawImage(sprite('heart:full', HEART, { L: P.b, R: P.b }), 30, 36);
    drawText(g, 'Stamina', 40, 36, 'b');
    g.drawImage(sprite('icon:flask', ICONS.flask), 92, 35);
    drawText(g, 'Mana', 102, 36, '6');
    if (series.length < 2) { centerText(g, 'Not enough of the day to chart.', SCREEN_W / 2, 90, '3'); return; }
    const t0 = series[0].at; const t1 = series[series.length - 1].at || t0 + 1;
    const sx = (t) => X0 + ((t - t0) / Math.max(1, t1 - t0)) * (X1 - X0);
    const sy = (v) => Y1 - (Math.max(0, Math.min(10, v)) / 10) * (Y1 - Y0);
    for (const v of [0, 5, 10]) { for (let x = X0; x <= X1; x += 3) px(g, x, Math.round(sy(v)), 1, 1, '1'); drawText(g, String(v), X0 - 4 - textW(String(v)), Math.round(sy(v)) - 3, '2'); }
    // Hour ticks
    const firstHour = Math.ceil(hourOf(t0));
    for (let h = firstHour; ; h += 3) {
      const t = new Date(t0); t.setHours(h, 0, 0, 0);
      if (t.getTime() > t1) break;
      const x = Math.round(sx(t.getTime()));
      px(g, x, Y1 + 1, 1, 3, '2');
      const s = String(t.getHours());
      drawText(g, s, x - Math.floor(textW(s) / 2), Y1 + 5, '2');
    }
    const reveal = Math.min(1, L / 2);
    const tMax = t0 + (t1 - t0) * reveal;
    const line = (key, color) => {
      for (let i = 1; i < series.length; i++) {
        const a = series[i - 1]; const b = series[i];
        if (a.at > tMax) break;
        const bt = Math.min(b.at, tMax);
        const u = b.at === a.at ? 1 : (bt - a.at) / (b.at - a.at);
        const x0 = sx(a.at); const y0 = sy(a[key]); const x1 = sx(bt); const y1 = sy(a[key] + (b[key] - a[key]) * u);
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) px(g, Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n) - 1, 2, 2, color);
      }
    };
    line('mana', '6');
    line('stamina', 'b');
    const marks = energyMarks(series, 4);
    marks.forEach((m, k) => {
      if (m.at > tMax) return;
      const x = Math.round(sx(m.at)); const y = Math.round(Math.min(sy(series[m.i].stamina), sy(series[m.i].mana))) - 12;
      const c = m.delta < 0 ? 'c' : '7';
      const badge = (bx, by) => { px(g, bx, by, 11, 11, '0'); px(g, bx + 1, by + 1, 9, 9, c); drawText(g, String(k + 1), bx + 3, by + 2, '0'); };
      badge(x - 5, y - 2);
      const ly = 145 + k * 12;
      if (ly > SCREEN_H - 26) return;
      badge(13, ly - 1);
      const parts = [];
      if (m.stamina) parts.push(`♥ ${m.stamina > 0 ? '+' : '−'}${Math.abs(m.stamina)}`);
      if (m.mana) parts.push(`mana ${m.mana > 0 ? '+' : '−'}${Math.abs(m.mana)}`);
      const right = parts.join(' ');
      drawText(g, fitText(`${clockText(m.at)} ${m.label}`, 200 - textW(right) - 34), 28, ly + 1, '4');
      drawText(g, right, 240 - textW(right), ly + 1, c);
    });
  }

  function drawTime(L) {
    const f = replay.finale || {};
    finaleFrame('WHERE TIME WENT', 2);
    const colors = { home: 'e', road: '9', factory: 'c', town: 'b', elsewhere: '6' };
    const rows = [
      ...(f.zones || []).map((z) => ({ label: ZONE_NAMES[z.zone] || z.zone, minutes: z.minutes, color: colors[z.zone] || '6' })),
      { label: 'Travel', minutes: f.travel || 0, color: '3' },
      { label: 'Idle', minutes: f.idle || 0, color: '2' },
    ].filter((r) => r.minutes > 0);
    const max = Math.max(1, ...rows.map((r) => r.minutes));
    const total = rows.reduce((n, r) => n + r.minutes, 0);
    rows.slice(0, 7).forEach((r, k) => {
      const y = 42 + k * 18;
      drawText(g, r.label, 14, y + 1, '4');
      const w = Math.round((110 * r.minutes) / max * Math.min(1, L / 1.2));
      px(g, 86, y, 112, 9, '1');
      if (w > 0) { px(g, 86, y, w, 9, r.color); px(g, 86, y, w, 1, '4'); }
      const s = minutesText(r.minutes);
      drawText(g, s, 242 - textW(s), y + 1, '3');
    });
    // The whole day as one strip.
    let x = 14;
    const y = 176;
    drawText(g, `${minutesText(total)} in all  ·  idle is just time`, 14, y - 12, '2');
    for (const r of rows) { const w = Math.round((228 * r.minutes) / Math.max(1, total)); px(g, x, y, w, 8, r.color); x += w; }
    px(g, 14, y + 8, 228, 1, '1');
  }

  function drawTomorrow(L, ms) {
    const f = replay.finale || {};
    finaleFrame('TOMORROW', 3);
    const title = f.tomorrow?.title || 'Rest';
    drawText(g, 'Your first task:', 22, 42, '3');
    frame(g, 16, 54, 224, 46, { fill: '1', edge: 'a', inner: null });
    wrapText(title, 204).slice(0, 2).forEach((l, k) => drawText(g, l, 26, 62 + k * 12, 'd'));
    const why = (f.tomorrow?.why || []).join(', ');
    if (why) drawText(g, fitText(why, 204), 26, 86, '3');
    // The hero, tucked up in bed under the moon.
    g.drawImage(sprite('icon:moon', ICONS.moon), 196, 106, 24, 24);
    for (let i = 0; i < 14; i++) { const h = hash(i, 3); if (((ms / 400 + i) | 0) % 5) px(g, 16 + (h % 220), 108 + ((h >>> 8) % 40), 1, 1, i % 4 ? '3' : '4'); }
    const bx = 92; const by = 132;
    const scene = sprite('bedscene', [
      '........................',
      '.0000...................',
      '.0880...................',
      '.08800000000000000000...',
      '.0884444000eeeeeeeeee0..',
      '.08844440HHHfeefeefeeee0',
      '.0884444HSSSeeeeeeeeeee0',
      '.0884444HSKSefeefeefeee0',
      '.08800000SSSeeeeeeeeeee0',
      '.088888880000000000000e0',
      '.08899999999999999999900',
      '.0880000000000000000000.',
      '.00....................0',
    ], personColors(heroLook));
    g.drawImage(scene, bx, by, scene.width * 3, scene.height * 3);
    const z = ((ms / 500) | 0) % 3;
    for (let k = 0; k <= z; k++) drawText(g, 'z', bx + 40 + k * 8, by - 2 - k * 8, '3', { scale: k === 2 ? 2 : 1 });
    centerText(g, L > 1 ? 'Sleep well. See you tomorrow.' : '', SCREEN_W / 2, 192, '4');
  }

  function drawFinale(at, ms) {
    const L = at.local;
    if (at.seg.screen === 'totals') drawTotals(L);
    else if (at.seg.screen === 'energy') drawEnergy(L);
    else if (at.seg.screen === 'time') drawTime(L);
    else drawTomorrow(L, ms);
    if (L < 0.25) { g.fillStyle = `rgba(28,26,46,${1 - L / 0.25})`; g.fillRect(0, 0, SCREEN_W, SCREEN_H); }
  }

  return {
    draw(t, ms = 0) {
      const at = segmentAt(timeline, t);
      const pl = plan[at.i];
      if (at.seg.type === 'finale') { drawFinale(at, ms); return at; }
      drawMap(at, pl, ms);
      drawHud(at);
      drawBanners(at);
      drawTextBox(at, ms);
      if (at.seg.type === 'intro') drawIntro(at);
      return at;
    },
    /** Map a point on the canvas (logical pixels) to the world, for taps. */
    toWorld(x, y) { return { x: x + camera.x, y: y + camera.y }; },
    highlight(rect, ms) { highlight = rect ? { rect, at: ms } : null; },
  };
}

function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

