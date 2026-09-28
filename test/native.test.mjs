// src/native.js — the page's half of the iPhone app (SPEC.md › iOS app).
// Pure helpers (the widget snapshot, deep links, the visit records) and the
// bridge itself, run under Node against a fake shell-kit host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';
import { createNative, snapshotOf, parseDeepLink, timerMessage, visitRecords, TO_APP, TO_PAGE } from '../src/native.js';
import { game, T } from './helpers.mjs';

const D = '2026-09-28';
const at = (hhmm) => T(`${D}T${hhmm}:00`);

// ─── the widget snapshot ────────────────────────────────────────────────────

test('snapshotOf(play()) → { stamina, mana, points, level, next: { id, title, estimate }, at }', () => {
  const g = game();
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 25, mana: 1 });
  g.energy(`${D}T06:30:00`, 7, 6.5);
  g.done(g.task({ title: 'Run', skill: 'sk_run', estimate: 30 }), `${D}T07:30:00`, 30);
  const p = M.play(g.records, at('09:00'));
  const s = snapshotOf(p);
  assert.deepEqual(Object.keys(s).sort(), ['at', 'level', 'mana', 'next', 'points', 'stamina']);
  assert.equal(s.stamina, p.energy.stamina);
  assert.equal(s.mana, p.energy.mana);
  assert.equal(s.points, p.balance);
  assert.equal(s.level, p.player.level);
  assert.equal(s.at, at('09:00'));
  assert.deepEqual(s.next, { id: t.id, title: 'Mail', estimate: 25 });
});

test('snapshot: an unrated day has no meters, and nothing to do is next: null', () => {
  const s = snapshotOf(M.play(game().records, at('09:00')));
  assert.equal(s.stamina, null);
  assert.equal(s.mana, null);
  assert.equal(s.next, null);
  assert.equal(s.points, 0);
  assert.equal(s.level, 1);
});

test('snapshot is plain JSON the widget can decode (no Maps, no functions)', () => {
  const g = game();
  g.task({ title: 'Mail', skill: 'sk_mail', estimate: 25 });
  const s = snapshotOf(M.play(g.records, at('09:00')));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

// ─── deep links ─────────────────────────────────────────────────────────────

test('flow://done?task=<id>&minutes=<n> → Log done for that task with the minutes', () => {
  assert.deepEqual(parseDeepLink('flow://done?task=task_abc&minutes=42'), { action: 'done', task: 'task_abc', minutes: 42 });
  assert.deepEqual(parseDeepLink('flow://done?task=task_abc'), { action: 'done', task: 'task_abc', minutes: null });
  assert.deepEqual(parseDeepLink('flow://done?task=task_abc&minutes=0'), { action: 'done', task: 'task_abc', minutes: null });
  assert.deepEqual(parseDeepLink('flow://done?task=task_abc&minutes=abc'), { action: 'done', task: 'task_abc', minutes: null });
  assert.deepEqual(parseDeepLink('flow://done?task=task_abc&minutes=12.6'), { action: 'done', task: 'task_abc', minutes: 13 });
});

test('flow://start?task=<id> → start the timer on it', () => {
  assert.deepEqual(parseDeepLink('flow://start?task=task_pl_plan_web_t1'), { action: 'start', task: 'task_pl_plan_web_t1' });
  assert.deepEqual(parseDeepLink('flow:///start?task=x'), { action: 'start', task: 'x' });
  assert.deepEqual(parseDeepLink('flow://start?task=a%20b'), { action: 'start', task: 'a b' });
});

test('anything else is not a Flow deep link', () => {
  for (const u of ['', null, undefined, 'https://example.com/done?task=x', 'flow://done', 'flow://start?task=', 'flow://delete?task=x', 'not a url', 'flow://open?task=x']) {
    assert.equal(parseDeepLink(u), null, String(u));
  }
});

// ─── the timer message ──────────────────────────────────────────────────────

test('timerMessage: running → { type: flow.timer, state, task: { id, title, place }, start }; none → stopped', () => {
  const g = game();
  const t = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const db = g.db();
  assert.deepEqual(timerMessage(db, { task: t.id, start: at('07:00') }),
    { type: 'flow.timer', state: 'running', task: { id: t.id, title: 'Run', place: 'Gym' }, start: at('07:00') });
  assert.deepEqual(timerMessage(db, null), { type: 'flow.timer', state: 'stopped', task: null, start: null });
  const r = g.task({ title: 'Read', skill: 'sk_read', estimate: 30 });
  assert.equal(timerMessage(g.db(), { task: r.id, start: 1 }).task.place, null, 'no place → null');
});

// ─── visit records ──────────────────────────────────────────────────────────

test('visitRecords: a finished stay → the visit (and a Drive moment when it follows a departure)', () => {
  const g = game();
  g.add(M.makeVisit(g.db(), { place: 'place_bedroom', arrive: null, leave: at('07:30') }));
  const out = visitRecords(g.db(), { id: 'n1', place: 'place_desk', arrive: at('08:10'), leave: at('12:00') });
  assert.deepEqual(out.map((r) => r.type), ['visit', 'moment']);
  assert.equal(out[0].place, 'place_desk');
  assert.equal(out[1].kind, 'kind_drive');
});

test('visitRecords: an arrival still open writes only the Drive moment; the visit waits for the leave', () => {
  const g = game();
  g.add(M.makeVisit(g.db(), { place: 'place_bedroom', arrive: null, leave: at('07:30') }));
  const out = visitRecords(g.db(), { id: 'n1', place: 'place_desk', arrive: at('08:10'), leave: null });
  assert.deepEqual(out.map((r) => r.type), ['moment']);
  g.add(...out);
  const later = visitRecords(g.db(), { id: 'n2', place: 'place_desk', arrive: at('08:10'), leave: at('12:00') });
  assert.deepEqual(later.map((r) => r.type), ['visit'], 'the drive is not written twice');
});

test('visitRecords: what is already written is not returned again; an unknown place gives nothing', () => {
  const g = game();
  const e = { id: 'n1', place: 'place_gym', arrive: at('17:00'), leave: at('18:00') };
  g.add(...visitRecords(g.db(), e));
  assert.deepEqual(visitRecords(g.db(), e), []);
  assert.deepEqual(visitRecords(g.db(), { id: 'n2', place: 'place_gone', arrive: at('17:00'), leave: at('18:00') }), []);
  assert.deepEqual(visitRecords(g.db(), { id: 'n3', place: { id: 'place_desk', name: 'Desk' }, arrive: at('09:00'), leave: at('10:00') }).map((r) => r.place), ['place_desk'], 'a place may come as { id, name }');
});

// ─── the bridge, with a fake shell ──────────────────────────────────────────

function fakeHost({ hosted = true, platform = 'ios' } = {}) {
  const h = {
    hosted, platform, posts: [], api: null,
    post: (m) => { if (hosted) h.posts.push(m); },
    initHost: (api) => { h.api = api; return hosted; },
  };
  return h;
}
function fakeStore(g) {
  const s = {
    added: [],
    db: () => g.db(),
    getRecord: (id) => g.records.find((r) => r.id === id) || null,
    add: async (...rs) => { const list = rs.flat(); for (const r of list) if (s.getRecord(r.id)) throw new Error('exists'); g.records.push(...list); s.added.push(...list); return list; },
  };
  return s;
}

test('no shell: every call is a no-op — nothing posted, nothing written, init says false', async () => {
  const g = game();
  const t = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const host = { hosted: false, platform: null, post: () => { throw new Error('posted without a shell'); }, initHost: () => false };
  const store = fakeStore(g);
  const n = createNative({ host, store });
  assert.equal(n.hosted, false);
  assert.equal(n.platform, null);
  assert.equal(n.init(), false);
  n.timer(g.db(), { task: t.id, start: at('07:00') });
  n.timer(g.db(), null);
  n.snapshot(M.play(g.records, at('09:00')));
  n.setGeofence({ id: 'place_gym', name: 'Gym' });
  n.clearGeofence({ id: 'place_gym', name: 'Gym' });
  n.listGeofences();
  n.requestHealth();
  assert.deepEqual(store.added, []);
  assert.equal(n.state.health, null);
  assert.equal(n.state.geofence, null);
});

test('the module loads under Node with the real (vendored) host: not hosted, platform null', async () => {
  const n = createNative({ store: fakeStore(game()) });
  assert.equal(n.hosted, false);
  assert.equal(n.platform, null);
  assert.equal(n.init(), false);
});

test('hosted on iOS: init names the handler "flow", then asks for geofences and Health', () => {
  const host = fakeHost();
  const n = createNative({ host, store: fakeStore(game()) });
  assert.equal(n.init(), true);
  assert.equal(n.hosted, true);
  assert.equal(n.platform, 'ios');
  assert.equal(host.api.name, 'flow');
  for (const k of ['load', 'command', 'saved', 'remote', 'event']) assert.equal(typeof host.api[k], 'function', k);
  assert.deepEqual(host.posts, [{ type: TO_APP.geofenceList }, { type: TO_APP.healthRequest }]);
});

test('hosted on the Mac: no geofence or Health requests (the Mac has neither)', () => {
  const host = fakeHost({ platform: 'macos' });
  createNative({ host, store: fakeStore(game()) }).init();
  assert.deepEqual(host.posts, []);
});

test('hosted: the timer is posted when it starts and when it stops, once each', () => {
  const g = game();
  const t = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const host = fakeHost();
  const n = createNative({ host, store: fakeStore(g) });
  const timer = { task: t.id, start: at('07:00') };
  n.timer(g.db(), timer);
  n.timer(g.db(), { ...timer });
  n.timer(g.db(), null);
  n.timer(g.db(), null);
  assert.deepEqual(host.posts, [
    { type: 'flow.timer', state: 'running', task: { id: t.id, title: 'Run', place: 'Gym' }, start: at('07:00') },
    { type: 'flow.timer', state: 'stopped', task: null, start: null },
  ]);
});

test('hosted: no timer at launch posts "stopped" once, so a Live Activity left over from a crash ends', () => {
  const host = fakeHost();
  const g = game();
  const n = createNative({ host, store: fakeStore(g) });
  n.timer(g.db(), null);
  n.timer(g.db(), null);
  assert.deepEqual(host.posts, [{ type: 'flow.timer', state: 'stopped', task: null, start: null }]);
});

test('hosted: a snapshot is posted on every change, not on every render', () => {
  const g = game();
  g.task({ title: 'Mail', skill: 'sk_mail', estimate: 25 });
  const host = fakeHost();
  const n = createNative({ host, store: fakeStore(g) });
  n.snapshot(M.play(g.records, at('09:00')));
  n.snapshot(M.play(g.records, at('09:01'))); // only the clock moved
  g.energy(`${D}T09:02:00`, 7, 7);
  n.snapshot(M.play(g.records, at('09:02')));
  assert.equal(host.posts.length, 2);
  assert.equal(host.posts[0].type, 'flow.snapshot');
  assert.equal(host.posts[1].stamina, 7);
  const { type, ...body } = host.posts[1];
  assert.deepEqual(body, snapshotOf(M.play(g.records, at('09:02'))));
});

test('hosted: geofence and Health requests carry place ids and names only', () => {
  const host = fakeHost();
  const n = createNative({ host, store: fakeStore(game()) });
  n.setGeofence({ id: 'place_gym', name: 'Gym', zone: 'town', type: 'place' });
  n.clearGeofence({ id: 'place_gym', name: 'Gym' });
  n.listGeofences();
  n.requestHealth();
  assert.deepEqual(host.posts, [
    { type: 'flow.geofence.set', place: { id: 'place_gym', name: 'Gym' } },
    { type: 'flow.geofence.clear', place: { id: 'place_gym', name: 'Gym' } },
    { type: 'flow.geofence.list' },
    { type: 'flow.health.request' },
  ]);
});

test('events: flow.visit is written through the model, then acked — and a re-sent one is acked, not duplicated', async () => {
  const g = game();
  g.add(M.makeVisit(g.db(), { place: 'place_bedroom', arrive: null, leave: at('07:30') }));
  const host = fakeHost();
  const store = fakeStore(g);
  let changes = 0;
  const n = createNative({ host, store, onChange: () => { changes++; } });
  n.init();
  host.posts.length = 0;
  const ev = { type: TO_PAGE.visit, id: 'q1', place: 'place_desk', arrive: at('08:10'), leave: at('12:00') };
  await host.api.event(ev);
  const expected = visitRecords(M.index(g.records.filter((r) => !store.added.includes(r))), ev);
  assert.deepEqual(store.added.map((r) => r.id), expected.map((r) => r.id));
  assert.deepEqual(store.added.map((r) => r.type), ['visit', 'moment']);
  assert.deepEqual(host.posts, [{ type: 'flow.visits.ack', ids: ['q1'] }]);
  await host.api.event(ev);
  assert.equal(store.added.length, 2, 'nothing new');
  assert.deepEqual(host.posts[1], { type: 'flow.visits.ack', ids: ['q1'] });
});

test('events: visits delivered together are written in order, so the second sees the first', async () => {
  const g = game();
  const host = fakeHost();
  const store = fakeStore(g);
  const n = createNative({ host, store });
  n.init();
  host.posts.length = 0;
  const a = host.api.event({ type: 'flow.visit', id: 'q1', place: 'place_bedroom', arrive: null, leave: at('07:30') });
  const b = host.api.event({ type: 'flow.visit', id: 'q2', place: 'place_desk', arrive: at('08:00'), leave: at('12:00') });
  await Promise.all([a, b]);
  assert.deepEqual(store.added.map((r) => r.type), ['visit', 'visit', 'moment']);
  assert.deepEqual(host.posts.map((p) => p.ids), [['q1'], ['q2']]);
});

test('events: a visit that cannot be written is not acked (the shell keeps it); one for a removed place is dropped', async () => {
  const g = game();
  const host = fakeHost();
  const store = { ...fakeStore(g), add: async () => { throw new Error('disk full'); } };
  const n = createNative({ host, store, log: () => {} });
  n.init();
  host.posts.length = 0;
  await host.api.event({ type: 'flow.visit', id: 'q1', place: 'place_gym', arrive: at('17:00'), leave: at('18:00') });
  assert.deepEqual(host.posts, []);
  await host.api.event({ type: 'flow.visit', id: 'q2', place: 'place_removed', arrive: at('17:00'), leave: at('18:00') });
  assert.deepEqual(host.posts, [{ type: 'flow.visits.ack', ids: ['q2'] }]);
});

test('events: flow.health and flow.geofence.status are kept in memory for the views, never written', async () => {
  const g = game();
  const host = fakeHost();
  const store = fakeStore(g);
  let changes = 0;
  const n = createNative({ host, store, onChange: () => { changes++; } });
  n.init();
  await host.api.event({ type: 'flow.health', day: D, sleepHours: 7.6, steps: 9100 });
  assert.deepEqual(n.state.health, { day: D, sleepHours: 7.6, steps: 9100 });
  await host.api.event({ type: 'flow.geofence.status', authorized: true, places: [{ id: 'place_gym', set: true }] });
  assert.deepEqual(n.state.geofence, { authorized: true, places: [{ id: 'place_gym', set: true }] });
  assert.equal(changes, 2);
  assert.deepEqual(store.added, []);
});

test('events: open with a Flow deep link reaches onOpen parsed; other URLs are ignored', async () => {
  const host = fakeHost();
  const opened = [];
  const n = createNative({ host, store: fakeStore(game()), onOpen: (l) => opened.push(l) });
  n.init();
  await host.api.event({ type: 'open', url: 'flow://done?task=task_x&minutes=25' });
  await host.api.event({ type: 'open', url: 'flow://start?task=task_y' });
  await host.api.event({ type: 'open', url: 'https://example.com/' });
  await host.api.event({ type: 'something.else' });
  assert.deepEqual(opened, [{ action: 'done', task: 'task_x', minutes: 25 }, { action: 'start', task: 'task_y' }]);
});

test('remote({ url, token }) from Portal pairing reaches onRemote as the sync settings', () => {
  const host = fakeHost();
  const got = [];
  createNative({ host, store: fakeStore(game()), onRemote: (r) => got.push(r) }).init();
  host.api.remote({ url: 'https://portal.example/w/flow', token: 't0k' });
  host.api.remote({ url: '', token: '' });
  assert.deepEqual(got, [{ url: 'https://portal.example/w/flow', token: 't0k' }, { url: '', token: '' }]);
});

test('pair and sign out post the shell-kit Portal messages', () => {
  const host = fakeHost();
  const n = createNative({ host, store: fakeStore(game()) });
  n.pair();
  n.signOut();
  assert.deepEqual(host.posts, [{ type: 'portal.pair' }, { type: 'portal.signOut' }]);
});
