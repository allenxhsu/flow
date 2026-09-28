// flow/src/game/screen.js — the handheld's upper screen as HTML (the canvases,
// the HUD, the text box) and the game's CSS, scoped under `.play` so it never
// touches the rest of the app. Shared by the Play and Replay views. Pixel look
// from the page's own CSS: no external fonts.

export const SCREEN_HTML = `
  <div class="play-upper" id="play-screen">
    <canvas id="play-canvas" width="256" height="192" aria-label="The game"></canvas>
    <canvas id="play-canvas3d" width="320" height="240" hidden aria-hidden="true"></canvas>
    <div class="play-hud play-frame" aria-label="Status">
      <span class="play-hearts" data-hud="hearts" title="Stamina">♡♡♡♡♡</span>
      <span class="play-mp" title="Mana"><span>MP</span><span class="play-bar"><i data-hud="mp"></i></span></span>
      <span class="play-gem" title="Points">◆ <span data-hud="pts">0</span></span>
      <span class="play-clock" data-hud="clock">--:--</span>
    </div>
    <div class="play-sign play-frame is-hidden" id="play-sign"></div>
    <div class="play-box play-frame" id="play-box" hidden></div>
    <div class="play-pop" id="play-pop" hidden></div>
    <div class="play-fade" id="play-fade"></div>
  </div>`;

const CSS = `
.play{--pl-ink:#383848;--pl-line:#88909c;--pl-panel:#f8f8f6;--pl-accent:#3aa894;--pl-warn:#d05a5a;--pl-gold:#e0a830;--pl-sub:#7a7e8c;
  display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;color:var(--pl-ink);
  font:bold 15px/1.25 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;-webkit-font-smoothing:none;user-select:none}
.play *{box-sizing:border-box}
.play .play-upper,.play .play-lower{position:relative;width:min(100%,640px);aspect-ratio:4/3;border:6px solid #282040;border-radius:6px;overflow:hidden;background:#241e2e;box-shadow:0 0 0 4px #3a3450}
.play .play-lower{aspect-ratio:auto;min-height:0;background:#eef2f4;display:grid;gap:8px;padding:10px}
.play canvas#play-canvas,.play canvas#play-canvas3d{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;image-rendering:crisp-edges}
.play canvas#play-canvas[hidden],.play canvas#play-canvas3d[hidden]{display:none}
.play .play-frame{background:var(--pl-panel);color:var(--pl-ink);border:2px solid var(--pl-line);border-radius:10px;box-shadow:inset 0 0 0 2px #fff,0 3px 0 #0004}
.play .play-hud{position:absolute;left:6px;right:6px;top:6px;display:flex;align-items:center;gap:10px;padding:4px 10px;font-size:clamp(11px,2.6vw,16px);pointer-events:none}
.play .play-hearts{color:#e06060;letter-spacing:1px}
.play .play-mp{display:flex;align-items:center;gap:4px}
.play .play-bar{display:inline-block;width:clamp(36px,10vw,80px);height:8px;border:2px solid var(--pl-ink);background:#fff}
.play .play-bar>i{display:block;height:100%;background:#58c8a8;width:0}
.play .play-clock{margin-left:auto}
.play .play-sign{position:absolute;left:0;top:44px;border-radius:0 10px 10px 0;border-left:0;border-bottom:4px solid #58c8a8;padding:2px 18px 0 10px;font-size:clamp(13px,3.4vw,22px);transition:opacity .4s}
.play .play-sign.is-hidden{opacity:0}
.play .play-box{position:absolute;left:2%;right:2%;bottom:3%;min-height:28%;max-height:62%;overflow:auto;padding:10px 14px 12px;font-size:clamp(13px,3.2vw,20px);line-height:1.25}
.play .play-box[hidden]{display:none}
.play .play-who{display:inline-block;margin-right:6px;color:var(--pl-accent)}
.play .play-more{position:absolute;right:12px;bottom:6px;animation:play-bob .5s infinite alternate steps(2)}
@keyframes play-bob{to{transform:translateY(3px)}}
.play .play-choices,.play .play-items{display:grid;gap:2px;margin-top:6px}
.play .play-choice,.play .play-item{font:inherit;text-align:left;background:none;border:0;border-radius:4px;padding:2px 6px 2px 18px;color:inherit;cursor:pointer;min-height:30px;position:relative}
.play .play-choice.is-on,.play .play-item.is-sel,.play .play-item:hover,.play .play-choice:hover{background:#e4f4f0}
.play .play-choice.is-on::before,.play .play-item.is-sel::before{content:'▶';position:absolute;left:4px;color:var(--pl-warn);font-size:.8em;top:.35em}
.play .play-item small{color:var(--pl-sub);font-weight:normal}
.play .play-menu{position:absolute;left:2%;right:2%;bottom:3%;top:14%;overflow:auto;padding:8px 12px 10px;font-size:clamp(12px,3vw,18px);z-index:3}
.play .play-menu h3{margin:0 0 4px;font-size:1em;color:var(--pl-accent);font-weight:bold;letter-spacing:.5px}
.play .play-menu p{margin:2px 0 6px}
.play .play-grid{display:grid;grid-template-columns:repeat(9,1fr);gap:2px}
.play .play-grid .play-item{text-align:center;padding:2px 0;min-height:28px}
.play .play-grid .play-item.is-sel::before{display:none}
.play .play-grid .play-item.is-sel{outline:2px solid var(--pl-warn)}
.play .play-title{display:block;min-height:1.4em;padding:2px 8px;margin:4px 0;border-bottom:2px solid var(--pl-ink);letter-spacing:2px}
.play .play-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.play input.play-input{font:inherit;width:6em;border:2px solid var(--pl-line);border-radius:6px;padding:2px 6px}
.play .play-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .2s steps(3)}
.play .play-fade.is-on{opacity:1}
.play .play-pop{position:absolute;inset:0;z-index:4}
.play .play-pop[hidden]{display:none}
.play .play-travel{position:absolute;inset:0;background:#0e0a16e0;display:grid;grid-template-columns:1.5fr 1fr;gap:8px;padding:10px}
.play .play-panel{background:#f4f6f8;border:3px solid var(--pl-line);border-radius:10px;padding:8px;display:grid;grid-template-rows:auto 1fr auto;min-height:0;gap:4px}
.play .play-panel h4{margin:0;color:var(--pl-accent);font-size:clamp(12px,2.6vw,17px)}
.play .play-panel canvas{width:100%;height:auto;aspect-ratio:2/1;image-rendering:pixelated;border:2px solid #c8d0d8;border-radius:6px}
.play .play-dests{display:grid;gap:4px;align-content:start;overflow:auto}
.play .play-dest,.play .play-go{font:inherit;text-align:left;background:#fff;border:2px solid #c8d0d8;border-radius:8px;padding:4px 7px;cursor:pointer;color:var(--pl-ink);min-height:34px}
.play .play-dest.is-on{border-color:var(--pl-accent);background:#e4f4f0}
.play .play-go{background:var(--pl-accent);color:#fff;border-color:#2a7a6a;text-align:center}
.play .play-go:disabled{opacity:.5}
.play .play-note{font-size:.8em;color:var(--pl-sub);font-weight:normal}
.play .play-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}
.play .play-chip{background:#e4f4f0;border-radius:6px;padding:1px 8px}
.play .play-timer{background:linear-gradient(135deg,var(--pl-accent),#2a6a70);color:#fff;border-radius:10px;padding:6px 10px;display:flex;gap:8px;align-items:center}
.play .play-timer b{font-size:1.4em}
.play .play-pad{display:flex;justify-content:space-between;align-items:center;gap:8px}
.play .play-dpad{position:relative;width:132px;height:132px;flex:none}
.play .play-dpad button,.play .play-ab button{position:absolute;background:#282040;border:3px solid #0e0a16;color:#d0c0f8;font:inherit;border-radius:6px;touch-action:none;cursor:pointer}
.play .play-dpad button.is-on,.play .play-dpad button:active,.play .play-ab button:active{background:#9870e0;color:#fff}
.play .play-dpad [data-dir=up]{left:44px;top:0;width:44px;height:46px}.play .play-dpad [data-dir=down]{left:44px;bottom:0;width:44px;height:46px}
.play .play-dpad [data-dir=left]{left:0;top:44px;width:46px;height:44px}.play .play-dpad [data-dir=right]{right:0;top:44px;width:46px;height:44px}
.play .play-ab{position:relative;width:132px;height:100px;flex:none}
.play .play-ab button{width:56px;height:56px;border-radius:50%;background:#9870e0;color:#fff}
.play .play-ab [data-btn=a]{right:0;top:0}.play .play-ab [data-btn=b]{left:0;bottom:0}
.play .play-tasks{font:inherit;font-size:20px;letter-spacing:2px;min-height:52px;flex:1;border:3px solid #2a7a6a;background:var(--pl-accent);color:#fff;border-radius:12px;cursor:pointer;box-shadow:0 3px 0 #0003}
.play .play-help{font-size:11px;color:var(--pl-sub);font-weight:normal;text-align:center}
.play .play-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.play .play-controls button{font:inherit;min-height:40px;min-width:44px;padding:4px 10px;border:2px solid var(--pl-line);border-radius:8px;background:#fff;color:var(--pl-ink);cursor:pointer}
.play .play-controls button[aria-pressed=true]{border-color:var(--pl-accent);background:#e4f4f0}
.play .play-controls input[type=range]{flex:1 1 140px;accent-color:var(--pl-accent)}
.play .play-finale{position:absolute;left:4%;right:4%;top:14%;bottom:4%;padding:10px 14px;overflow:auto;z-index:3;font-size:clamp(12px,3vw,18px)}
.play .play-finale[hidden]{display:none}
.play .play-finale h3{margin:0 0 6px;color:var(--pl-accent)}
.play .play-finale ul{margin:0;padding-left:1.1em}
.play .play-places{display:flex;gap:4px;flex-wrap:wrap}
.play .play-places button{font:inherit;font-size:12px;color:var(--pl-ink);border:2px solid #c8d0d8;border-radius:6px;background:#fff;cursor:pointer;padding:2px 8px;min-height:32px}
@media (max-width:560px){.play .play-pad{flex-wrap:wrap}.play .play-tasks{order:-1;flex-basis:100%}}
`;

export function injectGameStyle(doc) {
  if (!doc || doc.getElementById('flow-play-style')) return;
  const s = doc.createElement('style');
  s.id = 'flow-play-style';
  s.textContent = CSS;
  doc.head.appendChild(s);
}

/** three.js r128, vendored (MIT, vendor/three/LICENSE), loaded once; null when it cannot run. */
let three = null;
export function loadThree(doc) {
  if (!doc) return Promise.resolve(null);
  const win = doc.defaultView;
  if (win.THREE) return Promise.resolve(win.THREE);
  three ||= new Promise((resolve) => {
    const probe = doc.createElement('canvas');
    let gl = null;
    try { gl = probe.getContext('webgl') || probe.getContext('experimental-webgl'); } catch { gl = null; }
    if (!gl) { resolve(null); return; }
    const s = doc.createElement('script');
    s.src = new URL('../../vendor/three/three.min.js', import.meta.url).href;
    s.onload = () => resolve(win.THREE || null);
    s.onerror = () => resolve(null);
    doc.head.appendChild(s);
  });
  return three;
}
