// Всё, что экранам нужно посчитать из данных: рецепты, запасы, история.

import { useMemo } from 'react';
import { useStore } from '../api/store';
import { DEFAULT_HOLIDAYS } from '../data/holidays';
import { isLeftover, leftoverRecipeId } from '../data/leftovers';
import { DEFAULT_PANTRY } from '../data/products';
import { allRecipes } from '../data/recipes';
import { buildStock } from '../logic/availability';
import { DEFAULT_STORES } from '../logic/money';
import { buildHistory, type SuggestContext } from '../logic/suggest';
import type { Person } from '../types';

export function useKitchen() {
  const view = useStore((s) => s.view);
  const me = (useStore((s) => s.config.me) || 'Крис') as Person;
  return useMemo(() => {
    const today = new Date();
    const recipes = allRecipes(view.myRecipes);
    const pantry = view.settings.pantry.length ? view.settings.pantry : DEFAULT_PANTRY;
    const holidays = view.settings.holidays.length ? view.settings.holidays : DEFAULT_HOLIDAYS;
    const stock = buildStock(view.fridge, pantry, today);
    const history = buildHistory(view.eaten, recipes, today);
    const leftoverRows = view.fridge.filter(isLeftover);
    const leftovers = new Set(leftoverRows.map((r) => leftoverRecipeId(r, recipes)).filter((x): x is string => !!x));
    const stores = view.settings.stores?.length ? view.settings.stores : DEFAULT_STORES;
    const ctx: SuggestContext = { recipes, stock, history, ratings: view.ratings, today, me, leftovers };
    return { view, today, recipes, pantry, holidays, stock, history, me, ctx, leftoverRows, stores };
  }, [view, me]);
}

export type Kitchen = ReturnType<typeof useKitchen>;
