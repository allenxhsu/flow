import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtMin, fmtPts, fmtClock, elapsedMinutes, batchEnds, purchasePreview, taskFields, materialize, chartGeometry, nearestPoint, validTimer, readJson, writeJson } from '../src/util.js';
import { index, makeSkill, makeTask, makeDone, DEFAULT_STATS } from '../src/model.js';

test('esc escapes html and attributes', () => {
  assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
});

test('formatting', () => {
  assert.equal(fmtMin(25), '25m');
  assert.equal(fmtMin(65), '1h 05m');
  assert.equal(fmtPts(1234), '1,234');
  assert.equal(fmtPts(-5), '−5');
  assert.equal(fmtPts(5, { sign: true }), '+5');
  assert.equal(fmtClock(65_000), '01:05');
  assert.equal(fmtClock(3_725_000), '1:02:05');
});

test('elapsedMinutes rounds and never goes below one', () => {
  assert.equal(elapsedMinutes(0, 10_000), 1);
  assert.equal(elapsedMinutes(0, 25 * 60000 + 20_000), 25);
});

test('batchEnds lays a batch end to end, finishing now', () => {
  const now = 10 * 3600000;
  assert.deepEqual(batchEnds([10, 20, 5], now), [now - 25 * 60000, now - 5 * 60000, now]);
});

test('a batch logged with batchEnds earns climbing batch bonuses', () => {
  let recs = [];
  let db = index(recs);
  const skill = makeSkill(db, { name: 'Purchasing', stat: DEFAULT_STATS[3].id });
  recs.push(skill); db = index(recs);
  const tasks = ['a', 'b', 'c'].map((t) => makeTask(db, { title: t, skill: skill.id, batch: 'PR', estimate: 10 }));
  recs.push(...tasks); db = index(recs);
  const ends = batchEnds([10, 10, 10], Date.UTC(2026, 8, 27, 12));
  const out = tasks.map((t, i) => { const d = makeDone(db, t.id, { end: ends[i], minutes: 10 }); recs.push(d); db = index(recs); return d; });
  assert.deepEqual(out.map((d) => d.batchIndex), [0, 1, 2]);
  assert.deepEqual(out.map((d) => d.price.bonuses.batch), [0, 0.15, 0.3]);
});

test('purchasePreview doubles the part below zero', () => {
  assert.deepEqual(purchasePreview(100, 60), { charged: 60, below: 0, after: 40, intoDebt: false, extra: 0 });
  assert.deepEqual(purchasePreview(40, 60), { charged: 80, below: 20, after: -40, intoDebt: true, extra: 20 });
  assert.deepEqual(purchasePreview(-10, 30), { charged: 60, below: 30, after: -70, intoDebt: true, extra: 30 });
});

test('taskFields normalises form strings', () => {
  const f = taskFields({ title: ' Email ', skill: 's', measure: 'count', unit: 'mails', cadence: 'daily', estimate: '15', stamina: '', mana: '-1', deadline: '', place: '', batch: ' ', critical: 'on' });
  assert.equal(f.title, 'Email');
  assert.equal(f.estimate, 15);
  assert.equal(f.stamina, 0);
  assert.equal(f.mana, -1);
  assert.equal(f.deadline, null);
  assert.equal(f.batch, null);
  assert.equal(f.critical, true);
  assert.equal(f.forOthers, false);
});

test('materialize writes the defaults only while none exist', () => {
  const stats = materialize('stat', []);
  assert.equal(stats.length, DEFAULT_STATS.length);
  assert.ok(stats.every((s, i) => s.type === 'stat' && s.order === i));
  assert.deepEqual(materialize('stat', [{ type: 'stat', id: 'x' }]), []);
  assert.equal(materialize('place', []).length > 0, true);
  assert.equal(materialize('kind', [])[0].type, 'kind');
});

test('chartGeometry maps 0–10 onto the plot and spaces reviews evenly', () => {
  const g = chartGeometry([{ satisfaction: 0, week: 'W1' }, { satisfaction: 10, week: 'W2' }], { width: 100, height: 100, left: 0, right: 0, top: 0, bottom: 0 });
  assert.deepEqual(g.points.map((p) => [p.x, p.y]), [[0, 100], [100, 0]]);
  assert.equal(g.path, 'M0 100 L100 0');
  assert.equal(g.ticks.length, 6);
  assert.equal(nearestPoint(g.points, 70).label, 'W2');
  const one = chartGeometry([{ satisfaction: 5 }], { width: 100, height: 100, left: 0, right: 0, top: 0, bottom: 0 });
  assert.equal(one.points[0].x, 50);
});

test('timer storage helpers survive junk', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  writeJson(storage, 'flow.timer', { task: 't', start: 5 });
  assert.deepEqual(validTimer(readJson(storage, 'flow.timer')), { task: 't', start: 5 });
  mem.set('flow.timer', '{broken');
  assert.equal(readJson(storage, 'flow.timer'), null);
  assert.equal(validTimer({ task: 1 }), null);
  writeJson(storage, 'flow.timer', null);
  assert.equal(mem.has('flow.timer'), false);
});
