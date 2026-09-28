import { describe, expect, it } from 'vitest';
import { defaultPortions } from '../src/data/leftovers';
import { DEFAULT_PANTRY } from '../src/data/products';
import { BUILTIN_RECIPES } from '../src/data/recipes';
import { buildStock, checkRecipe } from '../src/logic/availability';
import { minutesOf, pantryItems, scaleStep, scaleText, servingsOf, servingsText, shortNote, stepsWithQty } from '../src/logic/portions';
import { isLate, mealForTime, slotForTime } from '../src/logic/suggest';
import { pantryLabel } from '../src/ui/labels';
import type { FridgeRow } from '../src/types';

const TODAY = new Date(2026, 8, 28);
const recipe = (id: string) => BUILTIN_RECIPES.find((r) => r.id === id)!;
const row = (name: string, qty: string): FridgeRow => ({ id: name, name, where: 'холодильник', qty, expires: '', note: '' });

describe('порции', () => {
  it('у каждого рецепта есть число порций', () => {
    for (const r of BUILTIN_RECIPES) expect(servingsOf(r)).toBeGreaterThan(0);
    expect(servingsOf(recipe('borsch'))).toBe(6);
  });

  it('подпись: на двоих и на несколько дней', () => {
    expect(servingsText(2)).toBe('🍽 2 порции');
    expect(servingsText(4)).toBe('🍲 4 порции · на 2 дня');
    expect(servingsText(1)).toBe('🍽 1 порция');
  });

  it('×½ и ×2 пересчитывают граммы и штуки со словами', () => {
    expect(scaleText('400 г', 0.5)).toBe('200 г');
    expect(scaleText('2 зубчика', 0.5)).toBe('1 зубчик');
    expect(scaleText('2-3 зубчика', 2)).toBe('4–6 зубчиков');
    expect(scaleText('1 банка (400 г)', 0.5)).toBe('½ банки (200 г)');
    expect(scaleText('1.5 кг', 0.5)).toBe('750 г');
    expect(scaleText('250 мл', 0.5)).toBe('125 мл');
    expect(scaleText('по вкусу', 2)).toBe('по вкусу');
  });

  it('в шагах не трогает сантиметры, минуты и дни', () => {
    const s = 'Нарежь кусками 3 см, залей 500 мл воды, вари 10 мин. Храни до 4 дней.';
    expect(scaleStep(s, 2)).toBe('Нарежь кусками 3 см, залей 1 л воды, вари 10 мин. Храни до 4 дней.');
  });

  it('остатки: всё, что сварили, минус две порции', () => {
    expect(defaultPortions(recipe('borsch'))).toBe(4);
    expect(defaultPortions(recipe('curry'))).toBe(0);
    expect(defaultPortions(recipe('curry'), 2)).toBe(2);
  });

  it('время рецепта в минутах', () => {
    expect(minutesOf('1 ч 30 мин, из них 30 активно')).toBe(90);
    expect(minutesOf('25 мин')).toBe(25);
    expect(minutesOf('быстро')).toBeNull();
  });
});

describe('мало продукта', () => {
  it('есть 250 из 600 г курицы — подсказывает уменьшить', () => {
    const stock = buildStock([row('курица', '250 г'), row('лук', '2 луковицы')], DEFAULT_PANTRY, TODAY);
    const note = shortNote(checkRecipe(recipe('curry'), stock).items, stock);
    expect(note?.key).toBe('курица');
    expect(note?.have).toBe(250);
    expect(note!.fit).toBeLessThan(1);
  });

  it('хватает — молчит', () => {
    const stock = buildStock([row('курица', '1 кг')], DEFAULT_PANTRY, TODAY);
    expect(shortNote(checkRecipe(recipe('curry'), stock).items, stock)).toBeNull();
  });
});

describe('кладовая и количества в шагах', () => {
  it('«Из кладовой»: соль и масло из шагов', () => {
    const stock = buildStock([], DEFAULT_PANTRY, TODAY);
    const keys = pantryItems(checkRecipe(recipe('oladi'), stock).items, recipe('oladi').steps).map((x) => x.key);
    expect(keys).toContain('соль');
    expect(keys).toContain('масло растительное');
  });

  it('количество при первом упоминании продукта, без повторов', () => {
    const r = recipe('curry');
    const text = stepsWithQty(r.steps, r.ingredients)
      .map((p) => p.map((x) => x.text + (x.q ? ` (${x.q})` : '')).join(''))
      .join(' ');
    expect(text).toMatch(/Курицу \(600/);
    expect(text).not.toMatch(/сметаны \(3/);
  });

  it('недостающее добавлено в рецепты', () => {
    expect(recipe('oladi').ingredients.some((i) => i.p === 'уксус')).toBe(true);
    expect(recipe('salat_nut_tunec').ingredients.some((i) => i.p === 'лимон')).toBe(true);
    expect(recipe('nuggets').ingredients.some((i) => i.p === 'горчица')).toBe(true);
  });
});

describe('время суток', () => {
  const at = (h: number) => new Date(2026, 8, 28, h);
  it('ночью и после 21 — ужин, завтрак только утром', () => {
    expect(slotForTime(at(2))).toBe('dinner');
    expect(slotForTime(at(7))).toBe('breakfast');
    expect(slotForTime(at(13))).toBe('lunch');
    expect(slotForTime(at(22))).toBe('dinner');
    expect(mealForTime(at(1))).toBe('ужин');
    expect(isLate(at(22))).toBe(true);
    expect(isLate(at(19))).toBe(false);
  });
});

it('кладовая по-русски и с большой буквы', () => {
  expect(pantryLabel('tomate triturado')).toBe('Томаты в банке');
  expect(pantryLabel('рис')).toBe('Рис');
});
