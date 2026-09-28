// Звуки кота синтезируются в браузере — без файлов. Играют только после касания экрана (правило iOS).

import { getPet } from './petStore';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!getPet().sound) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      void loadClips(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Звук уже разрешён (было касание) — можно мяукать самому. */
export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running' && getPet().sound;
}

// ---------- Настоящие мяуканья из записей ----------

interface Clip {
  file: string;
  dur: number;
}
type Kind = 'meow' | 'angry';
const clips: Record<Kind, { clip: Clip; buf: AudioBuffer }[]> = { meow: [], angry: [] };
/** Настоящее чавканье из записи. */
let eatBuf: AudioBuffer | null = null;
let lastClip = '';

async function loadClips(c: AudioContext) {
  try {
    const base = `${import.meta.env.BASE_URL}sounds/`;
    const man = (await (await fetch(base + 'sounds.json')).json()) as Record<Kind, Clip[]>;
    void fetch(base + 'eat.mp3')
      .then((r) => r.arrayBuffer())
      .then((d) => c.decodeAudioData(d))
      .then((b) => (eatBuf = b))
      .catch(() => undefined);
    for (const kind of ['meow', 'angry'] as Kind[]) {
      await Promise.all(
        (man[kind] ?? []).map(async (clip) => {
          const data = await (await fetch(base + clip.file)).arrayBuffer();
          const buf = await c.decodeAudioData(data);
          clips[kind].push({ clip, buf });
        }),
      );
    }
  } catch {
    /* нет сети — останется синтезированный голос */
  }
}

/**
 * Проиграть случайное мяуканье. long — выбрать подлиннее (голодный), short — покороче.
 * rate чуть меняем, чтобы не повторялось. Возвращает длительность в секундах или 0.
 */
function playClip(kind: Kind, opts: { long?: boolean; short?: boolean; rate?: number; gain?: number } = {}): number {
  const c = ac();
  if (!c) return 0;
  let list = clips[kind];
  if (opts.long) list = list.filter((x) => x.clip.dur >= 0.7).length ? list.filter((x) => x.clip.dur >= 0.7) : list;
  if (opts.short) list = list.filter((x) => x.clip.dur <= 0.62).length ? list.filter((x) => x.clip.dur <= 0.62) : list;
  if (!list.length) return 0;
  let pick = list[Math.floor(Math.random() * list.length)];
  if (pick.clip.file === lastClip && list.length > 1) pick = list[(list.indexOf(pick) + 1) % list.length];
  lastClip = pick.clip.file;
  const src = c.createBufferSource();
  src.buffer = pick.buf;
  const rate = (opts.rate ?? 1) * (0.95 + Math.random() * 0.1);
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.9;
  src.connect(g).connect(c.destination);
  src.start();
  return pick.buf.duration / rate;
}

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

/**
 * Ленивое милое «мрр-ряу»: короткое мурлыкающее начало, мягкий подъём и долгий спад,
 * лёгкое дрожание голоса и придыхание. pitch 1 — обычный, больше — выше и короче.
 */
export function meow(pitch = 1, length = 0.9): number {
  const real = playClip('meow', { long: length >= 1.1, short: length < 0.5, rate: pitch > 1.2 ? 1.1 : pitch < 0.9 ? 0.92 : 1 });
  if (real) return real;
  const c = ac();
  if (!c) return 0;
  const t = c.currentTime;
  const p = pitch * (0.96 + Math.random() * 0.08);
  const L = length / Math.sqrt(pitch);
  const out = c.createGain();
  out.gain.value = 0.9;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  out.connect(lp).connect(c.destination);

  // Голос: треугольник + пила тише — мягче, чем голая пила
  const f0 = c.createGain();
  const oscA = c.createOscillator();
  oscA.type = 'sawtooth';
  const oscB = c.createOscillator();
  oscB.type = 'triangle';
  const mixA = c.createGain();
  mixA.gain.value = 0.35;
  const mixB = c.createGain();
  mixB.gain.value = 0.8;
  oscA.connect(mixA).connect(f0);
  oscB.connect(mixB).connect(f0);
  for (const o of [oscA, oscB]) {
    o.frequency.setValueAtTime(260 * p, t);
    // «мрр» — низко
    o.frequency.linearRampToValueAtTime(300 * p, t + L * 0.18);
    // «я» — подъём
    o.frequency.exponentialRampToValueAtTime(470 * p, t + L * 0.42);
    // «у» — ленивый спад
    o.frequency.exponentialRampToValueAtTime(290 * p, t + L);
  }
  // Дрожание голоса
  const vib = c.createOscillator();
  vib.frequency.value = 5.5;
  const vibAmt = c.createGain();
  vibAmt.gain.value = 7 * p;
  vib.connect(vibAmt);
  vibAmt.connect(oscA.frequency);
  vibAmt.connect(oscB.frequency);
  // «мрр»: быстрая пульсация громкости в начале
  const trill = c.createOscillator();
  trill.frequency.value = 28;
  const trillAmt = c.createGain();
  trillAmt.gain.setValueAtTime(0.5, t);
  trillAmt.gain.linearRampToValueAtTime(0, t + L * 0.2);
  const amp = c.createGain();
  amp.gain.value = 0.5;
  trill.connect(trillAmt).connect(amp.gain);

  // Форманта «мяу»: рот открывается и закрывается
  const f1 = c.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 3;
  f1.frequency.setValueAtTime(550, t);
  f1.frequency.linearRampToValueAtTime(1150, t + L * 0.45);
  f1.frequency.linearRampToValueAtTime(650, t + L);
  const f2 = c.createBiquadFilter();
  f2.type = 'peaking';
  f2.frequency.value = 2400;
  f2.gain.value = 4;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.32, t + 0.07);
  env.gain.setValueAtTime(0.32, t + L * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t + L + 0.15);
  f0.connect(amp).connect(f1).connect(f2).connect(env).connect(out);

  // Придыхание
  const breath = noise(c, L + 0.2);
  const bf = c.createBiquadFilter();
  bf.type = 'bandpass';
  bf.frequency.value = 1800;
  bf.Q.value = 0.8;
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.035, t + 0.1);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + L + 0.15);
  breath.connect(bf).connect(bg).connect(out);

  for (const o of [oscA, oscB, vib, trill]) {
    o.start(t);
    o.stop(t + L + 0.2);
  }
  breath.start(t);
  return L;
}

/** Злое мяуканье — когда Гера голодный и сердитый. */
export function angryMeow(): number {
  return playClip('angry', { gain: 0.8 }) || (hiss(), 0.7);
}

/** Ленивый зевок: долгое низкое «а-а-ау» с выдохом. */
export function yawnSound() {
  if (playClip('meow', { long: true, rate: 0.82, gain: 0.55 })) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const L = 1.5;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(340, t + 0.5);
  o.frequency.exponentialRampToValueAtTime(170, t + L);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(900, t + 0.6);
  f.frequency.linearRampToValueAtTime(400, t + L);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + L);
  o.connect(f).connect(g).connect(c.destination);
  const br = noise(c, L);
  const bf = c.createBiquadFilter();
  bf.type = 'bandpass';
  bf.frequency.value = 1200;
  const bg = c.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.05, t + 0.8);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + L);
  br.connect(bf).connect(bg).connect(c.destination);
  o.start(t);
  o.stop(t + L);
  br.start(t);
}

/** Короткое довольное «мрр?» */
export function chirp() {
  if (playClip('meow', { short: true, rate: 1.12, gain: 0.7 })) return;
  meow(1.35, 0.32);
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
  if (clips.angry.length) {
    playClip('angry', { gain: 0.8, rate: 1.05 });
    return;
  }
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

/** Гера ест из миски: запись чавканья (или синтез, если записи нет). */
export function eatSound(seconds = 5) {
  const c = ac();
  if (!c) return;
  if (eatBuf) {
    const src = c.createBufferSource();
    src.buffer = eatBuf;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(c.destination);
    src.start(0, 0, Math.min(seconds, eatBuf.duration));
    return;
  }
  chomp(Math.round(seconds * 3));
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

/** Хихиканье: три коротких довольных «мрр». */
export function giggle() {
  if (playClip('meow', { short: true, rate: 1.18 })) return;
  [0, 0.2, 0.4].forEach((d, i) => setTimeout(() => meow(1.3 + i * 0.08, 0.22), d * 1000));
}
