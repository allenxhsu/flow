// flow/src/game/engine.js — the game runtime: a 256×192 upper screen at 4:3,
// grid walking in a 3/4 view, the DS-style 3D rooms when three.js is loaded
// (a flat 2D look otherwise), chibi sprites, the framed text box with menus,
// the car's travel picker, a battle scene and scripted walks. Everything it
// draws comes from a world object (./world.js); it writes nothing itself —
// the host (the Play or Replay view) is told about desks and walks through
// callbacks and owns every record.
//
//   const game = createGame(root, { world, mode: 'live' | 'replay', THREE, hero, name,
//     status: () => ({ stamina, mana, points, clock, dark, working }),
//     onDesk, onMoment, menuOpen, onMenuKey, replay: () => clock });
//   game.placeAt(spot); game.say(text); game.destroy();
//
// The root must contain the upper screen (#play-screen with #play-canvas,
// #play-canvas3d, .play-hud, #play-box, #play-sign, #play-fade, #play-pop) and
// may contain the lower screen's [data-dir] and [data-btn] buttons.

import { levelGrid, spotFor } from './world.js';
import { MODELS, modelColors } from './models.js';
import { makeSprites } from './sprites.js';
import { painter, drawWorldMap, T } from './paint.js';
import { buildLevel, aimCamera } from './scene3d.js';

export const VW = 256;
export const VH = 192;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const A_KEYS = ['Space', 'Enter', 'KeyZ'];
const B_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyX', 'Escape', 'Backspace'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Breadth-first steps from `from` to `to` over walkable cells; [] when there is no way. */
export function findPath(ok, from, to, max = 20000) {
  const key = (x, y) => `${x},${y}`;
  const prev = new Map([[key(...from), null]]);
  const q = [from];
  let n = 0;
  while (q.length && n++ < max) {
    const [x, y] = q.shift();
    if (x === to[0] && y === to[1]) break;
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const nx = x + dx; const ny = y + dy;
      if (!prev.has(key(nx, ny)) && (ok(nx, ny) || (nx === to[0] && ny === to[1]))) { prev.set(key(nx, ny), [x, y, d]); q.push([nx, ny]); }
    }
  }
  if (!prev.has(key(...to))) return [];
  const moves = []; let cur = to;
  while (prev.get(key(...cur))) { const [px, py, d] = prev.get(key(...cur)); moves.unshift(d); cur = [px, py]; }
  return moves;
}

export function createGame(root, opts) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const world = opts.world;
  let THREE = opts.THREE || null;
  const live = opts.mode !== 'replay';
  const carColor = world.car?.color || '#d05050';
  const $ = (sel) => root.querySelector(sel);
  const cv = $('#play-canvas');
  const cv3 = $('#play-canvas3d');
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const P2 = painter(g);
  const box = $('#play-box');
  const pop = $('#play-pop');
  const sign = $('#play-sign');
  const fade = $('#play-fade');

  const models = { ...MODELS, ...Object.fromEntries(Object.entries(world.models || {}).map(([k, v]) => [k, v.boxes])) };
  const colorsOf = new Map(Object.entries(models).map(([k, v]) => [k, modelColors(v, carColor)]));
  const heroSpr = makeSprites(doc, opts.hero || {});
  const npcSpr = new Map(world.npcs.map((n) => [n.id, makeSprites(doc, n.sprite)]));

  // ─── levels ────────────────────────────────────────────────────────────
  const levels = new Map(world.levels.map((l) => [l.id, { def: l, grid: levelGrid(l), static2d: null, s3d: null }]));
  const npcs = world.npcs.map((n) => ({ ...n, x: n.position[0], y: n.position[1], face: n.dir, walking: false, walk: false }));
  let lv = levels.get(world.start.level);
  const P = { x: world.start.position[0], y: world.start.position[1], dir: world.start.dir, moving: false, fx: 0, fy: 0, t: 0, step: 0 };
  const held = new Set();
  let busy = false;
  let lastRoom = '';
  let battle = null;
  let destroyed = false;
  const CUT = { active: false, queue: [], onStep: null, onDone: null };

  const furnitureAt = (x, y, L = lv) => L.def.furniture.find((f) => !f.under && x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h);
  const npcAt = (x, y, L = lv) => npcs.find((n) => n.level === L.def.id && !n.walk && n.x === x && n.y === y);
  const exitAt = (x, y, L = lv) => L.def.exits.find((e) => x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h);
  const floorOk = (x, y, L = lv) => { const c = L.grid.cell[y]?.[x]; return !!(c && c.floor); };
  const walkable = (x, y, L = lv) => floorOk(x, y, L) && !(furnitureAt(x, y, L)?.walk === false) && !npcAt(x, y, L);
  const deskAt = (x, y, L = lv) => {
    const f = furnitureAt(x, y, L);
    return world.desks.some((d) => d.level === L.def.id && ((d.position[0] === x && d.position[1] === y) || (f && d.position[0] >= f.x && d.position[0] < f.x + f.w && d.position[1] >= f.y && d.position[1] < f.y + f.h)));
  };

  function showSign(text) {
    if (!sign || !text) return;
    sign.textContent = text; sign.classList.remove('is-hidden');
    clearTimeout(showSign.t); showSign.t = setTimeout(() => sign.classList.add('is-hidden'), 1800);
  }

  function warp(levelId, [x, y], dir, { quiet = false } = {}) {
    const go = () => {
      lv = levels.get(levelId) || lv;
      P.x = x; P.y = y; P.dir = dir || P.dir; P.moving = false; lastRoom = '';
      if (!quiet) showSign(lv.def.name);
    };
    if (quiet || !fade) { go(); return; }
    busy = true; fade.classList.add('is-on');
    setTimeout(() => { go(); fade.classList.remove('is-on'); setTimeout(() => { busy = false; }, 200); }, 260);
  }

  // ─── the text box: lines, then an optional menu ───────────────────────
  let dlg = null; // { lines: [], choices, sel, resolve }
  function paintBox() {
    if (!dlg) { box.hidden = true; box.innerHTML = ''; return; }
    const line = dlg.lines[0];
    let who = line && typeof line === 'object' ? line.who : '';
    let text = line && typeof line === 'object' ? line.text : line;
    const named = /^([A-Z][A-Z .'-]{0,23}): (.+)$/s.exec(text || '');
    if (named) { who = named[1] === 'YOU' ? (opts.name || 'You').toUpperCase() : named[1]; text = named[2]; }
    const choices = dlg.lines.length <= 1 && dlg.choices ? `<div class="play-choices">${dlg.choices.map((c, k) => `<button type="button" class="play-choice ${k === dlg.sel ? 'is-on' : ''}" data-k="${k}">${esc(c)}</button>`).join('')}</div>` : '';
    box.innerHTML = `${who ? `<span class="play-who">${esc(who)}</span>` : ''}<span class="play-text">${esc(text || '')}</span>${choices}${choices ? '' : '<span class="play-more">▼</span>'}`;
    box.hidden = false;
  }
  function open(lines, choices = null) {
    return new Promise((resolve) => {
      dlg = { lines: lines.length ? [...lines] : [''], choices, sel: 0, resolve };
      paintBox();
    });
  }
  const say = (text, who = '') => open([{ who, text }]);
  const talk = (lines, who = '') => open(lines.map((t) => ({ who, text: t })));
  const choose = (text, labels, who = '') => open([{ who, text }], labels);
  function advance(pick = null) {
    if (!dlg) return;
    if (dlg.lines.length > 1) { dlg.lines.shift(); paintBox(); return; }
    const d = dlg; dlg = null; paintBox();
    d.resolve(d.choices ? (pick ?? d.sel) : null);
  }
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]');
    ev.stopPropagation();
    if (b && dlg?.choices) { dlg.sel = Number(b.dataset.k); advance(dlg.sel); return; }
    if (battle) battleA(); else advance();
  });

  // ─── people ───────────────────────────────────────────────────────────
  async function meet(n) {
    n.face = BACK[P.dir];
    if (!n.choices.length) { await talk(n.lines.length ? n.lines : ['…'], n.name); return; }
    if (n.lines.length > 1) await talk(n.lines.slice(0, -1), n.name);
    const labels = n.choices.map((c) => c.label);
    const k = await choose(n.lines[n.lines.length - 1] || 'Hey.', labels, n.name);
    const c = n.choices[k];
    if (!c) return;
    if (c.kind === 'talk' || c.kind === 'app' || c.kind === 'leave') { if (c.lines.length) await talk(c.lines, n.name); }
    else if (c.kind === 'battle') startBattle(n, c);
    else if (c.kind === 'walk') lap(n, c);
  }

  function lap(n, c) {
    const crew = [n, ...(c.with || []).map((id) => npcs.find((x) => x.id === id)).filter((x) => x && x.level === n.level)];
    const corners = c.lap?.length ? c.lap : [[n.x - 3, n.y - 3], [n.x + 3, n.y - 3], [n.x + 3, n.y + 3], [n.x - 3, n.y + 3]];
    const start = [P.x, P.y];
    for (const m of crew) { m.walk = true; m.walking = true; }
    let at = start; let moves = [];
    for (const k of [...corners, start]) { moves = moves.concat(findPath((x, y) => walkable(x, y), at, k)); at = k; }
    const lines = [...c.lines];
    const trail = [];
    const every = Math.max(5, Math.floor(moves.length / (lines.length + 1)));
    let steps = 0;
    const began = Date.now();
    CUT.queue = moves; CUT.active = true;
    CUT.onStep = () => {
      trail.unshift([P.x - P.fx, P.y - P.fy, P.dir]);
      crew.forEach((m, k) => { const t = trail[k * 2 + 1] || trail[trail.length - 1]; if (t) { m.x = t[0]; m.y = t[1]; m.face = t[2]; } });
      steps++;
      if (steps % every === 0 && lines.length) { dlg = { lines: [{ who: crew[steps / every % crew.length | 0]?.name || n.name, text: lines.shift() }], choices: null, sel: 0, resolve: () => {} }; paintBox(); }
      else if (steps % every === Math.floor(every / 2) && dlg && !dlg.choices) { dlg = null; paintBox(); }
    };
    CUT.onDone = async () => {
      dlg = null; paintBox();
      for (const m of crew) { m.walk = false; m.walking = false; m.face = 'up'; }
      const names = crew.map((m) => m.name);
      const result = live && opts.onMoment ? await opts.onMoment({ kind: 'walk', who: names.join(', '), seconds: (Date.now() - began) / 1000 }) : null;
      await say(result || `A lap with ${names.join(' and ')}.`);
    };
  }

  // ─── the battle: your habits against the day's distractions ──────────
  const MOVES = ['FOCUS BLOCK', 'BATCH IT', 'DEEP WORK'];
  function startBattle(n, c) {
    battle = { n, hits: c.lines.length ? c.lines : ['A DISTRACTION'], hp: 6, you: 6, turn: 0, t0: performance.now(), queue: [], over: false };
    busy = true;
    setTimeout(() => { busy = false; bsay(`${n.name.toUpperCase()} wants a challenge!`); battle.queue.push(null); }, 650);
  }
  function bsay(text) { dlg = { lines: [{ who: '', text }], choices: null, sel: 0, resolve: () => {} }; paintBox(); }
  function battleA() {
    if (!battle || busy) return;
    const b = battle;
    if (b.queue.length) {
      const next = b.queue.shift();
      if (next === null) { bsay(`What will you do? A: ${MOVES[b.turn % MOVES.length]} · B: RUN`); b.atPrompt = true; return; }
      bsay(next); return;
    }
    if (b.over) { battle = null; dlg = null; paintBox(); return; }
    if (b.atPrompt) {
      b.atPrompt = false;
      const move = MOVES[b.turn % MOVES.length]; const hit = b.hits[b.turn % b.hits.length]; b.turn++;
      b.hp = Math.max(0, b.hp - 2);
      b.queue.push("It's super effective!");
      if (b.hp <= 0) { b.queue.push(`${b.n.name.toUpperCase()} is out of distractions!`, 'You won. Your focus holds.'); b.over = true; }
      else { b.you = Math.max(1, b.you - 1); b.queue.push(`${b.n.name.toUpperCase()}: ${hit}`, null); }
      bsay(`You used ${move}!`);
    }
  }
  function battleB() { if (battle?.atPrompt) { battle.queue = []; battle.over = true; battle.atPrompt = false; bsay('Got away safely!'); } }

  // ─── the car: the travel picker ───────────────────────────────────────
  function travel() {
    if (!pop) return;
    const near = world.places.filter((p) => p.level === lv.def.id).sort((a, b) => Math.hypot(a.at[0] - P.x, a.at[1] - P.y) - Math.hypot(b.at[0] - P.x, b.at[1] - P.y));
    const here = near[0]?.id || null;
    let sel = (world.places.find((p) => p.id !== here) || world.places[0]).id;
    busy = true;
    const paint = () => {
      const d = world.places.find((q) => q.id === sel);
      pop.innerHTML = `<div class="play-travel"><div class="play-panel"><h4>WHERE TO?</h4><canvas width="240" height="120" data-map></canvas><div class="play-note">${esc(d.id === here ? 'You are here.' : d.note || d.name)}</div></div>
        <div class="play-panel"><h4>${esc(world.car.name.toUpperCase())}</h4><div class="play-dests">${world.places.map((q) => `<button type="button" class="play-dest ${q.id === sel ? 'is-on' : ''}" data-dest="${esc(q.id)}">${q.id === here ? '● ' : ''}${esc(q.name)}</button>`).join('')}</div>
        <button type="button" class="play-go" data-go ${d.id === here ? 'disabled' : ''}>Drive ▶</button><div class="play-note">↑↓ choose · A drive · B stay</div></div></div>`;
      pop.hidden = false;
      drawWorldMap(pop.querySelector('[data-map]').getContext('2d'), world.places, { sel, here });
    };
    const close = () => { pop.hidden = true; pop.innerHTML = ''; travel.keys = null; busy = false; };
    const go = () => { const d = world.places.find((q) => q.id === sel); if (!d || d.id === here) return; close(); warp(d.level, d.at, d.dir); setTimeout(() => say(`You drive to ${d.name}.`), 420); };
    travel.keys = (k) => {
      const i = world.places.findIndex((q) => q.id === sel);
      if (k === 'down') sel = world.places[(i + 1) % world.places.length].id;
      else if (k === 'up') sel = world.places[(i + world.places.length - 1) % world.places.length].id;
      else if (k === 'a') return go();
      else if (k === 'b') return close();
      else return;
      paint();
    };
    pop.onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-dest]');
      if (b) { sel = b.dataset.dest; paint(); return; }
      if (e.target.closest('[data-go]')) go();
    };
    paint();
  }

  // ─── input ────────────────────────────────────────────────────────────
  function interact() {
    if (!live) return;
    if (battle) return battleA();
    if (dlg) return advance();
    if (busy || CUT.active) return;
    const [dx, dy] = DIRS[P.dir];
    const x = P.x + dx; const y = P.y + dy;
    const n = npcAt(x, y);
    if (n) return void meet(n);
    if (deskAt(x, y) || deskAt(P.x, P.y)) return void opts.onDesk?.();
    const f = furnitureAt(x, y);
    if (f?.car) return travel();
    if (f?.text) return void say(f.text);
    const c = lv.grid.cell[y]?.[x];
    if (c?.wall || c?.roof) return void say(c.roof ? 'A wall.' : 'A wall.');
  }

  function tryMove(dir) {
    P.dir = dir;
    const [dx, dy] = DIRS[dir];
    if (!walkable(P.x + dx, P.y + dy)) return;
    P.moving = true; P.fx = dx; P.fy = dy; P.t = 0; P.step++;
  }

  function key(k, down) {
    if (!live) return;
    if (opts.menuOpen?.()) { if (down) opts.onMenuKey?.(k); return; }
    if (travel.keys) { if (down) travel.keys(k); return; }
    if (k === 'a') { if (down) interact(); return; }
    if (k === 'b') {
      if (!down) { held.delete('b'); return; }
      if (battle) return battleB();
      if (dlg?.choices) { dlg.sel = dlg.choices.length - 1; advance(); return; }
      if (dlg) return advance();
      held.add('b'); return;
    }
    if (dlg?.choices && down) { if (k === 'up' || k === 'down') { dlg.sel = (dlg.sel + (k === 'down' ? 1 : dlg.choices.length - 1)) % dlg.choices.length; paintBox(); } return; }
    if (battle) return;
    if (down) { held.delete(k); held.add(k); if (dlg && !CUT.active && dlg.lines.length === 1 && !dlg.choices) advance(); } else held.delete(k);
  }
  const typing = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  const onKeyDown = (e) => {
    if (!root.isConnected) return destroy();
    if (typing(e.target)) return;
    const k = A_KEYS.includes(e.code) ? 'a' : B_KEYS.includes(e.code) ? 'b' : KEY[e.code];
    if (!k) return;
    if (!live && k !== 'a') return;
    e.preventDefault();
    if (e.repeat && (k === 'a' || k === 'b')) return;
    key(k, true);
  };
  const onKeyUp = (e) => { const k = A_KEYS.includes(e.code) ? 'a' : B_KEYS.includes(e.code) ? 'b' : KEY[e.code]; if (k) key(k, false); };
  const onBlur = () => held.clear();
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);
  for (const b of root.querySelectorAll('[data-dir]')) {
    const k = b.dataset.dir;
    const on = (e) => { e.preventDefault(); key(k, true); b.classList.add('is-on'); };
    const off = () => { key(k, false); b.classList.remove('is-on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  }
  for (const b of root.querySelectorAll('[data-btn]')) {
    const k = b.dataset.btn;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); key(k, true); });
    b.addEventListener('pointerup', () => key(k, false));
  }

  // ─── the loop ─────────────────────────────────────────────────────────
  let last = performance.now();
  let stepCount = 0;
  function update(now) {
    const dt = Math.min(50, now - last); last = now;
    if (!live || busy || battle || (dlg && !CUT.active)) return;
    if (P.moving) {
      P.t += dt * (held.has('b') ? 2 / 90 : 1 / 130);
      if (P.t >= 1) {
        P.x += P.fx; P.y += P.fy; P.moving = false; P.t = 0; stepCount++;
        const e = !CUT.active && exitAt(P.x, P.y);
        if (e) return warp(e.to, e.at, e.dir);
        const r = lv.grid.cell[P.y]?.[P.x]?.room;
        if (r && r !== lastRoom) { lastRoom = r; showSign(r); }
        if (CUT.active && CUT.onStep) CUT.onStep();
      }
    }
    if (!P.moving) {
      const order = ['up', 'down', 'left', 'right'];
      const d = CUT.active ? CUT.queue.shift() : [...held].reverse().find((k) => order.includes(k));
      if (d) tryMove(d);
      else if (CUT.active) { const f = CUT.onDone; CUT.active = false; CUT.onDone = null; CUT.onStep = null; f?.(); }
    }
  }

  // Replay: the hero is wherever the clock says the day was.
  let replayBeat = null;
  let walkPath = null;
  function followReplay(c) {
    if (!c) return;
    const seg = c.segment;
    const b = c.beat;
    if (b && (b.kind === 'walk')) {
      const from = spotFor(world, b.from, b.fromZone); const to = spotFor(world, b.to, b.toZone);
      if (walkPath?.id !== `${seg.index}`) {
        const L = levels.get(to.level);
        const origin = from.level === to.level ? from.position : (L.def.exits[0]?.at || to.position);
        const moves = findPath((x, y) => walkable(x, y, L), origin, to.position);
        walkPath = { id: `${seg.index}`, level: to.level, origin, moves };
      }
      if (lv.def.id !== walkPath.level) warp(walkPath.level, walkPath.origin, 'down', { quiet: true });
      const n = walkPath.moves.length;
      const f = Math.min(n, c.p * n);
      let x = walkPath.origin[0]; let y = walkPath.origin[1];
      const k = Math.floor(f);
      for (let i = 0; i < k; i++) { const [dx, dy] = DIRS[walkPath.moves[i]]; x += dx; y += dy; }
      const d = walkPath.moves[Math.min(k, n - 1)];
      P.x = x; P.y = y; P.dir = d || P.dir;
      if (k < n && d) { P.moving = true; P.fx = DIRS[d][0]; P.fy = DIRS[d][1]; P.t = f - k; P.step = k; } else P.moving = false;
    } else if (b) {
      const s = spotFor(world, b.place, b.zone);
      if (lv.def.id !== s.level || P.x !== s.position[0] || P.y !== s.position[1]) warp(s.level, s.position, 'up', { quiet: true });
      P.moving = false; P.dir = 'up';
    }
    if (b !== replayBeat) {
      replayBeat = b;
      if (b && b.kind !== 'walk' && b.kind !== 'idle') { dlg = { lines: [{ who: `${c.clock} · ${b.placeName || ''}`, text: b.text }], choices: null, sel: 0, resolve: () => {} }; paintBox(); }
      else if (dlg) { dlg = null; paintBox(); }
    }
  }

  // ─── drawing ──────────────────────────────────────────────────────────
  function staticLayer(L) {
    if (L.static2d) return L.static2d;
    const { w, h, cell } = L.grid;
    const c = doc.createElement('canvas'); c.width = w * T; c.height = h * T;
    const x2 = c.getContext('2d'); x2.imageSmoothingEnabled = false;
    const p = painter(x2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = cell[y][x];
      if (k.floor) p.floorTile(k.floor, x * T, y * T, x, y);
      else if (k.wall) p.wall(k, x * T, y * T);
      else if (k.roof) { const b = L.def.buildings[k.building]; p.roof(b, !cell[y + 1]?.[x]?.roof, x * T, y * T, x); }
      else { x2.fillStyle = '#241e2e'; x2.fillRect(x * T, y * T, T, T); }
    }
    for (const f of L.def.furniture) if (f.under) p.furniture(f, colorsOf.get(f.model), f.x * T, f.y * T);
    L.static2d = c;
    return c;
  }

  const heroFrame = () => (P.moving ? (P.step % 2 ? 1 : 2) * (P.t < 0.5 ? 1 : 0) : 0);
  function spriteFor(spr, dir, frame) { return spr[`${dir}${frame}`] || spr.down0; }
  function workingBubble(ctx, x, y) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y, 10, 7); ctx.fillStyle = '#383048'; ctx.fillRect(x + 3, y, 10, 1); ctx.fillRect(x + 3, y + 6, 10, 1); ctx.fillRect(x + 3, y, 1, 7); ctx.fillRect(x + 12, y, 1, 7);
    const k = Math.floor(performance.now() / 300) % 4;
    for (let i = 0; i < 3; i++) if (i < k) ctx.fillRect(x + 5 + i * 3, y + 3, 1, 1);
  }

  function render2D(t, st) {
    const L = lv; const { w, h } = L.grid;
    const hx = (P.x + (P.moving ? P.fx * P.t : 0)) * T + 8; const hy = (P.y + (P.moving ? P.fy * P.t : 0)) * T + 8;
    const camX = Math.round(w * T < VW ? -(VW - w * T) / 2 : Math.max(0, Math.min(hx - VW / 2, w * T - VW)));
    const camY = Math.round(h * T < VH ? -(VH - h * T) / 2 : Math.max(-14, Math.min(hy - VH / 2 - 6, h * T - VH)));
    g.fillStyle = L.def.outdoor ? '#7cc466' : '#241e2e'; g.fillRect(0, 0, VW, VH);
    g.save(); g.translate(-camX, -camY);
    g.drawImage(staticLayer(L), 0, 0);
    const things = [];
    for (const f of L.def.furniture) if (!f.under) things.push({ y: f.y + f.h - 1, draw: () => P2.furniture(f, colorsOf.get(f.model), f.x * T, f.y * T) });
    for (const n of npcs) if (n.level === L.def.id) things.push({ y: n.y, draw: () => { g.fillStyle = '#00000030'; g.beginPath(); g.ellipse(n.x * T + 8, n.y * T + 15, 6, 2.5, 0, 0, 7); g.fill(); g.drawImage(spriteFor(npcSpr.get(n.id), n.face, n.walking ? Math.floor(t / 180) % 2 : 0), n.x * T, n.y * T - 5); } });
    const py = P.y + (P.moving ? P.fy * P.t : 0);
    things.push({ y: py + 0.01, draw: () => {
      g.fillStyle = '#00000038'; g.beginPath(); g.ellipse(hx, hy + 7, 6, 2.5, 0, 0, 7); g.fill();
      g.drawImage(spriteFor(heroSpr, P.dir, heroFrame()), Math.round(hx - 8), Math.round(hy - 13 + (P.moving && P.t < 0.5 ? -1 : 0)));
      if (st?.working && !P.moving) workingBubble(g, Math.round(hx - 8), Math.round(hy - 22));
    } });
    things.sort((a, b) => a.y - b.y).forEach((x) => x.draw());
    g.restore();
    if (st?.dark > 0) { g.fillStyle = `rgba(16,20,56,${Math.min(0.6, st.dark).toFixed(2)})`; g.fillRect(0, 0, VW, VH); }
  }

  let R3 = null; let CAM = null;
  function render3D(t, st) {
    if (!R3) {
      R3 = new THREE.WebGLRenderer({ canvas: cv3, antialias: false });
      R3.setPixelRatio(1); R3.setSize(320, 240, false);
      CAM = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 400);
    }
    const L = lv;
    L.s3d ||= buildLevel(THREE, doc, { world, level: L.def, grid: L.grid, carColor });
    const S = L.s3d;
    const paintSprite = (sp, img, bubble) => {
      const c = sp.canvas.getContext('2d'); c.clearRect(0, 0, sp.canvas.width, sp.canvas.height);
      c.drawImage(img, 0, sp.canvas.height - img.height);
      if (bubble) workingBubble(c, 0, 0);
      sp.tex.needsUpdate = true;
    };
    for (const n of npcs) {
      const sp = S.people.get(n.id);
      if (!sp) continue;
      sp.place(n.x, n.y);
      paintSprite(sp, spriteFor(npcSpr.get(n.id), n.face, n.walking ? Math.floor(t / 180) % 2 : 0));
    }
    const x = P.x + (P.moving ? P.fx * P.t : 0); const z = P.y + (P.moving ? P.fy * P.t : 0);
    S.hero.place(x, z);
    paintSprite(S.hero, spriteFor(heroSpr, P.dir, heroFrame()), st?.working && !P.moving);
    S.setNight(Math.min(0.6, st?.dark || 0));
    aimCamera(CAM, x, z, L.def.outdoor);
    R3.render(S.scene, CAM);
  }

  function renderBattle(t) {
    const b = battle;
    const since = t - b.t0;
    if (since < 650) { g.fillStyle = Math.floor(since / 90) % 2 ? '#101018' : '#f8f8f0'; g.fillRect(0, 0, VW, VH); return; }
    g.fillStyle = '#f8f8f0'; g.fillRect(0, 0, VW, VH);
    g.fillStyle = '#e0e4d0'; g.beginPath(); g.ellipse(200, 92, 44, 9, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(64, 136, 54, 11, 0, 0, 7); g.fill();
    const pips = (x, y, n) => { for (let i = 0; i < 6; i++) { g.fillStyle = '#383048'; g.beginPath(); g.arc(x + 4 + i * 10, y, 4, 0, 7); g.fill(); g.fillStyle = i < n ? '#58c060' : '#f8f8f0'; g.beginPath(); g.arc(x + 4 + i * 10, y, 3, 0, 7); g.fill(); } };
    g.fillStyle = '#383048'; g.font = '8px monospace'; g.fillText(b.n.name.toUpperCase(), 18, 44); pips(18, 54, b.hp);
    g.save(); g.translate(176, 30); g.scale(3, 3); g.drawImage(spriteFor(npcSpr.get(b.n.id), 'down', 0), 0, 0); g.restore();
    g.save(); g.translate(34, 76); g.scale(3, 3); g.drawImage(heroSpr.up0, 0, 0); g.restore();
    g.fillStyle = '#383048'; g.fillText((opts.name || 'YOU').toUpperCase(), 136, 108); pips(136, 118, b.you);
  }

  // The HUD: hearts = stamina, the magic bar = mana, the gem counter = points, the clock.
  const hud = { hearts: $('[data-hud="hearts"]'), mp: $('[data-hud="mp"]'), pts: $('[data-hud="pts"]'), clock: $('[data-hud="clock"]') };
  let hudAt = 0; let st = null;
  function paintHud(now) {
    if (now - hudAt < 250 && st) return;
    hudAt = now;
    st = opts.status?.() || null;
    if (!st) return;
    const halves = Math.max(0, Math.min(10, Math.round(st.stamina ?? 0)));
    if (hud.hearts) hud.hearts.textContent = Array.from({ length: 5 }, (_, k) => (halves >= 2 * k + 2 ? '♥' : halves === 2 * k + 1 ? '❥' : '♡')).join('');
    if (hud.mp) hud.mp.style.width = `${Math.max(0, Math.min(100, (st.mana ?? 0) * 10))}%`;
    if (hud.pts) hud.pts.textContent = Math.round(st.points ?? 0).toLocaleString('en-US');
    if (hud.clock) hud.clock.textContent = st.clock || '';
  }

  let raf = 0;
  function loop(now) {
    if (destroyed) return;
    if (!root.isConnected) { destroy(); return; }
    if (!live) followReplay(opts.replay?.());
    update(now);
    paintHud(now);
    const in3D = !!THREE && !battle;
    cv.hidden = in3D; if (cv3) cv3.hidden = !in3D;
    try {
      if (battle) renderBattle(now);
      else if (in3D) render3D(now, st);
      else render2D(now, st);
    } catch (err) {
      console.warn(err);
      if (in3D) THREE = null; // no WebGL here: the flat look instead
    }
    raf = win.requestAnimationFrame(loop);
  }
  raf = win.requestAnimationFrame(loop);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    win.cancelAnimationFrame(raf);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('keyup', onKeyUp);
    win.removeEventListener('blur', onBlur);
    try { R3?.dispose(); } catch { /* already gone */ }
  }

  return {
    world,
    say, talk, choose,
    /** Put the hero at a spot ({ level, position }) — a running timer's place. */
    placeAt(spot, dir = 'up') { if (spot) warp(spot.level, spot.position, dir, { quiet: false }); },
    get level() { return lv.def.id; },
    get hero() { return { x: P.x, y: P.y, dir: P.dir, level: lv.def.id }; },
    get busy() { return busy || !!dlg || !!battle || CUT.active; },
    /** Face the hero toward a tile (tests and the desk shortcut use it). */
    teleport(levelId, x, y, dir = 'up') { warp(levelId, [x, y], dir, { quiet: true }); },
    interact,
    destroy,
  };
}
