// SPEC.md › Most tasks belong to no skill. Once the board is adopted, Planner's
// coarse folder-names stop being synthesised as skills: a Planner task either
// routes onto the board or belongs to no skill at all.
//
// From the real case: the player adopted the board and the Skills screen showed
// Shaping and Sundering next to "Work", "Personal", "School & Professional
// Developement", "AMADA WORKSPACE" and "CU" — Planner's own folder names,
// derived, holding every point of XP.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { adopted, applyRouting, STARTER_RULES } from '../../src/board-routing.js';
import { boardRecords, skillRecordId, SKILLS } from '../../src/board.js';
import { compileRules } from '../../src/routing.js';
import { index, DEFAULT_STATS } from '../../src/model.js';

const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));
/** Planner tasks as plannerTasks() derives them: coarse skill, project name. */
const derived = (id, title, skill, project) => ({
  id: `task_pl_${id}`, type: 'task', title, skill, project, source: { app: 'project', plan: 'p', task: id },
  measure: 'time', cadence: 'once', estimate: 30, stamina: 0, mana: 0,
});
const coarse = (id, name) => ({ id, type: 'skill', name, stat: 'stat_work', derived: true });

const TASKS = [
  derived('a', 'Release Drawing for Base Plate', 'skill_pl_work', 'Swagelok'),
  derived('b', 'Req a NEMA 23 motor', 'skill_pl_work', 'GE'),
  derived('c', 'Reimbursement', 'skill_pl_work', 'Admin'),
  derived('d', 'W3 - Solid Mechanics Lecture', 'skill_pl_school', 'Lectures'),
];
const COARSE = [coarse('skill_pl_work', 'Work'), coarse('skill_pl_school', 'School & Professional Developement')];

describe('the board replaces Planner\'s folder names', () => {
  test('without the board, nothing changes: the coarse skills stand', () => {
    const db = index([...STATS, ...COARSE, ...TASKS]);
    assert.equal(adopted(db), false);
    const out = applyRouting(db, { tasks: TASKS, skills: COARSE });
    assert.deepEqual(out.skills.map((s) => s.name), ['Work', 'School & Professional Developement']);
    assert.equal(out.tasks.find((t) => t.id === 'task_pl_a').skill, 'skill_pl_work');
  });

  test('with the board adopted, the coarse skills are gone', () => {
    const db = index([...boardRecords(), ...COARSE, ...TASKS]);
    assert.equal(adopted(db), true);
    const rules = compileRules([{ pattern: '^Release Drawing', skill: 'inscription' }]);
    const out = applyRouting(db, { tasks: TASKS, skills: COARSE }, { rules });
    assert.ok(!out.skills.some((s) => s.name === 'Work'), 'no folder-name skills survive');
    assert.ok(!out.skills.some((s) => s.name.startsWith('School')));
  });

  test('a routed task points at the board skill', () => {
    const db = index([...boardRecords(), ...COARSE, ...TASKS]);
    const rules = compileRules([{ pattern: '^Release Drawing', skill: 'inscription' }]);
    const out = applyRouting(db, { tasks: TASKS, skills: COARSE }, { rules });
    assert.equal(out.tasks.find((t) => t.id === 'task_pl_a').skill, skillRecordId('inscription'));
  });

  test('a task that routes nowhere has no skill at all — it is Toil', () => {
    const db = index([...boardRecords(), ...COARSE, ...TASKS]);
    const rules = compileRules([{ pattern: '^Release Drawing', skill: 'inscription' }]);
    const out = applyRouting(db, { tasks: TASKS, skills: COARSE }, { rules });
    assert.equal(out.tasks.find((t) => t.id === 'task_pl_c').skill, null, 'Reimbursement is an instance of nothing');
  });

  test("Planner naming a board skill routes it without any rule", () => {
    const db = index([...boardRecords(), ...TASKS]);
    const t = derived('e', 'Anything', 'skill_pl_x', 'P');
    const out = applyRouting(db, { tasks: [{ ...t, plannerSkill: 'Summoning' }], skills: [] }, { rules: [] });
    assert.equal(out.tasks[0].skill, skillRecordId('summoning'));
  });

  test("Flow's own tasks are untouched by any of this", () => {
    const mine = { id: 'task_cycle', type: 'task', title: 'CYCLE', skill: 'sk_body', measure: 'time', cadence: 'daily', estimate: 60 };
    const db = index([...boardRecords(), mine]);
    const out = applyRouting(db, { tasks: [...TASKS, mine], skills: COARSE }, { rules: [] });
    assert.equal(out.tasks.find((t) => t.id === 'task_cycle').skill, 'sk_body');
  });
});

describe('the starter rules', () => {
  test('they compile, and every one names a skill that exists', () => {
    assert.ok(STARTER_RULES.length >= 8);
    for (const r of STARTER_RULES) {
      assert.ok(SKILLS.some((s) => s.id === r.skill), `${r.skill} is on the board`);
      assert.doesNotThrow(() => new RegExp(r.pattern, 'i'));
    }
    assert.equal(compileRules(STARTER_RULES).length, STARTER_RULES.length, 'none is dropped');
  });

  test('they route the work they were written for', () => {
    const rules = compileRules(STARTER_RULES);
    const db = index([...boardRecords(), ...TASKS]);
    const out = applyRouting(db, { tasks: TASKS, skills: COARSE }, { rules });
    const by = Object.fromEntries(out.tasks.map((t) => [t.title, t.skill]));
    assert.equal(by['Release Drawing for Base Plate'], skillRecordId('inscription'));
    assert.equal(by['Req a NEMA 23 motor'], skillRecordId('summoning'));
    assert.equal(by['W3 - Solid Mechanics Lecture'], skillRecordId('lore'));
    assert.equal(by['Reimbursement'], null, 'and they do not invent a home for admin');
  });
});
