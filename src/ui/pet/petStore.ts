// Настройки кота на этом телефоне: имя, наряд, обои, звук, точное время кормлений.
// Сытость и уровень считаются из общей истории — тут только то, что не нужно синхронизировать.

import { useSyncExternalStore } from 'react';

export interface PetPrefs {
  name: string;
  outfit: string;
  wall: string;
  sound: boolean;
  /** id записи «Съели» → когда её сделали на этом телефоне. */
  fed: Record<string, number>;
  /** Уровень, о котором уже поздравили. 0 — ещё не знаем. */
  seenLevel: number;
  /** Покормили, пока были на другой вкладке: кот доест, когда вернёмся на кухню. */
  pendingFeed: number;
  /** Опыт, который уже показали «+10». */
  lastXp: number;
}

const KEY = 'kukhnya.pet';

const DEFAULTS: PetPrefs = { name: 'Пухля', outfit: '', wall: '', sound: true, fed: {}, seenLevel: 0, pendingFeed: 0, lastXp: -1 };

let prefs: PetPrefs = load();
const listeners = new Set<() => void>();

function load(): PetPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* приватный режим — живём без сохранения */
  }
}

export function getPet(): PetPrefs {
  return prefs;
}

export function setPet(patch: Partial<PetPrefs>) {
  prefs = { ...prefs, ...patch };
  save();
  listeners.forEach((l) => l());
}

export function usePet(): PetPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

/** Записали еду: запоминаем время, кот поест при следующем показе кухни. */
export function feedPet(rowId?: string) {
  const fed = { ...prefs.fed };
  if (rowId) fed[rowId] = Date.now();
  // Старые метки не нужны: сытость смотрит только на последние дни.
  const cutoff = Date.now() - 14 * 24 * 3_600_000;
  for (const [id, t] of Object.entries(fed)) if (t < cutoff) delete fed[id];
  setPet({ fed, pendingFeed: Date.now() });
}
