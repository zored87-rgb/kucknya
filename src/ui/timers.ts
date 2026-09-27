// Таймеры кухни: общие для всего приложения, переживают сворачивание и перезапуск.
// В фоне iPhone приложение спит, поэтому считаем от времени окончания, а при возврате — звоним сразу.
// Для звонка поверх других приложений есть «системный» режим: таймер ставится в «Часах» через быструю команду.

import { useSyncExternalStore } from 'react';

export interface KitchenTimer {
  id: number;
  label: string;
  /** Для какого блюда — чтобы было понятно в полоске сверху. */
  dish: string;
  endsAt: number;
  done: boolean;
}

const LS_TIMERS = 'kukhnya.timers';
const LS_SYSTEM = 'kukhnya.systemTimer';
/** Имя быстрой команды в приложении «Команды». */
export const SHORTCUT_NAME = 'Кухня таймер';

function load(): KitchenTimer[] {
  try {
    return JSON.parse(localStorage.getItem(LS_TIMERS) ?? '[]') as KitchenTimer[];
  } catch {
    return [];
  }
}

let timers: KitchenTimer[] = load();
const listeners = new Set<() => void>();
let audio: AudioContext | null = null;

function save() {
  try {
    localStorage.setItem(LS_TIMERS, JSON.stringify(timers));
  } catch {
    /* не сохранится после перезапуска — не страшно */
  }
  listeners.forEach((l) => l());
}

export function useTimers(): KitchenTimer[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => timers,
  );
}

export function systemTimerEnabled(): boolean {
  try {
    return localStorage.getItem(LS_SYSTEM) === '1';
  } catch {
    return false;
  }
}

export function setSystemTimer(on: boolean) {
  try {
    localStorage.setItem(LS_SYSTEM, on ? '1' : '0');
  } catch {
    /* настройка не запомнится */
  }
  listeners.forEach((l) => l());
}

/** Ссылка, которая запускает быструю команду «Кухня таймер» с числом минут. */
export function shortcutUrl(minutes: number): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${minutes}`;
}

/** Звук на iPhone разрешён только после нажатия — готовим его прямо в обработчике нажатия. */
function unlockAudio() {
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {
      audio = null;
    }
  }
  void audio?.resume();
}

function beep() {
  if (!audio) return;
  void audio.resume();
  for (let i = 0; i < 4; i++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.3;
    o.connect(g).connect(audio.destination);
    const t = audio.currentTime + i * 0.45;
    o.start(t);
    o.stop(t + 0.28);
  }
}

export function startTimer(label: string, seconds: number, dish: string) {
  unlockAudio();
  timers = [...timers, { id: Date.now(), label, dish, endsAt: Date.now() + seconds * 1000, done: false }];
  save();
  if (systemTimerEnabled()) {
    // Таймер в «Часах» звонит, даже если «Кухня» свёрнута или экран заблокирован.
    window.location.href = shortcutUrl(Math.max(1, Math.round(seconds / 60)));
  }
}

export function cancelTimer(id: number) {
  timers = timers.filter((t) => t.id !== id);
  save();
}

/** Проверить, не вышло ли время. Вызывается каждую секунду и при возврате в приложение. */
export function checkTimers(onDone: (t: KitchenTimer) => void) {
  const now = Date.now();
  let changed = false;
  timers = timers.map((t) => {
    if (!t.done && t.endsAt <= now) {
      changed = true;
      onDone(t);
      return { ...t, done: true };
    }
    return t;
  });
  if (changed) {
    beep();
    save();
  }
}

export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
