// flow/src/planner.js — tasks from Project Planner. Pure: no DOM, no storage,
// no clock it did not get as an argument, like src/model.js.
//
// Planner (toolkit app `project`) syncs each plan as a sync-kit record,
// `{ type: 'document', format: 'project-planner', body }`, where `body` is
// the plan's saved JSON, and each workspace as `{ type: 'workspace', name,
// folders }`. Flow reads those read-only: it never writes a plan.
//
//   plannerTasks  — the player's Planner tasks as derived Flow definitions
//                   (tasks, plus skills for Planner skills Flow does not have).
//                   Never stored: they are rebuilt from the plans every time.
//   plannerEvents — what Flow should write now: a completion for each task
//                   finished in Planner that Flow has not logged, rework for
//                   each one reopened and finished again, and the questions
//                   to ask when Planner does not say how long a fix took.
//
// Only the few rules Flow needs are reimplemented here (Planner's expected
// hours, skillOf, energyOf); nothing is imported from Planner.

import { DEFAULT_STATS, makeDone, makeRework, isDay, dayOf, isDoneFor, isoWeek } from './model.js';

/** Flow's operations (SPEC.md › Writing to Planner): write-once records Planner applies to its plans. */
export const OP_TYPE = 'flow.op';
/** The day Planner publishes: what its calendar laid on a date, in order (Planner's model/dayplan.js). */
export const AGENDA_TYPE = 'agenda';
/** Planner keeps applied op ids this long and ignores older ops; Flow stops showing them as pending. */
export const OPS_KEEP_DAYS = 90;
const OPS_KEEP_MS = OPS_KEEP_DAYS * 86400000;
/** A task added with no hours is estimated at this many minutes until Planner has it. */
export const PENDING_ESTIMATE_MIN = 30;

/**
 * Catching up, not working — the same rule Planner files a completion under
 * (its model/dayplan.js), reimplemented here as `planner.js` reimplements
 * every Planner rule Flow needs, because the two apps share no code.
 *
 * Ticking off a year of finished work in one sitting is housekeeping. Planner
 * stopped listing those under "Completed today"; Flow must also stop paying
 * for them, or a morning of box-ticking arrives as ninety completions, three
 * thousand points and two levels.
 */
export const CAUGHT_UP_DAYS = 183;
/** A run of this many Planner finishes inside this long is a burst. */
export const BURST_COUNT = 5;
export const BURST_MS = 10 * 60000;

/** The ids of the finishes that were catching up: long overdue, or in a burst. */
export function caughtUpFinishes(finished, { days = CAUGHT_UP_DAYS, count = BURST_COUNT, within = BURST_MS } = {}) {
  const hit = new Set();
  for (const e of finished || []) {
    const due = e?.task?.deadline;
    if (isDay(due) && Number.isFinite(e.doneAt) && e.doneAt - Date.parse(`${due}T00:00:00`) > days * 86400000) hit.add(e.task.id);
  }
  const timed = (finished || []).filter((e) => Number.isFinite(e?.doneAt)).sort((a, b) => a.doneAt - b.doneAt);
  for (let i = 0; i < timed.length; i++) {
    let j = i;
    while (j + 1 < timed.length && timed[j + 1].doneAt - timed[i].doneAt <= within) j++;
    if (j - i + 1 >= count) for (let k = i; k <= j; k++) hit.add(timed[k].task.id);
  }
  return hit;
}

/** A Flow completion within this long of a Planner done time is the same finish. */
export const PLANNER_COVER_MS = 24 * 3600000;
/** Energy a Planner task costs per hour of its estimate, rounded to 0.5, capped. */
const ENERGY_PER_HOUR = 2;
const ENERGY_CAP = 10;
const URGENT = new Set(['now', 'high']);

/** "Ana Maria", " ana  maria " and "AnaMaria" are the same person. */
const nameKey = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
const text = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** Planner's done time, 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' local, as epoch ms; null when there is none. */
function doneAtMs(t) {
  const m = typeof t.doneAt === 'string' ? /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/.exec(t.doneAt) : null;
  if (!m || !isDay(m[1]) || Math.round(+t.percent) !== 100) return null;
  const ms = new Date(`${m[1]}T${m[2] || '00:00'}:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** The plans in a list of records, read; anything unreadable is skipped. Flow's own ops come back beside them. */
function readPlans(planRecords) {
  const workspaces = new Map();
  const plans = [];
  const ops = [];
  const days = new Map();
  for (const r of planRecords || []) {
    if (!r || r.deletedAt) continue;
    if (r.type === OP_TYPE && typeof r.id === 'string') { ops.push(r); continue; }
    if (r.type === 'workspace' && typeof r.id === 'string') { workspaces.set(r.id, r); continue; }
    // The day Planner laid out, published as a record (Planner's
    // model/dayplan.js). Flow shows that list rather than forming its own.
    if (r.type === AGENDA_TYPE && isDay(r.day)) { days.set(r.day, r); continue; }
    if (r.type !== 'document' || r.format !== 'project-planner') continue;
    let body = r.body;
    try { if (typeof body === 'string') body = JSON.parse(body); } catch { continue; }
    if (!body || typeof body !== 'object' || !Array.isArray(body.tasks)) continue;
    const id = text(body.id) || text(r.id);
    if (!id) continue;
    plans.push({ id, body });
  }
  return { plans, workspaces, ops, days };
}

const opAt = (op) => (Number.isFinite(+op.at) ? +op.at : Number.isFinite(+op.updatedAt) ? +op.updatedAt : null);
const appliedIn = (plan) => new Set((Array.isArray(plan.appliedOps) ? plan.appliedOps : []).map((a) => (typeof a === 'string' ? a : a?.id)).filter(Boolean));
const expired = (op, now) => Number.isFinite(now) && opAt(op) !== null && opAt(op) < now - OPS_KEEP_MS;
const holds = (plan, taskId) => plan.tasks.some((t) => t && String(t.id) === taskId);

/**
 * The addTask ops Planner has not applied to a plan Flow holds: not in the
 * plan yet (by task id), not marked applied there, and written within the
 * last 90 days. Each becomes a task of that plan until Planner has it.
 */
function pendingAdds(plans, ops, now) {
  const byId = new Map(plans.map((p) => [p.id, p.body]));
  const out = new Map();
  for (const op of ops) {
    if (op.op !== 'addTask' || !op.task || typeof op.task.id !== 'string' || !op.task.id) continue;
    const plan = byId.get(op.plan);
    if (!plan || holds(plan, op.task.id) || appliedIn(plan).has(op.id) || expired(op, now)) continue;
    const list = out.get(op.plan) || [];
    list.push(op);
    out.set(op.plan, list);
  }
  for (const list of out.values()) list.sort((a, b) => (opAt(a) ?? 0) - (opAt(b) ?? 0) || a.id.localeCompare(b.id));
  return out;
}

/**
 * The addTask ops that stopped being pending unapplied: written more than 90
 * days ago, for a plan Flow holds that still has no such task. Planner will
 * never apply them; the Terminal says so once.
 */
export function expiredOps(planRecords, opts) {
  const now = opts?.now;
  const { plans, ops } = readPlans(planRecords);
  const byId = new Map(plans.map((p) => [p.id, p.body]));
  return ops.filter((op) => {
    const plan = byId.get(op.plan);
    return op.op === 'addTask' && op.task && plan && !holds(plan, op.task.id) && !appliedIn(plan).has(op.id) && expired(op, now);
  });
}

/** Planner's expected work, in minutes: stated work, else duration × hours a day × assumed load. */
function estimateOf(plan, t) {
  const stated = t.work !== null && t.work !== undefined && t.work !== '' && Number.isFinite(+t.work) && +t.work >= 0;
  let hours;
  if (stated) hours = +t.work;
  else {
    const hpd = +plan.calendar?.hoursPerDay > 0 ? +plan.calendar.hoursPerDay : 8;
    const load = +plan.agenda?.assumedLoad > 0 ? +plan.agenda.assumedLoad : 100;
    const days = Number.isFinite(+t.duration) && +t.duration >= 0 ? +t.duration : 1;
    hours = days * hpd * (load / 100);
  }
  return Math.max(1, Math.round(hours * 60));
}

/**
 * The player's tasks in the plans, with what each needs from its plan. The
 * shared work behind plannerTasks and plannerEvents.
 */
function derive(planRecords, { me = '', skills = [], stats = [], history = false, now = null } = {}) {
  const { plans, workspaces, ops } = readPlans(planRecords);
  const pending = history ? new Map() : pendingAdds(plans, ops, now);
  const who = nameKey(me);
  const liveSkills = (skills || []).filter((s) => s && !s.deletedAt && typeof s.name === 'string');
  const statList = stats && stats.length ? stats : DEFAULT_STATS;
  const workStat = (statList.find((s) => s.id === 'stat_work') || statList[0])?.id || 'stat_work';
  const madeSkills = new Map();
  const skillFor = (name) => {
    const key = name.toLowerCase();
    const own = liveSkills.find((s) => s.name.trim().toLowerCase() === key);
    if (own) return own.id;
    if (!madeSkills.has(key)) madeSkills.set(key, { id: `skill_pl_${slug(name)}`, type: 'skill', name, stat: workStat, place: null, derived: 'project' });
    return madeSkills.get(key).id;
  };

  const out = [];
  for (const { id: planId, body: plan } of plans) {
    // Templates never count. An archived plan is off the list of tasks to do,
    // but its history (finishes and reopens) still is.
    if (plan.template === true || (plan.archived === true && !history)) continue;
    const project = text(plan.name) || 'Untitled project';
    const resources = new Map((Array.isArray(plan.resources) ? plan.resources : []).filter((r) => r && typeof r === 'object').map((r) => [r.id, r]));
    const cancelled = new Set((Array.isArray(plan.stages) ? plan.stages : []).filter((st) => st && st.cancelled).map((st) => st.id));
    const ws = workspaces.get(plan.workspaceId);
    const folder = (Array.isArray(ws?.folders) ? ws.folders : []).find((f) => f && f.id === plan.folderId);
    // A task Flow added and Planner has not applied yet: derived from the op
    // itself — same id, the op's hours else 30 minutes — at the end, level 1.
    const adds = (pending.get(planId) || []).map((op) => ({
      id: op.task.id, name: op.task.name, level: 1, duration: 1, deadline: op.task.deadline ?? null,
      work: Number.isFinite(+op.task.work) && op.task.work !== null && +op.task.work > 0 ? +op.task.work : PENDING_ESTIMATE_MIN / 60,
      assignments: [], pending: true,
    }));
    const tasks = [...plan.tasks, ...adds].filter((t) => t && typeof t === 'object' && text(String(t.id ?? '')));
    tasks.forEach((t, i) => {
      const level = Number(t.level) || 1;
      if (i < tasks.length - 1 && (Number(tasks[i + 1].level) || 1) > level) return; // a summary
      if (t.milestone || t.archived === true || cancelled.has(t.stageId)) return;
      const assigned = (Array.isArray(t.assignments) ? t.assignments : []).filter((a) => a && resources.has(a.resourceId));
      if (assigned.length && !(who && assigned.some((a) => nameKey(resources.get(a.resourceId).name) === who))) return;
      const estimate = estimateOf(plan, t);
      const physical = t.energy === 'physical' || (t.energy !== 'mental' && plan.energy === 'physical');
      const cost = Math.min(ENERGY_CAP, Math.round((estimate / 60) * ENERGY_PER_HOUR * 2) / 2);
      const skillName = [t.skill, plan.skill, folder?.name, ws?.name, project].map(text).find(Boolean) || 'General';
      const taskId = String(t.id);
      const finished = doneAtMs(t);
      const task = {
        id: `task_pl_${planId}_${taskId}`, type: 'task', title: text(t.name) || 'Untitled task', project,
        skill: skillFor(skillName), measure: 'time', cadence: 'once', estimate,
        stamina: physical ? cost : 0, mana: physical ? 0 : cost,
        critical: false, forOthers: false, deadline: isDay(t.deadline) ? t.deadline : null, urgent: URGENT.has(t.urgency),
        // Done in Planner is done in Flow: never offered as open, logged or not.
        batch: null, unit: '', place: null, archived: plan.archived === true || finished !== null,
        source: { app: 'project', plan: planId, task: taskId },
        ...(finished !== null ? { plannerDone: new Date(finished).toISOString() } : {}),
        ...(t.pending ? { pending: true } : {}),
      };
      const sheets = (Array.isArray(plan.timesheets) ? plan.timesheets : []).filter((x) => x && x.taskId === taskId && isDay(x.date) && Number.isFinite(+x.hours) && +x.hours > 0);
      out.push({ task, doneAt: finished, sheets, percent: Math.round(+t.percent) || 0, planArchived: plan.archived === true });
    });
  }
  return { entries: out, skills: [...madeSkills.values()] };
}

/**
 * The player's Planner tasks as derived Flow definitions: leaf tasks of live
 * plans that are unassigned or assigned to `me`, and a derived skill (under
 * the Work stat) for each Planner skill Flow has no skill of that name for.
 */
export function plannerTasks(planRecords, opts) {
  // With `now`, pending addTask ops older than 90 days are dropped (Planner no longer applies them).
  const { entries, skills } = derive(planRecords, opts);
  return { tasks: entries.map((e) => e.task), skills };
}

/**
 * The tasks Planner laid on `day`, as Flow definitions, in Planner's order.
 *
 * This is the whole point of the agenda record: Flow's list is Planner's
 * Today, the same tasks in the same order, rather than the open backlog
 * sorted alphabetically — which on a real planner is hundreds of tasks going
 * back years, and is not what anybody means by "what am I doing today".
 *
 * `null` — not an empty list — when Planner has not published that day, so a
 * caller can fall back rather than show an empty screen. An empty array means
 * Planner published the day and nothing is laid on it.
 */
export function plannerDay(planRecords, day, opts) {
  const { days } = readPlans(planRecords);
  const record = days.get(day);
  if (!record || !Array.isArray(record.tasks)) return null;
  const { entries } = derive(planRecords, opts || {});
  const byKey = new Map(entries.map((e) => [`${e.task.source.plan}|${e.task.source.task}`, e]));
  const out = [];
  for (const row of record.tasks) {
    const entry = byKey.get(`${row.plan}|${row.task}`);
    // A task the day names but this player cannot see (someone else's, done,
    // archived) is simply not theirs to do; the day is not wrong for holding it.
    if (entry) out.push({ ...entry.task, laidAt: row.start, laidMinutes: row.minutes });
  }
  return out;
}

/**
 * The definitions Flow's history needs from plans archived since: their tasks
 * (archived, so never offered) and skills. Merge the ones a stored completion
 * points at, so its title, skill and XP survive the plan being put away.
 */
export function plannerHistory(planRecords, opts) {
  const { entries, skills } = derive(planRecords, { ...opts, history: true });
  const tasks = entries.filter((e) => e.planArchived).map((e) => e.task);
  const used = new Set(tasks.map((t) => t.skill));
  return { tasks, skills: skills.filter((k) => used.has(k.id)) };
}

/**
 * SPEC.md › Planner tasks › Planner changed its mind. A Planner completion's
 * minutes are the estimate at the moment it was logged, and an event is never
 * rewritten — so a plan corrected afterwards cannot reach back into Flow.
 * This is what Flow offers the player instead: one entry per stored Planner
 * completion whose minutes no longer match what the plan says the work is,
 * each carrying the correction's numbers and a reason in Planner's own terms.
 *
 * Never a write and never automatic. A completion the player timed is what
 * really happened whatever the plan says, and one the player has already
 * corrected by hand is their decision, so neither is offered.
 */
export function plannerDrift(db, planRecords, opts) {
  if (!planRecords?.length) return [];
  const { entries } = derive(planRecords, { ...opts, skills: opts?.skills ?? db.skills, stats: opts?.stats ?? db.stats, history: true });
  const now = new Map(entries.map((e) => [e.task.id, e.task]));
  const out = [];
  for (const d of db.done) {
    if (!d.planner || d.timed) continue;
    if (db.correction?.get(d.id)?.length) continue;
    const task = now.get(d.task);
    if (!task || !Number.isFinite(task.estimate)) continue;
    if (task.estimate === d.minutes) continue;
    out.push({
      done: d.id, task: task.id, title: task.title, project: task.project || '',
      logged: d.minutes, minutes: task.estimate, points: d.price?.points ?? null,
      reason: `Planner now puts this at ${fmtMinutes(task.estimate)}, not the ${fmtMinutes(d.minutes)} it said when Flow logged it`,
    });
  }
  return out;
}

/** Minutes as the reason line says them: "2h", "1h 30m", "15m", "nothing". */
function fmtMinutes(m) {
  if (!(m > 0)) return 'nothing';
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h && min ? `${h}h ${min}m` : h ? `${h}h` : `${min}m`;
}

/**
 * SPEC.md › From when: the settings record to write when Planner has been read
 * successfully at `readAt` — stamped with plannerSince — or null when there is
 * nothing to write (no successful read, or a stamp already there: it is
 * written once and never moved later).
 */
export function plannerSinceStamp(settings, readAt) {
  if (!Number.isFinite(readAt)) return null;
  if (Number.isFinite(settings?.plannerSince)) return null;
  return { ...(settings || { id: 'settings', type: 'settings', name: 'Player', mission: '' }), id: 'settings', type: 'settings', plannerSince: readAt };
}

// ─── done in Planner, reopened in Planner ──────────────────────────────────

const plannerMs = (r) => (typeof r.planner === 'string' ? Date.parse(r.planner) : NaN);

/**
 * Whether a Flow completion covers a Planner finish at `ms`: it carries that
 * same Planner time, or it ended no more than 24 h before it (the timer or
 * Log done got there first) and is not already a later Planner finish.
 */
function covers(d, ms) {
  const p = plannerMs(d);
  if (p === ms) return true;
  if (Number.isFinite(p) && p > ms) return false;
  return (d.end ?? 0) >= ms - PLANNER_COVER_MS;
}

/** Timesheet minutes on a task after a completion, up to the day it was finished again. */
function fixMinutes(sheets, after, until) {
  const afterDay = dayOf(after);
  const untilDay = dayOf(until);
  let hours = 0;
  for (const x of sheets) {
    if (x.date > untilDay) continue;
    const start = Number.isInteger(+x.start) && x.start !== null && x.start !== undefined ? new Date(`${x.date}T00:00:00`).getTime() + +x.start * 60000 : null;
    if (start !== null ? start > after : x.date > afterDay) hours += +x.hours;
  }
  return Math.round(hours * 60);
}

/** The model's db with the derived definitions in it, so a Planner task can be priced. */
function withDefinitions(db, tasks, skills) {
  const known = new Set(db.skills.map((s) => s.id));
  const allSkills = [...db.skills, ...skills.filter((s) => !known.has(s.id))];
  const ids = new Set(tasks.map((t) => t.id));
  const allTasks = [...db.tasks.filter((t) => !ids.has(t.id)), ...tasks];
  return { ...db, skills: allSkills, skill: new Map(allSkills.map((s) => [s.id, s])), tasks: allTasks, task: new Map(allTasks.map((t) => [t.id, t])) };
}
const byEnd = (a, b) => (a.end ?? a.at ?? 0) - (b.end ?? b.at ?? 0) || a.id.localeCompare(b.id);

/** The rework record for an answered "how long did the fix take?". */
export function plannerRework(db, ask, minutes) {
  const rec = makeRework(db, ask.done, { minutes, at: ask.at, note: 'Reopened in Planner' });
  return { ...rec, id: ask.id, planner: ask.planner };
}

/**
 * What Flow should write now for the player's Planner tasks, and what to ask:
 *
 *   done   — a completion for each task Planner has a done time for and no
 *            Flow completion covers: id done_pl_<plan>_<task>_<doneAt ms>,
 *            ending at doneAt, the estimate in minutes, quality 1.
 *   rework — a task finished again more than 24 h after the completion that
 *            covered it is rework of that completion, its fix the timesheet
 *            hours after it; nothing when rework is already logged against it.
 *   ask    — [{ done, task, title, … }] the same, when Planner has no hours.
 *
 * Only finishes at or after `since` (settings.plannerSince) count; with no
 * `since`, nothing does. Plans archived since still count; templates never.
 *
 * Idempotent: once its records are written it returns nothing new.
 */
export function plannerEvents(db, planRecords, opts) {
  const { me, now = Date.now(), since = null } = opts || {};
  const out = { done: [], rework: [], ask: [] };
  // Planner history before Flow first read it is not logged; without the stamp, nothing is.
  if (since === null || since === undefined || !Number.isFinite(+since)) return out;
  // The cutoff is the start of the day Flow first read Planner, so that day's earlier work counts.
  const from = new Date(+since); from.setHours(0, 0, 0, 0);
  const name = me ?? (db.settings?.plannerName || db.settings?.name || '');
  const { entries, skills } = derive(planRecords, { me: name, skills: db.skills, stats: db.stats, history: true });
  let work = withDefinitions(db, entries.map((e) => e.task), skills);
  const finished = entries.filter((e) => e.doneAt !== null && e.doneAt >= +from && e.doneAt <= now).sort((a, b) => a.doneAt - b.doneAt || a.task.id.localeCompare(b.task.id));
  // Housekeeping is not work: a finish that was only catching up earns nothing
  // and is not logged at all. Computed over every finish in the window, because
  // a burst is a property of the run and not of any one tick in it.
  const caught = caughtUpFinishes(finished);
  for (const { task, doneAt: ms, sheets } of finished) {
    if (caught.has(task.id)) continue;
    const iso = new Date(ms).toISOString();
    const { plan, task: taskId } = task.source;
    const mine = work.done.filter((d) => d.task === task.id);
    if (mine.some((d) => covers(d, ms))) continue;
    const prior = mine.filter((d) => (d.end ?? 0) < ms - PLANNER_COVER_MS).at(-1);
    if (!prior) {
      const rec = { ...makeDone(work, task, { end: ms, minutes: task.estimate, quality: 1 }), id: `done_pl_${plan}_${taskId}_${ms}`, planner: iso };
      out.done.push(rec);
      work = { ...work, done: [...work.done, rec].sort(byEnd) };
      continue;
    }
    // Reopened: rework of the completion that covered the earlier finish.
    const logged = work.rework.filter((r) => r.done === prior.id);
    if (logged.some((r) => r.planner === iso)) continue;
    const since = Math.max(prior.end ?? 0, ...logged.filter((r) => Number.isFinite(plannerMs(r)) && plannerMs(r) < ms).map((r) => r.at ?? 0));
    if (logged.some((r) => !r.planner && (r.at ?? 0) > since)) continue;
    const ask = { done: prior.id, task: task.id, title: task.title, project: task.project, planner: iso, at: ms, id: `rework_pl_${plan}_${taskId}_${ms}` };
    const minutes = fixMinutes(sheets, prior.end ?? 0, ms);
    if (minutes > 0) {
      const rec = plannerRework(work, ask, minutes);
      out.rework.push(rec);
      work = { ...work, rework: [...work.rework, rec].sort(byEnd) };
    } else out.ask.push(ask);
  }
  return out;
}

// ─── the Terminal's project list ───────────────────────────────────────────

/**
 * SPEC.md › Terminal: Planner's plans — not archived, not templates — that
 * have at least one task for the player (pending ones included), pinned
 * first, then by name. Each carries its open tasks (not done in Flow, not at
 * 100% in Planner), the earliest deadline among them, and the minutes logged
 * this ISO week: the plan's timesheet hours on the player's tasks plus Flow's
 * timesheet ops Planner has not applied yet.
 *
 * `db` is Flow's db (for its completions); the tasks come from the plans.
 */
export function projectList(db, planRecords, opts) {
  const { me = '', now = Date.now(), skills, stats } = opts || {};
  const day = dayOf(now);
  const week = isoWeek(day);
  const { plans, ops } = readPlans(planRecords);
  const { entries } = derive(planRecords, { me, skills: skills ?? db.skills, stats: stats ?? db.stats, now });
  // Today is Planner's Today here too (SPEC.md › Planner tasks): when Planner
  // has published the day, only what it laid is open work. A day naming
  // nothing is treated as no day at all, same as everywhere else.
  const laid = plannerDay(planRecords, day, { me, skills: skills ?? db.skills, stats: stats ?? db.stats, now });
  const onDay = laid && laid.length ? new Set(laid.map((t) => t.id)) : null;
  const out = [];
  for (const { id, body } of plans) {
    if (body.template === true || body.archived === true) continue;
    const mine = entries.filter((e) => e.task.source.plan === id);
    if (!mine.length) continue;
    const ids = new Set(mine.map((e) => e.task.source.task));
    const open = mine.filter((e) => e.percent < 100 && !isDoneFor(db, e.task, day) && (!onDay || onDay.has(e.task.id))).map((e) => e.task);
    const deadline = open.map((t) => t.deadline).filter(Boolean).sort()[0] || null;
    let hours = 0;
    for (const e of mine) for (const x of e.sheets) if (isoWeek(x.date) === week) hours += +x.hours;
    const applied = appliedIn(body);
    for (const op of ops) {
      if (op.op !== 'timesheet' || op.plan !== id || applied.has(op.id) || !ids.has(String(op.task)) || !isDay(op.date)) continue;
      if (isoWeek(op.date) === week && Number.isFinite(+op.hours)) hours += +op.hours;
    }
    out.push({ id, name: text(body.name) || 'Untitled project', pinned: body.pinned === true, open: open.length, deadline, weekMinutes: Math.round(hours * 60), tasks: open });
  }
  return out.sort((a, b) => (b.pinned - a.pinned) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}
