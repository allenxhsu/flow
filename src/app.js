// Flow: the page. Boots the store and sync, renders the current view, and
// routes every click and form submit through two delegated listeners —
// `data-action` on a button, `data-form` on a form — to the view that owns it.

import { portalApp } from '../sync-kit/js/portal.js';
import { play } from './model.js';
import * as store from './sync.js';
import { esc, fmtClock } from './util.js';
import { statusStrip, pixelIcon } from './ds.js';
import * as box from './box.js';
import { VIEWS } from './views/index.js';
const VIEW_KEY = 'flow.view';

const $ = (sel) => document.querySelector(sel);
const ui = { view: 'now' };
try { const v = localStorage.getItem(VIEW_KEY); if (VIEWS.some((x) => x.id === v)) ui.view = v; } catch { /* no storage */ }

const toast = (text, tone = 'info') => box.toast(text, tone);
const confirm = (heading, body, yes = 'OK', kind = 'primary') => box.confirm(heading, body, yes, kind);
const choose = (heading, body, buttons) => box.open({ heading, body, buttons });

function context() {
  const db = store.db();
  const t = Date.now();
  return { db, g: play(db, t), now: t, ui, store, toast, confirm, choose, render, go, esc };
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
  if (!force && typing) { pending = true; return; }
  pending = false;
  const ctx = context();
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

/** The tab row: real buttons with original pixel icons; the current one is aria-current. */
function renderNav() {
  const nav = $('#nav');
  const same = nav.dataset.current === ui.view;
  if (!same || !nav.children.length) {
    nav.innerHTML = VIEWS.map((v) => `
    <button type="button" class="ds-tab" data-go="${v.id}" data-view="${v.id}"${v.id === ui.view ? ' aria-current="page"' : ''}>
      ${pixelIcon(v.id)}<span class="ds-tab-label">${v.label}</span>
    </button>`).join('');
    nav.dataset.current = ui.view;
    nav.querySelector('[aria-current]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
}

function renderHeader(ctx, def) {
  $('#view-title').textContent = def.label;
  $('#strip').innerHTML = statusStrip(ctx.g);
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
  render({ force: true });
}

boot().catch((err) => {
  console.error(err);
  $('#view').innerHTML = `<div class="view"><div class="sc-alert sc-alert--danger"><strong>Flow could not start</strong> ${esc(err.message)}</div></div>`;
});
