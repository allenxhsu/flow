// flow/src/board-routing.js — what happens to Planner's derived skills once
// the board exists (SPEC.md › Most tasks belong to no skill).
//
// Before the board, Flow synthesised a skill from whatever Planner called the
// task's folder or workspace: "Work", "Personal", "School & Professional
// Developement", "AMADA WORKSPACE". Those are not skills — they are where a
// file lives — and 83% of a week landing in one called Work is what made the
// whole board necessary.
//
// So once the board is adopted those stop being made. A Planner task either
// routes onto the board — by Planner naming a board skill, or by one of the
// player's rules — or it belongs to no skill at all, which is Toil, and which
// is the honest answer rather than a folder name wearing a skill's clothes.

import { SKILLS, TREES, statId, skillRecordId } from './board.js';
import { routeTask } from './routing.js';

/** Whether the player has adopted the board: every tree is a stat they hold. */
export const adopted = (db) => TREES.every((t) => !!db?.stat?.get?.(statId(t.id)));

/**
 * A starter set for the player's own work, offered at adoption. Ordered:
 * the first match wins, so the specific patterns come before the broad ones.
 */
export const STARTER_RULES = [
  { pattern: '^Release Drawing|^Release ', skill: 'inscription' },
  { pattern: '^Update BOM|^Edit BOM|BOM', skill: 'sundering' },
  { pattern: '^FAT|^QA\\b|Evaluate Sample', skill: 'trial' },
  { pattern: '^Req |^Purchase|RFQ|Quote|^PO |^Order |^Receive|Std Material|Custom Material', skill: 'summoning' },
  { pattern: '^Install|^Build|^Replace|Hook up|Dry run|^Wire|^Assemble|^Deliver', skill: 'quickening' },
  { pattern: '^Email|^Send an|^Respond|^Reply|Emailing', skill: 'scribing' },
  { pattern: '^Talk to|^Discuss|^Consult|^Contact|^Call ', skill: 'parley' },
  { pattern: 'Meeting|kick ?off|^Morning Update|Walk around', skill: 'council' },
  { pattern: '^W\\d|^Wk|Week \\d|Lecture|Problem set|Homework|^HW|Quiz|Assignment|^Final|Reading|SQL|Spectrum', skill: 'lore' },
  { pattern: 'assembly|assy', skill: 'interlock' },
  { pattern: 'Design|Model|Layout|Bracket|Plate|Extrusion|Gantry|Galvo|Detailed', skill: 'shaping' },
];

const BOARD_SKILL_IDS = new Set(SKILLS.map((s) => skillRecordId(s.id)));

/**
 * Route the derived Planner tasks onto the board, and drop the folder-name
 * skills that were only ever holding them. A no-op until the board is
 * adopted, so nothing changes for a player who has not taken it.
 *
 * `tasks` and `skills` are what plannerTasks() derived. Returns the same
 * shape; never mutates what it was given.
 */
export function applyRouting(db, { tasks = [], skills = [] } = {}, { rules = [] } = {}) {
  if (!adopted(db)) return { tasks, skills };
  const routed = tasks.map((t) => {
    // Flow's own tasks are not Planner's, and are never re-skilled.
    if (!t.source) return t;
    // A task already pointing at a board skill is already where it belongs.
    if (BOARD_SKILL_IDS.has(t.skill)) return t;
    const { skill } = routeTask(t, { rules });
    return { ...t, skill: skill ? skillRecordId(skill) : null };
  });
  // Keep only derived skills something still points at — after routing, the
  // folder names point at nothing, so they simply stop existing.
  const used = new Set(routed.map((t) => t.skill).filter(Boolean));
  return { tasks: routed, skills: skills.filter((s) => used.has(s.id)) };
}
