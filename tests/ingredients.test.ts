import { describe, expect, it } from 'vitest';
import { matchProduct, normalize, productKeyOf, resolvePantry, stem, suggestProducts } from '../src/data/ingredients';
import { DEFAULT_PANTRY, PRODUCTS } from '../src/data/products';
import { formatQty, parseQty } from '../src/data/quantity';
import { parseIngredientLine, recipeIdForDish, BUILTIN_RECIPES } from '../src/data/recipes';
import { PRODUCT_BY_KEY } from '../src/data/products';

const key = (s: string) => productKeyOf(s);

describe('normalize / stem', () => {
  it('нижний регистр, ё→е, латинская диакритика', () => {
    expect(normalize('Свёкла')).toBe('свекла');
    expect(normalize('Champiñones')).toBe('champinones');
    expect(normalize('Лавровый лист')).toBe('лавровый лист');
  });
  it('отрезает окончания, но не корень', () => {
    expect(stem('томаты')).toBe(stem('томат'));
    expect(stem('бедра')).toBe(stem('бедро'));
    expect(stem('сырники')).not.toBe(stem('сыр'));
    expect(stem('лук')).toBe('лук');
  });
});

describe('синонимы → канонический ключ', () => {
  it.each([
    ['Куриные бёдра', 'куриные бёдра'],
    ['Contramuslos de pollo', 'куриные бёдра'],
    ['Pollo troceado, курица кусками', 'курица'],
    ['Куриное филе', 'куриное филе'],
    ['Pechuga de pollo', 'куриное филе'],
    ['Моцарелла тёртая', 'моцарелла'],
    ['Гауда', 'гауда'],
    ['Сыр ломтиками (гауда или эдам, не чеддер)', 'сыр'],
    ['Фарш (carne picada mixta)', 'фарш'],
    ['Картошка', 'картошка'],
    ['Картофель', 'картошка'],
    ['Хек, филе (свежее или замороженное)', 'хек'],
    ['Лосось', 'лосось'],
    ['Бекон или панчетта кубиками (taquitos)', 'бекон'],
    ['Сметана', 'сметана'],
  ])('%s → %s', (text, expected) => {
    expect(key(text)).toBe(expected);
  });

  it('самый конкретный синоним побеждает', () => {
    expect(key('Лук зелёный')).toBe('лук зелёный');
    expect(key('Лук')).toBe('лук');
    expect(key('Красный лук')).toBe('лук красный');
    expect(key('Масло сливочное')).toBe('масло сливочное');
    expect(key('Оливковое масло')).toBe('масло оливковое');
    expect(key('Перец красный')).toBe('перец болгарский');
    expect(key('Ванильный сахар')).toBe('ванильный сахар');
  });

  it('«Сырники» — не сыр, «не чеддер» — не чеддер', () => {
    expect(key('Сырники, заготовка')).toBe('сырники');
    expect(key('Сыр (не чеддер)')).toBe('сыр');
    expect(key('Чеддер')).toBe('чеддер');
    expect(PRODUCT_BY_KEY.get('чеддер')?.banned).toBe(true);
    expect(key('Греческий йогурт')).toBe('йогурт кислый');
  });

  it('строки из текущего холодильника', () => {
    expect(key('Томаты натураль (банка)')).toBe('томаты в банке');
    expect(key('Томато фрито')).toBe('томато фрито');
    expect(key('Филадельфия')).toBe('сливочный сыр');
    expect(key('Табуле с кускусом')).toBe('табуле');
    expect(key('Соус карри')).toBe('соус карри');
    expect(key('Кофе молотый')).toBe('кофе');
    expect(key('Нори')).toBe('нори');
  });

  it('незнакомое — null', () => {
    expect(matchProduct('абракадабра')).toBeNull();
  });

  it('у всех продуктов уникальный ключ', () => {
    expect(new Set(PRODUCTS.map((p) => p.key)).size).toBe(PRODUCTS.length);
  });
});

describe('подсказки при вводе', () => {
  it('«лук» → все виды лука', () => {
    const keys = suggestProducts('лук').map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['лук', 'лук красный', 'лук зелёный', 'лук-порей']));
    expect(keys[0]).toBe('лук');
  });
  it('по испанскому названию', () => {
    expect(suggestProducts('pollo').map((p) => p.key)).toContain('курица');
  });
  it('без ё', () => {
    expect(suggestProducts('свекла').map((p) => p.key)).toContain('свёкла');
  });
});

describe('кладовая', () => {
  it('семейства разворачиваются', () => {
    const s = resolvePantry(DEFAULT_PANTRY);
    for (const k of ['спагетти', 'макароны', 'вермишель', 'масло растительное', 'масло оливковое', 'паприка', 'кумин', 'рис', 'томаты в банке', 'перец чёрный', 'соевый соус', 'мёд'])
      expect(s.has(k), k).toBe(true);
    expect(s.has('перец болгарский')).toBe(false);
    expect(s.has('масло сливочное')).toBe(false);
    expect(s.has('лапша для вока')).toBe(false);
  });
});

describe('количество', () => {
  const p = (k: string) => PRODUCT_BY_KEY.get(k)!;
  it('разбирает понятный формат', () => {
    expect(parseQty('6 луковиц', p('лук')).n).toBe(6);
    expect(parseQty('½ банки', p('сметана')).n).toBe(0.5);
    expect(parseQty('1/2', p('авокадо')).n).toBe(0.5);
    expect(parseQty('500 г', p('фарш')).n).toBe(500);
    expect(parseQty('1 кг', p('фарш')).n).toBe(1000);
    expect(parseQty('3 корня', p('имбирь')).n).toBe(3);
    expect(parseQty('2 головки', p('чеснок')).n).toBe(2);
  });
  it('старые свободные записи: либо число, либо «есть, сколько — неизвестно»', () => {
    expect(parseQty('почти полная, 200 г', p('сметана')).n).toBe(0.9);
    expect(parseQty('~145 г', p('томаты в банке')).n).toBeNull();
    expect(parseQty('~150 г', p('лосось')).n).toBe(150);
    expect(parseQty('1 порция, ~80 г', p('рис')).n).toBe(80);
    expect(parseQty('проверить', p('сырники')).n).toBeNull();
    expect(parseQty('есть', p('кофе')).n).toBeNull();
    expect(parseQty('0', p('лук')).n).toBe(0);
  });
  it('пишет по-человечески', () => {
    expect(formatQty(6, p('лук'))).toBe('6 луковиц');
    expect(formatQty(1, p('лук'))).toBe('1 луковица');
    expect(formatQty(3, p('картошка'))).toBe('3 картофелины');
    expect(formatQty(0.5, p('сметана'))).toBe('½ банки');
    expect(formatQty(1.5, p('сметана'))).toBe('1½ банки');
    expect(formatQty(450, p('фарш'))).toBe('450 г');
    expect(formatQty(2, p('укроп'))).toBe('2 пучка');
  });
});

describe('свои рецепты', () => {
  it('строка продукта с заменой и «по желанию»', () => {
    expect(parseIngredientLine('Фарш: 500 г')).toEqual({ p: 'фарш', q: '500 г', n: 500 });
    expect(parseIngredientLine('Курица / индейка: 400 г')).toMatchObject({ p: 'курица', alt: ['индейка'], n: 400 });
    expect(parseIngredientLine('Сметана: 3 ст.л. (по желанию)')).toMatchObject({ p: 'сметана', opt: true });
    expect(parseIngredientLine('Сметана: 3 ст.л.')?.n).toBeUndefined();
    expect(parseIngredientLine('Лук: 2')).toMatchObject({ p: 'лук', n: 2 });
  });
  it('запись «Съели» находит рецепт по названию', () => {
    expect(recipeIdForDish('Борщ', BUILTIN_RECIPES)).toBe('borsch');
    expect(recipeIdForDish('паста карбонара', BUILTIN_RECIPES)).toBe('carbonara');
    expect(recipeIdForDish('Что-то своё', BUILTIN_RECIPES)).toBeNull();
  });
});
