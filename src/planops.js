// flow/src/planops.js — Flow's operations on Planner (SPEC.md › Terminal: the
// iPhone app › Writing to Planner). Pure but for pushOps, which is handed its
// transport: no DOM, no storage, no clock it did not get.
//
// Flow never rewrites a plan. It writes write-once records into Planner's
// `project` workspace and Planner applies them to the plan itself (Planner's
// src/model/flowops.js), recording what it applied in the plan's
// `appliedOps: [{ id, at }]`:
//
//   { id, type: 'flow.op', op: 'addTask', plan, at, origin, me,
//     task: { id: 't_flow_…', name, work (hours) | null, deadline | null } }
//   { id, type: 'flow.op', op: 'timesheet', plan, at, origin, me,
//     task, date, start (minutes into the day), hours, note: 'Flow timer' }
//
// `me` is the player's Planner name: Planner puts the task and the hours on
// the plan's resource of that name (case- and space-insensitive), else leaves
// them unassigned. `origin` and `updatedAt` are stamped when the store writes
// the op, as for every record.
//
// The timer's two endings live here too, so the Terminal, Now and the tests
// share them: Stop = the completion Log done would write + a timesheet op;
// Pause = the timesheet op only.

import { newId, dayOf, isDay, makeDone, makeRework } from './model.js';
import { OP_TYPE } from './planner.js';
import { elapsedMinutes } from './util.js';

export { OP_TYPE };
export const TIMESHEET_NOTE = 'Flow timer';

/** Whether a record is one of Flow's operations. */
export const isOp = (r) => !!r && r.type === OP_TYPE && typeof r.id === 'string' && !r.deletedAt;

/** A task id Flow makes, so the task it shows before and after Planner applies it is the same task. */
function flowTaskId() {
  const rand = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14);
  return `t_flow_${rand}`;
}

/** An op's own id: sorts by time, never collides across devices. */
const opId = (at) => newId('op', at);

/**
 * + Add task: an addTask op for a plan. `work` is hours (optional), the
 * deadline 'YYYY-MM-DD' (optional).
 *
 * `id` is how a task Flow already has becomes the *same* task in Planner
 * rather than a second one beside it. Planner inserts the task under exactly
 * the id the op carries (Planner's flowops.js › addTask), and Flow's derived
 * definitions replace a task of the same id (planner.js › withDefinitions) —
 * so passing a Flow task's own id converts it in place, keeping every
 * completion, run and streak already recorded against that id. Left out, a
 * fresh `t_flow_…` id is minted and the task is new on both sides.
 */
export function addTaskOp({ plan, name, work = null, deadline = null, me = '', now = Date.now(), id = null }) {
  if (typeof plan !== 'string' || !plan) throw new Error('Which project?');
  const title = String(name ?? '').trim();
  if (!title) throw new Error('The task needs a name.');
  let hours = null;
  if (work !== null && work !== undefined && work !== '') {
    hours = Number(work);
    if (!(Number.isFinite(hours) && hours > 0)) throw new Error('Hours are a number above 0, or empty.');
    hours = Math.round(hours * 100) / 100;
  }
  const due = deadline === null || deadline === undefined || deadline === '' ? null : deadline;
  if (due !== null && !isDay(due)) throw new Error('The deadline is a date, or empty.');
  if (id !== null && id !== undefined && (typeof id !== 'string' || !id.trim())) {
    throw new Error('A task id is a non-empty string, or leave it out for a new one.');
  }
  return {
    id: opId(now), type: OP_TYPE, op: 'addTask', plan, at: now, me: String(me || ''),
    task: { id: id ? id.trim() : flowTaskId(), name: title, work: hours, deadline: due },
  };
}

/**
 * Send a task Flow owns to a Planner plan, so its time starts counting there.
 *
 * Flow's own tasks never reach Planner: the timer writes a timesheet op only
 * for a task that came *from* Planner (`sheetFor`), so a cycling task created
 * in Flow and a "Daily Cycling" task typed into Planner are two unrelated
 * things that each record half the story. This makes the Flow one real in the
 * plan, and from then on every timer stop writes a timesheet line on it.
 *
 * **It does not merge the two, and cannot.** A task derived from a plan gets
 * the id `task_pl_<plan>_<task>` (planner.js › derive), never the plain id the
 * op carried, so the Planner task comes back as a *new* Flow task and the
 * original stays beside it with its runs, best and streak. The caller archives
 * the original — see the Tasks screen — and the streak starts again on the
 * Planner one. Carrying the history across would mean rewriting every
 * completion's task id, which is a migration and not this function's job.
 *
 * The task's own id is still passed through, so the plan and Flow agree on
 * which Planner task this is and a re-sync cannot add it twice (Planner's
 * flowops.js › addTask returns early when `getTask` already finds the id).
 */
export function sendToPlannerOp(task, { plan, me = '', now = Date.now() } = {}) {
  if (!task || typeof task !== 'object') throw new Error('Which task?');
  if (task.source) throw new Error(`"${task.title || task.id}" already comes from Planner.`);
  const minutes = Number(task.estimate);
  return addTaskOp({
    plan,
    name: task.title ?? task.name ?? '',
    // Flow keeps an estimate in minutes; Planner's work is hours.
    work: Number.isFinite(minutes) && minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : null,
    deadline: task.deadline || null,
    me,
    now,
    id: task.id,
  });
}

/** The id Flow will know a Planner task by, once the plan comes back. */
export const derivedTaskId = (plan, task) => `task_pl_${plan}_${task}`;

/**
 * A timesheet entry for a Planner task: the day the work started, its start
 * in minutes into that day, and hours = minutes / 60 (to the hundredth).
 * `task` is Planner's task id. Written as of the end of the work.
 */
export function timesheetOp({ plan, task, start, minutes, me = '' }) {
  if (typeof plan !== 'string' || !plan) throw new Error('Which project?');
  if (typeof task !== 'string' || !task) throw new Error('Which task?');
  const mins = Number(minutes);
  if (!Number.isFinite(start) || !(mins > 0)) throw new Error('A timesheet needs a start and minutes.');
  const d = new Date(start);
  const at = start + mins * 60000;
  return {
    id: opId(at), type: OP_TYPE, op: 'timesheet', plan, at, me: String(me || ''),
    task, date: dayOf(start), start: d.getHours() * 60 + d.getMinutes(),
    hours: Math.round((mins / 60) * 100) / 100, note: TIMESHEET_NOTE,
  };
}

/**
 * The ops to write: only flow.op records, each new. Ops are write-once, so
 * an id already held is refused, like every event in Flow's own store.
 */
export function opsToWrite(held, ops) {
  const have = new Set((held instanceof Map ? [...held.keys()] : (held || []).map((r) => r?.id)));
  const out = [];
  for (const op of ops || []) {
    if (!op || op.type !== OP_TYPE) throw new Error(`Only ${OP_TYPE} records are written to Planner's workspace.`);
    if (typeof op.id !== 'string' || !op.id) throw new Error('An op needs an id.');
    if (have.has(op.id)) throw new Error(`${OP_TYPE} ${op.id} already exists: ops are write-once.`);
    have.add(op.id);
    out.push(op);
  }
  return out;
}

/**
 * Push this device's ops that have not been sent to Planner's workspace, and
 * nothing else: whatever else is in `records` — plans, workspaces, another
 * device's ops — never leaves. Returns the ids the server took; a failed
 * push throws and is retried next time.
 */
export async function pushOps(records, transport, { deviceId, sent = new Set() } = {}) {
  const mine = (records || []).filter((r) => isOp(r) && r.origin === deviceId && !sent.has(r.id));
  if (!mine.length) return [];
  await transport.push({ records: mine, deviceId });
  return mine.map((r) => r.id);
}

/** The Planner task behind a Flow task, or null for Flow's own. */
const plannerSource = (task) => (task?.source?.app === 'project' ? task.source : null);

function sheetFor(task, timer, minutes, me) {
  const src = plannerSource(task);
  return src ? timesheetOp({ plan: src.plan, task: src.task, start: timer.start, minutes, me }) : null;
}

/**
 * Stop & log: the completion exactly as Log done writes it (points, energy;
 * rework when the timer was rework of an earlier run) and, for a Planner
 * task, a timesheet op for the same minutes. `minutes` defaults to the
 * timer's; the log sheet can change it.
 */
export function stopTimer(db, timer, { now = Date.now(), me = '', minutes, quality, value, note = '' } = {}) {
  const task = db.task.get(timer.task);
  if (!task) throw new Error('That task is not in Flow any more.');
  const mins = Number(minutes) > 0 ? Math.round(Number(minutes)) : elapsedMinutes(timer.start, now);
  const op = sheetFor(task, timer, mins, me);
  if (timer.reworkOf) {
    return { done: null, rework: makeRework(db, timer.reworkOf, { minutes: mins, at: now, note }), op, timer: null };
  }
  const done = makeDone(db, task, { end: now, minutes: mins, value, quality, timed: true, note });
  return { done, rework: null, op, timer: null };
}

/**
 * Pause: stop the clock without finishing — the timesheet op only. The task
 * stays open; Flow logs it when it is finished (here, or in Planner).
 */
export function pauseTimer(db, timer, { now = Date.now(), me = '' } = {}) {
  const task = db.task.get(timer.task);
  if (!task) throw new Error('That task is not in Flow any more.');
  return { op: sheetFor(task, timer, elapsedMinutes(timer.start, now), me), timer: null };
}

/**
 * Where Planner's workspace is, from Flow's sync address: the paired
 * Portal's origin (or a Flow workspace URL on it) → its /w/project.
 */
export function plannerUrlFrom(flowUrl) {
  const u = String(flowUrl || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  const m = /^(https?:\/\/[^/]+)(?:\/.*)?$/.exec(u);
  return m ? `${m[1]}/w/project` : '';
}
