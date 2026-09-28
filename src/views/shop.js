// Shop: treats and indulgences the player prices. Debt is allowed, and the
// part of a charge below zero costs more (double at Push; the difficulty tier
// sets it) — said before buying, not after.

import { makeReward, makePurchase, DIFFICULTY, DEBT_MULTIPLIER } from '../model.js';
import { esc, fmtPts, purchasePreview } from '../util.js';

/** The global tier's debt multiplier, and how to say it. */
const debtOf = (g) => DIFFICULTY.find((d) => d.id === g.difficulty?.tier)?.debt ?? DEBT_MULTIPLIER;
const debtWord = (x) => (x === 2 ? 'double' : `×${x}`);

const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function rewardItem(ctx, r) {
  const p = purchasePreview(ctx.g.balance, r.price, debtOf(ctx.g));
  const gone = !r.repeatable && r.bought > 0;
  return `
  <div class="item" data-reward="${esc(r.id)}">
    <div class="item-head"><span class="item-title">${esc(r.title)}</span><span class="big num">${fmtPts(r.price)}</span></div>
    <div class="row small sc-muted"><span>${r.repeatable ? 'repeatable' : 'one-off'}</span>${r.bought ? `<span>bought ×${r.bought}</span>` : ''}
      ${!gone && p.intoDebt ? `<span class="sc-pill" style="--tint: var(--sc-danger)">debt: costs ${fmtPts(p.charged)}</span>` : ''}</div>
    <div class="row">
      <button class="sc-button ${p.intoDebt ? 'sc-button--danger' : 'sc-button--primary'} sc-button--sm" data-action="buy" data-reward="${esc(r.id)}" ${gone ? 'disabled' : ''}>${gone ? 'Bought' : 'Buy'}</button>
      <button class="sc-button sc-button--ghost sc-button--sm" data-action="archive" data-reward="${esc(r.id)}">Remove</button>
    </div>
  </div>`;
}

export function render(ctx) {
  const { g } = ctx;
  const word = debtWord(debtOf(g));
  return `<div class="view">
    <section class="hud"><div class="hud-cell"><span class="sc-label">Balance</span><span class="big num" id="shop-balance">${fmtPts(g.balance)}</span>
      ${g.balance < 0 ? `<span class="small sc-muted">In debt: every charge below zero costs ${word}.</span>` : `<span class="small sc-faint">Below zero, charges cost ${word}.</span>`}</div></section>
    <form class="sc-panel sc-panel--lit pad stack" data-form="reward" id="reward-form">
      <h2>Add reward</h2>
      <div class="form-grid">
        <label class="sc-field"><span>Treat</span><input class="sc-input" name="title" required placeholder="e.g. Bubble tea"></label>
        <label class="sc-field"><span>Price (points)</span><input class="sc-input" type="number" name="price" min="1" step="1" required placeholder="≈ one good day"></label>
        <label class="check-field"><input class="sc-check" type="checkbox" name="repeatable" checked> Repeatable</label>
        <button class="sc-button sc-button--primary" type="submit">Add</button>
      </div>
      <p class="small sc-faint" style="margin:0">Treats and indulgences only. Meals, sleep, medical and rest are never behind a paywall, and socialising costs energy, never points.</p>
    </form>
    <div class="stack"><h2>Rewards</h2>
      ${g.rewards.length ? `<div class="grid">${g.rewards.map((r) => rewardItem(ctx, r)).join('')}</div>` : '<div class="muted-box">No rewards yet.</div>'}</div>
    <div class="stack"><h2>Purchases</h2>
      ${g.purchases.length ? `<div class="table-wrap"><table class="sc-table" id="purchases"><thead><tr><th>When</th><th>Reward</th><th>Price</th><th>Charged</th></tr></thead><tbody>
        ${g.purchases.map((p) => `<tr><td class="num">${when(p.at)}</td><td>${esc(p.title)}</td><td class="num">${fmtPts(p.price)}</td><td class="num">${fmtPts(p.charged)}${p.charged > p.price ? ` <span class="sc-pill" style="--tint: var(--sc-danger)">debt ×${DIFFICULTY.find((d) => d.id === p.difficulty)?.debt ?? DEBT_MULTIPLIER}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="muted-box">Nothing bought yet.</div>'}</div>
  </div>`;
}

export const actions = {
  buy: async (el, ctx) => {
    const r = ctx.db.reward.get(el.dataset.reward);
    const p = purchasePreview(ctx.g.balance, r.price, debtOf(ctx.g));
    const body = p.intoDebt
      ? `<div class="sc-alert sc-alert--danger"><strong>Into debt</strong> This takes your balance below zero.</div>
         <p>${esc(r.title)} costs ${fmtPts(r.price)}. You have ${fmtPts(ctx.g.balance)}, so ${fmtPts(p.below)} of it is on credit and costs ${debtWord(debtOf(ctx.g))}: <b>you will be charged ${fmtPts(p.charged)}</b> (+${fmtPts(p.extra)}), leaving ${fmtPts(p.after)}.</p>`
      : `<p>Buy <b>${esc(r.title)}</b> for ${fmtPts(r.price)}? That leaves ${fmtPts(p.after)}.</p>`;
    if (!(await ctx.confirm(p.intoDebt ? 'Buy on credit?' : 'Buy?', body, p.intoDebt ? `Buy for ${fmtPts(p.charged)}` : 'Buy', p.intoDebt ? 'danger' : 'primary'))) return;
    const rec = makePurchase(ctx.db, r.id, { at: Date.now() });
    await ctx.store.add(rec);
    ctx.toast(`Enjoy ${r.title}. −${rec.charged}.`, 'success');
  },
  archive: async (el, ctx) => {
    const r = ctx.store.getRecord(el.dataset.reward);
    if (!(await ctx.confirm('Remove reward?', `Take <b>${esc(r.title)}</b> off the shelf? Past purchases stay.`, 'Remove', 'danger'))) return;
    await ctx.store.save({ ...r, archived: true });
  },
};

export const forms = {
  reward: async (d, form, ctx) => {
    const rec = makeReward({ title: d.title.trim(), price: d.price, repeatable: d.repeatable === 'on' });
    await ctx.store.save(rec);
    ctx.toast(`${rec.title} added.`, 'success');
  },
};
