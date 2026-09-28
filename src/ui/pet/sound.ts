// Звуки кота синтезируются в браузере — без файлов. Играют только после касания экрана (правило iOS).

import { getPet } from './petStore';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!getPet().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

/** «Мяу»: пила через два фильтра-форманты, высота вверх и вниз. pitch 1 — обычный, 1.4 — котёночный. */
export function meow(pitch = 1, length = 0.55) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(380 * pitch, t);
  osc.frequency.linearRampToValueAtTime(620 * pitch, t + length * 0.3);
  osc.frequency.linearRampToValueAtTime(340 * pitch, t + length);
  const f1 = c.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 4;
  f1.frequency.setValueAtTime(700, t);
  f1.frequency.linearRampToValueAtTime(1300, t + length * 0.35);
  f1.frequency.linearRampToValueAtTime(800, t + length);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
  g.gain.setValueAtTime(0.35, t + length * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(f1).connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** Мурчание: низкий шум, пульсирующий ~25 раз в секунду. */
export function purr(seconds = 1.6) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const src = noise(c, seconds);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  const amp = c.createGain();
  amp.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.frequency.value = 24;
  const depth = c.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth).connect(amp.gain);
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1.2, t + 0.2);
  out.gain.setValueAtTime(1.2, t + seconds - 0.3);
  out.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(lp).connect(amp).connect(out).connect(c.destination);
  src.start(t);
  lfo.start(t);
  src.stop(t + seconds);
  lfo.stop(t + seconds);
}

/** Шипение, когда злой. */
export function hiss() {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const src = noise(c, 0.7);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  src.connect(hp).connect(g).connect(c.destination);
  src.start(t);
}

/** «Ням-ням»: три коротких хруста. */
export function chomp(times = 4) {
  const c = ac();
  if (!c) return;
  for (let i = 0; i < times; i++) {
    const t = c.currentTime + i * 0.28;
    const src = noise(c, 0.12);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 400;
    bp.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
  }
}

/** Фанфары нового уровня. */
export function fanfare() {
  const c = ac();
  if (!c) return;
  [523, 659, 784, 1047].forEach((f, i) => {
    const t = c.currentTime + i * 0.12;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.6 : 0.2));
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.7);
  });
}

/** Хихиканье: три высоких коротких «мя». */
export function giggle() {
  [0, 0.16, 0.32].forEach((d, i) => setTimeout(() => meow(1.5 + i * 0.1, 0.14), d * 1000));
}
