// flow/src/replay/schedule.js — turns replayDay()'s beats into a playback
// timeline in seconds, plus the small pure helpers the renderer leans on.
// No DOM and no clock, so all of it runs under `node --test`.

export const TIMING = {
  intro: 2.5,       // the title card
  event: 3,         // a task, moment, rework or purchase, with its text box
  eventLong: 3.6,   // …when its text runs long
  walkNear: 1,      // a walk inside one zone
  walkFar: 2,       // a walk to another zone
  idle: 0.5,        // idle time, fast-forwarded
  finale: 6,        // each finale screen
  maxDay: 110,      // the day (intro to last beat) squeezes to fit this
  minEvent: 1.8,
  minWalk: 0.6,
  minIdle: 0.25,
};

export const EVENT_KINDS = new Set(['done', 'moment', 'rework', 'purchase']);
export const FINALE_SCREENS = ['totals', 'energy', 'time', 'tomorrow'];
export const isEvent = (b) => !!b && EVENT_KINDS.has(b.kind);

/** How long one beat plays for, before any squeezing. */
export function beatDuration(b) {
  if (!b) return 0;
  if (b.kind === 'walk') return b.fromZone && b.toZone && b.fromZone !== b.toZone ? TIMING.walkFar : TIMING.walkNear;
  if (b.kind === 'idle') return TIMING.idle;
  return (b.text || '').length > 56 ? TIMING.eventLong : TIMING.event;
}

const BANNER = [
  [/^batch ×(\d+)/, (m) => `BATCH ×${m[1]}`],
  [/^combo ×(\d+)/, (m) => `COMBO ×${m[1]}`],
  [/^personal best/, () => 'PERSONAL BEST!'],
  [/^in the zone/, () => 'IN THE ZONE'],
  [/^underdog/, () => 'UNDERDOG'],
];

/** The banners a beat raises: combo, batch, personal best… */
export function bannersFor(beat) {
  const out = [];
  for (const tag of beat?.tags || []) {
    for (const [re, fmt] of BANNER) { const m = re.exec(tag); if (m) { out.push(fmt(m)); break; } }
  }
  return out;
}

/** Which sound a beat makes when it starts, if any. */
export function sfxFor(beat) {
  if (!isEvent(beat)) return null;
  if (beat.kind === 'rework') return 'rework';
  if (beat.kind === 'purchase') return 'buy';
  if (beat.kind === 'done') return (beat.tags || []).some((t) => t.startsWith('batch')) ? 'batch' : 'gem';
  return beat.who ? 'chat' : null;
}

/**
 * The playback timeline. Each segment is { type, t0, t1, dur, beat?, index?,
 * hud, banners, sfx, enterZone? }; types are 'intro', 'beat' and 'finale'
 * (with `screen`). `dayEnd` is where the finale starts; `total` is the end.
 */
export function schedule(replay) {
  const beats = Array.isArray(replay?.beats) ? replay.beats : [];
  const durs = beats.map(beatDuration);

  // Squeeze a long day: events first (to minEvent), then walks and idles.
  const sum = (pred) => beats.reduce((n, b, i) => n + (pred(b) ? durs[i] : 0), 0);
  const budget = TIMING.maxDay - TIMING.intro;
  const total = () => durs.reduce((a, b) => a + b, 0);
  if (total() > budget) {
    const ev = sum(isEvent);
    const rest = total() - ev;
    const f = Math.max(TIMING.minEvent / TIMING.event, (budget - rest) / ev);
    beats.forEach((b, i) => { if (isEvent(b)) durs[i] = Math.max(TIMING.minEvent, durs[i] * Math.min(1, f)); });
  }
  if (total() > budget) {
    const ev = sum(isEvent);
    const moves = total() - ev;
    const f = Math.max(0, (budget - ev) / moves);
    beats.forEach((b, i) => {
      if (b.kind === 'walk') durs[i] = Math.max(TIMING.minWalk, durs[i] * f);
      else if (b.kind === 'idle') durs[i] = Math.max(TIMING.minIdle, durs[i] * f);
    });
  }

  // A very full day: the floors above still run long, so scale everything.
  if (total() > budget) {
    const f = budget / total();
    durs.forEach((d, i) => { durs[i] = d * f; });
  }

  const round = (x) => Math.round(x * 1000) / 1000;
  const first = beats.find(isEvent);
  const s0 = replay?.series?.[0] || {};
  let hud = {
    stamina: s0.stamina ?? 10,
    mana: s0.mana ?? 10,
    points: first ? (first.after?.points ?? 0) - (first.points || 0) : 0,
  };
  const segments = [];
  let t = 0;
  segments.push({ type: 'intro', t0: 0, t1: TIMING.intro, dur: TIMING.intro, hud, banners: [], sfx: null });
  t = TIMING.intro;
  let zone = null;
  beats.forEach((b, i) => {
    const dur = round(durs[i]);
    if (isEvent(b) && b.after) hud = { stamina: b.after.stamina, mana: b.after.mana, points: b.after.points };
    const seg = { type: 'beat', index: i, beat: b, t0: round(t), t1: round(t + dur), dur, hud, banners: bannersFor(b), sfx: sfxFor(b) };
    const here = b.kind === 'walk' ? null : b.zone;
    if (here && here !== zone) { seg.enterZone = here; zone = here; }
    segments.push(seg);
    t += dur;
  });
  const dayEnd = round(t);
  FINALE_SCREENS.forEach((screen, k) => {
    segments.push({ type: 'finale', screen, index: k, t0: round(t), t1: round(t + TIMING.finale), dur: TIMING.finale, hud, banners: [], sfx: screen === 'totals' ? 'level' : null });
    t += TIMING.finale;
  });
  return { segments, dayEnd, total: round(t) };
}

/** The segment playing at `t` seconds, and how far into it (p in 0–1, local seconds). */
export function segmentAt(timeline, t) {
  const segs = timeline.segments;
  const x = Math.max(0, Math.min(timeline.total, t));
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= x) lo = mid; else hi = mid - 1;
  }
  const seg = segs[lo];
  const local = Math.max(0, x - seg.t0);
  return { i: lo, seg, local, p: seg.dur > 0 ? Math.min(1, local / seg.dur) : 1 };
}

/** The clock of the day (epoch ms) at a point in the timeline. */
export function clockAt(timeline, at) {
  const { seg, p, i } = at;
  if (seg.type === 'beat') return seg.beat.start + (seg.beat.end - seg.beat.start) * p;
  const beats = timeline.segments.filter((s) => s.type === 'beat');
  if (!beats.length) return null;
  return seg.type === 'intro' || i === 0 ? beats[0].beat.start : beats[beats.length - 1].beat.end;
}

/** Five hearts for 0–10 stamina, in half hearts. */
export function heartsFor(stamina) {
  const halves = Math.max(0, Math.min(10, Math.round(Number(stamina) || 0)));
  return Array.from({ length: 5 }, (_, k) => (halves >= 2 * k + 2 ? 'full' : halves === 2 * k + 1 ? 'half' : 'empty'));
}

/** The hour (0–23, fractional) in the player's own time zone. */
export const hourOf = (ms) => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60; };

export const clockText = (ms) => { if (ms == null || !Number.isFinite(ms)) return '--:--'; const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const HARD_HAT = /^(place_floor|place_warehouse)$/;
const HARD_HAT_NAME = /factory floor|warehouse|^floor$/i;

/** What the hero wears: a hard hat on the factory floor, pyjamas at home late at night. */
export function outfitFor({ place = null, placeName = '', zone = null, at = null } = {}) {
  const hardHat = !!(place && HARD_HAT.test(place)) || HARD_HAT_NAME.test(placeName || '');
  const h = at == null ? 12 : hourOf(at);
  const pyjamas = zone === 'home' && (h >= 21 || h < 5);
  return { hardHat, pyjamas };
}

/** How dark the map is at an hour: 0 by day, up to ~0.55 at night. */
export function nightFor(hour) {
  if (hour == null) return 0;
  if (hour >= 7 && hour < 18) return 0;
  if (hour >= 18 && hour < 21) return ((hour - 18) / 3) * 0.45;
  if (hour >= 21 || hour < 5) return 0.5;
  return ((7 - hour) / 2) * 0.5; // 5–7: dawn
}

export const mmss = (s) => { const x = Math.max(0, Math.floor(s)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };

export const minutesText = (m) => { const n = Math.max(0, Math.round(m)); const h = Math.floor(n / 60); return h ? `${h}h ${String(n % 60).padStart(2, '0')}m` : `${n}m`; };

/** Everything that happened at each place, for the "tap a place" list. */
export function eventsByPlace(replay) {
  const map = new Map();
  for (const b of replay?.beats || []) {
    if (!isEvent(b)) continue;
    const key = b.place ?? null;
    if (!map.has(key)) map.set(key, { id: key, name: b.placeName || 'Somewhere', zone: b.zone || 'elsewhere', beats: [] });
    map.get(key).beats.push(b);
  }
  return map;
}

/** The biggest drains and restores in the energy series, for the finale chart. */
export function energyMarks(series, n = 4) {
  const out = [];
  for (let i = 1; i < (series || []).length; i++) {
    const a = series[i - 1];
    const b = series[i];
    const ds = (b.stamina ?? 0) - (a.stamina ?? 0);
    const dm = (b.mana ?? 0) - (a.mana ?? 0);
    const d = ds + dm;
    if (Math.abs(d) < 0.05) continue;
    out.push({ i, at: b.at, label: b.label || '', stamina: Math.round(ds * 10) / 10, mana: Math.round(dm * 10) / 10, delta: d });
  }
  const drains = out.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, Math.ceil(n / 2) + 1);
  const restores = out.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, Math.floor(n / 2));
  let marks = [...drains, ...restores];
  marks = marks.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, n).sort((a, b) => a.at - b.at);
  return marks;
}
