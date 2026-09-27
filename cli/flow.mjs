#!/usr/bin/env node
// flow.mjs — Flow from the terminal, and the /flow skill's only way to touch the game.
//
//   flow init --name "Allen" [--mission "…"] [--stats "Body,Mind,Craft,Work,Bonds"]
//   flow status [--json]                     level, balance, energy, next, streaks, review due
//   flow next [--json]                       the next task, why, and the alternatives
//   flow energy <stamina> <mana> [--at HH:MM]   this morning's rating, 0–10 each
//   flow done <task> --minutes N [--value V] [--quality 0-100] [--at HH:MM|ISO | --start HH:MM] [--day YYYY-MM-DD] [--note "…"]
//   flow rework <task|done-id> --minutes N [--at …] [--note "…"]   (the task's latest completion by default)
//   flow moment <kind> --from HH:MM --to HH:MM [--who X] [--place P] [--day YYYY-MM-DD] [--note "…"]
//   flow buy <reward> [--at …]
//   flow undo [event-id|last]               take back a mistaken entry (ids are in flow log)
//   flow reward add --title "…" --price N [--once] | edit <reward> [--title …] [--price N] | archive <reward>
//   flow task add --title "…" --skill S [--measure time|count|quality] [--cadence daily|weekly|once|anytime]
//             [--estimate MIN] [--stamina N] [--mana N] [--deadline YYYY-MM-DD] [--place P] [--batch TYPE]
//             [--unit U] [--better less|more] [--critical] [--for-others]
//   flow task edit <task> [same fields; --deadline none, --batch none, --place none, --no-critical, --no-for-others]
//   flow task archive|restore <task>
//   flow skill add --name "…" --stat S [--place P] | edit <skill> [--name …] [--stat S] [--place P|none]
//   flow stat add --name "…" [--icon ✦] | rename <stat> --name "…" [--icon …] | remove <stat> [--to <stat>]
//   flow place add --name "…" [--zone home|road|factory|town|elsewhere]
//   flow kind add --title "…" [--icon …] [--place P] [--stamina N] [--mana N]   (energy per hour; negative restores)
//   flow review --satisfaction N [--<stat> N …] [--win "…"] [--lesson "…"] [--next "…"]
//             [--difficulty <tier>] [--skill-difficulty <skill>=<tier> …]   (from the next day)
//   flow difficulty [--json]                 the tier now, per-skill overrides, what is unlocked and next
//   flow log [--days 7]
//   flow replay [--day YYYY-MM-DD]
//   flow list [tasks|skills|stats|rewards|places|kinds]
//   flow sync
//   flow config [--url https://…/w/flow --token …] [--device NAME] [--clear]
//   flow export [file] | import <file> [--restamp]
//
// <task>, <skill>, <stat>, <reward>, <kind> and <place> are an id, a title or
// any unambiguous fragment. Every rule is src/model.js — the same file the app
// runs. Data: $FLOW_HOME (default ~/.flow): flow.db (SQLite, via sync-kit's
// FileStore) and config.json. --offline skips sync; FLOW_NOW fixes the clock.

// node:sqlite prints an experimental warning on every run; nobody using a CLI needs it.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  if (String(warning?.message ?? warning).includes('SQLite')) return;
  return emitWarning.call(process, warning, ...rest);
};

import { realpathSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as M from '../src/model.js';
import { FileStore } from '../sync-kit/js/stores/file.js';
import { HttpTransport } from '../sync-kit/js/http.js';
import { SyncEngine, SYNC_CURSOR_KEYS } from '../sync-kit/js/engine.js';
import { mergeRecord } from '../sync-kit/js/store.js';

const {
  index, play, pickNext, replayDay, makeTask, makeSkill, makePlace, makeReward, makeDone, makeRework, makePurchase,
  makeEnergy, makeMoment, makeReview, stamp, tombstone, newId, dayOf, addDays, isDay, taskStats, levelFor,
  RECORD_TYPES, DEFAULT_STATS, DEFAULT_PLACES, DEFAULT_KINDS, ZONES, BONUS_CAP, SKILL_STEP, WEEK,
  DIFFICULTY, DEFAULT_DIFFICULTY, difficultyOn,
} = M;

// ─── plumbing ───────────────────────────────────────────────────────────────

const BOOL = new Set(['json', 'critical', 'for-others', 'no-critical', 'no-for-others', 'once', 'repeatable', 'restamp', 'offline', 'clear', 'help']);
/** Flags that may be given more than once; they collect into an array. */
const REPEAT = new Set(['skill-difficulty']);

export function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--') || a === '--') { pos.push(a); continue; }
    let key = a.slice(2);
    let value;
    const eq = key.indexOf('=');
    if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
    else if (BOOL.has(key)) value = true;
    else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) value = true;
      else { value = next; i++; }
    }
    if (REPEAT.has(key)) (opt[key] ||= []).push(value);
    else opt[key] = value;
  }
  return { pos, opt };
}

const HOME = () => process.env.FLOW_HOME || join(homedir(), '.flow');
const CONFIG = () => join(HOME(), 'config.json');

function clock() {
  const v = process.env.FLOW_NOW;
  if (!v) return Date.now();
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(n)) throw new Error(`FLOW_NOW is not a time: "${v}"`);
  return n;
}

function readConfig() {
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(CONFIG(), 'utf8')); } catch { /* first run */ }
  if (!cfg.deviceId) {
    cfg.deviceId = `cli-${hostname().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${randomUUID().slice(0, 6)}`;
    writeConfig(cfg);
  }
  return cfg;
}

function writeConfig(cfg) {
  mkdirSync(HOME(), { recursive: true });
  const tmp = `${CONFIG()}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, CONFIG());
  try { chmodSync(CONFIG(), 0o600); } catch { /* not every filesystem */ }
}

const str = (v) => (typeof v === 'string' ? v : '');
const num = (v, what) => {
  const n = Number(v);
  if (v === undefined || v === true || v === '' || !Number.isFinite(n)) throw new Error(`${what} must be a number`);
  return n;
};
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pad = (n) => String(n).padStart(2, '0');
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (x) => `${Math.round(x * 100)}%`;
const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? pad(Math.round(min % 60)) : ''}` : `${Math.round(min)}m`);

/** A time: "HH:MM" on `day` (today by default), a full ISO string, or epoch ms. */
export function parseWhen(value, day) {
  if (value === undefined || value === true) return null;
  const s = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    if (Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`"${s}" is not a time of day`);
    return new Date(`${day}T${pad(m[1])}:${m[2]}:00`).getTime();
  }
  if (/^\d{10,}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new Error(`"${s}" is not a time — use HH:MM or an ISO date-time`);
  return t;
}

/** Find one item by id, exact name, or an unambiguous fragment of either. */
export function resolve(list, ref, what, label = (x) => x.title ?? x.name ?? x.id) {
  if (ref === undefined || ref === true || ref === '') throw new Error(`which ${what}? Give an id, a title or a fragment`);
  const q = String(ref).toLowerCase().trim();
  const byId = list.find((x) => x.id.toLowerCase() === q);
  if (byId) return byId;
  const exact = list.filter((x) => label(x).toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const s = slug(q);
  const frag = list.filter((x) => label(x).toLowerCase().includes(q) || x.id.toLowerCase().includes(q) || (s && slug(label(x)).includes(s)));
  if (frag.length === 1) return frag[0];
  if (!frag.length) throw new Error(`no ${what} matches "${ref}"`);
  throw new Error(`"${ref}" matches ${frag.length} ${what}s: ${frag.map(label).join(', ')} — be more specific`);
}

const statLabel = (s) => s.name;
function resolveStat(db, ref) {
  const q = String(ref ?? '').toLowerCase();
  return db.stats.find((s) => s.id === `stat_${q}` || slug(s.name) === slug(q)) || resolve(db.stats, ref, 'stat', statLabel);
}

// ─── difficulty ─────────────────────────────────────────────────────────────

const tierById = (id) => DIFFICULTY.find((d) => d.id === id);
/** "double" for 2×, otherwise "N×": what the part of a charge below zero costs. */
const debtWord = (x) => (x === 2 ? 'double' : `${x}×`);

/** A tier by id or name, any case. An unknown word goes on to the model, which names the tiers it knows. */
function tierRef(ref, flag) {
  if (ref === undefined || ref === true || String(ref).trim() === '') throw new Error(`${flag} needs a tier: ${DIFFICULTY.map((d) => d.id).join(', ')}`);
  const q = String(ref).trim().toLowerCase();
  return DIFFICULTY.find((d) => d.id === q || d.name.toLowerCase() === q)?.id ?? q;
}

/**
 * The review's `difficulty` from --difficulty and any --skill-difficulty
 * <skill>=<tier>, or null when neither is given (the setting carries on).
 * Only per-skill flags: the global tier stays what it is about to be.
 */
export function difficultyArg(db, opt, at) {
  const pairs = opt['skill-difficulty'] || [];
  if (opt.difficulty === undefined && !pairs.length) return null;
  const skills = {};
  for (const pair of pairs) {
    const m = typeof pair === 'string' ? /^([^=]+)=(.+)$/.exec(pair) : null;
    if (!m || !m[1].trim()) throw new Error('--skill-difficulty is <skill>=<tier>, e.g. --skill-difficulty mail=steady');
    skills[resolve(db.skills, m[1].trim(), 'skill').id] = tierRef(m[2], '--skill-difficulty');
  }
  const tier = opt.difficulty === undefined ? difficultyOn(db, addDays(dayOf(at), 1)).id : tierRef(opt.difficulty, '--difficulty');
  return { tier, skills };
}

/** "Grind · Mail Steady · Running Relentless". */
function settingText(db, { tier, skills = {} }, sep = ' ') {
  const over = Object.entries(skills)
    .map(([id, t]) => [db.skill.get(id)?.name || id, tierById(t)?.name || t])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return [tierById(tier)?.name || tier, ...over.map(([n, t]) => `${n}${sep}${t}`)].join(' · ');
}

/** A review today that sets difficulty takes effect tomorrow: that setting, or null. */
function pendingDifficulty(db, day) {
  const today = db.reviews.filter((r) => r.day === day && r.difficulty).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).pop();
  return today ? today.difficulty : null;
}

function difficultyText(db, g) {
  const d = g.difficulty;
  const out = [];
  const over = Object.keys(d.skills).length;
  out.push(`Now: ${d.name} (global)${over ? '' : ' · every skill plays at the global tier'}`);
  if (over) out.push(`Per-skill: ${settingText(db, { tier: d.tier, skills: d.skills }, ': ').split(' · ').slice(1).join(' · ')}`);
  const pending = pendingDifficulty(db, g.day);
  if (pending) out.push(`From ${addDays(g.day, 1)}: ${settingText(db, pending)}`);
  out.push(`Unlocked: ${d.unlocked.map((id) => tierById(id).name).join(', ')} (you are level ${g.player.level}; a skill's override needs that skill's level)`);
  out.push(d.next ? `Next: ${d.next.name} at level ${d.next.unlock}` : 'Next: none — every tier is unlocked');
  out.push('Difficulty changes only at the weekly review: flow review … --difficulty <tier> [--skill-difficulty <skill>=<tier> …]. It starts the next day.');
  out.push('', `  ${'Tier'.padEnd(11)} ${'Unlocks'.padEnd(8)} ${'Points'.padEnd(7)} ${'Target'.padEnd(7)} ${'Rework'.padEnd(7)} ${'Debt'.padEnd(5)} ${'Energy'.padEnd(7)} Grace`);
  for (const t of DIFFICULTY) {
    const add = t.reworkAdd === 0 ? '0' : `${t.reworkAdd > 0 ? '+' : '−'}${Math.abs(t.reworkAdd)}`;
    const mark = t.id === d.tier ? '▶' : ' ';
    const lock = d.unlocked.includes(t.id) || t.id === d.tier ? '' : '  (locked)';
    out.push(`${mark} ${t.name.padEnd(11)} ${`L${t.unlock}`.padEnd(8)} ${`×${t.points}`.padEnd(7)} ${pct(t.targetStep).padEnd(7)} ${add.padEnd(7)} ${`×${t.debt}`.padEnd(5)} ${`×${t.energy}`.padEnd(7)} ${t.grace}/7${lock}`);
  }
  out.push('', 'Harder tiers: harder targets, bigger rewards, less forgiveness, tighter energy. Points already earned never change.');
  return out.join('\n');
}

// ─── the game on disk ───────────────────────────────────────────────────────

class Game {
  constructor(opt) {
    this.opt = opt;
    this.now = clock();
    this.config = readConfig();
    this.device = this.config.deviceId;
    this.syncNote = null;
  }

  async open() {
    mkdirSync(HOME(), { recursive: true });
    this.store = new FileStore({ path: join(HOME(), 'flow.db') });
    await this.store.open();
    return this;
  }

  async close() { await this.store?.close(); }

  get online() { return !!this.config.url && !this.opt.offline && !process.env.FLOW_OFFLINE; }

  async sync({ loud = false } = {}) {
    if (!this.online) return null;
    const engine = new SyncEngine(this.store, new HttpTransport({ baseUrl: this.config.url, token: this.config.token, label: 'flow' }), this.device);
    const total = { pulled: 0, pushed: 0 };
    try {
      for (let i = 0; i < 20; i++) {
        const r = await engine.sync();
        total.pulled += r.pulled;
        total.pushed += r.pushed;
        if (r.pulled < 1000) break; // a full page means there is more
      }
      await this.store.setMeta('flow.lastSyncAt', Date.now());
      return total;
    } catch (err) {
      const why = err.code === 'unauthorized' ? 'the token was refused — run: flow config --token <new token>' : err.message;
      this.syncNote = `sync failed (${why}); working offline, will retry next time`;
      if (loud) throw new Error(this.syncNote);
      console.error(`flow: ${this.syncNote}`);
      return null;
    }
  }

  async load() {
    this.raw = (await this.store.all()).filter((r) => r && RECORD_TYPES.includes(r.type));
    this.db = index(this.raw);
    return this.db;
  }

  /** Stamp and store records, then reload. */
  async write(...records) {
    const at = Date.now();
    await this.store.put(records.map((r) => stamp(r, { now: at, device: this.device })));
    return this.load();
  }

  async remove(record) {
    await this.store.put([tombstone(record, { now: Date.now(), device: this.device })]);
    return this.load();
  }

  /**
   * The model falls back to default stats, places and kinds while none are
   * stored. Adding the first custom one would hide the defaults, so write
   * them out first, with their fixed ids, so anything pointing at them stays valid.
   */
  async materialize(type) {
    if (this.raw.some((r) => r.type === type && !r.deletedAt)) return;
    const defaults = { stat: DEFAULT_STATS.map((s, i) => ({ ...s, order: i })), place: DEFAULT_PLACES, kind: DEFAULT_KINDS }[type];
    await this.write(...defaults.map((d) => ({ ...d, type })));
  }

  get day() { return typeof this.opt.day === 'string' ? this.opt.day : dayOf(this.now); }
  when(key, fallback = this.now) { return parseWhen(this.opt[key], this.day) ?? fallback; }
  play(now = this.now) { return play(this.db, now); }
}

// ─── views ──────────────────────────────────────────────────────────────────

const bar = (into, span, width = 10) => {
  const n = span ? Math.max(0, Math.min(width, Math.round((into / span) * width))) : 0;
  return '█'.repeat(n) + '░'.repeat(width - n);
};

/** Things the model does not name but a check-in needs: tasks that keep slipping or coming back. */
export function struggling(db, g) {
  const out = [];
  const from = addDays(g.day, -(WEEK - 1));
  const month = addDays(g.day, -27);
  for (const t of g.tasks) {
    if (t.archived) continue;
    if (t.cadence === 'daily' && t.created && t.created <= addDays(g.day, -WEEK)) {
      const days = new Set(db.done.filter((d) => d.task === t.id && d.day >= from).map((d) => d.day)).size;
      if (days <= 3) out.push({ task: t.id, title: t.title, reason: 'slipping', detail: `done ${days}/7 days — shrink it or change when it happens` });
    }
    const rw = db.rework.filter((r) => r.task === t.id && r.day >= month);
    if (rw.length >= 2) out.push({ task: t.id, title: t.title, reason: 'rework', detail: `reworked ${rw.length}× in 4 weeks (${rw.reduce((n, r) => n + r.minutes, 0)} min) — add a check step or estimate more` });
  }
  return out;
}

const energyLine = (e) => (e.rated ? `stamina ${e.stamina}/10 · mana ${e.mana}/10${e.empty.length ? `  ⚠ ${e.empty.join(' and ')} empty — rest or free tasks only` : ''}` : 'not rated today — flow energy <stamina> <mana>');

function nextLines(db, n) {
  const out = [];
  if (n.next) {
    const c = n.next.cost;
    const cost = c.stamina || c.mana ? ` · costs ${r1(c.stamina)} stamina, ${r1(c.mana)} mana` : '';
    out.push(`→ ${n.next.title}${n.next.why.length ? ` (${n.next.why.join(', ')})` : ''}${cost}`);
    if (n.next.batch && n.next.batch.length > 1) out.push(`  Batch: ${n.next.batch.length} × ${db.task.get(n.next.task)?.batch} — ${n.next.batch.map((id) => db.task.get(id)?.title).join(' · ')}`);
    if (n.alternatives.length) out.push(`  or: ${n.alternatives.map((a) => a.title + (a.why.length ? ` (${a.why.join(', ')})` : '')).join(' · ')}`);
  } else out.push(n.exhausted ? '→ Energy is empty: rest, eat, or call it a day.' : '→ Nothing open. Add a task, or enjoy the free time.');
  for (const q of n.queued) out.push(`  waiting to batch: ${q.batch} ${q.waiting}/${q.need}`);
  return out;
}

function statusText(game, g) {
  const { db } = game;
  const out = [];
  const name = g.settings.name || 'Player';
  out.push(`# ${name} — level ${g.player.level}  (${g.player.xp} XP, ${g.player.toNext} to level ${g.player.level + 1}) · balance ${g.balance} pts${g.balance < 0 ? ` (in debt: charges below zero cost ${debtWord(tierById(g.difficulty.tier).debt)})` : ''}`);
  if (g.settings.mission) out.push(`Mission: ${g.settings.mission}`);
  out.push(`Difficulty: ${settingText(db, g.difficulty)}`);
  out.push(`${g.day} (${g.week}) · today +${g.today.points} pts, ${g.today.done} task${g.today.done === 1 ? '' : 's'}, ${dur(g.today.minutes)}`);
  out.push(`Energy: ${energyLine(g.energy)}`);
  const windows = [];
  if (g.batch) windows.push(`Batch ${g.batch.name} ×${g.batch.index + 1} — next one within ${g.batch.minutesLeft} min keeps it going`);
  else if (g.combo.index > 0 || g.combo.minutesLeft > 0) windows.push(`Combo ×${g.combo.index + 1} — start the next task within ${g.combo.minutesLeft} min`);
  if (windows.length) out.push(windows.join(' · '));

  out.push('', '## Next', ...nextLines(db, g.next));

  out.push('', '## Stats');
  for (const s of g.stats) {
    out.push(`${s.icon || '·'} ${s.name.padEnd(8)} L${String(s.level).padEnd(3)} ${bar(s.into, s.span)} ${s.into}/${s.span}  last 7d ${s.lastWeek} pts${s.underdog ? '  ← underdog today: +50%' : ''}`);
    const sk = g.skills.filter((k) => k.stat === s.id);
    if (sk.length) out.push(`    ${sk.map((k) => `${k.name} L${k.level} (${k.toNext} to go, energy ×${k.energyFactor})`).join(' · ')}`);
  }

  const active = g.tasks.filter((t) => !t.archived);
  out.push('', '## Tasks');
  if (!active.length) out.push('(none yet — flow task add --title … --skill …)');
  for (const t of active) {
    const bits = [t.cadence, t.measure === 'time' ? `~${t.estimate} min` : `${t.measure}, ~${t.estimate} min`];
    if (t.target !== null) bits.push(`target ${t.target}${t.measure === 'time' ? ' min' : t.unit ? ` ${t.unit}` : ''}`);
    if (t.best !== null) bits.push(`best ${t.best}`);
    if (t.batch) bits.push(`batch ${t.batch}`);
    if (t.deadline) bits.push(`${t.overdue ? 'OVERDUE ' : 'due '}${t.deadline}`);
    if (t.critical) bits.push('critical');
    const streak = t.streak ? `  streak ${t.streak}${t.cadence === 'weekly' ? 'w' : 'd'}${t.atRisk ? ' (at risk)' : ''}` : '';
    const skill = db.skill.get(t.skill)?.name || '?';
    out.push(`- [${t.doneNow ? 'x' : ' '}] ${t.title} — ${skill} (${bits.join(', ')})${streak}${t.reworks ? `  ↺${t.reworks}` : ''}`);
  }

  const atRisk = active.filter((t) => t.atRisk);
  if (atRisk.length) out.push('', `Streaks at risk: ${atRisk.map((t) => `${t.title} (${t.streak}${t.cadence === 'weekly' ? 'w' : 'd'})`).join(' · ')} — one rest day a week is free`);
  const hard = struggling(db, g);
  if (hard.length) {
    out.push('', '## Struggling — change the task, not the player');
    for (const s of hard) out.push(`- ${s.title}: ${s.detail}`);
  }

  if (g.rewards.length) out.push('', `## Shop: ${g.rewards.map((r) => `${r.title} ${r.price}${r.affordable ? '' : ' (not yet)'}${r.repeatable ? '' : ' one-off'}`).join(' · ')}`);

  const sat = g.satisfaction;
  out.push('', '## Life satisfaction');
  if (sat.latest) out.push(`Latest ${sat.latest.week}: ${sat.latest.satisfaction}/10${sat.trend === null ? '' : `  (${sat.trend >= 0 ? '+' : ''}${sat.trend.toFixed(1)} vs the weeks before)`}`);
  else out.push('No weekly review yet.');
  if (sat.due) out.push('Weekly review is DUE.');

  const earned = g.achievements.filter((a) => a.earned);
  out.push('', `## Achievements ${earned.length}/${g.achievements.length}`, earned.length ? earned.map((a) => a.title).join(' · ') : '(none yet)');
  return out.join('\n');
}

function bonusText(price) {
  const b = price.bonuses;
  const parts = [];
  if (b.flow) parts.push(`flow +${pct(b.flow)}`);
  if (b.pb) parts.push(`PB +${pct(b.pb)}`);
  if (b.underdog) parts.push(`underdog +${pct(b.underdog)}`);
  if (b.batch) parts.push(`batch ×${price.batchIndex + 1} +${pct(b.batch)}`);
  if (b.combo) parts.push(`combo ×${price.comboIndex + 1} +${pct(b.combo)}`);
  const sum = 1 + Object.values(b).reduce((a, x) => a + x, 0);
  return parts.length ? ` × ${price.multiplier} (${parts.join(', ')}${sum > BONUS_CAP ? `; capped at ${BONUS_CAP}×` : ''})` : '';
}

function levelUps(before, after) {
  const out = [];
  if (after.player.level > before.player.level) out.push(`★ LEVEL UP → ${after.player.level}`);
  if (after.player.level < before.player.level) out.push(`▼ level down → ${after.player.level}`);
  for (const s of after.stats) {
    const was = before.stats.find((x) => x.id === s.id);
    if (was && s.level > was.level) out.push(`★ ${s.name} reached level ${s.level}`);
    if (was && s.level < was.level) out.push(`▼ ${s.name} back to level ${s.level}`);
  }
  for (const s of after.skills) {
    const was = before.skills.find((x) => x.id === s.id);
    if (was && s.level > was.level) out.push(`★ ${s.name} skill level ${s.level} — its tasks now cost ×${s.energyFactor} energy`);
    if (was && s.level < was.level) out.push(`▼ ${s.name} skill back to level ${s.level}`);
  }
  for (const a of after.achievements) if (a.earned && !before.achievements.find((x) => x.id === a.id)?.earned) out.push(`🏅 ${a.title} — ${a.text}`);
  return out;
}

function logText(db, day, days) {
  const from = addDays(day, -(days - 1));
  const rows = [];
  const title = (id) => db.task.get(id)?.title || '(deleted task)';
  for (const d of db.done) if (d.day >= from && d.day <= day) {
    const b = d.price?.bonuses || {};
    const tags = [b.batch ? `batch ×${d.batchIndex + 1}` : b.combo ? `combo ×${d.comboIndex + 1}` : '', b.flow ? 'flow' : '', b.pb ? 'PB' : '', b.underdog ? 'underdog' : ''].filter(Boolean);
    const value = d.measure === 'time' ? '' : ` ${d.value}${d.measure === 'quality' ? '%' : ''}`;
    rows.push([d.day, d.end, `${hm(d.start)}–${hm(d.end)} ✓ ${title(d.task)} ${d.minutes}m${value}${d.quality < 1 && d.measure !== 'quality' ? ` q${pct(d.quality)}` : ''}  +${d.price?.points || 0}${tags.length ? ` (${tags.join(', ')})` : ''}${d.note ? ` — ${d.note}` : ''}  [${d.id}]`]);
  }
  for (const r of db.rework) if (r.day >= from && r.day <= day) rows.push([r.day, r.at, `${hm(r.at)}       ↺ rework ${title(r.task)} ${r.minutes}m  −${r.penalty} XP, −${r.charged} pts (×${r.multiplier}, #${r.repeat})${r.note ? ` — ${r.note}` : ''}`]);
  for (const m of db.moments) if (m.day >= from && m.day <= day) rows.push([m.day, m.end, `${hm(m.start)}–${hm(m.end)} ◷ ${m.title}${m.who ? ` with ${m.who}` : ''} at ${db.place.get(m.place)?.name || '—'}`]);
  for (const p of db.purchases) if (p.day >= from && p.day <= day) rows.push([p.day, p.at, `${hm(p.at)}       🛒 ${db.reward.get(p.reward)?.title || '(deleted reward)'} −${p.charged}${p.charged > p.price ? ' (on credit)' : ''}`]);
  for (const e of db.energy) if (e.day >= from && e.day <= day) rows.push([e.day, e.at, `${hm(e.at)}       ⚡ energy: stamina ${e.stamina}, mana ${e.mana}`]);
  for (const v of db.reviews) if (v.day >= from && v.day <= day) rows.push([v.day, v.at, `${hm(v.at)}       ✎ review ${v.week}: satisfaction ${v.satisfaction}/10${v.next ? ` · next: ${v.next}` : ''}`]);
  if (!rows.length) return `Nothing logged since ${from}.`;
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  const out = [];
  let last = null;
  for (const [d, , text] of rows) {
    if (d !== last) { out.push(`${out.length ? '\n' : ''}${d}`); last = d; }
    out.push(`  ${text}`);
  }
  return out.join('\n');
}

function replayText(db, day, now) {
  const r = replayDay(db, day, { now });
  const out = [`Day Replay — ${day}`];
  if (r.start) out.push(`${hm(r.start.at)}  Morning: stamina ${r.start.stamina} · mana ${r.start.mana}`);
  if (!r.beats.length) out.push('(nothing happened on this day, as far as Flow knows)');
  let arrived = null;
  for (const b of r.beats) {
    if (b.kind === 'walk') { out.push(`${hm(b.start)}  … walk ${b.text}`); arrived = b.to; continue; }
    // After a walk you wait where you arrived, whatever the idle beat says.
    if (b.kind === 'idle') { out.push(`${hm(b.start)}  … ${dur((b.end - b.start) / 60000)} at ${db.place.get(arrived || b.place)?.name || 'somewhere'}`); arrived = null; continue; }
    arrived = null;
    const a = b.after;
    const span = b.end > b.start ? `${hm(b.start)}–${hm(b.end)}` : hm(b.start);
    out.push(`${span}  [${b.placeName}] ${b.text}   ♥${r1(a.stamina)} ✦${r1(a.mana)} ◆${a.points}`);
  }
  const f = r.finale;
  out.push('', '— Finale —');
  out.push(`+${f.points} pts earned${f.spent ? `, ${f.spent} spent` : ''} · ${f.tasks} task${f.tasks === 1 ? '' : 's'}, ${f.moments} moment${f.moments === 1 ? '' : 's'}${f.reworks ? `, ${f.reworks} rework` : ''}${f.bestCombo > 1 ? ` · best combo ×${f.bestCombo}` : ''}${f.bestBatch ? ` · best batch ×${f.bestBatch}` : ''}`);
  out.push(`Level ${f.level} · balance ${f.balance}`);
  if (f.zones.length || f.travel || f.idle) out.push(`Where time went: ${[...f.zones.map((z) => `${z.zone} ${dur(z.minutes)}`), f.travel ? `travel ${dur(f.travel)}` : '', f.idle ? `between things ${dur(f.idle)}` : ''].filter(Boolean).join(' · ')}`);
  if (r.series.length > 1) {
    const first = r.series[0];
    const lastS = r.series[r.series.length - 1];
    const steps = r.series.slice(1).map((s, i) => ({ label: s.label, ds: r1(s.stamina - r.series[i].stamina), dm: r1(s.mana - r.series[i].mana) }));
    const drain = [...steps].sort((a, b) => a.ds + a.dm - (b.ds + b.dm))[0];
    const lift = [...steps].sort((a, b) => b.ds + b.dm - (a.ds + a.dm))[0];
    const sign = (x) => (x > 0 ? `+${x}` : `${x}`);
    out.push(`Energy: ${r1(first.stamina)}/${r1(first.mana)} → ${r1(lastS.stamina)}/${r1(lastS.mana)} (stamina/mana)${drain && drain.ds + drain.dm < 0 ? ` · biggest drain: ${drain.label} (${sign(drain.ds)}/${sign(drain.dm)})` : ''}${lift && lift.ds + lift.dm > 0 ? ` · best restore: ${lift.label} (${sign(lift.ds)}/${sign(lift.dm)})` : ''}`);
  }
  if (f.tomorrow) out.push(`Tomorrow: ${f.tomorrow.title}${f.tomorrow.why.length ? ` (${f.tomorrow.why.join(', ')})` : ''}`);
  out.push('', 'The pixel version is the Day Replay in the Flow app.');
  return out.join('\n');
}

// ─── commands ───────────────────────────────────────────────────────────────

function taskFields(game, o, { editing = false } = {}) {
  const { db } = game;
  const f = {};
  for (const k of ['title', 'measure', 'cadence', 'unit', 'better']) if (typeof o[k] === 'string') f[k] = o[k];
  for (const k of ['estimate', 'stamina', 'mana']) if (o[k] !== undefined) f[k] = num(o[k], k);
  if (o.skill !== undefined) f.skill = resolve(db.skills, o.skill, 'skill').id;
  for (const k of ['deadline', 'batch', 'place']) {
    if (o[k] === undefined) continue;
    if (o[k] === 'none' || o[k] === '' || o[k] === true) { f[k] = null; continue; }
    f[k] = k === 'place' ? resolve(db.places, o[k], 'place').id : String(o[k]);
  }
  if (o.critical) f.critical = true;
  if (o['no-critical']) f.critical = false;
  if (o['for-others']) f.forOthers = true;
  if (o['no-for-others']) f.forOthers = false;
  if (!editing && f.skill === undefined) throw new Error('a task needs --skill (flow list skills)');
  return f;
}

const describeTask = (db, t) => {
  const bits = [t.cadence, t.measure, `~${t.estimate} min`];
  if (t.stamina || t.mana) bits.push(`stamina ${t.stamina}, mana ${t.mana}`);
  if (t.batch) bits.push(`batch ${t.batch}`);
  if (t.deadline) bits.push(`due ${t.deadline}`);
  if (M.isCritical(t)) bits.push('critical');
  const place = db.place.get(M.placeOfTask(db, t))?.name;
  if (place) bits.push(`at ${place}`);
  return `${t.title} — ${db.skill.get(t.skill)?.name} (${bits.join(', ')}) [${t.id}]`;
};

const commands = {
  async init(game) {
    const { opt } = game;
    const db = await game.load();
    const existing = db.settings.id === 'settings';
    const settings = { ...db.settings, id: 'settings', type: 'settings' };
    if (typeof opt.name === 'string') settings.name = opt.name;
    if (typeof opt.mission === 'string') settings.mission = opt.mission;
    if (!settings.created) settings.created = dayOf(game.now);
    await game.write(settings);
    const out = [`${existing ? 'Updated' : 'Started'} Flow for ${settings.name}${settings.mission ? ` — ${settings.mission}` : ''}`];
    if (typeof opt.stats === 'string') {
      if (game.raw.some((r) => r.type === 'stat' && !r.deletedAt)) throw new Error('stats are already set — use flow stat add | rename | remove');
      const names = opt.stats.split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length < 1) throw new Error('--stats is a comma-separated list, e.g. "Body,Mind,Craft,Work,Bonds"');
      const icons = new Map(DEFAULT_STATS.map((s) => [s.name.toLowerCase(), s.icon]));
      await game.write(...names.map((name, i) => ({ id: `stat_${slug(name) || i}`, type: 'stat', name, icon: icons.get(name.toLowerCase()) || '✦', order: i })));
      out.push(`Stats: ${names.join(', ')}`);
    } else out.push(`Stats: ${game.db.stats.map((s) => s.name).join(', ')}`);
    return out.join('\n');
  },

  async status(game) {
    await game.load();
    const g = game.play();
    if (game.opt.json) {
      const lastSyncAt = await game.store.meta('flow.lastSyncAt');
      return JSON.stringify({ ...g, struggling: struggling(game.db, g), atRisk: g.tasks.filter((t) => !t.archived && t.atRisk).map((t) => t.id), setup: game.db.settings.id === 'settings', sync: { configured: !!game.config.url, url: game.config.url || null, lastSyncAt, error: game.syncNote } }, null, 2);
    }
    const out = [];
    if (game.db.settings.id !== 'settings') out.push('No player yet — start with: flow init --name "…"', '');
    out.push(statusText(game, g));
    if (game.config.url) {
      const last = await game.store.meta('flow.lastSyncAt');
      out.push('', `Sync: ${game.syncNote ? game.syncNote : last ? `synced ${hm(last)}` : 'not yet synced'}`);
    }
    return out.join('\n');
  },

  async next(game) {
    const db = await game.load();
    const n = pickNext(db, game.now);
    if (game.opt.json) return JSON.stringify(n, null, 2);
    return [`Energy: ${energyLine(M.energyOn(db, dayOf(game.now)))}`, ...nextLines(db, n)].join('\n');
  },

  async energy(game) {
    const [stamina, mana] = game.pos;
    const s = stamina ?? game.opt.stamina;
    const m = mana ?? game.opt.mana;
    if (s === undefined || m === undefined) throw new Error('flow energy <stamina 0-10> <mana 0-10>');
    const rec = makeEnergy({ stamina: s, mana: m, at: game.when('at') });
    const db = await game.write(rec);
    const e = M.energyOn(db, rec.day);
    const n = pickNext(db, game.now);
    return [`⚡ ${rec.day}: stamina ${rec.stamina} · mana ${rec.mana}${e.stamina !== rec.stamina || e.mana !== rec.mana ? ` (now ${e.stamina} · ${e.mana} after what you have done since)` : ''}`, ...nextLines(db, n)].join('\n');
  },

  async done(game) {
    const { opt } = game;
    let db = await game.load();
    const task = resolve(db.tasks.filter((t) => !t.archived), game.pos[0], 'task');
    const minutes = num(opt.minutes ?? opt.min, '--minutes');
    let end = game.when('at');
    if (opt.start !== undefined && opt.at === undefined) end = parseWhen(opt.start, game.day) + Math.round(minutes * 60000);
    let value = opt.value === undefined ? undefined : num(opt.value, '--value');
    let quality;
    if (task.measure === 'quality') value = value ?? (opt.quality === undefined ? undefined : num(opt.quality, '--quality'));
    else if (opt.quality !== undefined) {
      const q = num(opt.quality, '--quality');
      if (q < 0 || q > 100) throw new Error('--quality is 0–100 (percent)');
      quality = q / 100;
    }
    const before = play(db, end);
    const beforeNow = game.play();
    const candidate = task.cadence === 'once' ? M.reworkCandidate(db, task.id, end) : null;
    const rec = makeDone(db, task, { end, minutes, value, quality, note: str(opt.note) });
    db = await game.write(rec);
    const after = play(db, end);
    const p = rec.price;
    const out = [];
    const measure = task.measure === 'time' ? '' : task.measure === 'quality' ? `, ${rec.value}%` : `, ${rec.value}${task.unit ? ` ${task.unit}` : ''}`;
    const tier = tierById(p.difficulty);
    const tierPart = tier && tier.id !== DEFAULT_DIFFICULTY ? ` × ${tier.points} (${tier.name})` : '';
    out.push(`✓ ${task.title} (${minutes} min${measure}): +${p.points} pts  — base ${p.base} (${p.estimate} min ${p.estimateFrom === 'history' ? 'flow estimate' : 'estimate'}${rec.quality < 1 ? ` × ${pct(rec.quality)} quality` : ''})${bonusText(p)}${tierPart}`);
    const wins = [];
    if (p.bonuses.flow) wins.push(`in the zone — beat your target ${p.target}`);
    if (p.bonuses.pb) wins.push(`PERSONAL BEST — ${rec.value} beats ${p.best}`);
    if (p.bonuses.underdog) wins.push(`underdog stat (${db.stat.get(db.skill.get(task.skill)?.stat)?.name}) paid +50%`);
    if (wins.length) out.push(`  ★ ${wins.join(' · ')}`);
    if (rec.batchIndex > 0) out.push(`  ▶ Batch ×${rec.batchIndex + 1}: ${task.batch} — the next one within 10 min pays +${pct((rec.batchIndex + 1) * M.BONUS.batchStep)} and half the mana`);
    else if (rec.comboIndex > 0) out.push(`  ▶ Combo ×${rec.comboIndex + 1} — start the next task within 30 min to keep it`);
    else if (task.batch) out.push(`  ▶ Batch started: ${task.batch} — do another within 10 min for +15%`);
    const step = difficultyOn(db, dayOf(game.now), task.skill).targetStep;
    const hist = taskStats(db, task, Infinity, undefined, step);
    if (hist.target !== null) out.push(`  Next time: target ${hist.target}${task.measure === 'time' ? ' min' : task.measure === 'quality' ? '%' : task.unit ? ` ${task.unit}` : ''} (your last ${Math.min(hist.runs, M.HISTORY_RUNS)} runs, ${pct(step)} better)`);
    else out.push(`  ${M.HISTORY_MIN_RUNS - hist.runs > 0 ? `${M.HISTORY_MIN_RUNS - hist.runs} more run${M.HISTORY_MIN_RUNS - hist.runs === 1 ? '' : 's'} until this task gets a flow target` : ''}`.trimEnd());
    const e = M.energyOn(db, rec.day);
    if (e.rated) out.push(`  Energy: stamina ${e.stamina} · mana ${e.mana}${p.energy.stamina || p.energy.mana ? ` (this cost ${p.energy.stamina} / ${p.energy.mana})` : ''}${e.empty.length ? `  ⚠ ${e.empty.join(' and ')} empty — rest or eat next` : ''}`);
    for (const l of levelUps(before, after)) out.push(`  ${l}`);
    out.push(`  Balance ${play(db, game.now).balance} pts${beforeNow.balance < 0 ? ' (paying off debt)' : ''}`);
    if (candidate) out.push(`  (Finished on ${candidate.day} too. If this was fixing that run, it is rework: flow undo ${rec.id} && flow rework ${candidate.id} --minutes ${minutes})`);
    return out.filter(Boolean).join('\n');
  },

  async rework(game) {
    const { opt } = game;
    let db = await game.load();
    const ref = game.pos[0];
    let done = db.done.find((d) => d.id === ref);
    if (!done) {
      const task = resolve(db.tasks, ref, 'task');
      done = [...db.done].reverse().find((d) => d.task === task.id);
      if (!done) throw new Error(`${task.title} has no completion to rework`);
    }
    const at = game.when('at');
    const before = play(db, at);
    const balanceBefore = M.balanceOf(db);
    const rec = makeRework(db, done.id, { minutes: num(opt.minutes ?? opt.min, '--minutes'), at, note: str(opt.note) });
    db = await game.write(rec);
    const after = play(db, at);
    const task = db.task.get(done.task);
    const nth = ['1st', '2nd', '3rd'][rec.repeat - 1] || `${rec.repeat}th`;
    const why = done.critical ? 'critical: 2×' : `${nth} rework of this run: ×${rec.multiplier}`;
    const out = [`↺ Rework on ${task?.title} (done ${done.day}, ${done.minutes} min, +${done.price?.points}): ${rec.minutes} min × ${rec.perMinute} pts/min × ${rec.multiplier} (${why}) = −${rec.penalty} XP`];
    out.push(`  Charged ${rec.charged} pts${rec.charged > rec.penalty ? ` (${rec.charged - rec.penalty} extra: the part below zero costs ${debtWord(tierById(rec.difficulty)?.debt ?? M.DEBT_MULTIPLIER)})` : ''} · balance ${balanceBefore} → ${balanceBefore - rec.charged}`);
    const real = M.actual(done, db.rework.filter((r) => r.done === done.id));
    out.push(`  That run really took ${real.minutes} min at ${pct(real.quality)} quality — targets and bests now count it that way.`);
    for (const l of levelUps(before, after)) out.push(`  ${l}`);
    const recent = db.rework.filter((r) => r.task === done.task && r.day >= addDays(rec.day, -27)).length;
    if (recent >= 2) out.push(`  This task has needed rework ${recent}× in 4 weeks. Worth adding a check step, or raising its estimate so it gets done right the first time.`);
    return out.join('\n');
  },

  async moment(game) {
    const { opt } = game;
    const db = await game.load();
    const kind = resolve(db.kinds, game.pos[0], 'moment kind');
    if (opt.from === undefined || opt.to === undefined) throw new Error('flow moment <kind> --from HH:MM --to HH:MM');
    const start = parseWhen(opt.from, game.day);
    let end = parseWhen(opt.to, game.day);
    if (end <= start && /^\d{1,2}:\d{2}$/.test(String(opt.to))) end += 86400000; // across midnight
    const place = opt.place !== undefined ? resolve(db.places, opt.place, 'place').id : undefined;
    const rec = makeMoment(db, kind, { start, end, place, who: str(opt.who), note: str(opt.note) });
    const db2 = await game.write(rec);
    const e = M.energyOn(db2, rec.day);
    const eff = (x) => (x > 0 ? `−${x}` : x < 0 ? `+${-x}` : '±0');
    return `◷ ${rec.title} ${hm(start)}–${hm(end)}${rec.who ? ` with ${rec.who}` : ''} at ${db2.place.get(rec.place)?.name || '—'}: stamina ${eff(rec.energy.stamina)}, mana ${eff(rec.energy.mana)} (moments earn no points)${e.rated ? `\n  Energy now: stamina ${e.stamina} · mana ${e.mana}` : ''}`;
  },

  async buy(game) {
    const db = await game.load();
    const reward = resolve(db.rewards.filter((r) => !r.archived), game.pos[0], 'reward');
    const balance = M.balanceOf(db);
    const rec = makePurchase(db, reward, { at: game.when('at') });
    await game.write(rec);
    const after = balance - rec.charged;
    const credit = rec.charged > rec.price ? ` (price ${rec.price}; ${rec.charged - rec.price} extra because part of it went below zero, where it costs ${debtWord(tierById(rec.difficulty)?.debt ?? M.DEBT_MULTIPLIER)})` : '';
    return `🛒 ${reward.title}: −${rec.charged} pts${credit}. Balance ${balance} → ${after}.${after < 0 ? ' In debt — the next points you earn pay it off.' : ' Enjoy it.'}`;
  },

  async reward(game) {
    const { opt } = game;
    const db = await game.load();
    const [action, ref] = game.pos;
    if (action === 'add') {
      const rec = makeReward({ title: str(opt.title), price: opt.price, repeatable: !opt.once, now: game.now });
      await game.write(rec);
      return `Added reward ${rec.title}: ${rec.price} pts${rec.repeatable ? '' : ' (one-off)'} [${rec.id}]`;
    }
    const reward = resolve(db.rewards, ref, 'reward');
    if (action === 'edit') {
      const next = { ...reward };
      if (typeof opt.title === 'string') next.title = opt.title;
      if (opt.price !== undefined) { const p = num(opt.price, '--price'); if (!(p > 0)) throw new Error('a reward costs more than 0 points'); next.price = Math.round(p); }
      if (opt.once) next.repeatable = false;
      if (opt.repeatable) next.repeatable = true;
      await game.write(next);
      return `Updated reward ${next.title}: ${next.price} pts${next.repeatable ? '' : ' (one-off)'}`;
    }
    if (action === 'archive' || action === 'restore') {
      await game.write({ ...reward, archived: action === 'archive' });
      return `${action === 'archive' ? 'Archived' : 'Restored'} reward ${reward.title}`;
    }
    throw new Error('flow reward add | edit | archive | restore');
  },

  async task(game) {
    const { opt } = game;
    const db = await game.load();
    const [action, ref] = game.pos;
    if (action === 'add') {
      const rec = makeTask(db, taskFields(game, opt), { now: game.now });
      const db2 = await game.write(rec);
      return `Added ${describeTask(db2, rec)}`;
    }
    const task = resolve(action === 'restore' ? db.tasks.filter((t) => t.archived) : action === 'edit' ? db.tasks : db.tasks.filter((t) => !t.archived), ref, 'task');
    if (action === 'edit') {
      const rec = makeTask(db, { ...task, ...taskFields(game, opt, { editing: true }) }, { now: game.now });
      const db2 = await game.write(rec);
      return `Updated ${describeTask(db2, rec)}`;
    }
    if (action === 'archive' || action === 'restore') {
      await game.write({ ...task, archived: action === 'archive' });
      return `${action === 'archive' ? 'Archived' : 'Restored'} ${task.title}`;
    }
    throw new Error('flow task add | edit | archive | restore');
  },

  async skill(game) {
    const { opt } = game;
    const db = await game.load();
    const [action, ref] = game.pos;
    const place = (v) => (v === undefined ? undefined : v === 'none' || v === true ? null : resolve(db.places, v, 'place').id);
    if (action === 'add') {
      const stat = resolveStat(db, opt.stat);
      const rec = makeSkill(db, { name: str(opt.name) || str(opt.title), stat: stat.id, place: place(opt.place) ?? null, now: game.now });
      await game.write(rec);
      return `Added skill ${rec.name} under ${stat.name}${rec.place ? `, at ${db.place.get(rec.place).name}` : ''} [${rec.id}]`;
    }
    const skill = resolve(db.skills, ref, 'skill');
    if (action === 'edit') {
      const next = { ...skill };
      if (typeof opt.name === 'string') next.name = opt.name;
      if (opt.stat !== undefined) next.stat = resolveStat(db, opt.stat).id;
      if (opt.place !== undefined) next.place = place(opt.place);
      await game.write(next);
      return `Updated skill ${next.name} (${db.stat.get(next.stat)?.name}${next.place ? `, at ${db.place.get(next.place)?.name}` : ''})`;
    }
    throw new Error('flow skill add | edit');
  },

  async stat(game) {
    const { opt } = game;
    await game.load();
    const [action, ref] = game.pos;
    await game.materialize('stat');
    const db = game.db;
    if (action === 'add') {
      const name = str(opt.name);
      if (!name) throw new Error('a stat needs --name');
      if (db.stats.length >= 6) console.error('flow: note — more than 6 stats spreads the game thin; the spec says 4–6.');
      const id = db.stat.has(`stat_${slug(name)}`) ? newId('stat', game.now) : `stat_${slug(name)}`;
      const rec = { id, type: 'stat', name, icon: str(opt.icon) || '✦', order: Math.max(-1, ...db.stats.map((s) => s.order ?? 0)) + 1 };
      await game.write(rec);
      return `Added stat ${rec.icon} ${rec.name} [${rec.id}]`;
    }
    const stat = resolveStat(db, ref);
    if (action === 'rename') {
      const next = { ...stat, type: 'stat' };
      if (typeof opt.name === 'string') next.name = opt.name;
      if (typeof opt.icon === 'string') next.icon = opt.icon;
      await game.write(next);
      return `Renamed ${stat.name} → ${next.icon} ${next.name}`;
    }
    if (action === 'remove') {
      const skills = db.skills.filter((s) => s.stat === stat.id);
      if (db.stats.length <= 1) throw new Error('the game needs at least one stat');
      let moved = '';
      if (skills.length) {
        if (opt.to === undefined) throw new Error(`${stat.name} has skills (${skills.map((s) => s.name).join(', ')}) — pass --to <stat> to move them`);
        const to = resolveStat(db, opt.to);
        if (to.id === stat.id) throw new Error('--to must be a different stat');
        await game.write(...skills.map((s) => ({ ...s, stat: to.id })));
        moved = `; moved ${skills.length} skill${skills.length === 1 ? '' : 's'} to ${to.name}`;
      }
      await game.remove({ ...stat, type: 'stat' });
      return `Removed stat ${stat.name}${moved}`;
    }
    throw new Error('flow stat add | rename | remove');
  },

  async place(game) {
    const { opt } = game;
    await game.load();
    if (game.pos[0] !== 'add') throw new Error('flow place add --name "…" --zone home|road|factory|town|elsewhere');
    await game.materialize('place');
    const rec = makePlace(game.db, { name: str(opt.name), zone: typeof opt.zone === 'string' ? opt.zone : 'elsewhere', now: game.now });
    await game.write(rec);
    return `Added place ${rec.name} (${rec.zone}) [${rec.id}]`;
  },

  async kind(game) {
    const { opt } = game;
    await game.load();
    if (game.pos[0] !== 'add') throw new Error('flow kind add --title "…" [--icon …] [--place P] [--stamina N] [--mana N]');
    await game.materialize('kind');
    const db = game.db;
    const title = str(opt.title) || str(opt.name);
    if (!title) throw new Error('a moment kind needs --title');
    const perHour = (k) => {
      const v = opt[`${k}-per-hour`] ?? opt[k];
      if (v === undefined) return 0;
      const n = num(v, `--${k}`);
      if (n < -M.ENERGY_MAX || n > M.ENERGY_MAX) throw new Error(`--${k} is per hour, from -${M.ENERGY_MAX} to ${M.ENERGY_MAX}`);
      return n;
    };
    const rec = { id: newId('kind', game.now), type: 'kind', title, icon: str(opt.icon) || '◷', place: opt.place !== undefined ? resolve(db.places, opt.place, 'place').id : null, staminaPerHour: perHour('stamina'), manaPerHour: perHour('mana') };
    await game.write(rec);
    return `Added moment kind ${rec.icon} ${rec.title} (per hour: stamina ${rec.staminaPerHour}, mana ${rec.manaPerHour}${rec.place ? `; at ${db.place.get(rec.place).name}` : ''}) [${rec.id}]`;
  },

  async review(game) {
    const { opt } = game;
    const db = await game.load();
    const ratings = {};
    for (const s of db.stats) {
      for (const key of [slug(s.name), s.id, s.id.replace(/^stat_/, '')]) if (opt[key] !== undefined) { ratings[s.id] = opt[key]; break; }
    }
    const known = new Set(['satisfaction', 'win', 'lesson', 'next', 'at', 'day', 'offline', 'difficulty', 'skill-difficulty']);
    const stray = Object.keys(opt).filter((k) => !known.has(k) && !db.stats.some((s) => [slug(s.name), s.id, s.id.replace(/^stat_/, '')].includes(k)));
    if (stray.length) throw new Error(`no stat called ${stray.map((k) => `--${k}`).join(', ')} (stats: ${db.stats.map((s) => slug(s.name)).join(', ')})`);
    if (opt.satisfaction === undefined) throw new Error('flow review --satisfaction 0-10 [--<stat> 0-10 …] --win … --lesson … --next …');
    const at = game.when('at');
    const difficulty = difficultyArg(db, opt, at);
    const rec = makeReview(db, { satisfaction: opt.satisfaction, ratings, win: str(opt.win), lesson: str(opt.lesson), next: str(opt.next), difficulty, at });
    const db2 = await game.write(rec);
    const g = play(db2, game.now);
    const t = g.satisfaction.trend;
    return `✎ Review ${rec.week}: satisfaction ${rec.satisfaction}/10${t === null ? '' : ` (${t >= 0 ? '+' : ''}${t.toFixed(1)} vs the weeks before)`}${Object.keys(rec.ratings).length ? ` · ${Object.entries(rec.ratings).map(([k, v]) => `${db.stat.get(k).name} ${v}`).join(', ')}` : ''}${rec.next ? `\n  Next week's one change: ${rec.next}` : ''}${rec.difficulty ? `\n  Difficulty from ${addDays(rec.day, 1)}: ${settingText(db, rec.difficulty)}` : ''}`;
  },

  async difficulty(game) {
    const db = await game.load();
    const g = game.play();
    if (game.opt.json) {
      const pending = pendingDifficulty(db, g.day);
      return JSON.stringify({ ...g.difficulty, level: g.player.level, pending: pending ? { day: addDays(g.day, 1), ...pending } : null, tiers: DIFFICULTY }, null, 2);
    }
    return difficultyText(db, g);
  },

  async undo(game) {
    const db = await game.load();
    const EVENTS = ['done', 'rework', 'purchase', 'energy', 'review', 'moment'];
    const events = game.raw.filter((r) => EVENTS.includes(r.type) && !r.deletedAt);
    const ref = game.pos[0] || 'last';
    const rec = ref === 'last' ? events.filter((r) => r.origin === game.device).sort((a, b) => a.updatedAt - b.updatedAt).pop() : events.find((r) => r.id === ref);
    if (!rec) throw new Error(ref === 'last' ? 'nothing this device wrote to undo' : `no event "${ref}" (ids are in flow log)`);
    if (rec.type === 'done' && db.rework.some((r) => r.done === rec.id)) throw new Error('that completion has rework logged against it — undo the rework first');
    await game.remove(rec);
    const what = rec.type === 'done' ? `${db.task.get(rec.task)?.title} on ${rec.day} (−${rec.price?.points} pts)` : rec.type === 'purchase' ? `${db.reward.get(rec.reward)?.title} (+${rec.charged} pts back)` : rec.type === 'moment' ? `${rec.title} on ${rec.day}` : `${rec.type} on ${rec.day}`;
    return `Undid ${rec.type}: ${what}`;
  },

  async log(game) {
    const db = await game.load();
    return logText(db, dayOf(game.now), Math.max(1, Number(game.opt.days) || 7));
  },

  async replay(game) {
    const db = await game.load();
    const day = typeof game.opt.day === 'string' ? game.opt.day : dayOf(game.now);
    if (!isDay(day)) throw new Error('--day is YYYY-MM-DD');
    return replayText(db, day, game.now);
  },

  async list(game) {
    const db = await game.load();
    const what = game.pos[0] || 'tasks';
    const rows = {
      tasks: () => db.tasks.map((t) => `${t.archived ? '(archived) ' : ''}${describeTask(db, t)}`),
      skills: () => db.skills.map((s) => `${s.name} — ${db.stat.get(s.stat)?.name}${s.place ? `, at ${db.place.get(s.place)?.name}` : ''} [${s.id}]`),
      stats: () => db.stats.map((s) => `${s.icon} ${s.name} [${s.id}] — review flag --${slug(s.name)}`),
      rewards: () => db.rewards.map((r) => `${r.archived ? '(archived) ' : ''}${r.title} — ${r.price} pts${r.repeatable ? '' : ' one-off'} [${r.id}]`),
      places: () => db.places.map((p) => `${p.name} (${p.zone}) [${p.id}]`),
      kinds: () => db.kinds.map((k) => `${k.icon} ${k.title} — per hour stamina ${k.staminaPerHour}, mana ${k.manaPerHour}${k.place ? `, at ${db.place.get(k.place)?.name}` : ''} [${k.id}]`),
    }[what];
    if (!rows) throw new Error('flow list tasks | skills | stats | rewards | places | kinds');
    const lines = rows();
    return lines.length ? lines.join('\n') : `(no ${what} yet)`;
  },

  async sync(game) {
    if (!game.config.url) throw new Error('sync is not configured — flow config --url https://<portal>/w/flow --token <device token>');
    const r = await game.sync({ loud: true });
    return `Synced with ${game.config.url}: pulled ${r.pulled}, pushed ${r.pushed}`;
  },

  async export(game) {
    const all = (await game.store.all()).sort((a, b) => a.id.localeCompare(b.id));
    const json = JSON.stringify({ app: 'flow', exportedAt: new Date(game.now).toISOString(), records: all }, null, 2);
    if (!game.pos[0]) return json;
    writeFileSync(game.pos[0], json + '\n');
    return `Exported ${all.length} records to ${game.pos[0]}`;
  },

  async import(game) {
    const file = game.pos[0];
    if (!file) throw new Error('flow import <file> [--restamp]');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const records = (Array.isArray(data) ? data : data.records || []).filter((r) => r && typeof r.id === 'string' && Number.isFinite(r.updatedAt));
    const at = Date.now();
    const winners = [];
    for (const r of records) {
      const incoming = game.opt.restamp ? stamp(r, { now: at, device: game.device }) : r;
      const local = (await game.store.get(r.id)) ?? undefined;
      if (mergeRecord(local, incoming) === incoming && (!local || local.updatedAt !== incoming.updatedAt || game.opt.restamp)) winners.push(incoming);
    }
    if (winners.length) await game.store.put(winners);
    return `Imported ${winners.length} of ${records.length} records${game.opt.restamp ? ' (restamped, so sync sends them)' : ''}`;
  },
};

// config works without opening the database's game view.
async function config(opt, game) {
  const cfg = game.config;
  if (opt.clear) {
    delete cfg.url; delete cfg.token;
    writeConfig(cfg);
    for (const key of SYNC_CURSOR_KEYS) await game.store.setMeta(key, 0);
    return 'Sync switched off; this device keeps its copy.';
  }
  let changed = false;
  if (typeof opt.url === 'string') {
    let u;
    try { u = new URL(opt.url); } catch { throw new Error(`"${opt.url}" is not a URL`); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('the sync URL is http(s)://…/w/flow');
    const url = opt.url.replace(/\/$/, '');
    if (url !== cfg.url) {
      // Both cursors describe the old server; keeping them would upload nothing to the new one.
      for (const key of SYNC_CURSOR_KEYS) await game.store.setMeta(key, 0);
      cfg.url = url;
      changed = true;
    }
  }
  if (typeof opt.token === 'string') { cfg.token = opt.token; changed = true; }
  if (typeof opt.device === 'string') { cfg.deviceId = opt.device; changed = true; }
  if (changed) writeConfig(cfg);
  const last = await game.store.meta('flow.lastSyncAt');
  return [
    `${changed ? 'Saved. ' : ''}Flow home: ${HOME()}`,
    `Sync URL: ${cfg.url || '(not set — working offline)'}`,
    `Token: ${cfg.token ? 'set (hidden)' : 'not set'}`,
    `Device: ${cfg.deviceId}`,
    `Last sync: ${last ? new Date(last).toISOString() : 'never'}`,
  ].join('\n');
}

const WRITES = new Set(['undo', 'init', 'energy', 'done', 'rework', 'moment', 'buy', 'reward', 'task', 'skill', 'stat', 'place', 'kind', 'review', 'import']);
const READS = new Set(['status', 'next', 'log', 'replay', 'list', 'export', 'difficulty']);
const ALIASES = { setup: 'init', ls: 'list', did: 'done', redo: 'rework', shop: 'buy' };

function help() {
  return readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   ')).map((l) => l.slice(5)).join('\n');
}

export async function main(argv) {
  const [first, ...rest] = argv;
  const cmd = ALIASES[first] || first;
  if (!cmd || cmd === 'help' || cmd === '--help') return help();
  const { pos, opt } = parseArgs(rest);
  if (opt.help) return help();
  if (cmd !== 'config' && !commands[cmd]) throw new Error(`unknown command "${first}" — run: flow help`);
  const game = await new Game(opt).open();
  game.pos = pos;
  try {
    if (cmd === 'config') return await config(opt, game);
    if (cmd === 'sync') return await commands.sync(game);
    if (READS.has(cmd) || WRITES.has(cmd)) await game.sync(); // pull first, so points are priced against the whole history
    const out = await commands[cmd](game);
    if (WRITES.has(cmd)) await game.sync();
    return out;
  } finally {
    await game.close();
  }
}

/** Run as a program: print the result, or the error in one line, and exit. */
export async function run(argv = process.argv.slice(2)) {
  try {
    const out = await main(argv);
    if (out) console.log(out);
    process.exit(0);
  } catch (err) {
    console.error(`flow: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) await run();
