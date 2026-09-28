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
export const SKIP_POINTS_PER_DOLLAR = 1;
export const SKIP_DAILY_CAP = 100;
export const GEAR_STEP_USES = 10;
export const GEAR_STEP = 0.01;
export const GEAR_MAX = 0.10;
export const SLOTS = ['head', 'body', 'legs', 'feet', 'hands', 'bag', 'tech', 'vehicle'];
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
export const AUTO_DRIVE_MAX_MIN = 180;
export function makeVisit(db, { place, arrive = null, leave })   // → { id: visit_<place>_<leave>, type:'visit', day, place, arrive, leave }
export function autoDrive(db, { place, arrive })                  // → the Drive moment an arrival implies, or null
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
export function makeItem(db, { name, category = '', aliases = [], place = null, qty = 1, price = 0, consumable = false, lowStock = 0, usual = lowStock + 1, skills = [], slot = null, photo = null, color = null, id = null, now = Date.now() }) 
export function findItems(db, query) 
export function makeSkip(db, { query, price, item = null, at = Date.now() }) 
export function makeSpend(db, { name, price, item = null, qty = 1, at = Date.now() }) 
export function restockFor(db, spend) 
export function makeWish(db, { name, qty = 1, now = Date.now() }) 
export function shoppingList(db) 
export function makeLoadout(db, { name, slots = {}, active = false, checklist = [], id = null, now = Date.now() }) 
export function activeLoadout(db) 
export function gearBonus(db, task, at) 
export function inventory(records, now = Date.now()) 
export function makeEnergy({ stamina, mana, at = Date.now() }) 
export function suggestRating(health)                            // { sleepHours, steps } → 4–10, or null without sleep data
export function energyOn(db, day) 
export const TIRED_CAPS = { bit: 6, very: 3, wiped: 1 };
export function makeTired(db, { body = false, mind = false, level, at = Date.now() })   // energy record, feeling 'tired'
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

# Public API of src/planner.js (Planner tasks, SPEC.md › Planner tasks)

```js
export const PLANNER_COVER_MS = 86400000;
export function plannerTasks(planRecords, opts)          // opts: { me, skills, stats } → { tasks, skills }
export function plannerRework(db, ask, minutes)          // the rework record for an answered ask
export function plannerHistory(planRecords, opts)        // tasks (archived) and skills of plans archived since
export function plannerSinceStamp(settings, readAt)      // the settings record stamped with plannerSince, or null
export function plannerEvents(db, planRecords, opts)     // opts: { me, now, since } → { done, rework, ask }
export const OP_TYPE = 'flow.op', OPS_KEEP_DAYS = 90, PENDING_ESTIMATE_MIN = 30;
export function projectList(db, planRecords, opts)       // opts: { me, now } → [{ id, name, pinned, open, deadline, weekMinutes, tasks }]
export function expiredOps(planRecords, opts)            // opts: { now } → addTask ops older than 90 days Planner never applied
```

`plannerTasks` also derives a task for each `addTask` op (in `planRecords`)
Planner has not applied: same id `task_pl_<plan>_<t_flow_…>`, `pending: true`,
estimate from its hours else 30 min — until the plan holds that task id, it is
marked applied there, or (with `opts.now`) it is older than 90 days.

# Writing to Planner: src/planops.js (SPEC.md › Terminal › Writing to Planner)

```js
export function isOp(r)
export function addTaskOp({ plan, name, work = null, deadline = null, me = '', now })
  // → { id, type:'flow.op', op:'addTask', plan, at, me, task: { id:'t_flow_…', name, work, deadline } }
export function timesheetOp({ plan, task, start, minutes, me = '' })
  // → { id, type:'flow.op', op:'timesheet', plan, at, me, task, date, start (min into the day), hours, note:'Flow timer' }
export function opsToWrite(held, ops)                     // refuses a non-op or an id already held (write-once)
export async function pushOps(records, transport, { deviceId, sent })   // sends this device's unsent flow.op records only
export function stopTimer(db, timer, { now, me, minutes, quality, value, note })   // → { done | rework, op | null, timer: null }
export function pauseTimer(db, timer, { now, me })         // → { op | null, timer: null }
export function plannerUrlFrom(flowUrl)                    // Portal origin → <origin>/w/project
```

`src/sync.js` adds `addOps(...ops)`, `opsWaiting()` and `plannerExpired(now)`.

# The iPhone bridge: src/native.js (SPEC.md › iOS app)

The page talks to the iOS shell (shell-kit's `ShellScene`, the app in `ios/`)
through shell-kit's `src/host.js`: the page posts `{ type, … }` to the
`flow` message handler, and the shell calls `window.flowHost.event(event)`.
With no shell every call is a no-op.

```js
export const TO_APP, TO_PAGE                  // the message names below
export function snapshotOf(g)                 // play() → { stamina, mana, points, level, next: { id, title, estimate } | null, at }
export function parseDeepLink(url)            // → { action:'done', task, minutes|null } | { action:'start', task } | null
export function timerMessage(db, timer)       // { task, start } | null → the flow.timer message
export function visitRecords(db, event)       // a flow.visit event → [visit?, drive moment?], nothing already written
export function createNative({ host, store, onChange, onOpen, onRemote })
  // → { hosted, platform, state: { health, geofence }, init(), timer(db, timer), snapshot(g),
  //     setGeofence(place), clearGeofence(place), listGeofences(), requestHealth(), pair(), signOut(), event(e) }
```

Page → app (`post`):

| type | body | when |
|---|---|---|
| `flow.timer` | `{ state: 'running'｜'stopped', task: { id, title, place (name) }｜null, start (ms)｜null }` | the device timer starts or ends (logged or discarded); `stopped` once at launch with no timer |
| `flow.snapshot` | `{ stamina, mana, points, level, next: { id, title, estimate }｜null, at }` | any change of those numbers; the shell writes it to the app group for the widget |
| `flow.geofence.set` | `{ place: { id, name } }` | "Set to where I am now": the shell uses the current location |
| `flow.geofence.clear` | `{ place: { id, name } }` | Clear |
| `flow.geofence.list` | `{}` | at launch (iOS) |
| `flow.health.request` | `{}` | at launch, and once a day while the day is unrated (iOS) |
| `flow.visits.ack` | `{ ids: [queue ids] }` | after the records a visit implies are written |
| `portal.pair` / `portal.signOut` | `{}` | shell-kit's Portal pairing (Settings ▸ Sync) |

App → page (`window.flowHost.event(e)`):

| type | body | the page |
|---|---|---|
| `flow.visit` | `{ id (queue id), place (id), arrive (ms)｜null, leave (ms)｜null }` | writes `makeVisit` when `leave` is set and the `autoDrive` moment when `arrive` is, then acks; the shell resends until acked |
| `flow.health` | `{ day: 'YYYY-MM-DD', sleepHours｜null, steps｜null }` | kept in memory; the morning rating shows `suggestRating` |
| `flow.geofence.status` | `{ authorized, places: [{ id, set }] }` | Settings ▸ Places on this iPhone |
| `open` | `{ url }` | `flow://done?task=<id>&minutes=<n>` opens Log done prefilled; `flow://start?task=<id>` starts the timer |

`remote({ url, token })` (shell-kit pairing) is applied as the Sync settings.
Coordinates never cross the bridge; Health numbers are never written.

# CLI usage (cli/flow.mjs --help)

```
flow init --name "Ana" [--mission "…"] [--stats "Body,Mind,Craft,Work,Bonds"] [--planner-name "…"]
flow status [--json]                     level, balance, energy, next, streaks, review due
flow next [--json]                       the next task, why, and the alternatives
flow energy <stamina> <mana> [--at HH:MM]   this morning's rating, 0–10 each
flow done <task> --minutes N [--value V] [--quality 0-100] [--at HH:MM|ISO | --start HH:MM] [--day YYYY-MM-DD] [--note "…"]
flow rework <task|done-id> --minutes N [--at …] [--note "…"]   (the task's latest completion by default)
flow moment <kind> --from HH:MM --to HH:MM [--who X] [--place P] [--day YYYY-MM-DD] [--note "…"]
flow buy <reward> [--at …]              a treat from the points shop
flow item add --name "…" [--category C] [--alias "a,b"] [--place P] [--qty N] [--price $] [--consumable --low N [--usual N]]
          [--skill S[,S]] [--slot head|body|legs|feet|hands|bag|tech|vehicle] [--color #hex] [--photo ref]
flow item edit <item> [same fields; --place none, --slot none, --skill none, --no-consumable] | list [--json]
flow have <query> [--json]              check before buying: "You own 2: Desk, Car"
flow skip <query> --price $ [--item I] [--at …]   "I have it": 1 pt per dollar, 100 a day, no XP
flow purchase <name> --price $ [--item I | --new] [--qty N] [--place P] [--at …]
          real money: no penalty, adds or restocks the item (also: flow buy <name> --price $)
flow wish add <name> [--qty N] | list [--json] | done <wish>   the shopping list (+ low stock)
flow loadout add --name "…" [--head I --body I --legs I --feet I --hands I --bag I --tech I --vehicle I] [--check "a,b"] [--active]
flow loadout edit <loadout> [slots; --<slot> none] | equip <loadout> | list [--json]
flow inventory [--json]                 saved vs spent this month, in use, low stock, stashes
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
flow planner pull [--url https://…/w/project] [--token …]   read Project Planner's workspace (never written)
flow planner import <store-export.json>   Planner's Settings ▸ export, instead of a server
flow planner status [--json]            your Planner tasks, what was logged, reopened tasks to answer
flow sync
flow config [--url https://…/w/flow --token …] [--device NAME] [--clear]
flow export [file] | import <file> [--restamp]
```
