let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) { muted = m; if (m) bgm.stop(); else if (ctx) bgm.start(); }
export function isMuted() { return muted; }

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, to?: number) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + start;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}

/** 在绝对时间 t 播一个音，接到 out 上 */
function note(c: AudioContext, out: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// 背景音乐：8 比特街机风循环，C - Am - F - G 四小节，方波旋律 + 三角波低音，音量压低给音效让路
const MELODY = [
  72, 0, 76, 0, 79, 0, 76, 0, 84, 0, 79, 0, 76, 0, 74, 0,
  72, 0, 76, 0, 81, 0, 76, 0, 79, 0, 76, 0, 72, 0, 71, 0,
  69, 0, 72, 0, 77, 0, 72, 0, 81, 0, 77, 0, 74, 0, 72, 0,
  71, 0, 74, 0, 79, 0, 74, 0, 77, 0, 74, 0, 71, 0, 67, 0,
];
const BASS = [48, 45, 41, 43];
const STEP = 60 / 132 / 4; // 十六分音符

const bgm = (() => {
  let timer: number | null = null;
  let out: GainNode | null = null;
  let i = 0;
  let next = 0;
  const tick = () => {
    const c = ctx; if (!c || !out) return;
    while (next < c.currentTime + 0.15) {
      const bar = Math.floor(i / 16) % 4;
      const m = MELODY[i];
      if (m) note(c, out, midi(m), next, STEP * 1.6, 'square', 0.05);
      if (i % 4 === 0) note(c, out, midi(BASS[bar] + (i % 8 === 4 ? 12 : 0)), next, STEP * 3, 'triangle', 0.14);
      if (i % 2 === 1) note(c, out, 6000 + Math.random() * 2000, next, 0.03, 'square', 0.012);
      next += STEP;
      i = (i + 1) % MELODY.length;
    }
  };
  return {
    start() {
      if (timer !== null || muted) return;
      const c = ac(); if (!c) return;
      out = c.createGain();
      out.gain.setValueAtTime(0.0001, c.currentTime);
      out.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 1.5);
      out.connect(c.destination);
      i = 0; next = c.currentTime + 0.1;
      timer = window.setInterval(tick, 40);
    },
    stop() {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (out && ctx) { const o = out; o.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); setTimeout(() => o.disconnect(), 800); }
      out = null;
    },
  };
})();

export const sfx = {
  /** 第一次点击时解锁声音，并开始背景音乐 */
  unlock() { ac(); bgm.start(); },
  coin() { tone(988, 0, 0.08, 'square', 0.09); tone(1319, 0.07, 0.18, 'square', 0.09); tone(2637, 0.07, 0.1, 'triangle', 0.04); },
  click() { tone(520, 0, 0.05, 'square', 0.05); },
  stamp() { tone(140, 0, 0.25, 'sawtooth', 0.16, 45); tone(70, 0, 0.3, 'square', 0.12, 35); },
  rain() { for (let i = 0; i < 9; i++) tone(1200 + Math.random() * 1400, i * 0.08, 0.1, 'square', 0.04); },
  whoosh() { tone(300, 0, 0.5, 'triangle', 0.07, 1400); },
  payout() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, 'square', 0.08)); },
  error() { tone(200, 0, 0.2, 'sawtooth', 0.08, 120); },
};
