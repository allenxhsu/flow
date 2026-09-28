// End-to-end check of the Terminal (terminal.html) in Chromium at iPhone 13
// size, against a mock of Planner's `project` workspace that speaks sync-kit's
// /sync/pull and /sync/push and can "apply" Flow's operations as Planner would.
//
//   ./serve.sh 8201 &
//   SHOTS=/tmp/shots node e2e/terminal-e2e.mjs
//
// Rates the morning on Now (same origin, same store), then in the Terminal:
// projects, a project's tasks, + Add task (pending, pushed as an op, then
// applied — no duplicate), start / pause / stop & log (timesheet ops), I'm
// tired, offline add. Fails on a console error or horizontal overflow.

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';

const require = createRequire(process.env.PLAYWRIGHT_ROOT || '/opt/node22/lib/node_modules/');
const { chromium, devices } = require('playwright');

const APP = process.env.APP_URL || 'http://127.0.0.1:8201/';
// The look to drive (SPEC.md › Two looks): MODE=hud (default) or MODE=game.
const MODE = process.env.MODE === 'game' ? 'game' : 'hud';
const SHOTS = process.env.SHOTS || null;
const MOCK_PORT = Number(process.env.MOCK_PORT || 8093);
const failures = [];
const check = (ok, what) => { if (ok) console.log(`  ok  ${what}`); else { console.log(`  FAIL ${what}`); failures.push(what); } };
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const inDays = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ─── the mock Planner workspace ─────────────────────────────────────────────
let seq = 0;
const rows = new Map(); // id → { record, seq }
const pushed = [];
const put = (r) => rows.set(r.id, { record: r, seq: ++seq });
const planDoc = (body) => ({ id: body.id, type: 'document', format: 'project-planner', name: body.name, body: JSON.stringify(body), updatedAt: Date.now(), origin: 'planner' });
const task = (f) => ({ level: 1, duration: 1, work: null, percent: 0, urgency: 'normal', assignments: [], ...f });
put(planDoc({ id: 'plan_web', name: 'Website relaunch', pinned: true, calendar: { hoursPerDay: 8 }, resources: [], stages: [],
  tasks: [task({ id: 't1', name: 'Write the launch copy', work: 2, deadline: inDays(2) }), task({ id: 't2', name: 'Pick hero photos', work: 1 }), task({ id: 't3', name: 'Shipped already', percent: 100 })],
  timesheets: [{ id: 'ts1', taskId: 't2', date: today, start: 480, hours: 0.5 }] }));
put(planDoc({ id: 'plan_shed', name: 'Garden shed', calendar: { hoursPerDay: 8 }, resources: [], stages: [], tasks: [task({ id: 's1', name: 'Order timber', deadline: inDays(9) })], timesheets: [] }));
put(planDoc({ id: 'plan_old', name: 'Old archive', archived: true, calendar: {}, resources: [], stages: [], tasks: [task({ id: 'o1', name: 'Nope' })], timesheets: [] }));

/** Planner applying Flow's ops to its plans (what project-planner's flowops.js does). */
function applyOps() {
  for (const { record: plan } of [...rows.values()]) {
    if (plan.type !== 'document') continue;
    const body = JSON.parse(plan.body);
    const done = new Set((body.appliedOps || []).map((a) => a.id));
    let changed = false;
    for (const { record: op } of rows.values()) {
      if (op.type !== 'flow.op' || op.plan !== body.id || done.has(op.id)) continue;
      if (op.op === 'addTask') body.tasks.push(task({ id: op.task.id, name: op.task.name, work: op.task.work, deadline: op.task.deadline }));
      if (op.op === 'timesheet') body.timesheets.push({ id: `ts_${op.id}`, taskId: op.task, date: op.date, start: op.start, hours: op.hours, note: op.note });
      body.appliedOps = [...(body.appliedOps || []), { id: op.id, at: Date.now() }];
      changed = true;
    }
    if (changed) put({ ...plan, body: JSON.stringify(body), updatedAt: Date.now() });
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    const body = data ? JSON.parse(data) : {};
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/w/project/sync/pull') {
      const out = [...rows.values()].filter((x) => x.seq > (body.since || 0));
      res.end(JSON.stringify({ records: out.map((x) => x.record), cursor: Math.max(body.since || 0, ...out.map((x) => x.seq)) }));
    } else if (req.url === '/w/project/sync/push') {
      for (const r of body.records || []) { pushed.push(r); put(r); }
      res.end(JSON.stringify({ accepted: (body.records || []).length, cursor: seq }));
    } else { res.writeHead(404); res.end('{}'); }
  });
});
await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r));
const PLANNER = `http://127.0.0.1:${MOCK_PORT}/w/project`;

// ─── the page ───────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
await context.addInitScript((m) => { try { localStorage.setItem('flow.mode', m); } catch { /* none */ } }, MODE);
await context.addInitScript((url) => { if (!localStorage.getItem('flow.planner')) localStorage.setItem('flow.planner', JSON.stringify({ url, token: '' })); }, PLANNER);
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/terminal-${name}.png` });
};
const clearToasts = () => page.evaluate(() => document.querySelectorAll('.ds-toast, .sc-toast-item').forEach((t) => t.remove()));
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('#view').scrollWidth > document.querySelector('#view').clientWidth + 1);
const opsOf = (kind) => pushed.filter((r) => r.type === 'flow.op' && r.op === kind);
const readNow = async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(700); };
/** Move the running timer's start back, as if it had been running that long. */
const rewind = (min) => page.evaluate((m) => { const t = JSON.parse(localStorage.getItem('flow.timer')); t.start -= m * 60000; localStorage.setItem('flow.timer', JSON.stringify(t)); }, min);

console.log('terminal');
// The morning rating lives on Now (the full app): same origin, same store.
await page.goto(`${APP}index.html`);
await page.waitForSelector('#energy-form');
await page.$eval('#energy-form [name=stamina]', (el) => { el.value = '8'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.$eval('#energy-form [name=mana]', (el) => { el.value = '7'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.click('#energy-form [type=submit]');
await page.waitForSelector('#energy-form', { state: 'detached' });
check(await page.isVisible('#tired-button'), 'Now has an I’m tired button');

await page.goto(`${APP}terminal.html`);
await page.waitForSelector('.term-card');
const names = await page.$$eval('.term-card-title', (els) => els.map((e) => e.textContent.trim()));
check(names.length === 2 && names[0].includes('Website relaunch') && names[1].includes('Garden shed'), `projects pinned first then by name, archived left out (${names.join(' | ')})`);
const web = await page.textContent('.term-card[data-plan="plan_web"]');
check(/2 open/.test(web) && /due/.test(web) && /30m this week/.test(web), `project meta: open, deadline, this week (${web.replace(/\s+/g, ' ').trim()})`);
check(!(await overflow()), 'no horizontal overflow (projects)');
const target = await page.$eval('.term-card', (el) => el.getBoundingClientRect().height);
check(target >= 44, `touch target ≥ 44px (${target})`);
await clearToasts();
await shot('projects');

await page.click('.term-card[data-plan="plan_web"]');
await page.waitForSelector('.term-task');
check((await page.$$('.term-task')).length === 2, 'the project’s two open tasks');
await shot('tasks');

// + Add task: pending at once, pushed as an op.
await page.click('[data-action="add-task"]');
await page.fill('#add-task-form [name=name]', 'Fix the footer links');
await page.fill('#add-task-form [name=hours]', '1.5');
await page.fill('#add-task-form [name=deadline]', inDays(3));
await shot('add');
await page.click('#add-task-form [type=submit]');
await page.waitForSelector('.term-task.is-pending');
check((await page.textContent('.term-task.is-pending')).includes('sending to Planner'), 'the new task shows at once, "sending to Planner"');
await page.waitForTimeout(1200);
const add = opsOf('addTask')[0];
check(add && add.task.name === 'Fix the footer links' && add.task.work === 1.5 && /^t_flow_/.test(add.task.id) && add.plan === 'plan_web', 'an addTask op reached Planner’s workspace');
check(pushed.every((r) => r.type === 'flow.op'), 'only flow.op records were pushed');
await clearToasts();
await shot('pending');

// Start the pending task: the timer.
await page.click('.term-task.is-pending [data-action="start"]');
await page.waitForSelector('.term-clock');
await rewind(45);
await page.reload();
await page.waitForSelector('.term-clock');
await page.waitForTimeout(1100);
check(/^00:4[45]:\d\d$|^4[45]:\d\d$/.test((await page.textContent('.term-clock')).trim()), `the clock shows the elapsed time (${(await page.textContent('.term-clock')).trim()})`);
check(!(await overflow()), 'no horizontal overflow (timer)');
await clearToasts();
await shot('timer');

// Pause: a timesheet op only, the task stays open.
await page.click('[data-action="pause"]');
await page.waitForSelector('.term-task');
await page.waitForTimeout(1200);
const sheet = opsOf('timesheet')[0];
check(sheet && sheet.task === add.task.id && sheet.hours === 0.75 && sheet.note === 'Flow timer' && sheet.me !== undefined, `Pause sent a 0.75 h timesheet op (${JSON.stringify(sheet && { task: sheet.task, hours: sheet.hours })})`);
check((await page.$$('.term-task')).length === 3, 'the paused task stays open');

// Planner applies the ops: the pending task becomes the real one, once.
applyOps();
await readNow();
await page.waitForFunction(() => !document.querySelector('.term-task.is-pending'));
const titles = await page.$$eval('.term-task-title', (els) => els.map((e) => e.textContent));
check(titles.filter((t) => t === 'Fix the footer links').length === 1, 'applied by Planner: one task, no duplicate, no longer pending');

// Start → Stop & log.
await page.locator('.term-task', { hasText: 'Write the launch copy' }).locator('[data-action="start"]').click();
await page.waitForSelector('.term-clock');
await rewind(30);
await page.reload();
await page.waitForSelector('.term-clock');
await page.click('[data-action="stop"]');
await page.waitForSelector('#log-form');
check((await page.inputValue('#log-form [name=minutes]')) === '30', 'Stop & log is prefilled with the timer’s 30 minutes');
await clearToasts();
await shot('log');
await page.click('#log-form [type=submit]');
await page.waitForSelector('.term-task');
await page.waitForTimeout(1200);
const stopSheet = opsOf('timesheet').find((r) => r.task === 't1');
check(stopSheet && stopSheet.hours === 0.5, 'Stop sent a 0.5 h timesheet on the Planner task');
check(!(await page.textContent('#view')).includes('Write the launch copy'), 'the finished task leaves the open list');
const gem = await page.textContent('#strip-gem, #hdr-balance');
check(Number(gem.replace(/[^\d-]/g, '')) > 0, `points earned (${gem})`);
await clearToasts();
await shot('after-stop');

// I'm tired.
await page.click('#tired-button');
await page.waitForSelector('#tired-form');
await page.click('#tired-form .choice:has(input[value="mind"])');
await page.click('#tired-form .choice:has(input[value="very"])');
await shot('tired');
await page.click('#tired-form [type=submit]');
await page.waitForSelector('#tired-form', { state: 'detached' });
const mana = await page.$eval('#top [role=meter][aria-label="Mana"]', (el) => el.getAttribute('aria-valuenow'));
check(Number(mana) <= 3, `mana dropped to ≤ 3 (${mana})`);
await clearToasts();
await shot('tired-after');

// Offline: a task added waits, and goes when back online.
await context.setOffline(true);
await page.click('[data-action="add-task"]');
await page.fill('#add-task-form [name=name]', 'Call the printer');
await page.click('#add-task-form [type=submit]');
await page.waitForSelector('.term-task.is-pending');
await page.waitForTimeout(1200);
check(!opsOf('addTask').some((r) => r.task.name === 'Call the printer'), 'offline: nothing sent');
check(await page.isVisible('#ops-waiting'), 'offline: "waiting for Planner" shows');
await clearToasts();
await shot('offline');
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForTimeout(1500);
check(opsOf('addTask').some((r) => r.task.name === 'Call the printer'), 'back online: the op is sent');

// Projects again: the week's time now includes the paused and stopped work.
await page.click('[data-action="back"]');
await page.waitForSelector('.term-card');
await clearToasts();
await shot('projects-after');

check(!errors.length, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
server.close();
if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall ok');
