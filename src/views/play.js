// Play: the game inside Flow, on the real clock (SPEC.md › Play). The upper
// screen is the world — the generic one, or the player's private pack — and
// the lower screen carries the status and the TASKS button. TASKS (or the
// action button at a desk) opens the menu that starts, finishes and adds tasks
// through the same model functions, the same `flow.timer` and the same store
// as the Now screen. Nothing here is game-only. A bookshelf (SPEC.md › The
// bookshelf) opens the player's bookcase: its shelves, the books on each, and
// the reshelve checklist while a plan is active.

import { play as playOf, index, makeMoment, placeOfTask, activeReshelve, reshelveView, markPulled, shelveMove, labelSheet } from '../model.js';
import { shelfPlaces, shelfRows, shelfBooks, bookText, labelSvg } from '../game/shelf.js';
import { esc, readJson, writeJson, validTimer, fmtClock, fmtPts } from '../util.js';
import { worldFor, spotFor } from '../game/world.js';
import { menuTasks, reworkQuestion, startTimer, finishQuestions, finishTask, newTask, typeKey, ESTIMATES, CADENCES, LETTER_ROWS } from '../game/actions.js';
import { gameClock } from '../game/clock.js';
import { SCREEN_HTML, injectGameStyle, loadThree } from '../game/screen.js';

const TIMER_KEY = 'flow.timer';
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
const readTimer = () => validTimer(readJson(ls(), TIMER_KEY));

/** The game keeps its own canvas and loop: a background re-render must not restart it. */
export const stable = true;

const state = (ctx) => (ctx.ui.play ||= { menu: null, sel: 0, draft: {} });
const item = (action, label, attrs = '', sub = '') => `<button type="button" class="play-item" data-action="${action}" ${attrs}>${esc(label)}${sub ? ` <small>${esc(sub)}</small>` : ''}</button>`;
const back = (to = 'main') => item('menu', 'Back', `data-item="${to}"`);

function menuBody(ctx) {
  const S = state(ctx);
  const { db, g } = ctx;
  const timer = readTimer();
  const tt = timer && db.task.get(timer.task);
  const D = S.draft;
  switch (S.menu) {
    case 'main': return `<h3>TASKS</h3>
      ${tt ? `<p>Running: ${esc(tt.title)}${timer.reworkOf ? ' (rework)' : ''}</p>` : ''}
      <div class="play-items">
        ${item('menu', 'Start', 'data-item="start"')}
        ${item('menu', 'Finish', 'data-item="finish"', tt ? tt.title : '')}
        ${item('menu', 'New task', 'data-item="new"')}
        ${timer ? item('menu', 'Cancel timer', 'data-item="cancel"') : ''}
        ${item('close', 'Close')}
      </div>`;
    case 'start':
    case 'finish': {
      const list = menuTasks(g);
      return `<h3>${S.menu === 'start' ? 'START WHICH?' : 'FINISH WHICH?'}</h3>
        <div class="play-items">${list.map((x) => item(S.menu === 'start' ? 'pick-start' : 'pick-finish', x.title, `data-task="${esc(x.task)}"`, x.suggested ? (x.why[0] || 'next') : '')).join('') || '<p>Nothing open. Add a task.</p>'}${back()}</div>`;
    }
    case 'rework': return `<h3>IS THIS REWORK?</h3><p>${esc(D.question.text)}</p><p><small>Rework costs points and XP; a new run earns them.</small></p>
      <div class="play-items">${item('rework-answer', `Rework of ${D.question.day}`, 'data-value="yes"')}${item('rework-answer', 'No, a new run', 'data-value="no"')}${back()}</div>`;
    case 'minutes': return `<h3>HOW MANY MINUTES?</h3><p>${esc(db.task.get(D.task)?.title || '')}</p>
      <div class="play-items">${ESTIMATES.map((m) => item('answer', `${m} min`, `data-value="${m}"`)).join('')}</div>
      <div class="play-row"><input class="play-input" type="number" min="1" step="1" data-field="typed" aria-label="Minutes"> ${item('answer-typed', 'OK')}</div>`;
    case 'value': {
      const t = db.task.get(D.task);
      if (t?.measure === 'quality') return `<h3>HOW GOOD? (%)</h3><div class="play-items">${[100, 90, 75, 50, 25].map((v) => item('answer', `${v}%`, `data-value="${v}"`)).join('')}</div>`;
      return `<h3>HOW MANY ${esc((t?.unit || '').toUpperCase())}?</h3>
        <div class="play-row"><input class="play-input" type="number" min="0" step="any" data-field="typed" aria-label="How many"> ${item('answer-typed', 'OK')}</div>`;
    }
    case 'quality': return `<h3>QUALITY?</h3><div class="play-items">${[100, 90, 75, 50, 25].map((v) => item('answer', `${v}%`, `data-value="${v / 100}"`)).join('')}</div>`;
    case 'new': return `<h3>NEW TASK · NAME IT</h3>
      <span class="play-title" data-title>${esc(D.title || '')}<span class="play-more">_</span></span>
      <div class="play-grid" id="letter-grid" data-cols="9">${LETTER_ROWS.join('').split('').map((ch) => item('key', ch, `data-key="${esc(ch)}"`)).join('')}</div>
      <div class="play-items" style="grid-template-columns:repeat(4,1fr)">${item('key', 'SPACE', 'data-key="SPACE"')}${item('key', 'DEL', 'data-key="DEL"')}${item('title-ok', 'OK')}${back()}</div>`;
    case 'new-estimate': return `<h3>ESTIMATE</h3><p>${esc(D.title)}</p>
      <div class="play-items" style="grid-template-columns:repeat(3,1fr)">${ESTIMATES.map((m) => item('answer', `${m} min`, `data-value="${m}"`)).join('')}</div>
      <div class="play-row"><input class="play-input" type="number" min="1" step="1" data-field="typed" aria-label="Minutes"> ${item('answer-typed', 'OK')}</div>`;
    case 'new-skill': return `<h3>WHICH SKILL?</h3><div class="play-items">${db.skills.map((s) => item('answer', s.name, `data-value="${esc(s.id)}"`, db.stat.get(s.stat)?.name || '')).join('') || '<p>Make a skill on the Skills screen first.</p>'}${back()}</div>`;
    case 'new-cadence': return `<h3>HOW OFTEN?</h3><div class="play-items">${CADENCES.map((c) => item('answer', c, `data-value="${c}"`)).join('')}</div>`;
    case 'new-critical': return `<h3>CRITICAL?</h3><p><small>Critical work pays double for rework.</small></p><div class="play-items">${item('answer', 'No', 'data-value="no"')}${item('answer', 'Yes, critical', 'data-value="yes"')}</div>`;
    case 'cancel': return `<h3>CANCEL THE TIMER?</h3><p>Nothing is logged.</p><div class="play-items">${item('cancel-yes', 'Yes, discard it')}${back()}</div>`;
    default: return shelfBody(ctx);
  }
}

// ─── the bookshelf ──────────────────────────────────────────────────────

const shelfBack = (to) => item('shelf-back', 'Back', `data-to="${to}"`);
const pathOf = (db, id) => {
  const out = []; const seen = new Set();
  for (let p = db.place.get(id); p && !seen.has(p.id); p = db.place.get(p.parent)) { seen.add(p.id); out.unshift(p.name); }
  return out.join(' › ') || 'Unfiled';
};

function shelfBody(ctx) {
  const S = state(ctx);
  const { db } = ctx;
  const D = S.draft;
  const plan = activeReshelve(db);
  const v = plan ? reshelveView(db, plan) : null;
  switch (S.menu) {
    case 'shelf-cases': return `<h3>WHICH BOOKCASE?</h3><div class="play-items">
      ${(D.cases || []).map((id) => db.place.get(id)).filter(Boolean).map((p) => item('shelf-case', p.name, `data-place="${esc(p.id)}"`)).join('')}${item('close', 'Close')}</div>`;
    case 'shelf-rows': {
      const bc = db.place.get(D.bookcase);
      const rows = bc ? shelfRows(db, bc.id) : [];
      return `<h3>${esc((bc?.name || 'BOOKCASE').toUpperCase())}</h3><div class="play-items">
        ${rows.map((r) => item('shelf-row', r.label, `data-place="${esc(r.place.id)}"`, `${r.count}`)).join('') || '<p>Nothing on it yet.</p>'}
        ${v ? item('shelf-reshelve', `RESHELVE ${v.shelved}/${v.total} shelved`, '', plan.name) : ''}
        ${item('shelf-labels', 'Labels', '', 'print one per shelf')}
        ${(D.cases || []).length > 1 ? shelfBack('shelf-cases') : ''}${item('close', 'Close')}</div>`;
    }
    case 'shelf-books': {
      const books = shelfBooks(db, D.row);
      return `<h3>${esc(pathOf(db, D.row).toUpperCase())}</h3><p><small>Left to right · ${books.length}</small></p><div class="play-items">
        ${books.map((b) => item('shelf-book', b.name, `data-item="${esc(b.id)}"`, b.brand || '')).join('') || '<p>Empty.</p>'}${shelfBack('shelf-rows')}</div>`;
    }
    case 'shelf-book': {
      const b = db.item.get(D.book);
      return `<h3>BOOK</h3>${b ? bookText(db, b).map((l, k) => `<p>${k ? esc(l) : `<b>${esc(l)}</b>`}</p>`).join('') : ''}
        <div class="play-items">${shelfBack('shelf-books')}</div>`;
    }
    case 'rs': return v ? `<h3>RESHELVE · ${esc(plan.name.toUpperCase())}</h3><p>${v.pulled}/${v.total} pulled · ${v.shelved}/${v.total} shelved</p>
      <div class="play-items">${item('rs-mode', '1 · Pull', 'data-mode="pull"', 'empty a shelf')}${item('rs-mode', '2 · Shelve', 'data-mode="shelve"', 'put a shelf up')}
      ${item('rs-finish', v.shelved === v.total ? 'Finish — all shelved' : 'Finish early')}${shelfBack('shelf-rows')}</div>` : `<h3>RESHELVE</h3><p>No plan.</p><div class="play-items">${shelfBack('shelf-rows')}</div>`;
    case 'rs-groups': {
      if (!v) return '';
      const groups = D.mode === 'pull' ? v.sources : v.shelves;
      const on = (m) => (D.mode === 'pull' ? m.isPulled : m.isShelved);
      return `<h3>${D.mode === 'pull' ? 'PULL FROM WHICH SHELF?' : 'SHELVE WHICH SHELF?'}</h3><div class="play-items">
        ${groups.map((g) => item('rs-group', g.path.join(' › ') || 'Unfiled', `data-place="${esc(g.place?.id || '')}"`, `${g.moves.filter(on).length}/${g.moves.length}`)).join('')}${shelfBack('rs')}</div>`;
    }
    case 'rs-books': {
      if (!v) return '';
      const groups = D.mode === 'pull' ? v.sources : v.shelves;
      const g = groups.find((x) => (x.place?.id || '') === D.group);
      const on = (m) => (D.mode === 'pull' ? m.isPulled : m.isShelved);
      return `<h3>${esc((g?.path.join(' › ') || '').toUpperCase())}</h3><p><small>${D.mode === 'pull' ? 'Take each one off; it says where it goes.' : 'Put them up left to right. A tick moves the book.'}</small></p><div class="play-items">
        ${(g?.moves || []).map((m) => item('rs-tick', `${on(m) ? '✓' : '·'} ${m.call ? `${m.call} ` : ''}${m.item.name}`, `data-item="${esc(m.item.id)}"`, D.mode === 'pull' ? `→ ${pathOf(db, m.to)}` : `#${m.n}`)).join('')}${shelfBack('rs-groups')}</div>`;
    }
    default: return '';
  }
}

/** Print the labels of the open bookcase, a page per shelf. */
function printLabels(ctx) {
  const { db } = ctx;
  const bc = state(ctx).draft.bookcase;
  const sheets = shelfRows(db, bc).filter((r) => r.count).map((r) => labelSheet(db, r.place.id));
  if (!sheets.length) { say('Nothing on these shelves to label yet.'); return; }
  const w = globalThis.open?.('', '_blank');
  if (!w) { say('Allow pop-ups to print labels.'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Shelf labels</title><style>@page{size:letter;margin:0}body{margin:0}svg{display:block;width:8.5in;height:11in;page-break-after:always}</style>${sheets.map((x) => labelSvg(x)).join('')}`);
  w.document.close();
  w.focus();
  w.print();
}

/** The records as they are now: Play does not re-render, so its menu reads the store itself. */
const fresh = (ctx) => (ctx.store?.allRecords ? { ...ctx, db: index(ctx.store.allRecords()) } : ctx);

function menuHtml(ctx) {
  const S = state(ctx);
  if (!S.menu) return '';
  return `<div class="play-menu play-frame" id="play-menu" role="menu">${menuBody(ctx)}</div>`;
}

function infoHtml(ctx) {
  const timer = readTimer();
  const t = timer && ctx.db.task.get(timer.task);
  const n = ctx.g.next?.next;
  return `${t ? `<div class="play-timer" id="play-running"><span>▶ ${esc(t.title)}${timer.reworkOf ? ' · rework' : ''}</span><b class="num" data-since="${timer.start}">${fmtClock(Date.now() - timer.start)}</b></div>` : ''}
    <div class="play-status"><span class="play-chip">◆ ${fmtPts(ctx.g.balance)}</span><span class="play-chip">today ${fmtPts(ctx.g.today.points, { sign: true })}</span>${n ? `<span class="play-chip">next: ${esc(n.title)}</span>` : ''}<span class="play-chip" data-world>${esc(worldFor(ctx.store?.allRecords?.() || []).name)}</span></div>`;
}

function lowerHtml(ctx) {
  return `<div class="play-lower">
    <div class="play-info" id="play-info">${infoHtml(ctx)}</div>
    <div class="play-pad">
      <div class="play-dpad"><button type="button" data-dir="up" aria-label="Up">▲</button><button type="button" data-dir="left" aria-label="Left">◀</button><button type="button" data-dir="right" aria-label="Right">▶</button><button type="button" data-dir="down" aria-label="Down">▼</button></div>
      <button type="button" class="play-tasks" data-action="tasks">TASKS</button>
      <div class="play-ab"><button type="button" data-btn="b" aria-label="B">B</button><button type="button" data-btn="a" aria-label="A">A</button></div>
    </div>
    <div class="play-help">Arrows walk · A (Space) talks and checks · B (Shift) runs · TASKS or a desk opens the menu</div>
  </div>`;
}

export function render(ctx) {
  state(ctx);
  return `<div class="view play" data-mode="live">
    ${SCREEN_HTML.replace('<div class="play-pop"', `<div class="play-menu-host" id="play-menu-host">${menuHtml(ctx)}</div><div class="play-pop"`)}
    ${lowerHtml(ctx)}
  </div>`;
}

// ─── the menu's steps ───────────────────────────────────────────────────

function refresh(ctx) {
  const host = globalThis.document?.getElementById('play-menu-host');
  if (host) {
    host.innerHTML = menuHtml(fresh(ctx));
    const items = [...host.querySelectorAll('.play-item')];
    const S = state(ctx);
    S.sel = Math.max(0, Math.min(S.sel, items.length - 1));
    items[S.sel]?.classList.add('is-sel');
    host.querySelector('[data-field="typed"]')?.focus();
  }
  const info = globalThis.document?.getElementById('play-info');
  if (info) { const db = index(ctx.store.allRecords()); info.innerHTML = infoHtml({ ...ctx, db, g: playOf(db, Date.now()) }); }
}
const go = (ctx, menu, draft) => { menuCtx = ctx; const S = state(ctx); S.menu = menu; S.sel = 0; if (draft) S.draft = draft; refresh(ctx); };
const close = (ctx) => go(ctx, null, {});
const say = (text) => { game?.say(text); };

/** The next question of Finish, or log it when every answer is in. */
async function finishStep(ctx) {
  const S = state(ctx);
  const D = S.draft;
  const todo = D.questions.find((q) => !(q in D.answers));
  if (todo) { go(ctx, todo); return; }
  const timer = D.timer;
  const r = finishTask(ctx.db, { timer, task: D.task, now: Date.now(), ...D.answers });
  if (r.clearTimer) writeJson(ls(), TIMER_KEY, null);
  await ctx.store.add(r.record);
  close(ctx);
  say(r.text);
  ctx.toast?.(r.text, r.kind === 'rework' ? 'warning' : 'success');
}

function beginFinish(ctx, taskId) {
  const timer = readTimer();
  const t = timer && (!taskId || timer.task === taskId) ? timer : null;
  const task = t ? t.task : taskId;
  const questions = finishQuestions(ctx.db, { timer: t, task });
  go(ctx, null, { task, timer: t, questions, answers: {} });
  return finishStep(ctx);
}

async function doStart(ctx, taskId, reworkOf = null) {
  const timer = startTimer(ctx.db, taskId, { now: Date.now(), running: readTimer(), reworkOf });
  writeJson(ls(), TIMER_KEY, timer);
  close(ctx);
  const t = ctx.db.task.get(taskId);
  placeHero(ctx, timer);
  say(`${t.title}: the timer is running.${reworkOf ? ' (rework)' : ''} Finish it here or on Now.`);
}

function placeHero(ctx, timer) {
  if (!game || !timer) return;
  const t = ctx.db.task.get(timer.task);
  const place = placeOfTask(ctx.db, t);
  game.placeAt(spotFor(game.world, place, ctx.db.place.get(place)?.zone));
  placed = timer.start;
}

/** Walking up to a desk (or anything else the world says) and pressing A. */
export function interact(ev, ctx) {
  if (ev?.kind === 'desk') go(ctx, 'main', {});
  if (ev?.kind === 'shelf') {
    const cases = shelfPlaces(fresh(ctx).db, ev.furniture).map((p) => p.id);
    if (!cases.length) return false;
    if (cases.length === 1) go(ctx, 'shelf-rows', { cases, bookcase: cases[0] });
    else go(ctx, 'shelf-cases', { cases });
    return true;
  }
  return undefined;
}

export const actions = {
  tasks: (el, ctx) => { const S = state(ctx); if (S.menu) close(ctx); else go(ctx, 'main', {}); },
  close: (el, ctx) => close(ctx),
  menu: (el, ctx) => {
    const to = el.dataset.item;
    if (to === 'finish') {
      const timer = readTimer();
      if (timer) return beginFinish(ctx, null);
      return go(ctx, 'finish', {});
    }
    if (to === 'new') return go(ctx, 'new', { title: '' });
    return go(ctx, to, to === 'main' ? {} : state(ctx).draft);
  },
  'pick-start': (el, ctx) => {
    const id = el.dataset.task;
    if (readTimer()) throw new Error('A timer is already running: finish it or cancel it first.');
    const q = reworkQuestion(ctx.db, id, Date.now());
    if (q) return go(ctx, 'rework', { task: id, question: q });
    return doStart(ctx, id);
  },
  'rework-answer': (el, ctx) => { const D = state(ctx).draft; return doStart(ctx, D.task, el.dataset.value === 'yes' ? D.question.done : null); },
  'pick-finish': (el, ctx) => beginFinish(ctx, el.dataset.task),
  answer: (el, ctx) => answer(ctx, el.dataset.value),
  'answer-typed': (el, ctx) => {
    const v = globalThis.document?.querySelector('#play-menu [data-field="typed"]')?.value ?? el.dataset.value;
    if (v === '' || v === undefined || !(Number(v) >= 0)) throw new Error('Type a number first.');
    return answer(ctx, v);
  },
  key: (el, ctx) => {
    const S = state(ctx);
    S.draft.title = typeKey(S.draft.title || '', el.dataset.key);
    const keep = S.sel;
    refresh(ctx);
    S.sel = keep;
  },
  'title-ok': (el, ctx) => {
    const S = state(ctx);
    if (!(S.draft.title || '').trim()) throw new Error('Type a name on the letter grid first.');
    go(ctx, 'new-estimate');
  },
  'cancel-yes': (el, ctx) => { writeJson(ls(), TIMER_KEY, null); close(ctx); say('The timer is discarded. Nothing was logged.'); },
  // The bookshelf.
  'shelf-case': (el, ctx) => go(ctx, 'shelf-rows', { ...state(ctx).draft, bookcase: el.dataset.place }),
  'shelf-row': (el, ctx) => go(ctx, 'shelf-books', { ...state(ctx).draft, row: el.dataset.place }),
  'shelf-book': (el, ctx) => {
    const db = fresh(ctx).db;
    const b = db.item.get(el.dataset.item);
    if (!b) return;
    go(ctx, 'shelf-book', { ...state(ctx).draft, book: b.id });
    say(bookText(db, b).join(' '));
  },
  'shelf-back': (el, ctx) => go(ctx, el.dataset.to, state(ctx).draft),
  'shelf-labels': (el, ctx) => printLabels(fresh(ctx)),
  'shelf-reshelve': (el, ctx) => go(ctx, 'rs', state(ctx).draft),
  'rs-mode': (el, ctx) => go(ctx, 'rs-groups', { ...state(ctx).draft, mode: el.dataset.mode === 'pull' ? 'pull' : 'shelve' }),
  'rs-group': (el, ctx) => go(ctx, 'rs-books', { ...state(ctx).draft, group: el.dataset.place || '' }),
  'rs-tick': async (el, ctx) => {
    const db = fresh(ctx).db;
    const plan = activeReshelve(db);
    if (!plan) return;
    const S = state(ctx);
    const m = reshelveView(db, plan).shelves.flatMap((g) => g.moves).find((x) => x.item.id === el.dataset.item);
    if (!m) return;
    if (S.draft.mode === 'pull') await ctx.store.save(markPulled(plan, m.item.id, !m.isPulled));
    else {
      const r = shelveMove(db, plan, m.item.id, !m.isShelved);
      await ctx.store.save(r.item ? [r.item, r.plan] : [r.plan]);
      if (r.item) say(`${m.item.name} → ${pathOf(db, m.to)} (#${m.n}).`);
    }
    const keep = S.sel;
    refresh(ctx);
    S.sel = keep;
  },
  'rs-finish': async (el, ctx) => {
    const plan = activeReshelve(fresh(ctx).db);
    if (!plan) return;
    await ctx.store.save({ ...plan, done: true });
    go(ctx, 'shelf-rows', state(ctx).draft);
    say(`${plan.name}: reshelving finished.`);
  },
};

async function answer(ctx, v) {
  const S = state(ctx);
  const D = S.draft;
  switch (S.menu) {
    case 'minutes': D.answers.minutes = Number(v); return finishStep(ctx);
    case 'value': D.answers.value = Number(v); return finishStep(ctx);
    case 'quality': D.answers.quality = Number(v); return finishStep(ctx);
    case 'new-estimate': if (!(Number(v) > 0)) throw new Error('An estimate is minutes, more than 0.'); D.estimate = Number(v); return go(ctx, 'new-skill');
    case 'new-skill': D.skill = v; return go(ctx, 'new-cadence');
    case 'new-cadence': D.cadence = v; return go(ctx, 'new-critical');
    case 'new-critical': {
      const rec = newTask(ctx.db, { title: D.title, estimate: D.estimate, skill: D.skill, cadence: D.cadence, critical: v === 'yes', now: Date.now() });
      await ctx.store.save(rec);
      close(ctx);
      say(`New task: ${rec.title} (${rec.estimate} min, ${rec.cadence}${rec.critical ? ', critical' : ''}).`);
      ctx.toast?.(`${rec.title} added.`, 'success');
      return undefined;
    }
    default: return undefined;
  }
}

// ─── the running game ───────────────────────────────────────────────────

let game = null;
let placed = null;
let menuCtx = null;

/** The menu by keyboard: arrows move, A picks, B goes back. */
function menuKey(k) {
  const ctx = menuCtx;
  if (!ctx) return;
  const S = state(ctx);
  const host = globalThis.document.getElementById('play-menu-host');
  const items = [...host.querySelectorAll('.play-item')];
  if (!items.length) return;
  const cols = Number(host.querySelector('[data-cols]')?.dataset.cols || 1);
  const inGrid = items[S.sel]?.closest('[data-cols]');
  const step = { left: -1, right: 1, up: inGrid ? -cols : -1, down: inGrid ? cols : 1 }[k];
  if (step) { S.sel = Math.max(0, Math.min(items.length - 1, S.sel + step)); items.forEach((b, i) => b.classList.toggle('is-sel', i === S.sel)); items[S.sel].scrollIntoView?.({ block: 'nearest' }); return; }
  if (k === 'a') { items[S.sel]?.click(); return; }
  if (k === 'b') { if (S.menu === 'new' && S.draft.title) { S.draft.title = typeKey(S.draft.title, 'DEL'); const keep = S.sel; refresh(ctx); S.sel = keep; host.querySelectorAll('.play-item').forEach((b, i) => b.classList.toggle('is-sel', i === S.sel)); return; } const up = { 'shelf-rows': (S.draft.cases || []).length > 1 ? 'shelf-cases' : null, 'shelf-books': 'shelf-rows', 'shelf-book': 'shelf-books', rs: 'shelf-rows', 'rs-groups': 'rs', 'rs-books': 'rs-groups' };
    if (S.menu in up || S.menu === 'shelf-cases') { if (up[S.menu]) go(ctx, up[S.menu], S.draft); else close(ctx); return; }
    if (S.menu === 'main') close(ctx); else go(ctx, 'main', {}); }
}

export async function mounted(view, ctx) {
  const doc = view.ownerDocument;
  injectGameStyle(doc);
  const root = view.querySelector('.play');
  if (!root) return;
  menuCtx = ctx;
  game?.destroy();
  game = null;
  const THREE = await loadThree(doc);
  if (!root.isConnected) return;
  const { createGame } = await import('../game/engine.js');
  const world = worldFor(ctx.store.allRecords());
  let g = ctx.g; let gAt = 0;
  const current = () => { const now = Date.now(); if (now - gAt > 2000) { g = playOf(index(ctx.store.allRecords()), now); gAt = now; } return g; };
  game = createGame(root, {
    world, mode: 'live', THREE, hero: ctx.db.settings.hero || {}, name: ctx.db.settings.name || 'You',
    status: () => {
      const p = current();
      const c = gameClock('live', { now: Date.now() });
      const timer = readTimer();
      return { stamina: p.energy.rated ? p.energy.stamina : 10, mana: p.energy.rated ? p.energy.mana : 10, points: p.balance, clock: c.clock, dark: c.dark, working: timer ? { task: timer.task, since: timer.start } : null };
    },
    onDesk: () => { menuCtx = ctx; interact({ kind: 'desk' }, ctx); },
    onShelf: (furniture) => { menuCtx = ctx; return interact({ kind: 'shelf', furniture }, ctx); },
    menuOpen: () => !!state(ctx).menu,
    onMenuKey: menuKey,
    onMoment: async ({ who }) => {
      // A lap with people is a moment: the Walk kind, with who came along. Moments earn no points.
      const db = index(ctx.store.allRecords());
      const kind = db.kind.get('kind_walk');
      if (!kind) return null;
      const end = Date.now();
      const rec = makeMoment(db, kind, { start: end - 10 * 60000, end, who });
      await ctx.store.add(rec);
      return `A lap with ${who}. Logged as a moment: ${rec.title}, 10 min. Moments earn no points.`;
    },
  });
  const S = state(ctx);
  if (S.heroAt) game.teleport(S.heroAt.level, S.heroAt.x, S.heroAt.y, S.heroAt.dir);
  const timer = readTimer();
  if (timer && placed !== timer.start) placeHero(ctx, timer);
  const save = setInterval(() => { if (!root.isConnected) { clearInterval(save); return; } S.heroAt = game?.hero; }, 1000);
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-field="typed"]')) { e.preventDefault(); root.querySelector('[data-action="answer-typed"]')?.click(); } });
  if (S.menu) refresh(ctx);
}
