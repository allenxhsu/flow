// Rules: how the scoring works, in words. The numbers come from src/model.js,
// so this page cannot drift from what the game actually does.

import { BONUS, BONUS_CAP, COMBO_GAP_MIN, BATCH_GAP_MIN, BATCH_RELEASE, DEADLINE_SOON_DAYS, HISTORY_RUNS, HISTORY_MIN_RUNS, TARGET_STEP, MASTERY_STEP, MASTERY_FLOOR, BATCH_MANA_SHARE, REWORK_MULTIPLIERS, REWORK_CRITICAL, DEBT_MULTIPLIER, PLAYER_STEP, STAT_STEP, SKILL_STEP, REWORK_ASK_DAYS } from '../model.js';

const pc = (x) => `${Math.round(x * 100)}%`;

export function render() {
  return `<div class="view"><article class="sc-panel pad prose" id="rules">
    <h2>The rules</h2>
    <p>Flow is about doing similar tasks <b>faster or better</b>, until the day feels like flow in a game. Success after 12 weeks: still checking in five days a week, and weekly life satisfaction up a point.</p>

    <h3>Shape</h3>
    <ul>
      <li><b>Stats → skills → tasks.</b> Four to six stats of your choosing; skills sit under stats and level up.</li>
      <li>A task has a measure (time, count or quality), a cadence (daily, weekly, once, anytime), an estimate in minutes, a stamina/mana cost (negative restores), and optionally a deadline, place, batch type, critical flag, or "for someone else".</li>
      <li><b>Critical</b> = flagged, or has a deadline, or is for someone else.</li>
    </ul>

    <h3>Points (= XP)</h3>
    <ul>
      <li><b>Base = estimated minutes × quality × 1 point a minute.</b> Once a task has ${HISTORY_MIN_RUNS}+ runs its estimate is its flow target in minutes (recent average − ${pc(TARGET_STEP)}), so it cannot be inflated.</li>
      <li><b>Target</b> = the average of your last ${HISTORY_RUNS} runs, ${pc(TARGET_STEP)} better. Needs ${HISTORY_MIN_RUNS} runs.</li>
      <li>Bonuses add up, <b>capped at ${BONUS_CAP}× base</b>: flow (hit the target) +${pc(BONUS.flow)}, personal best +${pc(BONUS.pb)}, underdog (the stat with least XP over the last 7 days) +${pc(BONUS.underdog)}, combo +${pc(BONUS.comboStep)} per chained task (next start within ${COMBO_GAP_MIN} min of the last end) up to +${pc(BONUS.comboMax)}, <b>batch</b> +${pc(BONUS.batchStep)} × position (same batch type, gap ≤ ${BATCH_GAP_MIN} min). In a batch the batch bonus replaces the combo bonus. Rest pauses a combo, never breaks it.</li>
      <li>Every completion stores the price it earned. Points never change later except through rework.</li>
    </ul>

    <h3>Rework — heavily penalised</h3>
    <ul>
      <li><b>Penalty = fix minutes × (points earned ÷ original minutes) × multiplier.</b> Critical: ${REWORK_CRITICAL}×. Otherwise ${REWORK_MULTIPLIERS.join('×, ')}× for the 1st, 2nd, 3rd+ rework of that completion.</li>
      <li>Example: 90 points in 90 min, a 60-min fix → 60 × 1 × 1.5 = 90.</li>
      <li>The penalty comes off XP (levels can drop) and the charge off the balance. The task's true time becomes original + fix, and its quality drops by the share redone.</li>
      <li>Starting the timer on a task you finished in the last ${REWORK_ASK_DAYS} days asks whether it is rework.</li>
    </ul>

    <h3>Shop and debt</h3>
    <ul>
      <li>Rewards are treats and indulgences, priced by you (a small treat ≈ one good day's points). Meals, sleep, medical and rest are never behind a paywall.</li>
      <li>Socialising costs energy only, never points.</li>
      <li>Debt is allowed; <b>the part of any charge below zero costs ${DEBT_MULTIPLIER}×</b> — purchases and rework alike.</li>
    </ul>

    <h3>Energy</h3>
    <ul>
      <li><b>Stamina</b> (body) and <b>mana</b> (mind), 0–10. The morning rating sets the day; tasks and moments drain; rest and meals restore.</li>
      <li>A task's energy cost falls with skill level: × max(${MASTERY_FLOOR}, 1 − ${MASTERY_STEP} × (level − 1)). Later tasks in a batch cost ${pc(BATCH_MANA_SHARE)} of the mana.</li>
      <li>Empty → a warning, and only rest, free or due-soon tasks are offered. No penalty.</li>
    </ul>

    <h3>The next task</h3>
    <p>Due within ${DEADLINE_SOON_DAYS} days or overdue → affordable with today's energy → underdog stat → the skill closest to levelling. Same-type batch tasks wait until ${BATCH_RELEASE} are waiting or one is due soon, then are offered together.</p>

    <h3>Levels</h3>
    <p>From level L to L+1 costs ${SKILL_STEP} × L XP for a skill, ${STAT_STEP} × L for a stat, ${PLAYER_STEP} × L for you.</p>

    <h3>Streaks and reviews</h3>
    <p>Daily streaks forgive one missed day a week; weekly streaks count ISO weeks. The weekly review is life satisfaction and each stat 0–10, a win, a lesson and one change. XP cannot buy satisfaction.</p>

    <h3>Moments and places</h3>
    <p>Moments are life that is not a task — a drive, a chat, laundry, a meal, rest: energy by the hour, never points. Places belong to zones (home, road, factory, town, elsewhere); a task's place defaults from its skill.</p>
  </article></div>`;
}
