// Нормализация названий продуктов: свободный текст → ключ каталога.
// Сравниваем по словам, а не по подстроке, чтобы «Сырники» не превращались в «сыр».

import type { Product } from '../types';
import { PRODUCTS } from './products';

const STOP = new Set(['с', 'и', 'в', 'во', 'для', 'на', 'из', 'по', 'или', 'без', 'de', 'la', 'el', 'con', 'para', 'en', 'y', 'o', 'шт', 'г', 'кг', 'мл', 'л', 'уп']);

// Окончания, от длинных к коротким. Основа должна остаться не короче 3 букв.
const ENDINGS = [
  'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю',
  'ов', 'ев', 'ом', 'ем', 'ах', 'ях', 'ам', 'ям',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
];

/** Нижний регистр, ё→е, без диакритики и пунктуации. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    // á→a, ñ→n. Только латиница: кириллическую «й» не трогаем.
    .replace(/[à-ÿ]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .replace(/[^a-zа-я0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Основа слова: «томаты» → «томат», «бёдра» → «бедр», «сырники» → «сырник». */
export function stem(word: string): string {
  if (/^[a-z]+$/.test(word)) {
    if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
    return word;
  }
  for (const e of ENDINGS) {
    if (word.endsWith(e) && word.length - e.length >= 3) return word.slice(0, -e.length);
  }
  return word;
}

/** «Сыр (не чеддер)» → без «не чеддер»; скобки раскрываем в обычные слова. */
function dropNegations(s: string): string {
  return s.replace(/(^|[\s(,])не\s+[^\s),]+/g, ' ');
}

export function tokens(s: string): string[] {
  const n = normalize(dropNegations(s.toLowerCase()));
  return n
    .split(' ')
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

interface AliasEntry {
  product: Product;
  stems: string[];
  text: string;
}

function buildIndex(products: Product[]): AliasEntry[] {
  const out: AliasEntry[] = [];
  for (const product of products) {
    const names = new Set([product.key, product.name, ...(product.aliases ?? [])]);
    for (const text of names) {
      const stems = tokens(text);
      if (stems.length) out.push({ product, stems, text });
    }
  }
  return out;
}

const INDEX = buildIndex(PRODUCTS);

export interface MatchResult {
  product: Product;
  /** Сколько слов совпало — чем больше, тем точнее. */
  score: number;
}

/**
 * Свободный текст → продукт каталога.
 * Побеждает самый конкретный синоним: «Лук зелёный» → «лук зелёный», а не «лук».
 * При равенстве — тот, чьё слово стоит раньше: «Табуле с кускусом» → табуле.
 */
export function matchProduct(text: string, index: AliasEntry[] = INDEX): MatchResult | null {
  const words = tokens(text);
  if (!words.length) return null;
  let best: { e: AliasEntry; pos: number } | null = null;
  for (const e of index) {
    let pos = Infinity;
    let ok = true;
    for (const s of e.stems) {
      const i = words.indexOf(s);
      if (i < 0) {
        ok = false;
        break;
      }
      pos = Math.min(pos, i);
    }
    if (!ok) continue;
    if (
      !best ||
      e.stems.length > best.e.stems.length ||
      (e.stems.length === best.e.stems.length && pos < best.pos) ||
      (e.stems.length === best.e.stems.length && pos === best.pos && e.text.length > best.e.text.length)
    ) {
      best = { e, pos };
    }
  }
  return best ? { product: best.e.product, score: best.e.stems.length } : null;
}

export function productKeyOf(text: string): string | null {
  return matchProduct(text)?.product.key ?? null;
}

/**
 * Подсказки для поля «Добавить продукт»: «лук» → лук репчатый, красный, зелёный, порей.
 * Ищем по началу слова (без отрезания окончаний — человек печатает начало).
 */
export function suggestProducts(query: string, limit = 8, products: Product[] = PRODUCTS): Product[] {
  const q = normalize(query);
  if (!q) return [];
  const qWords = q.split(' ');
  const scored: { p: Product; s: number }[] = [];
  for (const p of products) {
    const name = normalize(p.name);
    const all = [name, ...(p.aliases ?? []).map(normalize)];
    let s = 0;
    if (all.includes(q)) s = 120;
    else if (name.startsWith(q)) s = 100;
    else if (all.some((a) => a.startsWith(q))) s = 80;
    else if (all.some((a) => qWords.every((w) => a.split(' ').some((t) => t.startsWith(w))))) s = 60;
    if (s) scored.push({ p, s: s - name.length / 100 });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Строка кладовой («паста», «специи», «масло», «tomate triturado») → набор ключей. */
export function resolvePantry(items: string[], products: Product[] = PRODUCTS): Set<string> {
  const out = new Set<string>();
  for (const raw of items) {
    const n = normalize(raw);
    if (!n) continue;
    const fam = products.filter((p) => p.family && normalize(p.family) === n);
    if (fam.length) {
      fam.forEach((p) => out.add(p.key));
      continue;
    }
    const m = matchProduct(raw);
    if (m) out.add(m.product.key);
  }
  return out;
}
