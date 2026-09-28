// The Terminal's own unit tests: its screens render under Node from the same
// state the page builds, the iPhone build bundles the Terminal as its
// index.html, the install script is there, and src/sync.js can only ever
// push flow.op records to Planner's workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { play, index } from '../src/model.js';
import { plannerTasks, projectList } from '../src/planner.js';
import { addTaskOp, plannerUrlFrom } from '../src/planops.js';
import * as screens from '../src/terminal/screens.js';
import * as now from '../src/views/now.js';
import { baseRecords, T } from './helpers.mjs';

const root = new URL('..', import.meta.url).pathname;
const D = '2026-09-28';
const NOW = T(`${D}T12:00:00`);

function state({ timer = null } = {}) {
  const body = {
    id: 'plan_web', name: 'Website relaunch', pinned: true, calendar: { hoursPerDay: 8 },
    tasks: [{ id: 't1', name: 'Write copy', level: 1, duration: 1, work: 2, deadline: '2026-10-01', assignments: [] }], resources: [], timesheets: [],
  };
  const op = { ...addTaskOp({ plan: 'plan_web', name: 'Fix <the> footer', me: 'Ana', now: NOW }), origin: 'dev1', updatedAt: NOW };
  const planRecords = [{ id: 'plan_web', type: 'document', format: 'project-planner', body: JSON.stringify(body), updatedAt: 1 }, op];
  const records = [...baseRecords(), { id: 'e1', type: 'energy', day: D, at: T(`${D}T07:00:00`), stamina: 7, mana: 5 }];
  const d = plannerTasks(planRecords, { me: 'Ana', skills: records.filter((r) => r.type === 'skill'), now: NOW });
  const db = index([...records, ...d.skills, ...d.tasks]);
  return { db, g: play(db, NOW), now: NOW, projects: projectList(db, planRecords, { me: 'Ana', now: NOW }), ui: {}, timer };
}

test('terminal screens: Projects lists each project with its open count, next deadline and week time', () => {
  const html = screens.projects(state());
  assert.match(html, /Website relaunch/);
  assert.match(html, /data-action="open-project"[^>]*data-plan="plan_web"/);
  assert.match(html, /2 open/);
  assert.match(html, /2026-10-01|Oct/);
  assert.match(html, /this week/i);
});

test('terminal screens: a project’s tasks each have Start; a pending one says "sending to Planner"; names are escaped', () => {
  const html = screens.tasks(state(), 'plan_web');
  assert.match(html, /Write copy/);
  assert.match(html, /Fix &lt;the&gt; footer/);
  assert.match(html, /sending to Planner/);
  assert.equal((html.match(/data-action="start"/g) || []).length, 2);
  assert.match(html, /data-action="add-task"/);
});

test('terminal screens: the Add task sheet asks a name, and optionally hours and a deadline', () => {
  const html = screens.addTaskSheet({ id: 'plan_web', name: 'Website relaunch' });
  assert.match(html, /data-form="add-task"/);
  assert.match(html, /name="name"[^>]*required/);
  assert.match(html, /name="hours"/);
  assert.doesNotMatch(html, /name="hours"[^>]*required/);
  assert.match(html, /name="deadline"[^>]*type="date"|type="date"[^>]*name="deadline"/);
});

test('terminal screens: the timer shows the elapsed time, the task and project, Pause, Stop & log and Cancel', () => {
  const s = state({ timer: { task: 'task_pl_plan_web_t1', start: T(`${D}T11:30:00`) } });
  const html = screens.timer(s, s.timer);
  assert.match(html, /data-since="\d+"/);
  assert.match(html, /Write copy/);
  assert.match(html, /Website relaunch/);
  for (const a of ['pause', 'stop', 'cancel-timer']) assert.match(html, new RegExp(`data-action="${a}"`), a);
  assert.match(html, /Stop &amp; log/);
});

test('terminal screens: I’m tired asks Body, Mind or Both and A bit, Very or Wiped out', () => {
  const html = screens.tiredSheet();
  assert.match(html, /data-form="tired"/);
  for (const v of ['body', 'mind', 'both']) assert.match(html, new RegExp(`name="which" value="${v}"`), v);
  for (const v of ['bit', 'very', 'wiped']) assert.match(html, new RegExp(`name="level" value="${v}"`), v);
  assert.match(html, /Wiped out/);
});

test('terminal screens: the strip carries the status and an I’m tired button, nothing else from the game', () => {
  const html = screens.top(state());
  assert.match(html, /ds-strip/);
  assert.match(html, /data-action="tired"/);
  assert.doesNotMatch(html, /data-go="(replay|play|shop|bag)"/);
});

test('Now: an I’m tired button', () => {
  const s = state();
  const html = now.render({ ...s, store: { plannerAsks: () => [] } });
  assert.match(html, /data-action="tired"/);
});

test('planner URL: from the paired Portal origin, or a Flow workspace URL, to Planner’s workspace', () => {
  assert.equal(plannerUrlFrom('https://toolkit.example'), 'https://toolkit.example/w/project');
  assert.equal(plannerUrlFrom('https://toolkit.example/'), 'https://toolkit.example/w/project');
  assert.equal(plannerUrlFrom('https://toolkit.example/w/flow'), 'https://toolkit.example/w/project');
  assert.equal(plannerUrlFrom(''), '');
});

// ─── the iPhone build ───────────────────────────────────────────────────────

test('iOS: the bundled web/index.html is the Terminal; the repo’s index.html stays the full app', () => {
  const out = mkdtempSync(join(tmpdir(), 'flow-ios-web-'));
  try {
    execFileSync('sh', [join(root, 'ios/scripts/copy-web.sh')], {
      env: { ...process.env, SRCROOT: join(root, 'ios'), TARGET_BUILD_DIR: out, UNLOCALIZED_RESOURCES_FOLDER_PATH: 'Flow.app' }, stdio: 'pipe',
    });
    const web = join(out, 'Flow.app/web');
    const html = readFileSync(join(web, 'index.html'), 'utf8');
    assert.match(html, /src\/terminal\.js/);
    assert.doesNotMatch(html, /src\/app\.js/);
    for (const f of ['src/terminal.js', 'src/planops.js', 'src/native.js', 'sync-kit/js/index.js']) assert.ok(existsSync(join(web, f)), f);
    for (const f of ['test', 'cli', 'docs', 'e2e']) assert.ok(!existsSync(join(web, f)), f);
  } finally { rmSync(out, { recursive: true, force: true }); }
  assert.match(readFileSync(join(root, 'index.html'), 'utf8'), /src\/app\.js/);
  assert.match(readFileSync(join(root, 'terminal.html'), 'utf8'), /src\/terminal\.js/);
});

test('iOS: npm run ios:install runs the install script, which parses', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['ios:install'], /ios\/scripts\/install-iphone\.sh/);
  execFileSync('bash', ['-n', join(root, 'ios/scripts/install-iphone.sh')]);
  const sh = readFileSync(join(root, 'ios/scripts/install-iphone.sh'), 'utf8');
  for (const s of ['xcodegen generate', 'devicectl list devices', 'allowProvisioningUpdates', 'devicectl device install app', 'process launch']) assert.ok(sh.includes(s), s);
});

// ─── Writing to Planner: only operations, never a plan ─────────────────────

test('sync: Planner’s workspace is pushed to only through pushOps — never a SyncEngine over the Planner store, never a raw push', () => {
  const src = readFileSync(join(root, 'src/sync.js'), 'utf8');
  assert.match(src, /pushOps\(/);
  assert.match(src, /opsToWrite\(/);
  assert.doesNotMatch(src, /new SyncEngine\(\s*plannerStore/);
  // The only push calls in the file are the Flow engine's (inside sync-kit) and pushOps.
  assert.doesNotMatch(src, /\.push\(\s*\{\s*records/);
});
