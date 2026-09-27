// Black-box CLI tests, driven only by `flow --help` (docs/API.md) and SPEC.md.
// Every command runs in a throwaway FLOW_HOME, in UTC, at a fixed FLOW_NOW.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cli', 'flow.mjs');
const D = '2026-09-28';

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-acc-'));
  const run = (args, now = '06:30') => {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, FLOW_HOME: dir, FLOW_NOW: `${D}T${now}:00Z`, TZ: 'UTC', NO_COLOR: '1' },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const ok = (args, now) => {
    const r = run(args, now);
    assert.equal(r.code, 0, `flow ${args.join(' ')} failed: ${r.err}`);
    return r.out;
  };
  const json = (args, now) => JSON.parse(ok([...args, '--json'], now));
  return { dir, run, ok, json, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const near = (a, b, eps = 0.051) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

/** Morning at the factory: skills, tasks and rewards. */
function setup(h) {
  h.ok(['init', '--name', 'Allen']);
  h.ok(['energy', '8', '7', '--at', '06:30']);
  h.ok(['skill', 'add', '--name', 'Purchasing', '--stat', 'Work', '--place', 'Desk']);
  h.ok(['skill', 'add', '--name', 'Quality', '--stat', 'Craft', '--place', 'Factory floor']);
  for (const i of [1, 2, 3]) h.ok(['task', 'add', '--title', `PR ${i}`, '--skill', 'Purchasing', '--estimate', '10', '--mana', '1', '--batch', 'purchase request']);
  h.ok(['task', 'add', '--title', 'Inspect line 2', '--skill', 'Quality', '--estimate', '30', '--stamina', '2']);
  h.ok(['task', 'add', '--title', 'Customer quote', '--skill', 'Purchasing', '--estimate', '45', '--mana', '3', '--deadline', '2026-09-29', '--for-others']);
  h.ok(['reward', 'add', '--title', 'Bubble tea', '--price', '40']);
  h.ok(['reward', 'add', '--title', 'Concert', '--price', '30', '--once']);
}

test('cli: init, then status --json starts at level 1 with a zero balance', (t) => {
  const h = home(); t.after(h.done);
  h.ok(['init', '--name', 'Allen']);
  const s = h.json(['status']);
  assert.equal(s.settings.name, 'Allen');
  assert.equal(s.player.level, 1);
  assert.equal(s.player.xp, 0);
  assert.equal(s.balance, 0);
  assert.deepEqual(s.stats.map((x) => x.name), ['Body', 'Mind', 'Craft', 'Work', 'Bonds']);
  assert.ok(existsSync(h.dir));
});

test('cli: the morning rating sets the day’s energy; out-of-range is refused', (t) => {
  const h = home(); t.after(h.done);
  h.ok(['init', '--name', 'Allen']);
  h.ok(['energy', '7', '6']);
  const s = h.json(['status']);
  assert.deepEqual([s.energy.stamina, s.energy.mana], [7, 6]);
  assert.notEqual(h.run(['energy', '11', '5']).code, 0);
});

test('cli: next --json puts the due-soon task first and offers the 3 purchase requests as one batch', (t) => {
  const h = home(); t.after(h.done);
  setup(h);
  const n = h.json(['next']);
  assert.equal(n.next.title, 'Customer quote');
  const batches = [n.next, ...n.alternatives].filter((o) => o.batch);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].batch.length, 3);
});

test('cli: a realistic factory day end to end', (t) => {
  const h = home(); t.after(h.done);
  setup(h);
  h.ok(['moment', 'Drive', '--from', '07:30', '--to', '08:00'], '08:00');
  let out = h.ok(['done', 'Customer quote', '--minutes', '45', '--start', '08:15'], '09:00');
  assert.match(out, /\+45/);
  out = h.ok(['done', 'PR 1', '--minutes', '10', '--start', '09:05'], '09:15');
  assert.match(out, /\+11/, 'combo ×2: +10%');
  out = h.ok(['done', 'PR 2', '--minutes', '10', '--start', '09:20'], '09:30');
  assert.match(out, /\+12/, 'batch ×2: +15% replaces the combo');
  out = h.ok(['done', 'PR 3', '--minutes', '10', '--start', '09:35'], '09:45');
  assert.match(out, /\+13/, 'batch ×3: +30%');
  out = h.ok(['done', 'Inspect line 2', '--minutes', '30', '--start', '10:00'], '10:30');
  assert.match(out, /\+42/, 'combo ×5: +40%');

  let s = h.json(['status'], '11:00');
  assert.equal(s.today.points, 123);
  assert.equal(s.today.done, 5);
  assert.equal(s.player.xp, 123);
  assert.equal(s.balance, 123);
  near(s.energy.stamina, 8 - 0.25 - 2);
  near(s.energy.mana, 7 - 0.5 - 3 - 1 - 0.5 - 0.5, 0.06);

  // the quote was for a customer: critical, so its rework costs 2× → 20 × 1 × 2 = 40
  out = h.ok(['rework', 'Customer quote', '--minutes', '20', '--at', '13:00'], '13:00');
  assert.match(out, /40/);
  h.ok(['moment', 'Chat', '--from', '12:00', '--to', '12:30', '--who', 'Whitney'], '13:05');
  s = h.json(['status'], '13:10');
  assert.equal(s.player.xp, 83, 'rework comes off XP');
  assert.equal(s.balance, 83, 'and off the balance; chatting costs no points');
  assert.ok(s.energy.mana < 1, 'chatting cost mana');

  h.ok(['buy', 'Bubble tea', '--at', '15:00'], '15:00');
  s = h.json(['status'], '15:05');
  assert.equal(s.balance, 43);
  // 30 of the concert is covered, nothing below zero
  h.ok(['buy', 'Concert', '--at', '16:00'], '16:00');
  assert.equal(h.json(['status'], '16:05').balance, 13);
  const again = h.run(['buy', 'Concert', '--at', '16:30'], '16:30');
  assert.notEqual(again.code, 0, 'a one-off cannot be bought twice');
  // into debt: 13 covered, 27 below zero at double → 13 + 54 = 67
  h.ok(['buy', 'Bubble tea', '--at', '17:00'], '17:00');
  s = h.json(['status'], '17:05');
  assert.equal(s.balance, 13 - 13 - 54);
  assert.equal(s.player.xp, 83, 'buying never touches XP');

  const replay = h.ok(['replay', '--day', D], '21:00');
  for (const word of ['Customer quote', 'Inspect line 2', 'Whitney', 'Bubble tea']) assert.ok(replay.includes(word), word);
  assert.match(replay, /walk/i, 'desk → floor is a walk');
  assert.match(replay, /Tomorrow/i);

  const log = h.ok(['log', '--days', '1'], '21:00');
  assert.match(log, /rework/i);
});

test('cli: undo takes back a mistaken entry', (t) => {
  const h = home(); t.after(h.done);
  setup(h);
  h.ok(['done', 'Inspect line 2', '--minutes', '30', '--start', '10:00'], '10:30');
  assert.equal(h.json(['status'], '10:35').player.xp, 30);
  h.ok(['undo', 'last'], '10:40');
  const s = h.json(['status'], '10:45');
  assert.equal(s.player.xp, 0);
  assert.equal(s.balance, 0);
});

test('cli: an unknown task is an error, not a silent no-op', (t) => {
  const h = home(); t.after(h.done);
  setup(h);
  const r = h.run(['done', 'No such task', '--minutes', '5'], '10:00');
  assert.notEqual(r.code, 0);
  assert.equal(h.json(['status'], '10:05').player.xp, 0);
});

test('cli: a weekly review records satisfaction separately from XP', (t) => {
  const h = home(); t.after(h.done);
  setup(h);
  h.ok(['review', '--satisfaction', '7', '--body', '6', '--win', 'shipped', '--lesson', 'batch', '--next', 'gym'], '20:00');
  const s = h.json(['status'], '20:05');
  assert.equal(s.satisfaction.latest.satisfaction, 7);
  assert.equal(s.player.xp, 0);
  assert.notEqual(h.run(['review', '--satisfaction', '11'], '20:10').code, 0);
});

test('cli: export then import into a fresh home reproduces the state', (t) => {
  const a = home(); const b = home(); t.after(a.done); t.after(b.done);
  setup(a);
  a.ok(['done', 'Inspect line 2', '--minutes', '30', '--start', '10:00'], '10:30');
  const file = join(a.dir, 'export.json');
  a.ok(['export', file], '11:00');
  b.ok(['import', file], '11:00');
  const sa = a.json(['status'], '11:05'); const sb = b.json(['status'], '11:05');
  assert.equal(sb.player.xp, sa.player.xp);
  assert.equal(sb.balance, sa.balance);
  assert.deepEqual(sb.tasks.map((x) => x.title).sort(), sa.tasks.map((x) => x.title).sort());
});
