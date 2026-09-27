// flow/src/replay/plan.js — where everyone stands in each segment of the
// timeline: the hero's spot or walking path, the car's parking place or
// driving route, and the person the hero is talking to. Pure.

import { BUILDINGS, PARKING, SPARES, findPath, spotOfBuilding } from './world.js';
import { isEvent } from './schedule.js';

const isCarPlace = (id, name, zone) => id === 'place_car' || (zone === 'road' && /^car$/i.test(name || ''));

/**
 * Give every place in the replay a spot on the map: its own building when it
 * is a default place (by id, else by name), else a signpost in its zone.
 * Returns Map(placeId|null → { id, name, zone, car?, building?, spare?, spot }).
 */
export function resolvePlaces(replay) {
  const out = new Map();
  const used = new Map(Object.keys(SPARES).map((z) => [z, 0]));
  let tentUsed = false;
  const seen = [];
  for (const b of replay?.beats || []) {
    if (b.kind === 'walk') { seen.push([b.from, null, b.fromZone]); seen.push([b.to, null, b.toZone]); }
    else seen.push([b.place ?? null, b.placeName, b.zone]);
  }
  // Events carry names; walks only ids — let the named ones claim first.
  seen.sort((a, b) => (a[1] ? 0 : 1) - (b[1] ? 0 : 1));
  for (const [id, name, zoneIn] of seen) {
    if (out.has(id)) continue;
    const zone = zoneIn || 'elsewhere';
    if (isCarPlace(id, name, zone)) { out.set(id, { id, name: name || 'Car', zone: 'road', car: true }); continue; }
    const building = BUILDINGS.find((x) => !x.spare && x.id === id)
      || (name && BUILDINGS.find((x) => !x.spare && x.zone === zone && x.name.toLowerCase() === String(name).toLowerCase()));
    if (building) { out.set(id, { id, name: name || building.name, zone, building, spot: spotOfBuilding(building) }); continue; }
    if (zone === 'elsewhere' && !tentUsed) {
      tentUsed = true;
      const tent = BUILDINGS.find((x) => x.id === 'place_elsewhere');
      out.set(id, { id, name: name || 'Somewhere', zone, building: tent, spot: spotOfBuilding(tent) });
      continue;
    }
    const list = SPARES[zone] || SPARES.elsewhere;
    const k = used.get(zone) ?? 0;
    used.set(zone, k + 1);
    const spare = list[k % list.length];
    out.set(id, { id, name: name || 'Somewhere', zone, spare, spot: { x: spare.x, y: spare.y } });
  }
  return out;
}

const dirOf = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy !== 0) return dy > 0 ? 'down' : 'up';
  return null;
};

/** Where along a tile path we are at progress p (0–1): position in tiles and facing. */
export function alongPath(path, p) {
  if (!path || !path.length) return { x: 0, y: 0, dir: 'down', step: 0 };
  if (path.length === 1) return { ...path[0], dir: 'down', step: 0 };
  const n = path.length - 1;
  const f = Math.max(0, Math.min(1, p)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const a = path[i];
  const b = path[i + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dir: dirOf(a, b) || 'down', step: f };
}

/**
 * Stage directions for every segment of a timeline. Each entry:
 *   { hero: { at | path, dir, hidden }, car: { at | path, dir }, npc?, place? }
 * Positions are tiles. A walk into the car goes to where the car is parked
 * in the zone you leave from; a drive takes the car along the road to the
 * next zone you visit.
 */
export function planReplay(replay, timeline, world) {
  const places = resolvePlaces(replay);
  const beats = replay?.beats || [];
  const parkingOf = (zone) => PARKING[zone] || null;
  const placeOf = (id) => places.get(id ?? null);

  // The zone the car starts the day in: wherever it is first needed.
  let carZone = 'home';
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    if (b.kind === 'walk' && placeOf(b.to)?.car && parkingOf(b.fromZone)) { carZone = b.fromZone; break; }
    if (b.kind !== 'walk' && placeOf(b.place)?.car) {
      const prev = beats.slice(0, i).reverse().find((x) => x.kind !== 'walk' && x.zone !== 'road');
      if (prev && parkingOf(prev.zone)) carZone = prev.zone;
      break;
    }
  }
  const nextZoneAfter = (i) => {
    for (let j = i + 1; j < beats.length; j++) {
      const b = beats[j];
      if (b.kind === 'walk') { if (b.toZone && b.toZone !== 'road') return b.toZone; continue; }
      if (b.zone && b.zone !== 'road') return b.zone;
    }
    return null;
  };

  const firstPlaced = beats.find((b) => b.kind !== 'walk' && (b.place !== undefined));
  let inCar = !!(firstPlaced && placeOf(firstPlaced.place)?.car);
  let cur = firstPlaced && !inCar ? placeOf(firstPlaced.place)?.spot : null;
  if (!cur) cur = inCar ? parkingOf(carZone) : spotOfBuilding(BUILDINGS[0]);
  let carDir = 'right';
  const info = (id) => { const p = placeOf(id); return p ? { id: p.id, name: p.name, zone: p.zone } : { id: null, name: 'Somewhere', zone: 'elsewhere' }; };
  let here = firstPlaced ? info(firstPlaced.place) : { id: BUILDINGS[0].id, name: BUILDINGS[0].name, zone: 'home' };

  const npcSpot = (spot) => {
    for (const [dx, dy, face] of [[1, 0, 'left'], [-1, 0, 'right'], [0, 1, 'up']]) {
      const x = spot.x + dx; const y = spot.y + dy;
      if (x >= 0 && y >= 0 && x < world.w && y < world.h && Number.isFinite(world.cost(x, y))) return { x, y, dir: face };
    }
    return { x: spot.x + 1, y: spot.y, dir: 'left' };
  };
  const faceTo = (npc) => (npc.dir === 'left' ? 'right' : npc.dir === 'right' ? 'left' : 'down');

  return timeline.segments.map((seg) => {
    if (seg.type !== 'beat') {
      return { hero: { at: cur, dir: 'down', hidden: inCar }, car: { at: parkingOf(carZone) || cur, dir: carDir }, here };
    }
    const b = seg.beat;
    const i = seg.index;
    if (b.kind === 'walk') {
      const to = placeOf(b.to);
      const from = inCar ? parkingOf(carZone) || cur : cur;
      let dest;
      if (to?.car) {
        if (parkingOf(b.fromZone) && b.fromZone !== carZone) carZone = b.fromZone;
        dest = parkingOf(carZone) || cur;
      } else dest = to?.spot || cur;
      const path = findPath(world, from, dest) || [from, dest];
      inCar = false;
      cur = dest;
      const before = here;
      here = info(b.to);
      const plan = { hero: { path, dir: 'down', hidden: false }, car: { at: parkingOf(carZone), dir: carDir }, walk: true, from: before, here };
      if (to?.car) inCar = true;
      return plan;
    }
    // Idle happens wherever the hero already is (in the car, too). replayDay
    // tags an idle after a walk with the place walked from, so it is not used.
    if (b.kind === 'idle') {
      return { hero: { at: cur, dir: 'down', hidden: inCar }, car: { at: parkingOf(carZone) || cur, dir: carDir }, idle: true, here };
    }
    const place = placeOf(b.place);
    here = info(b.place);
    if (place?.car) {
      inCar = true;
      const next = nextZoneAfter(i);
      const from = parkingOf(carZone);
      if (next && parkingOf(next) && next !== carZone && from && isEvent(b)) {
        const path = findPath(world, from, parkingOf(next), world.roadCost) || [from, parkingOf(next)];
        carZone = next;
        cur = parkingOf(next);
        const last = path.length > 1 ? dirOf(path[path.length - 2], path[path.length - 1]) : carDir;
        const plan = { hero: { at: cur, dir: 'down', hidden: true }, car: { path, dir: carDir }, drive: true, place, here };
        carDir = last || carDir;
        return plan;
      }
      cur = from || cur;
      return { hero: { at: cur, dir: 'down', hidden: true }, car: { at: from || cur, dir: carDir }, place, here };
    }
    inCar = false;
    if (place?.spot) cur = place.spot;
    const plan = { hero: { at: cur, dir: 'down', hidden: false }, car: { at: parkingOf(carZone), dir: carDir }, place, here };
    if (b.kind === 'moment' && b.who) {
      plan.npc = { ...npcSpot(cur), name: b.who };
      plan.hero.dir = faceTo(plan.npc);
    }
    return plan;
  });
}
