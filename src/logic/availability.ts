// Что есть дома: холодильник + кладовая. И хватает ли этого на рецепт.

import { productKeyOf, resolvePantry } from '../data/ingredients';
import { PRODUCT_BY_KEY, PRODUCTS } from '../data/products';
import { parseQty } from '../data/quantity';
import { rawKey } from '../data/recipes';
import type { FridgeRow, Ingredient, Product, Recipe } from '../types';
import { daysBetween, parseDate } from './dates';

/** Срок, после которого продукт считается «скоро испортится». */
export const EXPIRING_DAYS = 2;
/** Хватает, если есть хотя бы 70% от нужного: 400 г фарша вместо 500 — нормально. */
const ENOUGH_RATIO = 0.7;

export interface StockItem {
  key: string;
  rows: FridgeRow[];
  /** Сумма известных количеств. */
  qty: number;
  /** Есть строка без понятного количества («почти полная», «есть»). */
  unknown: boolean;
  /** Сколько дней до ближайшего срока. null — срок не указан. */
  daysLeft: number | null;
}

export interface Stock {
  items: Map<string, StockItem>;
  pantry: Set<string>;
}

export function fridgeKey(row: FridgeRow): string {
  return productKeyOf(row.name) ?? rawKey(row.name);
}

export function buildStock(fridge: FridgeRow[], pantryItems: string[], today: Date): Stock {
  const items = new Map<string, StockItem>();
  for (const row of fridge) {
    if (!row.name?.trim()) continue;
    const key = fridgeKey(row);
    const product = PRODUCT_BY_KEY.get(key);
    const q = parseQty(row.qty, product).n;
    if (q === 0) continue;
    const exp = parseDate(row.expires);
    const days = exp ? daysBetween(today, exp) : null;
    const item = items.get(key) ?? { key, rows: [], qty: 0, unknown: false, daysLeft: null };
    item.rows.push(row);
    if (q == null) item.unknown = true;
    else item.qty += q;
    if (days != null && (item.daysLeft == null || days < item.daysLeft)) item.daysLeft = days;
    items.set(key, item);
  }
  return { items, pantry: resolvePantry(pantryItems) };
}

export function isBanned(key: string): boolean {
  return !!PRODUCT_BY_KEY.get(key)?.banned;
}

/** Чем можно закрыть строку рецепта: сам продукт, замены, а для «сыр»/«курица» — всё семейство. */
export function candidates(ing: Ingredient, products: Product[] = PRODUCTS): string[] {
  const out = [ing.p, ...(ing.alt ?? [])];
  const head = PRODUCT_BY_KEY.get(ing.p);
  if (head?.family && head.family === head.key) {
    for (const p of products) if (p.family === head.family && !out.includes(p.key)) out.push(p.key);
  }
  return out.filter((k) => !isBanned(k));
}

export type Have = 'pantry' | 'enough' | 'short' | 'none';

export function haveStatus(key: string, n: number | undefined, stock: Stock): Have {
  if (stock.pantry.has(key)) return 'pantry';
  const item = stock.items.get(key);
  if (!item) return 'none';
  if (n == null || item.unknown) return 'enough';
  const product = PRODUCT_BY_KEY.get(key);
  // Часть банки/пачки: хватит, если банка вообще есть.
  if (product?.unit === 'шт' && n < 1) return item.qty > 0 ? 'enough' : 'none';
  return item.qty >= n * ENOUGH_RATIO ? 'enough' : 'short';
}

export interface IngredientCheck {
  ing: Ingredient;
  /** Какой продукт берём (сам или замена). null — нечем закрыть. */
  use: string | null;
  have: Have;
  /** Взяли замену вместо основного продукта. */
  substituted: boolean;
  /** Дней до конца срока у того, что берём. */
  daysLeft: number | null;
}

export interface RecipeCheck {
  recipe: Recipe;
  items: IngredientCheck[];
  /** Обязательные строки, которые нечем закрыть. */
  missing: IngredientCheck[];
  ready: boolean;
  /** Продукты со сроком ≤2 дня, которые блюдо пустит в дело. */
  expiring: { key: string; daysLeft: number }[];
  /** В рецепте запрещённый продукт (чеддер, кислый йогурт) без замены. */
  banned: boolean;
}

export function checkRecipe(recipe: Recipe, stock: Stock): RecipeCheck {
  const items: IngredientCheck[] = [];
  let banned = false;
  for (const ing of recipe.ingredients) {
    const cands = candidates(ing);
    if (!cands.length) {
      if (!ing.opt) banned = true;
      continue;
    }
    let best: IngredientCheck | null = null;
    let shortOne: IngredientCheck | null = null;
    for (const key of cands) {
      const have = haveStatus(key, key === ing.p ? ing.n : altAmount(ing, key), stock);
      const daysLeft = stock.items.get(key)?.daysLeft ?? null;
      const c: IngredientCheck = { ing, use: key, have, substituted: key !== ing.p, daysLeft };
      if (have === 'enough' || have === 'pantry') {
        // Из доступного берём то, что испортится раньше.
        if (!best || rankDays(daysLeft) < rankDays(best.daysLeft)) best = c;
      } else if (have === 'short' && !shortOne) {
        shortOne = c;
      }
    }
    items.push(best ?? shortOne ?? { ing, use: null, have: 'none', substituted: false, daysLeft: null });
  }
  const missing = items.filter((c) => !c.ing.opt && c.have !== 'enough' && c.have !== 'pantry');
  const expiring = items
    .filter((c) => c.use && c.have === 'enough' && c.daysLeft != null && c.daysLeft <= EXPIRING_DAYS)
    .map((c) => ({ key: c.use as string, daysLeft: c.daysLeft as number }));
  return { recipe, items, missing, ready: !banned && missing.length === 0, expiring, banned };
}

/** Замена может быть в других единицах (курица в граммах ↔ бёдра в граммах — ок; сливки ↔ сметана — банки). */
function altAmount(ing: Ingredient, key: string): number | undefined {
  const a = PRODUCT_BY_KEY.get(ing.p);
  const b = PRODUCT_BY_KEY.get(key);
  if (a && b && a.unit === b.unit && (a.unit !== 'шт' || a.forms?.[0] === b.forms?.[0])) return ing.n;
  return undefined;
}

function rankDays(d: number | null): number {
  return d == null ? 9999 : d;
}

/** Что вычесть из холодильника, когда блюдо приготовили. */
export interface Usage {
  key: string;
  rows: FridgeRow[];
  /** Сколько взяли по рецепту (в единицах продукта). undefined — неизвестно. */
  n?: number;
}

export function usageFor(check: RecipeCheck, stock: Stock): Usage[] {
  const out: Usage[] = [];
  for (const c of check.items) {
    if (!c.use || c.have !== 'enough') continue;
    const item = stock.items.get(c.use);
    if (!item) continue;
    out.push({ key: c.use, rows: item.rows, n: c.use === c.ing.p ? c.ing.n : altAmount(c.ing, c.use) });
  }
  return out;
}
