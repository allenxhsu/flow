# Flow — the spec

Every decision below was settled with the player in a grilling session
(Matt Pocock's `grill-me`). Build to it; when something here is ambiguous,
ask rather than guess. `src/model.js` is the executable form of the rules and
the contract every other part builds on.

## Purpose

Doing similar tasks **faster or better**, until the day feels like flow in a
game. Success after 12 weeks = still checking in ≥ 5 days a week **and** weekly
life satisfaction up ≥ 1 point. One player.

**Flow is a productivity tool first.** Tasks, the timer, points, energy,
rework, the shop, inventory, reviews and difficulty are the product. The
playable game (walking the house, the drive, the lot and the shop floor) is a
side quest for replaying the day **and also an input** (decided 2026-09-28):
from inside it the player can start a task, finish one, and add a new one,
writing exactly the records the app's own screens write. The app's screens
take their look from it. See "## Play".

## Shape

- **Stats → skills → tasks.** 4–6 stats of the player's choosing (defaults
  Body, Mind, Craft, Work, Bonds). Skills sit under stats and level up.
  Life satisfaction is a separate weekly 0–10 score XP cannot buy.
- **Task:** a measure (`time` | `count` | `quality`), a cadence (`daily` |
  `weekly` | `once` | `anytime`), an estimate in minutes, stamina/mana cost
  (negative restores), optional deadline, place, batch type, `critical`,
  `forOthers`.
- **Critical** = flagged, or has a deadline, or is for someone else, or the
  planner marks it urgent (phase 2).

## The board: seven trees (decided 2026-09-28)

The default stats (Body, Mind, Craft, Work, Bonds) were a placeholder. This is
the real board, cut from 403 of the player's own Planner tasks across 39
projects. Seven trees — four professional, three private — each with at least
three skills. It raises the stat cap from six to seven.

Every skill declares a **unit of output**, because the player's *tasks* are
nearly all one-offs but their *units* repeat: eleven "Release Drawing for…",
sixty reqs, fifty threads. Pace is measured per unit, never per task.

| tree | skill | unit of output | the meter (what cannot be faked) |
|---|---|---|---|
| **ARTIFICE** | Shaping | a modelled part | true minutes per part |
| | Interlock | an assembly | minutes per assembly · mates that break on edit |
| | Inscription | a released drawing | minutes per sheet · **revisions per release** |
| | Sundering | a project's BOM | unique parts per project · reuse across projects |
| **CAMPAIGN** | Summoning | a requisition | req→on-dock days · **% needing a second req** |
| | Quickening | a machine to dry-run | defects at dry run · kit-complete→pass days |
| | Trial | a FAT | **first-time pass rate** |
| | Deliverance | a project | on-time vs deadline · estimate accuracy |
| **RHETORIC** | Scribing | a thread to resolution | **round-trips to resolution** |
| | Parley | a conversation with a purpose | did it produce the decision it was for |
| | Council | a meeting | **say-back rate** |
| | Augury | a written claim with a check date | **calibration** (see below) |
| **COMMAND** | Battle Orders | a handoff | **chase count** before delivery |
| | Decree | a decision | stood vs relitigated |
| | Bulwark | an escalation | closed here vs passed up |
| | Tutelage | a person coached | did *their* meter move |
| **SINEW** | Might | a session | total load · estimated 1RM |
| | Vigor | a session | pace at fixed HR · time over a benchmark |
| | Poise | a run (snowboard) | **falls per run** · terrain grade · *seasonal* |
| **ARCANA** | Alacrity | a reaction test | median reaction time |
| | Concentration | a timer run | longest unbroken run · % cancelled |
| | Lore | a course unit | the external grade · time per unit |
| **HEARTH** | Covenant · Bloodline · Fellowship | — | hours only. **Never graded** |

The display name is the tree's; the plain meaning is the grey subtitle beside
it — *Summoning · procurement* — so the character sheet does not become a
crossword.

### One spine

Every quality measure above is the same measure wearing different clothes:
**did it come back?** A revision, a second req, a failed FAT, another
round-trip, another chase, a reopened decision, a fall. Rework is not a
feature of one tree; it is the only honest quality signal the game has, and it
generalises to all seven.

### What a level is

Points are **fuel**, capped at 720 a day, and are not the score. A skill
carries two numbers, both logarithmic, doing different jobs.

**Depth** = `1 + ⌊log₂(hours)⌋` — the logbook. Never falls. Each level costs
double the last, so a lifetime in a skill is about fourteen levels rather than
the two hundred the old square-root curve would hand out.

| hours | 8 | 75 | 300 | 1,000 | 10,000 |
|---|---|---|---|---|---|
| Depth | 4 | 7 | 9 | 11 | 14 |

Depth is **grey subtext on the skill row and never in the header**. It is the
only thing that gates difficulty tiers and the mastery discount: a tier cannot
be chosen on a skill the player has three hours in. Ranks by band — Initiate
1–3, Journeyman 4–6, Adept 7–9, Master 10–12, Grandmaster 13+.

**Grade** = `round(10 × log₂(pace))`, where `pace` = baseline minutes-per-unit
÷ current minutes-per-unit, with rework folded into true minutes so that fast
and sloppy cannot move it. **This is the score, and it can fall.**

| you are | at your baseline | 15% faster | 50% faster | twice as fast |
|---|---|---|---|---|
| Grade | 0 | 2 | 6 | 10 |

At a sustained 1% a day, Grade ticks **one level every seven days** — a
straight line, which is the whole point of a log scale: constant *percentage*
improvement becomes constant progress. A plateau stops the ticking on its own.
No rule enforces that; it is what the curve does.

### Right once (decided 2026-09-28)

Half the board is work you do not get to do twice. A released drawing becomes
cut metal; a wrong requisition costs weeks of lead time; a FAT fails in front
of the customer; a thing said in a meeting cannot be unsaid. The other half —
modelling a part, an internal draft, a training session — is cheap to redo.

The two halves reward opposite instincts, and scoring both on minutes-per-unit
would punish the right behaviour on the first half: slowing down to check a
drawing would read as getting worse.

**So for a one-shot skill the unit of output is a unit that did not come
back.** Nothing else changes — the same minutes-per-unit formula, with a
denominator that only counts what was right the first time.

| | minutes | first-time-right | per clean unit |
|---|---|---|---|
| ten drawings at 60 min, none returned | 600 | 10 | **60** |
| ten at 50 min, four returned needing 40 | 660 | 6 | **110** |

Rushing nearly doubles the real cost, and the formula has a true optimum:
120 minutes a drawing to get all ten clean is 120, worse than both. That is
"more with a limited amount of time" written as arithmetic.

**One-shot:** Inscription · Summoning · Trial · Deliverance · Parley ·
Council · Decree · Poise.
**Iterable:** Shaping · Interlock · Sundering · Quickening · Scribing ·
Might · Vigor · Alacrity · Concentration · Lore · Battle Orders · Bulwark ·
Tutelage.

**Focus belongs on the one-shot skills.** Expected cost is frequency × cost of
error, and on that side the cost of error is scrapped parts, a lost month, or
a customer watching. Deliberate practice on Shaping buys minutes; on
Inscription it buys a month.

### Complexity, and grading yourself (decided 2026-09-28)

**Minutes per drawing means nothing until drawings are comparable.** The
normalizer must be countable off the artifact and independent of how long the
work took — **time can never be a complexity factor**, because it is the thing
being measured and pace would collapse to 1.0. What counts: feature-tree
count, dimension count, sheets and views, part count, GD&T callouts — all
readable through the SOLIDWORKS API, which matters because a normalizer typed
in by hand will not survive three weeks. **New and revised are different
units**, not a multiplier on one.

Complexity **bins** rather than scales — Simple / Standard / Complex — and
like is compared with like. A continuous normalizer invites thirty redundant
dimensions; a bin boundary is not worth gaming, and over-dimensioning comes
back as a revision anyway.

**The player grades their own work at completion, and the grade is not the
score — the error is.** A three-point call, made before the world answers:
*clean · minor fixes expected · this will come back*, resolved against what
actually happened within 30 days.

| called it | what happened | reading |
|---|---|---|
| clean | three revisions | overconfident |
| will come back | nothing | underconfident |
| minor fixes | one minor fix | calibrated |

This is what makes self-assessment safe. If a high self-grade were the score,
inflating it would win; because **accuracy** is the score, inflating it loses
mechanically, and the honest call becomes the winning move without a rule
enforcing it. It also measures something worth having: whether the player can
tell good work from bad at the moment they finish it — the judgement they have
to rely on every day nobody gives them feedback.

Every skill therefore carries a third small figure beside Depth and Grade:
**Insight** — how close the call at completion lands to what the world says
after. Same shape as Augury: perfect calibration means only the easy ones are
being called.

### Rules the board needs

- **Season 0 is a baseline.** Grade is meaningless until a skill has a
  baseline, so the first four weeks of any skill are measured and not graded.
  A skill shows `Grade —` until its baseline closes.
- **Hearth is never graded.** No Grade, no pace, no trajectory, no streak.
  Hours are logged and the weekly satisfaction score is the only number near
  it. Scoring a relationship changes what the relationship is for.
- **Dormant skills do not go cold.** Poise is ridden twenty days a year in one
  quarter. Out of season it is not "not worked this week" — a nag that is
  always wrong teaches the player to ignore the list.
- **A perfect Augury score is a failure.** If every written claim comes true,
  the claims are too safe to be worth making. The target hit rate is about
  70%; 100% is a finding, not an achievement.
- **A season is 12 weeks**, matching the horizon already in Purpose. It is
  scored on slope held above zero and on which plateaus were broken — not on
  levels reached.

### Most tasks belong to no skill, and that is the point

A task joins a skill **only when it is an instance of that skill's unit of
output** — a modelled part, a released drawing, a req, a thread with a
question in it, a handoff. Everything else is left unclassified. Not
"miscellaneous": unclassified.

Forcing every task into a tree would be the worst thing the board could do to
itself. *Reimbursement*, *PO Receipt*, *Deliver to the room*, *Clear Tickets*,
*25G* are real work and real minutes, and none of them is an instance of
anything the player is getting better at. Filed under Summoning they would
poison minutes-per-req with things that are not reqs, and the meter would
drift while the player did nothing differently. A measure is only as good as
its denominator.

So the three numbers count different things, deliberately:

- **Points (fuel)** count *every* minute. The 720 cap is a budget of hours in
  a day and every hour spends from it, classified or not.
- **Depth** counts only the hours inside a skill.
- **Grade** counts only completed units of that skill.

**Toil** is the share of the week that belongs to no skill — work that pays
fuel and makes the player better at nothing. It is shown on the week's
grouping beside the trees, as a percentage, and it is the one number on the
board that is meant to go **down**. Driving it down is the whole operational
thesis in a single figure: the same output from fewer hours that teach nothing.

**Toil is measured once, and it is not pace.** Administrative work is where
doing it twice hurts most: a reimbursement filed wrong, a PO with the wrong
part number, a bounced requisition. The cost of the error is high *and* the
redo teaches nothing — a drawing redone at least leaves the player better at
drawings; a refiled expense report leaves them exactly where they were, minus
an hour. So Toil carries no Depth and no Grade, because nobody is trying to
become a master of expense reports, and exactly one number: **bounce rate**,
how often administrative work comes back. Its minutes count double when it
does.

Two scoreboards, wanting opposite things:

| | hours | quality meter | target |
|---|---|---|---|
| a skill | up or steady | pace on clean units | Grade climbing |
| Toil | **down** | bounce rate | **zero**, on fewer hours |

**The intervention for Toil is a checklist, not practice.** Deliberate
practice is for work with a craft in it. For a routine one-shot procedure the
answer is a template that cannot be filled in wrongly — make the mistake
impossible rather than get better at not making it. A Toil type that bounces
twice has earned a checklist, and the checklist retires it.

**Routing.** A task's skill comes from Planner's own skill for it where there
is one, else a rule the player keeps in Settings (project → skill, or a title
pattern → skill), else nothing. Classification is by unit of output, never by
topic: "Talk to Jeffery about Alcon" is a **Parley** only if it had a decision
to produce, and otherwise it is a moment with a duration.

### Objectives

Each skill carries a **target condition** stated before the season, and each
tree has a **boss**: an external audit that can fail, sat on a schedule.
Objectives are the player's to set each season; these are season one.

| skill | target condition, season one |
|---|---|
| Shaping | baseline over 20 parts, then −10% true minutes |
| Interlock | zero rebuild errors on any released assembly |
| Inscription | revisions per released drawing below 0.5 |
| Sundering | 30% of parts on the next machine are reused library parts |
| Summoning | second-req rate below 10% |
| Quickening | dry-run defect list under five |
| Trial | every FAT passes first time |
| Deliverance | 80% of projects land on the date given at kickoff |
| Scribing | median round-trips to resolution ≤ 2 |
| Parley | 80% of purposed conversations produce their decision |
| Council | a say-back asked for in every customer meeting; ≥80% correct |
| Augury | five claims a week with check dates; hit rate near 70% |
| Battle Orders | median chases per handoff ≤ 1 |
| Decree | under 20% of decisions reopened |
| Bulwark | escalations closed here, not forwarded |
| Tutelage | one person, one measurable improvement |
| Might | +5% estimated 1RM on the main lifts |
| Vigor | −3% on a benchmark distance |
| Poise | ride switch on a named grade, in season |
| Alacrity | −5% median reaction time |
| Concentration | median unbroken timer run ≥ 50 minutes |
| Lore | the course grade |

**Bosses**, in the order they are worth sitting:

| tree | boss | note |
|---|---|---|
| ARTIFICE | **CSWA** → **CSWP** → CSWPA Sheet Metal · Weldments · Drawing Tools → **CSWE** | CSWA has no prerequisite, 3h, 70%; CSWP is three segments, ~3.5h, 75%; each CSWPA needs a current CSWP; CSWE needs CSWP + four CSWPA at 85% |
| ARTIFICE (Sundering) | DFMA, or ASME GDTP for interface definition | no certification exists for modularity itself; the BOM is the instrument |
| CAMPAIGN | **Six Sigma Green Belt** — ASQ (3 years' experience, expects a real project) or IASSC (no prerequisite, exam only) | ASQ certifies what you have done, IASSC what you know |
| CAMPAIGN (Deliverance) | PMP / CAPM | |
| RHETORIC | STC CPTC · Toastmasters Pathways | thin, and the only tree whose boss is weaker than its meter |
| COMMAND | none credible | measured by chase count and decision durability alone |
| SINEW | the bar and the clock | the most honest audit on the board |
| ARCANA | the course grade | an external grader already attached |
| HEARTH | none, by design | |

**A boss is an audit, not a score.** Two or three a year cannot move a daily
trajectory — they can only confirm that the weekly meter was not lying. The
game runs on the meters; the certificate says the meters were honest.

## Points (= XP)

- Base = **estimated minutes × quality × 1 point/min**. Estimates: a repeated
  task (≥ 3 runs) uses its flow target in minutes (recent average − 5%), so it
  cannot be inflated; otherwise the task's own estimate. Planner tasks use their
  planned duration (phase 2). Benchmark calibration of the scale and of your
  estimates is phase 2; recalibration affects future tasks only.
- **Target** = recent average (last 5 runs) 5% better. Needs ≥ 3 runs.
- **Bonuses add up, capped at 2.5× base:** flow (hit target) +20%, personal
  best +25%, underdog (stat with least XP in the previous 7 days) +50%, combo
  +10% per chained task (next start ≤ 30 min after last end) up to +100%,
  **batch** +15% × position (same batch type, gap ≤ 10 min): the 1st task of
  a batch +0%, the 2nd +15%, the 3rd +30%. In a batch the batch bonus replaces
  the combo bonus. Rest — a rest task or a restoring moment (Rest, Meal) —
  pauses a combo, never breaks it.
- **Underdog when nothing was earned:** if every stat earned 0 XP in the
  previous 7 days (the first week, after a holiday), nobody is the underdog.
- Every completion stores the price it earned. Points never change later
  except through rework.

## Rework (heavily penalized)

- Penalty = **fix minutes × (points earned ÷ original minutes) × multiplier**.
  Multiplier: critical 2×; otherwise 1.5×, 1.75×, 2× for 1st, 2nd, 3rd+ rework
  of that completion. Example: 90 pts in 90 min, 60-min fix → 60 × 1 × 1.5 = 90.
- Rework subtracts the penalty from **XP (levels can drop)** and the charge
  from the balance; the task's true time becomes original + fix (for bests and
  targets) and its quality drops by the share redone: fix ÷ original minutes,
  so a 30-min fix on a 90-min job leaves quality at 2/3 of what was logged.
- Logged by the player or Claude, from a planner task reopened (phase 2), and
  the timer asks "is this rework of X?" when starting a task finished in the
  last 14 days.

## Corrections (decided 2026-09-28)

Rework is for work that was really done and then had to be redone. A
**correction** is for the other case: a record that should never have counted —
a completion logged twice, a tick that earned points for nothing, minutes typed
wrong. Events are write-once, so nothing is edited or deleted in place. A
correction is its own write-once event naming the event it corrects, and every
screen derives from the corrected records, so points, levels, balances and the
history follow at once while the original stays in the store.

- **Two kinds.** `void` withdraws the event: it stops counting anywhere —
  points, levels, balances, streaks, personal bests, targets, achievements, the
  replay — as if it had never been written. `amend` replaces named numbers on it
  and leaves the rest: **`minutes`**, **`points`** and **`note`**, and nothing
  else, because everything else is derived.
- **Any event can be corrected** (done, rework, purchase, energy, review,
  moment, skip, spend, visit) and a correction names exactly one event by id.
  Voiding a `done` also withdraws the rework logged against it: a penalty for
  a completion that never happened is not a debt.
- **A correction is honest about points.** An amended `points` is the number
  the player typed, not a reprice; a void simply removes the points the event
  carried. Nothing recomputes a price, so a correction cannot quietly rewrite
  the past the way calibration must never.
- **Corrections are events too.** Several may name one event and the latest
  wins field by field. A correction written in error is undone by deleting the
  correction record — the one deletion Flow allows, because it puts a record
  back rather than taking one away.
- **A reason is required**, in the player's words, and is shown beside the
  withdrawn record for as long as it exists.
- Corrections are the player's own, not something the app writes for itself.
  Nothing derives or automates them; when Flow itself should stop logging
  something, that is a rule, not a correction.

### Contract

- `makeCorrection(db, { target, kind, patch, reason, at })` → the record
  `{ id, type: 'correction', target, kind, patch, reason, at, day }`, or throws:
  no such event, a target that is not an event, a blank reason, an unknown
  kind, an `amend` of a field that is not amendable or with no field at all,
  and a `void` of an event already voided.
- `AMENDABLE = ['minutes', 'points', 'note']`.
- `index(records)` applies them: a voided event is in no list, an amended one
  carries its new numbers and `corrected: true`, and `db.corrections` holds
  them in time order with `db.correction` mapping target id → the corrections
  on it.
- App: the **Fix** screen lists the recent events with what each earned, and
  withdraws or amends one — or several at once, one reason for the batch — and
  lists the corrections made, each undoable.
- CLI: `flow fix <event-id> --void --reason "…"`, `flow fix <event-id>
  --minutes N --points N --reason "…"`, `flow fix --list`, `flow unfix <id>`.

## Shop and debt

- Rewards are **treat food and indulgences**, priced by the player (guide: a
  small treat ≈ one good day's points). Meals, sleep, medical and rest are
  never behind a paywall. Repeatable or one-off.
- **Socializing (incl. reaching out to Whitney) costs energy only, never points.**
- Debt allowed; **the part of any charge below zero costs double** (purchases
  and rework).

## Energy

- **Stamina** (body) and **mana** (mind), 0–10. The **morning rating** sets
  the day; tasks and moments drain; rest and meals restore.
- Task energy cost falls with skill level: × max(0.25, 1 − 0.075 × (level − 1)).
  Later tasks in a batch cost half the mana.
- Empty → warning, and the picker offers only rest/free (or due-soon) tasks.
  No penalty.

## The next task

Order: due soon (≤ 2 days) or overdue → affordable with today's energy →
underdog stat → skill closest to levelling. One suggestion plus alternatives.
Same-type batch tasks wait until 3 are waiting or one is due soon, then are
offered together ("Batch: 4 purchase requests").

## Streaks, reviews, achievements

Daily streaks forgive one missed day per week; weekly streaks count ISO weeks.
Weekly review = satisfaction + per-stat 0–10, win, lesson, one change — via the
app's form or a conversation with Claude that also rebalances tasks. **Due every
Sunday** (end of the Monday–Sunday week) when this week has no review yet, and
still due on the days after a week that was missed, until one is done. A new
player's first review is due on their first Sunday. One review per week; a
second in the same week replaces the first.

### The week in skills (decided 2026-09-28)

A week of completions is a pile of task names, and what it does not say is the
thing worth knowing: **which skill sets the week actually went into.** So the
review opens with the week grouped by skill, not by task.

- One row per skill worked this week, **longest first**: the true minutes
  spent (a completion's minutes plus any fix minutes logged against it), the
  points earned, how many runs, the share of the week, and the tasks inside it
  with their own runs and minutes.
- Skills roll up into their stat, so the week also reads as four to six
  numbers: where the week went at the level the player thinks in.
- Beside each, **the week before**: the change in minutes, so a skill being
  picked up or dropped is visible without doing arithmetic. Nothing else is
  inferred from one week — a week is too short to call a trend.
- A skill with no work this week is not a row. Moments are not work and are
  not counted. Rework minutes belong to the skill they were spent on.
- **What needs improving, not only where the time went.** Each row carries its
  **rework share** — fix minutes over true minutes — because that is where the
  week went wrong rather than merely where it went. And below the rows, the
  skills **not** worked this week, longest-cold first, with how long since each
  last was: a skill you keep not choosing is the one worth noticing.

Points are the fuel and the level is the receipt; neither says what is
improving. That is the trajectory (see below), and this grouping is what it is
measured over.

## Moments and places

- **Moments** = life that is not a task (Drive, Chat, Walk the floor,
  Laundry, Meal, Rest): a kind, a place, start/end, optional `who`. Energy per
  hour; **no points**. Logged by one-tap start/stop quick buttons, by Claude
  filling gaps at day's end, and from calendars (phase 2).
- **Daily moments:** a moment kind can be `daily` — reminded until done that
  day, with a streak that forgives one missed day a week. **Feed the pet**
  (decided with the player) is one: at the pet's cage in the home office
  (`place_office`), restores a little mana (−2/hour, so 15 min = +0.5), no points.
- **Places** belong to zones: home, road, factory, town, elsewhere. A task's
  place defaults from its skill.

## Day Replay (90s top-down adventure style)

- **Original** pixel art drawn in code (16-colour palette, 16×16 tiles). Not
  Nintendo's sprites, characters or names.
- End-of-day replay, ~1–2 minutes: one beat per event with a text box, walks
  1–2 s, idle fast-forwarded; 1×/2×/skip and a scrubber; tap a place to list
  what happened there.
- One overworld: Home (bedroom, kitchen, laundry), the Road, the Factory
  (floor, desk, meeting room, warehouse), Town (gym, restaurant, friends').
- Hero: one sprite, colours chosen once, outfit by context (hard hat on the
  floor, pyjamas at night). Named people appear as characters.
- Gaps: walk when the next event is elsewhere, otherwise idle — neutral, never
  judged. Phase 2: iOS Shortcuts geofence visits (named places only, no
  coordinates) make it exact.
- HUD: hearts = stamina, green magic bar = mana, gem counter = points, top
  skills as item slots, combo/batch banners.
- Finale: day totals, energy through the day with drains/restores, where time
  went, tomorrow's first task.
- Sound: original chiptune via WebAudio, **off by default**.

## Architecture

- A toolkit app: id **`flow`**, served by the Portal (Sign in with Google,
  PWA), synced by sync-kit in workspace `flow`, a Mac app via shell-kit later.
  Its screens use ui-kit's sci-fi HUD, and the handheld look in Game mode
  (see "Two looks"). No build step; vendored `ui-kit/` and `sync-kit/`
  (each repo's `scripts/copy-into.mjs`, with `--check`).
- Records: definitions (settings, stat, skill, task, reward, place, kind) are
  last-write-wins; events (done, rework, purchase, energy, review, moment) are
  write-once. See the header of `src/model.js`.
- Storage keys prefixed `flow.`; no external origins (fonts, CDNs); no app
  paths under `/w/` or `/assets/`.
- Claude: phase 1 a CLI (`cli/flow.mjs`) over sync-kit's `FileStore` +
  `HttpTransport` with a device token, driven by the `/flow` skill; phase 2 an
  MCP connector on the Portal for the Claude app.

## Phases

1. **Core loop + Day Replay:** the Portal app, the CLI and skill, the replay.
   ui-kit PR: register `flow`, retire `habit`.
2. Planner tasks, deadlines + reopen-as-rework (see Planner tasks), calendars (Google via the Portal's
   `/calendar/*`, Apple/Outlook via ICS), MCP connector, benchmark calibration,
   iOS Shortcuts geofence visits.
3. Mac app (shell-kit); the iOS app and Apple Health moved up (see iOS app), retire project-planner's character sheet.

Changes to other repos go in separate PRs, opened when their phase needs them.

## Inventory (phase 1.5)

Use what you already own before buying more. Skipping a purchase pays; buying
is allowed and simply visible.

- **Check before buying:** search ("You own 2: Desk drawer, Car"), a shopping
  list whose entries are flagged when the inventory has a match, and Claude
  asking in check-ins. Matching is fuzzy on name, aliases and category.
  (Phase 2: share a product page to Flow; barcode scan.)
- **Items:** name, category, aliases, storage place (a place; stash tabs are
  places), quantity, rough price, optional photo (a sync-kit asset), and for
  consumables a low-stock level — at or below it the item joins the shopping
  list by itself. Added by quick add (+photo) and by a room sweep with Claude.
  (Phase 2: order emails from Gmail with the player's go-ahead; barcode scan.)
- **Skip ("I have it"):** points = the price avoided, 1 point per dollar,
  capped at **100 points per day** across all skips. Points go to the balance
  and to "money saved"; **no XP** (no skill earned it).
- **Buy anyway:** records the money spent and adds or restocks the item — a
  purchase of something already owned adds to its quantity by itself; anything
  new becomes a new item. **No penalty.** The character sheet shows spent vs
  saved per month.
- **Decided details:** points round to the nearest dollar ($12.49 → 12) while
  money saved keeps the cents; money saved is the full price avoided even past
  the cap ($150 skipped → 100 points, $150 saved); the daily cap counts the
  skips before this one's own time that day (a charge is priced at its time);
  a low-stock item asks for enough to get back to its **usual** quantity
  (`usual`, default lowStock + 1; have 1, usual 4 → buy 3).
- **Equip:** loadouts per context (Work bag, Gym bag, Car, Desk…) fill slots
  Head, Body, Legs, Feet, Hands, Bag, Tech, Vehicle; one loadout is active; each has a
  packing checklist; items are *in use* (equipped in any loadout) or *stored*.
  The replay hero wears the active loadout.
- **Gear bonus grows with use, never with buying:** an item linked to a skill
  earns +1% for every 10 completions of that skill's tasks done while it was
  equipped in the active loadout, up to +10%. Only the best such item counts
  (no stacking). New gear starts at +0%. It is one more bonus inside the 2.5×
  cap. Each completion records the gear equipped at the time, so the count is
  a fact, not a guess.

### Contract (write the tests against this before the code)

Records — definitions (last-write-wins): `item`, `loadout`, `wish`.
Events (write-once): `skip`, `spend`.

```js
makeItem(db, { name, category = '', aliases = [], place = null, qty = 1, price = 0,
  consumable = false, lowStock = 0, usual = lowStock + 1, skills = [], slot = null, photo = null })
                              // → item record; a slot outside SLOTS throws
findItems(db, query)          // → [{ item, score }] best first; matches name, aliases, category
makeSkip(db, { query, price, item = null, at })   // → { type:'skip', …, price, points } points capped per day
makeSpend(db, { name, price, item = null, qty = 1, at })   // → { type:'spend', …, price }
restockFor(db, spend)         // → the item record to write with it: the owned item with qty + spend.qty,
                              //   or a new item { name, qty, price } when the spend names no item
makeWish(db, { name, qty = 1 })                   // → wish record
shoppingList(db)              // → [{ name, qty, wish?, lowStock?, matches: [{ item, score }] }]
makeLoadout(db, { name, slots = {}, active = false })   // slots: { head, body, legs, feet, hands, bag, tech, vehicle } → item ids
activeLoadout(db)             // → loadout or null; if several are active, the latest written wins
gearBonus(db, task, at)       // → { item, uses, bonus } for the best linked item, bonus 0–0.10;
                              //   { item: null, uses: 0, bonus: 0 } when none is equipped
inventory(records, now = Date.now())
                              // → { items, stashes:[{place (id), items}], loadouts, active, inUse: Set of item ids,
                              //     lowStock, moneySaved, savedThisMonth, spentThisMonth, skipsToday: [skip records] }
                              //   equipped items still appear in their stash
```

`makeDone` gains `gear: [itemIds]` (the active loadout's items at the time)
and `price.bonuses.gear`; `balanceOf` adds skip points; constants
`SKIP_POINTS_PER_DOLLAR = 1`, `SKIP_DAILY_CAP = 100`, `GEAR_STEP_USES = 10`,
`GEAR_STEP = 0.01`, `GEAR_MAX = 0.10`, `SLOTS`.

## Art direction (decided after concept rounds)

**Isometric pixel art in the spirit of 16-bit adventure games** — the original
Day Replay's charm (bright palette, hearts, magic bar, gem counter, clock, the
framed text box with a speaker name tab), redrawn as an **isometric** world.
The player compared concepts in StarCraft, Diablo 1/2/Resurrected and Sims styles
and chose this one "first", **with all the metric bars and the inventory system**.

- **Rendering:** drawn at low resolution (640×360 logical) with hard pixel edges
  and a limited palette (≤ 64 colours, no smoothing), shown at an integer scale.
- **World:** 2:1 isometric tiles; zones Home, Road, Factory, Town as isometric
  buildings (house, cottage, factory with window bands and roller door,
  warehouse), paths, trees, crates; the hero walks between places.
- **The hero wears the active loadout:** head, body, legs, feet items are drawn
  on the sprite (e.g. hard hat, white shirt, jeans, work boots), large enough
  to read (~16×32 px). NPCs from moments with `who`.
- **Top HUD:** hearts = stamina, magic bar = mana, gem counter = points,
  combo/batch banner, clock.
- **Text box:** framed, speaker name tab, time and place, the event and its
  points breakdown.
- **Side panel (tabs STATS · GEAR · SHOP):** every meter (stamina, mana, each
  stat with its level and the underdog marker, XP to next level); GEAR = the
  paper doll (Tech, Head, Bag, Hands, Body, Feet, Car key, Legs, Home key) with
  the loadout name and gear bonus, then stash tabs per storage place as a grid
  with item tooltips ("HDMI cable ×2 · Desk drawer, Car · Skip buying +15 pts"),
  and money saved vs spent.

Original work only — no copied sprites, icons, fonts or UI from any game.

Original work only: no Blizzard (or any game's) art, units, icons, UI frames,
faction names or sounds — "inspired by the genre and its polish".

### Two looks: the HUD by default, the handheld in Game mode (decided 2026-09-28)

The player, on seeing both: keep the sci-fi strategy HUD (ui-kit, the
StarCraft-inspired look Flow shipped with) as **the** look of the app, and
switch to the handheld look below **only in Game mode**.

- **HUD (default):** ui-kit's sci-fi HUD — the left sidebar of screens with
  hex icons, the header with the view title, gem points and level, dark
  panels, the sync status at the foot of the sidebar; on a phone the sidebar
  becomes a bottom bar. This is the look of every screen, the iPhone Terminal
  included, unless Game mode is on.
- **Game mode:** a switch in the header (and in Settings) turns on the
  handheld look described below for every screen; switching back restores the
  HUD. The choice is per device (`flow.mode`: 'hud' | 'game') and is
  remembered; nothing about the records changes.
- The Day Replay and Play screens draw the game in both looks — only the
  chrome around them changes.

### The handheld look (Game mode)

(First asked for as "ui of rest of the system just need to match the ui of the
game"; now the Game-mode look, see above.) In Game mode every screen — Now, Tasks, Skills, Bag, Shop, Review, Play, Replay, Settings, Rules —
takes the handheld-console look of the replay's lower screen, replacing the
ui-kit sci-fi HUD inside Flow (the Portal's shared top bar stays):

- A 4:3 lower-screen frame on desktop, full width on a phone; a light panel
  palette (cream panels, dark navy ink, one accent per tab), 2 px dark outlines,
  hard pixel corners, no gradients, glows or blur.
- A pixel-style font drawn from the page's own CSS (no external fonts) —
  `image-rendering: pixelated` for icons; icons are original pixel sprites.
- Big touch buttons (≥ 44 px) in a bottom tab row; the framed text box with a
  speaker tab for toasts and confirmations; hearts / magic bar / gem counter
  as the status strip on every screen.
- **Bag** is a new screen: the paper doll and loadouts, stash per storage
  place, "have it" lookups and skips — what the CLI's `inventory`, `have`,
  `loadout`, `skip` already do.

Original work only, as above. The replay's personal version (the player's own
home and workplace, and real colleagues) is kept off this public repository;
the Replay tab here draws the generic world above.

## iOS app (decided 2026-09-28)

Flow ships as an iPhone app (paid Apple Developer account: TestFlight, then
the App Store), built on **shell-kit**'s iOS shell — the same web app, bundled
and served offline from the app, paired with the Portal for sync exactly as
the Mac shell pairs. The web code stays the product; Swift adds only what a
page cannot do. The Xcode project lives in `ios/`; the developer team and
bundle id prefix come from a local, uncommitted `ios/Local.xcconfig`.

- **Lock-screen timer.** Starting the timer (Now or Play) starts a Live
  Activity — task title, elapsed time, the place — on the Lock Screen and
  Dynamic Island; stopping or cancelling ends it. Its **Finish** button opens
  Flow at Log done for that task with the timer's minutes filled in (value and
  quality are still the player's to confirm).
- **Home-screen widget** (small and medium): stamina, mana, points, level and
  the next task; tapping the task opens Flow and starts its timer. The page
  writes a snapshot to the app group on every change; the widget never
  computes rules itself.
- **Arrive / leave places.** In Settings the player marks named Flow places
  ("Set to where I am now") for geofencing; the coordinates stay on the device
  only — never in a record, a sync, a log or a repository. Arriving and leaving
  write a **`visit`** event `{ place, arrive, leave }` (write-once). Leaving
  one geofenced place and arriving at another within 3 hours also writes a
  Drive moment for the time between (skipped when a moment already covers it).
  The replay uses visits to put the hero in the right place.
- **Apple Health, read-only.** Last night's sleep and yesterday's steps are
  shown with the morning rating as a **suggestion** (sleep ≥ 7.5 h → 8, ≥ 6.5 h
  → 6, less → 4; +1 when yesterday had ≥ 8 000 steps, max 10). The player's
  own rating is what counts; nothing is written to Health, and Health data is
  never stored in Flow's records beyond the rating the player picks.
- Every native feature degrades cleanly: in a browser, or with a permission
  refused, the page works as it does today.

## Terminal: the iPhone app (decided 2026-09-28)

The iPhone app is Flow's **Terminal** (终端): the place the player picks a
project to work on, adds tasks to it and times the work. It is separate from
the game and the day's replay, which stay on the desktop and web app. It is
installed like Heptabase's iPhone app — built on the Mac and installed on the
connected iPhone with one command (`npm run ios:install`), and it opens
anywhere, offline, syncing through the Portal when online.

- **Screens:** Projects → a project's tasks → the timer. A status strip at the
  top (stamina hearts, mana bar, points, level) and an **I'm tired** button;
  nothing else from the game. The handheld look of the app's screens.
- **Projects** are Planner's plans (not archived, not templates) that have at
  least one task for the player, pinned first, then by name; each shows its
  open task count, the next deadline and time logged this week.
- **Tasks:** the project's open leaf tasks for the player (Planner tasks as
  above), each with Start. **+ Add task** takes a name and, optionally, hours
  and a deadline, and adds it **to the Planner project** (see Writing to
  Planner); it appears at once, marked "sending to Planner" until Planner has
  it, and can be started straight away.
- **Timer:** one at a time, the same device timer as Now and Play
  (`flow.timer`), with the Live Activity on the Lock Screen. Stopping it logs
  the completion in Flow exactly as Log done does (points, energy, rework
  question) **and** a timesheet entry on that Planner task (date, start, hours
  = the timer's minutes / 60, the player as resource). **Pause** stops the
  clock without finishing: it writes the timesheet entry only, and the task
  stays open — Flow logs its completion when it is finished (in the Terminal,
  or ticked off in Planner, which the Planner rules then log).
- **I'm tired:** Body, Mind or Both, and A bit / Very / Wiped out. It writes an
  energy check-in now (`makeEnergy`, `feeling: 'tired'`) with the chosen
  meter(s) at min(current, 6 / 3 / 1) and the others unchanged; from then the
  day's energy runs from it, as from the morning rating, so the next-task
  picker leans to rest when a meter is low. It is available on Now as well,
  and the replay shows it as a moment of the day.

### Writing to Planner

Flow never rewrites a plan. It writes **operations** into Planner's
`project` workspace, and Planner applies them to the plan itself, so an
unsaved edit in Planner is never overwritten (Planner's own rule).

- An operation is a write-once record `{ id, type: 'flow.op', op, plan, at,
  origin, ... }`:
  - `op: 'addTask'` — `task: { id, name, work (hours) | null, deadline |
    null }`. The task id is made by Flow (`t_flow_<random>`) so the task Flow
    shows before and after Planner applies it is the same task. Planner
    appends it at the end of the plan at outline level 1, assigned to the
    player's resource when the plan has one by the player's Planner name,
    else unassigned.
  - `op: 'timesheet'` — `task, date, start (minutes into the day), hours,
    note: 'Flow timer'`, resource as above.
- Planner applies every operation for a plan it holds, once, and records the
  ids it applied in the plan (`appliedOps`, kept for 90 days), which is how a
  second device or a re-sync never applies one twice. An operation for a plan
  that no longer exists, or a task that no longer exists, is skipped and
  remembered as applied.
- Until an `addTask` is applied, Flow derives the task from the operation
  itself (same id, estimate from the hours, else 30 min) so it can be timed
  and completed; completions keep pointing at the same id afterwards.
- This replaces "Read-only both ways" above for these two operations only;
  Flow still never edits or completes a Planner task (the player ticks it off
  in Planner, and Flow logs it as above).

## Play (decided 2026-09-28)

A **Play** tab runs the game inside Flow, on the same records and the same
device timer (`flow.timer`) as the Now screen, so work started in one can be
finished in the other.

- **Input, two ways:** a **TASKS** button on the lower screen works anywhere;
  walking up to the player's desk or PC and pressing the action button opens
  the same menu. The menu lists what Now's "Next" lists (Planner tasks
  included) and offers:
  - **Start** — starts the timer on a task; asks "Is this rework of …?" exactly
    as the timer does on Now.
  - **Finish** — stops the timer (or, with no timer, asks the minutes) and
    asks the measure's value and the quality as Log done does; the text box
    then shows the points breakdown. Planner tasks finished here are logged in
    Flow only (Planner stays read-only).
  - **New task** — the title on the on-screen letter grid used for the name
    entry, then estimate (15/30/45/60/90/120 min or typed), skill, cadence,
    critical; written with `makeTask`. Always a Flow task, never a Planner one.
  - **Cancel timer.**
  Every write goes through the same model functions (`makeDone`, `makeTask`,
  `makeRework`) and the same sync as the app; nothing is game-only.
- **The world is data.** The public repository carries the engine and a
  generic world (a generic home, road, workplace with a lot and a floor, a
  shop and a restaurant; made-up NPC names). The player's own home, workplace,
  car, colleagues and their lines are a private **world pack**: a `world`
  record in Flow's workspace (a definition, last-write-wins), imported once in
  Settings from a `flow.world` JSON file and synced to the player's other
  devices like their tasks. It is never committed to any repository. Removing
  it returns the generic world.
- **World pack format** (`format: 'flow.world'`, `version: 1`): name, player
  car, levels (id, name, size, rooms, doors, furniture with model ids,
  exits), map places (id, name, kind: home | work | shop | food | other,
  position), NPCs (id, name, level, position, sprite options, dialogue lines,
  choices → `talk` | `walk` (a lap: +points as a moment) | `battle` (lines
  list) | `app` (lines) | `leave`), and the desk position(s) that open TASKS.
  Unknown keys are ignored; an invalid pack is refused with the reason and
  never half-applied.
- **One game, two clocks.** Play runs on the **real clock**: the HUD clock is
  the time now, day and night follow it, the meters are the live ones, and a
  running timer shows the hero at that task's place working with the elapsed
  time. **Replay is the same game in fast forward** over a chosen day's
  records: the hero walks the day's events in order (1×/2×/skip, scrubber, as
  in Day Replay), in the same world — generic or the player's pack — and
  input is off while replaying.
- The generic world and the pack share one engine: 256×192 lower/upper screens
  at 4:3, the DS-style 3D rooms, chibi sprites, text box and menus.

## Planner tasks (phase 2, decided 2026-09-28)

Tasks come from **Project Planner** (toolkit app `project`), synced through the
same server. Flow reads Planner's workspace **read-only**: it never writes a
plan. Flow's own tasks (dailies, habits, chores) stay alongside.

- **Which:** leaf tasks (not summaries, not milestones, not archived, not
  cancelled) of plans that are neither archived nor templates, **assigned to
  the player**: no assignment at all (a plan of one's own work is "me"), or an
  assignment to a resource whose name matches the player's Planner name
  (Settings, defaulting to the player's name; case- and space-insensitive).
- **Done in Planner is done in Flow** (decided 2026-09-28): a Planner task
  with a done time (100%) is never offered as open in Flow — not on Now, not
  in Tasks' open list, not in Play or the Terminal — whether or not Flow logged
  it (history before the cutoff below is not logged, but it is still done).
  Reopened in Planner, it is open again.
- **Today is Planner's Today** (decided 2026-09-28): Planner publishes the day
  its calendar laid (an `agenda` record, its `model/dayplan.js`), and a Planner
  task that is not on it is not today's work — it is somewhere in a backlog
  that on a real planner runs to hundreds of tasks going back years. It is not
  offered anywhere: not on Now, not in Tasks, not in Play's Start menu, not in
  the Terminal, and the picker never suggests it. It stays in the index, so a
  stored completion keeps its title and skill. Flow's own tasks are not
  Planner's to schedule and are never hidden by this. A day published with
  nothing on it is a real answer — by the evening Planner has rolled what is
  left to tomorrow — so the Planner list is then empty and the screen says the
  day is clear, with everything Planner has one toggle away. Only a day
  Planner has **never** published hides nothing and offers the backlog as
  today's list.
- **Shape:** each becomes a derived Flow task — never stored — with id
  `task_pl_<planId>_<taskId>`, title the task's name, project name shown,
  measure `time`, cadence `once`, `source: { app: 'project', plan, task }`:
  - **estimate** = Planner's expected work in minutes: the task's stated `work`
    hours × 60, else duration (days) × the plan's hours per day × the plan's
    assumed load (default 100%) × 60; at least 1 minute.
  - **deadline** = Planner's deadline; **urgent** when urgency is `now` or
    `high` (so critical, per Shape).
  - **skill** = Planner's own skill for it (the task's, else the project's,
    else its folder or workspace name, else the project name), matched to a
    Flow skill by name case-insensitively; an unmatched name becomes a derived
    skill `skill_pl_<slug>` under the Work stat (the stat with id `stat_work`,
    else the first stat).
  - **energy:** Planner's physical → stamina, mental (the default) → mana,
    2 per hour of estimate, rounded to 0.5, capped at 10.
- **Done in Planner = logged in Flow.** When a Planner task has a done time
  (`doneAt`, set at 100%) and Flow holds no completion covering it, Flow writes
  one: id `done_pl_<planId>_<taskId>_<doneAt ms>` (the same on every device, so
  two devices noticing it write the same record), ending at `doneAt`, minutes =
  the estimate, quality 1, `planner: <doneAt ISO>`, priced by the normal rules.
  A Flow completion covers it when it is for that task and either carries that
  same `planner` time or ended no more than 24 h before `doneAt` with no later
  Planner completion covered by it (the timer or Log done got there first).
- **Planner changed its mind** (decided 2026-09-28): a Planner completion's
  minutes are the estimate at the moment it was logged, and an event is never
  rewritten — so correcting the plan afterwards cannot reach back into Flow.
  Instead Flow **notices and offers**: when the plan's expected work for a task
  no longer matches the minutes Flow logged, the Fix screen lists it — what
  Flow logged, what Planner says now — and one press writes the amendment, with
  Planner's own numbers as the reason. Never automatic: a completion the player
  timed is what really happened whatever the plan says, so only completions
  priced from the estimate are offered, and one already corrected by hand is
  left alone.
- **Reopen = rework.** A Planner task finished again (a new `doneAt` later than
  24 h after the completion that covered the previous one) is rework of that
  completion. Fix minutes = Planner timesheet hours on that task dated after
  the earlier completion, × 60; when there are none, Flow asks "Reopened in
  Planner: how long did the fix take?" on Now and logs the rework with the
  answer. Rework already logged against that completion after it (the timer's
  "is this rework?") covers it; nothing is charged twice.
- **Read-only both ways:** completing a Planner task in Flow does not change
  the plan; the player ticks it off in Planner. Editing a Planner task in Flow
  is not offered (its row links to Planner instead).
- **Where from:** the app reads the `project` workspace through the Portal
  session (or the pasted server + token) into its own read-only store; the CLI
  reads it with `flow planner pull` over the same `HttpTransport`, or
  `flow planner import <store-export.json>` from Planner's Settings ▸ export.
- **From when:** Planner history before Flow first reads it is not logged.
  The first successful read stamps `settings.plannerSince` (ms, written once,
  never moved later). The cutoff is the **start of that day** (local
  midnight of the day plannerSince falls on, decided 2026-09-28 after the
  player connected late in a day and that day's work went unlogged): only
  Planner completions with doneAt on or after it are logged or treated as
  reopens; earlier ones are history. Completions and
  reopens are still logged for tasks of a plan that has since been archived
  (the list of tasks to do excludes archived plans, the history does not);
  templates never count.

### Contract

`src/planner.js` (pure, no I/O):

- `plannerTasks(planRecords, { me, skills, stats })` → `{ tasks, skills }`,
  the derived definitions above, from sync-kit document records
  (`type: 'document'`, `format: 'project-planner'`, `body` = Planner's saved
  JSON). Unreadable bodies are skipped, never thrown.
- `plannerEvents(db, planRecords, { me, now, since })` → `{ done: [...],
  rework: [...], ask: [{ done, task, title }] }`: the records Flow should write
  now and the fix-minutes questions to show, for Planner completions with
  doneAt ≥ `since` (`settings.plannerSince`). With no `since` it logs nothing:
  it needs the stamp. Idempotent: applying its output and calling it again
  returns nothing new.

## Difficulty

Five named tiers change how hard the game plays. The default is **Push**,
which is the game described above, unchanged. A tier changes four things
together: harder targets, bigger rewards, less forgiveness and tighter energy.

| Tier | Unlocks at level | Points × | Target step | Rework + | Debt × | Energy cost × | Grace days / 7 |
|---|---|---|---|---|---|---|---|
| Steady | 1 | 0.8 | 3% | −0.25 | 1.5 | 0.85 | 2 |
| **Push** (default) | 1 | 1 | 5% | 0 | 2 | 1 | 1 |
| Grind | 3 | 1.25 | 8% | +0.25 | 2 | 1.15 | 1 |
| Relentless | 6 | 1.5 | 11% | +0.5 | 2.5 | 1.3 | 0 |
| Legend | 10 | 2 | 15% | +0.75 | 3 | 1.5 | 0 |

- **Points ×** applies after the 2.5× bonus cap:
  `points = base × min(2.5, 1 + bonuses) × tier.points`.
- **Target step** replaces the 5% in both the flow target and the
  history-based estimate.
- **Rework +** is added to the rework multiplier (1.5 / 1.75 / 2, and 2 for
  critical work). Rework uses the tier its completion was priced at: a Legend
  job reworked is a Legend rework.
- **Debt ×** replaces the 2× on the part of a charge below zero. A purchase
  uses the global tier on its day. A rework uses its completion's tier.
- **Energy cost ×** multiplies positive task costs after mastery and batch
  discounts. Restoring amounts are never scaled.
- **Grace days** is how many missed days a daily streak forgives in any
  7-day stretch.

**Global plus per-skill.** A global tier applies to every skill, and a skill
can override it (for example Legend on Run and Steady on Mail). A task plays
at its skill's tier.

**Changing it.** Difficulty is set only in a weekly review, through the
review's `difficulty: { tier, skills }`. It takes effect the day after the
review. With Sunday reviews, that makes it next week's setting. A review
without `difficulty` keeps the previous setting. A review with one replaces
the whole setting, so a skill left out goes back to the global tier. Before
any review sets it, everything is at Push.

**Unlocking.** Raising the global tier needs the player's level to be at least
the tier's unlock level. Raising a skill's override needs that skill's level
to be at least the unlock level. Choosing a tier you have not unlocked is
refused. Lowering is always allowed, and a tier you already chose stays in
effect even if your level later falls.

Every price snapshots its tier (`price.difficulty`), so changing difficulty
never changes points you have already earned.

### Contract

- `DIFFICULTY`: an array, easiest first, of
  `{ id, name, unlock, points, targetStep, reworkAdd, debt, energy, grace }`.
  Ids are `steady`, `push`, `grind`, `relentless`, `legend`.
  `DEFAULT_DIFFICULTY = 'push'`.
- `difficultyOn(db, day, skillId?)` returns the tier record in effect.
- `makeReview(db, { …, difficulty: { tier, skills } })` validates the tiers
  and unlocks at the review's time, and stores `difficulty` on the review.
- `priceDone(...)` returns `difficulty` (the tier id).
- `makeRework` returns `difficulty` and uses its numbers.
- `makePurchase` returns `difficulty` and uses its debt multiplier.
- `chargeFor(balance, amount, debt = DEBT_MULTIPLIER)`.
- `dailyStreak(days, day, grace = 1)`.
- `play(...).difficulty` is
  `{ tier, name, skills: {skillId: tierId}, unlocked: [ids], next: {id, name, unlock} | null, changesAt: 'review' }`.
- CLI: `flow difficulty` shows the current setting and the unlocks.
  `flow review … --difficulty <tier> [--skill-difficulty <skill>=<tier> …]`
  sets it.
- App: the review screen shows the five tiers as cards (locked ones greyed
  out, each showing its level), with per-skill overrides below them.
