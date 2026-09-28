// SPEC.md › Play (decided 2026-09-28) and › Day Replay: the game as an input,
// world packs, and one game on two clocks. Black-box: the public modules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { validateWorld, worldFor, worldRecord, WORLD_FORMAT } from '../../src/game/world.js';
import { GENERIC_WORLD } from '../../src/game/worlds/generic.js';
import { menuTasks, reworkQuestion, startTimer, finishQuestions, finishTask, newTask, cancelTimer, ESTIMATES, typeKey } from '../../src/game/actions.js';
import { gameClock } from '../../src/game/clock.js';
import { schedule } from '../../src/replay/schedule.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const clone = (x) => JSON.parse(JSON.stringify(x));

/** A small valid pack, written by hand from the format in the spec. */
function pack() {
  return {
    format: 'flow.world', version: 1, name: 'Test town',
    car: { name: 'Hatchback', color: '#3a6ad8' },
    start: { level: 'home', position: [2, 3], dir: 'down' },
    levels: [
      { id: 'home', name: 'Home', size: [8, 7],
        rooms: [{ name: 'Room', x: 1, y: 2, w: 6, h: 4, floor: 'wood' }],
        doors: [{ x: 3, y: 6, floor: 'wood', room: 'Room' }],
        furniture: [{ model: 'desk', x: 4, y: 2, w: 2, h: 1, text: 'A desk.' }],
        exits: [{ x: 3, y: 6, to: 'yard', at: [2, 1], dir: 'down' }] },
      { id: 'yard', name: 'Yard', size: [6, 6], outdoor: true,
        ground: [{ x: 0, y: 0, w: 6, h: 6, floor: 'grass', room: 'Yard' }],
        furniture: [], exits: [{ x: 2, y: 0, to: 'home', at: [3, 5], dir: 'up' }] },
    ],
    places: [{ id: 'home', name: 'Home', kind: 'home', position: [40, 60], level: 'yard', at: [2, 2] }],
    npcs: [{ id: 'npc_ana', name: 'Ana', level: 'yard', position: [4, 4], dir: 'left',
      sprite: { hair: '#302020', shirt: '#d05050' }, lines: ['Hi there.'],
      choices: [{ label: 'Chat', kind: 'talk', lines: ['Nice day.'] }, { label: 'Bye', kind: 'leave' }] }],
    desks: [{ level: 'home', position: [4, 2] }],
  };
}

// ─── world packs ────────────────────────────────────────────────────────────

test('world pack: a valid pack is accepted and comes back as the world', () => {
  const r = validateWorld(pack());
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.world.name, 'Test town');
  assert.equal(r.world.format, WORLD_FORMAT);
  assert.equal(WORLD_FORMAT, 'flow.world');
  assert.deepEqual(r.world.levels.map((l) => l.id), ['home', 'yard']);
  assert.equal(r.world.npcs[0].name, 'Ana');
  assert.deepEqual(r.world.desks, [{ level: 'home', position: [4, 2] }]);
});

test('world pack: JSON text is accepted as well as an object', () => {
  assert.equal(validateWorld(JSON.stringify(pack())).ok, true);
  const bad = validateWorld('{ not json');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /JSON/i);
});

test('world pack: unknown keys are ignored, at the top and inside', () => {
  const p = pack();
  p.extra = { anything: 1 };
  p.levels[0].weather = 'rain';
  p.npcs[0].mood = 'happy';
  const r = validateWorld(p);
  assert.equal(r.ok, true, r.reason);
  assert.ok(!('extra' in r.world));
  assert.ok(!('weather' in r.world.levels[0]));
  assert.ok(!('mood' in r.world.npcs[0]));
});

test('world pack: an invalid pack is refused whole, with the reason', () => {
  const cases = [
    [(p) => { p.format = 'something.else'; }, /format/],
    [(p) => { p.version = 2; }, /version/],
    [(p) => { delete p.name; }, /name/],
    [(p) => { p.levels = []; }, /level/],
    [(p) => { p.levels[1].id = 'home'; }, /home/],
    [(p) => { p.levels[0].exits[0].to = 'nowhere'; }, /nowhere/],
    [(p) => { p.places[0].kind = 'castle'; }, /kind/],
    [(p) => { p.npcs[0].choices[0].kind = 'dance'; }, /dance/],
    [(p) => { p.npcs[0].level = 'moon'; }, /moon/],
    [(p) => { p.npcs[0].lines = [42]; }, /line/],
    [(p) => { p.levels[0].furniture[0].model = 'no-such-model'; }, /no-such-model/],
    [(p) => { p.desks = []; }, /desk/],
    [(p) => { p.desks[0].level = 'moon'; }, /moon/],
    [(p) => { p.levels[0].rooms[0].w = 50; }, /Room|size|outside/i],
  ];
  for (const [change, why] of cases) {
    const p = pack();
    change(p);
    const r = validateWorld(p);
    assert.equal(r.ok, false, `refused: ${why}`);
    assert.equal(typeof r.reason, 'string');
    assert.match(r.reason, why);
    assert.ok(!('world' in r), 'never half-applied: no world comes back');
  }
  assert.equal(validateWorld(null).ok, false);
  assert.equal(validateWorld([]).ok, false);
});

test('world pack: the generic world is itself a valid pack with the places the spec names', () => {
  const r = validateWorld(clone(GENERIC_WORLD));
  assert.equal(r.ok, true, r.reason);
  const kinds = new Set(r.world.places.map((p) => p.kind));
  for (const k of ['home', 'work', 'shop', 'food']) assert.ok(kinds.has(k), `a ${k} place`);
  assert.ok(r.world.npcs.length >= 2, 'made-up people');
  assert.ok(r.world.desks.length >= 1, 'a desk that opens TASKS');
  assert.ok(r.world.car && typeof r.world.car.name === 'string');
});

// ─── the world record ───────────────────────────────────────────────────────

test('world record: a definition (before the events), last write wins, removing it returns the generic world', () => {
  const first = M.RECORD_TYPES.indexOf('done');
  assert.ok(M.RECORD_TYPES.includes('world'));
  assert.ok(M.RECORD_TYPES.indexOf('world') < first, 'world is a definition');

  assert.equal(M.index([]).world, null);
  assert.equal(worldFor([]).name, GENERIC_WORLD.name, 'no pack: the generic world');

  const a = { ...worldRecord(validateWorld(pack()).world), updatedAt: 1 };
  const p2 = pack(); p2.name = 'Test town 2';
  const b = { ...worldRecord(validateWorld(p2).world), updatedAt: 2 };
  assert.equal(a.id, b.id, 'one world per workspace');
  assert.equal(a.type, 'world');
  assert.equal(worldFor([b, a]).name, 'Test town 2', 'latest write wins');
  assert.equal(worldFor([a, b]).name, 'Test town 2');
  assert.equal(M.index([a, b]).world.world.name, 'Test town 2');

  const gone = M.tombstone(b, { now: 3 });
  assert.equal(M.index([a, b, gone]).world, null);
  assert.equal(worldFor([a, b, gone]).name, GENERIC_WORLD.name, 'removed: back to the generic world');
});

test('world record: a stored pack that no longer validates falls back to the generic world', () => {
  const r = { id: 'world', type: 'world', world: { format: 'flow.world', version: 1 }, updatedAt: 5 };
  assert.equal(worldFor([r]).name, GENERIC_WORLD.name);
});

// ─── input: the TASKS menu ──────────────────────────────────────────────────

function office() {
  const g = game();
  g.task({ id: 'task_mail', title: 'Mail', skill: 'sk_mail', estimate: 20, mana: 1 });
  g.task({ id: 'task_run', title: 'Run', skill: 'sk_run', estimate: 30, stamina: 2 });
  g.task({ id: 'task_read', title: 'Read', skill: 'sk_read', estimate: 25, measure: 'count', unit: 'pages' });
  g.task({ id: 'task_tidy', title: 'Tidy desk', skill: 'sk_mail', estimate: 10, measure: 'quality' });
  return g;
}

test('menu: lists what Now’s Next lists — the suggestion, the alternatives, then every other open task', () => {
  const g = office();
  const now = T(`${D}T09:00:00`);
  const p = M.play(g.records, now);
  const list = menuTasks(p);
  const next = [p.next.next, ...p.next.alternatives].filter(Boolean).map((s) => s.task);
  assert.deepEqual(list.slice(0, next.length).map((x) => x.task), next, 'suggestions first, in the picker’s order');
  assert.ok(list.slice(0, next.length).every((x) => x.suggested));
  const open = p.tasks.filter((t) => !t.archived && !t.doneNow).map((t) => t.id);
  assert.deepEqual(new Set(list.map((x) => x.task)), new Set(open), 'every open task, once');
  assert.equal(list.length, open.length);
  for (const x of list) assert.equal(typeof x.title, 'string');
});

test('menu: a task done for today leaves the menu, as it leaves Now', () => {
  const g = office();
  g.done('task_mail', `${D}T08:30:00`, 20);
  const list = menuTasks(M.play(g.records, T(`${D}T09:00:00`)));
  assert.ok(list.some((x) => x.task === 'task_mail'), 'an anytime task stays open');
  g.task({ id: 'task_daily', title: 'Stretch', skill: 'sk_run', estimate: 5, cadence: 'daily' });
  g.done('task_daily', `${D}T08:40:00`, 5);
  assert.ok(!menuTasks(M.play(g.records, T(`${D}T09:00:00`))).some((x) => x.task === 'task_daily'));
});

test('start: the timer is {task, start}, the same shape Now writes to flow.timer', () => {
  const g = office();
  const now = T(`${D}T09:00:00`);
  assert.equal(reworkQuestion(g.db(), 'task_mail', now), null, 'never finished: no question');
  const timer = startTimer(g.db(), 'task_mail', { now });
  assert.deepEqual(timer, { task: 'task_mail', start: now });
  assert.throws(() => startTimer(g.db(), 'task_nope', { now }), /task/);
  assert.throws(() => startTimer(g.db(), 'task_run', { now, running: timer }), /running/i);
});

test('start: finished recently → asks "Is this rework of …?" exactly as the timer on Now does', () => {
  const g = office();
  const d = g.done('task_mail', '2026-09-20T10:00:00', 20);
  const now = T(`${D}T09:00:00`);
  const cand = M.reworkCandidate(g.db(), 'task_mail', now);
  const q = reworkQuestion(g.db(), 'task_mail', now);
  assert.equal(q.done, cand.id);
  assert.equal(q.done, d.id);
  assert.equal(q.day, '2026-09-20');
  assert.match(q.text, /rework/i);
  assert.match(q.text, /Mail/);
  assert.deepEqual(startTimer(g.db(), 'task_mail', { now, reworkOf: q.done }), { task: 'task_mail', start: now, reworkOf: d.id });
  // Longer ago than the model's window: no question.
  const old = office();
  old.done('task_mail', '2026-09-01T10:00:00', 20);
  assert.equal(reworkQuestion(old.db(), 'task_mail', now), null);
});

test('finish: from the timer — its minutes, the measure’s value and quality, a makeDone record', () => {
  const g = office();
  const start = T(`${D}T09:00:00`);
  const now = start + 25 * 60000;
  const timer = startTimer(g.db(), 'task_mail', { now: start });
  assert.deepEqual(finishQuestions(g.db(), { timer }), ['quality'], 'a time task asks only the quality');
  const r = finishTask(g.db(), { timer, now, quality: 0.8 });
  const expect = M.makeDone(g.db(), 'task_mail', { end: now, minutes: 25, quality: 0.8, timed: true });
  assert.equal(r.kind, 'done');
  assert.equal(r.clearTimer, true);
  const { id, ...rest } = r.record;
  const { id: id2, ...want } = expect;
  assert.deepEqual(rest, want);
  assert.match(r.text, new RegExp(`\\+${expect.price.points}`), 'the text box shows the points');
});

test('finish: count and quality tasks ask the measure’s value like Log done', () => {
  const g = office();
  const now = T(`${D}T10:00:00`);
  assert.deepEqual(finishQuestions(g.db(), { timer: { task: 'task_read', start: now - 60000 } }), ['value', 'quality']);
  assert.deepEqual(finishQuestions(g.db(), { timer: { task: 'task_tidy', start: now - 60000 } }), ['value']);
  const r = finishTask(g.db(), { timer: { task: 'task_read', start: now - 20 * 60000 }, now, value: 12 });
  assert.equal(r.record.value, 12);
  assert.equal(r.record.minutes, 20);
  assert.equal(r.record.quality, 1);
  const q = finishTask(g.db(), { timer: { task: 'task_tidy', start: now - 10 * 60000 }, now, value: 90 });
  assert.equal(q.record.quality, 0.9);
});

test('finish: with no timer it asks the minutes, and logs them untimed', () => {
  const g = office();
  const now = T(`${D}T11:00:00`);
  assert.deepEqual(finishQuestions(g.db(), { task: 'task_mail' }), ['minutes', 'quality']);
  assert.throws(() => finishTask(g.db(), { task: 'task_mail', now }), /minutes/);
  const r = finishTask(g.db(), { task: 'task_mail', minutes: 15, now });
  assert.equal(r.record.minutes, 15);
  assert.equal(r.record.timed, false);
  assert.equal(r.record.end, now);
  assert.equal(r.clearTimer, false);
});

test('finish: a rework timer logs makeRework on the completion it named', () => {
  const g = office();
  const d = g.done('task_mail', '2026-09-20T10:00:00', 20);
  const start = T(`${D}T09:00:00`);
  const timer = startTimer(g.db(), 'task_mail', { now: start, reworkOf: d.id });
  assert.deepEqual(finishQuestions(g.db(), { timer }), []);
  const r = finishTask(g.db(), { timer, now: start + 10 * 60000 });
  const want = M.makeRework(g.db(), d.id, { minutes: 10, at: start + 10 * 60000 });
  assert.equal(r.kind, 'rework');
  assert.equal(r.record.type, 'rework');
  assert.equal(r.record.done, d.id);
  assert.equal(r.record.penalty, want.penalty);
  assert.equal(r.record.charged, want.charged);
  assert.match(r.text, new RegExp(`−${want.charged}`));
});

test('new task: a makeTask record from title, estimate, skill, cadence, critical — always a Flow task', () => {
  const g = office();
  const now = T(`${D}T12:00:00`);
  assert.deepEqual(ESTIMATES, [15, 30, 45, 60, 90, 120]);
  const t = newTask(g.db(), { title: 'CALL THE BANK', estimate: 45, skill: 'sk_mail', cadence: 'once', critical: true, now });
  const want = M.makeTask(g.db(), { title: 'CALL THE BANK', estimate: 45, skill: 'sk_mail', cadence: 'once', critical: true }, { now });
  const { id, ...rest } = t;
  const { id: id2, ...w } = want;
  assert.deepEqual(rest, w);
  assert.ok(!('source' in t), 'never a Planner task');
  assert.equal(t.type, 'task');
  assert.throws(() => newTask(g.db(), { title: '', estimate: 30, skill: 'sk_mail', cadence: 'once', now }), /title/);
  assert.throws(() => newTask(g.db(), { title: 'X', estimate: 30, skill: 'sk_nope', cadence: 'once', now }), /skill/);
  assert.throws(() => newTask(g.db(), { title: 'X', estimate: 30, skill: 'sk_mail', cadence: 'hourly', now }), /cadence/);
});

test('new task: the letter grid types the title', () => {
  let s = '';
  for (const k of ['C', 'A', 'L', 'L', 'SPACE', 'M', 'O', 'M']) s = typeKey(s, k);
  assert.equal(s, 'CALL MOM');
  assert.equal(typeKey(s, 'DEL'), 'CALL MO');
  assert.equal(typeKey('', 'SPACE'), '', 'no leading space');
  assert.equal(typeKey('X'.repeat(40), 'A'), 'X'.repeat(40), 'a title has a limit');
});

test('cancel timer: nothing is logged, the timer is gone', () => {
  assert.equal(cancelTimer({ task: 'task_mail', start: 1 }), null);
});

// ─── the clock: live and replay ─────────────────────────────────────────────

test('clock (live): Play runs on the real clock with input on', () => {
  const noon = T(`${D}T12:34:00`);
  const c = gameClock('live', { now: noon });
  assert.equal(c.mode, 'live');
  assert.equal(c.input, true);
  assert.equal(c.now, noon);
  assert.equal(c.day, D);
  assert.equal(c.clock, '12:34');
  assert.equal(c.night, false);
  assert.equal(gameClock('live', { now: T(`${D}T22:30:00`) }).night, true, 'day and night follow the clock');
});

/** A day to replay: drive in, two tasks at the desk, one on the floor, a treat. */
function workday() {
  const g = game();
  g.records.push({ id: 'sk_floor', type: 'skill', name: 'Floor', stat: 'stat_work', place: 'place_floor' });
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30, mana: 2 });
  const insp = g.task({ title: 'Inspect', skill: 'sk_floor', estimate: 30, stamina: 2 });
  g.energy(`${D}T06:30:00`, 8, 8);
  g.moment('kind_drive', `${D}T07:30:00`, `${D}T08:00:00`);
  g.done(mail, `${D}T09:00:00`, 30);
  g.done(mail, `${D}T10:00:00`, 30);
  g.done(insp, `${D}T11:00:00`, 30);
  g.buy(g.reward({ title: 'Cake', price: 20 }), `${D}T13:00:00`);
  return g;
}

test('clock (replay): the chosen day’s events in order, fast-forwarded, input off', () => {
  const g = workday();
  const now = T(`${D}T21:00:00`);
  const story = M.replayDay(g.records, D, { now });
  const tl = schedule(story);
  let c = gameClock('replay', { records: g.records, day: D, now });
  assert.equal(c.mode, 'replay');
  assert.equal(c.input, false, 'input is off while replaying');
  assert.equal(c.day, D);
  assert.equal(c.t, 0);
  assert.equal(c.duration, tl.total);
  const seen = [];
  while (c.t < c.duration) {
    if (c.beat && ['done', 'moment', 'rework', 'purchase'].includes(c.beat.kind) && seen[seen.length - 1] !== c.beat.id) seen.push(c.beat.id);
    c = c.step(0.25);
  }
  const events = story.beats.filter((b) => ['done', 'moment', 'rework', 'purchase'].includes(b.kind)).map((b) => b.id);
  assert.deepEqual(seen, events, 'every event, once, in time order');
  assert.equal(c.t, c.duration, 'never past the end');
});

test('clock (replay): 1× and 2× — the same schedule as Day Replay, twice as fast', () => {
  const g = workday();
  const opts = { records: g.records, day: D, now: T(`${D}T21:00:00`) };
  assert.equal(gameClock('replay', opts).step(1).t, 1);
  assert.equal(gameClock('replay', { ...opts, speed: 2 }).step(1).t, 2);
  assert.equal(gameClock('replay', { ...opts, speed: 3 }).speed, 1, 'only 1× and 2×');
  assert.equal(gameClock('replay', opts).setSpeed(2).speed, 2);
});

test('clock (replay): skip goes to the finale; seek lands on a beat with its clock and meters', () => {
  const g = workday();
  const opts = { records: g.records, day: D, now: T(`${D}T21:00:00`) };
  const story = M.replayDay(g.records, D, { now: opts.now });
  const tl = schedule(story);
  const c = gameClock('replay', opts);
  const s = c.skip();
  assert.equal(s.t, tl.dayEnd);
  assert.equal(s.finale, 'totals');
  const seg = tl.segments.find((x) => x.type === 'beat' && x.beat.kind === 'done');
  const at = c.seek(seg.t0 + seg.dur / 2);
  assert.equal(at.beat.id, seg.beat.id);
  assert.ok(at.at >= seg.beat.start && at.at <= seg.beat.end, 'the HUD clock is the event’s time');
  assert.match(at.clock, /^\d\d:\d\d$/);
  assert.deepEqual(at.hud, { stamina: seg.beat.after.stamina, mana: seg.beat.after.mana, points: seg.beat.after.points });
  assert.equal(at.finale, null);
  assert.equal(c.seek(-5).t, 0);
  assert.equal(c.seek(1e9).t, tl.total);
});
