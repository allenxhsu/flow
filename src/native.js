// Flow on the iPhone (SPEC.md › iOS app): the page's half of what Swift adds.
// The web code stays the product; the shell (shell-kit's iOS ShellScene, the
// app in ios/) only does what a page cannot — the Lock Screen timer, the
// widget, arrive / leave at places, Apple Health — and this module is the one
// place the two meet. Everything degrades: with no shell (a browser, Node) or
// a permission refused, every call is a no-op and the page works as it does
// anywhere else.
//
// Page → app (post)                          App → page (event)
//   flow.timer      { state, task, start }     flow.visit            { id, place, arrive, leave }
//   flow.snapshot   { stamina, mana, points,   flow.health           { day, sleepHours, steps }
//                     level, next, at }        flow.geofence.status  { authorized, places: [{ id, set }] }
//   flow.geofence.set   { place: { id, name } } open                 { url }  flow://done?task=&minutes=
//   flow.geofence.clear { place: { id, name } }                               flow://start?task=
//   flow.geofence.list  {}
//   flow.health.request {}
//   flow.visits.ack     { ids }
//
// Coordinates never cross this bridge: the shell keeps them on the device and
// the page only ever sees place ids. Health numbers are held in memory for
// the morning rating's suggestion and never written. See docs/API.md.

import * as realHost from './host.js';
import { makeVisit, autoDrive } from './model.js';

export const HANDLER = 'flow';
export const TO_APP = {
  timer: 'flow.timer', snapshot: 'flow.snapshot', geofenceSet: 'flow.geofence.set', geofenceClear: 'flow.geofence.clear',
  geofenceList: 'flow.geofence.list', healthRequest: 'flow.health.request', visitsAck: 'flow.visits.ack',
};
export const TO_PAGE = { visit: 'flow.visit', health: 'flow.health', geofenceStatus: 'flow.geofence.status', open: 'open' };

/** What the widget shows, from play(): it never computes a rule itself. */
export function snapshotOf(g) {
  const n = g.next?.next || null;
  const task = n && (g.tasks.find((t) => t.id === n.task) || null);
  return {
    stamina: g.energy.rated ? g.energy.stamina : null,
    mana: g.energy.rated ? g.energy.mana : null,
    points: g.balance,
    level: g.player.level,
    next: n ? { id: n.task, title: n.title, estimate: task?.estimate ?? null } : null,
    at: g.now,
  };
}

/**
 * flow://done?task=<id>&minutes=<n> → { action: 'done', task, minutes|null };
 * flow://start?task=<id> → { action: 'start', task }; anything else → null.
 */
export function parseDeepLink(url) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return null; }
  if (u.protocol !== 'flow:') return null;
  const action = (u.hostname || u.pathname.replace(/^\/+/, '')).split('/')[0];
  const task = u.searchParams.get('task');
  if (!task) return null;
  if (action === 'start') return { action, task };
  if (action === 'done') {
    const m = Math.round(Number(u.searchParams.get('minutes')));
    return { action, task, minutes: Number.isFinite(m) && m >= 1 ? m : null };
  }
  return null;
}

/** The Live Activity's message: a running timer's task and start, or stopped. */
export function timerMessage(db, timer) {
  if (!timer) return { type: TO_APP.timer, state: 'stopped', task: null, start: null };
  const t = db.task.get(timer.task);
  const placeId = t?.place || db.skill.get(t?.skill)?.place || null;
  return {
    type: TO_APP.timer, state: 'running',
    task: { id: timer.task, title: t?.title || 'A task', place: (placeId && db.place.get(placeId)?.name) || null },
    start: timer.start,
  };
}

/**
 * The records one flow.visit event implies, through the model: the visit when
 * the stay has ended, and the Drive moment its arrival implies. Records
 * already written are left out; an event that can never be written (a place
 * removed since) gives nothing.
 */
export function visitRecords(db, event) {
  const place = typeof event?.place === 'object' && event.place ? event.place.id : event?.place;
  const arrive = Number.isFinite(event?.arrive) ? event.arrive : null;
  const leave = Number.isFinite(event?.leave) ? event.leave : null;
  if (!place || !db.place.has(place)) return [];
  const out = [];
  if (leave != null) {
    let v;
    try { v = makeVisit(db, { place, arrive, leave }); } catch { return []; }
    if (!db.visits.some((x) => x.id === v.id)) out.push(v);
  }
  if (arrive != null) {
    const drive = autoDrive(db, { place, arrive });
    if (drive && !db.moments.some((m) => m.id === drive.id)) out.push(drive);
  }
  return out;
}

const placeRef = (p) => ({ id: p.id, name: p.name });

/**
 * The bridge. `store` is src/sync.js (db, add); `onChange` re-renders when
 * the shell reports something the views show; `onOpen` gets a parsed deep
 * link; `onRemote` gets the Portal's { url, token } from pairing.
 */
export function createNative({ host = realHost, store, onChange = () => {}, onOpen = () => {}, onRemote = () => {}, log = console.warn } = {}) {
  const hosted = !!host.hosted;
  const platform = hosted ? host.platform || null : null;
  const state = { health: null, geofence: null };
  let lastTimer;
  let lastSnapshot;
  let queue = Promise.resolve();
  const post = (m) => { if (hosted) host.post(m); };

  async function onVisit(e) {
    let records;
    try { records = visitRecords(store.db(), e); } catch (err) { log(err); return; }
    try {
      if (records.length) await store.add(records);
    } catch (err) { log(err); return; } // not acked: the shell keeps it and sends it again
    if (e.id != null) post({ type: TO_APP.visitsAck, ids: [e.id] });
  }

  function event(e) {
    if (!e || typeof e !== 'object') return Promise.resolve();
    switch (e.type) {
      case TO_PAGE.visit:
        queue = queue.then(() => onVisit(e));
        return queue;
      case TO_PAGE.health:
        state.health = { day: e.day ?? null, sleepHours: e.sleepHours ?? null, steps: e.steps ?? null };
        onChange('health');
        break;
      case TO_PAGE.geofenceStatus:
        state.geofence = { authorized: !!e.authorized, places: Array.isArray(e.places) ? e.places.map((p) => ({ id: p.id, set: !!p.set })) : [] };
        onChange('geofence');
        break;
      case TO_PAGE.open: {
        const link = parseDeepLink(e.url);
        if (link) onOpen(link);
        break;
      }
      default:
    }
    return Promise.resolve();
  }

  return {
    hosted, platform, state,
    /** Hand the shell the page's callbacks; on the iPhone, ask for what it knows. */
    init() {
      if (!hosted) return false;
      const ok = host.initHost({
        name: HANDLER, load: () => {}, command: () => {}, saved: () => {},
        remote: (r) => onRemote({ url: r?.url || '', token: r?.token || '' }),
        event,
      });
      if (ok && platform === 'ios') {
        post({ type: TO_APP.geofenceList });
        post({ type: TO_APP.healthRequest });
      }
      return !!ok;
    },
    /** The device timer (`flow.timer` in localStorage) as it is now: posted when it changes. */
    timer(db, timer) {
      if (!hosted) return;
      const key = timer ? `${timer.task}@${timer.start}` : '';
      if (key === lastTimer) return;
      lastTimer = key;
      post(timerMessage(db, timer));
    },
    /** The widget's numbers: posted when they change, not on every render. */
    snapshot(g) {
      if (!hosted) return;
      const s = snapshotOf(g);
      const { at, ...rest } = s;
      const key = JSON.stringify(rest);
      if (key === lastSnapshot) return;
      lastSnapshot = key;
      post({ type: TO_APP.snapshot, ...s });
    },
    setGeofence(place) { post({ type: TO_APP.geofenceSet, place: placeRef(place) }); },
    clearGeofence(place) { post({ type: TO_APP.geofenceClear, place: placeRef(place) }); },
    listGeofences() { post({ type: TO_APP.geofenceList }); },
    requestHealth() { post({ type: TO_APP.healthRequest }); },
    /** shell-kit's Portal pairing: sign in (the shell calls remote back) and sign out. */
    pair(origin = '') { post(origin ? { type: 'portal.pair', origin } : { type: 'portal.pair' }); },
    signOut() { post({ type: 'portal.signOut' }); },
    event,
  };
}
