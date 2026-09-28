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
playable Day Replay (walking the house, the drive, the lot and the shop floor)
is a side quest for replaying the day, never the way work gets logged, and
the app's screens take their look from it.

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
2. Planner tasks, deadlines + reopen-as-rework (see Planner tasks), calendars (Google via the Portal's
   `/calendar/*`, Apple/Outlook via ICS), MCP connector, benchmark calibration,
   iOS Shortcuts geofence visits.
3. Mac app (shell-kit), Apple Health, retire project-planner's character sheet.

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

## House inventory (decided 2026-09-28)

The Bag doubles as the **house inventory**: where everything in the house is,
down to the shelf and the box. It uses the same `item` and `place` records as
the rest of the inventory, in workspace `flow`, so an item filed in a box
here is the item "I have it" finds, the shopping list matches and a loadout
equips. There is no second copy and no import.

- **Places nest.** A place can sit inside another: Garage › Shelf B › Box 3.
  `place.parent` is a place id or null (top level). A place made inside
  another takes its zone unless given one. A place can never be put inside
  itself or anything inside it. The replay, tasks, skills and moments keep
  using places exactly as before; nesting only changes how the Bag shows them.
- **Deleting a place never deletes what is in it.** Its items and the places
  inside it move up to its parent — to *Unfiled* (no place) when it was at
  the top level — and so do tasks and skills that were set there. Moments
  keep the place they happened at.
- **Items carry the house-inventory details** besides the phase 1.5 fields:
  `brand`, `model`, `serial`, `bought` (the purchase day), `warranty` (the
  day it runs out), `notes`, and lists of photos and receipts. `price` stays
  the price of one.
- **Photos and receipts are `file` records**, because sync-kit has no asset
  store yet: an event, written once, holding the file itself as base64 with
  its name and type. The item lists them in order (`photos`, `receipts`: file
  ids). Photos are resized in the page to at most **1024 px** on the long side
  (JPEG) before they are written; any file is at most **2 MB**. Taking one off
  an item removes its id from the list; the file record stays, as every event
  does. (When sync-kit gains assets, file records move there.)
- **Finding things.** A search box finds items when every word of the query
  appears in the item's name, aliases, category, brand, model, serial, notes
  or the names of the places it is in — so "garage drill" finds the drill in
  the garage, and a box's name finds what is in it. Each result shows its full
  place path. This is separate from "I have it" matching, which stays as it is.
- **Browse by place:** the Bag shows the place tree with a count per place
  (everything inside it, at any depth). Selecting a place lists what is in it
  and in the places inside it.
- **Box labels:** a printable sheet per place listing what is in it — its own
  items first, then each place inside it under its path — to tape on the box.
- **CSV:** every listed item as a row, sorted by place path then name:
  Name, Place, Quantity, Category, Brand, Model, Serial, Bought, Price,
  Warranty, Photos (count), Receipts (count), Notes. A cell starting with
  `= + - @` is written as text (a leading `'`), so a spreadsheet never runs it.

### Contract

```js
makePlace(db, { name, zone, parent = null })   // zone defaults to the parent's, else 'elsewhere'; a missing parent throws
placePath(db, placeId)        // → [place, …] top level first, the place last; [] for none or an unknown id
placesWithin(db, placeId)     // → Set of place ids: the place and every place inside it, at any depth
placeTree(db)                 // → [{ place, depth }] depth first, siblings by name; a place whose parent is gone is top level
movePlace(db, placeId, parent)   // → the place record with its new parent (null = top level); into itself throws
placeRemoval(db, placeId)     // → the item, place, task and skill records to write with the place's tombstone
makeItem(db, { …, brand = '', model = '', serial = '', bought = null, warranty = null, notes = '',
  photos = [], receipts = [] })  // bought/warranty 'YYYY-MM-DD' or null; a bad day throws
makeFile(db, { item, kind, name, mime, data, at })   // kind 'photo' | 'receipt'; → { id: 'file_…', type: 'file',
                              //   item, kind, name, mime, data, size (bytes), day, at }; over FILE_MAX_BYTES throws
filesOf(db, item)             // → { photos: [file], receipts: [file] } in the item's order; ids not (yet) synced are skipped
searchItems(db, query, placeId = null)   // → [{ item, path }]: every word matches; only inside placeId (any depth) when given;
                              //   sorted by path names then item name; an empty query lists them all
inventoryCSV(db, items)       // → the CSV text above, CRLF line ends, header first
labelSheet(db, placeId)       // → { place, path, lines: [{ heading } | { item, name, qty }] }
```

`FILE_MAX_BYTES = 2 * 1024 * 1024`, `PHOTO_MAX_PX = 1024`. `file` is an event
(after `spend` in `RECORD_TYPES`); `index()` gains `files` and `file` (a Map).
`inventory()`'s stashes gain `path` (place names, top level first).

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

### The app's screens match the game (decided 2026-09-28)

The player: "ui of rest of the system just need to match the ui of the game".
Every screen — Now, Tasks, Skills, Bag, Shop, Review, Replay, Settings, Rules —
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

## Planner tasks (phase 2, decided 2026-09-28)

Tasks come from **Project Planner** (toolkit app `project`), synced through the
same server. Flow reads Planner's workspace **read-only**: it never writes a
plan. Flow's own tasks (dailies, habits, chores) stay alongside.

- **Which:** leaf tasks (not summaries, not milestones, not archived, not
  cancelled) of plans that are neither archived nor templates, **assigned to
  the player**: no assignment at all (a plan of one's own work is "me"), or an
  assignment to a resource whose name matches the player's Planner name
  (Settings, defaulting to the player's name; case- and space-insensitive).
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

### Contract

`src/planner.js` (pure, no I/O):

- `plannerTasks(planRecords, { me, skills, stats })` → `{ tasks, skills }`,
  the derived definitions above, from sync-kit document records
  (`type: 'document'`, `format: 'project-planner'`, `body` = Planner's saved
  JSON). Unreadable bodies are skipped, never thrown.
- `plannerEvents(db, planRecords, { me, now })` → `{ done: [...], rework:
  [...], ask: [{ done, task, title }] }`: the records Flow should write now and
  the fix-minutes questions to show. Idempotent: applying its output and
  calling it again returns nothing new.

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
