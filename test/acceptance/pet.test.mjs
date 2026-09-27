// Acceptance: "Feed the pet" — decided with the player. A daily moment at the
// pet's cage in the home office (the sunroom): it restores a little mana, earns
// no points, is reminded about while today's is not done, and keeps a streak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const feed = (g, day, from = '07:00', to = '07:15') =>
  g.add(M.makeMoment(g.db(), 'kind_pet', { start: T(`${day}T${from}:00`), end: T(`${day}T${to}:00`) }));

test('the home office is a place at home', () => {
  const office = M.DEFAULT_PLACES.find((p) => p.id === 'place_office');
  assert.ok(office, 'place_office');
  assert.equal(office.zone, 'home');
});

test('Feed the pet is a daily moment kind at the home office that restores mana', () => {
  const k = M.DEFAULT_KINDS.find((x) => x.id === 'kind_pet');
  assert.ok(k, 'kind_pet');
  assert.equal(k.title, 'Feed the pet');
  assert.equal(k.daily, true);
  assert.equal(k.place, 'place_office');
  assert.ok(k.manaPerHour < 0, 'restores mana');
  assert.ok((k.staminaPerHour || 0) <= 0, 'costs no stamina');
});

test('15 minutes of feeding restores 0.5 mana and earns no points', () => {
  const g = game();
  g.add(M.makeEnergy({ stamina: 6, mana: 4, at: T(`${D}T06:30:00`) }));
  const before = M.balanceOf(g.db());
  const m = feed(g, D);
  assert.equal(m.energy.mana, -0.5);
  assert.equal(m.place, 'place_office');
  assert.equal(M.balanceOf(g.db()), before, 'no points');
  assert.equal(M.energyOn(g.db(), D).mana, 4.5);
});

test('play() lists daily moments: not done → reminder; done today → done', () => {
  const g = game();
  let pet = M.play(g.records, T(`${D}T08:00:00`)).dailyMoments.find((x) => x.kind === 'kind_pet');
  assert.ok(pet, 'kind_pet listed');
  assert.equal(pet.title, 'Feed the pet');
  assert.equal(pet.doneToday, false);
  feed(g, D);
  pet = M.play(g.records, T(`${D}T08:00:00`)).dailyMoments.find((x) => x.kind === 'kind_pet');
  assert.equal(pet.doneToday, true);
});

test('feeding keeps a daily streak, forgiving one missed day a week like task streaks', () => {
  const g = game();
  for (const day of ['2026-09-24', '2026-09-25', '2026-09-27', '2026-09-28']) feed(g, day); // missed the 26th
  const pet = M.play(g.records, T(`${D}T20:00:00`)).dailyMoments.find((x) => x.kind === 'kind_pet');
  assert.equal(pet.streak, 4);
  const tomorrow = M.play(g.records, T('2026-09-29T08:00:00')).dailyMoments.find((x) => x.kind === 'kind_pet');
  assert.equal(tomorrow.doneToday, false);
  assert.equal(tomorrow.atRisk, true, 'not yet fed today — the streak is at risk, not broken');
});

test('the replay tells it at the home office', () => {
  const g = game();
  feed(g, D);
  const beat = M.replayDay(g.records, D, { now: T(`${D}T22:00:00`) }).beats.find((b) => b.kind === 'moment');
  assert.equal(beat.place, 'place_office');
  assert.match(beat.text, /Feed the pet/);
  assert.equal(beat.points, 0);
});
