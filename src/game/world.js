// flow/src/game/world.js — the game's world as data. Pure: no DOM, no clock.
//
// A world pack (SPEC.md › Play) is a `flow.world` JSON file: levels (rooms,
// doors, outdoor ground, buildings, furniture by model id, exits), map places
// for the car's travel picker, people with their lines and choices, and the
// desk position(s) that open the TASKS menu. The public repository carries the
// generic world (./worlds/generic.js); a player's own world is a private pack,
// stored as the `world` record and never committed anywhere.
//
//   validateWorld(json)      → { ok: true, world } | { ok: false, reason }
//   worldRecord(world)       → the record to save: { id: 'world', type: 'world', world }
//   worldFor(records | db)   → the pack in effect, or the generic world
//   levelGrid(level)         → { w, h, cell[y][x] } walkable floor, walls, roofs
//
// A building blocks walking and shows a roof in the flat look; in 3D it is a
// box under a hip or flat roof, walls only with `noRoof` (the level's scene
// adds its own), or nothing at all with `solid` (the scene draws it).
// A line may name its speaker: "ANA: Morning!".
//
// Unknown keys are dropped, so a newer pack still loads; anything invalid
// refuses the whole pack with the reason, and nothing of it is applied.

import { index } from '../model.js';
import { MODELS } from './models.js';
import { GENERIC_WORLD } from './worlds/generic.js';

export const WORLD_FORMAT = 'flow.world';
export const WORLD_VERSION = 1;
export const PLACE_KINDS = ['home', 'work', 'shop', 'food', 'other'];
export const CHOICE_KINDS = ['talk', 'walk', 'battle', 'app', 'leave'];
export const DIRS = ['up', 'down', 'left', 'right'];
export const INDOOR_FLOORS = ['wood', 'dark', 'light', 'tile', 'bath', 'carpet', 'herring', 'concrete'];
export const OUTDOOR_FLOORS = ['grass', 'brick', 'path', 'drive', 'walk', 'street', 'lot'];
export const FLOORS = [...INDOOR_FLOORS, ...OUTDOOR_FLOORS];
const MAX_SIDE = 200;
const COLOR = /^#[0-9a-f]{6}$/i;
const SPRITE_KEYS = ['hair', 'hairShade', 'skin', 'shirt', 'shirtShade', 'trousers', 'trousersShade', 'shoes'];

class Refuse extends Error {}
const fail = (msg) => { throw new Refuse(msg); };

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const str = (v, what, { optional = false, max = 400 } = {}) => {
  if (v === undefined || v === null || (optional && v === '')) { if (optional) return undefined; fail(`${what} is missing`); }
  if (typeof v !== 'string' || !v.trim()) fail(`${what} must be text`);
  return v.slice(0, max);
};
const int = (v, what, min = 0, max = MAX_SIDE) => {
  if (!Number.isInteger(v) || v < min || v > max) fail(`${what} must be a whole number from ${min} to ${max}`);
  return v;
};
const num = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} must be a number`); return v; };
const color = (v, what) => { if (typeof v !== 'string' || !COLOR.test(v)) fail(`${what} must be a colour like #3a6ad8`); return v; };
const list = (v, what, { optional = true } = {}) => {
  if (v === undefined || v === null) { if (optional) return []; fail(`${what} is missing`); }
  if (!Array.isArray(v)) fail(`${what} must be a list`);
  return v;
};
const pos = (v, what, w = MAX_SIDE, h = MAX_SIDE) => {
  if (!Array.isArray(v) || v.length !== 2) fail(`${what} must be [x, y]`);
  return [int(v[0], `${what} x`, 0, w - 1), int(v[1], `${what} y`, 0, h - 1)];
};
const dir = (v, what) => { if (v === undefined) return 'down'; if (!DIRS.includes(v)) fail(`${what} is up, down, left or right, not "${v}"`); return v; };
const lines = (v, what) => list(v, what).map((l, i) => str(l, `${what} line ${i + 1}`, { max: 400 }));

function rect(r, what, w, h, { minSize = 1 } = {}) {
  if (!isObj(r)) fail(`${what} must be an object`);
  const out = { x: int(r.x, `${what} x`), y: int(r.y, `${what} y`), w: int(r.w ?? 1, `${what} w`, minSize), h: int(r.h ?? 1, `${what} h`, minSize) };
  if (out.x + out.w > w || out.y + out.h > h) fail(`${what} lies outside its level's size (${w}×${h})`);
  return out;
}

function floor(v, what) { if (!FLOORS.includes(v)) fail(`${what}: floor is one of ${FLOORS.join(', ')}, not "${v}"`); return v; }

/** Scene primitives and how many values each takes: [fewest, most]. */
const PRIMS = {
  box: [7, 7], hip: [7, 8], gable: [7, 7], ground: [5, 6], model: [3, 5],
};
function primitive(p, what, models) {
  if (!isObj(p)) fail(`${what} must be an object`);
  const kind = Object.keys(PRIMS).find((k) => k in p);
  if (!kind) fail(`${what} is one of ${Object.keys(PRIMS).join(', ')}`);
  const a = p[kind];
  const [min, max] = PRIMS[kind];
  if (!Array.isArray(a) || a.length < min || a.length > max) fail(`${what}: ${kind} has the wrong number of values`);
  if (kind === 'model') {
    if (!models.has(a[0])) fail(`${what}: no model "${a[0]}"`);
    return { model: [a[0], ...a.slice(1).map((x, i) => num(x, `${what} value ${i + 2}`))] };
  }
  const colorAt = { box: 6, hip: 6, gable: 6, ground: 4 }[kind];
  return { [kind]: a.map((x, i) => (i === colorAt ? color(x, `${what} colour`) : num(x, `${what} value ${i + 1}`))) };
}

function modelDefs(v) {
  if (v === undefined) return {};
  if (!isObj(v)) fail('models must be an object of { id: { boxes } }');
  const out = {};
  for (const [id, m] of Object.entries(v)) {
    if (!isObj(m)) fail(`model "${id}" must be an object`);
    out[id] = {
      boxes: list(m.boxes, `model "${id}" boxes`, { optional: false }).map((b, i) => {
        if (!Array.isArray(b) || b.length !== 7) fail(`model "${id}" box ${i + 1} is [x0, y0, z0, x1, y1, z1, colour]`);
        return [...b.slice(0, 6).map((x, k) => num(x, `model "${id}" box ${i + 1} value ${k + 1}`)), color(b[6], `model "${id}" box ${i + 1} colour`)];
      }),
    };
  }
  return out;
}

function level(l, i, models) {
  const what = `level ${i + 1}`;
  if (!isObj(l)) fail(`${what} must be an object`);
  const id = str(l.id, `${what} id`, { max: 60 });
  const name = str(l.name, `level "${id}" name`, { max: 60 });
  if (!Array.isArray(l.size) || l.size.length !== 2) fail(`level "${id}" size must be [width, height]`);
  const w = int(l.size[0], `level "${id}" width`, 1);
  const h = int(l.size[1], `level "${id}" height`, 1);
  const L = `level "${id}"`;
  const out = {
    id, name, size: [w, h], outdoor: !!l.outdoor,
    rooms: list(l.rooms, `${L} rooms`).map((r, k) => ({ name: str(r?.name, `${L} room ${k + 1} name`, { max: 60 }), ...rect(r, `${L} room "${r?.name}"`, w, h), floor: floor(r.floor, `${L} room "${r.name}"`) })),
    doors: list(l.doors, `${L} doors`).map((d, k) => ({ ...rect(d, `${L} door ${k + 1}`, w, h), floor: floor(d.floor, `${L} door ${k + 1}`), room: str(d.room, `${L} door ${k + 1} room`, { optional: true, max: 60 }) || '' })),
    ground: list(l.ground, `${L} ground`).map((d, k) => ({ ...rect(d, `${L} ground ${k + 1}`, w, h), floor: floor(d.floor, `${L} ground ${k + 1}`), room: str(d.room, `${L} ground ${k + 1} room`, { optional: true, max: 60 }) || '' })),
    buildings: list(l.buildings, `${L} buildings`).map((b, k) => {
      const B = `${L} building ${k + 1}`;
      return {
        ...rect(b, B, w, h), name: str(b.name, `${B} name`, { optional: true, max: 60 }) || '',
        height: b.height === undefined ? 2.4 : num(b.height, `${B} height`),
        wall: b.wall === undefined ? '#e8e0d0' : color(b.wall, `${B} wall`),
        roof: b.roof === undefined ? '#a8765a' : color(b.roof, `${B} roof`),
        rise: b.rise === undefined ? (b.flat ? 0 : 1.4) : num(b.rise, `${B} rise`),
        flat: !!b.flat, noRoof: !!b.noRoof, solid: !!b.solid,
      };
    }),
    furniture: list(l.furniture, `${L} furniture`).map((f, k) => {
      const F = `${L} furniture ${k + 1}`;
      const model = str(f?.model, `${F} model`, { max: 60 });
      if (!models.has(model)) fail(`${F}: no model "${model}"`);
      return {
        model, ...rect(f, F, w, h), name: str(f.name, `${F} name`, { optional: true, max: 60 }) || model,
        text: str(f.text, `${F} text`, { optional: true }) || '', walk: !!f.walk, under: !!f.under, car: !!f.car,
        rot: f.rot === undefined ? 0 : [0, 90, 180, 270].includes(f.rot) ? f.rot : fail(`${F} rot is 0, 90, 180 or 270`),
      };
    }),
    exits: list(l.exits, `${L} exits`).map((e, k) => ({ ...rect(e, `${L} exit ${k + 1}`, w, h), to: str(e.to, `${L} exit ${k + 1} to`, { max: 60 }), at: e.at, dir: dir(e.dir, `${L} exit ${k + 1} dir`) })),
    scene: list(l.scene, `${L} scene`).map((p, k) => primitive(p, `${L} scene ${k + 1}`, models)),
  };
  if (l.sky !== undefined) out.sky = color(l.sky, `${L} sky`);
  if (!out.outdoor && !out.rooms.length) fail(`${L} has no rooms (an outdoor level says outdoor: true)`);
  return out;
}

function sprite(s, what) {
  if (s === undefined) return {};
  if (!isObj(s)) fail(`${what} must be an object of colours`);
  const out = {};
  for (const k of SPRITE_KEYS) if (s[k] !== undefined) out[k] = color(s[k], `${what} ${k}`);
  return out;
}

function checked(json) {
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch { fail('the file is not valid JSON'); }
  }
  if (!isObj(json)) fail('a world pack is a JSON object');
  if (json.format !== WORLD_FORMAT) fail(`format must be "${WORLD_FORMAT}"`);
  if (json.version !== WORLD_VERSION) fail(`version must be ${WORLD_VERSION}, not ${JSON.stringify(json.version)}`);
  const name = str(json.name, 'name', { max: 60 });
  const extra = modelDefs(json.models);
  const models = new Set([...Object.keys(MODELS), ...Object.keys(extra)]);
  const levels = list(json.levels, 'levels', { optional: false }).map((l, i) => level(l, i, models));
  if (!levels.length) fail('a world needs at least one level');
  const byId = new Map();
  for (const l of levels) { if (byId.has(l.id)) fail(`two levels are called "${l.id}"`); byId.set(l.id, l); }
  const inLevel = (id, p, what) => {
    const l = byId.get(id);
    if (!l) fail(`${what}: no level "${id}"`);
    return pos(p, `${what} position`, l.size[0], l.size[1]);
  };
  for (const l of levels) for (const [k, e] of l.exits.entries()) {
    if (!byId.has(e.to)) fail(`level "${l.id}" exit ${k + 1} leads to "${e.to}", which is not a level`);
    e.at = inLevel(e.to, e.at, `level "${l.id}" exit ${k + 1} arrival`);
  }
  if (!isObj(json.start)) fail('start is missing: { level, position, dir }');
  const start = { level: str(json.start.level, 'start level', { max: 60 }), position: null, dir: dir(json.start.dir, 'start dir') };
  start.position = inLevel(start.level, json.start.position, 'start');
  const car = isObj(json.car) ? { name: str(json.car.name, 'car name', { max: 60 }) } : fail('car is missing: { name }');
  if (json.car.model !== undefined) { if (!models.has(json.car.model)) fail(`car: no model "${json.car.model}"`); car.model = json.car.model; }
  if (json.car.color !== undefined) car.color = color(json.car.color, 'car colour');
  const places = list(json.places, 'places', { optional: false }).map((p, i) => {
    const P = `place ${i + 1}`;
    if (!isObj(p)) fail(`${P} must be an object`);
    if (!PLACE_KINDS.includes(p.kind)) fail(`${P} kind is ${PLACE_KINDS.join(', ')}, not "${p.kind}"`);
    const level = str(p.level, `${P} level`, { max: 60 });
    return {
      id: str(p.id, `${P} id`, { max: 60 }), name: str(p.name, `${P} name`, { max: 60 }), kind: p.kind,
      position: pos(p.position, `${P} map position`, 240, 120), level, at: inLevel(level, p.at, P), dir: dir(p.dir, `${P} dir`),
      note: str(p.note, `${P} note`, { optional: true }) || '',
    };
  });
  if (!places.length) fail('a world needs at least one map place');
  const npcs = list(json.npcs, 'npcs').map((n, i) => {
    const N = `person ${i + 1}`;
    if (!isObj(n)) fail(`${N} must be an object`);
    const level = str(n.level, `${N} level`, { max: 60 });
    return {
      id: str(n.id, `${N} id`, { max: 60 }), name: str(n.name, `${N} name`, { max: 30 }), level,
      position: inLevel(level, n.position, N), dir: dir(n.dir, `${N} dir`), sprite: sprite(n.sprite, `${N} sprite`),
      lines: lines(n.lines, `${N} lines`),
      choices: list(n.choices, `${N} choices`).map((c, k) => {
        const C = `${N} choice ${k + 1}`;
        if (!isObj(c)) fail(`${C} must be an object`);
        if (!CHOICE_KINDS.includes(c.kind)) fail(`${C} kind is ${CHOICE_KINDS.join(', ')}, not "${c.kind}"`);
        const out = { label: str(c.label, `${C} label`, { max: 60 }), kind: c.kind, lines: lines(c.lines, `${C} lines`) };
        if (c.kind === 'walk') {
          out.with = list(c.with, `${C} with`).map((x) => str(x, `${C} with`, { max: 60 }));
          out.lap = list(c.lap, `${C} lap`).map((p, j) => inLevel(level, p, `${C} lap point ${j + 1}`));
        }
        return out;
      }),
    };
  });
  const ids = new Set(npcs.map((n) => n.id));
  for (const n of npcs) for (const c of n.choices) for (const w of c.with || []) if (!ids.has(w)) fail(`${n.name}: walks with "${w}", who is not in the pack`);
  const desks = list(json.desks, 'desks', { optional: false }).map((d, i) => {
    if (!isObj(d)) fail(`desk ${i + 1} must be { level, position }`);
    const lv = str(d.level, `desk ${i + 1} level`, { max: 60 });
    return { level: lv, position: inLevel(lv, d.position, `desk ${i + 1}`) };
  });
  if (!desks.length) fail('a world needs at least one desk that opens TASKS');
  const spots = {};
  if (json.spots !== undefined) {
    if (!isObj(json.spots)) fail('spots must be an object of { place or zone: { level, position } }');
    for (const [k, s] of Object.entries(json.spots)) {
      if (!isObj(s)) fail(`spot "${k}" must be { level, position }`);
      const lv = str(s.level, `spot "${k}" level`, { max: 60 });
      spots[k] = { level: lv, position: inLevel(lv, s.position, `spot "${k}"`) };
    }
  }
  return { format: WORLD_FORMAT, version: WORLD_VERSION, name, car, start, levels, places, npcs, desks, spots, models: extra };
}

/** Check a pack and return the world it describes, or why it was refused. Never partial. */
export function validateWorld(json) {
  try {
    return { ok: true, world: checked(json) };
  } catch (err) {
    if (err instanceof Refuse) return { ok: false, reason: err.message };
    return { ok: false, reason: `the pack could not be read (${err.message})` };
  }
}

/** The one world record of the workspace. Saved like any definition, so it syncs. */
export function worldRecord(world) {
  return { id: 'world', type: 'world', world };
}

/** The world in effect: the stored pack while it validates, else the generic world. */
export function worldFor(recordsOrDb) {
  const rec = Array.isArray(recordsOrDb) ? index(recordsOrDb).world : recordsOrDb?.world;
  if (rec?.world) {
    const r = validateWorld(rec.world);
    if (r.ok) return r.world;
  }
  return GENERIC;
}
const GENERIC = checked(JSON.parse(JSON.stringify(GENERIC_WORLD)));

/** Rooms are rectangles of floor; walls grow around them; doors are floor cut into walls. */
export function buildFloor(w, h, rooms, doors = []) {
  const cell = Array.from({ length: h }, () => Array(w).fill(null));
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cell[y][x] = { floor: r.floor, room: r.name };
  for (const d of doors) for (let y = d.y; y < d.y + (d.h || 1); y++) for (let x = d.x; x < d.x + (d.w || 1); x++) cell[y][x] = { floor: d.floor, room: d.room || '', door: true };
  const floorAt = (x, y) => y >= 0 && y < h && x >= 0 && x < w && cell[y][x] && cell[y][x].floor;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cell[y][x]) continue;
    let near = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (floorAt(x + dx, y + dy)) near = true;
    cell[y][x] = near ? { wall: true, face: !!floorAt(x, y + 1) } : { void: true };
  }
  return { w, h, cell };
}

/** The walkable grid of a level: rooms and walls inside; ground and roofed buildings outside. */
export function levelGrid(level) {
  const [w, h] = level.size;
  if (!level.outdoor) return buildFloor(w, h, level.rooms, level.doors);
  const cell = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ floor: 'grass', room: level.name })));
  const put = (r, v) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cell[y][x] = { ...v }; };
  for (const g of level.ground) put(g, { floor: g.floor, room: g.room || level.name });
  for (const r of level.rooms) put(r, { floor: r.floor, room: r.name });
  level.buildings.forEach((b, i) => put(b, { roof: true, building: i, room: b.name || level.name }));
  for (const d of level.doors) put(d, { floor: d.floor, room: d.room || level.name, door: true });
  return { w, h, cell };
}

/** Where a Flow place happens in this world: its own spot, its zone's, or the start. */
export function spotFor(world, place, zone) {
  const s = (place && world.spots?.[place]) || (zone && world.spots?.[zone]);
  if (s) return s;
  const kind = { home: 'home', factory: 'work', road: 'home', town: 'shop' }[zone];
  const p = world.places.find((x) => x.kind === kind);
  return p ? { level: p.level, position: p.at } : { level: world.start.level, position: world.start.position };
}
