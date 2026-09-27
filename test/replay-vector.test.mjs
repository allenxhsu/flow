// The Day Replay, restyled as vector art (SPEC.md › "Art direction"). These
// pin what must not change — mountReplay's API and return shape, schedule()
// timings on the sample day, where the places are — and the pure helpers of
// the vector layer: colours, the HUD layout, the orbs, text wrapping, the
// camera, the finale charts and the scene at a moment of the timeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as Replay from '../src/replay/index.js';
import { schedule, TIMING } from '../src/replay/schedule.js';
import { resolvePlaces } from '../src/replay/plan.js';
import { buildWorld, findPath, spotOfBuilding, BUILDINGS, MAP_W, MAP_H, TILE } from '../src/replay/world.js';
import { sampleReplay } from '../src/replay/sample.js';
import { parseHex, shade, mix, rgba, heroColors, lookFor, outfitColors, HERO_DEFAULT, PYJAMAS } from '../src/replay/look.js';
import { viewFor, orbLevel, liquidSurface, wrapLines, fitLine, cameraFor, screenToWorld, worldToScreen, energyChart, timeRows, WORLD_TILE } from '../src/replay/layout.js';
import { sceneAt } from '../src/replay/scene.js';
import { planReplay } from '../src/replay/plan.js';
import { fakeBrowser, contextsOf } from './fake-dom.mjs';

const sample = sampleReplay();
const timeline = schedule(sample);
const world = buildWorld();
const plan = planReplay(sample, timeline, world);
const ctx = { replay: sample, timeline, plan, world };
const segWhere = (pred) => timeline.segments.find(pred);
const mid = (seg) => (seg.t0 + seg.t1) / 2;

// ─── what must not change ───────────────────────────────────────────────────

test('pinned: schedule() timings on the sample day', () => {
  const code = timeline.segments.map((s) => (s.type === 'beat' ? s.beat.kind[0] : s.type[0]) + s.dur).join(' ');
  assert.equal(code, 'i2.5 m3 w2 i0.5 m3 w2 m3 i0.5 d3 i0.5 m3 w1 d3 i0.5 d3 i0.5 d3 i0.5 d3 i0.5 d3 i0.5 r3.6 w1 i0.5 d3 w2 i0.5 m3 w2 i0.5 d3 w1 i0.5 d3 w2 i0.5 m3 w2 i0.5 m3 w1 i0.5 m3 i0.5 p3 w1 i0.5 m3 f6 f6 f6 f6');
  assert.equal(timeline.dayEnd, 88.6);
  assert.equal(timeline.total, 112.6);
  assert.equal(timeline.segments.length, 53);
  assert.deepEqual(TIMING, { intro: 2.5, event: 3, eventLong: 3.6, walkNear: 1, walkFar: 2, idle: 0.5, finale: 6, maxDay: 110, minEvent: 1.8, minWalk: 0.6, minIdle: 0.25 });
});

test('pinned: every sample place has a spot on the map, reachable from home', () => {
  const places = resolvePlaces(sample);
  const home = spotOfBuilding(BUILDINGS[0]);
  const want = { Kitchen: 'place_kitchen', 'Factory floor': 'place_floor', Desk: 'place_desk', 'Meeting room': 'place_meeting', Restaurant: 'place_restaurant', Warehouse: 'place_warehouse', Laundry: 'place_laundry', Bedroom: 'place_bedroom' };
  for (const b of sample.beats.filter((x) => x.kind !== 'walk' && x.kind !== 'idle')) {
    const p = places.get(b.place ?? null);
    assert.ok(p, `no place for ${b.placeName}`);
    if (p.car) continue;
    assert.equal(p.building?.id, want[b.placeName], b.placeName);
    assert.ok(findPath(world, home, p.spot), `${b.placeName} is unreachable`);
  }
});

test('pinned: the replay module exports', () => {
  for (const k of ['mountReplay', 'schedule', 'segmentAt', 'heartsFor', 'outfitFor', 'bannersFor', 'energyMarks', 'eventsByPlace', 'planReplay', 'resolvePlaces', 'buildWorld', 'isEvent']) {
    assert.equal(typeof Replay[k], 'function', k);
  }
  assert.equal(typeof Replay.TIMING, 'object');
});

function mount(opts = {}, { width = 820, dpr = 1 } = {}) {
  const b = fakeBrowser({ width, dpr });
  const el = b.element();
  el.clientWidth = width;
  const api = Replay.mountReplay(el, sampleReplay(), opts);
  return { ...b, el, api, root: el.children[0] };
}

test('mountReplay: the API surface and its return shape', () => {
  const { api, el, root, tick } = mount();
  for (const k of ['play', 'pause', 'seek', 'setSpeed', 'skip', 'destroy']) assert.equal(typeof api[k], 'function', k);
  assert.deepEqual(api.timeline, timeline, 'timeline is schedule(replay)');
  assert.equal(api.time, 0);
  assert.equal(api.playing, false);
  assert.ok(root && root.className === 'flow-replay');
  // The controls and the place panel are there; sound starts off.
  for (const act of ['play', 'speed', 'skip', 'sound']) assert.match(root.innerHTML, new RegExp(`data-act="${act}"`));
  assert.match(root.innerHTML, /class="fr-scrub"/);
  assert.match(root.innerHTML, /class="fr-place" hidden/);
  assert.match(root.innerHTML, /data-act="sound" aria-pressed="false"/);
  api.play();
  assert.equal(api.playing, true);
  tick(10, 100);
  assert.ok(api.time > 0.5 && api.time < 1.5, `played to ${api.time}`);
  api.setSpeed(2);
  const t0 = api.time;
  tick(5, 100);
  assert.ok(Math.abs(api.time - t0 - 1) < 0.25, 'twice as fast');
  api.pause();
  assert.equal(api.playing, false);
  api.seek(-4); assert.equal(api.time, 0);
  api.seek(1e6); assert.equal(api.time, timeline.total);
  api.seek(20.25); assert.equal(api.time, 20.25);
  api.skip();
  assert.equal(api.time, timeline.dayEnd);
  assert.equal(api.playing, true);
  api.destroy();
  assert.equal(el.children.length, 0, 'destroy removes the replay');
});

test('mountReplay: sound off by default, on when asked', () => {
  const on = mount({ sound: true });
  assert.match(on.root.innerHTML, /data-act="sound" aria-pressed="true"/);
  on.api.destroy();
});

for (const [width, dpr] of [[820, 1], [390, 3]]) {
  test(`mountReplay at ${width}px: every moment of the day draws as vector art, without errors`, () => {
    const { api, root, tick } = mount({}, { width, dpr });
    const canvas = root.querySelector('canvas');
    const cssW = parseFloat(canvas.style.width);
    assert.ok(cssW > 0 && cssW <= width, `canvas is ${canvas.style.width} wide in ${width}px`);
    assert.ok(canvas.width >= cssW * dpr * 0.99, 'the backing store is sharp at the device pixel ratio');
    const g = canvas.getContext('2d');
    for (let t = 0; t <= api.timeline.total; t += 0.2) { api.seek(t); tick(1); }
    const log = g.__log;
    assert.notEqual(g.imageSmoothingEnabled, false, 'no pixelated scaling');
    assert.ok(log.gradients > 0, 'lit with gradients');
    assert.ok((log.calls.get('bezierCurveTo') || 0) + (log.calls.get('quadraticCurveTo') || 0) > 0, 'drawn with curves');
    assert.ok(log.calls.get('arc') > 0);
    const text = log.text.join('\n');
    assert.match(text, /Whitney/, 'the named person speaks');
    assert.match(text, /BATCH ×4/i, 'the batch banner');
    assert.match(text, /Line safety check/, 'the text box');
    for (const title of [/Day complete/i, /Energy/i, /Where time went/i, /Tomorrow/i]) assert.match(text, title);
    assert.ok(contextsOf(root).length >= 1);
    api.destroy();
  });
}

// ─── look.js: colours ───────────────────────────────────────────────────────

test('look: hex parsing, shades, mixes and rgba', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.equal(parseHex('nope'), null);
  assert.equal(shade('#808080', 0.5), '#404040');
  assert.equal(shade('#000000', 2), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(rgba('#ff0000', 0.5), 'rgba(255,0,0,0.5)');
  assert.equal(rgba('bad', 0.5), 'rgba(0,0,0,0.5)');
});

test('look: hero colours come from settings, bad values fall back', () => {
  const c = heroColors({ hair: '#000000', shirt: 'not a colour' });
  assert.equal(c.hair, '#000000');
  assert.equal(c.shirt, HERO_DEFAULT.shirt);
  for (const k of ['hair', 'skin', 'shirt', 'trousers', 'shoes']) assert.ok(parseHex(c[k]), k);
  assert.deepEqual(heroColors(null), heroColors({}));
  assert.deepEqual(lookFor('Whitney'), lookFor('Whitney'));
  assert.notDeepEqual(lookFor('Whitney'), lookFor('Bartholomew'));
  const pj = outfitColors(heroColors(sample.hero), { pyjamas: true });
  assert.equal(pj.shirt, PYJAMAS.shirt);
  assert.equal(pj.trousers, PYJAMAS.trousers);
  assert.equal(outfitColors(heroColors(sample.hero), {}).shirt, heroColors(sample.hero).shirt);
});

// ─── layout.js ──────────────────────────────────────────────────────────────

const inside = (r, v) => r.x >= 0 && r.y >= 0 && r.x + r.w <= v.w + 1e-9 && r.y + r.h <= v.h + 1e-9;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const circleHitsRect = (c, r) => {
  const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
  return Math.hypot(c.cx - nx, c.cy - ny) < c.r;
};

test('layout: a wide view for laptops, a compact one at 390px', () => {
  assert.equal(viewFor(820).compact, false);
  assert.equal(viewFor(390).compact, true);
  assert.equal(viewFor(0).compact, true);
  assert.ok(viewFor(820).w > viewFor(820).h, 'wide is landscape');
  assert.equal(WORLD_TILE, viewFor(820).tile);
});

for (const width of [820, 390]) {
  test(`layout at ${width}px: the HUD and the text box fit and do not collide`, () => {
    const v = viewFor(width);
    const { hud, box, banner } = v;
    for (const r of [hud.belt, hud.gems, hud.clock, box, ...hud.slots.map((s) => ({ x: s.x, y: s.y, w: s.s, h: s.s }))]) assert.ok(inside(r, v), JSON.stringify(r));
    for (const o of [hud.stamina, hud.mana]) {
      assert.ok(o.cx - o.r >= 0 && o.cx + o.r <= v.w && o.cy + o.r <= v.h + 1e-9, 'orb on screen');
      assert.ok(!circleHitsRect(o, box), 'text box clear of the orb');
      assert.ok(!circleHitsRect(o, hud.gems), 'gem counter clear of the orb');
      for (const s of hud.slots) assert.ok(!circleHitsRect(o, { x: s.x, y: s.y, w: s.s, h: s.s }), 'slot clear of the orb');
    }
    assert.ok(hud.stamina.cx < hud.mana.cx, 'stamina on the left, mana on the right');
    assert.ok(box.y + box.h <= hud.belt.y, 'text box above the belt');
    assert.ok(box.w >= v.w * 0.6, 'text box is wide enough to read');
    const bits = [hud.gems, hud.clock, ...hud.slots.map((s) => ({ x: s.x, y: s.y, w: s.s, h: s.s }))];
    for (let i = 0; i < bits.length; i++) for (let j = i + 1; j < bits.length; j++) assert.ok(!overlaps(bits[i], bits[j]), `HUD parts ${i} and ${j} overlap`);
    assert.equal(hud.slots.length, 2);
    assert.ok(banner.y > 0 && banner.y < v.h / 3 && banner.cx === v.w / 2);
  });
}

test('orbs: level and the liquid surface', () => {
  assert.equal(orbLevel(5), 0.5);
  assert.equal(orbLevel(12), 1);
  assert.equal(orbLevel(-1), 0);
  assert.equal(orbLevel(NaN), 0);
  assert.equal(orbLevel(3, 6), 0.5);
  assert.deepEqual(liquidSurface(0, 40), { y: 40, half: 0 });
  assert.deepEqual(liquidSurface(1, 40), { y: -40, half: 0 });
  assert.deepEqual(liquidSurface(0.5, 40), { y: 0, half: 40 });
  const s = liquidSurface(0.25, 40);
  assert.equal(s.y, 20);
  assert.ok(Math.abs(s.half - Math.sqrt(1600 - 400)) < 1e-9);
});

test('text: wrap to a width, never mid-word unless a word is too long; ellipsis when cut', () => {
  const m = (s) => Array.from(s).length * 10;
  assert.deepEqual(wrapLines('Weekly production report. +72', 120, m), ['Weekly', 'production', 'report. +72']);
  assert.deepEqual(wrapLines('', 100, m), []);
  assert.deepEqual(wrapLines('a b c', 1000, m), ['a b c']);
  const long = wrapLines('Supercalifragilistic', 80, m);
  assert.ok(long.length > 1 && long.every((l) => m(l) <= 80));
  const cut = wrapLines('one two three four five six seven', 90, m, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…') && m(cut[1]) <= 90);
  assert.equal(fitLine('short', 100, m), 'short');
  const f = fitLine('A very long place name indeed', 100, m);
  assert.ok(f.endsWith('…') && m(f) <= 100);
});

test('camera: centres on the focus, clamped to the world; taps map back to world tiles', () => {
  for (const width of [820, 390]) {
    const v = viewFor(width);
    const worldW = MAP_W * v.tile;
    const worldH = MAP_H * v.tile;
    const c = cameraFor({ x: 20, y: 14 }, v);
    assert.ok(Math.abs(c.x + v.w / 2 - (20.5 * v.tile)) < 1, 'centred across');
    assert.deepEqual(cameraFor({ x: 0, y: 0 }, v), { x: 0, y: 0 });
    const far = cameraFor({ x: MAP_W, y: MAP_H }, v);
    assert.equal(far.x, worldW - v.w);
    assert.ok(far.y > 0 && far.y <= worldH - v.h + v.hud.belt.h);
    const w = screenToWorld(100, 80, c, v);
    assert.ok(Math.abs(w.x - ((100 + c.x) / v.tile) * TILE) < 1e-9);
    const back = worldToScreen(w.x, w.y, c, v);
    assert.ok(Math.abs(back.x - 100) < 1e-9 && Math.abs(back.y - 80) < 1e-9);
  }
});

test('finale: the energy chart fits its rect, runs left to right, 10 at the top', () => {
  const rect = { x: 40, y: 60, w: 300, h: 120 };
  const ch = energyChart(sample.series, rect);
  for (const key of ['stamina', 'mana']) {
    const pts = ch[key];
    assert.equal(pts.length, sample.series.length);
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      assert.ok(x >= rect.x - 1e-9 && x <= rect.x + rect.w + 1e-9 && y >= rect.y - 1e-9 && y <= rect.y + rect.h + 1e-9);
      if (i) assert.ok(x >= pts[i - 1][0]);
    }
  }
  const flat = energyChart([{ at: 0, stamina: 10, mana: 0 }, { at: 1000, stamina: 10, mana: 0 }], rect);
  assert.equal(flat.stamina[0][1], rect.y);
  assert.equal(flat.mana[0][1], rect.y + rect.h);
  assert.equal(energyChart([], rect), null);
});

test('finale: where time went, as rows that share the day', () => {
  const rows = timeRows(sample.finale);
  assert.ok(rows.length >= 3);
  assert.ok(rows.every((r) => r.minutes > 0 && typeof r.label === 'string'));
  assert.ok(Math.abs(rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  assert.ok(rows.some((r) => r.label === 'The Factory'));
  assert.deepEqual(timeRows({}), []);
});

// ─── scene.js: what is on screen at a moment ────────────────────────────────

test('scene: the intro has the hero at home and no text box', () => {
  const s = sceneAt(ctx, 0.5);
  assert.equal(s.type, 'intro');
  assert.equal(s.text, null);
  assert.ok(s.hero && Number.isFinite(s.hero.x));
  assert.deepEqual(Object.keys(s.hud).sort(), ['mana', 'points', 'stamina']);
});

test('scene: a chat with a named person puts them on screen, facing the hero, with a name plate', () => {
  const seg = segWhere((x) => x.beat?.who === 'Whitney');
  const s = sceneAt(ctx, mid(seg));
  assert.equal(s.npc.name, 'Whitney');
  assert.deepEqual(s.npc.look, lookFor('Whitney'));
  assert.equal(s.text.who, 'Whitney');
  assert.match(s.text.head, /Factory floor/);
  const toward = s.npc.x > s.hero.x ? 'right' : s.npc.x < s.hero.x ? 'left' : 'down';
  assert.equal(s.hero.dir, toward);
  assert.equal(s.effect?.kind, 'chat');
});

test('scene: a hard hat on the factory floor, pyjamas and night at bedtime', () => {
  const floor = segWhere((x) => x.beat?.kind === 'done' && x.beat.place === 'place_floor');
  assert.equal(sceneAt(ctx, mid(floor)).hero.outfit.hardHat, true);
  const desk = segWhere((x) => x.beat?.kind === 'done' && x.beat.place === 'place_desk');
  assert.equal(sceneAt(ctx, mid(desk)).hero.outfit.hardHat, false);
  assert.equal(sceneAt(ctx, mid(desk)).night, 0);
  const rest = segWhere((x) => x.beat?.kind === 'moment' && x.beat.place === 'place_bedroom');
  const s = sceneAt(ctx, mid(rest));
  assert.equal(s.hero.outfit.pyjamas, true);
  assert.ok(s.night >= 0.4, `night ${s.night}`);
  assert.equal(s.hero.pose, 'sit');
});

test('scene: walking strides along the path; driving hides the hero in a moving car', () => {
  const walk = segWhere((x) => x.beat?.kind === 'walk' && x.beat.fromZone === x.beat.toZone && x.t0 > 20);
  const a = sceneAt(ctx, walk.t0 + walk.dur * 0.25);
  const b = sceneAt(ctx, walk.t0 + walk.dur * 0.75);
  assert.equal(a.hero.pose, 'walk');
  assert.ok(a.hero.x !== b.hero.x || a.hero.y !== b.hero.y, 'the hero moves');
  const drive = timeline.segments.findIndex((x, i) => plan[i].drive);
  const seg = timeline.segments[drive];
  const d1 = sceneAt(ctx, seg.t0 + seg.dur * 0.2);
  const d2 = sceneAt(ctx, seg.t0 + seg.dur * 0.8);
  assert.equal(d1.hero, null, 'the hero is in the car');
  assert.equal(d1.car.driving, true);
  assert.ok(d1.car.x !== d2.car.x || d1.car.y !== d2.car.y, 'the car moves');
  assert.deepEqual(d1.focus, { x: d1.car.x, y: d1.car.y });
});

test('scene: a batch raises its banner; the gem counter counts up to the beat’s total', () => {
  const seg = segWhere((x) => (x.beat?.tags || []).includes('batch ×4'));
  const s = sceneAt(ctx, seg.t0 + 0.3);
  assert.ok(s.banners.some((bn) => bn.text === 'BATCH ×4' && bn.tone === 'gold'));
  assert.equal(s.effect.kind, 'gems');
  const prev = timeline.segments[timeline.segments.indexOf(seg) - 1].hud.points;
  assert.ok(s.hud.points >= Math.min(prev, seg.hud.points) && s.hud.points <= Math.max(prev, seg.hud.points));
  assert.equal(sceneAt(ctx, seg.t1 - 0.01).hud.points, seg.hud.points);
  assert.equal(sceneAt(ctx, seg.t1 - 0.01).banners.length, 0, 'banners clear before the next beat');
  const text = sceneAt(ctx, seg.t1 - 0.01).text;
  assert.equal(text.reveal, Array.from(text.body).length, 'the text box has typed it all out');
  assert.equal(sceneAt(ctx, seg.t0).text.reveal, 0);
});

test('scene: entering a zone names it', () => {
  const seg = segWhere((x) => x.enterZone === 'factory');
  const s = sceneAt(ctx, seg.t0 + 0.2);
  assert.ok(s.banners.some((bn) => bn.tone === 'zone' && bn.text === 'The Factory'));
});

test('scene: the finale screens in order, with no map', () => {
  const names = [];
  for (let k = 0; k < 4; k++) {
    const s = sceneAt(ctx, timeline.dayEnd + k * TIMING.finale + 1);
    assert.equal(s.type, 'finale');
    names.push(s.screen);
  }
  assert.deepEqual(names, ['totals', 'energy', 'time', 'tomorrow']);
});

test('scene: pure — the same moment gives the same scene', () => {
  for (const t of [0, 13.37, 50, 88.6, 100]) assert.deepEqual(sceneAt(ctx, t), sceneAt(ctx, t));
});
