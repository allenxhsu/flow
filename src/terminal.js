// Flow's Terminal (SPEC.md › Terminal: the iPhone app): the page. Projects →
// a project's tasks → the timer, the status strip with I'm tired, and
// Settings for the Portal pairing and Planner. Same store, sync, timer
// (`flow.timer`) and native bridge as the full app (src/app.js); the screens
// are src/terminal/screens.js.
//
// Writes: completions, rework and the tired check-in go into Flow's store
// like everywhere else; tasks added and time logged go to Planner as
// operations (src/planops.js) through store.addOps — never a plan.

import { portalApp } from '../sync-kit/js/portal.js';
import { play } from './model.js';
import * as store from './sync.js';
import { projectList } from './planner.js';
import { addTaskOp, stopTimer, pauseTimer } from './planops.js';
import { esc, fmtClock, readJson, writeJson, elapsedMinutes } from './util.js';
import * as box from './box.js';
import * as screens from './terminal/screens.js';
import { tiredFrom, tiredToast } from './views/tired.js';
import { readTimer, askRework } from './views/now.js';
import { createNative } from './native.js';

const TIMER_KEY = 'flow.timer';
const UI_KEY = 'flow.terminal';
const SEEN_KEY = 'flow.terminal.expired';
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
const $ = (sel) => document.querySelector(sel);

/** Where the player is: 'projects' | 'tasks' (with plan) | 'settings'. The timer, when running, is always on top. */
const ui = { screen: 'projects', plan: null, adding: false, tired: false, log: null };
try { const saved = readJson(ls(), UI_KEY); if (saved?.screen) Object.assign(ui, { screen: saved.screen === 'settings' ? 'projects' : saved.screen, plan: saved.plan || null }); } catch { /* none */ }
const remember = () => writeJson(ls(), UI_KEY, { screen: ui.screen, plan: ui.plan });

const toast = (text, tone = 'info') => box.toast(text, tone);
let waiting = 0;

const native = createNative({
  store,
  onChange: () => render(),
  onOpen: (link) => { void attempt(() => openLink(link)); },
  onRemote: ({ url, token }) => { void attempt(async () => { await store.applySettings({ url, token, enabled: !!url }); await store.pullPlanner(); render({ force: true }); }); },
});
let nativeReady = false;

function context() {
  const db = store.db();
  const now = Date.now();
  const me = store.plannerName(db);
  return {
    db, now, me, ui, store, native, waiting,
    g: play(db, now),
    projects: projectList(db, store.plannerRecords(), { me, now }),
    connected: store.plannerConfigured() || store.plannerRecords().length > 0,
    hosted: native.hosted,
    toast, render, esc,
    choose: (heading, body, buttons) => box.open({ heading, body, buttons }),
    confirm: (heading, body, yes, kind) => box.confirm(heading, body, yes, kind),
  };
}

async function attempt(fn) {
  try { return await fn(); } catch (err) { console.warn(err); toast(err?.message || String(err), 'danger'); return undefined; }
}

function settingsOf(ctx) {
  const s = store.getSettings();
  const ps = store.plannerSettingsNow();
  const st = store.plannerStatus();
  return {
    paired: !!(s.url && s.enabled) || store.inPortal(), url: store.inPortal() ? location.origin : s.url,
    name: ctx.db.settings.name, plannerName: ctx.db.settings.plannerName || '',
    plannerUrl: ps.url, plannerToken: ps.token,
    planner: st.configured
      ? `Planner: ${st.plans} plan${st.plans === 1 ? '' : 's'}${st.lastPullAt ? `, read ${new Date(st.lastPullAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}${st.lastError ? ` — ${st.lastError}` : ''}`
      : 'Planner: not connected.',
  };
}

let pending = false;
/** Re-render, unless someone is typing: a sync must never eat a half-filled form. */
function render({ force = false } = {}) {
  const view = $('#view');
  const active = document.activeElement;
  const typing = active && view.contains(active) && active.matches('input:not([type=range]):not([type=radio]), textarea, select');
  const ctx = context();
  if (nativeReady) { native.timer(ctx.db, readTimer()); native.snapshot(ctx.g); }
  $('#top').innerHTML = screens.top(ctx) + (ui.tired ? `<div class="term-tired-sheet">${screens.tiredSheet()}</div>` : '');
  if (!force && typing) { pending = true; return; }
  pending = false;
  const t = readTimer();
  let html;
  if (ui.screen === 'settings') html = screens.settingsSheet({ ...ctx, settings: settingsOf(ctx) });
  else if (t) html = screens.timer(ctx, t);
  else if (ui.screen === 'tasks' && ui.plan) html = screens.tasks(ctx, ui.plan);
  else html = screens.projects(ctx);
  const scroll = view.scrollTop;
  view.innerHTML = html;
  view.scrollTop = scroll;
  tick();
  document.title = t ? `${fmtClock(Date.now() - t.start)} · Flow` : 'Flow Terminal';
  sayExpired();
}

/** The count of ops not yet sent, shown in the bar; refreshed after writes and syncs. */
function refreshWaiting() {
  void store.opsWaiting().then((n) => { if (n !== waiting) { waiting = n; render(); } }).catch(() => {});
}

/** Tasks Planner will never take (addTask older than 90 days): said once each, then dropped. */
function sayExpired() {
  let seen;
  try { seen = new Set(readJson(ls(), SEEN_KEY) || []); } catch { seen = new Set(); }
  const fresh = store.plannerExpired().filter((op) => !seen.has(op.id));
  if (!fresh.length) return;
  for (const op of fresh) seen.add(op.id);
  writeJson(ls(), SEEN_KEY, [...seen]);
  toast(`${fresh.map((o) => `“${o.task?.name || 'A task'}”`).join(', ')} never reached Planner in 90 days and ${fresh.length === 1 ? 'is' : 'are'} no longer shown. Add ${fresh.length === 1 ? 'it' : 'them'} again if still needed.`, 'warning');
}

function tick() {
  for (const el of document.querySelectorAll('[data-since]')) el.textContent = fmtClock(Date.now() - Number(el.dataset.since));
}

function go(screen, plan = ui.plan) {
  ui.screen = screen;
  ui.plan = plan;
  ui.adding = false;
  remember();
  render({ force: true });
  $('#view').scrollTop = 0;
}

async function start(taskId) {
  if (readTimer()) { toast('A timer is already running: pause or stop it first.', 'warning'); return; }
  const ctx = context();
  const task = ctx.db.task.get(taskId);
  if (!task) { toast('That task is not in Flow any more.', 'warning'); return; }
  const reworkOf = await askRework(ctx, taskId);
  if (reworkOf === 'cancel') return;
  writeJson(ls(), TIMER_KEY, { task: taskId, start: Date.now(), ...(reworkOf ? { reworkOf } : {}) });
  ui.log = null;
  if (task.source?.plan) { ui.plan = task.source.plan; ui.screen = 'tasks'; remember(); }
  render({ force: true });
}

/** The Live Activity's Finish opens Stop & log; the widget's task starts its timer. */
async function openLink(link) {
  const ctx = context();
  const t = ctx.db.task.get(link?.task);
  if (!t) { toast('That task is not in Flow any more.', 'warning'); return; }
  const timer = readTimer();
  if (link.action === 'start') { if (timer?.task !== t.id) await start(t.id); return; }
  if (link.action === 'done' && timer?.task === t.id) {
    ui.screen = ui.screen === 'settings' ? 'projects' : ui.screen;
    ui.log = { minutes: link.minutes ?? elapsedMinutes(timer.start, Date.now()) };
    render({ force: true });
  }
}

const actions = {
  'open-project': (el) => go('tasks', el.dataset.plan),
  back: () => go('projects', ui.screen === 'settings' ? ui.plan : null),
  settings: () => go('settings'),
  'add-task': () => { ui.adding = true; render({ force: true }); $('#add-task-form [name=name]')?.focus(); },
  'add-cancel': () => { ui.adding = false; render({ force: true }); },
  start: (el) => start(el.dataset.task),
  stop: () => {
    const t = readTimer();
    if (!t) return;
    ui.log = { minutes: elapsedMinutes(t.start, Date.now()) };
    render({ force: true });
  },
  'log-cancel': () => { ui.log = null; render({ force: true }); },
  pause: async () => {
    const t = readTimer();
    if (!t) return;
    const ctx = context();
    const out = pauseTimer(ctx.db, t, { now: Date.now(), me: ctx.me });
    if (out.op) await store.addOps(out.op);
    writeJson(ls(), TIMER_KEY, null);
    ui.log = null;
    toast(out.op ? `Paused: ${Math.round(out.op.hours * 60)} min logged to Planner. The task stays open.` : 'Paused. The task stays open.', 'success');
    render({ force: true });
    refreshWaiting();
  },
  'cancel-timer': async (el, ctx) => {
    if (!(await ctx.confirm('Cancel the timer?', 'Nothing is logged, here or in Planner.', 'Discard', 'danger'))) return;
    writeJson(ls(), TIMER_KEY, null);
    ui.log = null;
    render({ force: true });
  },
  tired: () => { ui.tired = !ui.tired; render({ force: true }); },
  'tired-cancel': () => { ui.tired = false; render({ force: true }); },
  pair: () => native.pair(),
  'sign-out': async (el, ctx) => {
    if (!(await ctx.confirm('Sign out?', 'Your work stays on this iPhone; it stops syncing until you sign in again.', 'Sign out', 'danger'))) return;
    native.signOut();
  },
  'planner-pull': async () => {
    await store.pullPlanner();
    const st = store.plannerStatus();
    toast(st.lastError ? `Planner: ${st.lastError}` : `Planner: ${st.plans} plan${st.plans === 1 ? '' : 's'}.`, st.lastError ? 'danger' : 'success');
    render({ force: true });
  },
};

const forms = {
  'add-task': async (d, ctx) => {
    const op = addTaskOp({ plan: d.plan, name: d.name, work: d.hours, deadline: d.deadline, me: ctx.me, now: Date.now() });
    await store.addOps(op);
    ui.adding = false;
    toast(`Added “${op.task.name}” — sending to Planner.`, 'success');
    refreshWaiting();
  },
  log: async (d, ctx) => {
    const t = readTimer();
    if (!t) return;
    const measure = ctx.db.task.get(t.task)?.measure;
    const out = stopTimer(ctx.db, t, {
      now: Date.now(), me: ctx.me, minutes: d.minutes, note: d.note || '',
      quality: d.quality === undefined ? undefined : Number(d.quality) / 100,
      value: measure === 'time' ? undefined : d.value,
    });
    writeJson(ls(), TIMER_KEY, null);
    ui.log = null;
    if (out.done) await store.add(out.done);
    if (out.rework) await store.add(out.rework);
    if (out.op) await store.addOps(out.op);
    if (out.done) toast(`${ctx.db.task.get(t.task)?.title || 'Done'}: +${out.done.price.points} points${out.op ? `, ${Math.round(out.op.hours * 60)} min to Planner` : ''}.`, 'success');
    else toast(`Rework: −${out.rework.penalty} XP, −${out.rework.charged} points.`, 'warning');
    refreshWaiting();
  },
  tired: async (d, ctx) => {
    const rec = tiredFrom(ctx.db, d, Date.now());
    ui.tired = false;
    await store.add(rec);
    toast(tiredToast(rec), 'info');
  },
  settings: async (d, ctx) => {
    const cur = store.getRecord('settings') || { id: 'settings', type: 'settings', name: ctx.db.settings.name || 'Player', mission: ctx.db.settings.mission || '' };
    await store.save({ ...cur, plannerName: (d.plannerName || '').trim() });
    await store.applyPlannerSettings({ url: d.url, token: d.token });
    toast('Saved.', 'success');
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || !$('#screen').contains(el)) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  void attempt(() => fn(el, context(), ev));
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fn = forms[form.dataset.form];
  if (!fn) return;
  const data = Object.fromEntries(new FormData(form));
  void attempt(async () => { await fn(data, context(), ev.submitter); render({ force: true }); });
});

// Live readouts beside sliders: <output data-for="name">.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.name || !t.form) return;
  for (const out of t.form.querySelectorAll(`output[data-for="${t.name}"]`)) out.textContent = t.value + (out.dataset.suffix || '');
});
document.addEventListener('focusout', () => { setTimeout(() => { if (pending) render(); }, 0); });

setInterval(() => {
  tick();
  const t = readTimer();
  if (t) document.title = `${fmtClock(Date.now() - t.start)} · Flow`;
}, 1000);
setInterval(() => render(), 60_000);

async function boot() {
  if (portalApp() === store.APP_ID) {
    document.body.prepend($('#portal-bar-tpl').content.cloneNode(true));
  }
  store.subscribe((reason) => { render(); if (reason === 'planner' || reason === 'remote') refreshWaiting(); });
  await store.initSync();
  nativeReady = native.init();
  render({ force: true });
  refreshWaiting();
}

boot().catch((err) => {
  console.error(err);
  $('#view').innerHTML = `<div class="view"><div class="sc-alert sc-alert--danger"><strong>Flow could not start</strong> ${esc(err.message)}</div></div>`;
});
