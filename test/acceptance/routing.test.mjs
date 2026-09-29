// SPEC.md › What lands in Flow: six types, and › Most tasks belong to no
// skill. A task joins a skill only when it is an instance of that skill's
// unit of output; everything else is Toil, and Toil is the number meant to
// go down.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { routeTask, routeAll, TYPES, typeOf, toilOf, compileRules } from '../../src/routing.js';

const t = (title, extra = {}) => ({ id: `task_${title.replace(/\W+/g, '_')}`, title, ...extra });

describe('routing a task to a skill', () => {
  test("Planner's own skill wins when there is one", () => {
    const task = t('Release Drawing for Base Plate', { plannerSkill: 'Inscription' });
    assert.equal(routeTask(task, { rules: [] }).skill, 'inscription');
  });

  test("a rule on the project routes the whole project's tasks", () => {
    const rules = compileRules([{ project: 'Swagelok Bellows Project', skill: 'shaping' }]);
    assert.equal(routeTask(t('Anything at all', { project: 'Swagelok Bellows Project' }), { rules }).skill, 'shaping');
  });

  test('a rule on the title pattern routes by what the task is', () => {
    const rules = compileRules([{ pattern: '^Release Drawing', skill: 'inscription' }]);
    assert.equal(routeTask(t('Release Drawing for Chiller Assembly'), { rules }).skill, 'inscription');
    assert.equal(routeTask(t('Buy Server Rack'), { rules }).skill, null);
  });

  test('the first matching rule wins, so order is the player\'s to set', () => {
    const rules = compileRules([
      { pattern: '^Release', skill: 'inscription' },
      { project: 'GE SO 278078', skill: 'shaping' },
    ]);
    assert.equal(routeTask(t('Release Kit for SMC Chiller', { project: 'GE SO 278078' }), { rules }).skill, 'inscription');
  });

  test("Planner's skill outranks the player's rules", () => {
    const rules = compileRules([{ pattern: '.', skill: 'shaping' }]);
    assert.equal(routeTask(t('X', { plannerSkill: 'Summoning' }), { rules }).skill, 'summoning');
  });

  test('a rule naming a skill that does not exist is ignored, not thrown', () => {
    const rules = compileRules([{ pattern: '.', skill: 'nonesuch' }]);
    assert.equal(routeTask(t('Anything'), { rules }).skill, null);
  });

  test('a malformed pattern is ignored rather than breaking every route', () => {
    const rules = compileRules([{ pattern: '[unclosed', skill: 'shaping' }, { pattern: 'hose', skill: 'summoning' }]);
    assert.equal(routeTask(t('Receive hose'), { rules }).skill, 'summoning');
  });

  test('matching is case-insensitive, because nobody types consistently', () => {
    const rules = compileRules([{ pattern: 'release drawing', skill: 'inscription' }]);
    assert.equal(routeTask(t('RELEASE DRAWING for X'), { rules }).skill, 'inscription');
  });
});

describe('Toil is what routes nowhere', () => {
  test('a task that is an instance of nothing is Toil, not miscellaneous', () => {
    const r = routeTask(t('Reimbursement'), { rules: [] });
    assert.equal(r.skill, null);
    assert.equal(r.type, TYPES.toil);
  });

  test('a routed task is skill work', () => {
    const rules = compileRules([{ pattern: 'Release Drawing', skill: 'inscription' }]);
    assert.equal(routeTask(t('Release Drawing for X'), { rules }).type, TYPES.skill);
  });

  test("Toil is the share of the week's minutes that belongs to no skill", () => {
    const rules = compileRules([{ pattern: 'Release Drawing', skill: 'inscription' }]);
    const done = [
      { task: 'a', minutes: 60 }, { task: 'b', minutes: 30 }, { task: 'c', minutes: 10 },
    ];
    const tasks = new Map([
      ['a', t('Release Drawing for X')], ['b', t('Reimbursement')], ['c', t('PO Receipt')],
    ]);
    const toil = toilOf(done, (id) => tasks.get(id), { rules });
    assert.equal(toil.minutes, 40);
    assert.equal(toil.total, 100);
    assert.equal(toil.share, 0.4);
  });

  test('a week of nothing has no Toil rather than dividing by zero', () => {
    const toil = toilOf([], () => null, { rules: [] });
    assert.equal(toil.share, 0);
    assert.equal(toil.minutes, 0);
  });

  test('Toil bounces are counted, and a bounced minute counts twice', () => {
    const done = [{ task: 'b', minutes: 30 }, { task: 'b2', minutes: 30, bounced: true }];
    const tasks = new Map([['b', t('Reimbursement')], ['b2', t('Reimbursement again')]]);
    const toil = toilOf(done, (id) => tasks.get(id), { rules: [] });
    assert.equal(toil.bounces, 1);
    assert.equal(toil.bounceRate, 0.5);
    assert.equal(toil.weighted, 90, '30 clean + 30 bounced counted double');
  });
});

describe('the six types', () => {
  test('the six are the ones the spec names', () => {
    assert.deepEqual(Object.keys(TYPES).sort(), ['boss', 'claim', 'moment', 'rework', 'skill', 'toil']);
  });

  test('the world decides rework, not the player', () => {
    assert.equal(typeOf({ type: 'rework' }), TYPES.rework);
    assert.equal(typeOf({ type: 'moment' }), TYPES.moment);
    assert.equal(typeOf({ type: 'claim' }), TYPES.claim);
    assert.equal(typeOf({ type: 'done', skill: 'shaping' }), TYPES.skill);
    assert.equal(typeOf({ type: 'done' }), TYPES.toil);
  });
});

describe('routing the whole list', () => {
  test('routeAll tags every task and counts what landed where', () => {
    const rules = compileRules([
      { pattern: '^Release Drawing', skill: 'inscription' },
      { pattern: '^Req |^Purchase|RFQ', skill: 'summoning' },
    ]);
    const list = [t('Release Drawing for Base Plate'), t('Req a NEMA 23 motor'), t('Reimbursement'), t('PO Receipt')];
    const out = routeAll(list, { rules });
    assert.deepEqual(out.map((x) => x.skill), ['inscription', 'summoning', null, null]);
    assert.equal(out.filter((x) => x.type === TYPES.toil).length, 2);
  });

  test('routing never mutates the tasks it was given', () => {
    const list = [t('Release Drawing for X')];
    const before = JSON.stringify(list);
    routeAll(list, { rules: compileRules([{ pattern: 'Release', skill: 'inscription' }]) });
    assert.equal(JSON.stringify(list), before);
  });
});
