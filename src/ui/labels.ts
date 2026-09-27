import { PRODUCT_BY_KEY } from '../data/products';

/** Ключ продукта → короткое название: «Сыр (гауда, эдам…)» → «Сыр». */
export function productLabel(key: string): string {
  const p = PRODUCT_BY_KEY.get(key);
  if (p) return p.name.replace(/\s*\(.*\)\s*$/, '');
  return key.replace(/^raw:/, '');
}
