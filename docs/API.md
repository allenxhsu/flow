# Public API of src/model.js (signatures only, generated)

```js
export const POINTS_PER_MINUTE = 1;
export const BONUS = { flow: 0.2, pb: 0.25, underdog: 0.5, comboStep: 0.1, comboMax: 1, batchStep: 0.15 };
export const BONUS_CAP = 2.5;
export const COMBO_GAP_MIN = 30;
export const BATCH_GAP_MIN = 10;
export const BATCH_RELEASE = 3;
export const DEADLINE_SOON_DAYS = 2;
export const HISTORY_RUNS = 5;
export const HISTORY_MIN_RUNS = 3;
export const TARGET_STEP = 0.05;
export const MASTERY_STEP = 0.075;
export const MASTERY_FLOOR = 0.25;
export const BATCH_MANA_SHARE = 0.5;
export const REWORK_MULTIPLIERS = [1.5, 1.75, 2];
export const REWORK_CRITICAL = 2;
export const DEBT_MULTIPLIER = 2;
export const DIFFICULTY = [
export const DEFAULT_DIFFICULTY = 'push';
export const PLAYER_STEP = 500;
export const STAT_STEP = 300;
export const SKILL_STEP = 100;
export const ENERGY_MAX = 10;
export const WEEK = 7;
export const REWORK_ASK_DAYS = 14;
export const DEFAULT_STATS = [
export const ZONES = ['home', 'road', 'factory', 'town', 'elsewhere'];
export const DEFAULT_PLACES = [
export const DEFAULT_KINDS = [
export const RECORD_TYPES = [...DEFINITIONS, ...EVENTS];
export const dayOf = (ms)
export const addDays = (day, n)
export const daysBetween = (a, b)
export const isDay = (s)
export function isoWeek(day) 
export function newId(type, now = Date.now()) 
export function stamp(record, { now = Date.now(), device = 'local' } = {}) 
export function tombstone(record, { now = Date.now(), device = 'local' } = {}) 
export function index(records) 
export const betterOf = (task)
export function makeSkill(db, { name, stat, place = null, now = Date.now() }) 
export function makePlace(db, { name, zone = 'elsewhere', now = Date.now() }) 
export const placeOfTask = (db, task)
export function makeMoment(db, kindRef, { start, end = Date.now(), place, who = '', note = '' } = {}) 
export function makeTask(db, fields, { now = Date.now() } = {}) 
export function makeReward({ title, price, repeatable = true, now = Date.now() }) 
export const isCritical = (task)
export function actual(done, reworks = []) 
export function taskStats(db, task, before = Infinity, rw = reworkByDone(db), step = Number.isFinite(before) ? difficultyOn(db, dayOf(before), task.skill).targetStep : TARGET_STEP) 
export function levelFor(xp, step) 
export const masteryFactor = (level)
export function underdogsOn(db, day) 
export function chainAt(db, task, start) 
export function priceDone(db, task, { start, end, minutes, value, quality }) 
export function makeDone(db, taskRef, { end = Date.now(), minutes, value, quality, timed = false, note = '', reworkOf = null } = {}) 
export function balanceOf(db, before = Infinity) 
export function chargeFor(balance, amount, debt = DEBT_MULTIPLIER) 
export function makePurchase(db, rewardRef, { at = Date.now() } = {}) 
export function makeRework(db, doneRef, { minutes, at = Date.now(), note = '' }) 
export function makeEnergy({ stamina, mana, at = Date.now() }) 
export function energyOn(db, day) 
export function makeReview(db, { satisfaction, ratings = {}, win = '', lesson = '', next = '', difficulty = null, at = Date.now() }) 
export function difficultyOn(db, day, skillId = null) 
export function latestPerWeek(reviews) 
export const isDoneFor = (db, task, day)
export function dailyStreak(days, day, grace = 1) 
export function weeklyStreak(weeks, day) 
export function pickNext(db, now, g = null) 
export function reworkCandidate(db, taskId, now) 
export function reviewDue(reviews, day) 
export function play(records, now = Date.now()) 
export const WALK_MIN = 5;
export function replayDay(records, day, { now = Date.now() } = {}) 
```

# CLI usage (cli/flow.mjs --help)

```
flow init --name "Allen" [--mission "…"] [--stats "Body,Mind,Craft,Work,Bonds"]
flow status [--json]                     level, balance, energy, next, streaks, review due
flow next [--json]                       the next task, why, and the alternatives
flow energy <stamina> <mana> [--at HH:MM]   this morning's rating, 0–10 each
flow done <task> --minutes N [--value V] [--quality 0-100] [--at HH:MM|ISO | --start HH:MM] [--day YYYY-MM-DD] [--note "…"]
flow rework <task|done-id> --minutes N [--at …] [--note "…"]   (the task's latest completion by default)
flow moment <kind> --from HH:MM --to HH:MM [--who X] [--place P] [--day YYYY-MM-DD] [--note "…"]
flow buy <reward> [--at …]
flow undo [event-id|last]               take back a mistaken entry (ids are in flow log)
flow reward add --title "…" --price N [--once] | edit <reward> [--title …] [--price N] | archive <reward>
flow task add --title "…" --skill S [--measure time|count|quality] [--cadence daily|weekly|once|anytime]
          [--estimate MIN] [--stamina N] [--mana N] [--deadline YYYY-MM-DD] [--place P] [--batch TYPE]
          [--unit U] [--better less|more] [--critical] [--for-others]
flow task edit <task> [same fields; --deadline none, --batch none, --place none, --no-critical, --no-for-others]
flow task archive|restore <task>
flow skill add --name "…" --stat S [--place P] | edit <skill> [--name …] [--stat S] [--place P|none]
flow stat add --name "…" [--icon ✦] | rename <stat> --name "…" [--icon …] | remove <stat> [--to <stat>]
flow place add --name "…" [--zone home|road|factory|town|elsewhere]
flow kind add --title "…" [--icon …] [--place P] [--stamina N] [--mana N]   (energy per hour; negative restores)
flow review --satisfaction N [--<stat> N …] [--win "…"] [--lesson "…"] [--next "…"]
          [--difficulty <tier>] [--skill-difficulty <skill>=<tier> …]   (from the next day)
flow difficulty [--json]                 the tier now, per-skill overrides, what is unlocked and next
flow log [--days 7]
flow replay [--day YYYY-MM-DD]
flow list [tasks|skills|stats|rewards|places|kinds]
flow sync
flow config [--url https://…/w/flow --token …] [--device NAME] [--clear]
flow export [file] | import <file> [--restamp]
```
