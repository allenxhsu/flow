// flow/src/game/actions.js — the game as an input (SPEC.md › Play), as pure
// functions over the model. The TASKS menu (the lower screen's button, or the
// desk) starts, finishes and adds tasks by writing exactly the records the
// app's own screens write: the timer is the same `flow.timer` object Now
// keeps, completions come from makeDone, rework from makeRework, new tasks
// from makeTask. Nothing here touches storage; the Play view does the writes.

import { makeDone, makeRework, makeTask, reworkCandidate } from '../model.js';
import { elapsedMinutes } from '../util.js';

/** The estimate buttons of the new-task flow (anything else is typed). */
export const ESTIMATES = [15, 30, 45, 60, 90, 120];
export const CADENCES = ['once', 'daily', 'weekly', 'anytime'];
/** The on-screen letter grid, as the name entry lays it out. */
export const LETTER_ROWS = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ-', "0123456789", ".,!?'&/+#"];
export const TITLE_MAX = 40;

/**
 * What the menu offers: what Now's "Next" offers — the suggestion and its
 * alternatives first (one entry per released batch), then every other open
 * task. `g` is play()'s output, so derived tasks come along with the rest.
 */
export function menuTasks(g) {
  const out = [];
  const seen = new Set();
  const title = (id) => g.tasks.find((t) => t.id === id)?.title || '';
  for (const s of [g.next?.next, ...(g.next?.alternatives || [])]) {
    if (!s || seen.has(s.task)) continue;
    seen.add(s.task);
    out.push({ task: s.task, title: s.title || title(s.task), suggested: true, why: s.why || [] });
  }
  const open = g.tasks.filter((t) => !t.archived && !t.doneNow && !seen.has(t.id)).sort((a, b) => a.title.localeCompare(b.title));
  for (const t of open) out.push({ task: t.id, title: t.title, suggested: false, why: [] });
  return out;
}

const taskOf = (db, id) => {
  const t = db.task.get(id);
  if (!t) throw new Error(`no task "${id}"`);
  return t;
};

/** "Is this rework of …?" — asked when the task was finished recently, as the timer on Now asks. */
export function reworkQuestion(db, taskId, now) {
  const cand = reworkCandidate(db, taskId, now);
  if (!cand) return null;
  const t = taskOf(db, taskId);
  return { done: cand.id, day: cand.day, title: t.title, text: `Is this rework of ${t.title} (${cand.day})?` };
}

/** The timer to write to flow.timer: { task, start, reworkOf? }. One at a time. */
export function startTimer(db, taskId, { now, running = null, reworkOf = null } = {}) {
  if (running) throw new Error('A timer is already running: finish it or cancel it first.');
  taskOf(db, taskId);
  if (reworkOf && !db.done.some((d) => d.id === reworkOf)) throw new Error(`no completion "${reworkOf}"`);
  return { task: taskId, start: now, ...(reworkOf ? { reworkOf } : {}) };
}

/** What Finish has to ask before it can log: the minutes (no timer), the measure's value, the quality. */
export function finishQuestions(db, { timer = null, task = null } = {}) {
  const t = taskOf(db, timer?.task || task);
  if (timer?.reworkOf) return [];
  const q = [];
  if (!timer) q.push('minutes');
  if (t.measure === 'count' || t.measure === 'quality') q.push('value');
  if (t.measure !== 'quality') q.push('quality');
  return q;
}

/**
 * Finish: stop the timer (its minutes) or log `minutes` without one, with
 * the measure's value and a 0–1 quality. Returns the record to write, its kind
 * and the text box's points breakdown; `clearTimer` when a timer was stopped.
 */
export function finishTask(db, { timer = null, task = null, minutes, value, quality, now, note = '' } = {}) {
  const taskId = timer?.task || task;
  const t = taskOf(db, taskId);
  const mins = timer ? elapsedMinutes(timer.start, now) : Number(minutes);
  if (!(mins > 0)) throw new Error('How many minutes did it take?');
  if (timer?.reworkOf) {
    const record = makeRework(db, timer.reworkOf, { minutes: mins, at: now, note });
    return { kind: 'rework', record, clearTimer: true, text: reworkText(t, record) };
  }
  const record = makeDone(db, t, {
    end: now, minutes: mins, value, quality: quality === undefined || quality === null || quality === '' ? undefined : Number(quality),
    timed: !!timer, note,
  });
  return { kind: 'done', record, clearTimer: !!timer, text: doneText(t, record) };
}

const BONUS = { flow: 'flow', pb: 'personal best', underdog: 'underdog', combo: 'combo', batch: 'batch', gear: 'gear' };

/** The text box after a completion: minutes, the points and each bonus that fired. */
export function doneText(task, d) {
  const b = Object.entries(d.price?.bonuses || {}).filter(([, v]) => v > 0).map(([k, v]) => `${BONUS[k] || k} +${Math.round(v * 100)}%`);
  const value = d.measure === 'count' ? ` · ${d.value} ${task.unit || ''}`.trimEnd() : d.measure === 'quality' ? ` · ${d.value}%` : '';
  return `${task.title} done in ${d.minutes} min${value}. +${d.price?.points || 0} pts${b.length ? ` (${b.join(', ')})` : ''}.`;
}

export function reworkText(task, r) {
  return `Rework on ${task.title}: ${r.minutes} min. −${r.charged} pts (×${r.multiplier}).`;
}

/** A new Flow task from the letter grid's title and the menus' answers. Never a Planner task. */
export function newTask(db, { title, estimate, skill, cadence, critical = false, now }) {
  const t = String(title || '').trim();
  if (!t) throw new Error('a task needs a title');
  return makeTask(db, { title: t, estimate: Number(estimate), skill, cadence, critical: !!critical }, { now });
}

/** One key of the letter grid: a character, SPACE or DEL. */
export function typeKey(text, key, max = TITLE_MAX) {
  const s = String(text || '');
  if (key === 'DEL') return s.slice(0, -1);
  if (key === 'SPACE') return s && !s.endsWith(' ') && s.length < max ? `${s} ` : s;
  if (typeof key !== 'string' || key.length !== 1 || s.length >= max) return s;
  return s + key;
}

/** Cancel the timer: nothing is logged; the stored timer becomes nothing. */
export function cancelTimer() {
  return null;
}
