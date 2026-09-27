# How Flow scores

Read this when the player asks why a number is what it is. The source of truth
is `src/model.js` (the constants in capitals below); the app and the CLI both
run it, so they always agree. Answer with the player's own numbers: `done`
prints the whole breakdown, and `status --json` has every completion's stored
`price`.

## What is stored, what is derived

Definitions (settings, stats, skills, tasks, rewards, places, moment kinds) are
edited in place; the last write wins. Events (done, rework, purchase, energy,
review, moment) are written once. **Every completion stores the price it was
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

## Balance, shop and debt

Balance = points earned − rework charges − purchases, as charged. Debt is
allowed, but **the part of any charge that goes below zero costs double**
(`DEBT_MULTIPLIER`): at a balance of 22, a 60-point treat charges 22 + 38 × 2
= 98. Meals, sleep, medical care and rest are never for sale; socializing
costs energy only, never points.

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
- The weekly review is due 7 days after the last. The trend is the latest
  satisfaction minus the average of the three reviews before it.
- Achievements: First step · In the zone · Personal best · Combo ×5 · Batched
  (3 in a batch) · Assembly line (5) · Clean week (10+ tasks, no rework) ·
  Seven days · Journeyman (skill level 5) · Mastery (energy floor) · Reflective
  (4 reviews) · Earned it (a treat without debt).
