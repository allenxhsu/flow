// The screens actually render — the test that was missing when it mattered.
//
// Two bugs shipped to the player in one day, and pure-function tests caught
// neither, because both were about a screen rather than a rule:
//
//   1. A refactor of Planner's Agenda dropped a variable still used three
//      lines down. Every unit test passed; the screen threw on open.
//   2. Flow read an empty published day as "no day", then as "no tasks", and
//      the task list went blank on both devices.
//
// So: render the real screens from realistic records and fail if one throws,
// or comes back empty when it should not. It is deliberately dumb. Its whole
// job is to be the thing that runs before a deploy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { play, index, DEFAULT_STATS } from '../../src/model.js';
import { plannerTasks, plannerDay, AGENDA_TYPE } from '../../src/planner.js';
import { VIEWS } from '../../src/views/index.js';

const ME = 'Allen Xu';
const DAY = '2026-09-28';
const NOW = Date.parse(`${DAY}T12:00:00`);
const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));

const ptask = (f) => ({ name: 'T', level: 1, duration: 1, milestone: false, work: 1, percent: 0,
  urgency: 'normal', deadline: null, archived: false, stageId: null, assignments: [], ...f });
const plan = (id, name, tasks) => ({ id, type: 'document', format: 'project-planner', name,
  deletedAt: null, updatedAt: 1, body: JSON.stringify({ id, name, tasks, resources: [], timesheets: [], format: 'project-planner', version: 1 }) });
const agenda = (tasks) => ({ id: `agenda_${DAY}`, type: AGENDA_TYPE, day: DAY, person: ME, tasks, deletedAt: null, updatedAt: 1 });

const PLANS = [
  plan('ge', 'GE SO 278078', [ptask({ id: 'hose', name: 'Receive hose' }), ptask({ id: 'motor', name: 'Install New Motor' })]),
  plan('cs', 'CS605.202', [ptask({ id: 'a13', name: '- Assignment 13', deadline: '2024-11-22' })]),
];

/** Flow's db as the app builds it: derived Planner tasks, some laid on today. */
function world({ published = [{ plan: 'ge', task: 'hose', start: 585, minutes: 60 }] } = {}) {
  const records = published === null ? PLANS : [...PLANS, agenda(published)];
  const opts = { me: ME, skills: [], stats: STATS, now: NOW };
  const { tasks, skills } = plannerTasks(records, opts);
  const laid = plannerDay(records, DAY, opts);
  const on = new Map((laid || []).map((t) => [t.id, t]));
  const derived = laid === null ? tasks : tasks.map((t) => (on.has(t.id)
    ? { ...t, laidAt: on.get(t.id).laidAt, laidMinutes: on.get(t.id).laidMinutes }
    : { ...t, offToday: true }));
  const mine = { id: 'task_cycle', type: 'task', title: 'CYCLE', skill: 'sk_body', measure: 'time',
    cadence: 'daily', estimate: 60, stamina: 3, mana: 0 };
  const skill = { id: 'sk_body', type: 'skill', name: 'Fitness', stat: 'stat_body' };
  const done = { id: 'done_1', type: 'done', task: 'task_cycle', day: DAY, start: NOW - 36e5, end: NOW - 1e6,
    minutes: 60, measure: 'time', value: 60, quality: 1, price: { points: 60, base: 60, energy: {} } };
  return index([...STATS, ...skills, ...derived, mine, skill, done]);
}

/**
 * A store that answers everything the screens ask it. Every reader returns an
 * empty-but-valid shape and every writer throws, so a render that tries to
 * write is a failure rather than a silent pass.
 */
function fakeStore(db) {
  const wont = (name) => () => { throw new Error(`render must not call store.${name}()`); };
  return {
    allRecords: () => db ? [...db.tasks, ...db.skills, ...db.done] : [],
    getRecord: () => null,
    getSettings: () => ({ url: '', token: '', enabled: false }),
    plannerSettingsNow: () => ({ url: '', token: '' }),
    plannerStatus: () => ({ phase: 'idle', lastError: null, lastSyncAt: null }),
    syncStatus: () => ({ phase: 'idle', lastError: null, lastSyncAt: null }),
    plannerDrift: () => [],
    plannerAsks: () => [],
    plannerExpired: () => [],
    opsWaiting: async () => [],
    deviceId: () => 'test-device',
    persistence: () => 'indexeddb',
    storeKind: () => 'IndexedDbStore',
    inPortal: () => false,
    plannerInPortal: () => false,
    syncConfigured: () => false,
    plannerConfigured: () => false,
    plannerName: () => ME,
    save: wont('save'), add: wont('add'), remove: wont('remove'),
    applySettings: wont('applySettings'), applyPlannerSettings: wont('applyPlannerSettings'),
    syncNow: wont('syncNow'), pullPlanner: wont('pullPlanner'),
    exportStore: wont('exportStore'), importStore: wont('importStore'),
  };
}

/** Every screen, rendered from a context shaped like the app's. */
function renderAll(db, ui = {}) {
  const g = play(db, NOW);
  const ctx = { db, g, now: NOW, ui, mode: 'hud', esc: (s) => String(s),
    store: fakeStore(db), toast: () => {}, render: () => {}, go: () => {} };
  const out = {};
  for (const v of VIEWS) out[v.id] = v.mod.render(ctx);
  return out;
}

describe('the screens render', () => {
  test('every screen renders without throwing, on a real-shaped day', () => {
    const html = renderAll(world());
    for (const [id, s] of Object.entries(html)) {
      assert.equal(typeof s, 'string', `${id} returned no HTML`);
      assert.ok(s.length > 20, `${id} rendered ${s.length} characters`);
    }
  });

  test('every screen renders for a brand new player with no records at all', () => {
    const html = renderAll(index([]));
    for (const [id, s] of Object.entries(html)) assert.ok(s.length > 20, `${id} is empty for a new player`);
  });

  test("Flow's task list is not empty when Planner laid work on today", () => {
    const html = renderAll(world()).tasks;
    assert.match(html, /Receive hose/, "the day's work is on the Tasks screen");
    assert.doesNotMatch(html, /Assignment 13/, 'and the 2024 backlog is not');
  });

  test('an empty published day hides the backlog but keeps it one toggle away', () => {
    const html = renderAll(world({ published: [] })).tasks;
    assert.doesNotMatch(html, /Receive hose/, 'nothing Planner left off today');
    assert.doesNotMatch(html, /Assignment 13/);
    assert.match(html, /data-toggle="backlog"/, 'the backlog is reachable');
    assert.match(html, /CYCLE/, "the player's own task is not Planner's to hide");
  });

  test('a clear day with nothing of the player\'s own says so, rather than rendering a blank', () => {
    const records = [...PLANS, agenda([])];
    const opts = { me: ME, skills: [], stats: STATS, now: NOW };
    const { tasks, skills } = plannerTasks(records, opts);
    const off = tasks.map((t) => ({ ...t, offToday: true }));
    const html = renderAll(index([...STATS, ...skills, ...off])).tasks;
    assert.match(html, /clear|nothing on today/i, 'an empty list must explain itself');
    assert.match(html, /data-toggle="backlog"/);
  });

  test('no published day falls back to the backlog rather than emptying', () => {
    const html = renderAll(world({ published: null })).tasks;
    assert.match(html, /Receive hose/);
    assert.match(html, /Assignment 13/, 'without a day, nothing is hidden');
  });

  test('Now renders the day it has, with what was done on it', () => {
    const html = renderAll(world()).now;
    assert.match(html, /CYCLE/);
  });
});

// ─── and the other side of the boundary ────────────────────────────────────
const PLANNER = fileURLToPath(new URL('../../../Project/', import.meta.url));
const present = existsSync(`${PLANNER}src/model/dayplan.js`);

describe("Planner's Agenda renders", { skip: present ? false : 'Project (Planner) is not checked out beside Flow' }, () => {
  test('dayRows returns the day without throwing, and publishes what it returns', async () => {
    const { dayRows, agendaRecord, sameDay } = await import(`${PLANNER}src/model/dayplan.js`);
    const blocks = [
      { day: 20000, planId: 'ge', taskId: 'hose', start: 585, minutes: 60 },
      { day: 20000, planId: 'ge', taskId: 'motor', start: 645, minutes: 120 },
    ];
    const rows = dayRows(blocks, 20000);
    assert.ok(Array.isArray(rows), 'dayRows returns rows');
    assert.equal(rows.length, 2);
    const rec = agendaRecord({ day: DAY, rows, person: ME });
    assert.equal(rec.day, DAY);
    assert.ok(Array.isArray(rec.tasks));
    assert.equal(sameDay(rec, rec), true, 'a day is the same as itself, so nothing republishes in a loop');
  });

  test('an empty day is still a day: it publishes, it does not throw', async () => {
    const { dayRows, agendaRecord } = await import(`${PLANNER}src/model/dayplan.js`);
    const rows = dayRows([], 20000);
    assert.deepEqual(rows, []);
    assert.deepEqual(agendaRecord({ day: DAY, rows, person: ME }).tasks, []);
  });
});
