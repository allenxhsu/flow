// The Fix screen (SPEC.md › Corrections › Contract › App): the recent events
// with what each earned, withdrawn or amended one at a time or several at
// once, and the corrections made, each undoable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, index, makeCorrection } from '../src/model.js';
import * as fix from '../src/views/fix.js';
import { game, T } from './helpers.mjs';

const MON = '2026-09-28';
const at = (t) => T(`${MON}T${t}:00`);

/** Three completions this morning, one of them the one that should never have counted. */
function world() {
  const g = game();
  const mail = g.task({ id: 'task_mail', title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 30 });
  const run = g.task({ id: 'task_run', title: 'Run', skill: 'sk_run', measure: 'time', cadence: 'daily', estimate: 30 });
  const a = g.done(mail, `${MON}T09:30:00`, 30);
  const b = g.done(run, `${MON}T10:30:00`, 30);
  return { g, a, b };
}
const ctxOf = (g, t = '12:00') => ({ db: g.db(), g: play(g.records, at(t)), now: at(t), ui: {} });

test('Fix lists the recent events, each with what it earned and a way to withdraw it', () => {
  const { g, a } = world();
  const html = fix.render(ctxOf(g));
  assert.match(html, /Mail/);
  assert.match(html, /Run/);
  assert.match(html, new RegExp(`data-event="${a.id}"`), 'each row names its event');
  assert.match(html, /\+30/, 'what it earned');
  assert.match(html, /data-action="withdraw"/);
  assert.match(html, /data-action="amend"/);
});

test('Fix: a row says what kind of record it is, so a purchase is not mistaken for a completion', () => {
  const { g } = world();
  const reward = g.reward({ title: 'Ice cream', price: 30 });
  g.buy(reward, `${MON}T11:00:00`);
  const html = fix.render(ctxOf(g));
  assert.match(html, /Ice cream/);
  assert.match(html, /purchase/i);
});

test('Fix: several rows can be picked, and one reason withdraws them all', () => {
  const { g, a, b } = world();
  const html = fix.render(ctxOf(g));
  assert.match(html, new RegExp(`<input[^>]*type="checkbox"[^>]*value="${a.id}"`), 'a row is selectable');
  assert.match(html, new RegExp(`<input[^>]*type="checkbox"[^>]*value="${b.id}"`));
  assert.match(html, /data-form="withdraw-many"/);
  assert.match(html, /name="reason"/);
});

test('Fix: the corrections made are listed with their reason, and each can be undone', () => {
  const { g, a } = world();
  const c = makeCorrection(g.db(), { target: a.id, kind: 'void', reason: 'ticked off, nothing was done', at: at('11:30') });
  g.add(c);
  const html = fix.render(ctxOf(g));
  assert.match(html, /ticked off, nothing was done/);
  assert.match(html, new RegExp(`data-action="undo"[^>]*data-correction="${c.id}"|data-correction="${c.id}"[^>]*data-action="undo"`));
  assert.match(html, /withdrawn/i);
});

test('Fix: a withdrawn event is no longer offered for withdrawing again', () => {
  const { g, a } = world();
  g.add(makeCorrection(g.db(), { target: a.id, kind: 'void', reason: 'nothing was done', at: at('11:30') }));
  const html = fix.render(ctxOf(g));
  const rows = [...html.matchAll(/data-event="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(!rows.includes(a.id), 'it has left the list of events to fix');
});

test('Fix: nothing to fix reads as nothing to fix, not an empty page', () => {
  const html = fix.render({ db: index([]), g: play([], at('12:00')), now: at('12:00'), ui: {} });
  assert.match(html, /nothing/i);
});

test('Fix: the withdraw form refuses to submit without a reason', () => {
  const { g } = world();
  const html = fix.render(ctxOf(g));
  const form = /<form[^>]*data-form="withdraw-many"[\s\S]*?<\/form>/.exec(html)[0];
  assert.match(form, /name="reason"[^>]*required|required[^>]*name="reason"/);
});

test('Fix: the amend form takes minutes, points and a note, and only those', () => {
  const { g, a } = world();
  const html = fix.render({ ...ctxOf(g), ui: { fixEvent: a.id } });
  const form = /<form[^>]*data-form="amend"[\s\S]*?<\/form>/.exec(html)[0];
  const names = [...form.matchAll(/name="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names.filter((n) => !['id', 'reason'].includes(n)), ['minutes', 'points', 'note']);
  assert.match(form, /value="30"/, 'it starts from the numbers on the record');
});

test('Fix: writing a withdrawal adds one correction per picked event', async () => {
  const { g, a, b } = world();
  const written = [];
  const ctx = { ...ctxOf(g), store: { add: async (...r) => written.push(...r.flat()) }, toast: () => {} };
  const form = { querySelectorAll: () => [{ value: a.id }, { value: b.id }] };
  await fix.forms['withdraw-many']({ reason: 'ticked off, nothing was done' }, form, ctx);
  assert.equal(written.length, 2);
  assert.deepEqual(written.map((r) => r.target).sort(), [a.id, b.id].sort());
  for (const r of written) {
    assert.equal(r.kind, 'void');
    assert.equal(r.reason, 'ticked off, nothing was done');
  }
});

test('Fix: writing an amend sends only the numbers that were filled in', async () => {
  const { g, a } = world();
  const written = [];
  const ctx = { ...ctxOf(g), store: { add: async (...r) => written.push(...r.flat()) }, toast: () => {}, ui: {} };
  await fix.forms.amend({ id: a.id, minutes: '', points: '15', note: '', reason: 'half of it was a meeting' }, {}, ctx);
  assert.equal(written.length, 1);
  assert.equal(written[0].kind, 'amend');
  assert.deepEqual(written[0].patch, { points: 15 });
});

// ─── what Planner now disagrees with (SPEC.md › Planner changed its mind) ──

const DRIFT = [{ done: 'done_pl_ge_hose_1', task: 'task_pl_ge_hose', title: 'Receive hose', project: 'GE SO 278078',
  logged: 120, minutes: 0, points: 120, reason: 'Planner now puts this at nothing, not the 2h it said when Flow logged it' }];

test('Fix: Planner disagreeing with a logged completion is offered, never applied', () => {
  const { g } = world();
  const html = fix.render({ ...ctxOf(g), store: { plannerDrift: () => DRIFT } });
  assert.match(html, /Receive hose/);
  assert.match(html, /2h/, 'what Flow logged');
  assert.match(html, /nothing|0m/, 'what Planner says now');
  assert.match(html, /data-action="accept-drift"[^>]*data-done="done_pl_ge_hose_1"|data-done="done_pl_ge_hose_1"[^>]*data-action="accept-drift"/);
});

test('Fix: no disagreement, no section', () => {
  const { g } = world();
  const html = fix.render({ ...ctxOf(g), store: { plannerDrift: () => [] } });
  assert.doesNotMatch(html, /Planner now/);
});

test('Fix: accepting one writes an amend carrying Planner\'s numbers and reason', async () => {
  const { g } = world();
  const written = [];
  const ctx = { ...ctxOf(g), store: { plannerDrift: () => DRIFT, add: async (...r) => written.push(...r.flat()) }, toast: () => {}, render: () => {} };
  ctx.db = { ...ctx.db, done: [...ctx.db.done, { id: 'done_pl_ge_hose_1', type: 'done', task: 'task_mail', day: '2026-09-28', end: at('17:30'), minutes: 120, measure: 'time', value: 120, quality: 1, price: { points: 120 } }] };
  await fix.actions['accept-drift']({ dataset: { done: 'done_pl_ge_hose_1' } }, ctx);
  assert.equal(written.length, 1);
  assert.equal(written[0].kind, 'amend');
  assert.deepEqual(written[0].patch, { minutes: 0, points: 0 });
  assert.match(written[0].reason, /Planner now puts this at nothing/);
});
