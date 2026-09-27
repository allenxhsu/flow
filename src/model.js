// flow/src/model.js — the rules of Flow. Pure: no DOM, no storage, no clock
// it did not get as an argument, so the page, the CLI and the tests all run
// exactly this file.
//
// The data is sync-kit records in workspace "flow". Two kinds:
//
//   definitions — settings, stat, skill, task, reward, place, kind. Edited in
//                 place, and last-write-wins is the right rule for them.
//   events      — done, rework, purchase, energy, review, moment. Written once
//                 and never edited, so two devices can never overwrite each other.
//                 A review redone in the same ISO week is a new event; the
//                 latest one counts for that week.
//
// Every event that moves points carries the points it was priced at (`price`,
// `charged`), so a later calibration never rewrites the past. Everything else
// — levels, targets, personal bests, energy, balances, the next task — is
// derived here from the records every time.

// ─── the numbers ────────────────────────────────────────────────────────────

/** 1 point per estimated minute, until benchmark calibration (phase 2) says otherwise. */
export const POINTS_PER_MINUTE = 1;
export const BONUS = { flow: 0.2, pb: 0.25, underdog: 0.5, comboStep: 0.1, comboMax: 1, batchStep: 0.15 };
/** Bonuses add up; the total never passes this multiple of the base. */
export const BONUS_CAP = 2.5;
/** Start the next task within this long of the last and the combo grows. */
export const COMBO_GAP_MIN = 30;
/** A batch ends on a different kind of task or a gap longer than this. */
export const BATCH_GAP_MIN = 10;
/** The picker holds same-type tasks until this many are waiting… */
export const BATCH_RELEASE = 3;
/** …or until one of them is due within this many days. */
export const DEADLINE_SOON_DAYS = 2;
/** A repeated task's target and estimate come from this many of its latest runs. */
export const HISTORY_RUNS = 5;
export const HISTORY_MIN_RUNS = 3;
/** The target is this much better than your recent average: the flow channel. */
export const TARGET_STEP = 0.05;
/** Each skill level cuts a task's energy cost by this, down to the floor. */
export const MASTERY_STEP = 0.075;
export const MASTERY_FLOOR = 0.25;
/** Later tasks in a batch cost this share of their mana: no switching cost. */
export const BATCH_MANA_SHARE = 0.5;
/** Rework: normal tasks escalate with each repeat, critical tasks always pay the top rate. */
export const REWORK_MULTIPLIERS = [1.5, 1.75, 2];
export const REWORK_CRITICAL = 2;
/** The part of a charge that takes the balance below zero costs this much more. */
export const DEBT_MULTIPLIER = 2;
/**
 * Difficulty tiers, easiest first. Push is the game as described everywhere
 * else; the others scale points (after the bonus cap), the flow-target step,
 * the rework multiplier, debt, positive energy costs and streak grace days.
 * Set in a weekly review, globally and per skill; unlocked by level.
 */
export const DIFFICULTY = [
  { id: 'steady', name: 'Steady', unlock: 1, points: 0.8, targetStep: 0.03, reworkAdd: -0.25, debt: 1.5, energy: 0.85, grace: 2 },
  { id: 'push', name: 'Push', unlock: 1, points: 1, targetStep: 0.05, reworkAdd: 0, debt: 2, energy: 1, grace: 1 },
  { id: 'grind', name: 'Grind', unlock: 3, points: 1.25, targetStep: 0.08, reworkAdd: 0.25, debt: 2, energy: 1.15, grace: 1 },
  { id: 'relentless', name: 'Relentless', unlock: 6, points: 1.5, targetStep: 0.11, reworkAdd: 0.5, debt: 2.5, energy: 1.3, grace: 0 },
  { id: 'legend', name: 'Legend', unlock: 10, points: 2, targetStep: 0.15, reworkAdd: 0.75, debt: 3, energy: 1.5, grace: 0 },
];
export const DEFAULT_DIFFICULTY = 'push';
const tierOf = (id) => DIFFICULTY.find((d) => d.id === id) || DIFFICULTY.find((d) => d.id === DEFAULT_DIFFICULTY);
/** XP from level L to L+1 costs step × L. */
export const PLAYER_STEP = 500;
export const STAT_STEP = 300;
export const SKILL_STEP = 100;
export const ENERGY_MAX = 10;
/** One missed day per this many is a rest day, not a broken streak; also the underdog look-back. */
export const WEEK = 7;
/** The timer asks "is this rework?" when the same task was finished this recently. */
export const REWORK_ASK_DAYS = 14;

export const DEFAULT_STATS = [
  { id: 'stat_body', name: 'Body', icon: '♥' },
  { id: 'stat_mind', name: 'Mind', icon: '☀' },
  { id: 'stat_craft', name: 'Craft', icon: '⚒' },
  { id: 'stat_work', name: 'Work', icon: '▲' },
  { id: 'stat_bonds', name: 'Bonds', icon: '❖' },
];

/** The overworld's zones, in the order the replay's map lays them out. */
export const ZONES = ['home', 'road', 'factory', 'town', 'elsewhere'];

export const DEFAULT_PLACES = [
  { id: 'place_bedroom', name: 'Bedroom', zone: 'home' },
  { id: 'place_kitchen', name: 'Kitchen', zone: 'home' },
  { id: 'place_laundry', name: 'Laundry', zone: 'home' },
  { id: 'place_car', name: 'Car', zone: 'road' },
  { id: 'place_floor', name: 'Factory floor', zone: 'factory' },
  { id: 'place_desk', name: 'Desk', zone: 'factory' },
  { id: 'place_meeting', name: 'Meeting room', zone: 'factory' },
  { id: 'place_warehouse', name: 'Warehouse', zone: 'factory' },
  { id: 'place_gym', name: 'Gym', zone: 'town' },
  { id: 'place_restaurant', name: 'Restaurant', zone: 'town' },
  { id: 'place_friends', name: "Friends'", zone: 'town' },
];

/** Quick-button moments: life that is not a task. Energy is per hour; negative restores. */
export const DEFAULT_KINDS = [
  { id: 'kind_drive', title: 'Drive', icon: '🚗', place: 'place_car', staminaPerHour: 0.5, manaPerHour: 1 },
  { id: 'kind_chat', title: 'Chat', icon: '💬', place: 'place_floor', staminaPerHour: 0, manaPerHour: 2 },
  { id: 'kind_walk', title: 'Walk the floor', icon: '🏭', place: 'place_floor', staminaPerHour: 1.5, manaPerHour: 0 },
  { id: 'kind_laundry', title: 'Laundry', icon: '🧺', place: 'place_laundry', staminaPerHour: 1, manaPerHour: 0 },
  { id: 'kind_meal', title: 'Meal', icon: '🍜', place: 'place_kitchen', staminaPerHour: -2, manaPerHour: -1 },
  { id: 'kind_rest', title: 'Rest', icon: '☕', place: 'place_bedroom', staminaPerHour: -3, manaPerHour: -3 },
];

const DEFINITIONS = ['settings', 'stat', 'skill', 'task', 'reward', 'place', 'kind'];
const EVENTS = ['done', 'rework', 'purchase', 'energy', 'review', 'moment'];
export const RECORD_TYPES = [...DEFINITIONS, ...EVENTS];

// ─── dates ──────────────────────────────────────────────────────────────────
// Days are 'YYYY-MM-DD' in the player's own calendar; instants are epoch ms.

const pad = (n) => String(n).padStart(2, '0');
export const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toUTC = (day) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (day, n) => new Date(toUTC(day) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

/** ISO week, 'YYYY-Www': Monday start, and the week belongs to its Thursday's year. */
export function isoWeek(day) {
  const t = new Date(toUTC(day));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

// ─── records ────────────────────────────────────────────────────────────────

let counter = 0;
/** An id that sorts by creation time and does not collide across devices. */
export function newId(type, now = Date.now()) {
  counter = (counter + 1) % 1296;
  const rand = globalThis.crypto?.randomUUID?.().slice(0, 6) ?? Math.random().toString(36).slice(2, 8);
  return `${type}_${now.toString(36)}${counter.toString(36).padStart(2, '0')}${rand}`;
}

/** Stamp a record the way sync-kit expects: `updatedAt` and `origin` on every write. */
export function stamp(record, { now = Date.now(), device = 'local' } = {}) {
  return { ...record, updatedAt: now, origin: device };
}

export function tombstone(record, { now = Date.now(), device = 'local' } = {}) {
  return { ...record, deletedAt: now, updatedAt: now, origin: device };
}

/**
 * Index the live records by type. Unknown types and tombstones are skipped,
 * so a record from a newer build is carried by sync but ignored here.
 */
export function index(records) {
  const by = Object.fromEntries(RECORD_TYPES.map((t) => [t, []]));
  for (const r of records) if (r && !r.deletedAt && by[r.type]) by[r.type].push(r);
  const stats = by.stat.length ? by.stat : DEFAULT_STATS.map((s, i) => ({ ...s, type: 'stat', order: i }));
  stats.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  const byStart = (a, b) => (a.end ?? a.at ?? 0) - (b.end ?? b.at ?? 0) || a.id.localeCompare(b.id);
  const places = by.place.length ? by.place : DEFAULT_PLACES.map((p) => ({ ...p, type: 'place' }));
  const kinds = by.kind.length ? by.kind : DEFAULT_KINDS.map((k) => ({ ...k, type: 'kind' }));
  return {
    settings: by.settings.find((s) => s.id === 'settings') || { name: 'Player', mission: '' },
    stats,
    skills: by.skill,
    tasks: by.task,
    rewards: by.reward,
    done: by.done.sort(byStart),
    rework: by.rework.sort(byStart),
    purchases: by.purchase.sort(byStart),
    energy: by.energy.sort(byStart),
    moments: by.moment.sort(byStart),
    places,
    kinds: kinds.filter((k) => !k.archived),
    place: new Map(places.map((p) => [p.id, p])),
    kind: new Map(kinds.map((k) => [k.id, k])),
    reviews: by.review.sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? 0) - (b.at ?? 0)),
    stat: new Map(stats.map((s) => [s.id, s])),
    skill: new Map(by.skill.map((s) => [s.id, s])),
    task: new Map(by.task.map((t) => [t.id, t])),
    reward: new Map(by.reward.map((r) => [r.id, r])),
  };
}

// ─── definitions ────────────────────────────────────────────────────────────

const MEASURES = ['time', 'count', 'quality'];
const CADENCES = ['daily', 'weekly', 'once', 'anytime'];

/** Which way is better for a measure: less time, more count, more quality. */
export const betterOf = (task) => task.better || (task.measure === 'time' ? 'less' : 'more');

export function makeSkill(db, { name, stat, place = null, now = Date.now() }) {
  if (!name) throw new Error('a skill needs a name');
  if (!db.stat.has(stat)) throw new Error(`no stat "${stat}"`);
  if (place && !db.place.has(place)) throw new Error(`no place "${place}"`);
  return { id: newId('skill', now), type: 'skill', name, stat, place };
}

export function makePlace(db, { name, zone = 'elsewhere', now = Date.now() }) {
  if (!name) throw new Error('a place needs a name');
  if (!ZONES.includes(zone)) throw new Error(`zone is ${ZONES.join(', ')}, not "${zone}"`);
  return { id: newId('place', now), type: 'place', name, zone };
}

/** Where a task happens: its own place, else its skill's, else nowhere in particular. */
export const placeOfTask = (db, task) => task?.place || db.skill.get(task?.skill)?.place || null;

/**
 * A moment: something you did that is not a task — a drive, a chat, the
 * laundry. It costs or restores energy by the hour and earns no points.
 */
export function makeMoment(db, kindRef, { start, end = Date.now(), place, who = '', note = '' } = {}) {
  const kind = typeof kindRef === 'string' ? db.kind.get(kindRef) : kindRef;
  if (!kind) throw new Error(`no moment kind "${kindRef}"`);
  if (!(start < end)) throw new Error('a moment ends after it starts');
  place = place || kind.place || null;
  if (place && !db.place.has(place)) throw new Error(`no place "${place}"`);
  const hours = (end - start) / 3600000;
  const round = (x) => Math.round(x * 10) / 10;
  return {
    id: newId('moment', end), type: 'moment', kind: kind.id, title: kind.title, day: dayOf(start), start, end, place, who, note,
    energy: { stamina: round((kind.staminaPerHour || 0) * hours), mana: round((kind.manaPerHour || 0) * hours) },
  };
}

export function makeTask(db, fields, { now = Date.now() } = {}) {
  const t = { measure: 'time', cadence: 'anytime', estimate: 30, stamina: 0, mana: 0, critical: false, forOthers: false, deadline: null, batch: null, unit: '', place: null, archived: false, ...fields };
  if (t.place && !db.place.has(t.place)) throw new Error(`no place "${t.place}"`);
  if (!t.title) throw new Error('a task needs a title');
  if (!db.skill.has(t.skill)) throw new Error(`no skill "${t.skill}"`);
  if (!MEASURES.includes(t.measure)) throw new Error(`measure is time, count or quality, not "${t.measure}"`);
  if (!CADENCES.includes(t.cadence)) throw new Error(`cadence is daily, weekly, once or anytime, not "${t.cadence}"`);
  if (t.deadline && !isDay(t.deadline)) throw new Error(`deadline must be YYYY-MM-DD, not "${t.deadline}"`);
  if (!(Number(t.estimate) > 0)) throw new Error('estimate is minutes, more than 0');
  for (const k of ['stamina', 'mana']) {
    const v = Number(t[k] || 0);
    if (!Number.isFinite(v) || v < -ENERGY_MAX || v > ENERGY_MAX) throw new Error(`${k} is from -${ENERGY_MAX} (restores) to ${ENERGY_MAX}`);
    t[k] = v;
  }
  return { ...t, id: t.id || newId('task', now), type: 'task', created: t.created || dayOf(now), estimate: Number(t.estimate), batch: t.batch ? String(t.batch).trim() : null };
}

export function makeReward({ title, price, repeatable = true, now = Date.now() }) {
  if (!title) throw new Error('a reward needs a title');
  if (!(Number(price) > 0)) throw new Error('a reward costs more than 0 points');
  return { id: newId('reward', now), type: 'reward', title, price: Math.round(Number(price)), repeatable: !!repeatable, archived: false };
}

/** A task is critical when you say so, when it has a deadline, or when someone else is waiting on it. */
export const isCritical = (task) => !!(task.critical || task.forOthers || task.deadline || task.urgent);

// ─── history and targets ────────────────────────────────────────────────────

/** Rework minutes against each completion. */
function reworkByDone(db) {
  const m = new Map();
  for (const r of db.rework) m.set(r.done, [...(m.get(r.done) || []), r]);
  return m;
}

/**
 * A completion as it really turned out: rework adds its minutes to the time,
 * and takes the share it redid off the quality.
 */
export function actual(done, reworks = []) {
  const fix = reworks.reduce((n, r) => n + r.minutes, 0);
  const share = done.minutes > 0 ? Math.min(1, fix / done.minutes) : (fix > 0 ? 1 : 0);
  const quality = done.quality * (1 - share);
  const minutes = done.minutes + fix;
  let value = done.value;
  if (done.measure === 'time') value = done.value + fix;
  if (done.measure === 'quality') value = Math.round(quality * 100);
  return { minutes, quality, value, reworked: reworks.length > 0 };
}

/** A task's recent average, best, target and history-based estimate, from completions before `before`. */
export function taskStats(db, task, before = Infinity, rw = reworkByDone(db), step = Number.isFinite(before) ? difficultyOn(db, dayOf(before), task.skill).targetStep : TARGET_STEP) {
  // Only rework already logged by `before` counts: a price never sees the future.
  const known = (d) => (rw.get(d.id) || []).filter((r) => (r.at ?? 0) < before);
  const runs = db.done.filter((d) => d.task === task.id && (d.end ?? 0) < before).map((d) => ({ ...d, ...actual(d, known(d)) }));
  const better = betterOf(task);
  const recent = runs.slice(-HISTORY_RUNS);
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const values = runs.map((r) => r.value).filter(Number.isFinite);
  const best = values.length ? (better === 'less' ? Math.min(...values) : Math.max(...values)) : null;
  let target = null;
  let estimate = task.estimate;
  let estimateFrom = 'you';
  if (recent.length >= HISTORY_MIN_RUNS) {
    const a = avg(recent.map((r) => r.value));
    target = better === 'less' ? a * (1 - step) : a * (1 + step);
    target = task.measure === 'quality' ? Math.min(100, target) : target;
    target = Math.round(target * 10) / 10;
    // The estimate is the flow target in minutes, so a repeated task's price cannot be inflated.
    estimate = Math.max(1, Math.round(avg(recent.map((r) => r.minutes)) * (1 - step)));
    estimateFrom = 'history';
  }
  return { runs: runs.length, best, target, estimate, estimateFrom, last: runs[runs.length - 1] || null };
}

// ─── levels and XP ──────────────────────────────────────────────────────────

/** Level from XP, where getting from level L to L+1 costs step × L. XP can fall, and so can the level. */
export function levelFor(xp, step) {
  const level = Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / step)) / 2);
  const floor = (step * level * (level - 1)) / 2;
  return { level, xp, into: Math.max(0, xp) - floor, span: step * level, toNext: floor + step * level - Math.max(0, xp) };
}

/** XP per skill: completions add their priced points, rework subtracts its penalty. */
function skillXp(db, before = Infinity) {
  const xp = new Map(db.skills.map((s) => [s.id, 0]));
  const doneSkill = new Map();
  for (const d of db.done) {
    const t = db.task.get(d.task);
    doneSkill.set(d.id, t?.skill);
    if ((d.end ?? 0) < before && t && xp.has(t.skill)) xp.set(t.skill, xp.get(t.skill) + (d.price?.points || 0));
  }
  for (const r of db.rework) {
    const s = doneSkill.get(r.done);
    if ((r.at ?? 0) < before && xp.has(s)) xp.set(s, xp.get(s) - (r.penalty || 0));
  }
  return xp;
}

/** How much of its listed energy a task costs at a skill level: less as you master it. */
export const masteryFactor = (level) => Math.max(MASTERY_FLOOR, 1 - MASTERY_STEP * (level - 1));

// ─── underdog, combo, batch ─────────────────────────────────────────────────

/** Stats with the least base XP over the week before `day`. Fixed for the day; nobody when all tie. */
export function underdogsOn(db, day) {
  const from = addDays(day, -WEEK);
  const xp = new Map(db.stats.map((s) => [s.id, 0]));
  for (const d of db.done) {
    if (d.day < from || d.day >= day) continue;
    const stat = db.skill.get(db.task.get(d.task)?.skill)?.stat;
    if (xp.has(stat)) xp.set(stat, xp.get(stat) + (d.price?.base || 0));
  }
  const values = [...xp.values()];
  const low = Math.min(...values);
  return low === Math.max(...values) ? [] : [...xp].filter(([, v]) => v === low).map(([k]) => k);
}

const restores = (task) => (task.stamina || 0) < 0 || (task.mana || 0) < 0;

/**
 * Where a completion starting at `start` falls in the running combo and batch.
 * Rest pauses a combo: it neither grows it nor breaks it, and the gap is
 * measured from the end of the rest. The chain is walked back from the
 * records rather than read off the previous one's stored index, because a
 * rest's stored index cannot tell "paused after a task" from "no chain yet".
 *
 *   comboIndex — non-rest tasks chained before this one (a rest keeps the
 *                index of the task it paused after)
 *   batchIndex — same-batch tasks directly before this one, each ≤ 10 min apart
 */
/** Minutes of restoring moments that overlap the span [from, to]. */
function restingMinutes(db, from, to) {
  let ms = 0;
  for (const m of db.moments || []) {
    if (!((m.energy?.stamina || 0) < 0 || (m.energy?.mana || 0) < 0)) continue;
    ms += Math.max(0, Math.min(m.end, to) - Math.max(m.start, from));
  }
  return ms / 60000;
}

export function chainAt(db, task, start) {
  let cursor = start;
  let chained = 0;
  let batchIndex = 0;
  let batchOpen = !!task.batch;
  for (let i = db.done.length - 1; i >= 0; i--) {
    const d = db.done[i];
    if ((d.end ?? 0) > start) continue;
    const gap = (cursor - d.end) / 60000;
    const t = db.task.get(d.task);
    if (batchOpen && t?.batch === task.batch && gap <= BATCH_GAP_MIN) batchIndex++;
    else batchOpen = false;
    // Rest pauses a combo: time in a restoring moment (Rest, a meal) inside
    // the gap does not count towards it.
    if (gap - restingMinutes(db, d.end, cursor) > COMBO_GAP_MIN) break;
    if (!t || !restores(t)) chained++;
    cursor = Math.min(cursor, d.start ?? d.end);
  }
  const comboIndex = restores(task) ? Math.max(0, chained - 1) : chained;
  return { comboIndex, batchIndex };
}

// ─── pricing a completion ───────────────────────────────────────────────────

/**
 * Price a completion before it is written: points and energy, with every
 * bonus named. The result is stored on the record and never recomputed.
 *
 *   base   = estimated minutes × quality × POINTS_PER_MINUTE
 *   points = base × min(BONUS_CAP, 1 + flow + pb + underdog + (batch or combo))
 */
export function priceDone(db, task, { start, end, minutes, value, quality }) {
  const rw = reworkByDone(db);
  const day = dayOf(end);
  const tier = difficultyOn(db, day, task.skill);
  const hist = taskStats(db, task, start, rw, tier.targetStep);
  const better = betterOf(task);
  const beats = (a, b) => (better === 'less' ? a <= b : a >= b);
  const strictly = (a, b) => (better === 'less' ? a < b : a > b);
  const stat = db.skill.get(task.skill)?.stat;
  const chain = chainAt(db, task, start);
  const bonuses = {
    flow: hist.target !== null && beats(value, hist.target) ? BONUS.flow : 0,
    pb: hist.best !== null && strictly(value, hist.best) ? BONUS.pb : 0,
    underdog: underdogsOn(db, day).includes(stat) ? BONUS.underdog : 0,
    combo: chain.batchIndex > 0 ? 0 : Math.min(BONUS.comboMax, BONUS.comboStep * chain.comboIndex),
    batch: BONUS.batchStep * chain.batchIndex,
  };
  const multiplier = Math.min(BONUS_CAP, 1 + Object.values(bonuses).reduce((a, b) => a + b, 0));
  const base = Math.max(1, Math.round(hist.estimate * quality * POINTS_PER_MINUTE));
  const level = levelFor(skillXp(db, start).get(task.skill) || 0, SKILL_STEP).level;
  const cost = (k) => {
    const listed = task[k] || 0;
    if (listed <= 0) return listed; // restoring is never discounted
    let c = listed * masteryFactor(level);
    if (k === 'mana' && chain.batchIndex > 0) c *= BATCH_MANA_SHARE;
    c *= tier.energy;
    return Math.round(c * 10) / 10;
  };
  return {
    estimate: hist.estimate,
    estimateFrom: hist.estimateFrom,
    target: hist.target,
    best: hist.best,
    base,
    bonuses,
    multiplier: Math.round(multiplier * 100) / 100,
    points: Math.round(base * multiplier * tier.points),
    difficulty: tier.id,
    energy: { stamina: cost('stamina'), mana: cost('mana') },
    comboIndex: chain.comboIndex,
    batchIndex: chain.batchIndex,
    skillLevel: level,
  };
}

/**
 * The record for a finished task. `value` is the measure: minutes for time,
 * the count for count, the percentage for quality. `quality` is 0–1 and
 * defaults to the quality measure itself, or to 1.
 */
export function makeDone(db, taskRef, { end = Date.now(), minutes, value, quality, timed = false, note = '', reworkOf = null } = {}) {
  const task = typeof taskRef === 'string' ? db.task.get(taskRef) : taskRef;
  if (!task) throw new Error(`no task "${taskRef}"`);
  minutes = Number(minutes);
  if (!(minutes > 0)) throw new Error('minutes must be more than 0');
  if (task.measure === 'time') value = minutes;
  value = Number(value);
  if (!Number.isFinite(value) || value < 0) throw new Error(`a ${task.measure} task needs a value`);
  if (task.measure === 'quality') {
    if (value > 100) throw new Error('quality is 0–100%');
    quality = value / 100;
  }
  quality = quality === undefined || quality === null || quality === '' ? 1 : Number(quality);
  if (!(quality >= 0 && quality <= 1)) throw new Error('quality is 0–1');
  const start = end - Math.round(minutes * 60000);
  const price = priceDone(db, task, { start, end, minutes, value, quality });
  return {
    id: newId('done', end), type: 'done', task: task.id, day: dayOf(end), start, end, minutes, measure: task.measure,
    value, quality, timed: !!timed, note, critical: isCritical(task), price,
    comboIndex: price.comboIndex, batchIndex: price.batchIndex, ...(reworkOf ? { reworkOf } : {}),
  };
}

// ─── spending: purchases, rework, debt ──────────────────────────────────────

/** The points balance: earned, less rework charges and purchases, as they were charged. */
export function balanceOf(db, before = Infinity) {
  let n = 0;
  for (const d of db.done) if ((d.end ?? 0) < before) n += d.price?.points || 0;
  for (const r of db.rework) if ((r.at ?? 0) < before) n -= r.charged || 0;
  for (const p of db.purchases) if ((p.at ?? 0) < before) n -= p.charged || 0;
  return n;
}

/** What a charge really costs at a balance: the part below zero costs double. */
export function chargeFor(balance, amount, debt = DEBT_MULTIPLIER) {
  if (amount <= 0) return amount;
  const covered = Math.max(0, Math.min(balance, amount));
  return Math.round(covered + (amount - covered) * debt);
}

export function makePurchase(db, rewardRef, { at = Date.now() } = {}) {
  const reward = typeof rewardRef === 'string' ? db.reward.get(rewardRef) : rewardRef;
  if (!reward || reward.archived) throw new Error(`no reward "${rewardRef}"`);
  if (!reward.repeatable && db.purchases.some((p) => p.reward === reward.id)) throw new Error(`${reward.title} is a one-off and already bought`);
  // The balance at the moment of buying, so a purchase logged later is charged as it would have been.
  const balance = balanceOf(db, at);
  const tier = difficultyOn(db, dayOf(at));
  return { id: newId('purchase', at), type: 'purchase', reward: reward.id, day: dayOf(at), at, price: reward.price, charged: chargeFor(balance, reward.price, tier.debt), difficulty: tier.id };
}

/**
 * Rework on a completion: its fix minutes × the points per minute it earned
 * × the multiplier (2× for critical work; 1.5, 1.75, 2 with each repeat
 * otherwise). XP loses the penalty; the balance loses it with debt doubled.
 */
export function makeRework(db, doneRef, { minutes, at = Date.now(), note = '' }) {
  const done = db.done.find((d) => d.id === doneRef);
  if (!done) throw new Error(`no completion "${doneRef}"`);
  minutes = Number(minutes);
  if (!(minutes > 0)) throw new Error('rework minutes must be more than 0');
  const repeat = db.rework.filter((r) => r.done === done.id).length + 1;
  // Rework plays by the tier its completion was priced at.
  const tier = tierOf(done.price?.difficulty);
  const listed = done.critical ? REWORK_CRITICAL : REWORK_MULTIPLIERS[Math.min(repeat, REWORK_MULTIPLIERS.length) - 1];
  const multiplier = Math.round((listed + tier.reworkAdd) * 100) / 100;
  const perMinute = (done.price?.points || 0) / done.minutes;
  const penalty = Math.round(minutes * perMinute * multiplier);
  return {
    id: newId('rework', at), type: 'rework', done: done.id, task: done.task, day: dayOf(at), at, minutes, repeat,
    multiplier, perMinute: Math.round(perMinute * 100) / 100, penalty, charged: chargeFor(balanceOf(db, at), penalty, tier.debt), difficulty: tier.id, note,
  };
}

// ─── energy ─────────────────────────────────────────────────────────────────

export function makeEnergy({ stamina, mana, at = Date.now() }) {
  const v = (x, k) => {
    const n = Number(x);
    if (!(n >= 0 && n <= ENERGY_MAX)) throw new Error(`${k} is 0–${ENERGY_MAX}`);
    return Math.round(n * 2) / 2;
  };
  return { id: newId('energy', at), type: 'energy', day: dayOf(at), at, stamina: v(stamina, 'stamina'), mana: v(mana, 'mana') };
}

/** Everything that moved energy on a day, in order: completions and moments. */
function drains(db, day) {
  return [
    ...db.done.filter((d) => d.day === day).map((d) => ({ end: d.end, energy: d.price?.energy || {} })),
    ...db.moments.filter((m) => m.day === day).map((m) => ({ end: m.end, energy: m.energy || {} })),
  ].sort((a, b) => a.end - b.end);
}

/**
 * Today's stamina and mana: the morning rating, less what each completion
 * cost, plus what rest restored — never above the maximum or below zero.
 */
export function energyOn(db, day) {
  const rating = [...db.energy].reverse().find((e) => e.day === day) || null;
  const e = { stamina: rating ? rating.stamina : null, mana: rating ? rating.mana : null, rated: !!rating };
  if (!rating) return { ...e, empty: [] };
  for (const x of drains(db, day)) {
    if (x.end < rating.at) continue;
    for (const k of ['stamina', 'mana']) e[k] = Math.max(0, Math.min(ENERGY_MAX, e[k] - (x.energy[k] || 0)));
  }
  e.stamina = Math.round(e.stamina * 10) / 10;
  e.mana = Math.round(e.mana * 10) / 10;
  return { ...e, empty: ['stamina', 'mana'].filter((k) => e[k] <= 0) };
}

// ─── reviews ────────────────────────────────────────────────────────────────

export function makeReview(db, { satisfaction, ratings = {}, win = '', lesson = '', next = '', difficulty = null, at = Date.now() }) {
  const score = (v, what) => {
    const n = Number(v);
    if (!(n >= 0 && n <= 10)) throw new Error(`${what} is 0–10, not "${v}"`);
    return Math.round(n * 2) / 2;
  };
  const clean = {};
  for (const [k, v] of Object.entries(ratings)) {
    if (!db.stat.has(k)) throw new Error(`no stat "${k}"`);
    if (v !== '' && v !== undefined && v !== null) clean[k] = score(v, db.stat.get(k).name);
  }
  const day = dayOf(at);
  const rec = { id: newId('review', at), type: 'review', week: isoWeek(day), day, at, satisfaction: score(satisfaction, 'satisfaction'), ratings: clean, win, lesson, next };
  if (difficulty) rec.difficulty = checkDifficulty(db, difficulty, at);
  return rec;
}

/**
 * The difficulty a review asks for, checked at the review's time: known tiers
 * and skills, and a raise only as far as the level allows (the player's level
 * for the global tier, the skill's own for an override). Lowering is free.
 */
function checkDifficulty(db, { tier = DEFAULT_DIFFICULTY, skills = {} } = {}, at) {
  const known = (id) => {
    const i = DIFFICULTY.findIndex((d) => d.id === id);
    if (i < 0) throw new Error(`no difficulty tier "${id}" (${DIFFICULTY.map((d) => d.id).join(', ')})`);
    return i;
  };
  const xp = skillXp(db, at);
  const tomorrow = addDays(dayOf(at), 1);
  const allow = (id, level, current, what) => {
    const i = known(id);
    if (i > DIFFICULTY.findIndex((d) => d.id === current.id) && DIFFICULTY[i].unlock > level) {
      throw new Error(`${DIFFICULTY[i].name} unlocks at level ${DIFFICULTY[i].unlock}; ${what} is level ${level}`);
    }
  };
  const playerLevel = levelFor([...xp.values()].reduce((a, b) => a + b, 0), PLAYER_STEP).level;
  allow(tier, playerLevel, difficultyOn(db, tomorrow), 'the player');
  const clean = {};
  for (const [skill, id] of Object.entries(skills || {})) {
    if (!db.skill.has(skill)) throw new Error(`no skill "${skill}"`);
    if (!id) continue;
    allow(id, levelFor(xp.get(skill) || 0, SKILL_STEP).level, difficultyOn(db, tomorrow, skill), db.skill.get(skill).name);
    clean[skill] = id;
  }
  return { tier, skills: clean };
}

/** The difficulty setting in effect on a day: from the latest review before it that set one. */
function difficultySetting(db, day) {
  let found = null;
  for (const r of [...db.reviews].sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? 0) - (b.at ?? 0))) {
    if (r.day < day && r.difficulty) found = r.difficulty;
  }
  return found || { tier: DEFAULT_DIFFICULTY, skills: {} };
}

/** The tier a skill (or, without one, the whole game) plays at on a day. */
export function difficultyOn(db, day, skillId = null) {
  const s = difficultySetting(db, day);
  return tierOf((skillId && s.skills?.[skillId]) || s.tier);
}

/** The last review of each ISO week, oldest week first: redoing a review replaces it. */
export function latestPerWeek(reviews) {
  const byWeek = new Map();
  for (const r of [...reviews].sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? 0) - (b.at ?? 0))) {
    const w = r.week || isoWeek(r.day);
    byWeek.set(w, r);
  }
  return [...byWeek.values()];
}

// ─── periods, streaks ───────────────────────────────────────────────────────

function samePeriod(cadence, a, b) {
  if (cadence === 'once') return true;
  if (cadence === 'weekly') return isoWeek(a) === isoWeek(b);
  if (cadence === 'daily') return a === b;
  return false; // anytime: always open
}

export const isDoneFor = (db, task, day) => db.done.some((d) => d.task === task.id && samePeriod(task.cadence, d.day, day));

/** Days in a row, forgiving `grace` missed days in any week; today not yet done never breaks it. */
export function dailyStreak(days, day, grace = 1) {
  if (!days.size) return { streak: 0, atRisk: false };
  const first = [...days].sort()[0];
  let cursor = days.has(day) ? day : addDays(day, -1);
  let streak = 0;
  const missed = [];
  while (cursor >= first) {
    if (days.has(cursor)) streak++;
    else if (missed.filter((m) => daysBetween(cursor, m) < WEEK).length < grace) missed.push(cursor);
    else break;
    cursor = addDays(cursor, -1);
  }
  return { streak, atRisk: streak > 0 && !days.has(day) };
}

export function weeklyStreak(weeks, day) {
  let cursor = weeks.has(isoWeek(day)) ? day : addDays(day, -7);
  let streak = 0;
  while (weeks.has(isoWeek(cursor))) { streak++; cursor = addDays(cursor, -7); }
  return { streak, atRisk: streak > 0 && !weeks.has(isoWeek(day)) };
}

// ─── the next task ──────────────────────────────────────────────────────────

/**
 * What to do next, in the order the spec fixes: anything due soon, then what
 * today's energy can afford, then the most neglected stat, then the skill
 * closest to its next level. Same-type tasks wait until a batch is worth it.
 * When energy is empty only rest and free tasks are offered.
 */
export function pickNext(db, now, g = null) {
  const day = dayOf(now);
  const energy = g?.energy || energyOn(db, day);
  const skills = g?.skillLevels || new Map(db.skills.map((s) => [s.id, levelFor(skillXp(db).get(s.id) || 0, SKILL_STEP)]));
  const under = new Set(g?.underdogs || underdogsOn(db, day));
  const open = db.tasks.filter((t) => !t.archived && !isDoneFor(db, t, day));
  const soon = (t) => t.deadline && daysBetween(day, t.deadline) <= DEADLINE_SOON_DAYS;

  const batches = new Map();
  for (const t of open) if (t.batch) batches.set(t.batch, [...(batches.get(t.batch) || []), t]);
  const queued = [];
  const released = new Set();
  for (const [name, list] of batches) {
    if (list.length >= BATCH_RELEASE || list.some(soon)) released.add(name);
    else queued.push({ batch: name, waiting: list.length, need: BATCH_RELEASE });
  }

  const cost = (t) => {
    const f = masteryFactor(skills.get(t.skill)?.level || 1);
    return { stamina: Math.max(0, (t.stamina || 0) * f), mana: Math.max(0, (t.mana || 0) * f) };
  };
  const affordable = (t) => !energy.rated || (cost(t).stamina <= energy.stamina && cost(t).mana <= energy.mana);
  const free = (t) => cost(t).stamina === 0 && cost(t).mana === 0;
  const exhausted = energy.rated && energy.empty.length > 0;

  const candidates = open.filter((t) => !t.batch || released.has(t.batch)).filter((t) => !exhausted || restores(t) || free(t) || soon(t));
  const rank = (t) => [
    soon(t) ? 0 : 1,
    soon(t) ? t.deadline : '', // a far deadline must not jump the energy and underdog order
    affordable(t) ? 0 : 1,
    under.has(db.skill.get(t.skill)?.stat) ? 0 : 1,
    skills.get(t.skill)?.toNext ?? Infinity,
  ];
  const cmp = (a, b) => { const x = rank(a); const y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return a.title.localeCompare(b.title); };
  candidates.sort(cmp);

  const why = (t) => {
    const r = [];
    if (t.deadline) r.push(daysBetween(day, t.deadline) < 0 ? 'overdue' : `due ${t.deadline}`);
    if (!affordable(t)) r.push('more energy than you have');
    if (under.has(db.skill.get(t.skill)?.stat)) r.push('underdog stat');
    if (t.batch) r.push(`batch: ${batches.get(t.batch).length} × ${t.batch}`);
    if (restores(t)) r.push('restores energy');
    return r;
  };
  // A released batch is offered once, as a whole, led by its best-ranked task.
  const offered = new Set();
  const suggestions = [];
  for (const t of candidates) {
    if (t.batch && offered.has(t.batch)) continue;
    if (t.batch) offered.add(t.batch);
    suggestions.push({ task: t.id, title: t.title, why: why(t), batch: t.batch ? batches.get(t.batch).map((x) => x.id) : null, cost: cost(t) });
  }
  return { next: suggestions[0] || null, alternatives: suggestions.slice(1, 4), queued, exhausted, empty: energy.empty || [] };
}

/** When the timer starts a task finished recently, it asks whether this is rework of that run. */
export function reworkCandidate(db, taskId, now) {
  const since = addDays(dayOf(now), -REWORK_ASK_DAYS);
  return [...db.done].reverse().find((d) => d.task === taskId && d.day >= since) || null;
}

/**
 * The weekly review is due every Sunday — the end of a Monday–Sunday week —
 * while that week has none, and stays due after a missed week until one is
 * done. A new player is first due on their first Sunday.
 */
export function reviewDue(reviews, day) {
  const week = isoWeek(day);
  if (reviews.some((r) => r.week === week)) return false;
  if (new Date(`${day}T12:00:00`).getDay() === 0) return true;
  const latest = reviews[reviews.length - 1];
  return !!latest && latest.week < isoWeek(addDays(day, -7));
}

// ─── achievements ───────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { id: 'first-step', title: 'First step', text: 'Finish any task.', test: (f) => f.done > 0 },
  { id: 'in-the-zone', title: 'In the zone', text: 'Hit a flow target.', test: (f) => f.flow > 0 },
  { id: 'personal-best', title: 'Personal best', text: 'Beat your best on a task.', test: (f) => f.pb > 0 },
  { id: 'combo-5', title: 'Combo ×5', text: 'Chain five tasks with no long breaks.', test: (f) => f.maxCombo >= 4 },
  { id: 'batch-3', title: 'Batched', text: 'Do three of the same kind in one sitting.', test: (f) => f.maxBatch >= 2 },
  { id: 'batch-5', title: 'Assembly line', text: 'Batch five of the same kind.', test: (f) => f.maxBatch >= 4 },
  { id: 'clean-week', title: 'Clean week', text: 'A week with 10+ tasks and no rework.', test: (f) => f.cleanWeek },
  { id: 'week-streak', title: 'Seven days', text: 'Keep a daily task going for 7 days.', test: (f) => f.bestStreak >= 7 },
  { id: 'skill-5', title: 'Journeyman', text: 'Reach level 5 in a skill.', test: (f) => f.maxSkill >= 5 },
  { id: 'mastery', title: 'Mastery', text: 'Make a task cost the least energy it ever will.', test: (f) => f.maxSkill >= Math.ceil(1 + (1 - MASTERY_FLOOR) / MASTERY_STEP) },
  { id: 'reflective', title: 'Reflective', text: 'Do four weekly reviews.', test: (f) => f.reviews >= 4 },
  { id: 'treat', title: 'Earned it', text: 'Buy a reward without going into debt.', test: (f) => f.cleanPurchase },
];

// ─── everything, for one moment ─────────────────────────────────────────────

/** The whole game as of `now`: what the dashboard and the CLI show. */
export function play(records, now = Date.now()) {
  const db = Array.isArray(records) ? index(records) : records;
  const day = dayOf(now);
  const rw = reworkByDone(db);

  const xp = skillXp(db);
  const skillLevels = new Map(db.skills.map((s) => [s.id, levelFor(xp.get(s.id) || 0, SKILL_STEP)]));
  const skills = db.skills.map((s) => ({ ...s, ...skillLevels.get(s.id), energyFactor: Math.round(masteryFactor(skillLevels.get(s.id).level) * 100) / 100 }));
  const statXp = new Map(db.stats.map((s) => [s.id, 0]));
  for (const s of skills) if (statXp.has(s.stat)) statXp.set(s.stat, statXp.get(s.stat) + s.xp);
  const underdogs = underdogsOn(db, day);
  const weekFrom = addDays(day, -(WEEK - 1));
  const stats = db.stats.map((s) => ({
    ...s,
    ...levelFor(statXp.get(s.id), STAT_STEP),
    underdog: underdogs.includes(s.id),
    lastWeek: db.done.filter((d) => d.day >= weekFrom && db.skill.get(db.task.get(d.task)?.skill)?.stat === s.id).reduce((n, d) => n + (d.price?.points || 0), 0),
    skills: skills.filter((k) => k.stat === s.id).map((k) => k.id),
  }));
  const totalXp = [...xp.values()].reduce((a, b) => a + b, 0);

  const tier = difficultyOn(db, day);
  const tasks = db.tasks.map((t) => {
    const mine = db.done.filter((d) => d.task === t.id);
    const hist = taskStats(db, t, Infinity, rw, difficultyOn(db, day, t.skill).targetStep);
    const streak = t.cadence === 'daily' ? dailyStreak(new Set(mine.map((d) => d.day)), day, tier.grace)
      : t.cadence === 'weekly' ? weeklyStreak(new Set(mine.map((d) => isoWeek(d.day))), day)
      : { streak: 0, atRisk: false };
    return {
      ...t, critical: isCritical(t), ...hist, ...streak,
      doneNow: isDoneFor(db, t, day),
      reworks: db.rework.filter((r) => r.task === t.id).length,
      overdue: !!t.deadline && t.deadline < day && !isDoneFor(db, t, day),
    };
  });

  const energy = energyOn(db, day);
  const balance = balanceOf(db);
  const next = pickNext(db, now, { energy, skillLevels, underdogs });

  const doneToday = db.done.filter((d) => d.day === day);
  const last = db.done[db.done.length - 1];
  const sinceLast = last ? (now - last.end) / 60000 : Infinity;
  const combo = last && sinceLast <= COMBO_GAP_MIN ? { index: last.comboIndex || 0, minutesLeft: Math.max(0, Math.round(COMBO_GAP_MIN - sinceLast)) } : { index: 0, minutesLeft: 0 };
  const batchTask = last && db.task.get(last.task);
  const batch = batchTask?.batch && sinceLast <= BATCH_GAP_MIN ? { name: batchTask.batch, index: last.batchIndex || 0, minutesLeft: Math.max(0, Math.round(BATCH_GAP_MIN - sinceLast)) } : null;

  const weeks = new Map();
  for (const d of db.done) { const w = isoWeek(d.day); weeks.set(w, (weeks.get(w) || 0) + 1); }
  const reworkWeeks = new Set(db.rework.map((r) => isoWeek(db.done.find((d) => d.id === r.done)?.day || r.day)));
  // One review counts per ISO week: a second one that week replaces the first.
  const reviews = latestPerWeek(db.reviews);
  const latest = reviews[reviews.length - 1] || null;
  const before = reviews.slice(-4, -1);
  const trend = latest && before.length ? latest.satisfaction - before.reduce((n, r) => n + r.satisfaction, 0) / before.length : null;

  const player = levelFor(totalXp, PLAYER_STEP);
  const setting = difficultySetting(db, day);
  const locked = DIFFICULTY.find((d) => d.unlock > player.level);
  const difficulty = {
    tier: tier.id, name: tier.name, skills: { ...(setting.skills || {}) },
    unlocked: DIFFICULTY.filter((d) => d.unlock <= player.level).map((d) => d.id),
    next: locked ? { id: locked.id, name: locked.name, unlock: locked.unlock } : null,
    changesAt: 'review',
  };
  const facts = {
    done: db.done.length,
    flow: db.done.filter((d) => d.price?.bonuses?.flow).length,
    pb: db.done.filter((d) => d.price?.bonuses?.pb).length,
    maxCombo: Math.max(0, ...db.done.map((d) => d.comboIndex || 0)),
    maxBatch: Math.max(0, ...db.done.map((d) => d.batchIndex || 0)),
    cleanWeek: [...weeks].some(([w, n]) => n >= 10 && !reworkWeeks.has(w)),
    bestStreak: Math.max(0, ...tasks.map((t) => (t.cadence === 'daily' ? t.streak : 0))),
    maxSkill: Math.max(0, ...skills.map((s) => s.level)),
    reviews: reviews.length,
    cleanPurchase: db.purchases.some((p) => p.charged === p.price),
  };

  return {
    now, day, week: isoWeek(day),
    settings: db.settings,
    player, difficulty, balance, energy, stats, skills, tasks,
    rewards: db.rewards.filter((r) => !r.archived).map((r) => ({ ...r, affordable: balance >= r.price, bought: db.purchases.filter((p) => p.reward === r.id).length })),
    next, combo, batch,
    today: { points: doneToday.reduce((n, d) => n + (d.price?.points || 0), 0), done: doneToday.length, minutes: doneToday.reduce((n, d) => n + d.minutes, 0) },
    history: [...db.done].reverse().slice(0, 50).map((d) => ({ ...d, title: db.task.get(d.task)?.title || '(deleted task)', rework: rw.get(d.id) || [] })),
    purchases: [...db.purchases].reverse().slice(0, 20).map((p) => ({ ...p, title: db.reward.get(p.reward)?.title || '(deleted reward)' })),
    satisfaction: { latest, trend, history: reviews, due: reviewDue(reviews, day) },
    achievements: ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, earned: test(facts) })),
    underdogs,
    places: db.places,
    kinds: db.kinds,
    moments: db.moments.filter((m) => m.day === day),
  };
}

// ─── the day, as a story ────────────────────────────────────────────────────

/** The game as it stood at `ms`: events after it are left out, definitions kept. */
function asOf(db, ms) {
  const upTo = (xs, key) => xs.filter((x) => (x[key] ?? 0) < ms);
  return {
    ...db,
    done: upTo(db.done, 'end'), rework: upTo(db.rework, 'at'), purchases: upTo(db.purchases, 'at'),
    energy: upTo(db.energy, 'at'), moments: upTo(db.moments, 'end'), reviews: upTo(db.reviews, 'at'),
  };
}

/** A walk between two places takes about this long, however far the gap. */
export const WALK_MIN = 5;

/**
 * The day as the replay tells it: every completion, moment, rework and
 * purchase in time order, each at a place, with the gaps between them filled
 * in — a walk when the next thing happens somewhere else, then idling for
 * whatever time is left. Energy is tracked through it for the meters.
 */
export function replayDay(records, day, { now = Date.now() } = {}) {
  const db = Array.isArray(records) ? index(records) : records;
  const zoneOf = (place) => db.place.get(place)?.zone || 'elsewhere';
  const nameOf = (place) => db.place.get(place)?.name || 'Somewhere';
  const events = [];
  for (const d of db.done.filter((x) => x.day === day)) {
    const task = db.task.get(d.task);
    const b = d.price?.bonuses || {};
    const tags = [
      b.batch ? `batch ×${d.batchIndex + 1}` : b.combo ? `combo ×${d.comboIndex + 1}` : '',
      b.flow ? 'in the zone' : '', b.pb ? 'personal best' : '', b.underdog ? 'underdog' : '',
    ].filter(Boolean);
    events.push({ kind: 'done', id: d.id, start: d.start, end: d.end, place: placeOfTask(db, task), title: task?.title || 'A task', skill: task?.skill || null, points: d.price?.points || 0, energy: d.price?.energy || {}, tags, text: `${task?.title || 'A task'}${tags.length ? ` — ${tags.join(', ')}` : ''}. +${d.price?.points || 0}` });
  }
  for (const m of db.moments.filter((x) => x.day === day)) {
    events.push({ kind: 'moment', id: m.id, start: m.start, end: m.end, place: m.place, title: m.title, who: m.who || '', points: 0, energy: m.energy || {}, text: m.who ? `${m.title} with ${m.who}.` : `${m.title}.` });
  }
  for (const r of db.rework.filter((x) => x.day === day)) {
    const d = db.done.find((x) => x.id === r.done);
    const task = db.task.get(r.task);
    events.push({ kind: 'rework', id: r.id, start: r.at - r.minutes * 60000, end: r.at, place: placeOfTask(db, task), title: `Rework: ${task?.title || 'a task'}`, points: -(r.charged || 0), energy: {}, text: `Rework on ${task?.title || 'a task'}${d ? ` from ${d.day}` : ''}. −${r.charged} (×${r.multiplier})` });
  }
  for (const p of db.purchases.filter((x) => x.day === day)) {
    const reward = db.reward.get(p.reward);
    events.push({ kind: 'purchase', id: p.id, start: p.at, end: p.at, place: null, title: reward?.title || 'A reward', points: -(p.charged || 0), energy: {}, text: `Bought ${reward?.title || 'a reward'}. −${p.charged}${p.charged > p.price ? ' (on credit, doubled)' : ''}` });
  }
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  // A purchase happens wherever you already were.
  let here = null;
  for (const e of events) { if (!e.place) e.place = here; here = e.place || here; }

  const rating = [...db.energy].reverse().find((e) => e.day === day) || null;
  let energy = rating ? { stamina: rating.stamina, mana: rating.mana } : { stamina: ENERGY_MAX, mana: ENERGY_MAX };
  let points = balanceOf(db, events[0]?.start ?? Infinity);
  const beats = [];
  const series = [{ at: rating?.at ?? events[0]?.start ?? now, ...energy, label: rating ? 'Morning' : 'Start' }];
  const time = new Map();
  const add = (key, ms) => time.set(key, (time.get(key) || 0) + Math.max(0, ms));
  let cursor = null;
  let at = events[0]?.place || null;
  for (const e of events) {
    if (cursor !== null && e.start > cursor) {
      let gap = e.start - cursor;
      if (e.place && at && e.place !== at) {
        const walk = Math.min(gap, WALK_MIN * 60000);
        beats.push({ kind: 'walk', start: cursor, end: cursor + walk, from: at, to: e.place, fromZone: zoneOf(at), toZone: zoneOf(e.place), text: `→ ${nameOf(e.place)}` });
        add('travel', walk);
        gap -= walk;
        cursor += walk;
        at = e.place; // the hero waits where the walk ended
      }
      if (gap > 0) { beats.push({ kind: 'idle', start: cursor, end: e.start, place: at, zone: zoneOf(at), text: '…' }); add('idle', gap); }
    } else if (e.place && at && e.place !== at) {
      beats.push({ kind: 'walk', start: e.start, end: e.start, from: at, to: e.place, fromZone: zoneOf(at), toZone: zoneOf(e.place), text: `→ ${nameOf(e.place)}` });
    }
    // Like energyOn: what ended before the morning rating is already in it.
    const counts = !rating || e.end >= rating.at;
    for (const k of ['stamina', 'mana']) if (counts) energy[k] = Math.round(Math.max(0, Math.min(ENERGY_MAX, energy[k] - (e.energy[k] || 0))) * 10) / 10;
    points += e.points;
    beats.push({ ...e, zone: zoneOf(e.place), placeName: nameOf(e.place), after: { ...energy, points } });
    if (e.kind !== 'purchase') { add(zoneOf(e.place), e.end - e.start); add(`place:${e.place}`, e.end - e.start); }
    series.push({ at: e.end, ...energy, label: e.title });
    cursor = Math.max(cursor ?? 0, e.end);
    at = e.place || at;
  }

  // The finale is the day as it ended, even when replayed weeks later.
  const past = asOf(db, new Date(`${addDays(day, 1)}T00:00:00`).getTime());
  const totalXp = [...skillXp(past).values()].reduce((a, b) => a + b, 0);
  const tomorrow = pickNext(past, new Date(`${addDays(day, 1)}T08:00:00`).getTime());
  const done = events.filter((e) => e.kind === 'done');
  const zones = ZONES.map((z) => ({ zone: z, minutes: Math.round((time.get(z) || 0) / 60000) })).filter((z) => z.minutes > 0);
  return {
    day,
    start: rating, // the morning energy record, or null when the day was never rated
    hero: db.settings.hero || null,
    beats,
    series,
    finale: {
      points: done.reduce((n, e) => n + e.points, 0),
      spent: -events.filter((e) => e.points < 0).reduce((n, e) => n + e.points, 0),
      tasks: done.length,
      moments: events.filter((e) => e.kind === 'moment').length,
      reworks: events.filter((e) => e.kind === 'rework').length,
      bestCombo: Math.max(0, ...db.done.filter((d) => d.day === day).map((d) => (d.comboIndex || 0) + 1)),
      bestBatch: Math.max(0, ...db.done.filter((d) => d.day === day && d.batchIndex > 0).map((d) => d.batchIndex + 1)),
      level: levelFor(totalXp, PLAYER_STEP).level,
      balance: balanceOf(past),
      zones,
      travel: Math.round((time.get('travel') || 0) / 60000),
      idle: Math.round((time.get('idle') || 0) / 60000),
      tomorrow: tomorrow.next,
    },
  };
}
