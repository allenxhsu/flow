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

import { DEFAULT_STATS, makeDone, makeRework, isDay, dayOf } from './model.js';

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

/** The plans in a list of records, read; anything unreadable is skipped. */
function readPlans(planRecords) {
  const workspaces = new Map();
  const plans = [];
  for (const r of planRecords || []) {
    if (!r || r.deletedAt) continue;
    if (r.type === 'workspace' && typeof r.id === 'string') { workspaces.set(r.id, r); continue; }
    if (r.type !== 'document' || r.format !== 'project-planner') continue;
    let body = r.body;
    try { if (typeof body === 'string') body = JSON.parse(body); } catch { continue; }
    if (!body || typeof body !== 'object' || !Array.isArray(body.tasks)) continue;
    const id = text(body.id) || text(r.id);
    if (!id) continue;
    plans.push({ id, body });
  }
  return { plans, workspaces };
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
function derive(planRecords, { me = '', skills = [], stats = [] } = {}) {
  const { plans, workspaces } = readPlans(planRecords);
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
    if (plan.archived === true || plan.template === true) continue;
    const project = text(plan.name) || 'Untitled project';
    const resources = new Map((Array.isArray(plan.resources) ? plan.resources : []).filter((r) => r && typeof r === 'object').map((r) => [r.id, r]));
    const cancelled = new Set((Array.isArray(plan.stages) ? plan.stages : []).filter((st) => st && st.cancelled).map((st) => st.id));
    const ws = workspaces.get(plan.workspaceId);
    const folder = (Array.isArray(ws?.folders) ? ws.folders : []).find((f) => f && f.id === plan.folderId);
    const tasks = plan.tasks.filter((t) => t && typeof t === 'object' && text(String(t.id ?? '')));
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
      const task = {
        id: `task_pl_${planId}_${taskId}`, type: 'task', title: text(t.name) || 'Untitled task', project,
        skill: skillFor(skillName), measure: 'time', cadence: 'once', estimate,
        stamina: physical ? cost : 0, mana: physical ? 0 : cost,
        critical: false, forOthers: false, deadline: isDay(t.deadline) ? t.deadline : null, urgent: URGENT.has(t.urgency),
        batch: null, unit: '', place: null, archived: false,
        source: { app: 'project', plan: planId, task: taskId },
      };
      const sheets = (Array.isArray(plan.timesheets) ? plan.timesheets : []).filter((x) => x && x.taskId === taskId && isDay(x.date) && Number.isFinite(+x.hours) && +x.hours > 0);
      out.push({ task, doneAt: doneAtMs(t), sheets });
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
  const { entries, skills } = derive(planRecords, opts);
  return { tasks: entries.map((e) => e.task), skills };
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
 * Idempotent: once its records are written it returns nothing new.
 */
export function plannerEvents(db, planRecords, opts) {
  const { me, now = Date.now() } = opts || {};
  const name = me ?? (db.settings?.plannerName || db.settings?.name || '');
  const { entries, skills } = derive(planRecords, { me: name, skills: db.skills, stats: db.stats });
  let work = withDefinitions(db, entries.map((e) => e.task), skills);
  const out = { done: [], rework: [], ask: [] };
  const finished = entries.filter((e) => e.doneAt !== null && e.doneAt <= now).sort((a, b) => a.doneAt - b.doneAt || a.task.id.localeCompare(b.task.id));
  for (const { task, doneAt: ms, sheets } of finished) {
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
