// flow/src/game/paint.js — the 2D painters: floor tiles, walls, roofs,
// furniture blocks, the world map. Everything draws into a Canvas 2D context
// passed in, at 16 px a tile, with hard pixel edges. The 3D rooms use the same
// painters for their textures.

import { shade } from './sprites.js';

export const T = 16;
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export function painter(g) {
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); };

  function floorTile(kind, px, py, tx, ty) {
    const h = hash(tx, ty);
    if (kind === 'tile' || kind === 'bath') {
      const [a, gr] = kind === 'tile' ? ['#f6eedc', '#d8ccb4'] : ['#dcecf6', '#f8fcff'];
      R(px, py, 16, 16, gr);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { R(px + i * 8, py + j * 8, 7, 7, a); R(px + i * 8, py + j * 8, 7, 1, shade(a, 0.4)); R(px + i * 8 + 6, py + j * 8 + 1, 1, 6, shade(a, -0.06)); }
    } else if (kind === 'carpet') {
      R(px, py, 16, 16, '#ece2cc');
      for (let k = 0; k < 10; k++) R(px + ((h >> k) & 15), py + ((h >> (k + 5)) & 15), 1, 1, k % 2 ? '#e0d4ba' : '#f4ecda');
    } else if (kind === 'herring') {
      R(px, py, 16, 16, '#9a9aa4');
      for (let j = 0; j < 16; j += 4) for (let i = -4; i < 16; i += 8) { const o = (j / 4) % 2 ? 4 : 0; for (let k = 0; k < 4; k++) { R(px + i + o + k, py + j + k, 1, 1, '#b4b4bc'); R(px + i + o + 7 - k, py + j + k, 1, 1, '#84848e'); } }
    } else if (kind === 'concrete') {
      R(px, py, 16, 16, '#c4c6c8');
      for (let k = 0; k < 6; k++) R(px + ((h >> (k * 3)) & 15), py + ((h >> (k * 3 + 1)) & 15), 1, 1, k % 2 ? '#b4b6ba' : '#d0d2d4');
      if (tx % 4 === 0) R(px, py, 1, 16, '#b0b2b6'); if (ty % 4 === 0) R(px, py, 16, 1, '#b0b2b6');
    } else if (kind === 'grass') {
      R(px, py, 16, 16, '#7cc466');
      for (let k = 0; k < 3; k++) { const x = px + ((h >> (k * 5)) & 11); const y = py + ((h >> (k * 5 + 2)) & 11) + 2; R(x, y, 1, 2, '#5aa84c'); R(x + 2, y - 1, 1, 3, '#5aa84c'); R(x + 4, y, 1, 2, '#5aa84c'); }
      if ((h & 31) === 3) { R(px + 6, py + 6, 2, 2, '#ffffff'); R(px + 8, py + 8, 2, 2, '#ffffff'); R(px + 6, py + 8, 2, 2, '#f8d848'); }
    } else if (kind === 'brick') {
      R(px, py, 16, 16, '#e0c8b0');
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const x = px + i * 8; const y = py + j * 8;
        if ((i + j + tx + ty) % 2) { R(x, y, 7, 3, '#c05848'); R(x, y + 4, 7, 3, '#a84a3c'); } else { R(x, y, 3, 7, '#a84a3c'); R(x + 4, y, 3, 7, '#c05848'); }
      }
    } else if (kind === 'path') {
      R(px, py, 16, 16, '#7cc466'); R(px + 1, py + 1, 14, 6, '#d8d0c0'); R(px + 1, py + 9, 14, 6, '#d0c8b8'); R(px + 1, py + 1, 14, 1, '#ece6da');
    } else if (kind === 'drive') {
      R(px, py, 16, 16, '#cacac2'); if (tx % 3 === 0) R(px, py, 1, 16, '#aeaea6'); if (ty % 3 === 0) R(px, py, 16, 1, '#aeaea6');
    } else if (kind === 'walk') {
      R(px, py, 16, 16, '#dedad2'); R(px, py, 1, 16, '#c8c4bc'); R(px, py, 16, 1, '#ece8e0');
    } else if (kind === 'street' || kind === 'lot') {
      R(px, py, 16, 16, kind === 'lot' ? '#56565e' : '#5a5a66');
      for (let k = 0; k < 5; k++) R(px + ((h >> (k * 3)) & 15), py + ((h >> (k * 3 + 1)) & 15), 1, 1, '#6c6c78');
    } else {
      const base = kind === 'dark' ? '#b08466' : kind === 'light' ? '#ecd0a2' : '#dcaa74';
      for (let j = 0; j < 16; j += 4) {
        const c = shade(base, [0, 0.05, -0.05, 0.1][(h >> (j + 2)) & 3]);
        R(px, py + j, 16, 4, c); R(px, py + j, 16, 1, shade(c, 0.18)); R(px, py + j + 3, 16, 1, shade(c, -0.12));
        R(px + ((h >> j) & 15), py + j, 1, 4, shade(c, -0.2));
      }
    }
  }

  function wall(cell, px, py) {
    if (cell.face) {
      R(px, py, 16, 16, '#f2e8d4');
      R(px, py, 16, 2, '#b4a894'); R(px, py + 2, 16, 1, '#fcf6ea');
      for (let k = 2; k < 16; k += 4) R(px + k, py + 3, 1, 5, '#e8dcc4');
      R(px, py + 8, 16, 1, '#ffffff'); R(px, py + 9, 16, 1, '#c8b89c');
      R(px, py + 10, 16, 4, '#dccab0'); R(px, py + 14, 16, 2, '#fbf8f0'); R(px, py + 15, 16, 1, '#b8ac98');
    } else {
      R(px, py, 16, 16, '#c8beb2'); R(px, py, 16, 1, '#e4dcd2'); R(px, py + 1, 1, 15, '#d6cec4'); R(px, py + 15, 16, 1, '#8e8478');
    }
  }

  function roof(b, front, px, py, x) {
    if (front) {
      R(px, py, 16, 16, b.wall); R(px, py + 14, 16, 2, shade(b.wall, -0.25));
      if (x % 3 === 1) { R(px + 3, py + 4, 10, 8, '#ffffff'); R(px + 4, py + 5, 8, 6, '#9cc8e8'); R(px + 8, py + 5, 1, 6, '#ffffff'); }
      R(px, py, 16, 2, shade(b.roof, -0.3));
    } else {
      R(px, py, 16, 16, b.roof);
      for (let j = 0; j < 16; j += 4) { R(px, py + j, 16, 1, shade(b.roof, -0.2)); R(px, py + j + 1, 16, 1, shade(b.roof, 0.12)); }
    }
  }

  /** A box seen from above and in front: a lit top face over a shaded front face. */
  function block(x, y, w, d, h, top, front) {
    const o = shade(top, -0.55);
    g.fillStyle = '#00000026'; g.fillRect(x + 1, y + d + h, w, 2);
    R(x, y, w, d + h, o);
    R(x + 1, y + 1, w - 2, Math.max(1, d - 1), top);
    R(x + 1, y + 1, w - 2, 1, shade(top, 0.35));
    R(x + 1, y + d, w - 2, 1, shade(top, -0.35));
    if (h > 2) { R(x + 1, y + d + 1, w - 2, h - 2, front); R(x + 1, y + d + h - 2, w - 2, 1, shade(front, -0.25)); }
  }

  /** Furniture in the 2D look: a block in the model's own colours, as tall as the model. */
  function furniture(f, colors, px, py) {
    const w = f.w * T; const d = f.h * T;
    if (f.under) { R(px + 1, py + 1, w - 2, d - 2, colors.top); R(px + 1, py + 1, w - 2, 1, shade(colors.top, 0.3)); return; }
    const h = Math.max(3, Math.min(26, Math.round(colors.height * 12)));
    block(px + 1, py - h + 4, w - 2, d - 4, h, colors.top, colors.front);
  }

  return { R, floorTile, wall, roof, block, furniture };
}

/** The world map for the travel picker: land, roads between the places, pins. */
export function drawWorldMap(g, places, { sel = null, here = null } = {}) {
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(0, 0, 240, 120, '#9ccc84');
  for (let k = 0; k < 120; k++) R((k * 37) % 240, (k * 23) % 120, 1, 1, '#88b872');
  for (let y = 0; y < 120; y++) { const cx = 16 + Math.round(4 * Math.sin(y / 9)); R(0, y, cx, 1, '#4a78c8'); R(cx, y, 2, 1, '#e8d8a8'); }
  g.strokeStyle = '#d8d0b8'; g.lineWidth = 3;
  for (let i = 1; i < places.length; i++) {
    const a = places[i - 1].position; const b = places[i].position;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  const from = places.find((p) => p.id === here); const to = places.find((p) => p.id === sel);
  if (from && to && from !== to) {
    g.strokeStyle = '#e05a5a'; g.lineWidth = 2; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(from.position[0], from.position[1]); g.lineTo(to.position[0], to.position[1]); g.stroke(); g.setLineDash([]);
  }
  for (const p of places) {
    const [x, y] = p.position; const on = p.id === sel;
    g.fillStyle = '#282040'; g.beginPath(); g.arc(x, y, on ? 6 : 4.5, 0, 7); g.fill();
    g.fillStyle = p.id === here ? '#58c878' : '#f0c050'; g.beginPath(); g.arc(x, y, on ? 5 : 3.5, 0, 7); g.fill();
    if (on) { g.font = '8px monospace'; g.fillStyle = '#282040'; g.fillText(p.name, Math.min(x + 8, 190), Math.max(10, y - 6)); }
  }
}
