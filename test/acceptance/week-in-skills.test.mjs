// SPEC.md › Streaks, reviews, achievements › The week in skills: the week
// grouped by the skill sets it went into, longest first, with the week before
// beside it. Written from the spec and the public API only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekInSkills, isoWeek } from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const MON = '2026-09-21';        // Monday
const WED = '2026-09-23';
const LAST_WED = '2026-09-16';   // the week before
const SUN = '2026-09-27';

/** Mail (Work) twice this week, Run (Body) once, and Mail once last week. */
function week() {
  const g = game();
  const mail = g.task({ id: 'task_mail', title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 30 });
  const pr = g.task({ id: 'task_pr', title: 'Purchase request', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 20 });
  const run = g.task({ id: 'task_run', title: 'Run 5k', skill: 'sk_run', measure: 'time', cadence: 'daily', estimate: 30 });
  g.done(mail, `${LAST_WED}T10:00:00`, 60);
  g.done(mail, `${MON}T10:00:00`, 30);
  g.done(pr, `${WED}T10:00:00`, 20);
  g.done(run, `${WED}T18:00:00`, 45);
  return { g, mail, pr, run };
}

test('the week is grouped by skill, and it is this ISO week', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  assert.equal(w.week, isoWeek(SUN));
  assert.deepEqual(w.skills.map((k) => k.name).sort(), ['Mail', 'Run']);
});

test('longest first means minutes, and the minutes are the true ones', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  const byName = Object.fromEntries(w.skills.map((k) => [k.name, k]));
  assert.equal(byName.Mail.minutes, 50, '30 + 20');
  assert.equal(byName.Run.minutes, 45);
  assert.deepEqual(w.skills.map((k) => k.name), ['Mail', 'Run']);
  assert.equal(w.minutes, 95);
});

test('a skill carries its runs, its points and its share of the week', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  const mail = w.skills.find((k) => k.name === 'Mail');
  assert.equal(mail.runs, 2);
  assert.ok(mail.points > 0);
  assert.equal(Math.round(mail.share * 100), Math.round((50 / 95) * 100));
  assert.equal(mail.stat, 'stat_work');
});

test('the tasks inside a skill are grouped and counted, biggest first', () => {
  const { g, mail } = week();
  const w = weekInSkills(g.db(), SUN);
  const k = w.skills.find((x) => x.name === 'Mail');
  assert.deepEqual(k.tasks.map((t) => [t.title, t.runs, t.minutes]), [['Mail', 1, 30], ['Purchase request', 1, 20]]);
  g.done(mail, `${WED}T14:00:00`, 15);
  const again = weekInSkills(g.db(), SUN).skills.find((x) => x.name === 'Mail');
  assert.deepEqual(again.tasks.find((t) => t.title === 'Mail'), { id: 'task_mail', title: 'Mail', runs: 2, minutes: 45, points: again.tasks.find((t) => t.title === 'Mail').points });
});

test('the week before sits beside it, as a change in minutes', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  const mail = w.skills.find((k) => k.name === 'Mail');
  assert.equal(mail.prior.minutes, 60, 'last week');
  assert.equal(mail.change, 50 - 60);
  const run = w.skills.find((k) => k.name === 'Run');
  assert.equal(run.prior.minutes, 0);
  assert.equal(run.change, 45, 'picked up this week');
});

test('skills roll up into their stats', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  const byName = Object.fromEntries(w.stats.map((s) => [s.name, s]));
  assert.equal(byName.Work.minutes, 50);
  assert.equal(byName.Body.minutes, 45);
  assert.ok(!('Mind' in byName), 'a stat with no work this week is not a row');
  assert.deepEqual(w.stats.map((s) => s.name), ['Work', 'Body'], 'longest first here too');
});

test('a skill with no work this week is not a row', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  assert.ok(!w.skills.some((k) => k.name === 'Read'));
});

test('rework minutes belong to the skill they were spent on', () => {
  const { g, mail } = week();
  const done = g.db().done.find((d) => d.task === 'task_mail' && d.day === MON);
  g.rework(done, `${WED}T09:00:00`, 20);
  const w = weekInSkills(g.db(), SUN);
  const k = w.skills.find((x) => x.name === 'Mail');
  assert.equal(k.minutes, 70, 'the 30-minute run really cost 50');
  assert.equal(k.rework.count, 1);
  assert.equal(k.rework.minutes, 20);
});

test('moments are not work and are not counted', () => {
  const { g } = week();
  g.moment('kind_rest', `${WED}T12:00:00`, `${WED}T13:00:00`);
  const w = weekInSkills(g.db(), SUN);
  assert.equal(w.minutes, 95);
});

test('a week with nothing in it is an empty week, not a throw', () => {
  const g = game();
  const w = weekInSkills(g.db(), SUN);
  assert.deepEqual(w.skills, []);
  assert.deepEqual(w.stats, []);
  assert.equal(w.minutes, 0);
  assert.equal(w.days, 0);
});

test('the week counts the days worked, for a read of how it was spread', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  assert.equal(w.days, 2, 'Monday and Wednesday');
});

test('any day of the week gives that week', () => {
  const { g } = week();
  for (const d of [MON, WED, SUN]) assert.equal(weekInSkills(g.db(), d).week, isoWeek(SUN));
  assert.equal(weekInSkills(g.db(), LAST_WED).minutes, 60);
});

// ─── what needs improving, not only where the time went ────────────────────

test('a skill carries its rework share: where the week went wrong, not just where it went', () => {
  const { g } = week();
  const done = g.db().done.find((d) => d.task === 'task_mail' && d.day === MON);
  g.rework(done, `${WED}T09:00:00`, 20);
  const k = weekInSkills(g.db(), SUN).skills.find((x) => x.name === 'Mail');
  assert.equal(Math.round(k.reworkShare * 100), Math.round((20 / 70) * 100), 'fix minutes over true minutes');
  const run = weekInSkills(g.db(), SUN).skills.find((x) => x.name === 'Run');
  assert.equal(run.reworkShare, 0);
});

test('the skills not worked this week are listed with how long since they were', () => {
  const { g } = week();
  const w = weekInSkills(g.db(), SUN);
  const cold = w.untouched.find((k) => k.name === 'Read');
  assert.ok(cold, 'a skill with no work at all is still something to be aware of');
  assert.equal(cold.days, null, 'never worked');
  const g2 = week().g;
  g2.done('task_mail', `${LAST_WED}T10:00:00`, 10);
  assert.ok(weekInSkills(g2.db(), SUN).untouched.every((k) => k.name !== 'Mail'), 'worked this week, so not untouched');
});

test('untouched is longest-cold first, so the top of that list is the one to notice', () => {
  const g = game();
  g.task({ id: 't_a', title: 'A', skill: 'sk_mail', estimate: 10 });
  g.task({ id: 't_b', title: 'B', skill: 'sk_read', estimate: 10 });
  g.task({ id: 't_c', title: 'C', skill: 'sk_run', estimate: 10 });
  g.done('t_a', '2026-09-01T10:00:00', 10);   // coldest
  g.done('t_b', '2026-09-10T10:00:00', 10);
  g.done('t_c', `${WED}T10:00:00`, 10);       // this week
  const w = weekInSkills(g.db(), SUN);
  assert.deepEqual(w.untouched.map((k) => k.name), ['Mail', 'Read']);
  assert.ok(w.untouched[0].days > w.untouched[1].days);
});

// ─── Toil: the share that belongs to no skill (SPEC.md › Most tasks…) ──────
import { weekToil } from '../../src/model.js';

test('the week reports the share of itself that belongs to no skill', () => {
  const g = game();
  g.task({ id: 'task_mail', title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 30 });
  g.add({ id: 'task_reimb', type: 'task', title: 'Reimbursement', measure: 'time', cadence: 'anytime', estimate: 20, skill: null, stamina: 0, mana: 0 });
  g.done('task_mail', `${MON}T10:00:00`, 60);
  const w = weekToil(g.db(), SUN);
  assert.equal(w.total, 60);
  assert.equal(w.minutes, 0, 'everything this week had a skill');
  assert.equal(w.share, 0);
});

test('a completion whose task has no skill is Toil', () => {
  const g = game();
  g.add({ id: 'task_reimb', type: 'task', title: 'Reimbursement', measure: 'time', cadence: 'anytime', estimate: 20, skill: null, stamina: 0, mana: 0 });
  g.task({ id: 'task_mail', title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 30 });
  g.done('task_mail', `${MON}T10:00:00`, 60);
  g.add({ id: 'done_toil', type: 'done', task: 'task_reimb', day: WED, start: T(`${WED}T10:00:00`) - 24e5,
    end: T(`${WED}T10:00:00`), minutes: 40, measure: 'time', value: 40, quality: 1, price: { points: 40, energy: {} } });
  const w = weekToil(g.db(), SUN);
  assert.equal(w.total, 100);
  assert.equal(w.minutes, 40);
  assert.equal(w.share, 0.4);
});

test('Toil is not in the skill rows, and the skill rows are not in Toil', () => {
  const g = game();
  g.add({ id: 'task_reimb', type: 'task', title: 'Reimbursement', measure: 'time', cadence: 'anytime', estimate: 20, skill: null, stamina: 0, mana: 0 });
  g.add({ id: 'done_toil', type: 'done', task: 'task_reimb', day: WED, start: T(`${WED}T10:00:00`) - 24e5,
    end: T(`${WED}T10:00:00`), minutes: 40, measure: 'time', value: 40, quality: 1, price: { points: 40, energy: {} } });
  const w = weekInSkills(g.db(), SUN);
  assert.deepEqual(w.skills, [], 'a skill-less completion makes no skill row');
  assert.equal(weekToil(g.db(), SUN).minutes, 40);
});

test('an empty week has no Toil rather than dividing by zero', () => {
  const w = weekToil(game().db(), SUN);
  assert.equal(w.share, 0);
  assert.equal(w.total, 0);
});
