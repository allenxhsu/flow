// Flow: the page. Boots the store and sync, renders the current view, and
// routes every click and form submit through two delegated listeners —
// `data-action` on a button, `data-form` on a form — to the view that owns it.

import { portalApp } from '../sync-kit/js/portal.js';
import { play, dayOf } from './model.js';
import * as store from './sync.js';
import { esc, fmtClock } from './util.js';
import * as box from './box.js';
import { readMode, applyMode, toggleMode } from './mode.js';
import { shellHtml, navHtml, headerHtml } from './chrome.js';
import { VIEWS } from './views/index.js';
import { createNative } from './native.js';
import { readTimer, openLink } from './views/now.js';
const VIEW_KEY = 'flow.view';

const $ = (sel) => document.querySelector(sel);
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
const ui = { view: 'now' };
try { const v = localStorage.getItem(VIEW_KEY); if (VIEWS.some((x) => x.id === v)) ui.view = v; } catch { /* no storage */ }

// The look (SPEC.md › Two looks): the HUD unless Game mode is on for this device.
let mode = applyMode(document.documentElement, readMode(ls()));
/** Put the look's shell in place (index.html carries the HUD's). */
function mountShell() {
  const shell = $('#shell');
  if (shell?.dataset.shell === mode) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = shellHtml(mode).trim();
  shell.replaceWith(tpl.content);
}
mountShell();
/** Switch looks without a reload: same view, same state, new chrome. */
function switchMode(from) {
  const inSettings = !!from?.closest('#view');
  mode = toggleMode(ls(), document.documentElement);
  mountShell();
  render({ force: true });
  // Keep the keyboard where it was: on the switch just pressed, in its new look.
  if (inSettings) $('#view [data-mode-toggle]')?.focus();
  else $('#header [data-mode-toggle]')?.focus({ preventScroll: true });
}

const toast = (text, tone = 'info') => box.toast(text, tone);
const confirm = (heading, body, yes = 'OK', kind = 'primary') => box.confirm(heading, body, yes, kind);
const choose = (heading, body, buttons) => box.open({ heading, body, buttons });

// The iPhone app (SPEC.md › iOS app): a no-op anywhere without the shell.
const native = createNative({
  store,
  onChange: () => render(),
  onOpen: (link) => { go('now'); void attempt(() => openLink(context(), link)); },
  // Portal pairing hands over the same two values the Sync form holds; empty means signed out.
  onRemote: ({ url, token }) => { void attempt(() => store.applySettings({ url, token, enabled: !!url })); },
});

function context() {
  const db = store.db();
  const t = Date.now();
  return { db, g: play(db, t), now: t, ui, mode, store, native, toast, confirm, choose, render, go, esc };
}

let nativeReady = false;
let healthAskedFor = null;
/** Tell the shell what changed: the timer for the Live Activity, the widget's numbers, a new day's Health. */
function tellNative(ctx) {
  if (!nativeReady) return;
  native.timer(ctx.db, readTimer());
  native.snapshot(ctx.g);
  if (native.platform === 'ios' && !ctx.g.energy.rated && healthAskedFor !== ctx.g.day) {
    healthAskedFor = ctx.g.day;
    native.requestHealth();
  }
}

/** Run a write and say what went wrong in words, never a stack trace. */
async function attempt(fn) {
  try { return await fn(); } catch (err) { console.warn(err); toast(err?.message || String(err), 'danger'); return undefined; }
}

let pending = false;
/** Re-render, unless someone is typing: a sync must never eat a half-filled form. */
function render({ force = false } = {}) {
  const view = $('#view');
  const active = document.activeElement;
  const typing = active && view.contains(active) && active.matches('input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select');
  if (!force && typing) { pending = true; if (nativeReady) tellNative(context()); return; }
  pending = false;
  const ctx = context();
  tellNative(ctx);
  const def = VIEWS.find((v) => v.id === ui.view) || VIEWS[0];
  renderNav();
  renderHeader(ctx, def);
  if (def.mod.stable && !force && view.dataset.view === def.id) return;
  view.dataset.view = def.id;
  const scroll = view.scrollTop;
  view.innerHTML = def.mod.render(ctx);
  view.scrollTop = scroll;
  def.mod.mounted?.(view, ctx);
}

/** The screens: the HUD's sidebar or Game mode's tab row; the current one is aria-current. */
function renderNav() {
  const nav = $('#nav');
  if (nav.dataset.current !== ui.view || !nav.children.length) {
    nav.innerHTML = navHtml(VIEWS, ui.view, mode);
    nav.dataset.current = ui.view;
    nav.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
}

/** The HUD's title, gem points and level, or Game mode's status strip; both carry the switch. */
function renderHeader(ctx, def) {
  const header = $('#header');
  const html = headerHtml(ctx.g, def.label, mode);
  if (header.flowHtml !== html) { header.innerHTML = html; header.flowHtml = html; }
  $('#shell').dataset.view = def.id;
  document.title = `${def.label} · Flow`;
}

function go(view) {
  if (!VIEWS.some((v) => v.id === view)) return;
  ui.view = view;
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* no storage */ }
  render({ force: true });
  $('#view').scrollTop = 0;
}

function actionsOf() {
  const def = VIEWS.find((v) => v.id === ui.view);
  return { ...(def?.mod.actions || {}) };
}

document.addEventListener('click', (ev) => {
  const toggle = ev.target.closest('[data-mode-toggle]');
  if (toggle) { ev.preventDefault(); switchMode(toggle); return; }
  const nav = ev.target.closest('[data-go]');
  if (nav) { ev.preventDefault(); go(nav.dataset.go); return; }
  const el = ev.target.closest('[data-action]');
  if (!el || !$('#view').contains(el)) return;
  const fn = actionsOf()[el.dataset.action];
  if (!fn) return;
  ev.preventDefault();
  void attempt(() => fn(el, context(), ev));
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const def = VIEWS.find((v) => v.id === ui.view);
  const fn = def?.mod.forms?.[form.dataset.form];
  if (!fn) return;
  const data = Object.fromEntries(new FormData(form));
  void attempt(async () => { await fn(data, form, context(), ev.submitter); render({ force: true }); });
});

// Live readouts beside sliders: <output data-for="name">.
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (!t.name || !t.form) return;
  for (const out of t.form.querySelectorAll(`output[data-for="${t.name}"]`)) out.textContent = t.value + (out.dataset.suffix || '');
  const def = VIEWS.find((v) => v.id === ui.view);
  def?.mod.onInput?.(ev, context());
});

document.addEventListener('change', (ev) => {
  const def = VIEWS.find((v) => v.id === ui.view);
  if (def?.mod.onChange) void attempt(() => def.mod.onChange(ev, context()));
});

// A render deferred while typing happens when the field is left.
document.addEventListener('focusout', () => { setTimeout(() => { if (pending) render(); }, 0); });

// Running clocks tick without a re-render.
setInterval(() => {
  for (const el of document.querySelectorAll('[data-since]')) {
    const since = Number(el.dataset.since);
    el.textContent = fmtClock(Date.now() - since);
  }
}, 1000);
// Combo windows and the day roll over by themselves.
setInterval(() => render(), 60_000);

async function boot() {
  // Inside the Portal the bar sits above the shell; anywhere else there is no /auth/me to ask.
  if (portalApp() === store.APP_ID) {
    const tpl = document.getElementById('portal-bar-tpl');
    document.body.prepend(tpl.content.cloneNode(true));
  }
  store.subscribe(() => render());
  await store.initSync();
  // After the store is open: the shell answers with queued visits, pairing and deep links.
  nativeReady = native.init();
  if (nativeReady) healthAskedFor = dayOf(Date.now()); // init asked already
  render({ force: true });
  if (store.persistence() === 'memory') toast('This window cannot save anything: changes last until you close it. Open Flow in a browser tab or the app to keep them.', 'warning');
}

boot().catch((err) => {
  console.error(err);
  $('#view').innerHTML = `<div class="view"><div class="sc-alert sc-alert--danger"><strong>Flow could not start</strong> ${esc(err.message)}</div></div>`;
});
