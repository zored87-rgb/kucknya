// Экономика: где дешевле (по ценам, которые вы записывали) и сколько потрачено (по чекам).

import { productKeyOf } from '../data/ingredients';
import { PRODUCT_BY_KEY } from '../data/products';
import { parseQty } from '../data/quantity';
import { rawKey } from '../data/recipes';
import { REF_BY_STORE } from '../data/refPrices';
import type { PriceRow, ReceiptRow } from '../types';
import { daysBetween, parseDate } from './dates';

export const DEFAULT_STORES = ['Mercadona', 'Carrefour', 'Kuups'];

/**
 * Индекс цен OCU 2026 по сетям (меньше — дешевле; 100 — самая дешёвая сеть в исследовании).
 * https://www.ocu.org/consumo-familia/supermercados/informe/cadenas-mas-baratas
 * Kuups (Transgourmet, бывшие Vidal) в исследовании нет.
 */
export const OCU_2026: Record<string, number> = {
  Mercadona: 105,
  Carrefour: 109,
  'Carrefour Market': 108,
  'Carrefour Express': 121,
  Lidl: 105,
  Alcampo: 103,
  Consum: 107,
  Dia: 112,
};

export function money(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

export function parseMoney(s: string): number | null {
  const n = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function keyOf(name: string): string {
  return productKeyOf(name) ?? rawKey(name);
}

export interface StorePrice {
  store: string;
  price: number;
  /** Цена за единицу для сравнения: €/кг для весовых, €/шт для штучных. null — «за» не указано. */
  unit: number | null;
  unitLabel: string;
  per: string;
  date: string;
  /** Справочная цена с сайта магазина, а не ваша. */
  ref?: boolean;
  /** Какой товар имеется в виду (для справочных). */
  item?: string;
}

/** Цена за единицу: 3,99 € за 500 г → 7,98 €/кг. */
export function unitPrice(price: number, per: string, productKey: string): { unit: number | null; label: string } {
  const p = PRODUCT_BY_KEY.get(productKey);
  const n = parseQty(per || '1', p).n;
  if (!n || n <= 0) return { unit: null, label: '' };
  if (p?.unit === 'г') return { unit: (price / n) * 1000, label: '€/кг' };
  if (p?.unit === 'мл') return { unit: (price / n) * 1000, label: '€/л' };
  return { unit: price / n, label: `€/${p?.forms?.[0] ?? 'шт'}` };
}

/** Последняя известная цена продукта в каждом магазине. Ваши цены важнее справочных. */
export function pricesFor(name: string, prices: PriceRow[], withRef = true): StorePrice[] {
  const key = keyOf(name);
  const latest = new Map<string, PriceRow>();
  for (const row of prices) {
    if (keyOf(row.product) !== key) continue;
    const prev = latest.get(row.store);
    const t = parseDate(row.date)?.getTime() ?? 0;
    if (!prev || t >= (parseDate(prev.date)?.getTime() ?? 0)) latest.set(row.store, row);
  }
  const out: StorePrice[] = [];
  for (const row of latest.values()) {
    const price = parseMoney(row.price);
    if (price == null) continue;
    const u = unitPrice(price, row.per, key);
    out.push({ store: row.store, price, unit: u.unit, unitLabel: u.label, per: row.per, date: row.date });
  }
  if (withRef) {
    for (const { store, date, prices: refs } of REF_BY_STORE) {
      const ref = refs[key];
      if (!ref || latest.has(store)) continue;
      const u = unitPrice(ref.price, ref.per, key);
      out.push({ store, price: ref.price, unit: u.unit, unitLabel: u.label, per: ref.per, date, ref: true, item: ref.item });
    }
  }
  // Сравниваем по цене за единицу, если она есть у всех; иначе по цене.
  const byUnit = out.every((x) => x.unit != null);
  return out.sort((a, b) => (byUnit ? (a.unit as number) - (b.unit as number) : a.price - b.price));
}

export interface Advice {
  cheapest: StorePrice;
  others: StorePrice[];
  /** На сколько процентов дешевле следующего магазина. */
  savePct: number;
}

/** «Дешевле в Carrefour» — только если есть цены хотя бы из двух магазинов. */
export function cheapestAdvice(name: string, prices: PriceRow[], withRef = true): Advice | null {
  const list = pricesFor(name, prices, withRef);
  if (list.length < 2) return null;
  const val = (p: StorePrice) => p.unit ?? p.price;
  const [a] = list;
  // При равной цене в двух магазинах сравниваем с первым, где дороже.
  const b = list.find((p) => val(p) > val(a) + 1e-9);
  if (!b || val(b) <= 0) return null;
  return { cheapest: a, others: list.slice(1), savePct: Math.round((1 - val(a) / val(b)) * 100) };
}

export interface Spending {
  week: number;
  month: number;
  prevMonth: number;
  /** Средняя неделя за последние 8 недель (только недели, где были чеки). */
  avgWeek: number;
  byStore: { store: string; total: number; count: number }[];
}

export function spending(receipts: ReceiptRow[], today: Date): Spending {
  let week = 0;
  let month = 0;
  let prevMonth = 0;
  let last8 = 0;
  const weeks = new Set<number>();
  const byStore = new Map<string, { total: number; count: number }>();
  for (const r of receipts) {
    const d = parseDate(r.date);
    const t = parseMoney(r.total);
    if (!d || t == null) continue;
    const ago = daysBetween(d, today);
    if (ago < 0) continue;
    if (ago < 7) week += t;
    if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()) {
      month += t;
      const s = byStore.get(r.store || '—') ?? { total: 0, count: 0 };
      s.total += t;
      s.count++;
      byStore.set(r.store || '—', s);
    }
    const pm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    if (d.getFullYear() === pm.getFullYear() && d.getMonth() === pm.getMonth()) prevMonth += t;
    if (ago < 56) {
      last8 += t;
      weeks.add(Math.floor(ago / 7));
    }
  }
  return {
    week,
    month,
    prevMonth,
    avgWeek: weeks.size ? last8 / weeks.size : 0,
    byStore: [...byStore.entries()].map(([store, v]) => ({ store, ...v })).sort((a, b) => b.total - a.total),
  };
}

/**
 * Примерная стоимость списка в каждом магазине — по одной упаковке каждого продукта.
 * Считаем только продукты, у которых есть цена во всех магазинах, чтобы суммы было честно сравнивать.
 */
export function estimateList(names: string[]): { store: string; total: number }[] & { common: number; unknown: number } {
  const keys = names.map(keyOf);
  const common = keys.filter((k) => REF_BY_STORE.every((s) => s.prices[k]));
  const totals = REF_BY_STORE.map((s) => ({ store: s.store, total: common.reduce((sum, k) => sum + s.prices[k].price, 0) }));
  return Object.assign(totals, { common: common.length, unknown: names.length - common.length });
}

export interface PlanItem {
  name: string;
  /** Сколько примерно стоит (упаковка, приведённая к одному размеру между магазинами). */
  cost: number | null;
}

export interface StorePlanGroup {
  store: string;
  items: PlanItem[];
  subtotal: number;
}

export interface ShoppingPlan {
  groups: StorePlanGroup[];
  /** Для этих продуктов цены нет ни в одном магазине. */
  other: string[];
  /** Сколько сэкономите, если покупать в нескольких магазинах, а не всё в одном самом дешёвом. */
  savings: number;
}

/**
 * Разложить список по магазинам: каждый продукт — туда, где он дешевле.
 * Чтобы сравнивать честно, цены приводятся к одному размеру упаковки (по цене за кг/шт).
 */
export function planByStore(names: string[], prices: PriceRow[]): ShoppingPlan {
  const groups = new Map<string, StorePlanGroup>();
  const other: string[] = [];
  const costs: Map<string, number>[] = [];
  for (const name of names) {
    const list = pricesFor(name, prices);
    if (!list.length) {
      other.push(name);
      continue;
    }
    // Размер «одной покупки» — упаковка первого магазина с понятным количеством.
    const basisRow = list.find((p) => p.unit != null);
    const basis = basisRow ? basisRow.price / (basisRow.unit as number) : null;
    const cost = (p: StorePrice) => (p.unit != null && basis != null ? p.unit * basis : p.price);
    const byStore = new Map(list.map((p) => [p.store, cost(p)]));
    if (list.length > 1 && list.every((p) => p.unit != null)) costs.push(byStore);
    const best = list[0];
    const g = groups.get(best.store) ?? { store: best.store, items: [], subtotal: 0 };
    const c = cost(best);
    g.items.push({ name, cost: c });
    g.subtotal += c;
    groups.set(best.store, g);
  }
  // Экономия: сумма «каждый продукт в самом дешёвом» против «всё в одном магазине».
  let savings = 0;
  if (costs.length) {
    const split = costs.reduce((s, m) => s + Math.min(...m.values()), 0);
    const stores = [...new Set(costs.flatMap((m) => [...m.keys()]))].filter((st) => costs.every((m) => m.has(st)));
    const single = stores.map((st) => costs.reduce((s, m) => s + (m.get(st) as number), 0));
    if (single.length) savings = Math.max(0, Math.min(...single) - split);
  }
  return {
    groups: [...groups.values()].sort((a, b) => b.items.length - a.items.length),
    other,
    savings,
  };
}
