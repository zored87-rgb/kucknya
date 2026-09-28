// Порции: на сколько человек рецепт, пересчёт ×½ / ×2 и «есть меньше, чем нужно».

import { normalize, stem } from '../data/ingredients';
import { PRODUCT_BY_KEY } from '../data/products';
import { formatQty } from '../data/quantity';
import type { Ingredient, Product, Recipe, RecipeType } from '../types';
import type { IngredientCheck, Stock } from './availability';

const DEFAULT_SERVINGS: Record<RecipeType, number> = {
  breakfast: 2,
  batch_lunch: 4,
  dinner: 2,
  weekend: 4,
  backup: 2,
  extra: 2,
};

export function servingsOf(r: Recipe): number {
  return r.servings ?? DEFAULT_SERVINGS[r.type] ?? 2;
}

function plural(n: number, forms: [string, string, string]): string {
  if (!Number.isInteger(n)) return forms[1];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** «1 ч 30 мин, из них 30 активно» → 90. Не разобрали — null. */
export function minutesOf(time: string): number | null {
  const t = (time ?? '').split(',')[0];
  const h = t.match(/(\d+(?:[.,]\d+)?)\s*ч/);
  const m = t.match(/(\d+)\s*мин/);
  if (!h && !m) return null;
  return Math.round((h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0));
}

/** «🍽 2 порции» или «🍲 4 порции · на 2 дня» — готовим на двоих. */
export function servingsText(n: number): string {
  const p = `${fmtNum(n)} ${plural(n, ['порция', 'порции', 'порций'])}`;
  const days = Math.floor(n / 2);
  return days >= 2 ? `🍲 ${p} · на ${days} ${plural(days, ['день', 'дня', 'дней'])}` : `🍽 ${p}`;
}

const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** 0.5 → «½», 1.5 → «1½», 2 → «2»: штуки и ложки — с точностью до четверти. */
export function fmtNum(n: number): string {
  const q = Math.max(0.25, Math.round(n * 4) / 4);
  const whole = Math.floor(q);
  const rest = q - whole;
  const fr = rest === 0.25 ? '¼' : rest === 0.5 ? '½' : rest === 0.75 ? '¾' : '';
  return whole ? `${whole}${fr}` : fr;
}

/** Граммы и миллилитры — круглыми числами: 267 → 270, 37 → 35. */
function fmtMass(n: number, unit: string): string {
  if (unit === 'кг' || unit === 'л') {
    if (n < 1) return String(Math.round((n * 1000) / 50) * 50) + (unit === 'кг' ? ' г' : ' мл');
    return String(Math.round(n * 10) / 10).replace('.', ',') + ' ' + unit;
  }
  const r = n >= 200 ? Math.round(n / 10) * 10 : Math.max(5, Math.round(n / 5) * 5);
  if (r >= 1000 && r % 100 === 0) return `${String(r / 1000).replace('.', ',')} ${unit === 'мл' ? 'л' : 'кг'}`;
  return `${r} ${unit}`;
}

/** Слова, которые меняют форму после числа: «1 зубчик — 2 зубчика — 5 зубчиков». */
const COUNT_WORDS: [string, string, string][] = [
  ['зубчик', 'зубчика', 'зубчиков'],
  ['ломтик', 'ломтика', 'ломтиков'],
  ['банка', 'банки', 'банок'],
  ['пачка', 'пачки', 'пачек'],
  ['кочан', 'кочана', 'кочанов'],
  ['пучок', 'пучка', 'пучков'],
  ['пакетик', 'пакетика', 'пакетиков'],
  ['пакет', 'пакета', 'пакетов'],
  ['лист', 'листа', 'листов'],
  ['головка', 'головки', 'головок'],
  ['ложка', 'ложки', 'ложек'],
  ['кусок', 'куска', 'кусков'],
  ['упаковка', 'упаковки', 'упаковок'],
  ['стаканчик', 'стаканчика', 'стаканчиков'],
  ['стакан', 'стакана', 'стаканов'],
  ['горсть', 'горсти', 'горстей'],
  ['желток', 'желтка', 'желтков'],
  ['грудка', 'грудки', 'грудок'],
  ['порция', 'порции', 'порций'],
  ['яйцо', 'яйца', 'яиц'],
];

const NUM = String.raw`(\d+\s+\d\/\d|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s?[½¼¾⅓⅔])?|[½¼¾⅓⅔])`;
// После числа: единица (г, мл…) или слово. Не трогаем «18 см», «180°», «20 мин».
const RE = new RegExp(NUM + String.raw`(\s*[-–]\s*` + NUM + String.raw`)?(\s*)([а-яёa-z.]+|°|%)?`, 'gi');

function parseNum(s: string): number {
  s = s.trim().replace(',', '.');
  const mixed = s.match(/^(\d+)\s+(\d)\/(\d)$/);
  if (mixed) return +mixed[1] + +mixed[2] / +mixed[3];
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  const m = s.match(/^(\d+(?:\.\d+)?)?\s?([½¼¾⅓⅔])?$/);
  if (!m) return NaN;
  return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? FRAC[m[2]] : 0);
}

/** Пересчитать числа в тексте количества: «400 г» ×½ → «200 г», «2 зубчика» ×½ → «1 зубчик». */
export function scaleText(text: string, f: number, product?: Product): string {
  if (!text || f === 1) return text;
  return text.replace(RE, (all, a: string, _range: string | undefined, b: string | undefined, sp: string, word: string | undefined) => {
    const w = (word ?? '').toLowerCase();
    if (/^(см|мм|°|%|мин|ч|час|часа|сек|раз)\.?$/.test(w)) return all;
    const x = parseNum(a) * f;
    const y = b ? parseNum(b) * f : null;
    if (Number.isNaN(x)) return all;
    const unit = w.match(/^(г|гр|мл|кг|л)\.?$/)?.[1];
    if (unit) {
      const u = unit === 'гр' ? 'г' : unit;
      if (y != null) return `${fmtMass(x, u).replace(/\s.*$/, '')}–${fmtMass(y, u)}`;
      return fmtMass(x, u);
    }
    const nums = y != null ? `${fmtNum(x)}–${fmtNum(y)}` : fmtNum(x);
    const last = y ?? x;
    const forms = product?.forms && product.forms.some((v) => v.toLowerCase() === w) ? product.forms : COUNT_WORDS.find((fs) => fs.includes(w));
    if (forms) return `${nums}${sp || ' '}${plural(Math.max(0.25, Math.round(last * 4) / 4), forms as [string, string, string])}`;
    return `${nums}${sp}${word ?? ''}`;
  });
}

// В тексте шагов пересчитываем только меры: «250 мл молока», «2 ст.л. сахара». «3 см», «10 мин», «4 дня» — нет.
const STEP_AMOUNT = new RegExp(
  NUM + String.raw`(\s*[-–]\s*` + NUM + String.raw`)?\s*(г|гр|кг|мл|л|ст\.\s?л\.|ч\.\s?л\.|ложк[а-яё]*|стакан[а-яё]*|зубчик[а-яё]*|банк[а-яё]*|яйц[а-яё]*|яйц)(?![а-яё])`,
  'gi',
);

export function scaleStep(text: string, f: number): string {
  if (f === 1) return text;
  return text.replace(STEP_AMOUNT, (m) => scaleText(m, f));
}

/** Количество строки рецепта с учётом множителя. Нет текста — берём число n. */
export function scaledQty(ing: { p: string; q?: string; n?: number }, f: number): string {
  const product = PRODUCT_BY_KEY.get(ing.p);
  // «1» → «½ луковицы»: голое число дополняем словом.
  if (ing.q && f !== 1 && /^\s*[\d½¼¾.,/]+\s*$/.test(ing.q) && product?.unit === 'шт' && product.forms) {
    const n = parseNum(ing.q);
    if (!Number.isNaN(n)) return formatQty(n * f, product);
  }
  if (ing.q) return scaleText(ing.q, f, product);
  if (ing.n != null && f !== 1) return formatQty(ing.n * f, product);
  return '';
}

export interface ShortNote {
  key: string;
  /** Сколько есть и сколько нужно, в единицах продукта. */
  have: number;
  need: number;
  /** Во сколько раз уменьшить остальное: 1.6. */
  times: number;
  /** Множитель, чтобы рецепт сошёлся с тем, что есть: 0.6. */
  fit: number;
}

/** Главный продукт, которого меньше, чем в рецепте: «есть 250 из 400 г». */
export function shortNote(items: IngredientCheck[], stock: Stock, f = 1): ShortNote | null {
  let worst: ShortNote | null = null;
  for (const c of items) {
    if (!c.use || c.ing.opt || c.ing.n == null) continue;
    // Замена в тех же единицах (курица → бёдра, граммы) — считаем так же.
    const a = PRODUCT_BY_KEY.get(c.ing.p);
    const b = PRODUCT_BY_KEY.get(c.use);
    if (c.use !== c.ing.p && !(a && b && a.unit === b.unit && (a.unit !== 'шт' || a.forms?.[0] === b.forms?.[0]))) continue;
    if (c.have !== 'enough' && c.have !== 'short') continue;
    const item = stock.items.get(c.use);
    if (!item || item.unknown || item.qty <= 0) continue;
    const p = PRODUCT_BY_KEY.get(c.use);
    const need = c.ing.n * f;
    // Мелочи (пол-банки, 20 г масла) не считаем — только то, из чего блюдо.
    if (p?.unit === 'шт' ? need < 1 : need < 100) continue;
    const ratio = item.qty / need;
    if (ratio >= 0.85) continue;
    if (!worst || ratio < worst.have / worst.need) {
      const fit = Math.max(0.5, Math.floor(ratio * f * 4) / 4);
      worst = { key: c.use, have: item.qty, need, times: Math.round((need / item.qty) * 10) / 10, fit };
    }
  }
  // Уменьшать дальше некуда — не советуем.
  return worst && worst.fit < f ? worst : null;
}

/** Что из кладовой упомянуто только в шагах: «посолите», «поперчите», «на масле». */
const STEP_PANTRY: [RegExp, string][] = [
  [/(^|[^а-яё])(сол[ьи]|посол|подсол|присол)/i, 'соль'],
  [/поперч|(^|[^а-яё])перц(ем|а)?(?! болгар)(?![а-яё])|(^|[^а-яё])перец(?! болгар)(?![а-яё])/i, 'перец чёрный'],
  [/(^|[^а-яё])масл[оаеу](?! сливочн)/i, 'масло растительное'],
  [/сахар/i, 'сахар'],
  [/(^|[^а-яё])мук[аиуеой]/i, 'мука'],
  [/паприк/i, 'паприка'],
  [/орегано|итальянск\S* трав/i, 'орегано'],
  [/лавров/i, 'лавровый лист'],
  [/(^|[^а-яё])(зир[аыу]|кумин)/i, 'кумин'],
  [/куркум/i, 'куркума'],
  [/кориц/i, 'корица'],
  [/хмели/i, 'хмели-сунели'],
];

export interface PantryItem {
  key: string;
  /** Количество из рецепта, уже с учётом ×½ / ×2. */
  q: string;
}

/**
 * Строка «Из кладовой: соль, перец, масло» — чтобы всё проверить до начала.
 * Берём строки рецепта, которые закрывает кладовая, и специи, упомянутые только в шагах.
 */
export function pantryItems(items: IngredientCheck[], steps: string[], f = 1): PantryItem[] {
  const out: PantryItem[] = [];
  const seen = new Set<string>();
  const families = new Set<string>();
  for (const c of items) {
    const key = c.use ?? c.ing.p;
    const fam = PRODUCT_BY_KEY.get(key)?.family;
    if (fam) families.add(fam);
    seen.add(key);
    seen.add(c.ing.p);
    if (c.have !== 'pantry' || seen.has('pantry:' + key)) continue;
    seen.add('pantry:' + key);
    out.push({ key, q: scaledQty(c.ing, f) });
  }
  const text = steps.join(' ');
  for (const [re, key] of STEP_PANTRY) {
    if (seen.has(key) || !re.test(text)) continue;
    // Масло уже есть в рецепте (оливковое, сливочное) — не дублируем.
    if (key.startsWith('масло') && (families.has('масло') || seen.has('масло сливочное') || seen.has('масло оливковое'))) continue;
    seen.add(key);
    out.push({ key, q: '' });
  }
  return out;
}

export interface StepPart {
  text: string;
  /** Количество после слова: «сметану» + «3 ст.л.». */
  q?: string;
}

/** Шаги с количествами при первом упоминании продукта: «добавьте сметану (3 ст.л.)». */
export function stepsWithQty(steps: string[], ingredients: Ingredient[], f = 1): StepPart[][] {
  const pending = ingredients
    .map((ing) => {
      const words = normalize(ing.p).split(' ');
      let q = shortQ(scaledQty(ing, f));
      // «1» → «1 луковица».
      const product = PRODUCT_BY_KEY.get(ing.p);
      if (/^[\d½¼¾.,/]+$/.test(q) && ing.n != null && product?.unit === 'шт') q = formatQty(ing.n * f, product);
      return { stem: stem(words[0] ?? ''), next: words[1] ? stem(words[1]) : '', q };
    })
    .filter((x) => x.stem && x.q);
  return steps.map((raw) => {
    const text = scaleStep(raw, f);
    const parts: StepPart[] = [];
    let from = 0;
    for (const m of text.matchAll(/[а-яёa-z]+/gi)) {
      if (m.index! < from) continue;
      const i = pending.findIndex((x) => x.stem === stem(normalize(m[0])));
      if (i < 0) continue;
      const x = pending[i];
      pending.splice(i, 1);
      let end = m.index! + m[0].length;
      // «соус карри»: количество после второго слова.
      const after = text.slice(end).match(/^\s+([а-яёa-z]+)/i);
      if (after && x.next && stem(normalize(after[1])) === x.next) end += after[0].length;
      // Количество уже написано рядом: «250 мл молока», «муку (около 200 г)».
      if (/[\d½¼¾]\S*\s*[а-яё.]*\s*$/i.test(text.slice(Math.max(0, m.index! - 14), m.index!))) continue;
      if (/^\s*\(?\s*(около\s*|~\s*)?[\d½¼¾]/.test(text.slice(end))) continue;
      parts.push({ text: text.slice(from, end), q: x.q });
      from = end;
    }
    parts.push({ text: text.slice(from) });
    return parts;
  });
}

/** «7 средних (1 кг)» → «7 средних», «по вкусу» → '' — в шаг идёт только число с единицей. */
function shortQ(q: string): string {
  const m = q.match(/^(около\s*|~\s*)?[\d½¼¾][\d½¼¾.,/]*(\s*[-–]\s*[\d½¼¾][\d½¼¾.,/]*)?(\s*[а-яё]+\.?(?:[а-яё]+\.)?)?/i);
  return m ? m[0].trim() : '';
}
