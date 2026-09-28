// The generic world is playable: every place the game can put the hero is
// floor, not furniture or a person; exits land on floor; desks can be reached;
// every level can be reached from the start on foot or by car.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorld, levelGrid, spotFor } from '../src/game/world.js';
import { GENERIC_WORLD } from '../src/game/worlds/generic.js';
import { findPath } from '../src/game/engine.js';
import { DEFAULT_PLACES, ZONES } from '../src/model.js';

const world = validateWorld(GENERIC_WORLD).world;
const levels = new Map(world.levels.map((l) => [l.id, { def: l, grid: levelGrid(l) }]));
const blocked = (L, x, y) => L.def.furniture.some((f) => !f.walk && x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h)
  || world.npcs.some((n) => n.level === L.def.id && n.position[0] === x && n.position[1] === y);
const floor = (L, x, y) => !!L.grid.cell[y]?.[x]?.floor;
const standable = (id, [x, y]) => { const L = levels.get(id); return floor(L, x, y) && !blocked(L, x, y); };

test('generic world: the start, spots, map places and exit arrivals are free floor', () => {
  assert.ok(standable(world.start.level, world.start.position), 'start');
  for (const [k, s] of Object.entries(world.spots)) assert.ok(standable(s.level, s.position), `spot ${k}`);
  for (const p of world.places) assert.ok(standable(p.level, p.at), `place ${p.id}`);
  for (const l of world.levels) for (const e of l.exits) {
    assert.ok(standable(e.to, e.at), `${l.id} exit → ${e.to} arrival`);
    assert.ok(floor(levels.get(l.id), e.x, e.y), `${l.id} exit tile is floor`);
  }
  for (const n of world.npcs) { const L = levels.get(n.level); assert.ok(floor(L, ...n.position) && !L.def.furniture.some((f) => !f.walk && n.position[0] >= f.x && n.position[0] < f.x + f.w && n.position[1] >= f.y && n.position[1] < f.y + f.h), `${n.name} stands on floor`); }
});

test('generic world: every default place and zone has a spot', () => {
  for (const p of DEFAULT_PLACES) assert.ok(world.spots[p.id], p.id);
  for (const z of ZONES) assert.ok(spotFor(world, null, z), z);
});

test('generic world: every level is reachable from the start, and every desk and spot from its level’s entrances', () => {
  const ok = (L) => (x, y) => floor(L, x, y) && !blocked(L, x, y);
  // Entry points per level: exit arrivals and car drop-offs.
  const entries = new Map(world.levels.map((l) => [l.id, []]));
  entries.get(world.start.level).push(world.start.position);
  for (const l of world.levels) for (const e of l.exits) entries.get(e.to).push(e.at);
  for (const p of world.places) entries.get(p.level).push(p.at);
  const reach = (id, from, to) => { const L = levels.get(id); return (from[0] === to[0] && from[1] === to[1]) || findPath(ok(L), from, to).length > 0; };
  for (const l of world.levels) {
    const [first] = entries.get(l.id);
    assert.ok(first, `${l.id} has a way in`);
    for (const e of entries.get(l.id)) assert.ok(reach(l.id, first, e), `${l.id}: ${e} reachable`);
    for (const e of l.exits) assert.ok(reach(l.id, first, [e.x, e.y]), `${l.id}: exit at ${e.x},${e.y} reachable`);
    for (const f of l.furniture.filter((x) => x.car)) {
      const next = [[f.x - 1, f.y], [f.x + f.w, f.y], [f.x, f.y - 1], [f.x, f.y + f.h]];
      assert.ok(next.some((c) => ok(levels.get(l.id))(...c) && reach(l.id, first, c)), `${l.id}: the car can be reached`);
    }
  }
  for (const d of world.desks) {
    const L = levels.get(d.level);
    const [x, y] = d.position;
    // Facing any tile of the desk's furniture opens TASKS.
    const f = L.def.furniture.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) || { x, y, w: 1, h: 1 };
    const tiles = [];
    for (let ty = f.y; ty < f.y + f.h; ty++) for (let tx = f.x; tx < f.x + f.w; tx++) tiles.push([tx, ty]);
    const next = tiles.flatMap(([a, b]) => [[a, b + 1], [a - 1, b], [a + 1, b], [a, b - 1]]).filter((c) => ok(L)(...c));
    assert.ok(next.some((c) => reach(d.level, entries.get(d.level)[0], c)), `desk ${d.level} ${x},${y} reachable`);
  }
  for (const [k, s] of Object.entries(world.spots)) assert.ok(reach(s.level, entries.get(s.level)[0], s.position), `spot ${k} reachable`);
});

test('generic world: made-up people only, with walk laps on free floor', () => {
  for (const n of world.npcs) for (const c of n.choices.filter((x) => x.kind === 'walk')) {
    const L = levels.get(n.level);
    for (const p of c.lap) assert.ok(floor(L, ...p) && !blocked(L, ...p), `${n.name} lap point ${p}`);
  }
});
