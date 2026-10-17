let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) { muted = m; }
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

export const sfx = {
  unlock() { ac(); },
  coin() { tone(988, 0, 0.08, 'square', 0.09); tone(1319, 0.07, 0.18, 'square', 0.09); tone(2637, 0.07, 0.1, 'triangle', 0.04); },
  click() { tone(520, 0, 0.05, 'square', 0.05); },
  stamp() { tone(140, 0, 0.25, 'sawtooth', 0.16, 45); tone(70, 0, 0.3, 'square', 0.12, 35); },
  rain() { for (let i = 0; i < 9; i++) tone(1200 + Math.random() * 1400, i * 0.08, 0.1, 'square', 0.04); },
  whoosh() { tone(300, 0, 0.5, 'triangle', 0.07, 1400); },
  payout() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, 'square', 0.08)); },
  error() { tone(200, 0, 0.2, 'sawtooth', 0.08, 120); },
};
