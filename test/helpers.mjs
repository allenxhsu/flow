// Shared fixtures for the model tests. Every instant is a fixed local time,
// never the real clock, so the tests mean the same thing on any day.

import { index, makeTask, makeDone, makeEnergy, makeMoment, makeRework, makePurchase, makeReward } from '../src/model.js';

export const T = (s) => new Date(s).getTime();

/** Three skills under the default stats. */
export const baseRecords = () => [
  { id: 'sk_run', type: 'skill', name: 'Run', stat: 'stat_body', place: 'place_gym' },
  { id: 'sk_mail', type: 'skill', name: 'Mail', stat: 'stat_work', place: 'place_desk' },
  { id: 'sk_read', type: 'skill', name: 'Read', stat: 'stat_mind', place: null },
];

/** A little world that grows as events are written through the real constructors. */
export function game(records = baseRecords()) {
  const g = {
    records,
    db: () => index(g.records),
    add: (...rs) => { g.records.push(...rs); return rs[0]; },
    task: (fields) => g.add(makeTask(g.db(), fields, { now: T('2026-09-01T00:00:00') })),
    done: (task, end, minutes, opts = {}) => g.add(makeDone(g.db(), task, { end: T(end), minutes, ...opts })),
    energy: (at, stamina, mana) => g.add(makeEnergy({ at: T(at), stamina, mana })),
    moment: (kind, start, end, opts = {}) => g.add(makeMoment(g.db(), kind, { start: T(start), end: T(end), ...opts })),
    rework: (done, at, minutes) => g.add(makeRework(g.db(), done.id ?? done, { at: T(at), minutes })),
    reward: (fields) => g.add({ ...makeReward({ now: T('2026-09-01T00:00:00'), ...fields }), ...(fields.id ? { id: fields.id } : {}) }),
    buy: (reward, at) => g.add(makePurchase(g.db(), reward.id ?? reward, { at: T(at) })),
    /** A bare completion that just carries XP, for setting a skill's level. */
    seed: (task, day, points) => g.add({
      id: `done_seed_${task}_${day}_${points}`, type: 'done', task, day,
      start: T(`${day}T06:00:00`), end: T(`${day}T07:00:00`), minutes: 60, measure: 'time', value: 60, quality: 1,
      price: { points, base: points, energy: {} },
    }),
  };
  return g;
}

/** HH:MM:00 on a day, `minutes` after 09:00. */
export const at9 = (day, minutes) => { const m = 9 * 60 + minutes; return `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`; };

export const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
