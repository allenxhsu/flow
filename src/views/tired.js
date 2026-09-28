// "I'm tired" (SPEC.md › Terminal): Body, Mind or Both, and A bit / Very /
// Wiped out → an energy check-in the day's energy then runs from. Shared by
// Now and the Terminal.

import { makeTired } from '../model.js';

const WHICH = [['body', 'Body'], ['mind', 'Mind'], ['both', 'Both']];
const LEVELS = [['bit', 'A bit'], ['very', 'Very'], ['wiped', 'Wiped out']];

const choice = (name, [value, label], checked) => `
  <label class="choice"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''} required><span>${label}</span></label>`;

/** The sheet: two rows of big choices and a submit. */
export function tiredSheet() {
  return `
  <form class="sc-panel sc-panel--lit pad stack tired-sheet" data-form="tired" id="tired-form">
    <div class="row-between"><h2>I'm tired</h2><span class="small sc-faint">the meters drop to how you feel</span></div>
    <fieldset class="choices"><legend class="sc-label">Where</legend>${WHICH.map((w, i) => choice('which', w, i === 2)).join('')}</fieldset>
    <fieldset class="choices"><legend class="sc-label">How much</legend>${LEVELS.map((l, i) => choice('level', l, i === 0)).join('')}</fieldset>
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Log it</button><button class="sc-button sc-button--ghost" type="button" data-action="tired-cancel">Cancel</button></div>
  </form>`;
}

/** The energy record for a submitted sheet. */
export function tiredFrom(db, data, at = Date.now()) {
  const which = data.which || 'both';
  return makeTired(db, { body: which !== 'mind', mind: which !== 'body', level: data.level, at });
}

/** What to say after it is logged. */
export const tiredToast = (r) => `Tired: stamina ${r.stamina}, mana ${r.mana}. Rest is offered first when a meter is low.`;
