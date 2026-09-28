# How Flow scores

Read this when the player asks why a number is what it is. The source of truth
is `src/model.js` (the constants in capitals below); the app and the CLI both
run it, so they always agree. Answer with the player's own numbers: `done`
prints the whole breakdown, and `status --json` has every completion's stored
`price`.

Every number below is the default tier, **Push**. Another tier scales some of
them; see [Difficulty](#difficulty) at the end.

## What is stored, what is derived

Definitions (settings, stats, skills, tasks, rewards, places, moment kinds,
items, loadouts, wishes) are edited in place; the last write wins. Events
(done, rework, purchase, energy, review, moment, skip, spend) are written once. **Every completion stores the price it was
paid**, and every rework and purchase stores what it charged, so points never
change later — except through rework. Levels, targets, bests, energy, balance
and the next task are recomputed from the records every time.

## Points (= XP)

**Base = estimated minutes × quality × 1 point per minute** (`POINTS_PER_MINUTE`).

- The estimate is the task's own until it has 3 runs (`HISTORY_MIN_RUNS`).
  From then on it is the **flow estimate**: the average minutes of the last 5
  runs (`HISTORY_RUNS`) minus 5% (`TARGET_STEP`). So a repeated task cannot be
  inflated, and getting faster lowers its price — the bonuses are how speed pays.
- Quality is 0–100%. For a `quality` task it is the value itself.

**Bonuses add up, and the total never passes 2.5× base** (`BONUS_CAP`):

| Bonus | | When |
| --- | --- | --- |
| Flow | +20% | You hit the target: last 5 runs' average, 5% better (needs 3 runs) |
| Personal best | +25% | Strictly better than every earlier run |
| Underdog | +50% | The task's stat earned the least base points in the 7 days before today (nobody when all tie) |
| Combo | +10% per chained task, up to +100% | This task started ≤ 30 min (`COMBO_GAP_MIN`) after the last one ended |
| Batch | +15% × position | Same batch type as the last task, gap ≤ 10 min (`BATCH_GAP_MIN`). Replaces the combo bonus |
| Gear | +1% per 10 uses, up to +10% | An item linked to the task's skill, equipped in the active loadout: +1% (`GEAR_STEP`) for every 10 (`GEAR_STEP_USES`) of that skill's completions done while it was equipped, max +10% (`GEAR_MAX`). Best item only |

Rest (a task that restores energy) pauses a combo: it neither grows nor breaks it.

Example: 3rd purchase request in a batch, 10-min estimate, 90% quality →
base 9, × 1.30 (batch ×3 +30%) = 12 points.

## Targets and bests

"Better" is less for `time`, more for `count` and `quality`. Rework counts
against the run it fixed: the run's true time becomes original + fix minutes
and its quality falls by the share redone, so targets and bests use the truth.

## Rework — priced to hurt

**Penalty = fix minutes × (points earned ÷ original minutes) × multiplier.**
The multiplier is 2× for critical work (`REWORK_CRITICAL`); otherwise 1.5×,
1.75×, 2× for the 1st, 2nd, 3rd+ rework of the same completion
(`REWORK_MULTIPLIERS`). Example: 90 points in 90 minutes, a 60-minute fix →
60 × 1 × 1.5 = 90.

The penalty comes off XP (skill, stat and player levels can drop) and off the
balance as a charge. **Critical** = flagged critical, has a deadline, or is for
someone else.

## Planner tasks

Tasks from Project Planner are derived, never stored: the leaf tasks of live
plans (not summaries, milestones, archived or cancelled tasks, templates or
archived plans) that nobody is assigned to, or that are assigned to the
player's name in Planner (case and spaces ignored). Each is a `time` task with
cadence `once`:

- **Estimate** = Planner's expected work: the task's work hours × 60, else
  duration × the plan's hours per day × its assumed load (default 100%) × 60,
  at least 1 minute. It is the base, like any task's estimate.
- **Critical** when it has a deadline or its urgency is ASAP or High.
- **Skill**: the task's Planner skill, else the project's, its folder, its
  workspace, the project name — matched to a Flow skill by name, or a new
  skill under Work.
- **Energy**: 2 per hour of estimate (to 0.5, at most 10): stamina for
  physical work, mana for mental (the default).

**Done in Planner = logged here** at Planner's done time, with the estimate as
its minutes and quality 1, priced by the normal rules, unless a completion of
that task already covers it (logged with the timer or `done` no more than 24 h
before it, or after it). It is the same record on every device, so it never
counts twice. **Reopened in Planner** and finished again more than 24 h after
the completion that covered it: rework of that completion, the fix = Planner's
timesheet hours on the task after it, × 60. With no hours logged there, Flow
asks for the minutes. Rework already logged against that completion (the
timer's "is this rework?") covers it, so nothing is charged twice.

**From when.** Planner history from before Flow first read Planner is not
logged: the first successful read stamps `settings.plannerSince` (once; it
never moves), and only finishes at or after it are logged or count as
reopens (`flow planner status` shows the date). A plan archived since still
logs its finishes and reopens; templates never count.

## Balance, shop and debt

Balance = points earned + skip points − rework charges − purchases, as charged. Debt is
allowed, but **the part of any charge that goes below zero costs double**
(`DEBT_MULTIPLIER`): at a balance of 22, a 60-point treat charges 22 + 38 × 2
= 98. Meals, sleep, medical care and rest are never for sale; socializing
costs energy only, never points.

## Inventory: skip, buy, gear

- **Skip ("I have it")**: points = the price avoided, 1 point per dollar
  (`SKIP_POINTS_PER_DOLLAR`), rounded to the nearest dollar ($12.49 → 12),
  at most **100 points a day** across all skips (`SKIP_DAILY_CAP`) — the cap
  counts the skips before this one's own time that day. The points go to the
  balance, **never to XP**: no skill earned them. Money saved is the full price
  with its cents, even past the cap ($150 skipped → 100 points, $150 saved).
- **Buy anyway** (`purchase`): records the money spent and adds or restocks the
  item. No points change, no penalty. `inventory` shows saved vs spent this month.
- **Low stock**: a consumable at or below its low-stock level joins the shopping
  list asking for enough to get back to its usual quantity (usual defaults to
  low-stock + 1; have 1, usual 4 → buy 3).
- **Gear** grows with use, never with buying: each completion records the items
  equipped in the active loadout at the time (`gear`), and the gear bonus above
  counts those. New gear starts at +0%.

## Energy

Stamina (body) and mana (mind), 0–10. The morning rating sets the day; each
task and moment after it drains or restores; nothing goes above 10 or below 0.

- A task costs its listed stamina/mana × max(0.25, 1 − 0.075 × (skill level − 1))
  (`MASTERY_STEP`, `MASTERY_FLOOR`): mastery makes things cheaper, down to a
  quarter at skill level 11.
- Later tasks in a batch cost half the mana (`BATCH_MANA_SHARE`).
- Restoring is never discounted.
- Moments cost energy per hour by kind (Drive 0.5 stamina + 1 mana an hour,
  Meal restores 2 + 1, Rest restores 3 + 3…) and earn no points.
- Empty is a warning, never a penalty: the picker offers only rest, free or
  due-soon tasks.

## Levels

Going from level L to L+1 costs step × L XP: `PLAYER_STEP` 500, `STAT_STEP`
300, `SKILL_STEP` 100. So a skill reaches level 2 at 100 XP, 3 at 300, 4 at
600, 5 at 1000. A skill's XP is its tasks' points minus their rework
penalties; a stat's is its skills'; the player's is all of them.

## The next task

Order: due within 2 days (`DEADLINE_SOON_DAYS`) or overdue → affordable with
today's energy → underdog stat → the skill closest to its next level. Tasks of
one batch type wait until 3 are open (`BATCH_RELEASE`) or one is due soon, then
come as a batch. One suggestion plus up to three alternatives.

## Streaks, reviews, achievements

- Daily streaks forgive one missed day per 7; a day not yet done does not break
  it (it is "at risk"). Weekly streaks count ISO weeks.
- The CLI flags a task as **struggling** when a daily a week old was done ≤ 3
  of the last 7 days, or any task needed rework 2+ times in 4 weeks.
- The weekly review is due every Sunday (the end of the Monday–Sunday week) while that week has none, and stays due after a missed week until one is done. The trend is the latest
  satisfaction minus the average of the three reviews before it.
- Achievements: First step · In the zone · Personal best · Combo ×5 · Batched
  (3 in a batch) · Assembly line (5) · Clean week (10+ tasks, no rework) ·
  Seven days · Journeyman (skill level 5) · Mastery (energy floor) · Reflective
  (4 reviews) · Earned it (a treat without debt).

## Difficulty

Five tiers (`DIFFICULTY`), easiest first; **Push** (`DEFAULT_DIFFICULTY`) is
everything above, unchanged. A tier changes four things together: harder
targets, bigger rewards, less forgiveness and tighter energy.

| Tier | Unlocks at level | Points × | Target step | Rework + | Debt × | Energy cost × | Grace days / 7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Steady | 1 | 0.8 | 3% | −0.25 | 1.5 | 0.85 | 2 |
| **Push** (default) | 1 | 1 | 5% | 0 | 2 | 1 | 1 |
| Grind | 3 | 1.25 | 8% | +0.25 | 2 | 1.15 | 1 |
| Relentless | 6 | 1.5 | 11% | +0.5 | 2.5 | 1.3 | 0 |
| Legend | 10 | 2 | 15% | +0.75 | 3 | 1.5 | 0 |

- **Points ×** applies after the 2.5× cap: points = base × min(2.5, 1 +
  bonuses) × tier points.
- **Target step** replaces the 5% in both the flow target and the flow
  estimate.
- **Rework +** is added to the multiplier (1.5 / 1.75 / 2, and 2 for critical).
  A rework uses the tier its completion was priced at.
- **Debt ×** replaces the double on the part of a charge below zero. A purchase
  uses the global tier on its day; a rework uses its completion's tier.
- **Energy cost ×** multiplies positive task costs after mastery and batch
  discounts. Restoring is never scaled.
- **Grace days** is how many missed days a daily streak forgives in any 7-day
  stretch (the dashboard uses the global tier).

**Global plus per skill.** One global tier, and a skill can override it. A task
plays at its skill's tier (`difficultyOn(db, day, skill)`).

**Only at the weekly review.** The review's `difficulty: { tier, skills }` sets
it, from the day after the review. A review without it keeps the setting; one
with it replaces the whole setting, so a skill left out goes back to the global
tier. Before any review sets it, everything is Push.

**Unlocks.** Raising the global tier needs the player's level ≥ the tier's
unlock level; raising a skill's override needs that skill's level. A locked or
unknown tier is refused. Lowering is always allowed, and a tier already chosen
stays in effect if a level later falls.

Every price stores its tier (`price.difficulty`), so changing difficulty never
changes points already earned. `flow difficulty` shows the setting, what is
unlocked and what unlocks next.
