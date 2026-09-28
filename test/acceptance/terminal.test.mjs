// SPEC.md › Terminal: the iPhone app (decided 2026-09-28) and its "Writing to
// Planner". Black-box: only the public exports of src/planops.js (the ops
// writer and the timer's records), src/planner.js (derived and pending tasks,
// the project list) and src/model.js (I'm tired, energy, the picker, replay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OP_TYPE, isOp, addTaskOp, timesheetOp, opsToWrite, pushOps, stopTimer, pauseTimer,
} from '../../src/planops.js';
import { plannerTasks, projectList, expiredOps, OPS_KEEP_DAYS } from '../../src/planner.js';
import {
  index, makeDone, makeTired, energyOn, pickNext, replayDay, isDoneFor, dayOf, DEFAULT_STATS, TIRED_CAPS,
} from '../../src/model.js';
import { baseRecords, game, T } from '../helpers.mjs';

const D = '2026-09-28'; // a Monday
const NOW = T(`${D}T12:00:00`);
const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));
const SKILLS = baseRecords().filter((r) => r.type === 'skill');
const ME = 'Ana';

const ptask = (fields) => ({
  name: 'New task', level: 1, duration: 1, milestone: false, work: null, percent: 0, urgency: 'normal',
  deadline: null, archived: false, stageId: null, assignments: [], ...fields,
});
/** A plan as Planner syncs it: a document record whose body is the saved JSON. */
function plan({ id = 'plan_web', name = 'Website relaunch', tasks = [], resources = [], timesheets = [], ...rest } = {}) {
  const body = {
    id, name, format: 'project-planner', version: 1, start: '2026-09-01',
    calendar: { workDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] }, agenda: { assumedLoad: 100 },
    stages: [], template: false, archived: false, pinned: false, workspaceId: null, folderId: null,
    tasks: tasks.map(ptask), resources, timesheets, ...rest,
  };
  return { id, type: 'document', format: 'project-planner', name, body: JSON.stringify(body), updatedAt: 1, origin: 'planner' };
}
const derive = (records, now = NOW) => plannerTasks(records, { me: ME, skills: SKILLS, stats: STATS, now });
/** Flow's db with the derived Planner tasks in it, as the app builds it. */
const dbWith = (records, planRecords) => {
  const d = derive(planRecords);
  return index([...records, ...d.skills, ...d.tasks]);
};
const stamped = (op, origin = 'dev1') => ({ ...op, updatedAt: op.at, origin });

// ─── (a) the ops writer ─────────────────────────────────────────────────────

test('terminal: addTaskOp → a write-once flow.op record adding a task with a Flow-made t_flow_ id', () => {
  const op = addTaskOp({ plan: 'plan_web', name: '  Fix the footer ', work: 1.5, deadline: '2026-10-02', me: ME, now: NOW });
  assert.equal(op.type, 'flow.op');
  assert.equal(OP_TYPE, 'flow.op');
  assert.ok(isOp(op));
  assert.equal(op.op, 'addTask');
  assert.equal(op.plan, 'plan_web');
  assert.equal(op.at, NOW);
  assert.equal(typeof op.id, 'string');
  assert.match(op.task.id, /^t_flow_[A-Za-z0-9]+$/);
  assert.deepEqual({ ...op.task, id: 'x' }, { id: 'x', name: 'Fix the footer', work: 1.5, deadline: '2026-10-02' });
  assert.equal(op.me, ME, 'the player’s Planner name, for Planner to find their resource');
  const other = addTaskOp({ plan: 'plan_web', name: 'Fix the footer', me: ME, now: NOW });
  assert.notEqual(other.id, op.id);
  assert.notEqual(other.task.id, op.task.id, 'every added task gets its own id');
});

test('terminal: addTaskOp — hours and deadline are optional (null); a name is required', () => {
  const op = addTaskOp({ plan: 'plan_web', name: 'Call the printer', me: ME, now: NOW });
  assert.equal(op.task.work, null);
  assert.equal(op.task.deadline, null);
  assert.throws(() => addTaskOp({ plan: 'plan_web', name: '   ', me: ME, now: NOW }), /name/i);
  assert.throws(() => addTaskOp({ plan: '', name: 'X', me: ME, now: NOW }), /plan|project/i);
  assert.throws(() => addTaskOp({ plan: 'plan_web', name: 'X', work: -1, me: ME, now: NOW }), /hours/i);
  assert.throws(() => addTaskOp({ plan: 'plan_web', name: 'X', deadline: '2026-13-40', me: ME, now: NOW }), /deadline/i);
});

test('terminal: timesheetOp → date, start in minutes into the day, hours = minutes / 60, note "Flow timer"', () => {
  const op = timesheetOp({ plan: 'plan_web', task: 't1', start: T(`${D}T09:15:00`), minutes: 90, me: ME });
  assert.equal(op.type, 'flow.op');
  assert.equal(op.op, 'timesheet');
  assert.equal(op.plan, 'plan_web');
  assert.equal(op.task, 't1');
  assert.equal(op.date, D);
  assert.equal(op.start, 9 * 60 + 15);
  assert.equal(op.hours, 1.5);
  assert.equal(op.note, 'Flow timer');
  assert.equal(op.me, ME);
  assert.equal(typeof op.at, 'number');
  assert.equal(timesheetOp({ plan: 'p', task: 't', start: T(`${D}T23:50:00`), minutes: 20, me: ME }).date, D, 'the day it started');
});

test('terminal: ops are write-once — an op id already held is refused, and only flow.op records go in', () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'A', me: ME, now: NOW }));
  assert.deepEqual(opsToWrite([], [op]).map((r) => r.id), [op.id]);
  assert.throws(() => opsToWrite([op], [{ ...op, task: { ...op.task, name: 'B' } }]), /write-once|already/i);
  assert.throws(() => opsToWrite([], [plan()]), /flow\.op/);
});

test('terminal: Flow pushes only flow.op records to Planner’s workspace — never a document', async () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'A', me: ME, now: NOW }));
  const theirs = stamped(timesheetOp({ plan: 'plan_web', task: 't1', start: NOW, minutes: 30, me: ME }), 'dev2');
  // A plan this device somehow stamped as its own must still never leave.
  const doc = { ...plan(), origin: 'dev1', updatedAt: NOW };
  const sent = [];
  const transport = { push: async ({ records }) => { sent.push(...records); return { accepted: records.length, cursor: 1 }; } };
  const out = await pushOps([doc, op, theirs, { id: 'x', type: 'workspace', origin: 'dev1', updatedAt: 1 }], transport, { deviceId: 'dev1' });
  assert.deepEqual(sent.map((r) => r.id), [op.id]);
  assert.ok(sent.every((r) => r.type === 'flow.op'));
  assert.deepEqual(out, [op.id]);
  const again = await pushOps([doc, op], transport, { deviceId: 'dev1', sent: new Set(out) });
  assert.deepEqual(again, [], 'an op is sent once');
  assert.equal(sent.length, 1);
});

// ─── (b) pending tasks from unapplied addTask ops ───────────────────────────

test('terminal: an unapplied addTask is a derived task at once — same id as Planner’s will be, estimate from hours', () => {
  const plans = [plan({ tasks: [{ id: 't1', name: 'Write copy' }] })];
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'Fix the footer', work: 2, deadline: '2026-10-02', me: ME, now: NOW }));
  const d = derive([...plans, op]);
  const t = d.tasks.find((x) => x.title === 'Fix the footer');
  assert.ok(t, 'the pending task is there');
  assert.equal(t.id, `task_pl_plan_web_${op.task.id}`);
  assert.deepEqual(t.source, { app: 'project', plan: 'plan_web', task: op.task.id });
  assert.equal(t.pending, true, 'marked "sending to Planner"');
  assert.equal(t.estimate, 120);
  assert.equal(t.deadline, '2026-10-02');
  assert.equal(t.project, 'Website relaunch');
  assert.equal(t.measure, 'time');
  assert.equal(t.cadence, 'once');
});

test('terminal: a pending task without hours is estimated at 30 minutes', () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'Quick call', me: ME, now: NOW }));
  const t = derive([plan(), op]).tasks.find((x) => x.title === 'Quick call');
  assert.equal(t.estimate, 30);
});

test('terminal: once the plan holds that task id, the pending task becomes the real one — never both', () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'Fix the footer', work: 2, me: ME, now: NOW }));
  const applied = plan({ tasks: [{ id: 't1', name: 'Write copy' }, { id: op.task.id, name: 'Fix the footer (renamed)', work: 3 }], appliedOps: [{ id: op.id, at: NOW }] });
  const d = derive([applied, op]);
  const same = d.tasks.filter((t) => t.id === `task_pl_plan_web_${op.task.id}`);
  assert.equal(same.length, 1, 'one task, not a duplicate');
  assert.equal(same[0].title, 'Fix the footer (renamed)', 'Planner’s version wins');
  assert.equal(same[0].estimate, 180);
  assert.ok(!same[0].pending);
});

test('terminal: a pending addTask older than 90 days is dropped (Planner no longer applies it) and listed once as expired', () => {
  assert.equal(OPS_KEEP_DAYS, 90);
  const old = stamped(addTaskOp({ plan: 'plan_web', name: 'Too old', me: ME, now: T('2026-06-01T12:00:00') }));
  const fresh = stamped(addTaskOp({ plan: 'plan_web', name: 'Fresh', me: ME, now: T('2026-07-15T12:00:00') }));
  const titles = derive([plan(), old, fresh]).tasks.map((t) => t.title);
  assert.deepEqual(titles, ['Fresh']);
  assert.deepEqual(expiredOps([plan(), old, fresh], { now: NOW }).map((o) => o.id), [old.id]);
  const applied = plan({ tasks: [{ id: old.task.id, name: 'Too old' }] });
  assert.deepEqual(expiredOps([applied, old], { now: NOW }), [], 'an applied one never expires: Planner has it');
});

test('terminal: an op Planner applied and skipped (plan says applied, no task) leaves no pending task; nor does an op for a plan Flow does not hold', () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'Gone', me: ME, now: NOW }));
  assert.equal(derive([plan({ appliedOps: [{ id: op.id, at: NOW }] }), op]).tasks.length, 0);
  const elsewhere = stamped(addTaskOp({ plan: 'plan_other', name: 'Nowhere', me: ME, now: NOW }));
  assert.equal(derive([plan(), elsewhere]).tasks.length, 0);
});

test('terminal: a completion of the pending task still points at the same task after Planner applies it', () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'Fix the footer', work: 1, me: ME, now: NOW }));
  const before = dbWith(baseRecords(), [plan(), op]);
  const task = before.tasks.find((t) => t.pending);
  const done = makeDone(before, task, { end: NOW, minutes: 50 });
  const after = dbWith([...baseRecords(), done], [plan({ tasks: [{ id: op.task.id, name: 'Fix the footer', work: 1 }], appliedOps: [{ id: op.id, at: NOW }] }), op]);
  assert.equal(after.task.get(done.task)?.title, 'Fix the footer');
  assert.ok(isDoneFor(after, after.task.get(done.task), D));
});

// ─── (c) the project list ───────────────────────────────────────────────────

test('terminal: projects are plans with at least one task for the player, not archived or templates, pinned first then by name', () => {
  const RES = [{ id: 'r_ana', name: 'Ana' }, { id: 'r_ben', name: 'Ben' }];
  const plans = [
    plan({ id: 'p_zeta', name: 'Zeta', tasks: [{ id: 'a', name: 'A' }] }),
    plan({ id: 'p_alpha', name: 'Alpha', tasks: [{ id: 'a', name: 'A' }] }),
    plan({ id: 'p_pinned', name: 'Moon', pinned: true, tasks: [{ id: 'a', name: 'A' }] }),
    plan({ id: 'p_bens', name: 'Bens', resources: RES, tasks: [{ id: 'a', name: 'A', assignments: [{ resourceId: 'r_ben', units: 1 }] }] }),
    plan({ id: 'p_empty', name: 'Empty' }),
    plan({ id: 'p_arch', name: 'Archived', archived: true, tasks: [{ id: 'a', name: 'A' }] }),
    plan({ id: 'p_tpl', name: 'Template', template: true, tasks: [{ id: 'a', name: 'A' }] }),
  ];
  const list = projectList(dbWith(baseRecords(), plans), plans, { me: ME, now: NOW });
  assert.deepEqual(list.map((p) => p.id), ['p_pinned', 'p_alpha', 'p_zeta']);
  assert.equal(list[0].name, 'Moon');
  assert.equal(list[0].pinned, true);
});

test('terminal: each project shows its open task count, the next deadline and the minutes logged this week', () => {
  const plans = [plan({
    tasks: [
      { id: 't1', name: 'Write copy', deadline: '2026-10-09' },
      { id: 't2', name: 'Pick photos', deadline: '2026-10-01' },
      { id: 't3', name: 'Shipped', percent: 100, doneAt: '2026-09-20', deadline: '2026-09-25' },
      { id: 't4', name: 'Done in Flow', deadline: '2026-09-29' },
    ],
    timesheets: [
      { id: 'ts1', taskId: 't1', date: '2026-09-28', start: 480, hours: 1 }, // this week (Mon)
      { id: 'ts2', taskId: 't2', date: '2026-09-27', start: 480, hours: 2 }, // last week (Sun)
    ],
  })];
  const records = [...baseRecords()];
  const db0 = dbWith(records, plans);
  records.push(makeDone(db0, db0.task.get('task_pl_plan_web_t4'), { end: T(`${D}T10:00:00`), minutes: 40 }));
  // A timesheet Flow sent that Planner has not applied yet counts too.
  const pendingSheet = stamped(timesheetOp({ plan: 'plan_web', task: 't2', start: T(`${D}T11:00:00`), minutes: 30, me: ME }));
  const planRecords = [...plans, pendingSheet];
  const [p] = projectList(dbWith(records, planRecords), planRecords, { me: ME, now: NOW });
  assert.equal(p.open, 2, 'Write copy and Pick photos');
  assert.deepEqual(p.tasks.map((t) => t.title).sort(), ['Pick photos', 'Write copy']);
  assert.equal(p.deadline, '2026-10-01', 'the earliest deadline among open tasks');
  assert.equal(p.weekMinutes, 60 + 30);
});

test('terminal: an applied timesheet op is counted once — from the plan, not the op', () => {
  const op = stamped(timesheetOp({ plan: 'plan_web', task: 't1', start: T(`${D}T09:00:00`), minutes: 45, me: ME }));
  const plans = [plan({ tasks: [{ id: 't1', name: 'Write copy' }], timesheets: [{ id: 'ts_x', taskId: 't1', date: D, start: 540, hours: 0.75, note: 'Flow timer' }], appliedOps: [{ id: op.id, at: NOW }] })];
  const [p] = projectList(dbWith(baseRecords(), plans), [...plans, op], { me: ME, now: NOW });
  assert.equal(p.weekMinutes, 45);
});

test('terminal: a pending task counts as an open task of its project', () => {
  const op = stamped(addTaskOp({ plan: 'plan_web', name: 'New one', me: ME, now: NOW }));
  const plans = [plan({ tasks: [{ id: 't1', name: 'Write copy' }] }), op];
  const [p] = projectList(dbWith(baseRecords(), plans), plans, { me: ME, now: NOW });
  assert.equal(p.open, 2);
  assert.ok(p.tasks.some((t) => t.pending && t.title === 'New one'));
});

// ─── (d) Stop and Pause ─────────────────────────────────────────────────────

const timerSetup = () => {
  const plans = [plan({ tasks: [{ id: 't1', name: 'Write copy', work: 1 }] })];
  const records = [...baseRecords()];
  const db = dbWith(records, plans);
  const timer = { task: 'task_pl_plan_web_t1', start: T(`${D}T10:00:00`) };
  return { plans, records, db, timer };
};

test('terminal: Stop logs the Flow completion as Log done does and a timesheet entry on the Planner task', () => {
  const { db, timer } = timerSetup();
  const out = stopTimer(db, timer, { now: T(`${D}T10:45:00`), me: ME, quality: 1 });
  assert.equal(out.done.type, 'done');
  assert.equal(out.done.task, timer.task);
  assert.equal(out.done.minutes, 45);
  assert.equal(out.done.end, T(`${D}T10:45:00`));
  assert.equal(out.done.timed, true);
  assert.ok(out.done.price.points > 0, 'priced by the normal rules');
  const logDone = makeDone(db, db.task.get(timer.task), { end: T(`${D}T10:45:00`), minutes: 45, quality: 1, timed: true });
  assert.deepEqual(out.done.price, logDone.price, 'the same price Log done gives');
  assert.equal(out.op.op, 'timesheet');
  assert.equal(out.op.plan, 'plan_web');
  assert.equal(out.op.task, 't1');
  assert.equal(out.op.date, D);
  assert.equal(out.op.start, 600);
  assert.equal(out.op.hours, 0.75);
  assert.equal(out.op.me, ME);
});

test('terminal: Stop with the minutes changed on the log sheet logs those minutes in both places', () => {
  const { db, timer } = timerSetup();
  const out = stopTimer(db, timer, { now: T(`${D}T10:45:00`), me: ME, minutes: 30, quality: 0.8 });
  assert.equal(out.done.minutes, 30);
  assert.equal(out.done.quality, 0.8);
  assert.equal(out.op.hours, 0.5);
});

test('terminal: Stop on a rework timer logs the rework (as on Now) and the timesheet', () => {
  const { records, plans, timer } = timerSetup();
  const db0 = dbWith(records, plans);
  const first = makeDone(db0, db0.task.get(timer.task), { end: T('2026-09-25T12:00:00'), minutes: 60 });
  const db = dbWith([...records, first], plans);
  const out = stopTimer(db, { ...timer, reworkOf: first.id }, { now: T(`${D}T10:20:00`), me: ME });
  assert.equal(out.done, null);
  assert.equal(out.rework.type, 'rework');
  assert.equal(out.rework.done, first.id);
  assert.equal(out.rework.minutes, 20);
  assert.equal(out.op.op, 'timesheet');
  assert.equal(out.op.hours, Math.round((20 / 60) * 100) / 100);
});

test('terminal: Pause writes the timesheet entry only — no completion, the task stays open, the timer is cleared', () => {
  const { records, plans, db, timer } = timerSetup();
  const out = pauseTimer(db, timer, { now: T(`${D}T11:00:00`), me: ME });
  assert.equal(out.timer, null, 'the timer is cleared');
  assert.ok(!('done' in out) || out.done == null, 'nothing is completed');
  assert.equal(out.op.op, 'timesheet');
  assert.equal(out.op.hours, 1);
  assert.equal(out.op.start, 600);
  const planRecords = [...plans, stamped(out.op)];
  const after = dbWith(records, planRecords);
  assert.ok(!isDoneFor(after, after.task.get(timer.task), D), 'still open');
  const [p] = projectList(after, planRecords, { me: ME, now: T(`${D}T11:00:00`) });
  assert.equal(p.open, 1);
  assert.equal(p.weekMinutes, 60);
});

test('terminal: Stop and Pause on a Flow task (no Planner source) write no op', () => {
  const g = game();
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30 });
  const timer = { task: t.id, start: T(`${D}T10:00:00`) };
  assert.equal(stopTimer(g.db(), timer, { now: T(`${D}T10:30:00`), me: ME }).op, null);
  assert.equal(pauseTimer(g.db(), timer, { now: T(`${D}T10:30:00`), me: ME }).op, null);
});

// ─── (e) I'm tired ──────────────────────────────────────────────────────────

test('tired: the caps are A bit 6, Very 3, Wiped out 1', () => {
  assert.deepEqual(TIRED_CAPS, { bit: 6, very: 3, wiped: 1 });
});

test('tired: makeTired writes an energy check-in, feeling tired, the chosen meter at min(current, cap), the other unchanged', () => {
  const g = game();
  g.energy(`${D}T07:00:00`, 8, 8);
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30, mana: 2, stamina: 0.5 });
  g.done(t, `${D}T09:00:00`, 30); // mana 8 → 6, stamina 8 → 7.5
  const at = T(`${D}T12:00:00`);
  const r = makeTired(g.db(), { body: false, mind: true, level: 'very', at });
  assert.equal(r.type, 'energy');
  assert.equal(r.feeling, 'tired');
  assert.equal(r.day, D);
  assert.equal(r.at, at);
  assert.equal(r.mana, 3);
  assert.equal(r.stamina, 7.5, 'unchanged');
  assert.ok(r.id.startsWith('energy_'));
});

test('tired: both meters, and a cap above the current value keeps the current value', () => {
  const g = game();
  g.energy(`${D}T07:00:00`, 5, 2);
  const at = T(`${D}T12:00:00`);
  const bit = makeTired(g.db(), { body: true, mind: true, level: 'bit', at });
  assert.equal(bit.stamina, 5);
  assert.equal(bit.mana, 2);
  const wiped = makeTired(g.db(), { body: true, mind: true, level: 'wiped', at });
  assert.equal(wiped.stamina, 1);
  assert.equal(wiped.mana, 1);
  const body = makeTired(g.db(), { body: true, mind: false, level: 'wiped', at });
  assert.equal(body.stamina, 1);
  assert.equal(body.mana, 2);
});

test('tired: needs a meter and a known level', () => {
  const g = game();
  g.energy(`${D}T07:00:00`, 8, 8);
  assert.throws(() => makeTired(g.db(), { body: false, mind: false, level: 'bit', at: NOW }), /body|mind/i);
  assert.throws(() => makeTired(g.db(), { body: true, mind: false, level: 'exhausted', at: NOW }), /level/i);
});

test('tired: from then the day’s energy runs from it, as from the morning rating', () => {
  const g = game();
  g.energy(`${D}T07:00:00`, 8, 8);
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30, mana: 1 });
  g.add(makeTired(g.db(), { body: true, mind: false, level: 'very', at: T(`${D}T12:00:00`) }));
  let e = energyOn(g.db(), D);
  assert.equal(e.stamina, 3);
  assert.equal(e.mana, 8);
  g.done(t, `${D}T13:00:00`, 30);
  e = energyOn(g.db(), D);
  assert.equal(e.mana, 7, 'later drains come off the check-in');
  assert.equal(e.stamina, 3);
});

test('tired: the Next picker leans to rest when a meter is low', () => {
  const g = game();
  g.energy(`${D}T07:00:00`, 8, 8);
  g.task({ title: 'A deep report', skill: 'sk_read', estimate: 60, mana: 4 });
  g.task({ title: 'Nap', skill: 'sk_read', estimate: 20, mana: -2 });
  const before = pickNext(g.db(), NOW);
  assert.equal(before.next.title, 'A deep report');
  g.add(makeTired(g.db(), { body: false, mind: true, level: 'very', at: T(`${D}T11:00:00`) }));
  const after = pickNext(g.db(), NOW);
  assert.equal(after.next.title, 'Nap', 'the report costs more mana than is left');
});

test('tired: the replay shows the check-in as a moment of the day, and the meters drop to it there', () => {
  const g = game();
  g.energy(`${D}T07:00:00`, 8, 8);
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30, mana: 1 });
  g.done(t, `${D}T09:00:00`, 30);
  g.add(makeTired(g.db(), { body: true, mind: true, level: 'wiped', at: T(`${D}T12:00:00`) }));
  const r = replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  assert.equal(r.start.stamina, 8, 'the day still starts from the morning rating');
  assert.equal(r.series[0].stamina, 8);
  const beat = r.beats.find((b) => b.tired);
  assert.ok(beat, 'a tired beat');
  assert.equal(beat.kind, 'moment');
  assert.match(beat.text, /tired/i);
  assert.equal(beat.start, T(`${D}T12:00:00`));
  assert.deepEqual({ stamina: beat.after.stamina, mana: beat.after.mana }, { stamina: 1, mana: 1 });
  const done = r.beats.find((b) => b.kind === 'done');
  assert.equal(done.after.mana, 7, 'before it, the morning rating less the drain');
  assert.equal(dayOf(beat.start), D);
});
