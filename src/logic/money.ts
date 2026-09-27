// Экономика: где дешевле (по ценам, которые вы записывали) и сколько потрачено (по чекам).

import { productKeyOf } from '../data/ingredients';
import { PRODUCT_BY_KEY } from '../data/products';
import { parseQty } from '../data/quantity';
import { rawKey } from '../data/recipes';
import type { PriceRow, ReceiptRow } from '../types';
import { daysBetween, parseDate } from './dates';

export const DEFAULT_STORES = ['Mercadona', 'Carrefour', 'Kuups'];

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

/** Последняя известная цена продукта в каждом магазине. */
export function pricesFor(name: string, prices: PriceRow[]): StorePrice[] {
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
export function cheapestAdvice(name: string, prices: PriceRow[]): Advice | null {
  const list = pricesFor(name, prices);
  if (list.length < 2) return null;
  const [a, b] = list;
  const va = a.unit ?? a.price;
  const vb = b.unit ?? b.price;
  if (vb <= 0 || va >= vb) return null;
  return { cheapest: a, others: list.slice(1), savePct: Math.round((1 - va / vb) * 100) };
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
