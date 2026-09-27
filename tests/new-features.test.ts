import { describe, expect, it } from 'vitest';
import { autoExpiry, parseBulk, splitItems } from '../src/data/bulk';
import { isLeftover, leftoverRecipeId, portions, portionsText } from '../src/data/leftovers';
import { DEFAULT_PANTRY, PRODUCT_BY_KEY } from '../src/data/products';
import { BUILTIN_RECIPES } from '../src/data/recipes';
import { buildStock } from '../src/logic/availability';
import { buildHistory, suggest } from '../src/logic/suggest';
import { cheapestAdvice, pricesFor, spending, unitPrice } from '../src/logic/money';
import type { FridgeRow, PriceRow, ReceiptRow } from '../src/types';

const TODAY = new Date(2026, 8, 30, 13);

describe('диктовка и список после магазина', () => {
  it('режет по запятым и «и», но не ломает 1,5 кг', () => {
    expect(splitItems('6 луковиц, фарш 500 и молоко')).toEqual(['6 луковиц', 'фарш 500', 'молоко']);
    expect(splitItems('картошка 1,5 кг\nсметана')).toEqual(['картошка 1,5 кг', 'сметана']);
  });

  it('понимает количество и до, и после названия', () => {
    const [a, b, c, d, e, f] = parseBulk('6 луковиц, фарш 500, 500 г фарша, 1,5 кг картошки, молоко 2, яйца 10', TODAY);
    expect([a.name, a.qty]).toEqual(['Лук репчатый', '6 луковиц']);
    expect([b.name, b.qty]).toEqual(['Фарш свино-говяжий', '500 г']);
    expect([c.name, c.qty]).toEqual(['Фарш свино-говяжий', '500 г']);
    expect(d.name).toBe('Картошка');
    expect(e.qty).toBe('2 пакета');
    expect(f.qty).toBe('10 яиц');
  });

  it('незнакомое — как есть, с большой буквы', () => {
    const [x] = parseBulk('кимчи 1', TODAY);
    expect(x.product).toBeUndefined();
    expect(x.name).toBe('Кимчи');
  });

  it('срок годности подставляется сам', () => {
    const [chicken, rice] = parseBulk('куриное филе 500, рис', TODAY);
    expect(chicken.expires).toBe('02.10.2026');
    expect(rice.expires).toBe('');
    expect(autoExpiry(PRODUCT_BY_KEY.get('фарш'), TODAY)).toBe('01.10.2026');
  });
});

describe('остатки', () => {
  const row: FridgeRow = { id: 'l1', name: '🍲 Борщ', where: 'холодильник', qty: '3 порции', expires: '02.10.2026', note: 'готовое блюдо' };

  it('узнаются, считаются порциями и не путаются с продуктами', () => {
    expect(isLeftover(row)).toBe(true);
    expect(portions(row)).toBe(3);
    expect(portionsText(1)).toBe('1 порция');
    expect(portionsText(4)).toBe('4 порции');
    expect(portionsText(5)).toBe('5 порций');
    expect(leftoverRecipeId(row, BUILTIN_RECIPES)).toBe('borsch');
    const chickenLeftover = { ...row, name: '🍲 Курица в томатном соусе с рисом' };
    expect(buildStock([chickenLeftover], DEFAULT_PANTRY, TODAY).items.has('курица')).toBe(false);
  });

  it('блюдо, которое стоит готовым, заново не предлагается', () => {
    const fridge: FridgeRow[] = [
      { id: 'a', name: 'Говядина', where: '', qty: '500 г', expires: '', note: '' },
      { id: 'b', name: 'Свёкла', where: '', qty: '3', expires: '', note: '' },
      { id: 'c', name: 'Капуста', where: '', qty: '1', expires: '', note: '' },
      { id: 'd', name: 'Картошка', where: '', qty: '5', expires: '', note: '' },
      { id: 'e', name: 'Лук', where: '', qty: '3', expires: '', note: '' },
      { id: 'f', name: 'Морковь', where: '', qty: '3', expires: '', note: '' },
    ];
    const base = { recipes: BUILTIN_RECIPES, stock: buildStock(fridge, DEFAULT_PANTRY, TODAY), history: buildHistory([], BUILTIN_RECIPES, TODAY), ratings: [], today: TODAY, me: 'Крис' as const };
    expect(suggest('lunch', base).ready.some((s) => s.recipe.id === 'borsch')).toBe(true);
    expect(suggest('lunch', { ...base, leftovers: new Set(['borsch']) }).ready.some((s) => s.recipe.id === 'borsch')).toBe(false);
  });
});

describe('деньги', () => {
  const P = (product: string, store: string, price: string, per: string, date = '20.09.2026'): PriceRow => ({ id: store + product + date, product, store, price, per, date });

  it('цена за килограмм', () => {
    expect(unitPrice(3.99, '500 г', 'фарш').unit).toBeCloseTo(7.98);
    expect(unitPrice(1.2, '1 пакет', 'молоко').label).toBe('€/пакет');
  });

  it('где дешевле — по цене за единицу и последней цене в каждом магазине', () => {
    const prices = [
      P('Фарш', 'Mercadona', '4.50', '500 г', '01.09.2026'),
      P('Фарш', 'Mercadona', '4.20', '500 г', '20.09.2026'),
      P('Фарш свино-говяжий', 'Carrefour', '7.00', '1 кг'),
      P('Молоко', 'Kuups', '1.10', '1 пакет'),
    ];
    const a = cheapestAdvice('фарш', prices, false)!;
    expect(a.cheapest.store).toBe('Carrefour');
    expect(a.others[0].price).toBe(4.2);
    expect(a.savePct).toBe(17);
    expect(cheapestAdvice('молоко', prices, false)).toBeNull(); // один магазин — сравнивать не с чем
    expect(pricesFor('молоко', prices, false)[0].store).toBe('Kuups');
    // Со справочными ценами (Mercadona и Carrefour по 0,96 € за пакет) Kuups оказывается дороже.
    const withRef = cheapestAdvice('молоко', prices)!;
    expect(withRef.cheapest).toMatchObject({ ref: true, price: 0.96 });
    expect(withRef.others.map((o) => o.store)).toContain('Kuups');
    // Фарш: Carrefour 7,98 €/кг против Mercadona 8,20 €/кг — по справочным ценам без ваших.
    const farsh = cheapestAdvice('фарш', [])!;
    expect(farsh.cheapest.store).toBe('Carrefour');
  });

  it('расходы по чекам', () => {
    const R = (date: string, store: string, total: string): ReceiptRow => ({ id: date + store, date, store, total, note: '' });
    const s = spending([R('29.09.2026', 'Mercadona', '40,50'), R('25.09.2026', 'Carrefour', '20'), R('10.09.2026', 'Mercadona', '30'), R('15.08.2026', 'Kuups', '12')], TODAY);
    expect(s.week).toBeCloseTo(60.5);
    expect(s.month).toBeCloseTo(90.5);
    expect(s.prevMonth).toBeCloseTo(12);
    expect(s.byStore[0]).toMatchObject({ store: 'Mercadona', count: 2 });
  });

  it('справочные цены Mercadona есть для основных продуктов и считают список', async () => {
    const { REF_PRICES } = await import('../src/data/refPrices');
    const { estimateList } = await import('../src/logic/money');
    for (const k of ['картошка', 'лук', 'фарш', 'куриное филе', 'молоко', 'яйца', 'рис', 'спагетти', 'сметана'].filter((k) => k !== 'сметана'))
      expect(REF_PRICES[k], k).toBeDefined();
    const { REF_PRICES_CARREFOUR } = await import('../src/data/refPrices');
    for (const k of [...Object.keys(REF_PRICES), ...Object.keys(REF_PRICES_CARREFOUR)]) expect(PRODUCT_BY_KEY.has(k), k).toBe(true);
    const e = estimateList(['Лук', 'Фарш', 'Кимчи']);
    expect(e.common).toBe(2);
    expect(e.unknown).toBe(1);
    expect(e.find((x) => x.store === 'Mercadona')!.total).toBeCloseTo(1.7 + 4.1);
    expect(e.find((x) => x.store === 'Carrefour')!.total).toBeCloseTo(1.59 + 3.99);
    // Цена за кг у справочной: фарш 4,10 € за 500 г → 8,20 €/кг
    expect(pricesFor('фарш', []).find((p) => p.store === 'Mercadona')!.unit).toBeCloseTo(8.2);
  });
});
