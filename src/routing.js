// flow/src/routing.js — which skill a task belongs to, and what is left over
// (SPEC.md › Most tasks belong to no skill, and that is the point). Pure.
//
// A task joins a skill only when it is an instance of that skill's unit of
// output. Everything else is left unclassified — not "miscellaneous":
// unclassified. Forcing every task into a tree would be the worst thing the
// board could do to itself, because filing `Reimbursement` under Summoning
// poisons minutes-per-req with things that are not reqs, and a measure is
// only as good as its denominator.
//
// What is left over is **Toil**: real work that makes the player better at
// nothing. It carries no Depth and no Grade — nobody is trying to master
// expense reports — and exactly one number, its bounce rate, because
// administrative work is where doing it twice hurts most.

import { skillById, SKILLS } from './board.js';

/** The six things a day can produce (SPEC.md › What lands in Flow). */
export const TYPES = {
  skill: 'skill',
  toil: 'toil',
  moment: 'moment',
  rework: 'rework',
  claim: 'claim',
  boss: 'boss',
};

/** Which type a record is. Only `focus` is ever the player's choice; this is not it. */
export function typeOf(rec) {
  if (!rec) return TYPES.toil;
  if (rec.type === 'rework') return TYPES.rework;
  if (rec.type === 'moment' || rec.type === 'visit') return TYPES.moment;
  if (rec.type === 'claim') return TYPES.claim;
  if (rec.type === 'boss') return TYPES.boss;
  return rec.skill ? TYPES.skill : TYPES.toil;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Compile the player's routing rules once, so a bad pattern is found here
 * rather than thrown on every render. A rule names a skill and matches on a
 * project, a title pattern, or both. Rules that name a skill the board does
 * not have, or that carry a pattern the engine cannot read, are dropped.
 */
export function compileRules(rules = []) {
  const out = [];
  for (const r of rules || []) {
    if (!r || !skillById(r.skill)) continue;
    let re = null;
    if (r.pattern) {
      try { re = new RegExp(r.pattern, 'i'); } catch { continue; }
    }
    if (!re && !r.project) continue;
    out.push({ skill: r.skill, project: r.project ? norm(r.project) : null, re });
  }
  return out;
}

/** Planner's own skill name, matched to a board skill by name or id. */
function fromPlanner(task) {
  const raw = task?.plannerSkill ?? task?.plannerSkillName;
  if (!raw) return null;
  const want = norm(raw);
  const hit = SKILLS.find((s) => norm(s.name) === want || norm(s.id) === want);
  return hit ? hit.id : null;
}

/**
 * The skill a task belongs to, or null. Planner's own skill first — it is the
 * most specific thing anyone said about the task — then the player's rules in
 * order, so the order of the list is theirs to set.
 */
export function routeTask(task, { rules = [] } = {}) {
  const skill = fromPlanner(task) ?? matchRules(task, rules);
  return { skill, type: skill ? TYPES.skill : TYPES.toil };
}

function matchRules(task, rules) {
  const project = norm(task?.project);
  const title = String(task?.title ?? '');
  for (const r of rules) {
    if (r.project && r.project !== project) continue;
    if (r.re && !r.re.test(title)) continue;
    return r.skill;
  }
  return null;
}

/** Every task, tagged. Never mutates what it was given. */
export function routeAll(tasks, opts = {}) {
  return (tasks || []).map((t) => ({ ...t, ...routeTask(t, opts) }));
}

/**
 * Toil over a set of completions: the share of minutes that belongs to no
 * skill, its bounce rate, and the weighted figure in which a bounced minute
 * counts twice — because a redo of administrative work teaches nothing, so
 * it is pure waste and should read as such.
 */
export function toilOf(done = [], taskOf = () => null, opts = {}) {
  let total = 0;
  let minutes = 0;
  let weighted = 0;
  let units = 0;
  let bounces = 0;
  for (const d of done) {
    const mins = Number(d?.minutes) || 0;
    total += mins;
    const task = taskOf(d.task);
    if (routeTask(task, opts).skill) continue;
    minutes += mins;
    units += 1;
    if (d.bounced) { bounces += 1; weighted += mins * 2; } else { weighted += mins; }
  }
  return {
    total, minutes, weighted, units, bounces,
    share: total > 0 ? minutes / total : 0,
    bounceRate: units > 0 ? bounces / units : 0,
  };
}
