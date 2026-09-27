// flow/src/replay/sound.js — an original chiptune loop and a few sound
// effects, synthesised with WebAudio square and triangle oscillators. Nothing
// plays until `unlock()` is called from a user gesture and sound is enabled.

// A cheerful 4-bar loop written for Flow: [MIDI note or 0 for a rest] per eighth.
const LEAD = [
  72, 0, 76, 79, 77, 76, 74, 0,
  71, 0, 74, 77, 76, 74, 72, 0,
  69, 72, 76, 0, 74, 72, 71, 72,
  74, 0, 79, 77, 76, 74, 76, 0,
];
const BASS = [48, 48, 43, 43, 45, 45, 41, 43]; // one per half bar
const STEP = 60 / 132 / 2; // eighth notes at 132 bpm

const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SFX = {
  gem: [[88, 0, 0.05], [93, 0.05, 0.09]],
  batch: [[79, 0, 0.06], [84, 0.06, 0.06], [88, 0.12, 0.06], [91, 0.18, 0.12]],
  level: [[72, 0, 0.08], [76, 0.08, 0.08], [79, 0.16, 0.08], [84, 0.24, 0.08], [88, 0.32, 0.2]],
  rework: [[64, 0, 0.1], [60, 0.1, 0.1], [55, 0.2, 0.18]],
  buy: [[84, 0, 0.06], [79, 0.06, 0.06], [84, 0.12, 0.06], [91, 0.18, 0.14]],
  chat: [[81, 0, 0.03], [83, 0.05, 0.03]],
};

export function createSound() {
  let ctx = null;
  let master = null;
  let enabled = false;
  let musicOn = false;
  let timer = null;
  let nextAt = 0;
  let step = 0;

  const note = (type, m, at, dur, vol) => {
    if (!ctx || !m) return;
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    o.type = type;
    o.frequency.value = freq(m);
    v.gain.setValueAtTime(vol, at);
    v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(v).connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  };

  const tick = () => {
    if (!ctx || !musicOn || !enabled) return;
    while (nextAt < ctx.currentTime + 0.25) {
      const i = step % LEAD.length;
      note('square', LEAD[i], nextAt, STEP * 0.9, 0.045);
      if (i % 4 === 0) note('triangle', BASS[(i / 4) % BASS.length], nextAt, STEP * 3.6, 0.12);
      nextAt += STEP;
      step++;
    }
  };

  return {
    /** Call from a click or key press: creates or resumes the audio context. */
    unlock() {
      if (!enabled) return;
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    },
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = !!on;
      if (!enabled) this.stopMusic();
      if (master) master.gain.value = enabled ? 0.8 : 0;
    },
    startMusic() {
      if (!ctx || !enabled || musicOn) return;
      musicOn = true;
      nextAt = ctx.currentTime + 0.05;
      timer = setInterval(tick, 80);
      tick();
    },
    stopMusic() {
      musicOn = false;
      if (timer) clearInterval(timer);
      timer = null;
    },
    sfx(name) {
      if (!ctx || !enabled || !SFX[name]) return;
      const t = ctx.currentTime + 0.01;
      for (const [m, at, dur] of SFX[name]) note(name === 'rework' ? 'triangle' : 'square', m, t + at, dur + 0.04, 0.06);
    },
    destroy() {
      this.stopMusic();
      if (ctx) ctx.close?.();
      ctx = null;
    },
  };
}
