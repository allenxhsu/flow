// Fix: the manual edits (SPEC.md › Corrections). Rework is for work really
// done and then redone; this screen is for a record that should never have
// counted — a completion logged twice, a tick that earned points for nothing,
// minutes typed wrong. Nothing here edits or deletes a record: every fix is a
// `correction` event naming the one it corrects, and index() applies it, so
// the points, the level and the history follow and the original stays.

import { makeCorrection, AMENDABLE } from '../model.js';
import { esc, fmtPts } from '../util.js';

/** The events of the db, newest first: what a correction may name. */
const EVENT_LISTS = [
  ['done', (db) => db.done, (db, e) => db.task.get(e.task)?.title || '(deleted task)'],
  ['rework', (db) => db.rework, (db, e) => `Rework · ${db.task.get(e.task)?.title || '(deleted task)'}`],
  ['purchase', (db) => db.purchases, (db, e) => db.reward.get(e.reward)?.title || '(deleted reward)'],
  ['moment', (db) => db.moments, (db, e) => db.kind.get(e.kind)?.title || 'Moment'],
  ['energy', (db) => db.energy, (db, e) => (e.feeling === 'tired' ? "I'm tired" : 'Energy check-in')],
  ['review', (db) => db.reviews, (db, e) => `Weekly review · ${e.week || e.day}`],
  ['skip', (db) => db.skips || [], (db, e) => `Had it already · ${e.query || e.name || ''}`],
  ['spend', (db) => db.spends || [], (db, e) => `Bought · ${e.name || ''}`],
  ['visit', (db) => db.visits || [], (db, e) => `At ${db.place.get(e.place)?.name || 'a place'}`],
];

/** When it happened: an event carries one of these three. */
export const whenOf = (e) => e.end ?? e.at ?? e.leave ?? 0;

/** What it moved the balance by, read the same way balanceOf reads it. */
export function pointsOf(type, e) {
  if (type === 'done') return e.price?.points || 0;
  if (type === 'rework' || type === 'purchase') return -(e.charged || 0);
  if (type === 'skip') return e.points || 0;
  return 0;
}

/** Every event, newest first, with what a row needs to show. */
export function rows(db, limit = 120) {
  const out = [];
  for (const [type, list, title] of EVENT_LISTS) {
    for (const e of list(db) || []) out.push({ id: e.id, type, rec: e, when: whenOf(e), title: title(db, e), points: pointsOf(type, e), minutes: e.minutes ?? null, corrected: !!e.corrected });
  }
  return out.sort((a, b) => b.when - a.when || a.id.localeCompare(b.id)).slice(0, limit);
}

const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
const dayOfMs = (ms) => new Date(ms).toISOString().slice(0, 10);

function row(r) {
  const pts = r.points ? `<span class="fix-pts num${r.points < 0 ? ' is-debt' : ''}">${r.points > 0 ? '+' : '−'}${fmtPts(Math.abs(r.points))}</span>` : '<span class="fix-pts num sc-faint">—</span>';
  return `<li class="fix-row sc-card" data-event="${esc(r.id)}">
    <label class="fix-pick"><input class="sc-check" type="checkbox" name="pick" value="${esc(r.id)}" aria-label="Pick ${esc(r.title)}"></label>
    <span class="fix-when num">${esc(clock(r.when))}</span>
    <span class="fix-what"><span class="fix-title">${esc(r.title)}</span><span class="fix-kind sc-pill">${esc(r.type)}</span>${r.corrected ? '<span class="sc-pill" style="--tint: var(--sc-warning)">amended</span>' : ''}</span>
    <span class="fix-min num sc-faint">${r.minutes == null ? '' : `${r.minutes}m`}</span>
    ${pts}
    <span class="row">
      <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="amend" data-event="${esc(r.id)}">Amend</button>
      <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="withdraw" data-event="${esc(r.id)}">Withdraw</button>
    </span>
  </li>`;
}

/** The amend form for one event: the three numbers a correction may replace. */
function amendForm(ctx, r) {
  return `<form class="sc-panel sc-panel--lit pad stack" data-form="amend" id="amend-form">
    <div class="row-between"><h2>Amend · ${esc(r.title)}</h2><span class="small sc-faint">${esc(r.type)} · ${esc(clock(r.when))}</span></div>
    <input type="hidden" name="id" value="${esc(r.id)}">
    <div class="form-grid">
      <label class="sc-field"><span>Minutes</span><input class="sc-input" type="number" name="minutes" min="0" step="1" value="${r.minutes == null ? '' : esc(r.minutes)}"></label>
      <label class="sc-field"><span>Points</span><input class="sc-input" type="number" name="points" min="0" step="1" value="${esc(Math.abs(r.points) || '')}"></label>
      <label class="sc-field wide"><span>Note</span><input class="sc-input" name="note" value="${esc(r.rec.note || '')}"></label>
      <label class="sc-field wide"><span>Why</span><input class="sc-input" name="reason" required placeholder="what was wrong with the record"></label>
    </div>
    <p class="small sc-faint" style="margin:0">A number left blank is left alone. Points are the number you type, not a reprice: ${esc(AMENDABLE.join(', '))} are all a correction may change, because everything else is worked out from them.</p>
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Save the correction</button><button class="sc-button sc-button--ghost" type="button" data-action="cancel">Cancel</button></div>
  </form>`;
}

/** What has been corrected already, newest first, each undoable. */
function made(ctx) {
  const { db } = ctx;
  if (!db.corrections.length) return '';
  const title = (c) => {
    const rec = ctx.store?.getRecord?.(c.target);
    if (!rec) return c.of || 'record';
    return db.task.get(rec.task)?.title || db.reward.get(rec.reward)?.title || db.kind.get(rec.kind)?.title || c.of || 'record';
  };
  const list = [...db.corrections].reverse().map((c) => `<li class="fix-row sc-card" data-correction="${esc(c.id)}">
    <span class="fix-when num">${esc(dayOfMs(c.at))}</span>
    <span class="fix-what"><span class="fix-title">${esc(title(c))}</span><span class="fix-kind sc-pill">${c.kind === 'void' ? 'withdrawn' : 'amended'}</span></span>
    <span class="fix-why">${esc(c.reason)}</span>
    <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="undo" data-correction="${esc(c.id)}">Undo</button>
  </li>`).join('');
  return `<section class="sc-panel pad stack">
    <div class="row-between"><h2>Corrections · ${db.corrections.length}</h2><span class="small sc-faint">the record itself is still here; undo puts it back</span></div>
    <ul class="list fix-list">${list}</ul>
  </section>`;
}

export function render(ctx) {
  const { db, ui } = ctx;
  const list = rows(db);
  const picked = ui.fixEvent && list.find((r) => r.id === ui.fixEvent);
  const byDay = new Map();
  for (const r of list) byDay.set(dayOfMs(r.when), [...(byDay.get(dayOfMs(r.when)) || []), r]);
  const days = [...byDay].map(([day, rs]) => `<div class="stack"><h3 class="fix-day">${esc(day)}</h3><ul class="list fix-list">${rs.map(row).join('')}</ul></div>`).join('');
  return `<div class="view">
    <div class="sc-panel pad stack">
      <div class="row-between"><h2>Fix</h2><span class="small sc-faint">for a record that should never have counted</span></div>
      <p class="small sc-muted" style="margin:0">Work really done and then redone is <strong>rework</strong>, on Now. This screen withdraws a record instead: it stops counting anywhere — points, level, balance, streaks, bests — and stays in the store with the reason beside it, so nothing is rewritten and every fix can be undone.</p>
    </div>
    ${picked ? amendForm(ctx, picked) : ''}
    ${list.length ? `<form class="sc-panel pad stack" data-form="withdraw-many" id="withdraw-form">
      <div class="row-between"><h2>Events · ${list.length}</h2><span class="small sc-faint" id="fix-count" data-count="0">none picked</span></div>
      ${days}
      <div class="form-grid">
        <label class="sc-field wide"><span>Why these should not have counted</span><input class="sc-input" name="reason" required placeholder="e.g. ticked off, nothing was done"></label>
      </div>
      <div class="row"><button class="sc-button sc-button--danger" type="submit">Withdraw the picked</button><button class="sc-button sc-button--ghost" type="button" data-action="pick-none">Clear</button></div>
    </form>` : '<div class="muted-box">Nothing to fix yet: no events have been written.</div>'}
    ${made(ctx)}
  </div>`;
}

/** One withdrawal, written against the db as it stands after the ones before it. */
async function withdraw(ctx, ids, reason) {
  const out = [];
  let db = ctx.db;
  for (const id of ids) {
    const rec = makeCorrection(db, { target: id, kind: 'void', reason, at: ctx.now ?? Date.now() });
    out.push(rec);
    db = { ...db, corrections: [...db.corrections, rec], correction: new Map([...db.correction, [id, [...(db.correction.get(id) || []), rec]]]) };
  }
  await ctx.store.add(out);
  return out;
}

export const actions = {
  amend: (el, ctx) => { ctx.ui.fixEvent = el.dataset.event; ctx.render({ force: true }); document.getElementById('amend-form')?.scrollIntoView({ block: 'start' }); },
  cancel: (el, ctx) => { ctx.ui.fixEvent = null; ctx.render({ force: true }); },
  'pick-none': (el, ctx) => { for (const box of document.querySelectorAll('#withdraw-form input[name=pick]')) box.checked = false; },
  // One row and many rows are the same path: pick it and say why. There is no
  // withdrawal without a reason, so there is no quicker way to write one.
  withdraw: (el, ctx) => {
    const box = document.querySelector(`#withdraw-form input[name=pick][value="${CSS.escape(el.dataset.event)}"]`);
    if (box) box.checked = true;
    const why = document.querySelector('#withdraw-form input[name=reason]');
    why?.scrollIntoView({ block: 'center' });
    why?.focus();
  },
  undo: async (el, ctx) => {
    await ctx.store.undoCorrection(el.dataset.correction);
    ctx.toast('Put back.', 'success');
    ctx.render({ force: true });
  },
};

export const forms = {
  'withdraw-many': async (d, form, ctx) => {
    const ids = [...form.querySelectorAll('input[name=pick]')].filter((b) => b.checked ?? true).map((b) => b.value);
    if (!ids.length) throw new Error('Pick the records to withdraw first.');
    const out = await withdraw(ctx, ids, String(d.reason || '').trim());
    ctx.toast(`${out.length} withdrawn. They count for nothing from now on.`, 'success');
  },
  amend: async (d, form, ctx) => {
    const patch = {};
    for (const k of AMENDABLE) if (String(d[k] ?? '').trim() !== '') patch[k] = k === 'note' ? String(d[k]) : Number(d[k]);
    const rec = makeCorrection(ctx.db, { target: d.id, kind: 'amend', patch, reason: String(d.reason || '').trim(), at: ctx.now ?? Date.now() });
    await ctx.store.add(rec);
    ctx.ui.fixEvent = null;
    ctx.toast('Corrected.', 'success');
  },
};
