// replayDay: the day as the Day Replay tells it (SPEC.md, "Day Replay").

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayDay, WALK_MIN } from '../src/model.js';
import { T, game } from './helpers.mjs';

const DAY = '2026-09-28';

/** Breakfast, a drive, an hour at the desk, a treat. */
function day() {
  const g = game();
  g.task({ id: 't_report', title: 'Report', skill: 'sk_mail', estimate: 60, mana: 2 });
  g.reward({ id: 'rw_cake', title: 'Cake', price: 20 });
  g.energy(`${DAY}T06:30:00`, 8, 8);
  g.moment('kind_meal', `${DAY}T07:00:00`, `${DAY}T07:30:00`);
  g.moment('kind_drive', `${DAY}T07:40:00`, `${DAY}T08:00:00`, { who: 'Whitney' });
  g.done('t_report', `${DAY}T09:00:00`, 60);
  g.buy('rw_cake', `${DAY}T09:10:00`);
  return g;
}

describe('replayDay', () => {
  test('beats: walk when the next thing is elsewhere, otherwise idle', () => {
    const r = replayDay(day().records, DAY, { now: T(`${DAY}T22:00:00`) });
    assert.deepEqual(r.beats.map((b) => b.kind), ['moment', 'walk', 'idle', 'moment', 'walk', 'done', 'idle', 'purchase']);
    const [meal, walk, idle, drive, walk2, report, idle2, cake] = r.beats;
    assert.deepEqual([walk.start, walk.end], [T(`${DAY}T07:30:00`), T(`${DAY}T07:30:00`) + WALK_MIN * 60000]);
    assert.deepEqual([walk.from, walk.to, walk.fromZone, walk.toZone], ['place_kitchen', 'place_car', 'home', 'road']);
    assert.equal(walk.text, '→ Car');
    assert.deepEqual([idle.start, idle.end, idle.place], [T(`${DAY}T07:35:00`), T(`${DAY}T07:40:00`), 'place_car']);
    assert.equal(drive.text, 'Drive with Whitney.');
    assert.equal(walk2.start, walk2.end); // back to back: an instant walk, no idle
    assert.deepEqual([report.place, report.zone, report.placeName, report.points], ['place_desk', 'factory', 'Desk', 60]);
    assert.equal(report.text, 'Report. +60');
    assert.equal(idle2.place, 'place_desk');
    assert.equal(meal.zone, 'home');
    // A purchase happens wherever you already were.
    assert.deepEqual([cake.place, cake.placeName, cake.points], ['place_desk', 'Desk', -20]);
  });
  test('energy and points run through the day', () => {
    const r = replayDay(day().records, DAY);
    assert.equal(r.start.stamina, 8);
    assert.equal(r.start.at, T(`${DAY}T06:30:00`));
    assert.deepEqual(r.series.map((s) => [s.label, s.stamina, s.mana]), [
      ['Morning', 8, 8],
      ['Meal', 9, 8.5],
      ['Drive', 8.8, 8.2],
      ['Report', 8.8, 6.2],
      ['Cake', 8.8, 6.2],
    ]);
    const report = r.beats.find((b) => b.kind === 'done');
    assert.deepEqual(report.after, { stamina: 8.8, mana: 6.2, points: 60 });
    assert.equal(r.beats.at(-1).after.points, 40);
  });
  test('finale: totals, where time went, tomorrow', () => {
    const r = replayDay(day().records, DAY);
    const f = r.finale;
    assert.deepEqual([f.points, f.spent, f.tasks, f.moments, f.reworks], [60, 20, 1, 2, 0]);
    assert.deepEqual(f.zones, [{ zone: 'home', minutes: 30 }, { zone: 'road', minutes: 20 }, { zone: 'factory', minutes: 60 }]);
    assert.equal(f.travel, 5);
    assert.equal(f.idle, 15);
    assert.equal(f.balance, 40);
    assert.equal(f.level, 1);
    assert.equal(f.bestCombo, 1);
    assert.equal(f.bestBatch, 0);
    assert.equal(f.tomorrow.task, 't_report');
  });
  test('the finale is the day as it ended, even when replayed later', () => {
    const g = day();
    g.done('t_report', '2026-09-29T09:00:00', 600);
    g.task({ id: 't_later', title: 'Later', skill: 'sk_read', created: '2026-09-29' });
    const f = replayDay(g.records, DAY).finale;
    assert.equal(f.balance, 40);
    assert.equal(f.level, 1);
  });
  test('rework on the day is a beat that costs points', () => {
    const g = day();
    const d = g.records.find((r) => r.type === 'done');
    g.rework(d, `${DAY}T11:00:00`, 30);
    const r = replayDay(g.records, DAY);
    const rw = r.beats.find((b) => b.kind === 'rework');
    assert.equal(rw.start, T(`${DAY}T10:30:00`));
    assert.equal(rw.place, 'place_desk');
    assert.equal(rw.points, -50); // penalty 45; 40 covered, 5 below zero doubled
    assert.match(rw.text, /Rework on Report from 2026-09-28\. −50 \(×1\.5\)/);
    assert.equal(r.finale.reworks, 1);
    assert.equal(r.finale.spent, 70);
    assert.equal(r.finale.balance, -10);
  });
  test('combo and batch tags', () => {
    const g = game();
    g.task({ id: 't_pr', title: 'PR', skill: 'sk_mail', estimate: 10, batch: 'pr' });
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    g.done('t_mail', `${DAY}T09:10:00`, 10);
    g.done('t_mail', `${DAY}T09:20:00`, 10);
    g.done('t_pr', `${DAY}T09:30:00`, 10);
    g.done('t_pr', `${DAY}T09:40:00`, 10);
    const r = replayDay(g.records, DAY);
    const tags = r.beats.filter((b) => b.kind === 'done').map((b) => b.tags);
    assert.deepEqual(tags, [[], ['combo ×2'], ['combo ×3'], ['batch ×2']]);
    assert.equal(r.finale.bestCombo, 4);
    assert.equal(r.finale.bestBatch, 2);
  });
  test('an unrated day starts full, and what ended before the rating is not counted twice', () => {
    const g = game();
    g.task({ id: 't_lift', title: 'Lift', skill: 'sk_run', stamina: 2 });
    g.done('t_lift', `${DAY}T09:00:00`, 30);
    let r = replayDay(g.records, DAY);
    assert.equal(r.start, null);
    assert.deepEqual(r.series[0], { at: T(`${DAY}T08:30:00`), stamina: 10, mana: 10, label: 'Start' });
    assert.equal(r.series[1].stamina, 8);
    g.energy(`${DAY}T10:00:00`, 6, 6);
    r = replayDay(g.records, DAY);
    assert.equal(r.series[1].stamina, 6);
  });
  test('an empty day', () => {
    const r = replayDay(game().records, DAY, { now: T(`${DAY}T20:00:00`) });
    assert.deepEqual(r.beats, []);
    assert.deepEqual(r.series, [{ at: T(`${DAY}T20:00:00`), stamina: 10, mana: 10, label: 'Start' }]);
    assert.deepEqual([r.finale.points, r.finale.tasks, r.finale.zones, r.finale.tomorrow], [0, 0, [], null]);
  });
});
