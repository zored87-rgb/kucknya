import { describe, expect, it } from 'vitest';
import { DEFAULT_PANTRY, PRODUCT_BY_KEY } from '../src/data/products';
import { BUILTIN_RECIPES } from '../src/data/recipes';
import { buildStock, checkRecipe, usageFor } from '../src/logic/availability';
import { addDays, formatDate } from '../src/logic/dates';
import { keyBuys, longNotEaten, mealRecipes } from '../src/logic/keyBuys';
import { mercadonaWarning } from '../src/logic/mercadona';
import { buildHistory, suggest, traits, type SuggestContext } from '../src/logic/suggest';
import type { EatenRow, FridgeRow, RatingRow, Recipe } from '../src/types';

const TODAY = new Date(2026, 8, 30, 13, 0); // среда, 30.09.2026, обед
let seq = 0;
const row = (name: string, qty = '', expiresInDays?: number): FridgeRow => ({
  id: `f${++seq}`,
  name,
  where: 'холодильник',
  qty,
  expires: expiresInDays == null ? '' : formatDate(addDays(TODAY, expiresInDays)),
  note: '',
});
const ate = (recipeId: string, daysAgo: number, meal = 'обед', score = ''): EatenRow => ({
  id: `e${++seq}`,
  date: formatDate(addDays(TODAY, -daysAgo)),
  meal,
  dish: BUILTIN_RECIPES.find((r) => r.id === recipeId)?.name ?? recipeId,
  who: 'оба',
  score,
  recipeId,
});
const R = (id: string) => BUILTIN_RECIPES.find((r) => r.id === id)!;

function ctx(fridge: FridgeRow[], eaten: EatenRow[] = [], ratings: RatingRow[] = [], recipes: Recipe[] = BUILTIN_RECIPES): SuggestContext {
  return {
    recipes,
    stock: buildStock(fridge, DEFAULT_PANTRY, TODAY),
    history: buildHistory(eaten, recipes, TODAY),
    ratings,
    today: TODAY,
    me: 'Крис',
  };
}

// Холодильник для борща и котлет.
const BASE = () => [
  row('Говядина', '500 г'),
  row('Свёкла', '3'),
  row('Капуста', '1 кочан'),
  row('Картошка', '10'),
  row('Морковь', '4'),
  row('Лук', '6'),
  row('Фарш', '500 г'),
  row('Сметана', '1 банка'),
  row('Молоко', '1 пакет'),
];

describe('проверка рецепта', () => {
  it('всё есть — блюдо готово, по желанию не мешает', () => {
    const c = checkRecipe(R('borsch'), buildStock(BASE(), DEFAULT_PANTRY, TODAY));
    expect(c.ready).toBe(true);
    expect(c.missing).toHaveLength(0);
  });

  it('замены: свинина вместо говядины, варёная свёкла вместо сырой', () => {
    const f = BASE().filter((r) => r.name !== 'Говядина' && r.name !== 'Свёкла');
    f.push(row('Свинина', '600 г'), row('Remolacha cocida', '1'));
    const c = checkRecipe(R('borsch'), buildStock(f, DEFAULT_PANTRY, TODAY));
    expect(c.ready).toBe(true);
    const meat = c.items.find((i) => i.ing.p === 'говядина')!;
    expect(meat.use).toBe('свинина');
    expect(meat.substituted).toBe(true);
  });

  it('сырники: сметана по желанию, без неё блюдо доступно', () => {
    const c = checkRecipe(R('syrniki'), buildStock([row('Сырники, заготовка', '10')], DEFAULT_PANTRY, TODAY));
    expect(c.ready).toBe(true);
    // Сметаны нет — подставился мёд из кладовой.
    expect(c.items.find((i) => i.ing.p === 'сметана')).toMatchObject({ use: 'мёд', substituted: true });
  });

  it('мало картошки — не хватает; 70% от нужного — хватает', () => {
    const few = BASE().map((r) => (r.name === 'Картошка' ? { ...r, qty: '1' } : r));
    expect(checkRecipe(R('borsch'), buildStock(few, DEFAULT_PANTRY, TODAY)).missing.map((m) => m.ing.p)).toEqual(['картошка']);
    const meatAlmost = BASE().map((r) => (r.name === 'Говядина' ? { ...r, qty: '400 г' } : r));
    expect(checkRecipe(R('borsch'), buildStock(meatAlmost, DEFAULT_PANTRY, TODAY)).ready).toBe(true);
  });

  it('«сыр» закрывается гаудой и моцареллой, но не чеддером', () => {
    const recipe = R('mac_cheese');
    const withGouda = buildStock([row('Гауда', '200 г'), row('Молоко', '1'), row('Масло сливочное', '100 г')], DEFAULT_PANTRY, TODAY);
    expect(checkRecipe(recipe, withGouda).ready).toBe(true);
    const withCheddar = buildStock([row('Чеддер', '200 г'), row('Молоко', '1'), row('Масло сливочное', '100 г')], DEFAULT_PANTRY, TODAY);
    expect(checkRecipe(recipe, withCheddar).ready).toBe(false);
  });

  it('кладовая всегда есть: паста, рис, томаты в банке', () => {
    const c = checkRecipe(R('pasta_tomat'), buildStock([], DEFAULT_PANTRY, TODAY));
    expect(c.ready).toBe(true);
  });

  it('вычитание: берём столько, сколько в рецепте', () => {
    const stock = buildStock(BASE(), DEFAULT_PANTRY, TODAY);
    const use = usageFor(checkRecipe(R('borsch'), stock), stock);
    expect(use.find((u) => u.key === 'картошка')?.n).toBe(3);
    expect(use.find((u) => u.key === 'лук')?.n).toBe(1);
  });
});

describe('подбор', () => {
  it('в обед и ужин нет блюд с яйцом как основой, и нет завтраков', () => {
    const c = ctx([row('Яйца', '10'), row('Хлеб', '1'), row('Помидоры', '4')]);
    for (const slot of ['lunch', 'dinner'] as const) {
      const all = [...suggest(slot, c).ready, ...suggest(slot, c).almost];
      expect(all.some((s) => s.recipe.has_egg_as_main)).toBe(false);
      expect(all.some((s) => s.recipe.type === 'breakfast')).toBe(false);
    }
    expect(suggest('breakfast', c).ready.map((s) => s.recipe.id)).toContain('huevos_fritos');
  });

  it('скоро испортится → выше', () => {
    const fresh = ctx([...BASE(), row('Лосось', '300 г', 10), row('Лимон', '1')]);
    const expiring = ctx([...BASE(), row('Лосось', '300 г', 1), row('Лимон', '1')]);
    const sc = (c: SuggestContext) => suggest('dinner', c).ready.find((s) => s.recipe.id === 'salmon_potato')!.score;
    expect(sc(expiring)).toBeGreaterThan(sc(fresh));
    const s = suggest('dinner', expiring).ready.find((x) => x.recipe.id === 'salmon_potato')!;
    expect(s.reasons.join()).toMatch(/спасает: лосось/);
  });

  it('ели 2 дня назад → ниже; давно не ели → выше', () => {
    const base = BASE();
    const recent = ctx(base, [ate('borsch', 2)]);
    const old = ctx(base, [ate('borsch', 30)]);
    const score = (c: SuggestContext) => suggest('lunch', c).ready.find((s) => s.recipe.id === 'borsch')!.score;
    expect(score(recent)).toBeLessThan(score(old));
  });

  it('лайк поднимает, дизлайк любого убирает из обеда', () => {
    const base = BASE();
    const liked = ctx(base, [], [{ recipeId: 'kotlety_pure', dish: '', Крис: 'like', Кристина: 'like' }]);
    const plain = ctx(base);
    const sc = (c: SuggestContext) => suggest('dinner', c).ready.find((s) => s.recipe.id === 'kotlety_pure')!.score;
    expect(sc(liked)).toBeGreaterThan(sc(plain));
    const disliked = ctx(base, [], [{ recipeId: 'kotlety_pure', dish: '', Крис: '', Кристина: 'dislike' }]);
    expect(suggest('dinner', disliked).ready.some((s) => s.recipe.id === 'kotlety_pure')).toBe(false);
  });

  it('дизлайк на завтрак действует только на того, кто поставил', () => {
    const f = [row('Овсяные хлопья', '500 г'), row('Молоко', '1')];
    const r: RatingRow[] = [{ recipeId: 'avena', dish: '', Крис: '', Кристина: 'dislike' }];
    expect(suggest('breakfast', { ...ctx(f, [], r), me: 'Крис' }).ready.some((s) => s.recipe.id === 'avena')).toBe(true);
    expect(suggest('breakfast', { ...ctx(f, [], r), me: 'Кристина' }).ready.some((s) => s.recipe.id === 'avena')).toBe(false);
  });

  it('рыба чаще раза в неделю — минус', () => {
    const f = [...BASE(), row('Лосось', '300 г'), row('Лимон', '1')];
    const noFish = ctx(f);
    const hadFish = ctx(f, [ate('hek_syr', 3, 'ужин')]);
    const sc = (c: SuggestContext) => suggest('dinner', c).ready.find((s) => s.recipe.id === 'salmon_potato')!.score;
    expect(sc(hadFish)).toBeLessThan(sc(noFish));
  });

  it('«не хватает одного продукта»', () => {
    const f = BASE().filter((r) => r.name !== 'Фарш');
    const s = suggest('dinner', ctx(f));
    const kot = s.almost.find((x) => x.recipe.id === 'kotlety_pure');
    expect(kot?.check.missing.map((m) => m.ing.p)).toEqual(['фарш']);
  });

  it('старые оценки 1-5 учитываются', () => {
    const base = BASE();
    const good = ctx(base, [ate('borsch', 20, 'обед', '5')]);
    const bad = ctx(base, [ate('borsch', 20, 'обед', '1')]);
    const sc = (c: SuggestContext) => suggest('lunch', c).ready.find((s) => s.recipe.id === 'borsch')!.score;
    expect(sc(good)).toBeGreaterThan(sc(bad));
  });
});

describe('свойства блюд', () => {
  it('рыба, красное мясо, овощи', () => {
    expect(traits(R('salmon_potato')).fish).toBe(true);
    expect(traits(R('borsch')).redMeat).toBe(true);
    expect(traits(R('borsch')).veggy).toBe(true);
    expect(traits(R('carbonara')).veggy).toBe(false);
    expect(traits(R('plov')).main).toBe('курица');
  });
  it('все рецепты ссылаются на продукты из каталога', () => {
    for (const r of BUILTIN_RECIPES)
      for (const i of r.ingredients)
        for (const k of [i.p, ...(i.alt ?? [])]) expect(PRODUCT_BY_KEY.has(k), `${r.id}: ${k}`).toBe(true);
  });
  it('около сотни рецептов, у каждого есть продукты и шаги', () => {
    expect(BUILTIN_RECIPES.length).toBeGreaterThanOrEqual(100);
    for (const r of BUILTIN_RECIPES) {
      expect(r.ingredients.length, r.id).toBeGreaterThan(0);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
    }
  });
  it('в рецептах нет запрещённых продуктов', () => {
    for (const r of BUILTIN_RECIPES)
      for (const i of r.ingredients) expect(PRODUCT_BY_KEY.get(i.p)?.banned, `${r.id}: ${i.p}`).toBeFalsy();
  });
});

describe('ключевые покупки', () => {
  it('фарш открывает все блюда, где не хватает только фарша', () => {
    const f = [
      row('Картошка', '10'),
      row('Лук', '6'),
      row('Морковь', '4'),
      row('Сметана', '1'),
      row('Молоко', '1'),
      row('Капуста', '1'),
    ];
    const stock = buildStock(f, DEFAULT_PANTRY, TODAY);
    const top = keyBuys(mealRecipes(BUILTIN_RECIPES, []), stock);
    const farsh = top.find((k) => k.key === 'фарш');
    expect(farsh).toBeDefined();
    const ids = farsh!.unlocks.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['kotlety_pure', 'sup_frikadelki', 'makarony_flotski', 'bolognese']));
    // Каждое открытое блюдо действительно становится доступным после покупки.
    const after = buildStock([...f, row('Фарш', '1 кг')], DEFAULT_PANTRY, TODAY);
    for (const r of farsh!.unlocks) expect(checkRecipe(r, after).ready, r.id).toBe(true);
    // Топ отсортирован по убыванию.
    for (let i = 1; i < top.length; i++) expect(top[i - 1].unlocks.length).toBeGreaterThanOrEqual(top[i].unlocks.length);
    expect(top.length).toBeLessThanOrEqual(5);
  });

  it('не предлагает купить то, что в кладовой, и запрещённое', () => {
    const top = keyBuys(mealRecipes(BUILTIN_RECIPES, []), buildStock([], DEFAULT_PANTRY, TODAY), 50);
    expect(top.some((k) => k.key === 'рис' || k.key === 'спагетти')).toBe(false);
    expect(top.some((k) => PRODUCT_BY_KEY.get(k.key)?.banned)).toBe(false);
  });

  it('давно не ели: только то, что нравится, и не ели 10+ дней', () => {
    const ratings: RatingRow[] = [
      { recipeId: 'borsch', dish: '', Крис: 'like', Кристина: '' },
      { recipeId: 'plov', dish: '', Крис: 'like', Кристина: '' },
    ];
    const eaten = [ate('borsch', 15), ate('plov', 3)];
    const recipes = BUILTIN_RECIPES;
    const list = longNotEaten(recipes, ratings, buildHistory(eaten, recipes, TODAY), buildStock([], DEFAULT_PANTRY, TODAY));
    expect(list.map((m) => m.recipe.id)).toEqual(['borsch']);
    expect(list[0].check.missing.length).toBeGreaterThan(0);
  });
});

describe('Mercadona', () => {
  const H = [{ date: '12.10.2026', name: 'День Испании' }];
  it('суббота перед воскресеньем', () => {
    expect(mercadonaWarning(new Date(2026, 9, 3, 12), H)).toMatch(/Завтра Mercadona закрыт \(воскресенье\)/);
  });
  it('воскресенье перед праздником', () => {
    expect(mercadonaWarning(new Date(2026, 9, 11, 12), H)).toMatch(/закрыт сегодня и завтра/);
  });
  it('обычный день — без предупреждения', () => {
    expect(mercadonaWarning(new Date(2026, 9, 7, 12), H)).toBeNull();
  });
});

describe('корзина', () => {
  it('почти пустой холодильник: 5 продуктов открывают больше блюд, чем было', async () => {
    const { basket } = await import('../src/logic/keyBuys');
    const stock = buildStock([row('Сметана', '1'), row('Лимон', '1')], DEFAULT_PANTRY, TODAY);
    const recipes = mealRecipes(BUILTIN_RECIPES, []);
    const b = basket(recipes, stock);
    expect(b.steps).toHaveLength(5);
    expect(b.steps[4].readyAfter).toBeGreaterThan(b.before + 3);
    // Количество доступных блюд не убывает по шагам.
    for (let i = 1; i < 5; i++) expect(b.steps[i].readyAfter).toBeGreaterThanOrEqual(b.steps[i - 1].readyAfter);
  });
});
