// «Что купить»: какие продукты откроют больше всего блюд, и что давно не ели.

import { PRODUCT_BY_KEY } from '../data/products';
import type { Product, RatingRow, Recipe } from '../types';
import { candidates, checkRecipe, isBanned, type RecipeCheck, type Stock } from './availability';
import { dislikedByAnyone, type History } from './suggest';

export interface KeyBuy {
  key: string;
  product: Product | undefined;
  /** Блюда, которые станут полностью доступны. */
  unlocks: Recipe[];
}

/** Обеды, ужины, выходные и запасные: без яиц как основы и без дизлайков. */
export function mealRecipes(recipes: Recipe[], ratings: RatingRow[]): Recipe[] {
  return recipes.filter(
    (r) =>
      r.type !== 'breakfast' &&
      r.type !== 'extra' &&
      !r.has_egg_as_main &&
      !dislikedByAnyone(r.id, ratings),
  );
}

/**
 * Для каждого продукта, которого нет, считаем, сколько блюд станут полностью доступны,
 * если купить только его. Блюдо засчитывается продукту, если он закрывает все недостающие строки.
 */
export function keyBuys(recipes: Recipe[], stock: Stock, limit = 5): KeyBuy[] {
  const unlocks = new Map<string, Recipe[]>();
  const primary = new Map<string, number>();
  for (const r of recipes) {
    const check = checkRecipe(r, stock);
    if (check.ready || check.banned || !check.missing.length) continue;
    // Продукты, которые закрывают каждую недостающую строку.
    let common: Set<string> | null = null;
    for (const m of check.missing) {
      const c = new Set(candidates(m.ing).filter((k) => !stock.pantry.has(k)));
      common = common ? new Set([...common].filter((k) => c.has(k))) : c;
    }
    for (const k of common ?? []) {
      unlocks.set(k, [...(unlocks.get(k) ?? []), r]);
      if (check.missing.some((m) => m.ing.p === k)) primary.set(k, (primary.get(k) ?? 0) + 1);
    }
  }
  return [...unlocks.entries()]
    .map(([key, list]) => ({ key, product: PRODUCT_BY_KEY.get(key), unlocks: list }))
    .sort(
      (a, b) =>
        b.unlocks.length - a.unlocks.length ||
        (primary.get(b.key) ?? 0) - (primary.get(a.key) ?? 0) ||
        a.key.localeCompare(b.key, 'ru'),
    )
    .slice(0, limit);
}

export interface Missed {
  recipe: Recipe;
  check: RecipeCheck;
  daysAgo: number | null;
}

/** Нравится хотя бы одному (или старая оценка ≥4), и не ели 10+ дней. */
export function longNotEaten(
  recipes: Recipe[],
  ratings: RatingRow[],
  history: History,
  stock: Stock,
  minDays = 10,
): Missed[] {
  const out: Missed[] = [];
  for (const r of recipes) {
    if (dislikedByAnyone(r.id, ratings)) continue;
    const rt = ratings.find((x) => x.recipeId === r.id);
    const liked = rt?.Крис === 'like' || rt?.Кристина === 'like' || (history.oldScore.get(r.id) ?? 0) >= 4;
    if (!liked) continue;
    const ago = history.lastEaten.get(r.id) ?? null;
    if (ago != null && ago < minDays) continue;
    out.push({ recipe: r, check: checkRecipe(r, stock), daysAgo: ago });
  }
  return out.sort((a, b) => (b.daysAgo ?? 999) - (a.daysAgo ?? 999));
}

export interface BasketStep {
  key: string;
  product: Product | undefined;
  /** Сколько блюд доступно после покупки всей корзины до этого шага включительно. */
  readyAfter: number;
}

/**
 * Корзина: по одному добавляем продукт, который откроет больше всего блюд вместе с уже выбранными.
 * Если ни один продукт сам по себе ничего не открывает — берём тот, что нужен в большем числе блюд.
 */
export function basket(recipes: Recipe[], stock: Stock, size = 5): { steps: BasketStep[]; before: number } {
  const countReady = (s: Stock) => recipes.filter((r) => checkRecipe(r, s).ready).length;
  const before = countReady(stock);
  let current = stock;
  const steps: BasketStep[] = [];
  for (let i = 0; i < size; i++) {
    // Кандидаты — продукты из недостающих строк блюд, которым не хватает ≤3 продуктов.
    const need = new Map<string, number>();
    for (const r of recipes) {
      const c = checkRecipe(r, current);
      if (c.ready || c.banned || c.missing.length > 3) continue;
      for (const m of c.missing) {
        const k = m.ing.p;
        if (!current.pantry.has(k) && !isBanned(k)) need.set(k, (need.get(k) ?? 0) + 1);
      }
    }
    if (!need.size) break;
    let best: { key: string; ready: number; need: number } | null = null;
    for (const [key, n] of need) {
      const ready = countReady(withProduct(current, key));
      if (!best || ready > best.ready || (ready === best.ready && n > best.need)) best = { key, ready, need: n };
    }
    if (!best) break;
    current = withProduct(current, best.key);
    steps.push({ key: best.key, product: PRODUCT_BY_KEY.get(best.key), readyAfter: best.ready });
  }
  return { steps, before };
}

/** Копия запасов, как будто продукт купили (в достаточном количестве). */
export function withProduct(stock: Stock, key: string): Stock {
  const items = new Map(stock.items);
  items.set(key, { key, rows: [], qty: 0, unknown: true, daysLeft: null });
  return { items, pantry: stock.pantry };
}
