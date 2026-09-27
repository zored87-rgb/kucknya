// Разбор списка продуктов: после магазина, с клавиатуры или надиктованного Siri.
// «лук 6», «6 луковиц», «500 г фарша», «фарш 500, молоко и сыр» — всё понимает.

import { addDays, formatDate } from '../logic/dates';
import type { Product } from '../types';
import { matchProduct } from './ingredients';
import { formatQty, parseQty } from './quantity';

export interface BulkLine {
  text: string;
  product: Product | undefined;
  name: string;
  qty: string;
  expires: string;
  where: string;
}

/** «Сыр (гауда, эдам и т.п.)» → «Сыр» — так и пишем в таблицу. */
export function shortName(p: Product): string {
  return p.name.replace(/\s*\(.*\)\s*$/, '');
}

/** Годен до: сегодня + срок хранения продукта. Пусто, если срок не задан. */
export function autoExpiry(product: Product | undefined, today: Date = new Date()): string {
  return product?.shelfDays ? formatDate(addDays(today, product.shelfDays)) : '';
}

/** Режем на отдельные продукты: переносы строк, «, », «; », « и ». Запятая внутри числа (1,5 кг) не режет. */
export function splitItems(text: string): string[] {
  return text
    .split(/\n|;\s*|,\s+|,(?=\D)|\s+и\s+/i)
    .map((l) => l.trim().replace(/^[-•*]\s*/, '').replace(/[.!]+$/, ''))
    .filter(Boolean);
}

const UNIT = '(кг|килограмм\\S*|г|гр|грамм\\S*|мл|л|литр\\S*|шт\\S*|пачк\\S*|банк\\S*|упаковк\\S*|пакет\\S*|пуч\\S*)';

function qtyFrom(num: string, unit: string, product: Product | undefined): string {
  const u = unit.toLowerCase();
  const n = parseFloat(num.replace(',', '.'));
  if (!product || isNaN(n)) return [num, unit].filter(Boolean).join(' ');
  if (product.unit === 'г' || product.unit === 'мл') {
    if (/^(кг|килограмм|л$|литр)/.test(u)) return formatQty(n * 1000, product);
    if (/^(г|гр|грамм|мл)/.test(u) || !u) return formatQty(n, product);
  }
  if (product.unit === 'шт' && (!u || /^(шт|пачк|банк|упаковк|пакет|пуч)/.test(u))) return formatQty(n, product);
  const parsed = parseQty(`${num} ${unit}`, product).n;
  return parsed != null ? formatQty(parsed, product) : `${num} ${unit}`.trim();
}

export function parseItem(line: string, today: Date = new Date()): BulkLine {
  let namePart = line;
  let num = '';
  let unit = '';
  // «6 луковиц», «500 г фарша», «1,5 кг картошки»
  const before = line.match(new RegExp(`^(\\d+(?:[.,]\\d+)?|[½¼¾])\\s*${UNIT}?\\s+(.+)$`, 'i'));
  // «лук 6», «фарш 500 г», «молоко 2 пакета»
  const after = line.match(new RegExp(`^(.+?)[\\s:–-]+(\\d+(?:[.,]\\d+)?|[½¼¾])\\s*${UNIT}?$`, 'i'));
  if (before) {
    num = before[1];
    unit = before[2] ?? '';
    namePart = before[3];
  } else if (after) {
    namePart = after[1];
    num = after[2];
    unit = after[3] ?? '';
  }
  const product = matchProduct(namePart)?.product;
  let qty = '';
  if (num) qty = qtyFrom(num, unit, product);
  else if (product && product.unit === 'шт') qty = formatQty(1, product);
  return {
    text: line,
    product,
    name: product ? shortName(product) : namePart.trim().replace(/^./, (c) => c.toUpperCase()),
    qty,
    expires: autoExpiry(product, today),
    where: product?.where ?? 'холодильник',
  };
}

export function parseBulk(text: string, today: Date = new Date()): BulkLine[] {
  return splitItems(text).map((l) => parseItem(l, today));
}
