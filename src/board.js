// flow/src/board.js — the board (SPEC.md › The board: seven trees). Pure: no
// DOM, no storage, no clock it did not get as an argument.
//
// Seven trees, four professional and three private, cut from the player's own
// work. Each skill declares a **unit of output**, because the tasks are nearly
// all one-offs but the units repeat — eleven "Release Drawing for…", sixty
// reqs, fifty threads — and pace is measured per unit, never per task.
//
// Two logarithmic numbers do different jobs. **Depth** (log₂ hours) is the
// logbook: it never falls, it saturates, and it is the only thing that gates
// difficulty and mastery. **Grade** (10 × log₂ pace) is the score: it can
// fall, and at a sustained 1% a day it ticks once a week, because constant
// percentage improvement is a straight line on a log scale.

/** The stat cap. Seven, because the board is. */
export const MAX_STATS = 7;

/** Four professional trees, then three private. `graded: false` is never scored. */
export const TREES = [
  { id: 'artifice', name: 'Artifice', plain: 'design', icon: '⚒', side: 'work', graded: true },
  { id: 'campaign', name: 'Campaign', plain: 'operations', icon: '▲', side: 'work', graded: true },
  { id: 'rhetoric', name: 'Rhetoric', plain: 'communication', icon: '✎', side: 'work', graded: true },
  { id: 'command', name: 'Command', plain: 'leading without authority', icon: '❖', side: 'work', graded: true },
  { id: 'sinew', name: 'Sinew', plain: 'body', icon: '♥', side: 'life', graded: true },
  { id: 'arcana', name: 'Arcana', plain: 'mind', icon: '☀', side: 'life', graded: true },
  // Hearth is logged and never graded: scoring a relationship changes what it is for.
  { id: 'hearth', name: 'Hearth', plain: 'people', icon: '◈', side: 'life', graded: false },
];

/**
 * The skills. `unit` is what pace divides by; `oneShot` means a unit counts
 * only when it did not come back; `dormant` means the skill is seasonal and
 * does not go cold out of season.
 */
export const SKILLS = [
  // ── Artifice
  { id: 'shaping', tree: 'artifice', name: 'Shaping', plain: 'modelling a part', unit: 'part' },
  { id: 'interlock', tree: 'artifice', name: 'Interlock', plain: 'assemblies and mates', unit: 'assembly' },
  { id: 'inscription', tree: 'artifice', name: 'Inscription', plain: 'drawings and release', unit: 'released drawing', oneShot: true },
  { id: 'sundering', tree: 'artifice', name: 'Sundering', plain: 'modularity and reuse', unit: 'project BOM' },
  // ── Campaign
  { id: 'summoning', tree: 'campaign', name: 'Summoning', plain: 'procurement', unit: 'requisition', oneShot: true },
  { id: 'quickening', tree: 'campaign', name: 'Quickening', plain: 'build and commissioning', unit: 'machine to dry-run' },
  { id: 'trial', tree: 'campaign', name: 'Trial', plain: 'FAT and QA', unit: 'FAT', oneShot: true },
  { id: 'deliverance', tree: 'campaign', name: 'Deliverance', plain: 'delivering on the date given', unit: 'project', oneShot: true },
  // ── Rhetoric
  { id: 'scribing', tree: 'rhetoric', name: 'Scribing', plain: 'written and email', unit: 'thread to resolution' },
  { id: 'parley', tree: 'rhetoric', name: 'Parley', plain: 'customer and vendor conversations', unit: 'purposed conversation', oneShot: true },
  { id: 'council', tree: 'rhetoric', name: 'Council', plain: 'meetings', unit: 'meeting', oneShot: true },
  { id: 'augury', tree: 'rhetoric', name: 'Augury', plain: 'daily writing, graded when it resolves', unit: 'claim' },
  // ── Command
  { id: 'battle-orders', tree: 'command', name: 'Battle Orders', plain: 'handing work off', unit: 'handoff' },
  { id: 'decree', tree: 'command', name: 'Decree', plain: 'making the call', unit: 'decision', oneShot: true },
  { id: 'bulwark', tree: 'command', name: 'Bulwark', plain: 'absorbing the problem', unit: 'escalation' },
  { id: 'tutelage', tree: 'command', name: 'Tutelage', plain: 'making someone else better', unit: 'person coached' },
  // ── Sinew
  { id: 'might', tree: 'sinew', name: 'Might', plain: 'strength', unit: 'session' },
  { id: 'vigor', tree: 'sinew', name: 'Vigor', plain: 'stamina', unit: 'session' },
  { id: 'poise', tree: 'sinew', name: 'Poise', plain: 'agility — snowboard', unit: 'run', oneShot: true, dormant: true },
  // ── Arcana
  { id: 'alacrity', tree: 'arcana', name: 'Alacrity', plain: 'response time', unit: 'reaction test' },
  { id: 'concentration', tree: 'arcana', name: 'Concentration', plain: 'focus', unit: 'timer run' },
  { id: 'lore', tree: 'arcana', name: 'Lore', plain: 'coursework', unit: 'course unit' },
  // ── Hearth: who, not what. Logged, never graded.
  { id: 'covenant', tree: 'hearth', name: 'Covenant', plain: 'the one person', unit: null, graded: false },
  { id: 'bloodline', tree: 'hearth', name: 'Bloodline', plain: 'family', unit: null, graded: false },
  { id: 'fellowship', tree: 'hearth', name: 'Fellowship', plain: 'friends', unit: null, graded: false },
].map((s) => ({ oneShot: false, dormant: false, graded: true, ...s }));

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
export const skillById = (id) => BY_ID.get(id) || null;
export const treeById = (id) => TREES.find((t) => t.id === id) || null;
/** Whether a unit of this skill counts only when it did not come back. */
export const oneShot = (id) => !!BY_ID.get(id)?.oneShot;
/** Whether this skill is scored at all. Hearth is not. */
export const graded = (id) => !!BY_ID.get(id)?.graded;

/** Flow record ids for the board, so the same board is the same records on every device. */
export const statId = (treeId) => `stat_${treeId}`;
export const skillRecordId = (skillId) => `skill_${skillId}`;

/**
 * The board as records the model already understands: one `stat` per tree and
 * one `skill` per skill, carrying the board's own fields so nothing has to
 * look them up from two places.
 */
export function boardRecords() {
  const stats = TREES.map((t, i) => ({
    id: statId(t.id), type: 'stat', name: t.name, plain: t.plain, icon: t.icon,
    order: i, side: t.side, graded: t.graded, tree: t.id,
  }));
  const skills = SKILLS.map((s) => ({
    id: skillRecordId(s.id), type: 'skill', name: s.name, plain: s.plain,
    stat: statId(s.tree), tree: s.tree, skill: s.id, place: null,
    unit: s.unit, oneShot: s.oneShot, dormant: s.dormant, graded: s.graded,
  }));
  return [...stats, ...skills];
}

// ─── Depth: the logbook ─────────────────────────────────────────────────────

/** Depth = 1 + ⌊log₂(hours)⌋, and 0 below the first hour. Never falls, never negative. */
export function depthFor(minutes) {
  const hours = Math.max(0, Number(minutes) || 0) / 60;
  if (hours < 1) return 0;
  return 1 + Math.floor(Math.log2(hours));
}

export const DEPTH_RANKS = [
  { name: 'Initiate', from: 1 },
  { name: 'Journeyman', from: 4 },
  { name: 'Adept', from: 7 },
  { name: 'Master', from: 10 },
  { name: 'Grandmaster', from: 13 },
];

export function rankFor(depth) {
  let name = DEPTH_RANKS[0].name;
  for (const r of DEPTH_RANKS) if (depth >= r.from) name = r.name;
  return name;
}

// ─── Grade: the score ───────────────────────────────────────────────────────

/** Ten levels per doubling of pace, so a sustained 1%/day ticks once a week. */
export const GRADE_PER_DOUBLING = 10;
/** A skill's first four weeks are measured, not graded. */
export const BASELINE_WEEKS = 4;

/**
 * Pace = baseline minutes-per-unit ÷ current minutes-per-unit. For a one-shot
 * skill the denominator counts only units that did not come back, which is
 * what stops the score punishing the player for slowing down to get it right.
 * Null when either side has nothing to divide by: no baseline, no Grade.
 */
export function paceFor({ baseline, current, oneShot: shot = false } = {}) {
  const per = (p) => {
    if (!p) return null;
    const units = shot ? p.clean : p.units;
    if (!(units > 0) || !(p.minutes > 0)) return null;
    return p.minutes / units;
  };
  const was = per(baseline);
  const now = per(current);
  if (was === null || now === null) return null;
  return was / now;
}

/** Grade = 10 × log₂(pace), rounded. Zero at baseline, negative when slower. */
export function gradeFor(pace) {
  if (pace === null || pace === undefined || !(pace > 0)) return null;
  return Math.round(GRADE_PER_DOUBLING * Math.log2(pace));
}
