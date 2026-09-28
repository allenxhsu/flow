// Now: the morning rating, the HUD, what to do next, the timer, moments and
// today's list. The one screen the player lives on.

import { index, makeDone, makeEnergy, makeRework, makeMoment, reworkCandidate, suggestRating, ENERGY_MAX } from '../model.js';
import { plannerRework } from '../planner.js';
import { esc, fmtMin, fmtPts, readJson, writeJson, validTimer, elapsedMinutes, batchEnds, fmtClock } from '../util.js';
import { plannerTag } from './tasks.js';

const TIMER_KEY = 'flow.timer';
const MOMENT_KEY = 'flow.moment';
const ls = () => { try { return globalThis.localStorage; } catch { return null; } };
export const readTimer = () => validTimer(readJson(ls(), TIMER_KEY));
const readMoment = () => { const m = readJson(ls(), MOMENT_KEY); return m && typeof m.kind === 'string' && Number.isFinite(m.start) ? m : null; };

const BONUS_LABEL = { flow: 'flow', pb: 'personal best', underdog: 'underdog', combo: 'combo', batch: 'batch' };
export function bonusPills(price) {
  const b = price?.bonuses || {};
  return Object.entries(b).filter(([, v]) => v > 0)
    .map(([k, v]) => `<span class="sc-pill" style="--tint: var(--sc-app)">${BONUS_LABEL[k] || k} +${Math.round(v * 100)}%</span>`).join('');
}
const meter = (value, max, cls = '') => `<div class="sc-meter ${cls}" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value ?? 0}"><span style="--value: ${Math.max(0, Math.min(100, ((value ?? 0) / max) * 100))}%"></span></div>`;
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** Today at HH:MM, never in the future; anything unreadable is now. */
function endFrom(value, now = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!m) return now;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const t = d.getTime();
  return t > now || hhmm(now) === value ? now : t;
}
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Apple Health's suggestion for today's rating (the iPhone app only), or null. */
function healthSuggestion(ctx) {
  const h = ctx.native?.state?.health;
  if (!h || h.day !== ctx.g.day) return null;
  const value = suggestRating(h);
  return value == null ? null : { value, ...h };
}

function energyPrompt(ctx) {
  const hint = healthSuggestion(ctx);
  const start = hint ? hint.value : 7;
  const slider = (name, label) => `
    <label class="sc-field"><span>${label} <output class="num" data-for="${name}">${start}</output>/10</span>
      <input type="range" name="${name}" min="0" max="${ENERGY_MAX}" step="0.5" value="${start}" aria-label="${label}"></label>`;
  const why = hint && [`${Math.round(hint.sleepHours * 10) / 10} h sleep`, Number.isFinite(hint.steps) ? `${Math.round(hint.steps).toLocaleString('en-US')} steps yesterday` : ''].filter(Boolean).join(', ');
  return `
  <form class="sc-panel sc-panel--lit pad stack" data-form="energy" id="energy-form">
    <div class="row-between"><h2>Good morning</h2><span class="sc-faint small">How much is in the tank today?</span></div>
    ${hint ? `<div class="small sc-muted" id="health-suggestion">Apple Health suggests <b class="num">${hint.value}</b> (${esc(why)}). Your own rating is what counts.</div>` : ''}
    <div class="form-grid">
      ${slider('stamina', 'Stamina · body')}
      ${slider('mana', 'Mana · mind')}
      <button class="sc-button sc-button--primary" type="submit">Rate today</button>
    </div>
  </form>`;
}

function hud(g) {
  const e = g.energy;
  const p = g.player;
  return `
  <section class="hud" aria-label="Status">
    <div class="hud-cell"><div class="row-between"><span class="sc-label">Stamina</span><span class="num">${e.rated ? e.stamina : '–'}/10</span></div>${meter(e.stamina, 10, 'meter-stamina')}</div>
    <div class="hud-cell"><div class="row-between"><span class="sc-label">Mana</span><span class="num">${e.rated ? e.mana : '–'}/10</span></div>${meter(e.mana, 10, 'meter-mana')}</div>
    <div class="hud-cell"><div class="row-between"><span class="sc-label">Points</span><span class="big num" id="hud-balance">${fmtPts(g.balance)}</span></div><span class="small sc-muted">today ${fmtPts(g.today.points, { sign: true })} · ${g.today.done} done · ${fmtMin(g.today.minutes)}</span></div>
    <div class="hud-cell"><div class="row-between"><span class="row"><span class="sc-label">Level</span><span class="sc-badge tier-badge" id="hud-tier" title="Difficulty: ${esc(g.difficulty.name)}">${esc(g.difficulty.name)}</span></span><span class="big num" id="hud-level">${p.level}</span></div>${meter(p.into, p.span, 'meter-app')}<span class="small sc-faint num">${fmtPts(p.toNext)} XP to ${p.level + 1}</span></div>
  </section>`;
}

function banners(g) {
  const out = [];
  if (g.energy.rated && g.energy.empty.length) out.push(`<div class="sc-alert sc-alert--warning"><strong>Running on empty</strong> ${g.energy.empty.join(' and ')} at zero — only rest, free and due-soon tasks are offered. No penalty.</div>`);
  if (g.batch) out.push(`<div class="sc-alert sc-alert--success" id="batch-banner"><strong>Batch ×${g.batch.index + 1}</strong> ${esc(g.batch.name)} — next one within ${g.batch.minutesLeft} min keeps the batch (+15% each).</div>`);
  else if (g.combo.index > 0 && g.combo.minutesLeft > 0) out.push(`<div class="sc-alert sc-alert--success" id="combo-banner"><strong>Combo ×${g.combo.index + 1}</strong> start the next task within ${g.combo.minutesLeft} min to chain it.</div>`);
  else if (g.combo.minutesLeft > 0 && g.today.done) out.push(`<div class="sc-alert" id="combo-banner"><strong>Combo window</strong> start another task within ${g.combo.minutesLeft} min to start a combo.</div>`);
  return out.join('');
}

function timerCard(ctx, timer) {
  const t = ctx.db.task.get(timer.task);
  const of = timer.reworkOf && ctx.db.done.find((d) => d.id === timer.reworkOf);
  return `
  <section class="sc-panel sc-panel--lit pad stack" id="timer-card">
    <div class="row-between"><span class="sc-label">${of ? 'Rework running' : 'Timer running'}</span><span class="timer" data-since="${timer.start}">00:00</span></div>
    <div class="item-title">${esc(t?.title || 'A task')}${of ? ` <span class="sc-pill" style="--tint: var(--sc-warning)">rework of ${esc(of.day)}</span>` : ''}</div>
    <div class="row"><button class="sc-button sc-button--primary" data-action="stop">Stop &amp; log</button><button class="sc-button sc-button--ghost" data-action="cancel-timer">Discard</button></div>
  </section>`;
}

function logForm(ctx) {
  const L = ctx.ui.log;
  const t = ctx.db.task.get(L.task);
  if (!t) return '';
  if (L.reworkOf) {
    const d = ctx.db.done.find((x) => x.id === L.reworkOf);
    return reworkForm(ctx, d, L.minutes, true);
  }
  const unit = t.unit ? esc(t.unit) : 'count';
  return `
  <form class="sc-panel pad stack" data-form="done" id="log-form">
    <div class="row-between"><h2>Log done</h2><span class="item-title">${esc(t.title)}</span></div>
    <input type="hidden" name="task" value="${esc(t.id)}">
    <div class="form-grid">
      <label class="sc-field"><span>Minutes</span><input class="sc-input" type="number" name="minutes" min="1" step="1" required value="${L.minutes}"></label>
      ${t.measure === 'count' ? `<label class="sc-field"><span>How many (${unit})</span><input class="sc-input" type="number" name="value" min="0" step="any" required value="${L.value ?? ''}"></label>` : ''}
      ${t.measure === 'quality'
    ? `<label class="sc-field"><span>Quality <output class="num" data-for="value" data-suffix="%">100%</output></span><input type="range" name="value" min="0" max="100" step="5" value="100"></label>`
    : `<label class="sc-field"><span>Quality <output class="num" data-for="quality" data-suffix="%">100%</output></span><input type="range" name="quality" min="0" max="100" step="5" value="100"></label>`}
      ${L.fromTimer ? '' : `<label class="sc-field"><span>Finished at</span><input class="sc-input" type="time" name="endAt" value="${hhmm(Date.now())}"></label>`}
      <label class="sc-field wide"><span>Note</span><input class="sc-input" name="note" placeholder="optional"></label>
    </div>
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Log it</button><button class="sc-button sc-button--ghost" type="button" data-action="log-cancel">Cancel</button></div>
  </form>`;
}

function reworkForm(ctx, d, minutes = 15, fromTimer = false) {
  if (!d) return '';
  const t = ctx.db.task.get(d.task);
  return `
  <form class="sc-panel pad stack" data-form="rework" id="rework-form">
    <div class="row-between"><h2>Log rework</h2><span class="item-title">${esc(t?.title || '')} · ${esc(d.day)}</span></div>
    <p class="small sc-muted" style="margin:0">Penalty = fix minutes × ${d.price?.points || 0} pts ÷ ${d.minutes} min × ${d.critical ? '2 (critical)' : '1.5 / 1.75 / 2 for the 1st / 2nd / 3rd+'}. Taken off XP and the balance; below zero costs double.</p>
    <input type="hidden" name="done" value="${esc(d.id)}"><input type="hidden" name="fromTimer" value="${fromTimer ? 1 : ''}">
    <div class="form-grid">
      <label class="sc-field"><span>Fix minutes</span><input class="sc-input" type="number" name="minutes" min="1" step="1" required value="${minutes}"></label>
      <label class="sc-field"><span>Note</span><input class="sc-input" name="note" placeholder="what went wrong"></label>
    </div>
    <div class="row"><button class="sc-button sc-button--danger" type="submit">Log rework</button><button class="sc-button sc-button--ghost" type="button" data-action="rework-cancel">Cancel</button></div>
  </form>`;
}

function batchForm(ctx) {
  const B = ctx.ui.batch;
  const list = B.tasks.map((id) => ctx.db.task.get(id)).filter(Boolean);
  return `
  <form class="sc-panel pad stack" data-form="batch" id="batch-form">
    <div class="row-between"><h2>Batch: ${list.length} × ${esc(B.name)}</h2><span class="small sc-faint">logged end to end, finishing now</span></div>
    ${list.map((t, i) => `
      <div class="form-grid">
        <label class="check-field wide"><input class="sc-check" type="checkbox" name="on_${i}" checked> <span class="item-title">${esc(t.title)}</span></label>
        <input type="hidden" name="task_${i}" value="${esc(t.id)}">
        <label class="sc-field"><span>Minutes</span><input class="sc-input" type="number" name="minutes_${i}" min="1" step="1" required value="${t.estimate}"></label>
        ${t.measure !== 'time' ? `<label class="sc-field"><span>${t.measure === 'quality' ? 'Quality %' : `How many (${esc(t.unit || 'count')})`}</span><input class="sc-input" type="number" name="value_${i}" min="0" ${t.measure === 'quality' ? 'max="100"' : ''} step="any" required value="${t.measure === 'quality' ? 100 : 1}"></label>` : ''}
      </div>`).join('')}
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Log batch</button><button class="sc-button sc-button--ghost" type="button" data-action="batch-cancel">Cancel</button></div>
  </form>`;
}

function suggestion(ctx, s, primary) {
  const t = ctx.db.task.get(s.task);
  const skill = ctx.db.skill.get(t?.skill);
  const isBatch = s.batch && s.batch.length > 1;
  const cost = [s.cost.stamina ? `${Math.round(s.cost.stamina * 10) / 10} stamina` : '', s.cost.mana ? `${Math.round(s.cost.mana * 10) / 10} mana` : ''].filter(Boolean).join(' · ') || 'free';
  return `
  <div class="item ${primary ? 'next-card' : ''}" data-task="${esc(s.task)}">
    <div class="item-head"><span class="item-title">${isBatch ? `Batch: ${s.batch.length} × ${esc(t.batch)}` : esc(s.title)}${t ? ` ${plannerTag(t)}` : ''}</span><span class="small sc-faint">${esc(skill?.name || '')} · ~${fmtMin(t?.estimate)} · ${cost}</span></div>
    ${isBatch ? `<div class="small sc-muted">${s.batch.map((id) => esc(ctx.db.task.get(id)?.title)).join(' · ')}</div>` : ''}
    ${s.why.length ? `<div class="pills">${s.why.map((w) => `<span class="sc-pill" style="--tint: var(--sc-accent-2)">${esc(w)}</span>`).join('')}</div>` : ''}
    <div class="row">
      ${isBatch ? `<button class="sc-button ${primary ? 'sc-button--primary' : ''} sc-button--sm" data-action="batch" data-task="${esc(s.task)}">Log batch</button>` : ''}
      <button class="sc-button ${primary && !isBatch ? 'sc-button--primary' : ''} sc-button--sm" data-action="start" data-task="${esc(s.task)}">Start timer</button>
      <button class="sc-button sc-button--ghost sc-button--sm" data-action="log" data-task="${esc(s.task)}">Log done</button>
    </div>
  </div>`;
}

/** Tasks reopened in Planner with no hours logged there: how long did the fix take? */
export function plannerAsksSection(ctx) {
  const asks = ctx.store?.plannerAsks?.(ctx.now) || [];
  if (!asks.length) return '';
  return `
  <section class="stack" id="planner-asks">
    ${asks.map((a) => {
    const d = ctx.db.done.find((x) => x.id === a.done);
    return `
    <form class="sc-panel pad stack" data-form="planner-fix" data-ask="${esc(a.id)}">
      <div class="row-between"><h2>Reopened in Planner</h2><span class="sc-pill planner-tag" data-source="project">Planner · ${esc(a.project || '')}</span></div>
      <p style="margin:0">Reopened in Planner: how long did the fix take? <b>${esc(a.title)}</b>${d ? ` <span class="sc-muted">(done ${esc(d.day)})</span>` : ''}</p>
      <input type="hidden" name="ask" value="${esc(a.id)}">
      <div class="form-grid">
        <label class="sc-field"><span>Fix minutes</span><input class="sc-input" type="number" name="minutes" min="1" step="1" required></label>
        <button class="sc-button sc-button--danger" type="submit">Log rework</button>
      </div>
    </form>`;
  }).join('')}
  </section>`;
}

function nextSection(ctx) {
  const { g, db } = ctx;
  if (!db.skills.length || !db.tasks.length) {
    return `<section class="sc-panel pad stack"><h2>Start here</h2>
      <p class="sc-muted" style="margin:0">${db.skills.length ? 'Now add a task under one of your skills.' : 'Make a skill under one of your stats, then add a task to it.'}</p>
      <div class="row"><button class="sc-button sc-button--primary" data-go="${db.skills.length ? 'tasks' : 'skills'}">${db.skills.length ? 'Add a task' : 'Add a skill'}</button></div></section>`;
  }
  const n = g.next;
  // The picker lists every member of a released batch; one card per batch is enough.
  const seen = new Set();
  const once = (x) => { if (!x) return false; const key = x.batch && x.batch.length > 1 ? `batch:${db.task.get(x.task)?.batch}` : x.task; if (seen.has(key)) return false; seen.add(key); return true; };
  const first = once(n.next) ? n.next : null;
  const alternatives = n.alternatives.filter(once);
  const open = g.tasks.filter((t) => !t.archived && !t.doneNow).sort((a, b) => a.title.localeCompare(b.title));
  return `
  <section class="stack" id="next">
    <div class="row-between"><h2>Next</h2>${n.exhausted ? '<span class="sc-pill" style="--tint: var(--sc-warning)">rest first</span>' : ''}</div>
    ${first ? suggestion(ctx, first, true) : '<div class="muted-box">Nothing waiting — everything open is done for now.</div>'}
    ${alternatives.length ? `<div class="sc-label">Or</div><div class="list">${alternatives.map((s) => suggestion(ctx, s, false)).join('')}</div>` : ''}
    ${open.length ? `<div class="form-grid" id="any-task">
      <label class="sc-field wide"><span>Any task</span><select class="sc-select" name="any">${open.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select></label>
      <button class="sc-button sc-button--sm" data-action="start-any">Start timer</button>
      <button class="sc-button sc-button--ghost sc-button--sm" data-action="log-any">Log done</button></div>` : ''}
    ${n.queued.length ? `<div class="sc-label">Batches waiting</div><div class="list">${n.queued.map((q) => `<div class="small sc-muted">▸ ${esc(q.batch)}: ${q.waiting} waiting — offered together at ${q.need}, or when one is due soon</div>`).join('')}</div>` : ''}
  </section>`;
}

function momentsSection(ctx) {
  const running = readMoment();
  const kinds = ctx.g.kinds;
  if (running) {
    const k = ctx.db.kind.get(running.kind);
    return `
    <form class="sc-panel sc-panel--lit pad stack" data-form="moment-stop" id="moment-running">
      <div class="row-between"><span class="sc-label">Moment</span><span class="timer" data-since="${running.start}">00:00</span></div>
      <div class="item-title">${esc(k?.icon || '')} ${esc(k?.title || 'Moment')}</div>
      <div class="form-grid"><label class="sc-field"><span>With (optional)</span><input class="sc-input" name="who" value="${esc(running.who || '')}" placeholder="who"></label>
        <button class="sc-button sc-button--primary" type="submit">Stop</button>
        <button class="sc-button sc-button--ghost" type="button" data-action="moment-cancel">Discard</button></div>
    </form>`;
  }
  return `
  <section class="stack" id="moments">
    <div class="row-between"><h2>Moments</h2><span class="small sc-faint">life that is not a task: energy, no points</span></div>
    <div class="kinds">${kinds.map((k) => `<button class="sc-button sc-button--sm" data-action="moment-start" data-kind="${esc(k.id)}" title="${esc(k.title)}">${esc(k.icon || '')} ${esc(k.title)}</button>`).join('')}</div>
  </section>`;
}

function todaySection(ctx) {
  const { g, db } = ctx;
  const done = g.history.filter((d) => d.day === g.day);
  const moments = g.moments;
  const items = [
    ...done.map((d) => ({ at: d.end, html: `
      <div class="item" data-done="${esc(d.id)}">
        <div class="item-head"><span class="item-title">${esc(d.title)}</span><span class="num">${fmtPts(d.price?.points, { sign: true })}</span></div>
        <div class="row small sc-muted"><span class="num">${time(d.start)}–${time(d.end)}</span><span>${fmtMin(d.minutes)}</span>${d.measure !== 'time' ? `<span>${d.measure === 'quality' ? `${d.value}%` : `${d.value} ${esc(db.task.get(d.task)?.unit || '')}`}</span>` : ''}${d.quality < 1 && d.measure !== 'quality' ? `<span>quality ${Math.round(d.quality * 100)}%</span>` : ''}${d.rework.length ? `<span class="sc-pill" style="--tint: var(--sc-danger)">rework ×${d.rework.length} −${d.rework.reduce((n, r) => n + r.charged, 0)}</span>` : ''}</div>
        <div class="row-between"><div class="pills">${bonusPills(d.price)}</div><button class="sc-button sc-button--ghost sc-button--sm" data-action="rework" data-done="${esc(d.id)}">Rework</button></div>
        ${ctx.ui.reworkFor === d.id ? reworkForm(ctx, db.done.find((x) => x.id === d.id)) : ''}
      </div>` })),
    ...moments.map((m) => ({ at: m.end, html: `
      <div class="item"><div class="item-head"><span class="item-title">${esc(db.kind.get(m.kind)?.icon || '')} ${esc(m.title)}${m.who ? ` <span class="sc-muted">with ${esc(m.who)}</span>` : ''}</span><span class="small sc-faint num">${time(m.start)}–${time(m.end)}</span></div>
      <div class="small sc-muted">stamina ${-m.energy.stamina >= 0 ? '+' : ''}${-m.energy.stamina} · mana ${-m.energy.mana >= 0 ? '+' : ''}${-m.energy.mana}</div></div>` })),
  ].sort((a, b) => b.at - a.at);
  return `
  <section class="stack" id="today">
    <div class="row-between"><h2>Today</h2><span class="small sc-faint">${esc(g.day)}</span></div>
    ${items.length ? `<div class="list">${items.map((i) => i.html).join('')}</div>` : '<div class="muted-box">Nothing logged yet today.</div>'}
  </section>`;
}

export function render(ctx) {
  const timer = readTimer();
  return `<div class="view">
    ${ctx.g.energy.rated ? '' : energyPrompt(ctx)}
    ${hud(ctx.g)}
    ${banners(ctx.g)}
    ${plannerAsksSection(ctx)}
    ${timer ? timerCard(ctx, timer) : ''}
    ${ctx.ui.log ? logForm(ctx) : ''}
    ${ctx.ui.batch ? batchForm(ctx) : ''}
    ${nextSection(ctx)}
    ${momentsSection(ctx)}
    ${todaySection(ctx)}
  </div>`;
}

export function mounted(view) {
  for (const el of view.querySelectorAll('[data-since]')) el.textContent = fmtClock(Date.now() - Number(el.dataset.since));
}

async function startTimer(ctx, taskId) {
  if (readTimer()) { ctx.toast('A timer is already running: stop it first.', 'warning'); return; }
  const cand = reworkCandidate(ctx.db, taskId, ctx.now);
  let reworkOf = null;
  if (cand) {
    const t = ctx.db.task.get(taskId);
    const pick = await ctx.choose('Is this rework?', `<p>You finished <b>${esc(t?.title)}</b> on <b>${esc(cand.day)}</b>. Is this rework of that run?</p><p class="small sc-muted">Rework costs points and XP; a new run earns them.</p>`,
      [{ id: 'cancel', label: 'Cancel', kind: 'ghost' }, { id: 'rework', label: `Rework of ${cand.day}`, kind: 'danger' }, { id: 'new', label: 'No, a new run', kind: 'primary' }]);
    if (pick === 'cancel') return;
    if (pick === 'rework') reworkOf = cand.id;
  }
  writeJson(ls(), TIMER_KEY, { task: taskId, start: Date.now(), ...(reworkOf ? { reworkOf } : {}) });
  ctx.ui.log = null;
  ctx.render({ force: true });
}

/**
 * A deep link from the iPhone app: the Live Activity's Finish
 * (flow://done?task=&minutes=) opens Log done for that task with the timer's
 * minutes — value and quality still the player's to confirm — and the
 * widget's next task (flow://start?task=) starts its timer.
 */
export async function openLink(ctx, link) {
  const t = ctx.db.task.get(link?.task);
  if (!t) { ctx.toast('That task is not in Flow any more.', 'warning'); return; }
  const timer = readTimer();
  if (link.action === 'start') {
    if (timer?.task === t.id) { ctx.render({ force: true }); return; }
    await startTimer(ctx, t.id);
    return;
  }
  if (link.action !== 'done') return;
  const fromTimer = timer?.task === t.id;
  ctx.ui.log = {
    task: t.id, minutes: link.minutes ?? (fromTimer ? elapsedMinutes(timer.start, Date.now()) : t.estimate),
    timed: fromTimer, reworkOf: fromTimer ? timer.reworkOf || null : null, fromTimer,
  };
  ctx.ui.batch = null;
  ctx.render({ force: true });
  globalThis.document?.getElementById('log-form')?.scrollIntoView({ block: 'center' });
}

export const actions = {
  start: (el, ctx) => startTimer(ctx, el.dataset.task),
  stop: (el, ctx) => {
    const t = readTimer();
    if (!t) return;
    ctx.ui.log = { task: t.task, minutes: elapsedMinutes(t.start, Date.now()), timed: true, reworkOf: t.reworkOf || null, fromTimer: true };
    ctx.render({ force: true });
  },
  'cancel-timer': async (el, ctx) => {
    if (!(await ctx.confirm('Discard the timer?', 'Nothing is logged.', 'Discard', 'danger'))) return;
    writeJson(ls(), TIMER_KEY, null);
    ctx.ui.log = null;
    ctx.render({ force: true });
  },
  'start-any': (el, ctx) => startTimer(ctx, document.querySelector('#any-task [name=any]').value),
  'log-any': (el, ctx) => actions.log({ dataset: { task: document.querySelector('#any-task [name=any]').value } }, ctx),
  log: (el, ctx) => {
    const t = ctx.db.task.get(el.dataset.task);
    ctx.ui.log = { task: t.id, minutes: t.estimate, timed: false };
    ctx.ui.batch = null;
    ctx.render({ force: true });
    document.getElementById('log-form')?.scrollIntoView({ block: 'center' });
  },
  'log-cancel': (el, ctx) => { ctx.ui.log = null; ctx.render({ force: true }); },
  batch: (el, ctx) => {
    const s = [ctx.g.next.next, ...ctx.g.next.alternatives].find((x) => x?.task === el.dataset.task);
    if (!s?.batch) return;
    ctx.ui.batch = { name: ctx.db.task.get(s.task).batch, tasks: s.batch };
    ctx.ui.log = null;
    ctx.render({ force: true });
    document.getElementById('batch-form')?.scrollIntoView({ block: 'center' });
  },
  'batch-cancel': (el, ctx) => { ctx.ui.batch = null; ctx.render({ force: true }); },
  rework: (el, ctx) => { ctx.ui.reworkFor = ctx.ui.reworkFor === el.dataset.done ? null : el.dataset.done; ctx.render({ force: true }); },
  'rework-cancel': (el, ctx) => { ctx.ui.reworkFor = null; if (ctx.ui.log?.reworkOf) ctx.ui.log = null; ctx.render({ force: true }); },
  'moment-start': (el, ctx) => {
    if (readMoment()) return;
    writeJson(ls(), MOMENT_KEY, { kind: el.dataset.kind, start: Date.now(), who: '' });
    ctx.render({ force: true });
  },
  'moment-cancel': (el, ctx) => { writeJson(ls(), MOMENT_KEY, null); ctx.render({ force: true }); },
};

export const forms = {
  energy: async (d, form, ctx) => {
    await ctx.store.add(makeEnergy({ stamina: d.stamina, mana: d.mana }));
    ctx.toast(`Today: stamina ${d.stamina}, mana ${d.mana}.`, 'success');
  },
  done: async (d, form, ctx) => {
    const L = ctx.ui.log || {};
    const task = ctx.db.task.get(d.task);
    const rec = makeDone(ctx.db, task, {
      end: endFrom(d.endAt), minutes: d.minutes, value: d.value,
      quality: d.quality === undefined ? undefined : Number(d.quality) / 100, timed: !!L.timed, note: d.note || '',
    });
    ctx.ui.log = null;
    if (L.fromTimer) writeJson(ls(), TIMER_KEY, null);
    await ctx.store.add(rec);
    ctx.toast(`${task.title}: +${rec.price.points} points${rec.price.multiplier > 1 ? ` (×${rec.price.multiplier})` : ''}.`, 'success');
  },
  rework: async (d, form, ctx) => {
    const rec = makeRework(ctx.db, d.done, { minutes: d.minutes, at: Date.now(), note: d.note || '' });
    ctx.ui.reworkFor = null;
    if (d.fromTimer) { writeJson(ls(), TIMER_KEY, null); ctx.ui.log = null; }
    await ctx.store.add(rec);
    ctx.toast(`Rework: −${rec.penalty} XP, −${rec.charged} points (×${rec.multiplier}).`, 'warning');
  },
  batch: async (d, form, ctx) => {
    const B = ctx.ui.batch;
    const rows = B.tasks.map((_, i) => ({ on: d[`on_${i}`] === 'on', task: d[`task_${i}`], minutes: Number(d[`minutes_${i}`]), value: d[`value_${i}`] })).filter((r) => r.on && r.task);
    if (!rows.length) throw new Error('Tick at least one task.');
    const ends = batchEnds(rows.map((r) => r.minutes), Date.now());
    // Each one is priced against the ones before it, so the batch bonus climbs.
    const records = ctx.store.liveRecords();
    const out = [];
    let db = ctx.db;
    rows.forEach((r, i) => {
      const rec = makeDone(db, r.task, { end: ends[i], minutes: r.minutes, value: r.value });
      out.push(rec);
      db = index([...records, ...out]);
    });
    ctx.ui.batch = null;
    await ctx.store.add(out);
    ctx.toast(`Batch of ${out.length}: +${out.reduce((n, r) => n + r.price.points, 0)} points.`, 'success');
  },
  'planner-fix': async (d, form, ctx) => {
    const ask = ctx.store.plannerAsks(Date.now()).find((a) => a.id === d.ask);
    if (!ask) return;
    const rec = plannerRework(ctx.db, ask, d.minutes);
    await ctx.store.add(rec);
    ctx.toast(`Rework: −${rec.penalty} XP, −${rec.charged} points (×${rec.multiplier}).`, 'warning');
  },
  'moment-stop': async (d, form, ctx) => {
    const m = readMoment();
    if (!m) return;
    const end = Math.max(Date.now(), m.start + 1000);
    const rec = makeMoment(ctx.db, m.kind, { start: m.start, end, who: (d.who || '').trim() });
    writeJson(ls(), MOMENT_KEY, null);
    await ctx.store.add(rec);
    ctx.toast(`${rec.title} logged.`, 'success');
  },
};
