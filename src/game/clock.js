// flow/src/game/clock.js — one game, two clocks (SPEC.md › Play).
//
//   gameClock('live',   { now })                               Play: the real clock
//   gameClock('replay', { records, day, now, speed = 1, t = 0 }) Replay: the chosen day
//
// Live is the time now, with input on. Replay is the same game in fast
// forward: Day Replay's own timeline (src/replay/schedule.js) over
// replayDay()'s beats, 1× or 2×, skip to the finale, seek anywhere; input is
// off. A replay clock is a value: step/seek/skip/setSpeed return a new one.

import { dayOf, replayDay } from '../model.js';
import { schedule, segmentAt, clockAt, clockText, hourOf, nightFor } from '../replay/schedule.js';

const isNight = (ms) => nightFor(hourOf(ms)) >= 0.45;

export function gameClock(mode, opts = {}) {
  if (mode === 'live') {
    const now = opts.now ?? Date.now();
    return { mode: 'live', input: true, now, at: now, day: dayOf(now), clock: clockText(now), hour: hourOf(now), night: isNight(now), dark: nightFor(hourOf(now)) };
  }
  if (mode !== 'replay') throw new Error(`a clock is live or replay, not "${mode}"`);
  const story = opts.story || replayDay(opts.records || [], opts.day, { now: opts.now ?? Date.now() });
  const timeline = opts.timeline || schedule(story);
  return replayClock(story, timeline, opts.speed, opts.t ?? 0);
}

function replayClock(story, timeline, speed, t) {
  speed = Number(speed) === 2 ? 2 : 1;
  t = Math.max(0, Math.min(timeline.total, Number(t) || 0));
  const here = segmentAt(timeline, t);
  const at = clockAt(timeline, here);
  const seg = here.seg;
  const make = (nt, ns = speed) => replayClock(story, timeline, ns, nt);
  return {
    mode: 'replay', input: false, day: story.day, story, timeline,
    speed, t, duration: timeline.total, dayEnd: timeline.dayEnd,
    segment: seg, p: here.p,
    beat: seg.type === 'beat' ? seg.beat : null,
    intro: seg.type === 'intro',
    finale: seg.type === 'finale' ? seg.screen : null,
    hud: { ...seg.hud },
    at, now: at, clock: clockText(at), hour: at == null ? 12 : hourOf(at), night: at != null && isNight(at), dark: at == null ? 0 : nightFor(hourOf(at)),
    ended: t >= timeline.total,
    step: (dt) => make(t + Math.max(0, dt) * speed),
    seek: (nt) => make(nt),
    skip: () => make(timeline.dayEnd),
    setSpeed: (s) => make(t, s),
  };
}
