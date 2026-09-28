// Flow and Planner, in sync — the contract between the two apps, checked by
// running Flow's operations through Planner's REAL applier.
//
// Everything else about this boundary is tested on one side of it: Flow's
// tests assert the shape of the ops it writes, Planner's assert what it does
// with ops it is handed. Both can pass while the two disagree, and they did:
// a cycling session logged in Flow and a "Daily Cycling" task in Planner were
// two unrelated records of the same hour, because a task Flow owns never
// reaches a plan at all.
//
// So these tests import Planner's `src/model/flowops.js` from the sibling
// checkout and apply Flow's ops to a real plan built with Planner's own
// `createProject`. If ../../Project is not beside this repo the whole file
// skips with a message — a contract test that cannot see the other side must
// say so rather than quietly pass.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sendToPlannerOp, timesheetOp, addTaskOp, derivedTaskId } from '../../src/planops.js';
import { plannerTasks } from '../../src/planner.js';
import { DEFAULT_STATS } from '../../src/model.js';

const PLANNER = fileURLToPath(new URL('../../../Project/', import.meta.url));
const present = existsSync(`${PLANNER}src/model/flowops.js`);

const ME = 'Allen Xu';
// Local time on purpose: a timesheet line is dated by the player's day.
const STARTED = Date.parse('2026-09-28T20:00:00');
const NOW = STARTED + 70 * 60000;
const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));

/** The Flow task the user actually had: created in Flow, never seen by Planner. */
const cycle = () => ({ id: 'task_cycle', type: 'task', title: 'CYCLE', estimate: 60, deadline: null });

describe('Flow ↔ Planner contract', { skip: present ? false : 'Project (Planner) is not checked out beside Flow' }, () => {
  let model;
  let flowops;
  let json;

  test('the sibling Planner loads', async () => {
    model = await import(`${PLANNER}src/model/model.js`);
    flowops = await import(`${PLANNER}src/model/flowops.js`);
    json = await import(`${PLANNER}src/io/json.js`);
    assert.equal(typeof flowops.applyOps, 'function');
    assert.equal(typeof model.createProject, 'function');
  });

  /** A plan with the player on it, as Planner would have made it. */
  function plan() {
    const p = model.createProject('Health Related Tasks');
    model.addResource(p, { name: ME });
    return p;
  }

  test("a Flow task sent to a plan arrives under Flow's own id, assigned to the player", () => {
    const p = plan();
    const op = sendToPlannerOp(cycle(), { plan: p.id, me: ME, now: NOW });
    const { applied } = flowops.applyOps(p, [op], { now: NOW });

    assert.equal(applied.length, 1);
    const t = model.getTask(p, 'task_cycle');
    assert.ok(t, "Planner must insert the task under Flow's id, or the two can never be the same task");
    assert.equal(t.name, 'CYCLE');
    assert.equal(t.work, 1, '60 minutes in Flow is 1 hour of work in Planner');
    const who = p.resources.find((r) => r.name === ME);
    assert.ok(t.assignments.some((a) => a.resourceId === who.id), 'and put it on the player');
  });

  test('the round trip: it comes back as a Planner task under a derived id', () => {
    const p = plan();
    flowops.applyOps(p, [sendToPlannerOp(cycle(), { plan: p.id, me: ME, now: NOW })], { now: NOW });

    // Exactly what sync carries back: the plan as a document record.
    const record = { id: p.id, type: 'document', format: 'project-planner', name: p.name, body: json.serialize(p), updatedAt: NOW, deletedAt: null };
    const { tasks } = plannerTasks([record], { me: ME, skills: [], stats: STATS, now: NOW });

    const mine = tasks.filter((t) => t.source?.task === 'task_cycle');
    assert.equal(mine.length, 1, 'the plan yields exactly one task for it');
    assert.equal(mine[0].source.app, 'project', 'Planner-sourced, so the timer now writes timesheets');
    assert.equal(mine[0].source.plan, p.id);
    assert.equal(mine[0].title, 'CYCLE');

    // The part that surprised me, and the reason this file exists: a derived
    // task is keyed `task_pl_<plan>_<task>`, never the plain id the op carried.
    // So sending a Flow task to Planner does NOT merge it with the Flow one —
    // the original keeps its runs and has to be archived by hand.
    assert.equal(mine[0].id, derivedTaskId(p.id, 'task_cycle'));
    assert.notEqual(mine[0].id, 'task_cycle', 'so the Flow-native task is not replaced');
    assert.equal(tasks.filter((t) => t.id === 'task_cycle').length, 0);
  });

  test('a timer stop lands as a timesheet line on the plan', () => {
    const p = plan();
    flowops.applyOps(p, [sendToPlannerOp(cycle(), { plan: p.id, me: ME, now: NOW })], { now: NOW });

    // `start` is when the timer started, in ms — Planner derives the day and
    // the minute-into-the-day from it.
    const sheet = timesheetOp({ plan: p.id, task: 'task_cycle', start: STARTED, minutes: 70, me: ME });
    flowops.applyOps(p, [sheet], { now: NOW });

    const lines = (p.timesheets || []).filter((x) => x.taskId === 'task_cycle');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].hours, Math.round((70 / 60) * 100) / 100, '1h 10m, to the hundredth');
    assert.equal(lines[0].date, '2026-09-28', 'dated by the day the work started');
    assert.equal(lines[0].start, 20 * 60, '8 PM, as minutes into that day');
  });

  test('applying the same operations twice changes nothing', () => {
    const p = plan();
    const ops = [
      sendToPlannerOp(cycle(), { plan: p.id, me: ME, now: NOW }),
      timesheetOp({ plan: p.id, task: 'task_cycle', start: STARTED, minutes: 70, me: ME }),
    ];
    flowops.applyOps(p, ops, { now: NOW });
    const after = { tasks: p.tasks.length, sheets: (p.timesheets || []).length };
    flowops.applyOps(p, ops, { now: NOW });

    assert.equal(p.tasks.length, after.tasks, 'a re-sync must not add the task again');
    assert.equal((p.timesheets || []).length, after.sheets, 'nor the hours');
    assert.equal(flowops.pendingOps(ops.map((o) => ({ ...o, deletedAt: null })), p, { now: NOW }).length, 0, 'and nothing is still pending');
  });

  test('a task already from Planner is refused rather than duplicated', () => {
    const fromPlanner = { ...cycle(), source: { app: 'project', plan: 'plan_x', task: 'task_cycle' } };
    assert.throws(() => sendToPlannerOp(fromPlanner, { plan: 'plan_x', me: ME, now: NOW }), /already comes from Planner/);
  });

  test("Planner ignores an op for a plan that is not it", () => {
    const p = plan();
    const op = addTaskOp({ plan: 'plan_somewhere_else', name: 'Not ours', me: ME, now: NOW });
    const { applied } = flowops.applyOps(p, [op], { now: NOW });
    assert.equal(applied.length, 0);
    assert.equal(p.tasks.length, 0);
  });
});
