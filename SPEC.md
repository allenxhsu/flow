# Flow — the spec

Every decision below was settled with the player in a grilling session
(Matt Pocock's `grill-me`). Build to it; when something here is ambiguous,
ask rather than guess. `src/model.js` is the executable form of the rules and
the contract every other part builds on.

## Purpose

Doing similar tasks **faster or better**, until the day feels like flow in a
game. Success after 12 weeks = still checking in ≥ 5 days a week **and** weekly
life satisfaction up ≥ 1 point. One player.

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
  **batch** +15% × position (same batch type, gap ≤ 10 min). In a batch the
  batch bonus replaces the combo bonus. Rest pauses a combo, never breaks it.
- Every completion stores the price it earned. Points never change later
  except through rework.

## Rework (heavily penalized)

- Penalty = **fix minutes × (points earned ÷ original minutes) × multiplier**.
  Multiplier: critical 2×; otherwise 1.5×, 1.75×, 2× for 1st, 2nd, 3rd+ rework
  of that completion. Example: 90 pts in 90 min, 60-min fix → 60 × 1 × 1.5 = 90.
- Rework subtracts the penalty from **XP (levels can drop)** and the charge
  from the balance; the task's true time becomes original + fix (for bests and
  targets) and its quality drops by the share redone.
- Logged by the player or Claude, from a planner task reopened (phase 2), and
  the timer asks "is this rework of X?" when starting a task finished in the
  last 14 days.

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
app's form or a conversation with Claude that also rebalances tasks.

## Moments and places

- **Moments** = life that is not a task (Drive, Chat, Walk the floor,
  Laundry, Meal, Rest): a kind, a place, start/end, optional `who`. Energy per
  hour; **no points**. Logged by one-tap start/stop quick buttons, by Claude
  filling gaps at day's end, and from calendars (phase 2).
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
  PWA), synced by sync-kit in workspace `flow`, styled with ui-kit, a Mac app
  via shell-kit later. No build step; vendored `ui-kit/` and `sync-kit/`
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
2. Planner deadlines + reopen-as-rework, calendars (Google via the Portal's
   `/calendar/*`, Apple/Outlook via ICS), MCP connector, benchmark calibration,
   iOS Shortcuts geofence visits.
3. Mac app (shell-kit), Apple Health, retire project-planner's character sheet.

Changes to other repos go in separate PRs, opened when their phase needs them.
