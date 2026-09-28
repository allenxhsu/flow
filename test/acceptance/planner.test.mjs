// SPEC.md › Planner tasks (phase 2, decided 2026-09-28) and its Contract.
// Black-box: only plannerTasks / plannerEvents from src/planner.js and the
// public model. Plans are sync-kit document records in Planner's own format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannerTasks, plannerEvents } from '../../src/planner.js';
import { index, makeDone, makeRework, isCritical, DEFAULT_STATS } from '../../src/model.js';
import { baseRecords, T } from '../helpers.mjs';

const NOW = T('2026-10-05T12:00:00');
/** settings.plannerSince: when Flow first read Planner, before every finish below. */
const SINCE = T('2026-09-01T00:00:00');
const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));
const SKILLS = baseRecords().filter((r) => r.type === 'skill');

/** A Planner task with Planner's defaults. */
const ptask = (fields) => ({
  name: 'New task', level: 1, duration: 1, milestone: false, work: null, percent: 0, urgency: 'normal',
  deadline: null, archived: false, stageId: null, assignments: [], ...fields,
});
/** A plan as Planner syncs it: a document record whose body is the saved JSON. */
function plan({ id = 'plan_web', name = 'Website relaunch', tasks = [], resources = [], timesheets = [], ...rest } = {}) {
  const body = {
    id, name, format: 'project-planner', version: 1, start: '2026-09-01',
    calendar: { workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] },
    agenda: { assumedLoad: 100 },
    stages: [
      { id: 'stage_todo', name: 'Todo', done: false },
      { id: 'stage_done', name: 'Completed', done: true },
      { id: 'stage_cancelled', name: 'Cancelled', done: false, cancelled: true },
    ],
    template: false, archived: false, workspaceId: null, folderId: null,
    tasks: tasks.map(ptask), resources, timesheets, ...rest,
  };
  return { id, type: 'document', format: 'project-planner', name, body: JSON.stringify(body), updatedAt: 1, origin: 'planner' };
}
const RES = [{ id: 'r_ana', name: 'Ana', type: 'work' }, { id: 'r_ben', name: 'Ben', type: 'work' }];
const derive = (plans, me = 'Ana', { skills = SKILLS, stats = STATS } = {}) => plannerTasks(plans, { me, skills, stats });
const ids = (out) => out.tasks.map((t) => t.id).sort();

// ─── which tasks ────────────────────────────────────────────────────────────

test('planner: unassigned leaf tasks are the player’s own (a plan of one’s own work is "me")', () => {
  const out = derive([plan({ tasks: [{ id: 't1', name: 'Write copy' }] })]);
  assert.deepEqual(ids(out), ['task_pl_plan_web_t1']);
});

test('planner: a task assigned to the player’s Planner name is theirs — case- and space-insensitive', () => {
  const tasks = [
    { id: 't_ana', name: 'Hers', assignments: [{ resourceId: 'r_ana', units: 1 }] },
    { id: 't_ben', name: 'His', assignments: [{ resourceId: 'r_ben', units: 1 }] },
    { id: 't_both', name: 'Shared', assignments: [{ resourceId: 'r_ben', units: 1 }, { resourceId: 'r_ana', units: 1 }] },
  ];
  const resources = [{ id: 'r_ana', name: 'Ana Maria', type: 'work' }, { id: 'r_ben', name: 'Ben', type: 'work' }];
  for (const me of ['Ana Maria', 'ana maria', '  ANA   MARIA ', 'AnaMaria']) {
    assert.deepEqual(ids(derive([plan({ tasks, resources })], me)), ['task_pl_plan_web_t_ana', 'task_pl_plan_web_t_both'], `me = "${me}"`);
  }
  assert.deepEqual(ids(derive([plan({ tasks, resources })], 'Ben')), ['task_pl_plan_web_t_ben', 'task_pl_plan_web_t_both']);
  assert.deepEqual(ids(derive([plan({ tasks, resources })], 'Cleo')), [], 'nobody else’s tasks');
});

test('planner: summaries, milestones, archived and cancelled tasks are left out', () => {
  const out = derive([plan({ tasks: [
    { id: 'sum', name: 'Phase 1', level: 1 },
    { id: 'leaf', name: 'Leaf', level: 2 },
    { id: 'ms', name: 'Launch', level: 1, milestone: true, duration: 0 },
    { id: 'arch', name: 'Shelved', level: 1, archived: true },
    { id: 'canc', name: 'Dropped', level: 1, stageId: 'stage_cancelled' },
    { id: 'last', name: 'Last', level: 1 },
  ] })]);
  assert.deepEqual(ids(out), ['task_pl_plan_web_last', 'task_pl_plan_web_leaf']);
});

test('planner: archived plans and templates give no tasks', () => {
  const tasks = [{ id: 't1', name: 'Write copy' }];
  assert.deepEqual(ids(derive([plan({ tasks, archived: true })])), []);
  assert.deepEqual(ids(derive([plan({ tasks, template: true })])), []);
});

test('planner: unreadable bodies are skipped, never thrown', () => {
  const good = plan({ id: 'plan_ok', tasks: [{ id: 't1', name: 'Fine' }] });
  const bad = [
    { id: 'plan_bad', type: 'document', format: 'project-planner', body: '{not json', updatedAt: 1 },
    { id: 'plan_none', type: 'document', format: 'project-planner', body: JSON.stringify({ name: 'No tasks' }), updatedAt: 1 },
    { id: 'plan_null', type: 'document', format: 'project-planner', body: null, updatedAt: 1 },
    { id: 'plan_tasks', type: 'document', format: 'project-planner', body: JSON.stringify({ name: 'Odd', tasks: [null, 7, 'x'] }), updatedAt: 1 },
  ];
  const out = derive([...bad, good]);
  assert.deepEqual(ids(out), ['task_pl_plan_ok_t1']);
  assert.doesNotThrow(() => plannerEvents(index([]), [...bad, good], { me: 'Ana', now: NOW, since: SINCE }));
});

test('planner: deleted plan records are ignored', () => {
  const p = { ...plan({ tasks: [{ id: 't1', name: 'Gone' }] }), deletedAt: 5 };
  assert.deepEqual(ids(derive([p])), []);
});

// ─── shape ──────────────────────────────────────────────────────────────────

test('planner: a derived task — id, title, project, time, once, source', () => {
  const [t] = derive([plan({ tasks: [{ id: 't1', name: 'Write copy' }] })]).tasks;
  assert.equal(t.id, 'task_pl_plan_web_t1');
  assert.equal(t.type, 'task');
  assert.equal(t.title, 'Write copy');
  assert.equal(t.project, 'Website relaunch');
  assert.equal(t.measure, 'time');
  assert.equal(t.cadence, 'once');
  assert.deepEqual(t.source, { app: 'project', plan: 'plan_web', task: 't1' });
});

test('planner: estimate = stated work hours × 60', () => {
  const [t] = derive([plan({ tasks: [{ id: 't1', name: 'Copy', work: 3, duration: 5 }] })]).tasks;
  assert.equal(t.estimate, 180);
});

test('planner: estimate = duration × the plan’s hours per day × its assumed load × 60 without stated work', () => {
  const full = derive([plan({ tasks: [{ id: 't1', name: 'Copy', duration: 1 }], calendar: { hoursPerDay: 6 } })]).tasks[0];
  assert.equal(full.estimate, 360, 'default load 100%');
  const half = derive([plan({ tasks: [{ id: 't1', name: 'Copy', duration: 2 }], agenda: { assumedLoad: 50 } })]).tasks[0];
  assert.equal(half.estimate, 2 * 8 * 0.5 * 60);
  const noLoad = derive([plan({ tasks: [{ id: 't1', name: 'Copy', duration: 0.5 }], agenda: {} })]).tasks[0];
  assert.equal(noLoad.estimate, 240, 'an agenda without a load is 100%');
});

test('planner: estimate is at least 1 minute', () => {
  const [t] = derive([plan({ tasks: [{ id: 't1', name: 'Tiny', work: 0 }] })]).tasks;
  assert.equal(t.estimate, 1);
});

test('planner: deadline carries over; urgency now or high makes it urgent, so critical', () => {
  const out = derive([plan({ tasks: [
    { id: 'now', name: 'Now', urgency: 'now' },
    { id: 'high', name: 'High', urgency: 'high' },
    { id: 'normal', name: 'Normal', urgency: 'normal' },
    { id: 'low', name: 'Low', urgency: 'low' },
    { id: 'due', name: 'Due', deadline: '2026-10-09' },
  ] })]);
  const by = Object.fromEntries(out.tasks.map((t) => [t.source.task, t]));
  assert.equal(by.now.urgent, true);
  assert.equal(by.high.urgent, true);
  assert.ok(!by.normal.urgent && !by.low.urgent);
  assert.ok(isCritical(by.now) && isCritical(by.high));
  assert.ok(!isCritical(by.normal) && !isCritical(by.low));
  assert.equal(by.due.deadline, '2026-10-09');
  assert.ok(isCritical(by.due), 'a deadline is critical');
  assert.equal(by.normal.deadline ?? null, null);
});

// ─── skill ──────────────────────────────────────────────────────────────────

test('planner: the task’s own skill matches a Flow skill by name, case-insensitively', () => {
  const out = derive([plan({ tasks: [{ id: 't1', name: 'Inbox', skill: 'mail' }] })]);
  assert.equal(out.tasks[0].skill, 'sk_mail');
  assert.deepEqual(out.skills, [], 'no derived skill needed');
});

test('planner: the skill falls back to the project’s, then the folder, then the workspace, then the project name', () => {
  const ws = { id: 'ws_home', type: 'workspace', name: 'READ', folders: [{ id: 'f1', name: 'run' }], updatedAt: 1 };
  const t = [{ id: 't1', name: 'Something' }];
  const skillOf = (p) => derive([ws, p]).tasks[0].skill;
  assert.equal(skillOf(plan({ tasks: [{ id: 't1', name: 'X', skill: 'Run' }], skill: 'Mail' })), 'sk_run', 'the task’s own first');
  assert.equal(skillOf(plan({ tasks: t, skill: 'Mail', workspaceId: 'ws_home', folderId: 'f1' })), 'sk_mail', 'then the project’s');
  assert.equal(skillOf(plan({ tasks: t, workspaceId: 'ws_home', folderId: 'f1' })), 'sk_run', 'then its folder');
  assert.equal(skillOf(plan({ tasks: t, workspaceId: 'ws_home' })), 'sk_read', 'then its workspace');
  const out = derive([ws, plan({ tasks: t, name: 'Read' })]);
  assert.equal(out.tasks[0].skill, 'sk_read', 'then the project name');
});

test('planner: an unmatched skill becomes a derived skill_pl_ skill under the Work stat, once', () => {
  const out = derive([plan({ tasks: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] })]);
  assert.equal(out.skills.length, 1);
  const [s] = out.skills;
  assert.match(s.id, /^skill_pl_/);
  assert.equal(s.type, 'skill');
  assert.equal(s.name, 'Website relaunch');
  assert.equal(s.stat, 'stat_work');
  for (const t of out.tasks) assert.equal(t.skill, s.id);
});

test('planner: without a stat_work the derived skill goes under the first stat', () => {
  const stats = [{ id: 'stat_x', type: 'stat', name: 'Craft', order: 0 }, { id: 'stat_y', type: 'stat', name: 'Life', order: 1 }];
  const out = derive([plan({ tasks: [{ id: 't1', name: 'A' }] })], 'Ana', { skills: [], stats });
  assert.equal(out.skills[0].stat, 'stat_x');
});

test('planner: the derived tasks and skills index and play like any others', async () => {
  const { play } = await import('../../src/model.js');
  const out = derive([plan({ tasks: [{ id: 't1', name: 'Write copy', work: 1 }] })]);
  const g = play([...baseRecords(), ...out.skills, ...out.tasks], NOW);
  assert.ok(g.tasks.some((t) => t.id === 'task_pl_plan_web_t1'));
  assert.ok(g.skills.some((s) => s.id === out.skills[0].id));
});

// ─── energy ─────────────────────────────────────────────────────────────────

test('planner: energy — mental (the default) is mana, physical is stamina, 2 per hour, to 0.5, at most 10', () => {
  const out = derive([plan({ tasks: [
    { id: 'mental', name: 'Think', work: 1.5 },
    { id: 'phys', name: 'Move boxes', work: 1.5, energy: 'physical' },
    { id: 'small', name: 'Short', work: 20 / 60 },
    { id: 'long', name: 'Long', work: 7 },
  ] })]);
  const by = Object.fromEntries(out.tasks.map((t) => [t.source.task, t]));
  assert.equal(by.mental.mana, 3);
  assert.equal(by.mental.stamina, 0);
  assert.equal(by.phys.stamina, 3);
  assert.equal(by.phys.mana, 0);
  assert.equal(by.small.mana, 0.5, '20 min → 0.67 → 0.5');
  assert.equal(by.long.mana, 10, 'capped');
});

test('planner: a physical project makes its tasks physical unless a task says otherwise', () => {
  const out = derive([plan({ energy: 'physical', tasks: [{ id: 'a', name: 'A', work: 1 }, { id: 'b', name: 'B', work: 1, energy: 'mental' }] })]);
  const by = Object.fromEntries(out.tasks.map((t) => [t.source.task, t]));
  assert.equal(by.a.stamina, 2);
  assert.equal(by.a.mana, 0);
  assert.equal(by.b.mana, 2);
});

// ─── done in Planner = logged in Flow ───────────────────────────────────────

const DONE_AT = '2026-10-02T15:30';
const doneMs = (s) => new Date(s).getTime();

/** Flow's own records plus a plan; `db()` sees the derived definitions like the app does. */
function world(plans, flow = baseRecords()) {
  const w = {
    plans, flow,
    derived: () => derive(w.plans),
    db: () => { const d = w.derived(); return index([...w.flow, ...d.skills, ...d.tasks]); },
    events: (opts = {}) => plannerEvents(index(w.flow), w.plans, { me: 'Ana', now: NOW, since: SINCE, ...opts }),
    apply: (out) => { w.flow.push(...out.done, ...out.rework); return out; },
  };
  return w;
}
const finished = (doneAt = DONE_AT, extra = {}) => plan({ tasks: [{ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt, ...extra }], resources: RES, ...extra.plan });

test('planner: a task done in Planner is logged in Flow — deterministic id, ends at doneAt, estimate minutes, quality 1', () => {
  const w = world([finished()]);
  const out = w.events();
  assert.equal(out.done.length, 1);
  assert.deepEqual(out.rework, []);
  assert.deepEqual(out.ask, []);
  const d = out.done[0];
  const ms = doneMs(DONE_AT);
  assert.equal(d.id, `done_pl_plan_web_t1_${ms}`);
  assert.equal(d.type, 'done');
  assert.equal(d.task, 'task_pl_plan_web_t1');
  assert.equal(d.end, ms);
  assert.equal(d.minutes, 60);
  assert.equal(d.quality, 1);
  assert.equal(d.planner, new Date(ms).toISOString());
  assert.equal(d.day, '2026-10-02');
  assert.equal(d.price.base, 60, 'priced by the normal rules: estimate × quality');
  assert.equal(d.price.points, 60);
});

test('planner: the done record is the same on every device (same id and fields)', () => {
  const a = world([finished()]).events().done[0];
  const b = world([finished()]).events().done[0];
  assert.equal(a.id, b.id);
  assert.deepEqual({ ...a }, { ...b });
});

test('planner: an urgent task’s logged completion is critical', () => {
  const d = world([finished(DONE_AT, { urgency: 'high' })]).events().done[0];
  assert.equal(d.critical, true);
});

test('planner: open tasks and other people’s done tasks log nothing', () => {
  const p = plan({ resources: RES, tasks: [
    { id: 'open', name: 'Open', percent: 40 },
    { id: 'bens', name: 'Ben’s', percent: 100, doneAt: DONE_AT, assignments: [{ resourceId: 'r_ben', units: 1 }] },
  ] });
  const out = world([p]).events();
  assert.deepEqual(out, { done: [], rework: [], ask: [] });
});

test('planner: idempotent — applying the output and asking again returns nothing new', () => {
  const w = world([finished()]);
  w.apply(w.events());
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] });
});

test('planner: the player’s Planner name defaults to the player’s name', () => {
  const p = plan({ resources: RES, tasks: [{ id: 't1', name: 'Hers', work: 1, percent: 100, doneAt: DONE_AT, assignments: [{ resourceId: 'r_ana', units: 1 }] }] });
  const flow = [...baseRecords(), { id: 'settings', type: 'settings', name: 'Ana', mission: '' }];
  const out = plannerEvents(index(flow), [p], { now: NOW, since: SINCE });
  assert.equal(out.done.length, 1);
});

test('planner: a timer-logged completion within 24 h before doneAt covers it', () => {
  const w = world([finished()]);
  w.flow.push(makeDone(w.db(), 'task_pl_plan_web_t1', { end: doneMs('2026-10-01T16:00'), minutes: 50 })); // 23.5 h before
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] });
});

test('planner: a completion carrying the same planner time covers it', () => {
  const w = world([finished()]);
  const first = w.apply(w.events()).done[0];
  assert.equal(first.planner, new Date(doneMs(DONE_AT)).toISOString());
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] });
});

test('planner: finished again within 24 h of the covering completion is not rework', () => {
  const w = world([finished()]);
  w.apply(w.events());
  w.plans = [finished('2026-10-03T10:00')]; // reopened and re-done 18.5 h later
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] });
});

// ─── reopen = rework ────────────────────────────────────────────────────────

test('planner: reopened and finished again — rework of the earlier completion, fix = timesheet hours after it × 60', () => {
  const w = world([finished()]);
  const first = w.apply(w.events()).done[0];
  const sheets = [
    { id: 'ts0', taskId: 't1', resourceId: 'r_ana', date: '2026-09-30', hours: 1 }, // the original work: before
    { id: 'ts1', taskId: 't1', resourceId: 'r_ana', date: '2026-10-04', hours: 1.5 },
    { id: 'ts2', taskId: 't1', resourceId: 'r_ana', date: '2026-10-05', hours: 0.5 },
    { id: 'ts3', taskId: 'other', resourceId: 'r_ana', date: '2026-10-04', hours: 3 }, // another task
  ];
  w.plans = [plan({ resources: RES, timesheets: sheets, tasks: [{ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: '2026-10-05T11:00' }, { id: 'other', name: 'Other' }] })];
  const out = w.events();
  assert.deepEqual(out.done, [], 'a reopen is rework, not a second completion');
  assert.deepEqual(out.ask, []);
  assert.equal(out.rework.length, 1);
  const rw = out.rework[0];
  assert.equal(rw.type, 'rework');
  assert.equal(rw.done, first.id);
  assert.equal(rw.task, 'task_pl_plan_web_t1');
  assert.equal(rw.minutes, 120);
  assert.equal(rw.penalty, Math.round(120 * (first.price.points / first.minutes) * 1.5), 'the normal rework rule');
  w.apply(out);
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] }, 'charged once');
});

test('planner: reopened with no timesheets — Flow asks for the fix minutes, and an answer covers it', () => {
  const w = world([finished()]);
  const first = w.apply(w.events()).done[0];
  w.plans = [finished('2026-10-05T11:00')];
  const out = w.events();
  assert.deepEqual(out.done, []);
  assert.deepEqual(out.rework, []);
  assert.equal(out.ask.length, 1);
  const [q] = out.ask;
  assert.equal(q.done, first.id);
  assert.equal(q.task, 'task_pl_plan_web_t1');
  assert.equal(q.title, 'Write copy');
  assert.equal(w.events().ask.length, 1, 'still asked until answered');
  // The answer: rework logged against that completion.
  w.flow.push(makeRework(w.db(), first.id, { minutes: 30, at: NOW - 60000 }));
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] });
});

test('planner: rework already logged against that completion after it (the timer’s) covers the reopen', () => {
  const w = world([finished()]);
  const first = w.apply(w.events()).done[0];
  w.flow.push(makeRework(w.db(), first.id, { minutes: 45, at: doneMs('2026-10-04T09:00') }));
  w.plans = [plan({ resources: RES, timesheets: [{ id: 'ts1', taskId: 't1', date: '2026-10-04', hours: 1 }],
    tasks: [{ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: '2026-10-05T11:00' }] })];
  assert.deepEqual(w.events(), { done: [], rework: [], ask: [] }, 'nothing is charged twice');
});

test('planner: a timer-logged completion more than 24 h before doneAt is reopened, not covered', () => {
  const w = world([finished()]);
  const timer = makeDone(w.db(), 'task_pl_plan_web_t1', { end: doneMs('2026-09-30T10:00'), minutes: 50 });
  w.flow.push(timer);
  const out = w.events();
  assert.deepEqual(out.done, []);
  assert.equal(out.ask.length, 1);
  assert.equal(out.ask[0].done, timer.id);
});

// ─── from when (settings.plannerSince) ──────────────────────────────────────

test('planner: with no since, nothing is logged — it needs the stamp', () => {
  const w = world([finished()]);
  for (const since of [undefined, null]) {
    assert.deepEqual(plannerEvents(index(w.flow), w.plans, { me: 'Ana', now: NOW, since }), { done: [], rework: [], ask: [] }, `since = ${since}`);
  }
});

test('planner: completions before since are history — not logged', () => {
  const w = world([finished()]);
  assert.deepEqual(w.events({ since: doneMs(DONE_AT) + 60000 }), { done: [], rework: [], ask: [] });
  assert.equal(w.events({ since: doneMs(DONE_AT) }).done.length, 1, 'doneAt ≥ since is logged');
});

test('planner: a finish before since is not treated as a reopen of an earlier completion', () => {
  const w = world([finished('2026-09-20T10:00')]);
  w.flow.push(makeDone(w.db(), 'task_pl_plan_web_t1', { end: doneMs('2026-09-10T10:00'), minutes: 50 }));
  assert.deepEqual(w.events({ since: T('2026-09-25T00:00:00') }), { done: [], rework: [], ask: [] });
});

test('planner: completions after since in a plan archived since are still logged', () => {
  const p = plan({ archived: true, resources: RES, tasks: [{ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: DONE_AT }] });
  assert.deepEqual(ids(derive([p])), [], 'not on the list of tasks to do');
  const out = world([p]).events();
  assert.equal(out.done.length, 1);
  assert.equal(out.done[0].id, `done_pl_plan_web_t1_${doneMs(DONE_AT)}`);
  assert.equal(out.done[0].minutes, 60);
});

test('planner: a reopen in a plan archived since is still rework', () => {
  const w = world([finished()]);
  const first = w.apply(w.events()).done[0];
  w.plans = [plan({ archived: true, resources: RES, timesheets: [{ id: 'ts1', taskId: 't1', date: '2026-10-04', hours: 1 }],
    tasks: [{ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: '2026-10-05T11:00' }] })];
  const out = w.events();
  assert.equal(out.rework.length, 1);
  assert.equal(out.rework[0].done, first.id);
  assert.equal(out.rework[0].minutes, 60);
});

test('planner: templates never count', () => {
  const p = plan({ template: true, resources: RES, tasks: [{ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: DONE_AT }] });
  assert.deepEqual(world([p]).events(), { done: [], rework: [], ask: [] });
  assert.deepEqual(world([{ ...p, body: JSON.stringify({ ...JSON.parse(p.body), archived: true }) }]).events(), { done: [], rework: [], ask: [] }, 'an archived template neither');
});
