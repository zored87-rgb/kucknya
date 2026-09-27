// Рецепты: встроенные из recipes.json + свои из листа «Мои рецепты».

import raw from '../../recipes.json';
import type { Ingredient, MyRecipeRow, Recipe, RecipeType } from '../types';
import { normalize, productKeyOf, tokens } from './ingredients';
import { PRODUCT_BY_KEY } from './products';
import { parseQty } from './quantity';

export const BUILTIN_RECIPES = raw as Recipe[];

const TYPE_WORDS: [RegExp, RecipeType][] = [
  [/завтрак/, 'breakfast'],
  [/обед|суп|партия/, 'batch_lunch'],
  [/ужин/, 'dinner'],
  [/выходн/, 'weekend'],
  [/запас|backup/, 'backup'],
];

function parseType(s: string): RecipeType {
  const t = s.toLowerCase();
  for (const [re, v] of TYPE_WORDS) if (re.test(t)) return v;
  return 'dinner';
}

function parseCuisine(s: string): Recipe['cuisine'] {
  const t = s.toLowerCase();
  if (/рус|ru/.test(t)) return 'ru';
  if (/испан|es/.test(t)) return 'es';
  if (t.trim()) return 'world';
  return null;
}

/** Ключ для продукта, которого нет в каталоге: сравнивается с холодильником по точному названию. */
export function rawKey(name: string): string {
  return 'raw:' + normalize(name);
}

/**
 * Строка продукта из «Моих рецептов»:
 *   «Фарш: 500 г», «Курица / индейка: 400 г», «Сметана: 3 ст.л. (по желанию)».
 */
export function parseIngredientLine(line: string): Ingredient | null {
  const clean = line.trim().replace(/^[-•*]\s*/, '');
  if (!clean) return null;
  const opt = /по желанию|опционально|необязательно/i.test(clean);
  const [namePart, ...rest] = clean.replace(/\((по желанию|опционально|необязательно)\)/i, '').split(':');
  const q = rest.join(':').trim();
  const names = namePart
    .split(/\s*\/\s*|\s+или\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) return null;
  const keys = names.map((n) => productKeyOf(n) ?? rawKey(n));
  const product = PRODUCT_BY_KEY.get(keys[0]);
  let n: number | undefined;
  if (q && product && !/ложк|ст\.?\s?л|ч\.?\s?л|щепот|по вкусу|немного/i.test(q)) {
    const parsed = parseQty(q, product).n;
    if (parsed != null && parsed > 0) n = parsed;
  }
  const ing: Ingredient = { p: keys[0], q: q || undefined };
  if (n != null) ing.n = n;
  if (keys.length > 1) ing.alt = keys.slice(1);
  if (opt) ing.opt = true;
  return ing;
}

export function parseMyRecipe(row: MyRecipeRow): Recipe | null {
  if (!row.name?.trim()) return null;
  const ingredients = String(row.ingredients ?? '')
    .split(/\n|;/)
    .map(parseIngredientLine)
    .filter((x): x is Ingredient => !!x);
  return {
    id: row.id || 'my_' + normalize(row.name).replace(/\s+/g, '_'),
    name: row.name.trim(),
    type: parseType(row.type ?? ''),
    cuisine: parseCuisine(row.cuisine ?? ''),
    origin: null,
    time: row.time || '',
    has_egg_as_main: !!row.egg,
    ingredients,
    steps: String(row.steps ?? '')
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    custom: true,
  };
}

export function allRecipes(my: MyRecipeRow[]): Recipe[] {
  const custom = my.map(parseMyRecipe).filter((x): x is Recipe => !!x);
  const ids = new Set(custom.map((r) => r.id));
  return [...BUILTIN_RECIPES.filter((r) => !ids.has(r.id)), ...custom];
}

/** Запись в «Съели» → рецепт. Сначала по id, потом по названию. */
export function recipeIdForDish(dish: string, recipes: Recipe[]): string | null {
  const n = normalize(dish);
  if (!n) return null;
  const exact = recipes.find((r) => normalize(r.name) === n);
  if (exact) return exact.id;
  const dt = new Set(tokens(dish));
  let best: { id: string; score: number } | null = null;
  for (const r of recipes) {
    const rt = tokens(r.name);
    if (!rt.length) continue;
    const hit = rt.filter((t) => dt.has(t)).length;
    // Все слова рецепта есть в записи, или запись — почти всё название рецепта.
    const score = hit / rt.length;
    if (score >= 0.99 || (hit >= 2 && hit / dt.size >= 0.8)) {
      if (!best || score > best.score) best = { id: r.id, score };
    }
  }
  return best?.id ?? null;
}
