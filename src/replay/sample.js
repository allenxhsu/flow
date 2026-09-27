// flow/src/replay/sample.js — a sample factory workday built with the real
// rules in model.js, for the demo page (replay.html) and the tests. Every
// timestamp is fixed (local time), never the real clock.

import * as M from '../model.js';

export const SAMPLE_DAY = '2026-09-24';

/** Local time on a day in September 2026. */
const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime();

export function sampleRecords() {
  const records = [];
  const db = () => M.index(records);
  const add = (r) => { records.push(r); return r; };
  const t0 = at(10, 9);

  add({ id: 'settings', type: 'settings', name: 'Allen', mission: 'Get faster and better.', hero: { hair: '#4a2c1a', skin: '#efbf8f', shirt: '#2f7f6c', trousers: '#34406a' } });

  const skill = (name, stat, place) => add(M.makeSkill(db(), { name, stat, place, now: t0 }));
  const ops = skill('Operations', 'stat_work', 'place_floor');
  const buying = skill('Purchasing', 'stat_work', 'place_desk');
  const reporting = skill('Reporting', 'stat_mind', 'place_desk');
  const logistics = skill('Logistics', 'stat_craft', 'place_warehouse');
  const people = skill('Meetings', 'stat_bonds', 'place_meeting');

  const task = (fields) => add(M.makeTask(db(), fields, { now: t0 }));
  const safety = task({ title: 'Line safety check', skill: ops.id, estimate: 18, stamina: 1, mana: 0.5, cadence: 'daily' });
  const report = task({ title: 'Weekly production report', skill: reporting.id, estimate: 45, mana: 2, cadence: 'weekly' });
  const quote = task({ title: 'Supplier quote summary', skill: buying.id, estimate: 30, mana: 1.5, cadence: 'once', forOthers: true });
  const prs = ['PR: safety gloves', 'PR: pallet wrap', 'PR: drill bits', 'PR: label printer'].map((title) => task({ title, skill: buying.id, estimate: 10, mana: 1, cadence: 'once', batch: 'purchase request' }));
  const standup = task({ title: 'QA stand-up', skill: people.id, estimate: 30, mana: 1, cadence: 'daily' });
  const count = task({ title: 'Cycle count, aisle 4', skill: logistics.id, estimate: 60, stamina: 2, mana: 1, cadence: 'weekly' });
  const emails = task({ title: 'Supplier emails', skill: buying.id, estimate: 40, mana: 2, cadence: 'daily' });
  task({ title: 'Monthly inventory report', skill: reporting.id, estimate: 60, mana: 3, cadence: 'once', deadline: '2026-09-25' });
  const treat = add(M.makeReward({ title: 'Ice cream', price: 40, now: t0 }));

  // A little history, so today can beat a personal best.
  for (const [d, min] of [[21, 19], [22, 18], [23, 17]]) {
    add(M.makeDone(db(), safety.id, { end: at(d, 8, 50), minutes: min }));
    add(M.makeDone(db(), emails.id, { end: at(d, 15, 0), minutes: 42 }));
  }
  const quoteDone = add(M.makeDone(db(), quote.id, { end: at(23, 11, 0), minutes: 30 }));

  // The day.
  const D = 24;
  const moment = (kind, h1, m1, h2, m2, extra = {}) => add(M.makeMoment(db(), kind, { start: at(D, h1, m1), end: at(D, h2, m2), ...extra }));
  const done = (t, h, m, minutes) => add(M.makeDone(db(), t.id, { end: at(D, h, m), minutes }));

  add(M.makeEnergy({ stamina: 8, mana: 7, at: at(D, 6, 40) }));
  moment('kind_meal', 6, 50, 7, 10);
  moment('kind_drive', 7, 20, 7, 55);
  moment('kind_walk', 8, 0, 8, 30);
  done(safety, 8, 45, 14);
  moment('kind_chat', 8, 50, 9, 5, { who: 'Whitney' });
  done(report, 10, 0, 50);
  done(prs[0], 10, 10, 9);
  done(prs[1], 10, 18, 7);
  done(prs[2], 10, 25, 6);
  done(prs[3], 10, 33, 7);
  add(M.makeRework(db(), quoteDone.id, { minutes: 20, at: at(D, 11, 0), note: 'Wrong currency on two lines' }));
  done(standup, 11, 40, 30);
  moment('kind_meal', 12, 0, 12, 40, { place: 'place_restaurant' });
  done(count, 14, 10, 70);
  done(emails, 15, 20, 38);
  moment('kind_drive', 16, 30, 17, 5);
  moment('kind_laundry', 18, 0, 18, 40);
  moment('kind_meal', 19, 0, 19, 35);
  add(M.makePurchase(db(), treat.id, { at: at(D, 20, 30) }));
  moment('kind_rest', 21, 15, 22, 0);
  return records;
}

export function sampleReplay() {
  return M.replayDay(sampleRecords(), SAMPLE_DAY, { now: at(24, 23, 0) });
}
