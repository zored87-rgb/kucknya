// Кот: сытость по записям «Съели», настроение, опыт и уровни.
// Всё считается из общей истории, поэтому на обоих телефонах кот одинаковый.

import { normalize } from '../data/ingredients';
import type { EatenRow } from '../types';
import { parseDate } from './dates';

/** Во сколько обычно едят: у записи есть только дата и приём пищи. */
export const MEAL_HOUR: Record<string, number> = { завтрак: 9, обед: 14, перекус: 17, ужин: 20 };

/** Ночью (23–8) кот спит и не голодает. */
const NIGHT_FROM = 23;
const NIGHT_TO = 8;
/** Сколько часов без сна от «сыт» до «пустой живот». */
export const FULL_HOURS = 14;

const HOUR = 3_600_000;

function isNightHour(h: number): boolean {
  return h >= NIGHT_FROM || h < NIGHT_TO;
}

export function isNight(d: Date): boolean {
  const h = d.getHours();
  return h >= NIGHT_FROM || h < 7;
}

/** Когда была эта еда: точное время, если записали на этом телефоне, иначе — по приёму пищи. */
export function mealTime(row: EatenRow, exact: Record<string, number> = {}): number | null {
  if (exact[row.id]) return exact[row.id];
  const d = parseDate(row.date);
  if (!d) return null;
  const t = new Date(d);
  t.setHours(MEAL_HOUR[row.meal] ?? 14, 0, 0, 0);
  return t.getTime();
}

export function lastMealAt(eaten: EatenRow[], exact: Record<string, number>, now: number): number | null {
  let last: number | null = null;
  for (const row of eaten) {
    let t = mealTime(row, exact);
    if (t == null) continue;
    // Записали ужин в 19:00 — считаем, что поели сейчас, а не в 20:00.
    if (t > now) {
      if (t - now > 12 * HOUR) continue;
      t = now;
    }
    if (last == null || t > last) last = t;
  }
  return last;
}

/** Часы между двумя моментами без ночных часов. */
export function awakeHours(from: number, to: number): number {
  if (to <= from) return 0;
  const start = Math.max(from, to - 7 * 24 * HOUR);
  const step = HOUR / 4;
  let n = 0;
  for (let t = start; t < to; t += step) {
    if (!isNightHour(new Date(t).getHours())) n++;
  }
  return n / 4;
}

/** Сытость 0–100. Нет записей — кот голодный. */
export function satiety(eaten: EatenRow[], exact: Record<string, number>, now: number): number {
  const last = lastMealAt(eaten, exact, now);
  if (last == null) return 25;
  const h = awakeHours(last, now);
  return Math.max(0, Math.min(100, Math.round(100 - (h * 100) / FULL_HOURS)));
}

// ---------- Личная сытость и «метаболизм» ----------

/** Как быстро человек голодает и его последняя ручная отметка. Учится по отметкам. */
export interface Metabolism {
  /** Часов бодрствования от «сыт» до «голоден». */
  fullHours: number;
  /** Сколько отметок уже учтено. */
  n: number;
  /** Последняя ручная отметка: «сейчас я сыт на value». */
  override?: { value: number; at: number } | null;
}

export const DEFAULT_METABOLISM: Metabolism = { fullHours: FULL_HOURS, n: 0, override: null };

/** Что ел этот человек: свои записи и общие «оба». */
export function eatenBy(eaten: EatenRow[], person: string): EatenRow[] {
  return eaten.filter((r) => !r.who || r.who === 'оба' || r.who === person);
}

function clamp100(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** Сытость с учётом личного темпа и ручной отметки (если она позже последней еды). */
export function satietyOf(eaten: EatenRow[], exact: Record<string, number>, now: number, m: Metabolism = DEFAULT_METABOLISM): number {
  const last = lastMealAt(eaten, exact, now);
  const ov = m.override && m.override.at <= now ? m.override : null;
  if (ov && (last == null || ov.at >= last)) return clamp100(ov.value - (awakeHours(ov.at, now) * 100) / m.fullHours);
  if (last == null) return 25;
  return clamp100(100 - (awakeHours(last, now) * 100) / m.fullHours);
}

/**
 * Ручная отметка «я сыт на value»: запоминаем её и подстраиваем темп.
 * Если после еды прошло h часов, а сытость value — значит, от сыт до голоден ≈ h / (1 − value/100).
 */
export function calibrate(eaten: EatenRow[], exact: Record<string, number>, now: number, value: number, m: Metabolism = DEFAULT_METABOLISM): Metabolism {
  const last = lastMealAt(eaten, exact, now);
  let { fullHours, n } = m;
  if (last != null && value < 95) {
    const h = awakeHours(last, now);
    if (h >= 1) {
      const implied = Math.max(5, Math.min(36, h / (1 - value / 100)));
      // Первые отметки сильнее сдвигают темп, потом — осторожнее
      const w = n < 3 ? 0.5 : 0.25;
      fullHours = Math.round((fullHours * (1 - w) + implied * w) * 10) / 10;
      n += 1;
    }
  }
  return { fullHours, n, override: { value: clamp100(value), at: now } };
}

export type Mood = 'sleeping' | 'angry' | 'hungry' | 'peckish' | 'sad' | 'happy';

export function moodOf(sat: number, spoiling: number, now: Date): Mood {
  if (sat < 10) return 'angry';
  if (isNight(now) && sat >= 35) return 'sleeping';
  if (sat < 35) return 'hungry';
  if (spoiling > 0) return 'sad';
  if (sat < 65) return 'peckish';
  return 'happy';
}

/** «не ел 9 ч», «не ел 2 дня». */
export function hungerText(last: number | null, now: number): string {
  if (last == null) return 'ещё ни разу не ел';
  const h = Math.floor((now - last) / HOUR);
  if (h < 1) return 'только что поел';
  if (h < 24) return `не ел ${h} ч`;
  const d = Math.floor(h / 24);
  return `не ел ${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}`;
}

// ---------- Опыт и уровни ----------

/** +10 за каждую домашнюю еду, +20 за блюдо, которое готовили впервые. */
export const XP_MEAL = 10;
export const XP_NEW_DISH = 20;

export function xpOf(eaten: EatenRow[]): number {
  const seenMeal = new Set<string>();
  const seenDish = new Set<string>();
  let xp = 0;
  const rows = [...eaten].sort((a, b) => (parseDate(a.date)?.getTime() ?? 0) - (parseDate(b.date)?.getTime() ?? 0));
  for (const row of rows) {
    if (!parseDate(row.date) || !row.dish?.trim()) continue;
    const dish = row.recipeId || normalize(row.dish);
    const key = `${row.date}|${row.meal}|${dish}`;
    if (seenMeal.has(key)) continue;
    seenMeal.add(key);
    xp += XP_MEAL;
    if (!seenDish.has(dish)) {
      seenDish.add(dish);
      xp += XP_NEW_DISH;
    }
  }
  return xp;
}

/** Опыт, нужный для уровня: 2 → 40, 3 → 120, 4 → 240, 5 → 400… */
export function xpForLevel(level: number): number {
  return 20 * level * (level - 1);
}

export function levelOf(xp: number): { level: number; into: number; need: number; progress: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  const need = xpForLevel(level + 1) - base;
  const into = xp - base;
  return { level, into, need, progress: into / need };
}

export type RewardKind = 'outfit' | 'wall';

export interface Reward {
  level: number;
  id: string;
  kind: RewardKind;
  name: string;
  /** Для старых мест; в игре значки рисуются (icons.tsx). */
  emoji?: string;
}

export const REWARDS: Reward[] = [
  { level: 2, id: 'bow', kind: 'outfit', name: 'Бантик', emoji: '🎀' },
  { level: 3, id: 'check', kind: 'wall', name: 'Обои в клетку', emoji: '🟥' },
  { level: 4, id: 'chef', kind: 'outfit', name: 'Поварской колпак', emoji: '👨‍🍳' },
  { level: 5, id: 'glasses', kind: 'outfit', name: 'Очки', emoji: '🤓' },
  { level: 6, id: 'stars', kind: 'wall', name: 'Звёздные обои', emoji: '⭐' },
  { level: 7, id: 'scarf', kind: 'outfit', name: 'Шарф', emoji: '🧣' },
  { level: 8, id: 'crown', kind: 'outfit', name: 'Корона', emoji: '👑' },
  { level: 10, id: 'gold', kind: 'wall', name: 'Золотая кухня', emoji: '✨' },
];

export function rewardsUpTo(level: number): Reward[] {
  return REWARDS.filter((r) => r.level <= level);
}

// ---------- Что говорит ----------

/** Фразы Геры по шкале сытости: чем голоднее, тем драматичнее. */
const BY_HUNGER: [number, string[]][] = [
  [
    90,
    [
      'Я круглый, как пельмешек',
      'Больше не влезет. Ну, может, кусочек',
      'Мурчу на полную громкость',
      'Ещё ложка — и я стану шариком',
      'Сытый кот — добрый кот',
      'Можно я просто полежу тут, красивый',
    ],
  ],
  [
    65,
    [
      'Жизнь удалась',
      'Почешите пузико. Оно заслужило',
      'Я пушистый, довольный и ваш',
      'Мрр. Всё идёт по плану',
      'Люблю вас почти как сметану',
      'Кухня — моё любимое место',
    ],
  ],
  [
    35,
    [
      'Я не голодный. Просто смотрю на холодильник',
      'В животе что-то урчит. Это не я',
      'А что на ужин? Просто интересуюсь',
      'Холодильник сам себя не откроет',
      'Я бы перекусил. Чисто символически',
      'Не хочу давить, но миска пустовата',
    ],
  ],
  [
    10,
    [
      'Миска пустая. Я проверял. Дважды',
      'Я таю на глазах',
      'Мяу. Это значит «покормите»',
      'Пожалуйста… хотя бы корочку',
      'Мой живот поёт грустную песню',
      'Я съел бы даже брокколи',
    ],
  ],
  [
    0,
    [
      'Я требую еды. Немедленно!',
      'Это кошачий бунт!',
      'Пишу жалобу в кошачий профсоюз',
      'Сейчас съем тапок. Ваш',
      'ГДЕ. МОЯ. ЕДА.',
      'Я голодный и очень, очень обиженный',
    ],
  ],
];

const SLEEP = ['Хррр…', 'Мне снится сметана…', 'Не будите, я вижу рыбку', 'Мрр… ещё пять минуточек'];

export function hungerPhrase(sat: number, seed: number): string {
  const list = (BY_HUNGER.find(([min]) => sat >= min) ?? BY_HUNGER[BY_HUNGER.length - 1])[1];
  return list[Math.abs(seed) % list.length];
}

/** Что говорит Гера по настроению (сон и испорченная еда — отдельно). */
export function phrase(mood: Mood, seed: number, sat = 50): string {
  if (mood === 'sleeping') return SLEEP[Math.abs(seed) % SLEEP.length];
  return hungerPhrase(sat, seed);
}

/** Про продукт, который пора выбросить. */
export function spoilPhrase(product: string, seed: number): string {
  const list = [`${product} пахнет подозрительно…`, `Кажется, ${product.toLowerCase()} пора выбросить`, `${product} уже не свежий. Я бы не стал`];
  return list[Math.abs(seed) % list.length];
}

export const TALK = {
  meow: ['Мяу!', 'Мрр?', 'Мяу-мяу!', 'Мрряу'],
  purr: ['Мррррр… ещё', 'Вот тут, да-да', 'Мрр, как приятно'],
  giggle: ['Хи-хи, щекотно!', 'Ай, не пузико!', 'Хи-хи-хи'],
  hiss: ['Сначала еда, потом обнимашки!', 'Ш-ш-ш! Я голодный!', 'Не трогай, я злюсь'],
  wake: ['Мрр? Я не сплю… почти', 'Кто здесь? А, это ты', 'Зачем разбудил…'],
  eat: ['Ням-ням-ням…', 'Вкуснотища!', 'Ммм, объедение'],
  full: ['Спасибо! Это было божественно', 'Шеф, вы гений', 'Лучший ужин в моей жизни'],
};

export function pickTalk(kind: keyof typeof TALK): string {
  const list = TALK[kind];
  return list[Math.floor(Math.random() * list.length)];
}
