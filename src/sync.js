// Flow's records: one store of many small sync-kit records, and the sync that
// carries them between devices. The only module that imports from sync-kit.
//
// Workspace "flow". Definitions (settings, stat, skill, task, reward, place,
// kind, …) are edited in place and last-write-wins; events (done, rework,
// purchase, energy, review, moment, skip, spend, visit) are written once and never edited, so two
// devices can never overwrite each other's history. See src/model.js.
//
// Modelled on project-planner's src/state/sync.js: IndexedDB where there is
// one (localStorage otherwise), the Portal's own origin and session cookie
// when served there, a pasted URL + token anywhere else, a sync every 30 s,
// on focus and shortly after every write.
//
// Planner tasks (SPEC.md › Planner tasks): Project Planner's workspace
// `project` is pulled read-only — through the Portal session, or a pasted
// server URL + token — into a second local store, and never pushed to. Its
// plans become derived tasks in db(), and what was finished or reopened there
// is logged here by plannerEvents (src/planner.js).
//
// Writing to Planner (SPEC.md › Terminal › Writing to Planner): the one
// exception. Flow's operations — `flow.op` records, write-once — are kept in
// the Planner store beside the plans (so a task added here shows at once) and
// pushed to Planner's workspace by pushOps, which sends only this device's
// flow.op records. There is no SyncEngine over the Planner store and no other
// push to it, so Flow can never write a plan (`document`) there.

import {
  SyncEngine, HttpTransport, LocalStore, IndexedDbStore, MemoryStore,
  SYNC_CURSOR_KEYS, publishStatus, onSyncNow,
  portalApp, portalSession, portalRemote, requestPersistentStorage, storageStatus, mergeRecord,
} from '../sync-kit/js/index.js';
import { index, stamp, tombstone, dayOf, RECORD_TYPES, EVENT_TYPES } from './model.js';
import { plannerTasks, plannerEvents, plannerHistory, plannerSinceStamp, expiredOps, plannerDay } from './planner.js';
import { pushOps, opsToWrite, plannerUrlFrom, isOp } from './planops.js';

export const WORKSPACE = 'flow';
export const APP_ID = 'flow';
const SETTINGS_KEY = 'flow.sync';
const DEVICE_KEY = 'flow.deviceId';
const INTERVAL_MS = 30_000;
/** How long after a write it goes to the server. */
const AFTER_WRITE_MS = 1_500;
export const STORE_EXPORT_FORMAT = 'flow.store';
// The model's own list, so a new event type is write-once here the day it exists.
const EVENTS = new Set(EVENT_TYPES);
/** Whether records of this type are events: written once, never edited or deleted. */
export { EVENT_TYPES };
export const isEvent = (type) => EVENTS.has(type);
/** Project Planner's app id and workspace: read, never written. */
export const PLANNER_APP = 'project';
const PLANNER_KEY = 'flow.planner';
const PLANNER_CURSOR = 'planner.cursor.pull';
/** The ids of this device's ops Planner's workspace has taken. */
const OPS_SENT = 'planner.ops.sent';

let recordStore = null;
let engine = null;
let timer = null;
let writeTimer = null;
let portal = null;
let settings = { url: '', token: '', enabled: false };
let lastStatus = { phase: 'idle', lastSyncAt: null, lastError: null, pulled: 0, pushed: 0, label: WORKSPACE };
let persisted = 'unknown';
let plannerStore = null;
let plannerPortal = null;
let plannerSettings = { url: '', token: '' };
let plannerState = { lastPullAt: null, lastError: null, pulling: false };
/** Planner's records, read-only, by id. */
const plannerById = new Map();
/** Flow has synced once this session: until then a covering completion may not be here yet. */
let flowSynced = false;
/** When Planner was first read successfully this session: what settings.plannerSince is stamped with. */
let plannerReadAt = null;

/** Every record this device holds, tombstones included, by id. */
const byId = new Map();
let cachedDb = null;
const listeners = new Set();

const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode, quota */ } };

/** A stable id for this device: the `origin` of every record written here. */
export function deviceId() {
  let id = read(DEVICE_KEY, '');
  if (!id) {
    id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 8);
    write(DEVICE_KEY, id);
  }
  return id;
}

export const getSettings = () => ({ ...settings });
export const inPortal = () => !!portal;
export const syncConfigured = () => !!(portal || (settings.url && settings.enabled));
export const syncStatus = () => (engine ? engine.status : lastStatus);
export const persistence = () => persisted;
export const storeKind = () => recordStore?.name || 'none';

/** Subscribe to changes of the records. Returns the unsubscribe. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function changed(reason) {
  cachedDb = null;
  for (const fn of listeners) { try { fn(reason); } catch (err) { console.warn(err); } }
}

/** All records, tombstones included. */
export const allRecords = () => [...byId.values()];
/** The live records indexed by the model, with the derived Planner tasks. Cached until the next change. */
export function db() {
  if (!cachedDb) {
    const base = index(allRecords());
    const opts = { me: plannerName(base), skills: base.skills, stats: base.stats, now: Date.now() };
    const d = plannerById.size ? plannerTasks(plannerRecords(), opts) : { tasks: [], skills: [] };
    // What Planner laid on today, if it has said. A Planner task that is not
    // on it is not today's work — it is somewhere in a backlog that, on a real
    // planner, runs to hundreds of tasks going back years. It stays in the
    // index so a stored completion keeps its title and skill, and is marked
    // `offToday` so the screens can leave it out. Null means Planner has not
    // published the day, and then nothing is hidden.
    const laid = plannerById.size ? plannerDay(plannerRecords(), dayOf(opts.now), opts) : null;
    if (laid) {
      const on = new Map(laid.map((t) => [t.id, t]));
      d.tasks = d.tasks.map((t) => {
        const row = on.get(t.id);
        return row ? { ...t, laidAt: row.laidAt, laidMinutes: row.laidMinutes } : { ...t, offToday: true };
      });
    }
    // Plans archived since: only the tasks a stored completion points at, so its history keeps its title and skill.
    const h = plannerById.size ? plannerHistory(plannerRecords(), opts) : { tasks: [], skills: [] };
    const logged = new Set(base.done.map((x) => x.task));
    const kept = h.tasks.filter((t) => logged.has(t.id));
    const skills = [...d.skills, ...h.skills.filter((k) => kept.some((t) => t.skill === k.id) && !d.skills.some((x) => x.id === k.id))];
    cachedDb = d.tasks.length || kept.length ? index([...allRecords(), ...skills, ...d.tasks, ...kept]) : base;
  }
  return cachedDb;
}
/** The live records plus the derived Planner definitions, for rebuilding an index with more records. */
export const liveRecords = () => [...allRecords(), ...db().skills.filter((s) => s.derived), ...db().tasks.filter((t) => t.source)];
export const getRecord = (id) => byId.get(id) || null;

/**
 * IndexedDB where there is one, localStorage otherwise, and memory when the
 * page may keep nothing (a sandboxed preview, some private modes): Flow still
 * opens, and `persistence()` reads 'memory' so the page can say nothing is kept.
 */
export async function openStore(name = 'flow') {
  try {
    const idb = new IndexedDbStore({ name });
    await idb.open();
    return idb;
  } catch { /* no IndexedDB here */ }
  try {
    // Opening a LocalStore touches nothing, so ask localStorage itself: in a
    // sandboxed frame merely reading the property throws.
    const ls = globalThis.localStorage;
    ls.setItem('flow.probe', '1');
    ls.removeItem('flow.probe');
    const local = new LocalStore({ prefix: name });
    await local.open();
    return local;
  } catch { /* no localStorage either */ }
  persisted = 'memory';
  const memory = new MemoryStore();
  await memory.open?.();
  return memory;
}

/** A write's clock: now, but always after the version it replaces. */
function clockFor(id) {
  const prev = byId.get(id);
  return Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
}

async function persist(records) {
  await recordStore.put(records);
  for (const r of records) byId.set(r.id, r);
  changed('local');
  scheduleSync();
}

/**
 * Write definitions: new or edited in place. Every record is stamped with
 * `updatedAt` and this device as `origin`.
 */
export async function save(...records) {
  const out = records.flat().map((r) => {
    if (!r?.id || !r?.type) throw new Error('a record needs an id and a type');
    if (EVENTS.has(r.type) && byId.has(r.id)) throw new Error(`${r.type} ${r.id} is an event: written once, never edited`);
    const { updatedAt, origin, deletedAt, ...rest } = r;
    return stamp(rest, { now: clockFor(r.id), device: deviceId() });
  });
  await persist(out);
  return out;
}

/** Write events: write-once, refused when the id already exists. */
export async function add(...events) {
  const list = events.flat();
  for (const e of list) {
    if (!EVENTS.has(e.type)) throw new Error(`${e.type} is not an event`);
    if (byId.has(e.id)) throw new Error(`${e.type} ${e.id} already exists`);
  }
  return save(list);
}

/** Delete a definition by tombstone, so the deletion travels. */
export async function remove(record) {
  const current = byId.get(record.id) || record;
  if (EVENTS.has(current.type)) throw new Error('events are never deleted');
  await persist([tombstone(current, { now: clockFor(current.id), device: deviceId() })]);
}

// ------------------------------------------------------------ export / import

/** Every record, tombstones included: a backup that cannot resurrect a deletion. */
export async function exportStore() {
  const records = recordStore ? await recordStore.all() : allRecords();
  return {
    format: STORE_EXPORT_FORMAT,
    version: 1,
    workspace: WORKSPACE,
    exportedAt: new Date().toISOString(),
    device: deviceId(),
    counts: { total: records.length, live: records.filter((r) => !r.deletedAt).length, deleted: records.filter((r) => r.deletedAt).length },
    records,
  };
}

/**
 * Merge a backup back in by sync's own rule: the newer `updatedAt` wins, ties
 * by origin. Importing never deletes what is here and not in the file.
 * Records are kept as they were, so they are not re-sent as this device's
 * writes unless they are newer than what the server has.
 */
export async function importStore(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { throw new Error('That file is not JSON.'); }
  const records = Array.isArray(doc) ? doc : doc?.records;
  if (!Array.isArray(records) || (doc.format && doc.format !== STORE_EXPORT_FORMAT)) throw new Error('That is not a Flow backup.');
  const take = [];
  let added = 0; let replaced = 0; let kept = 0;
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || typeof r.updatedAt !== 'number') continue;
    if (r.type && !RECORD_TYPES.includes(r.type)) { /* a newer build's type: carried, not read */ }
    const here = byId.get(r.id);
    const newer = !here || r.updatedAt > here.updatedAt || (r.updatedAt === here.updatedAt && String(r.origin ?? '') > String(here.origin ?? ''));
    if (!newer) { kept++; continue; }
    // Re-stamp as this device, one tick later, so the import pushes like any write.
    take.push({ ...r, updatedAt: Math.max(r.updatedAt, (here?.updatedAt ?? 0) + 1, Date.now()), origin: deviceId() });
    if (here) replaced++; else added++;
  }
  if (take.length) await persist(take);
  return { added, replaced, kept };
}

// ------------------------------------------------------------------ sync

async function requestPersistence() {
  try {
    const now = await storageStatus();
    const status = now?.persisted ? now : (now === null ? null : await requestPersistentStorage());
    persisted = status === null ? 'unsupported' : status.persisted ? 'persisted' : 'at-risk';
  } catch { persisted = 'unknown'; }
}

/** Open the store, read every record, work out where to sync. Call once. */
export async function initSync() {
  try { settings = { ...settings, ...JSON.parse(read(SETTINGS_KEY, '{}')) }; } catch { /* defaults */ }
  try { plannerSettings = { ...plannerSettings, ...JSON.parse(read(PLANNER_KEY, '{}')) }; } catch { /* defaults */ }
  if (portalApp() === APP_ID) {
    try {
      const session = await portalSession();
      portal = portalRemote(APP_ID, session);
      plannerPortal = portalRemote(PLANNER_APP, session);
    } catch { portal = null; plannerPortal = null; }
  }
  recordStore = await openStore();
  for (const r of await recordStore.all()) byId.set(r.id, r);
  try {
    plannerStore = await openStore('flow-planner');
    for (const r of await plannerStore.all()) plannerById.set(r.id, r);
  } catch { plannerStore = null; }
  changed('load');
  void requestPersistence();
  if (typeof window !== 'undefined') {
    onSyncNow(() => { void syncNow(); });
    window.addEventListener('focus', () => { if (syncConfigured()) void syncNow(); else void pullPlanner(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && syncConfigured()) void syncNow(); });
  }
  rebuild();
  if (syncConfigured()) void syncNow();
  else void pullPlanner();
  // Planner is read (and Flow's ops sent) on its own clock too: the Terminal may have no Flow sync yet.
  if (typeof window !== 'undefined') {
    setInterval(() => { if (plannerConfigured() && !syncConfigured()) void pullPlanner(); }, INTERVAL_MS);
    window.addEventListener('online', () => { void pullPlanner(); });
  }
}

function rebuild() {
  clearInterval(timer);
  timer = null;
  engine = null;
  let transport = null;
  if (portal) transport = new HttpTransport({ baseUrl: portal.baseUrl, label: portal.workspace, onUnauthorized });
  else if (settings.url) transport = new HttpTransport({ baseUrl: settings.url, token: settings.token, label: WORKSPACE });
  if (recordStore && transport) {
    engine = new SyncEngine(recordStore, transport, deviceId());
    if (syncConfigured()) timer = setInterval(() => { void syncNow(); }, INTERVAL_MS);
  }
  announce();
}

function onUnauthorized() {
  document.querySelector('sc-portal-bar')?.refresh?.();
}

function announce() {
  lastStatus = engine ? { ...engine.status } : { ...lastStatus, label: syncConfigured() ? WORKSPACE : 'this device' };
  publishStatus(lastStatus);
}

function scheduleSync() {
  if (!syncConfigured()) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => { void syncNow(); }, AFTER_WRITE_MS);
}

/** Save new settings and restart. A changed URL clears the cursors: they belong to the old server. */
export async function applySettings(next) {
  const url = (next.url || '').trim().replace(/\/+$/, '');
  const urlChanged = url !== settings.url;
  settings = { url, token: (next.token || '').trim(), enabled: !!next.enabled };
  write(SETTINGS_KEY, JSON.stringify(settings));
  if (urlChanged && recordStore) for (const key of SYNC_CURSOR_KEYS) await recordStore.setMeta(key, 0);
  if (settings.enabled) void requestPersistence();
  rebuild();
  if (syncConfigured()) await syncNow();
}

let running = null;
/** One sync, now. Failures are reported through the status, never thrown. */
export async function syncNow() {
  if (!engine || !syncConfigured()) { announce(); return null; }
  if (running) return running;
  running = (async () => {
    try {
      const result = await engine.sync();
      if (result.applied.length) {
        for (const r of result.applied) byId.set(r.id, r);
        changed('remote');
      }
      flowSynced = true;
      void pullPlanner();
      return result;
    } catch {
      return null;
    } finally {
      lastStatus = { ...engine.status };
      running = null;
    }
  })();
  return running;
}

// ------------------------------------------------------------------ planner
//
// Read-only both ways: records only ever come in from Planner's workspace, and
// nothing in this store is sent anywhere. Flow's own writes for Planner tasks
// (the done and rework records) go into Flow's store like any other event.

export const plannerRecords = () => [...plannerById.values()];
export const plannerSettingsNow = () => ({ ...plannerSettings });
export const plannerInPortal = () => !!plannerPortal;
/** Paired with the Portal (a bare origin, as shell-kit's pairing gives): Planner's workspace is on it too. */
const pairedPlannerUrl = () => (/^https?:\/\/[^/]+\/?$/.test(settings.url || '') ? plannerUrlFrom(settings.url) : '');
export const plannerConfigured = () => !!(plannerPortal || plannerSettings.url || pairedPlannerUrl());
/** The player's name in Planner: Settings, else the player's name. */
export const plannerName = (base = db()) => base.settings.plannerName || base.settings.name || '';

export function plannerStatus() {
  const live = plannerRecords().filter((r) => !r.deletedAt && r.type === 'document' && r.format === 'project-planner');
  return { ...plannerState, configured: plannerConfigured(), portal: !!plannerPortal, plans: live.length, since: db().settings.plannerSince ?? null, tasks: db().tasks.filter((t) => t.source?.app === PLANNER_APP && !t.archived).length };
}

function plannerTransport() {
  if (plannerPortal) return new HttpTransport({ baseUrl: plannerPortal.baseUrl, label: plannerPortal.workspace, onUnauthorized });
  if (plannerSettings.url) return new HttpTransport({ baseUrl: plannerSettings.url, token: plannerSettings.token || settings.token, label: PLANNER_APP });
  // Paired with the Portal (the iPhone app): Planner's workspace on the same Portal, same device token.
  const derived = pairedPlannerUrl();
  if (derived) return new HttpTransport({ baseUrl: derived, token: settings.token, label: PLANNER_APP });
  return null;
}

/** Save where Planner's workspace is, off the Portal. A changed URL starts reading from scratch. */
export async function applyPlannerSettings(next) {
  const url = (next.url || '').trim().replace(/\/+$/, '');
  if (url !== plannerSettings.url && plannerStore) await plannerStore.setMeta(PLANNER_CURSOR, 0);
  plannerSettings = { url, token: (next.token || '').trim() };
  write(PLANNER_KEY, JSON.stringify(plannerSettings));
  if (plannerConfigured()) await pullPlanner();
  else changed('planner');
}

let pulling = null;
/** Pull Planner's workspace (never push), then log what was finished or reopened there. */
export async function pullPlanner() {
  const transport = plannerTransport();
  if (!transport || !plannerStore) { await autoLog(); return null; }
  if (pulling) return pulling;
  plannerState = { ...plannerState, pulling: true };
  pulling = (async () => {
    try {
      // Flow's ops go first, so what Planner applied comes back in the same read.
      try { await pushPlannerOps(transport); } catch (err) { plannerState = { ...plannerState, lastError: err?.message || String(err) }; }
      const applied = [];
      for (let page = 0; page < 20; page++) {
        const since = (await plannerStore.meta(PLANNER_CURSOR)) ?? 0;
        const { records, cursor } = await transport.pull({ since, deviceId: deviceId() });
        const won = records.filter((r) => { const here = plannerById.get(r.id); return mergeRecord(here, r) === r && (!here || here.updatedAt !== r.updatedAt); });
        if (won.length) { await plannerStore.put(won); for (const r of won) plannerById.set(r.id, r); applied.push(...won); }
        await plannerStore.setMeta(PLANNER_CURSOR, cursor);
        if (records.length < 1000) break; // a full page means there is more
      }
      plannerState = { ...plannerState, lastPullAt: Date.now(), lastError: null };
      plannerReadAt ??= plannerState.lastPullAt;
      if (applied.length) changed('planner');
      await autoLog();
      return applied.length;
    } catch (err) {
      plannerState = { ...plannerState, lastError: err?.message || String(err) };
      return null;
    } finally {
      plannerState = { ...plannerState, pulling: false };
      pulling = null;
    }
  })();
  return pulling;
}

/** The fix-minutes questions for tasks reopened in Planner with no hours logged there. */
export function plannerAsks(now = Date.now()) {
  if (!plannerById.size) return [];
  return plannerEvents(db(), plannerRecords(), { me: plannerName(), now, since: db().settings.plannerSince }).ask;
}

/**
 * Stamp settings.plannerSince at the first successful read (SPEC.md › From
 * when), then write the completions and rework Planner implies. Their ids are the same on
 * every device, so two devices noticing one finish write one record. With
 * sync on, it waits for Flow's first sync: a covering completion from another
 * device might not be here yet.
 */
async function autoLog() {
  // Settings are last-write-wins: stamp only once Flow's own copy is here, or it could overwrite them.
  if (syncConfigured() && !flowSynced) return;
  const stamp = plannerSinceStamp(getRecord('settings'), plannerReadAt);
  if (stamp) await save(stamp);
  if (!plannerById.size) return;
  const out = plannerEvents(db(), plannerRecords(), { me: plannerName(), now: Date.now(), since: db().settings.plannerSince });
  const fresh = [...out.done, ...out.rework].filter((r) => !byId.has(r.id));
  if (fresh.length) await add(fresh);
}

// ------------------------------------------------------------ writing to Planner

/**
 * Write operations for Planner (addTask, timesheet): write-once, stamped as
 * this device, kept beside the plans so they show at once, and sent to
 * Planner's workspace as soon as it can be reached. Offline they wait.
 */
export async function addOps(...ops) {
  if (!plannerStore) throw new Error('Flow cannot keep Planner changes on this device.');
  const list = opsToWrite(plannerById, ops.flat().filter(Boolean)).map((op) => {
    const { updatedAt, origin, deletedAt, ...rest } = op;
    return stamp(rest, { now: Math.max(Date.now(), op.at || 0), device: deviceId() });
  });
  if (!list.length) return [];
  await plannerStore.put(list);
  for (const r of list) plannerById.set(r.id, r);
  changed('planner');
  setTimeout(() => { void pullPlanner(); }, 300);
  return list;
}

let pushingOps = null;
/** Send this device's unsent ops, and only ops: pushOps never sends anything else. */
async function pushPlannerOps(transport = plannerTransport()) {
  if (!transport || !plannerStore) return 0;
  if (pushingOps) return pushingOps;
  pushingOps = (async () => {
    const sent = new Set((await plannerStore.meta(OPS_SENT)) || []);
    const ids = await pushOps(plannerRecords(), transport, { deviceId: deviceId(), sent });
    if (ids.length) {
      for (const id of ids) sent.add(id);
      // Remember only what is still held: the list never grows past the ops themselves.
      await plannerStore.setMeta(OPS_SENT, [...sent].filter((id) => plannerById.has(id)));
      changed('planner');
    }
    return ids.length;
  })();
  try { return await pushingOps; } finally { pushingOps = null; }
}

/** How many of this device's ops are still waiting to reach Planner's workspace. */
export async function opsWaiting() {
  if (!plannerStore) return 0;
  const sent = new Set((await plannerStore.meta(OPS_SENT)) || []);
  return plannerRecords().filter((r) => isOp(r) && r.origin === deviceId() && !sent.has(r.id)).length;
}

/** addTask ops Planner will never apply now (older than 90 days, still not in the plan). */
export const plannerExpired = (now = Date.now()) => expiredOps(plannerRecords(), { now });
