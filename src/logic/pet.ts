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

/**
 * Личный темп голода по росту, весу и полу: обмен веществ в покое по формуле Mifflin–St Jeor,
 * пересчитанный на килограмм веса, плюс время опорожнения желудка (голод возвращается через 3–5 ч,
 * у женщин в среднем чуть позже). Здесь только итог — сколько часов от «сыт» до «пусто»;
 * «голоден» (35%) наступает через 65% этого времени: у Криса ≈ 4,5 ч, у Кристины ≈ 5 ч.
 * Возраст взят 30 лет — он почти не влияет. Ручные отметки дальше подстраивают темп.
 */
const PERSONAL_HOURS: Record<string, number> = { Крис: 7.0, Кристина: 8.0 };

/** Темп голода человека: выученный по отметкам или рассчитанный по росту и весу. */
export function metabolismOf(person: string, learned?: Metabolism | null): Metabolism {
  const base = PERSONAL_HOURS[person] ?? FULL_HOURS;
  if (learned && learned.n > 0) return learned;
  return { fullHours: base, n: 0, override: learned?.override ?? null };
}

/** Что ел этот человек: свои записи и общие «оба». */
export function eatenBy(eaten: EatenRow[], person: string): EatenRow[] {
  return eaten.filter((r) => !r.who || r.who === 'оба' || r.who === person);
}

function clamp100(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Сытость за последние двое суток: от события к событию убывает с личным темпом,
 * еда прибавляет по калориям (gain: банан ≈ 15, обед ≈ 100, можно «объесться» до 110),
 * ручная отметка ставит значение как есть.
 */
export function satietyOf(
  eaten: EatenRow[],
  exact: Record<string, number>,
  now: number,
  m: Metabolism = DEFAULT_METABOLISM,
  gain: (row: EatenRow) => number = () => 100,
): number {
  const WINDOW = 48 * HOUR;
  const events: { t: number; set?: number; add?: number }[] = [];
  for (const row of eaten) {
    let t = mealTime(row, exact);
    if (t == null) continue;
    if (t > now) {
      if (t - now > 12 * HOUR) continue;
      t = now;
    }
    if (now - t > WINDOW) continue;
    events.push({ t, add: gain(row) });
  }
  const ov = m.override && m.override.at <= now && now - m.override.at <= WINDOW ? m.override : null;
  if (ov) events.push({ t: ov.at, set: ov.value });
  if (!events.length) return 25;
  events.sort((x, y) => x.t - y.t);
  // До первой известной еды считаем, что был голоден
  let s = 25;
  let prev = events[0].t;
  const decay = (from: number, to: number) => (awakeHours(from, to) * 100) / m.fullHours;
  for (const e of events) {
    s = Math.max(0, s - decay(prev, e.t));
    s = e.set != null ? e.set : Math.min(110, s + (e.add ?? 0));
    prev = e.t;
  }
  return clamp100(s - decay(prev, now));
}

/**
 * Ручная отметка «я сыт на value»: запоминаем её и подстраиваем темп.
 * С последней еды (или прошлой отметки) сытость упала с «было» до value за h часов —
 * значит, от сыт до пусто ≈ h × 100 / (было − value). Учитываем, что перекус насыщает меньше обеда.
 */
export function calibrate(
  eaten: EatenRow[],
  exact: Record<string, number>,
  now: number,
  value: number,
  m: Metabolism = DEFAULT_METABOLISM,
  gain: (row: EatenRow) => number = () => 100,
): Metabolism {
  const last = lastMealAt(eaten, exact, now);
  const prevAt = m.override && m.override.at <= now ? m.override.at : null;
  const start = Math.max(last ?? 0, prevAt ?? 0);
  let { fullHours, n } = m;
  if (start > 0) {
    const h = awakeHours(start, now);
    const was = satietyOf(eaten, exact, start, m, gain);
    if (h >= 1 && value < 95) {
      const drop = was - value;
      // Сытее, чем думал Гера — темп чуть медленнее; голоднее — считаем по падению
      const implied = drop > 3 ? Math.max(4, Math.min(36, (h * 100) / drop)) : Math.min(36, fullHours * 1.3);
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

// ---------- Погода, серия, приветствие ----------

const WEATHER_TALK: Record<string, string[]> = {
  clear: ['Солнышко! Погреть бы пузико', 'Какая погода — хоть на балкон'],
  partly: ['Облачка плывут. Одно похоже на рыбку', 'Немного облаков, немного солнца'],
  cloudy: ['Пасмурно. Самое время для супа', 'Серо за окном. Зато дома уютно'],
  fog: ['Туман. Я ничего не вижу, кроме холодильника', 'Туман, как в сказке'],
  drizzle: ['Моросит. Хорошо, что мы дома', 'Мелкий дождик. Я никуда не пойду'],
  rain: ['Дождь! Я остаюсь на кухне', 'Слышишь дождь? Уютно'],
  snow: ['Снег в Валенсии?! Невероятно', 'Снежинки! Можно я на них посмотрю'],
  storm: ['Гроза… Можно я посижу рядом?', 'Гром! Я не боюсь. Почти'],
};

export function weatherTalk(kind: string, night: boolean, seed: number): string {
  if (night && (kind === 'clear' || kind === 'partly')) {
    const n = ['Смотри, какие звёзды', 'Луна сегодня похожа на сырник'];
    return n[Math.abs(seed) % n.length];
  }
  const list = WEATHER_TALK[kind] ?? WEATHER_TALK.clear;
  return list[Math.abs(seed) % list.length];
}

/** Сколько дней подряд ели дома (сегодня или по вчера включительно). */
export function streakOf(eaten: EatenRow[], today: Date): number {
  const days = new Set<string>();
  for (const r of eaten) {
    const d = parseDate(r.date);
    if (d) days.add(d.toDateString());
  }
  const day = new Date(today);
  day.setHours(12, 0, 0, 0);
  // Сегодня ещё не ели — серия считается по вчера
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1);
  let n = 0;
  while (days.has(day.toDateString()) && n < 366) {
    n++;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

export function streakTalk(n: number): string | null {
  if (n < 2) return null;
  const w = n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней';
  return `${n} ${w} подряд едим дома. Я горжусь!`;
}

/** Приветствие, когда вернулись на кухню. */
export function greeting(hour: number, mood: Mood, seed: number): string {
  if (mood === 'hungry' || mood === 'angry') return ['Ты вернулся! А еда?', 'Наконец-то! Я тут голодаю'][Math.abs(seed) % 2];
  if (hour >= 5 && hour < 11) return ['Доброе утро!', 'Утро! Завтракать будем?'][Math.abs(seed) % 2];
  if (hour >= 11 && hour < 17) return ['Привет! Как день?', 'О, ты пришёл!'][Math.abs(seed) % 2];
  if (hour >= 17 && hour < 23) return ['Добрый вечер!', 'Вечер. Что на ужин?'][Math.abs(seed) % 2];
  return ['Ты чего не спишь?', 'Ночной перекус? Я никому не скажу'][Math.abs(seed) % 2];
}
