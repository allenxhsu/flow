// Acceptance: SPEC.md › iOS app (decided 2026-09-28), the parts the rules own.
//
// - Arrive / leave places: a `visit` event { place, arrive, leave }, write-once,
//   holding place ids only — never coordinates.
// - Leaving one geofenced place and arriving at another within 3 hours writes
//   a Drive moment for the time between, skipped when a moment already covers
//   it; the same inputs always give the same record (two devices, a re-sent
//   event), so it is written once.
// - The replay uses visits to put the hero in the right place.
// - Apple Health: a suggested morning rating from last night's sleep and
//   yesterday's steps (≥ 7.5 h → 8, ≥ 6.5 h → 6, less → 4; +1 at ≥ 8 000
//   steps; max 10); no data, no suggestion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const at = (hhmm, day = D) => T(`${day}T${hhmm}:00`);
const visit = (g, place, arrive, leave) => g.add(M.makeVisit(g.db(), { place, arrive: arrive == null ? null : at(arrive), leave: at(leave) }));

// ─── the visit event ────────────────────────────────────────────────────────

test('visit is a write-once event type, listed with the events', () => {
  assert.ok(M.RECORD_TYPES.includes('visit'));
  assert.ok(M.RECORD_TYPES.indexOf('visit') > M.RECORD_TYPES.indexOf('done'), 'after the definitions');
});

test('makeVisit → { type: "visit", place, arrive, leave, day } with an id of its own type', () => {
  const g = game();
  const v = M.makeVisit(g.db(), { place: 'place_gym', arrive: at('17:00'), leave: at('18:10') });
  assert.equal(v.type, 'visit');
  assert.match(v.id, /^visit_/);
  assert.equal(v.place, 'place_gym');
  assert.equal(v.arrive, at('17:00'));
  assert.equal(v.leave, at('18:10'));
  assert.equal(v.day, D);
});

test('a visit holds place ids and times only: coordinates offered with it are not kept', () => {
  const g = game();
  const v = M.makeVisit(g.db(), { place: 'place_gym', arrive: at('17:00'), leave: at('18:00'), latitude: 1.5, longitude: 2.5, radius: 100 });
  assert.deepEqual(Object.keys(v).sort(), ['arrive', 'day', 'id', 'leave', 'place', 'type']);
  assert.doesNotMatch(JSON.stringify(v), /1\.5|2\.5|latitude|longitude|radius/);
});

test('a visit is written when the stay ends; the arrival may be unknown (monitoring began inside)', () => {
  const g = game();
  const v = M.makeVisit(g.db(), { place: 'place_desk', arrive: null, leave: at('12:00') });
  assert.equal(v.arrive, null);
  assert.equal(v.day, D);
  assert.throws(() => M.makeVisit(g.db(), { place: 'place_desk', arrive: at('09:00') }), /leave/);
});

test('makeVisit refuses an unknown place and a stay that ends before it starts', () => {
  const g = game();
  assert.throws(() => M.makeVisit(g.db(), { place: 'place_moon', arrive: at('09:00'), leave: at('10:00') }), /place/);
  assert.throws(() => M.makeVisit(g.db(), { place: 'place_gym', arrive: at('10:00'), leave: at('09:00') }));
});

test('the same stay reported twice is the same record (a re-sent event is not a second visit)', () => {
  const g = game();
  const a = M.makeVisit(g.db(), { place: 'place_gym', arrive: at('17:00'), leave: at('18:00') });
  const b = M.makeVisit(g.db(), { place: 'place_gym', arrive: at('17:00'), leave: at('18:00') });
  assert.equal(a.id, b.id);
});

test('visits are indexed in time order and move no points or energy', () => {
  const g = game();
  g.add(M.makeEnergy({ stamina: 6, mana: 6, at: at('06:30') }));
  visit(g, 'place_gym', '17:00', '18:00');
  visit(g, 'place_desk', '08:00', '12:00');
  const db = g.db();
  assert.deepEqual(db.visits.map((v) => v.place), ['place_desk', 'place_gym']);
  assert.equal(M.balanceOf(db), 0);
  const e = M.energyOn(db, D);
  assert.equal(e.stamina, 6);
  assert.equal(e.mana, 6);
});

// ─── the automatic Drive moment ─────────────────────────────────────────────

test('leave A, arrive B within 3 h → a Drive moment for the time between', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:30');
  const m = M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') });
  assert.ok(m, 'a Drive moment');
  assert.equal(m.type, 'moment');
  assert.equal(m.kind, 'kind_drive');
  assert.equal(m.title, 'Drive');
  assert.equal(m.start, at('07:30'));
  assert.equal(m.end, at('08:10'));
  assert.equal(m.place, 'place_car');
  assert.equal(m.day, D);
  const drive = M.DEFAULT_KINDS.find((k) => k.id === 'kind_drive');
  assert.equal(m.energy.mana, Math.round(drive.manaPerHour * (40 / 60) * 10) / 10, 'energy by the hour like any moment');
});

test('the arrival can be a finished visit at B as well as an arrival still open', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:30');
  const open = M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') });
  const b = M.makeVisit(g.db(), { place: 'place_desk', arrive: at('08:10'), leave: at('12:00') });
  const closed = M.autoDrive(g.db(), b);
  assert.deepEqual(closed, open, 'same record either way');
});

test('exactly 3 h counts; longer is not a drive', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:00');
  assert.ok(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('10:00') }), '3 h');
  assert.equal(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('10:01') }), null, '3 h 1 min');
});

test('coming back to the same place is not a drive', () => {
  const g = game();
  visit(g, 'place_gym', '17:00', '17:20');
  assert.equal(M.autoDrive(g.db(), { place: 'place_gym', arrive: at('17:40') }), null);
});

test('no earlier departure → no drive', () => {
  const g = game();
  assert.equal(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') }), null);
  visit(g, 'place_gym', '17:00', '18:00');
  assert.equal(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') }), null, 'only a departure before the arrival counts');
});

test('the latest departure before the arrival is the one that counts', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:00');
  visit(g, 'place_gym', '07:20', '08:00');
  const m = M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:30') });
  assert.equal(m.start, at('08:00'));
  assert.equal(m.end, at('08:30'));
});

test('skipped when a moment already covers the gap (logged by hand, or any moment inside it)', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:30');
  g.moment('kind_drive', `${D}T07:35:00`, `${D}T08:05:00`);
  assert.equal(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') }), null);
  const h = game();
  visit(h, 'place_bedroom', null, '07:30');
  h.moment('kind_meal', `${D}T07:00:00`, `${D}T07:45:00`); // breakfast ran into the drive
  assert.equal(M.autoDrive(h.db(), { place: 'place_desk', arrive: at('08:10') }), null);
});

test('a moment that ends before the gap or starts after it does not cover it', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:30');
  g.moment('kind_meal', `${D}T07:00:00`, `${D}T07:30:00`);
  g.moment('kind_chat', `${D}T08:10:00`, `${D}T08:30:00`);
  assert.ok(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') }));
});

test('idempotent: the same departure and arrival give the same id, and once written nothing new', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:30');
  const a = M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') });
  const b = M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') });
  assert.equal(a.id, b.id);
  assert.match(a.id, /^moment_/);
  g.add(a);
  assert.equal(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') }), null);
  const other = game();
  visit(other, 'place_bedroom', null, '07:30');
  assert.equal(M.autoDrive(other.db(), { place: 'place_desk', arrive: at('08:10') }).id, a.id, 'another device writes the same id');
});

test('the drive earns no points', () => {
  const g = game();
  visit(g, 'place_bedroom', null, '07:30');
  g.add(M.autoDrive(g.db(), { place: 'place_desk', arrive: at('08:10') }));
  assert.equal(M.balanceOf(g.db()), 0);
});

// ─── the replay ─────────────────────────────────────────────────────────────

test('the replay puts what has no place of its own where the player was', () => {
  const g = game();
  const read = g.task({ title: 'Read a chapter', skill: 'sk_read', estimate: 20 }); // sk_read has no place
  visit(g, 'place_friends', '19:00', '21:00');
  g.done(read, `${D}T20:00:00`, 20);
  g.buy(g.reward({ title: 'Cake', price: 5 }), `${D}T20:30:00`);
  const r = M.replayDay(g.records, D, { now: at('22:00') });
  assert.equal(r.beats.find((b) => b.kind === 'done').place, 'place_friends');
  assert.equal(r.beats.find((b) => b.kind === 'purchase').place, 'place_friends');
});

test('the replay keeps a task’s own place over a visit', () => {
  const g = game();
  const run = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 }); // sk_run is at the gym
  visit(g, 'place_friends', '19:00', '21:00');
  g.done(run, `${D}T20:00:00`, 30);
  const r = M.replayDay(g.records, D, { now: at('22:00') });
  assert.equal(r.beats.find((b) => b.kind === 'done').place, 'place_gym');
});

// ─── Apple Health: the suggested morning rating ─────────────────────────────

test('suggestRating: sleep sets it (≥ 7.5 h → 8, ≥ 6.5 h → 6, less → 4)', () => {
  assert.equal(M.suggestRating({ sleepHours: 8.2, steps: 0 }), 8);
  assert.equal(M.suggestRating({ sleepHours: 7.5, steps: 0 }), 8);
  assert.equal(M.suggestRating({ sleepHours: 7.49, steps: 0 }), 6);
  assert.equal(M.suggestRating({ sleepHours: 6.5, steps: 0 }), 6);
  assert.equal(M.suggestRating({ sleepHours: 6.4, steps: 0 }), 4);
  assert.equal(M.suggestRating({ sleepHours: 0, steps: 0 }), 4);
});

test('suggestRating: +1 when yesterday had ≥ 8 000 steps', () => {
  assert.equal(M.suggestRating({ sleepHours: 8, steps: 8000 }), 9);
  assert.equal(M.suggestRating({ sleepHours: 8, steps: 7999 }), 8);
  assert.equal(M.suggestRating({ sleepHours: 7, steps: 12000 }), 7);
  assert.equal(M.suggestRating({ sleepHours: 5, steps: 20000 }), 5);
});

test('suggestRating: never above 10', () => {
  for (const s of [7.5, 9, 12, 24]) for (const steps of [0, 8000, 50000]) assert.ok(M.suggestRating({ sleepHours: s, steps }) <= 10);
});

test('suggestRating: no sleep data → no suggestion; no step data → no step bonus', () => {
  assert.equal(M.suggestRating(null), null);
  assert.equal(M.suggestRating(undefined), null);
  assert.equal(M.suggestRating({}), null);
  assert.equal(M.suggestRating({ sleepHours: null, steps: 9000 }), null);
  assert.equal(M.suggestRating({ steps: 9000 }), null);
  assert.equal(M.suggestRating({ sleepHours: Number.NaN, steps: 9000 }), null);
  assert.equal(M.suggestRating({ sleepHours: 8 }), 8);
  assert.equal(M.suggestRating({ sleepHours: 8, steps: null }), 8);
});
