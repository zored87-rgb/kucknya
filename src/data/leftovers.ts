// Остатки готовых блюд: «🍲 Борщ — 3 порции» лежат в холодильнике как обычная строка.
// Помечены значком 🍲 в начале названия, чтобы не путать с продуктами («Курица в томате» — не курица).

import { addDays, formatDate } from '../logic/dates';
import type { FridgeRow, Recipe } from '../types';
import { parseQty } from './quantity';
import { recipeIdForDish } from './recipes';

export const LEFTOVER_MARK = '🍲';

export function isLeftover(row: Pick<FridgeRow, 'name'>): boolean {
  return row.name.trim().startsWith(LEFTOVER_MARK);
}

export function leftoverName(recipe: Recipe): string {
  return `${LEFTOVER_MARK} ${recipe.name}`;
}

export function dishOf(row: Pick<FridgeRow, 'name'>): string {
  return row.name.replace(LEFTOVER_MARK, '').trim();
}

export function leftoverRecipeId(row: FridgeRow, recipes: Recipe[]): string | null {
  return recipeIdForDish(dishOf(row), recipes);
}

export function portions(row: FridgeRow): number {
  return parseQty(row.qty).n ?? 1;
}

export function portionsText(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const w = a > 10 && a < 20 ? 'порций' : b === 1 ? 'порция' : b > 1 && b < 5 ? 'порции' : 'порций';
  return `${n} ${w}`;
}

/** Сколько порций обычно остаётся: обеды варим на 2-3 дня. */
export function defaultPortions(recipe: Recipe): number {
  if (recipe.type === 'batch_lunch') return 4;
  if (recipe.type === 'weekend') return 2;
  return 0;
}

/** Супы и рагу хранятся 3 дня, остальное — 2. */
export function leftoverExpiry(recipe: Recipe, today: Date = new Date()): string {
  return formatDate(addDays(today, recipe.type === 'batch_lunch' ? 3 : 2));
}
