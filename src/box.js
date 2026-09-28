// Toasts and confirmations as the game's framed text box with a speaker tab.
// Toasts stack above the tab row and leave by themselves; a confirmation is a
// modal <dialog> (focus stays inside it, Escape cancels) whose buttons carry
// data-dialog-button="<id>" and resolve open() with that id.

import { textBox } from './ds.js';
import { esc } from './util.js';

const SPEAKER = { success: 'Nice!', info: 'Flow', warning: 'Heads up', danger: 'Oops' };

/** Show a short message; danger stays longer. Click to dismiss. */
export function toast(text, tone = 'info') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const wrap = document.createElement('div');
  wrap.className = 'ds-toast';
  wrap.innerHTML = textBox({ speaker: SPEAKER[tone] || 'Flow', tone, body: `<p>${esc(text)}</p>` });
  const close = () => { wrap.classList.add('is-leaving'); setTimeout(() => wrap.remove(), 180); };
  wrap.addEventListener('click', close);
  host.append(wrap);
  while (host.children.length > 3) host.firstElementChild.remove();
  setTimeout(close, tone === 'danger' ? 6000 : 2800);
}

/**
 * Ask in a framed box. `body` is HTML; buttons are [{ id, label, kind }] with
 * kind primary | danger | ghost. Resolves the id pressed, or 'cancel'.
 */
export function open({ heading, body = '', buttons = [] }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'ds-dialog';
    dlg.setAttribute('aria-label', heading);
    const kind = (k) => (k === 'primary' ? 'sc-button--primary' : k === 'danger' ? 'sc-button--danger' : k === 'ghost' ? 'sc-button--ghost' : '');
    dlg.innerHTML = textBox({
      speaker: heading,
      tone: buttons.some((b) => b.kind === 'danger') ? 'danger' : 'info',
      body: `${body}<form method="dialog" class="row dialog-buttons">${buttons.map((b) => `<button class="sc-button ${kind(b.kind)}" value="${esc(b.id)}" data-dialog-button="${esc(b.id)}">${esc(b.label)}</button>`).join('')}</form>`,
    });
    (document.getElementById('shell') || document.body).append(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue || 'cancel'); dlg.remove(); }, { once: true });
    dlg.showModal();
    // Start on the safe choice: the first non-danger, non-primary button, else the first.
    const safe = dlg.querySelector('.sc-button--ghost') || dlg.querySelector('.sc-button');
    safe?.focus();
  });
}

/** A yes/no confirmation: true when the second button is pressed. */
export async function confirm(heading, body, yes = 'OK', kind = 'primary') {
  return (await open({ heading, body, buttons: [{ id: 'cancel', label: 'Cancel', kind: 'ghost' }, { id: 'ok', label: yes, kind }] })) === 'ok';
}
