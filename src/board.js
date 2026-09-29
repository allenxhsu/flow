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
 * Tiers, Diablo-style: a skill opens when the tree is deep enough **and** its
 * prerequisite has been worked. `treeDepth` is the tree's own Depth — log₂ of
 * every hour spent anywhere in it — and `parentDepth` is the Depth wanted in
 * the skill below.
 */
export const TIERS = [
  { tier: 1, treeDepth: 0, parentDepth: 0 },   // open from the first day
  { tier: 2, treeDepth: 4, parentDepth: 2 },   // 8 h in the tree, 2 h in the parent
  { tier: 3, treeDepth: 7, parentDepth: 3 },   // 75 h in the tree, 4 h in the parent
  { tier: 4, treeDepth: 10, parentDepth: 4 },  // 600 h in the tree, 8 h in the parent
];
const tierGate = (n) => TIERS.find((t) => t.tier === n) || TIERS[0];

/**
 * The skills. `unit` is what pace divides by; `oneShot` means a unit counts
 * only when it did not come back; `dormant` means the skill is seasonal and
 * does not go cold out of season.
 */
export const SKILLS = [
  // ── Artifice
  { id: 'shaping', tree: 'artifice', name: 'Shaping', plain: 'modelling a part', tier: 1, requires: null, meter: 'true minutes per part', unit: 'part' },
  { id: 'interlock', tree: 'artifice', name: 'Interlock', plain: 'assemblies and mates', tier: 2, requires: 'shaping', meter: 'minutes per assembly, and mates that break when something upstream changes', unit: 'assembly' },
  { id: 'inscription', tree: 'artifice', name: 'Inscription', plain: 'drawings and release', tier: 2, requires: 'shaping', meter: 'revisions per released drawing', unit: 'released drawing', oneShot: true },
  { id: 'sundering', tree: 'artifice', name: 'Sundering', plain: 'modularity and reuse', tier: 3, requires: 'interlock', meter: 'unique parts per project, and the share reused from the library', unit: 'project BOM' },
  // ── Campaign
  { id: 'summoning', tree: 'campaign', name: 'Summoning', plain: 'procurement', tier: 1, requires: null, meter: 'req-to-on-dock days, and the share needing a second req', unit: 'requisition', oneShot: true },
  { id: 'quickening', tree: 'campaign', name: 'Quickening', plain: 'build and commissioning', tier: 2, requires: 'summoning', meter: 'defects found at dry run', unit: 'machine to dry-run' },
  { id: 'trial', tree: 'campaign', name: 'Trial', plain: 'FAT and QA', tier: 3, requires: 'quickening', meter: 'first-time pass rate', unit: 'FAT', oneShot: true },
  { id: 'deliverance', tree: 'campaign', name: 'Deliverance', plain: 'delivering on the date given', tier: 4, requires: 'trial', meter: 'on-time against the date given at kickoff', unit: 'project', oneShot: true },
  // ── Rhetoric
  { id: 'scribing', tree: 'rhetoric', name: 'Scribing', plain: 'written and email', tier: 1, requires: null, meter: 'round-trips to resolution', unit: 'thread to resolution' },
  { id: 'parley', tree: 'rhetoric', name: 'Parley', plain: 'customer and vendor conversations', tier: 2, requires: 'scribing', meter: 'whether it produced the decision it was for', unit: 'purposed conversation', oneShot: true },
  { id: 'council', tree: 'rhetoric', name: 'Council', plain: 'meetings', tier: 3, requires: 'parley', meter: 'say-back rate', unit: 'meeting', oneShot: true },
  { id: 'augury', tree: 'rhetoric', name: 'Augury', plain: 'daily writing, graded when it resolves', tier: 2, requires: 'scribing', meter: 'calibration — a hit rate near 70%, because always being right means the claims were too safe', unit: 'claim' },
  // ── Command
  { id: 'battle-orders', tree: 'command', name: 'Battle Orders', plain: 'handing work off', tier: 1, requires: null, meter: 'chases needed before it was delivered', unit: 'handoff' },
  { id: 'decree', tree: 'command', name: 'Decree', plain: 'making the call', tier: 3, requires: 'bulwark', meter: 'decisions that stayed made', unit: 'decision', oneShot: true },
  { id: 'bulwark', tree: 'command', name: 'Bulwark', plain: 'absorbing the problem', tier: 2, requires: 'battle-orders', meter: 'escalations closed here rather than passed up', unit: 'escalation' },
  { id: 'tutelage', tree: 'command', name: 'Tutelage', plain: 'making someone else better', tier: 4, requires: 'decree', meter: 'whether their meter moved', unit: 'person coached' },
  // ── Sinew
  { id: 'might', tree: 'sinew', name: 'Might', plain: 'strength', tier: 1, requires: null, meter: 'total load, and estimated 1RM', unit: 'session' },
  { id: 'vigor', tree: 'sinew', name: 'Vigor', plain: 'stamina', tier: 1, requires: null, meter: 'pace at a fixed heart rate, time over a benchmark', unit: 'session' },
  { id: 'poise', tree: 'sinew', name: 'Poise', plain: 'agility — snowboard', tier: 2, requires: 'might', meter: 'falls per run, and the grade of terrain ridden', unit: 'run', oneShot: true, dormant: true },
  // ── Arcana
  { id: 'alacrity', tree: 'arcana', name: 'Alacrity', plain: 'response time', tier: 2, requires: 'concentration', meter: 'median reaction time', unit: 'reaction test' },
  { id: 'concentration', tree: 'arcana', name: 'Concentration', plain: 'focus', tier: 1, requires: null, meter: 'longest unbroken run, and the share cancelled', unit: 'timer run' },
  { id: 'lore', tree: 'arcana', name: 'Lore', plain: 'coursework', tier: 2, requires: 'concentration', meter: 'the external grade', unit: 'course unit' },
  // ── Hearth: who, not what. Logged, never graded.
  { id: 'covenant', tree: 'hearth', name: 'Covenant', plain: 'the one person', tier: null, requires: null, meter: 'nothing — hours are logged and never graded', unit: null, graded: false },
  { id: 'bloodline', tree: 'hearth', name: 'Bloodline', plain: 'family', tier: null, requires: null, meter: 'nothing — hours are logged and never graded', unit: null, graded: false },
  { id: 'fellowship', tree: 'hearth', name: 'Fellowship', plain: 'friends', tier: null, requires: null, meter: 'nothing — hours are logged and never graded', unit: null, graded: false },
].map((s) => ({ oneShot: false, dormant: false, graded: true, tier: null, requires: null, ...s }));

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
    tier: s.tier, requires: s.requires, meter: s.meter,
  }));
  return [...stats, ...skills];
}


/** Every skill of a tree, shallowest tier first. */
export const treeSkills = (tree) => SKILLS.filter((s) => s.tree === tree)
  .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.name.localeCompare(b.name));

/** A tree's own Depth: log₂ of every hour spent anywhere in it. */
export function treeDepth(tree, minutesBySkill = new Map()) {
  let total = 0;
  for (const s of SKILLS) if (s.tree === tree) total += Number(minutesBySkill.get(s.id)) || 0;
  return depthFor(total);
}

/**
 * Whether a skill is open, and if not, what in plain words is missing. Both
 * conditions must hold: the tree deep enough, and the prerequisite actually
 * worked. Pouring a thousand hours into one root never opens what sits on a
 * sibling.
 */
export function unlockState(skillId, minutesBySkill = new Map()) {
  const s = BY_ID.get(skillId);
  if (!s) return { unlocked: false, reasons: ['No such skill.'] };
  if (!s.graded || s.tier === null) return { unlocked: true, reasons: [] };
  const gate = tierGate(s.tier);
  const reasons = [];
  const depth = treeDepth(s.tree, minutesBySkill);
  if (depth < gate.treeDepth) {
    const tree = treeById(s.tree);
    reasons.push(`${tree ? tree.name : s.tree} needs tree depth ${gate.treeDepth}; it is ${depth}.`);
  }
  if (s.requires) {
    const parent = BY_ID.get(s.requires);
    const have = depthFor(Number(minutesBySkill.get(s.requires)) || 0);
    if (have < gate.parentDepth) {
      reasons.push(`${parent ? parent.name : s.requires} needs depth ${gate.parentDepth}; it is ${have}.`);
    }
  }
  return { unlocked: reasons.length === 0, reasons };
}

/**
 * Whether a skill can be the focus of a task. A locked skill may still be
 * worked — Flow cannot refuse to log a drawing — but deliberate practice on
 * it is premature, and Hearth is never practised at all.
 */
export function focusable(skillId, minutesBySkill = new Map()) {
  const s = BY_ID.get(skillId);
  if (!s || !s.graded) return false;
  return unlockState(skillId, minutesBySkill).unlocked;
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
