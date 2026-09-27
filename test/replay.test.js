// Tests for the Day Replay's pure parts: the timeline, the map and its
// paths, the stage plan, and the art data. Fixed timestamps throughout.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { schedule, segmentAt, clockAt, heartsFor, outfitFor, bannersFor, sfxFor, nightFor, energyMarks, eventsByPlace, minutesText, TIMING } from '../src/replay/schedule.js';
import { buildWorld, findPath, BUILDINGS, PARKING, SPARES, ROAD_TILES, spotOfBuilding, MAP_W, MAP_H } from '../src/replay/world.js';
import { planReplay, resolvePlaces, alongPath } from '../src/replay/plan.js';
import { PALETTE, TILES, HERO, LEGS, HERO_SIT, HERO_CHEER, CAR, ICONS, HEART, FONT, glyphFor, measureText, wrapText, fitText, heroGrid, carGrid, personColors, lookFor, shade } from '../src/replay/art.js';
import { sampleReplay } from '../src/replay/sample.js';
import { DEFAULT_PLACES } from '../src/model.js';

const T = (h, m = 0) => new Date(2026, 8, 24, h, m).getTime();
const ev = (kind, h, m, extra = {}) => ({ kind, start: T(h, m), end: T(h, m + 20), place: 'place_desk', zone: 'factory', placeName: 'Desk', title: 'Thing', text: 'Thing. +10', points: 10, after: { stamina: 5, mana: 5, points: 100 }, ...extra });

// ─── schedule ───────────────────────────────────────────────────────────────

test('schedule: intro, ~3 s events, 1–2 s walks, 0.5 s idle, then four finale screens', () => {
  const replay = {
    series: [{ at: T(8), stamina: 8, mana: 7 }],
    beats: [
      ev('done', 8, 0, { after: { stamina: 7, mana: 6, points: 110 } }),
      { kind: 'idle', start: T(8, 20), end: T(8, 40), place: 'place_desk', zone: 'factory' },
      { kind: 'walk', start: T(8, 40), end: T(8, 45), from: 'place_desk', to: 'place_floor', fromZone: 'factory', toZone: 'factory' },
      ev('moment', 8, 45, { place: 'place_floor', placeName: 'Factory floor', points: 0 }),
      { kind: 'walk', start: T(9, 5), end: T(9, 10), from: 'place_floor', to: 'place_car', fromZone: 'factory', toZone: 'road' },
    ],
  };
  const tl = schedule(replay);
  const beats = tl.segments.filter((s) => s.type === 'beat');
  assert.equal(tl.segments[0].type, 'intro');
  assert.equal(tl.segments[0].dur, TIMING.intro);
  assert.deepEqual(beats.map((s) => s.dur), [3, 0.5, 1, 3, 2]);
  assert.equal(tl.dayEnd, 2.5 + 3 + 0.5 + 1 + 3 + 2);
  const finale = tl.segments.filter((s) => s.type === 'finale');
  assert.deepEqual(finale.map((s) => s.screen), ['totals', 'energy', 'time', 'tomorrow']);
  assert.equal(finale[0].t0, tl.dayEnd);
  assert.equal(tl.total, tl.dayEnd + 4 * TIMING.finale);
  // Segments tile the timeline with no gaps.
  for (let i = 1; i < tl.segments.length; i++) assert.equal(tl.segments[i].t0, tl.segments[i - 1].t1);
  // The HUD starts from the morning and follows each event's `after`.
  assert.deepEqual(tl.segments[0].hud, { stamina: 8, mana: 7, points: 100 });
  assert.deepEqual(beats[0].hud, { stamina: 7, mana: 6, points: 110 });
  assert.deepEqual(beats[2].hud, beats[0].hud);
});

test('schedule: a busy day keeps events at the floor; a huge one scales to fit two minutes', () => {
  const busy = [];
  for (let i = 0; i < 40; i++) busy.push(ev('done', 6 + Math.floor(i / 4), (i % 4) * 15), { kind: 'idle', start: 0, end: 0 });
  const tb = schedule({ beats: busy, series: [] });
  assert.ok(tb.dayEnd <= TIMING.maxDay + 0.1);
  assert.ok(tb.segments.filter((s) => s.beat?.kind === 'done').every((s) => s.dur >= TIMING.minEvent - 0.001 && s.dur < TIMING.event));

  const beats = [];
  for (let i = 0; i < 60; i++) {
    beats.push(ev('done', 6 + Math.floor(i / 4), (i % 4) * 15));
    beats.push({ kind: 'walk', start: 0, end: 0, fromZone: 'home', toZone: 'factory' });
    beats.push({ kind: 'idle', start: 0, end: 0 });
  }
  const tl = schedule({ beats, series: [] });
  assert.ok(tl.dayEnd <= TIMING.maxDay + 0.1, `day ran ${tl.dayEnd}s`);
  for (const s of tl.segments.filter((x) => x.type === 'beat')) {
    if (s.beat.kind === 'done') assert.ok(s.dur >= 1, `event only ${s.dur}s`);
    if (s.beat.kind === 'walk') assert.ok(s.dur >= 0.3);
  }
});

test('schedule: an empty day is just the intro and the finale', () => {
  const tl = schedule({ beats: [], series: [] });
  assert.equal(tl.dayEnd, TIMING.intro);
  assert.equal(tl.segments.length, 5);
  assert.equal(clockAt(tl, segmentAt(tl, 0)), null);
});

test('segmentAt: finds the segment and the progress through it', () => {
  const tl = schedule({ beats: [ev('done', 8, 0), ev('done', 9, 0)], series: [] });
  assert.equal(segmentAt(tl, 0).seg.type, 'intro');
  const a = segmentAt(tl, 2.5 + 1.5);
  assert.equal(a.seg.index, 0);
  assert.equal(a.p, 0.5);
  assert.equal(clockAt(tl, a), T(8, 10));
  assert.equal(segmentAt(tl, 2.5 + 3).seg.index, 1);
  assert.equal(segmentAt(tl, 1e9).seg.screen, 'tomorrow');
  assert.equal(segmentAt(tl, -5).i, 0);
});

test('the sample workday plays in one to two minutes', () => {
  const replay = sampleReplay();
  const tl = schedule(replay);
  assert.ok(tl.dayEnd >= 60 && tl.dayEnd <= 120, `day is ${tl.dayEnd}s`);
  assert.ok(replay.beats.some((b) => b.who === 'Whitney'));
  assert.ok(replay.beats.some((b) => (b.tags || []).includes('batch ×4')));
  assert.ok(replay.beats.some((b) => b.kind === 'rework'));
  assert.ok(replay.beats.some((b) => b.kind === 'purchase'));
});

// ─── helpers ────────────────────────────────────────────────────────────────

test('heartsFor: five hearts in halves', () => {
  assert.deepEqual(heartsFor(10), ['full', 'full', 'full', 'full', 'full']);
  assert.deepEqual(heartsFor(7.3), ['full', 'full', 'full', 'half', 'empty']);
  assert.deepEqual(heartsFor(0.4), ['empty', 'empty', 'empty', 'empty', 'empty']);
  assert.deepEqual(heartsFor(1), ['half', 'empty', 'empty', 'empty', 'empty']);
  assert.deepEqual(heartsFor(-3), heartsFor(0));
  assert.deepEqual(heartsFor(99), heartsFor(10));
});

test('outfitFor: hard hat on the floor and in the warehouse, pyjamas at home after 21:00', () => {
  assert.equal(outfitFor({ place: 'place_floor', zone: 'factory', at: T(9) }).hardHat, true);
  assert.equal(outfitFor({ place: 'place_warehouse', zone: 'factory', at: T(9) }).hardHat, true);
  assert.equal(outfitFor({ place: 'place_desk', zone: 'factory', at: T(9) }).hardHat, false);
  assert.equal(outfitFor({ place: 'x', placeName: 'Warehouse', zone: 'factory' }).hardHat, true);
  assert.equal(outfitFor({ place: 'place_bedroom', zone: 'home', at: T(21, 15) }).pyjamas, true);
  assert.equal(outfitFor({ place: 'place_bedroom', zone: 'home', at: T(20, 59) }).pyjamas, false);
  assert.equal(outfitFor({ place: 'place_gym', zone: 'town', at: T(22) }).pyjamas, false);
});

test('bannersFor and sfxFor read the beat tags', () => {
  assert.deepEqual(bannersFor({ tags: ['batch ×3', 'personal best'] }), ['BATCH ×3', 'PERSONAL BEST!']);
  assert.deepEqual(bannersFor({ tags: ['combo ×2', 'in the zone', 'underdog'] }), ['COMBO ×2', 'IN THE ZONE', 'UNDERDOG']);
  assert.deepEqual(bannersFor({}), []);
  assert.equal(sfxFor({ kind: 'done', tags: ['batch ×2'] }), 'batch');
  assert.equal(sfxFor({ kind: 'done', tags: [] }), 'gem');
  assert.equal(sfxFor({ kind: 'rework' }), 'rework');
  assert.equal(sfxFor({ kind: 'walk' }), null);
});

test('nightFor, minutesText, energyMarks', () => {
  assert.equal(nightFor(12), 0);
  assert.ok(nightFor(22) > nightFor(19));
  assert.equal(minutesText(296), '4h 56m');
  assert.equal(minutesText(40), '40m');
  const series = [
    { at: T(7), stamina: 8, mana: 7, label: 'Morning' },
    { at: T(9), stamina: 6, mana: 6, label: 'Floor' },
    { at: T(12), stamina: 8, mana: 7, label: 'Lunch' },
    { at: T(15), stamina: 8, mana: 3, label: 'Emails' },
  ];
  const marks = energyMarks(series, 4);
  assert.deepEqual(marks.map((m) => m.label), ['Floor', 'Lunch', 'Emails']);
  assert.equal(marks[2].mana, -4);
});

test('eventsByPlace groups the events (not the gaps) by place', () => {
  const by = eventsByPlace(sampleReplay());
  assert.equal(by.get('place_desk').name, 'Desk');
  assert.ok(by.get('place_desk').beats.length >= 7);
  assert.ok([...by.values()].every((p) => p.beats.every((b) => b.kind !== 'idle' && b.kind !== 'walk')));
});

// ─── the world ──────────────────────────────────────────────────────────────

test('world: every default place has a building with a walkable spot, all reachable', () => {
  const world = buildWorld();
  assert.equal(world.tiles.length, MAP_H);
  assert.ok(world.tiles.every((r) => r.length === MAP_W));
  for (const p of DEFAULT_PLACES.filter((x) => x.id !== 'place_car')) {
    const b = BUILDINGS.find((x) => x.id === p.id);
    assert.ok(b, `no building for ${p.id}`);
    assert.equal(b.zone, p.zone);
    const s = spotOfBuilding(b);
    assert.ok(Number.isFinite(world.cost(s.x, s.y)), `${p.id} spot is blocked`);
  }
  const spots = [
    ...BUILDINGS.map(spotOfBuilding),
    ...Object.values(PARKING),
    ...Object.values(SPARES).flat().map((s) => ({ x: s.x, y: s.y })),
  ];
  for (const s of spots) assert.ok(Number.isFinite(world.cost(s.x, s.y)) || ROAD_TILES.has(world.tile(s.x, s.y)), `spot ${s.x},${s.y} is not walkable`);
  const home = spotOfBuilding(BUILDINGS[0]);
  for (const s of spots) assert.ok(findPath(world, home, s), `no path to ${s.x},${s.y}`);
});

test('world: the car can drive between every car park on the road alone', () => {
  const world = buildWorld();
  const parks = Object.values(PARKING);
  for (const a of parks) for (const b of parks) {
    const path = findPath(world, a, b, world.roadCost);
    assert.ok(path, 'no road');
    assert.ok(path.every((t) => ROAD_TILES.has(world.tile(t.x, t.y))));
  }
});

test('findPath: 4-way steps, prefers paths over grass', () => {
  const world = buildWorld();
  const a = spotOfBuilding(BUILDINGS.find((b) => b.id === 'place_bedroom'));
  const b = spotOfBuilding(BUILDINGS.find((x) => x.id === 'place_kitchen'));
  const path = findPath(world, a, b);
  for (let i = 1; i < path.length; i++) assert.equal(Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y), 1);
  assert.ok(path.every((t) => world.tile(t.x, t.y) === ':'));
  const mid = alongPath(path, 0.5);
  assert.equal(mid.dir, 'right');
});

// ─── places and the plan ────────────────────────────────────────────────────

test('resolvePlaces: default places by id or name; unknown places get a signpost in their zone', () => {
  const places = resolvePlaces({ beats: [
    { kind: 'done', place: 'place_gym', zone: 'town', placeName: 'Gym' },
    { kind: 'done', place: 'p1', zone: 'factory', placeName: 'Desk' },
    { kind: 'done', place: 'p2', zone: 'town', placeName: 'Library' },
    { kind: 'done', place: 'p3', zone: 'town', placeName: 'Pool' },
    { kind: 'purchase', place: null, zone: 'elsewhere', placeName: 'Somewhere' },
    { kind: 'moment', place: 'place_car', zone: 'road', placeName: 'Car' },
  ] });
  assert.equal(places.get('place_gym').building.id, 'place_gym');
  assert.equal(places.get('p1').building.id, 'place_desk');
  assert.ok(places.get('p2').spare && places.get('p3').spare);
  assert.notDeepEqual(places.get('p2').spot, places.get('p3').spot);
  assert.equal(places.get(null).building.id, 'place_elsewhere');
  assert.equal(places.get('place_car').car, true);
});

test('planReplay: walks end at the next place, drives follow the road, idling stays put', () => {
  const replay = sampleReplay();
  const tl = schedule(replay);
  const world = buildWorld();
  const plan = planReplay(replay, tl, world);
  const places = resolvePlaces(replay);
  assert.equal(plan.length, tl.segments.length);
  let pos = null;
  tl.segments.forEach((seg, i) => {
    const p = plan[i];
    if (p.hero.path) {
      if (pos) assert.deepEqual(p.hero.path[0], pos, `walk ${i} starts where the hero was`);
      pos = p.hero.path[p.hero.path.length - 1];
      const to = places.get(seg.beat.to);
      if (to?.spot) assert.deepEqual(pos, to.spot);
      if (to?.car) assert.ok(Object.values(PARKING).some((k) => k.x === pos.x && k.y === pos.y));
    } else if (seg.type === 'beat' && seg.beat.kind === 'idle') {
      assert.deepEqual(p.hero.at, pos, `idle ${i} does not move the hero`);
    } else if (seg.type === 'beat') {
      pos = p.hero.at;
    }
    if (p.car.path) assert.ok(p.car.path.every((t) => ROAD_TILES.has(world.tile(t.x, t.y))));
  });
  const drives = plan.filter((p) => p.drive);
  assert.equal(drives.length, 2);
  assert.deepEqual(drives[0].car.path.at(-1), PARKING.factory);
  assert.deepEqual(drives[1].car.path.at(-1), PARKING.home);
  const chat = tl.segments.findIndex((s) => s.beat?.who === 'Whitney');
  assert.equal(plan[chat].npc.name, 'Whitney');
  assert.equal(plan[chat].hero.dir, plan[chat].npc.dir === 'left' ? 'right' : plan[chat].npc.dir === 'right' ? 'left' : 'down');
});

// ─── art ────────────────────────────────────────────────────────────────────

const SLOTS = new Set(['.', ...Object.keys(PALETTE), 'H', 'J', 'S', 'K', 'T', 'U', 'P', 'Q', 'R', 'D', 'L']);
const checkGrid = (name, grid, w, h) => {
  assert.ok(Array.isArray(grid) && grid.length, name);
  if (h) assert.equal(grid.length, h, `${name} height`);
  const width = w || grid[0].length;
  grid.forEach((row, y) => {
    assert.equal(row.length, width, `${name} row ${y} is ${row.length} wide`);
    for (const ch of row) assert.ok(SLOTS.has(ch), `${name} has "${ch}"`);
  });
};

test('art: every grid is rectangular and uses the palette or a slot', () => {
  assert.equal(Object.keys(PALETTE).length, 16);
  for (const [k, g] of Object.entries(TILES)) checkGrid(`tile ${k}`, g, 16, 16);
  for (const dir of ['down', 'up', 'left', 'right']) for (const f of ['stand', 'a', 'b']) {
    checkGrid(`hero ${dir} ${f}`, heroGrid(dir, f), 16, 16);
    checkGrid(`hero ${dir} ${f} hat`, heroGrid(dir, f, { hardHat: true, longHair: true }), 16, 16);
  }
  for (const k of Object.keys(HERO)) assert.equal(HERO[k].length + LEGS[k].stand.length, 16);
  checkGrid('sit', HERO_SIT, 16, 16);
  checkGrid('cheer', HERO_CHEER, 16, 16);
  for (const d of ['up', 'down', 'left', 'right']) checkGrid(`car ${d}`, carGrid(d), 16, 16);
  checkGrid('car', CAR, 16, 16);
  for (const [k, g] of Object.entries(ICONS)) checkGrid(`icon ${k}`, g, 8, 8);
  checkGrid('heart', HEART, 7, 7);
});

test('font: letters, digits and the replay punctuation, with wrapping', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?:;\'"-+×−→…()/%—') {
    const g = FONT[ch];
    assert.ok(g, `no glyph for ${ch}`);
    assert.equal(g.rows.length, 9);
    assert.ok(g.rows.every((r) => r.length === g.w && /^[.#]*$/.test(r)));
  }
  assert.equal(glyphFor('é'), FONT.e);
  assert.equal(glyphFor('§'), FONT['?']);
  assert.equal(glyphFor('🚗'), null);
  assert.equal(measureText('I'), 3);
  assert.equal(measureText('II'), 7);
  const lines = wrapText('Weekly production report — combo ×2, underdog. +72', 120);
  assert.ok(lines.length > 1 && lines.every((l) => measureText(l) <= 120));
  assert.ok(measureText(fitText('A very long place name indeed', 60)) <= 60);
});

test('colours: hero slots from settings, shades, and a stable look for people', () => {
  const c = personColors({ hair: '#000000', shirt: 'not a colour' });
  assert.equal(c.H, '#000000');
  assert.equal(c.T, '#2f8f6f');
  assert.equal(shade('#808080', 0.5), '#404040');
  assert.deepEqual(lookFor('Whitney'), lookFor('Whitney'));
});
