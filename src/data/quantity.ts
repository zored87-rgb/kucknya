// Количество в колонке «Сколько»: «6 луковиц», «½ банки», «~150 г», «почти полная».
// Приложение пишет туда понятный текст, а читает и свой формат, и старые свободные записи.

import type { Product } from '../types';

export interface Qty {
  /** Число в единицах продукта. null — количество неизвестно, но продукт есть. */
  n: number | null;
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const WORDS: [RegExp, number][] = [
  [/полов|пол\s?(банки|пачки|упаковки|пакета)|^пол(\s|$)/, 0.5],
  [/почти\s+(полн|цел)/, 0.9],
  [/на\s+донышке|мало|чуть|почти\s+законч/, 0.2],
  [/четверт/, 0.25],
];

/** Разобрать число из текста. Для граммов/мл берём число рядом с «г»/«мл», для штук — первое число. */
export function parseQty(text: string, product?: Product): Qty {
  const t = (text ?? '').toLowerCase().replace(',', '.').trim();
  if (!t) return { n: null };
  if (/^(0|нет|закончил)/.test(t)) return { n: 0 };

  const unit = product?.unit ?? 'шт';
  if (unit === 'г' || unit === 'мл') {
    const kg = t.match(/(\d+(?:\.\d+)?)\s*(кг|л)(?![а-я])/);
    if (kg) return { n: parseFloat(kg[1]) * 1000 };
    const g = t.match(/(\d+(?:\.\d+)?)\s*(грамм|гр|г|мл)(?![а-я])/);
    if (g) return { n: parseFloat(g[1]) };
    const bare = t.match(/^~?\s*(\d+(?:\.\d+)?)\s*$/);
    if (bare) return { n: parseFloat(bare[1]) };
    return { n: null };
  }

  // Штуки: «½», «1/2», «1 1/2», «2», «2.5», слова.
  const mixed = t.match(/(\d+)\s+(\d)\/(\d)/);
  if (mixed) return { n: +mixed[1] + +mixed[2] / +mixed[3] };
  const frac = t.match(/(\d)\/(\d)/);
  if (frac) return { n: +frac[1] / +frac[2] };
  const uni = t.match(/(\d+)?\s*([½¼¾⅓⅔])/);
  if (uni) return { n: (uni[1] ? +uni[1] : 0) + FRACTIONS[uni[2]] };
  // Первое число, за которым не идут граммы: «1 порция, ~80 г» → 1, «почти полная, 200 г» → не число.
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)(\s*(кг|гр|г|мл|л)(?![а-я]))?/g)) {
    if (!m[2]) return { n: parseFloat(m[1]) };
  }
  for (const [re, v] of WORDS) if (re.test(t)) return { n: v };
  if (/полн|цел/.test(t)) return { n: 1 };
  return { n: null };
}

function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const FRAC_TEXT: [number, string][] = [
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
];

/** Число → текст для колонки «Сколько»: 6 → «6 луковиц», 0.5 → «½ банки», 450 → «450 г». */
export function formatQty(n: number | null, product?: Product): string {
  if (n == null) return '';
  if (!product) return String(round(n));
  if (product.unit === 'г') return n >= 1000 && n % 100 === 0 ? `${n / 1000} кг` : `${Math.round(n)} г`;
  if (product.unit === 'мл') return n >= 1000 && n % 100 === 0 ? `${n / 1000} л` : `${Math.round(n)} мл`;
  const forms = product.forms ?? ['шт', 'шт', 'шт'];
  // Штуки — с точностью до четверти: 0.4 лимона → ½ лимона.
  if (n > 0) n = Math.max(0.25, Math.round(n * 4) / 4);
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  const fr = FRAC_TEXT.find(([v]) => Math.abs(v - rest) < 0.07);
  if (rest < 0.07) return `${whole} ${plural(whole, forms)}`;
  if (fr) return whole ? `${whole}${fr[1]} ${forms[1]}` : `${fr[1]} ${forms[1]}`;
  return `${round(n)} ${forms[1]}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Шаг кнопок «−/+»: штуки по 1 (для банок и пачек — по половинке), граммы по 50. */
export function stepFor(product?: Product): number {
  if (!product) return 1;
  if (product.unit === 'г' || product.unit === 'мл') return 50;
  const f = product.forms?.[0] ?? '';
  return /банка|пачка|упаковка|пакет|бутылка/.test(f) ? 0.5 : 1;
}

/** Быстрые варианты для «Сколько» в форме добавления. */
export function quickAmounts(product?: Product): number[] {
  if (!product) return [1, 2, 3];
  if (product.unit === 'г') return [100, 200, 250, 400, 500, 1000];
  if (product.unit === 'мл') return [200, 500, 1000];
  if (stepFor(product) === 0.5) return [0.25, 0.5, 1, 2];
  return [1, 2, 3, 4, 6, 10];
}
