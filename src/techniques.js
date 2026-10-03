// flow/src/techniques.js — named things inside a skill (SPEC.md › The board ›
// Techniques). Pure.
//
// A technique badge is a belt, not a sticker. "You logged ten days" is a
// souvenir and means nothing; "you can hold a Euro-carve" is a claim about
// what you can do today, and a claim is only worth making if it can be taken
// away. So a technique is held while the recent attempts are mostly clean,
// goes shaky on a bad run and is lost on a bad stretch — and it is won back
// exactly the way it was lost.
//
// A technique pays no points: points are minutes. It does three things —
// it sets the skill's Ceiling, it unlocks the next technique, and it raises
// the difficulty of the units done with it, which is what stops the board
// rewarding the player for getting quicker at easy work.

/** The last this many attempts decide whether a technique is held… */
export const HOLD_WINDOW = 5;
/** …and this many of them must be clean. */
export const HOLD_CLEAN = 3;

export const STATES = {
  locked: 'locked',
  attempting: 'attempting',
  held: 'held',
  shaky: 'shaky',
  lost: 'lost',
};

/**
 * The ladders. Deliberately sparse: three to seven per skill, and only on
 * skills that matter yet. Seven techniques across twenty-two skills would be
 * a hundred and fifty badges, which is wallpaper — the exact failure the
 * badge critique is about. An empty ladder is a decision, not an omission.
 */
const LADDERS = {
  poise: [
    { id: 'linked', name: 'Linked turns', note: 'skidded, in control, both edges', held: 'a run with no falls' },
    { id: 'carve', name: 'Clean carve', note: 'a pencil line on groomers, no skid', held: 'three runs carved end to end' },
    { id: 'switch-linked', name: 'Switch linked turns', note: 'the same, riding switch', held: 'three runs switch, no falls' },
    { id: 'hard-snow', name: 'Carve the hard stuff', note: 'holding the edge on steeps, chop and ice', held: 'three runs off the groomer, carved' },
    { id: 'jc', name: 'Japanese carve', note: 'deep lean, hand down', held: 'landed three of the last five' },
    { id: 'ec', name: 'Euro-carve', note: 'laid out, hip to the snow', held: 'landed three of the last five' },
    { id: 'switch-carve', name: 'Switch carve', note: 'the one that says you are done', held: 'landed three of the last five' },
  ],
  inscription: [
    { id: 'complete', name: 'Fully dimensioned', note: 'nothing left for the shop to guess', held: 'three drawings released with no questions asked' },
    { id: 'datums', name: 'Datums', note: 'GD&T that says how the part is held', held: 'three released, no revision' },
    { id: 'stackup', name: 'Tolerance stack-up', note: 'the fit is proven, not hoped', held: 'three released, no revision' },
    { id: 'silent', name: 'A drawing nobody asks about', note: 'it leaves and nothing comes back', held: 'five released, no questions and no revisions' },
  ],
  shaping: [
    { id: 'sketch', name: 'Sketch-driven', note: 'fully defined, no floating geometry', held: 'three parts, no rebuild errors' },
    { id: 'configs', name: 'Configurations', note: 'one part, its family', held: 'three parts configured' },
    { id: 'equations', name: 'Equations and tables', note: 'the part knows its own rules', held: 'three parts driven by them' },
    { id: 'robust', name: 'Survives the change', note: 'an upstream edit does not break it', held: 'three parts that took an upstream change cleanly' },
  ],
  scribing: [
    { id: 'answer-first', name: 'Answer first', note: "Minto's rule: the ask in the first line", held: 'three threads resolved in one round-trip' },
    { id: 'one-screen', name: 'One screen', note: 'the whole thing without scrolling', held: 'three threads resolved in one round-trip' },
    { id: 'ends-it', name: 'Ends the thread', note: 'nobody needs to reply but yes', held: 'five threads resolved with no round-trip at all' },
  ],
  summoning: [
    { id: 'clean-req', name: 'A req that lands', note: 'right part, right first time', held: 'five reqs with no second req' },
    { id: 'alternates', name: 'Alternates named', note: 'a second source before it is needed', held: 'three reqs carrying one' },
    { id: 'stocked', name: 'A vendor who holds stock', note: 'the lead time stops being yours', held: 'one standing arrangement that delivered twice' },
  ],
  might: [
    { id: 'bodyweight', name: 'Bodyweight', note: 'the basics, properly', held: 'three sessions' },
    { id: 'barbell', name: 'Barbell', note: 'squat, hinge, press, pull', held: 'three sessions, no form breakdown' },
    { id: 'bw-squat', name: 'Bodyweight squat ×1.5', note: 'the number that takes a year', held: 'hit on three sessions' },
  ],
};

for (const [skill, list] of Object.entries(LADDERS)) {
  list.forEach((t, i) => { t.rank = i + 1; t.skill = skill; });
}

const BY_ID = new Map(Object.values(LADDERS).flat().map((t) => [t.id, t]));

/** A skill's ladder, easiest first. Empty for a skill that has none yet. */
export const techniquesOf = (skillId) => LADDERS[skillId] || [];
export const techniqueById = (id) => BY_ID.get(id) || null;

/**
 * Where a technique stands, from its attempts (oldest first, `clean` true or
 * false). Only the last HOLD_WINDOW count, so an old disaster is forgotten
 * and a recent one is not.
 */
export function techniqueState(attempts = []) {
  const recent = attempts.slice(-HOLD_WINDOW);
  const clean = recent.filter((a) => a && a.clean).length;
  const out = { clean, attempts: recent.length, window: recent.length };
  if (!recent.length) return { ...out, state: STATES.locked };
  // Not yet enough attempts to have proven anything, and not yet enough to
  // have disproven it either.
  if (clean >= HOLD_CLEAN) return { ...out, state: STATES.held };
  if (recent.length < HOLD_WINDOW) return { ...out, state: STATES.attempting };
  return { ...out, state: clean >= HOLD_CLEAN - 1 ? STATES.shaky : STATES.lost };
}

/**
 * The skill's Ceiling: the highest-ranked technique currently **held** —
 * shaky does not count, because the badge is a claim about now — and the next
 * one to chase, so there is always something named.
 */
export function ceilingOf(skillId, attemptsByTechnique = new Map()) {
  const list = techniquesOf(skillId);
  let top = null;
  for (const t of list) {
    if (techniqueState(attemptsByTechnique.get(t.id) || []).state === STATES.held) {
      if (!top || t.rank > top.rank) top = t;
    }
  }
  const next = list.find((t) => t.rank > (top?.rank ?? 0)) || null;
  return { rank: top?.rank ?? 0, technique: top, next, of: list.length };
}
