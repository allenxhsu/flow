// flow planner import / status, and derived tasks in list and next: the CLI
// over a throwaway FLOW_HOME, in UTC, at a fixed FLOW_NOW.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli', 'flow.mjs');

function home() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-planner-'));
  const run = (args, now = '2026-10-05T12:00:00Z') => spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', env: { ...process.env, FLOW_HOME: dir, FLOW_NOW: now, TZ: 'UTC', NO_COLOR: '1' },
  });
  const ok = (args, now) => { const r = run(args, now); assert.equal(r.status, 0, `flow ${args.join(' ')}: ${r.stderr}`); return r.stdout; };
  return { dir, run, ok, done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Planner's Settings ▸ export: every record of the `project` workspace. */
function exportFile(dir, tasks, extra = {}, name = 'export.json') {
  const body = {
    id: 'plan_web', name: 'Website relaunch', calendar: { hoursPerDay: 8 }, agenda: { assumedLoad: 100 },
    stages: [{ id: 'stage_done', name: 'Completed', done: true }], resources: [{ id: 'r_ana', name: 'Ana' }, { id: 'r_ben', name: 'Ben' }],
    timesheets: [], tasks, ...extra,
  };
  const doc = { format: 'project-planner.store', version: 1, workspace: 'project', records: [
    { id: 'plan_web', type: 'document', format: 'project-planner', name: body.name, body: JSON.stringify(body), updatedAt: Date.now(), origin: 'planner' },
  ] };
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(doc));
  return path;
}
const task = (f) => ({ level: 1, duration: 1, work: null, percent: 0, urgency: 'normal', assignments: [], ...f });

test('cli planner: import shows the player’s tasks in list, status and next — tagged, never stored', (t) => {
  const h = home(); t.after(h.done);
  h.ok(['init', '--name', 'Ana']);
  const file = exportFile(h.dir, [
    task({ id: 't1', name: 'Write copy', work: 2, urgency: 'high' }),
    task({ id: 't2', name: 'Ben’s review', assignments: [{ resourceId: 'r_ben', units: 1 }] }),
  ]);
  const out = h.ok(['planner', 'import', file]);
  assert.match(out, /Imported 1 of 1 Planner records/);
  assert.match(out, /1 task for Ana/);
  assert.match(h.ok(['list', 'tasks']), /Write copy .*Planner · Website relaunch \[task_pl_plan_web_t1\]/);
  assert.doesNotMatch(h.ok(['list', 'tasks']), /Ben’s review/);
  assert.match(h.ok(['next']), /Write copy/);
  assert.match(h.ok(['planner', 'status']), /\[ \] Write copy/);
  const exported = JSON.parse(h.ok(['export']));
  assert.ok(!exported.records.some((r) => r.type === 'task'), 'derived tasks are not written to Flow');
  assert.match(h.run(['task', 'edit', 'Write copy', '--estimate', '5']).stderr, /comes from Planner/);
});

test('cli planner: a task done in Planner is logged once; reopened with no hours asks, and flow rework answers', (t) => {
  const h = home(); t.after(h.done);
  h.ok(['init', '--name', 'Someone', '--planner-name', 'ana']);
  const done = [task({ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: '2026-10-02T15:30', assignments: [{ resourceId: 'r_ana', units: 1 }] })];
  assert.match(h.ok(['planner', 'import', exportFile(h.dir, done)]), /logged from Planner: Write copy \(2026-10-02, 60 min\) \+60 pts/);
  assert.doesNotMatch(h.ok(['planner', 'import', exportFile(h.dir, done, {}, 'again.json')]), /logged from Planner/, 'idempotent');
  assert.match(h.ok(['log', '--days', '7']), /Write copy 60m {2}\+60/);
  const reopened = [{ ...done[0], doneAt: '2026-10-05T09:00' }];
  const out = h.ok(['planner', 'import', exportFile(h.dir, reopened, {}, 'reopened.json')]);
  assert.match(out, /how long did the fix take on Write copy/);
  h.ok(['rework', 'Write copy', '--minutes', '30']);
  assert.doesNotMatch(h.ok(['planner', 'status']), /how long did the fix take/);
});

test('cli planner: a reopen with timesheet hours is logged as rework by itself', (t) => {
  const h = home(); t.after(h.done);
  h.ok(['init', '--name', 'Ana']);
  const first = [task({ id: 't1', name: 'Write copy', work: 1, percent: 100, doneAt: '2026-10-01T10:00' })];
  h.ok(['planner', 'import', exportFile(h.dir, first)]);
  const again = [{ ...first[0], doneAt: '2026-10-05T09:00' }];
  const sheets = { timesheets: [{ id: 'ts1', taskId: 't1', date: '2026-10-03', hours: 0.75 }] };
  assert.match(h.ok(['planner', 'import', exportFile(h.dir, again, sheets, 'b.json')]), /reopened in Planner: Write copy — 45 min of rework/);
});

test('cli planner: import refuses a file that is not a Planner store export', (t) => {
  const h = home(); t.after(h.done);
  const path = join(h.dir, 'x.json');
  writeFileSync(path, JSON.stringify({ format: 'flow.store', records: [] }));
  assert.match(h.run(['planner', 'import', path]).stderr, /not a Planner store export/);
  assert.match(h.run(['planner', 'pull']).stderr, /where is Planner/);
});
