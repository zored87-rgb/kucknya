import { productKeyOf } from '../data/ingredients';
import { PRODUCT_BY_KEY } from '../data/products';

/** Ключ продукта → короткое название: «Сыр (гауда, эдам…)» → «Сыр». */
export function productLabel(key: string): string {
  const p = PRODUCT_BY_KEY.get(key);
  if (p) return p.name.replace(/\s*\(.*\)\s*$/, '');
  return key.replace(/^raw:/, '');
}

/** Строка кладовой для показа: «tomate triturado» → «Томаты в банке», «рис» → «Рис». */
export function pantryLabel(s: string): string {
  if (/[a-z]/i.test(s) && !/[а-яё]/i.test(s)) {
    const key = productKeyOf(s);
    if (key) return productLabel(key);
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}
