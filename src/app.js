// Flow: the page. Boots the store and sync, renders the current view, and
// routes every click and form submit through two delegated listeners —
// `data-action` on a button, `data-form` on a form — to the view that owns it.

import { ScToast } from '../ui-kit/js/toast.js';
import { ScDialog } from '../ui-kit/js/dialog.js';
import { portalApp } from '../sync-kit/js/portal.js';
import { play } from './model.js';
import * as store from './sync.js';
import { esc, fmtPts, fmtClock } from './util.js';
import * as now from './views/now.js';
import * as tasks from './views/tasks.js';
import * as skills from './views/skills.js';
import * as shop from './views/shop.js';
import * as review from './views/review.js';
import * as replay from './views/replay.js';
import * as playView from './views/play.js';
import * as settings from './views/settings.js';
import * as rules from './views/rules.js';

const VIEWS = [
  { id: 'now', label: 'Now', glyph: '▶', mod: now },
  { id: 'tasks', label: 'Tasks', glyph: '☰', mod: tasks },
  { id: 'skills', label: 'Skills', glyph: '✦', mod: skills },
  { id: 'shop', label: 'Shop', glyph: '◆', mod: shop },
  { id: 'review', label: 'Review', glyph: '◷', mod: review },
  { id: 'play', label: 'Play', glyph: '◈', mod: playView },
  { id: 'replay', label: 'Replay', glyph: '▦', mod: replay },
  { id: 'settings', label: 'Settings', glyph: '⚙', mod: settings },
  { id: 'rules', label: 'Rules', glyph: '§', mod: rules },
];
const VIEW_KEY = 'flow.view';

const $ = (sel) => document.querySelector(sel);
const ui = { view: 'now' };
try { const v = localStorage.getItem(VIEW_KEY); if (VIEWS.some((x) => x.id === v)) ui.view = v; } catch { /* no storage */ }

const toast = (text, tone = 'info') => ScToast.show(text, { tone, duration: tone === 'danger' ? 6000 : 2500 });
async function confirm(heading, body, yes = 'OK', kind = 'primary') {
  const id = await ScDialog.open({ heading, body, buttons: [{ id: 'cancel', label: 'Cancel', kind: 'ghost' }, { id: 'ok', label: yes, kind }] });
  return id === 'ok';
}
async function choose(heading, body, buttons) { return ScDialog.open({ heading, body, buttons }); }

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

function renderNav() {
  $('#nav').innerHTML = VIEWS.map((v) => `
    <button class="sc-nav-item ${v.id === ui.view ? 'is-active' : ''}" data-go="${v.id}">
      <span class="sc-nav-icon" style="--tint: var(--sc-app)">${v.glyph}</span>
      <span class="sc-nav-label">${v.label}</span>
    </button>`).join('');
}

function renderHeader(ctx, def) {
  $('#view-title').textContent = def.label;
  $('#hdr-balance').textContent = fmtPts(ctx.g.balance);
  $('#hdr-balance').closest('.sc-resource').title = `Points balance${ctx.g.balance < 0 ? ' (in debt)' : ''}`;
  $('#hdr-level').textContent = `LV ${ctx.g.player.level}`;
  $('#hdr-level').title = `Player level · difficulty ${ctx.g.difficulty.name}`;
}

function go(view) {
  if (!VIEWS.some((v) => v.id === view)) return;
  ui.view = view;
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* no storage */ }
  document.body.classList.remove('is-nav-open');
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
  if (ev.target.closest('[data-toggle-nav]')) { document.body.classList.toggle('is-nav-open'); return; }
  if (ev.target.matches('.nav-scrim')) { document.body.classList.remove('is-nav-open'); return; }
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
  $('#view').innerHTML = `<div class="sc-alert sc-alert--danger"><strong>Flow could not start</strong> ${esc(err.message)}</div>`;
});
