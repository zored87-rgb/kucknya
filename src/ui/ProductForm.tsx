// Добавить или поправить продукт в холодильнике. Количество — в понятных единицах.

import { useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { getState, mutate } from '../api/store';
import { autoExpiry, shortName } from '../data/bulk';
import { PRODUCT_BY_KEY } from '../data/products';
import { formatQty, parseQty, quickAmounts, stepFor } from '../data/quantity';
import { fridgeKey } from '../logic/availability';
import { addDays, formatDate, parseDate, toIso } from '../logic/dates';
import { DEFAULT_STORES } from '../logic/money';
import { PLACES, type FridgeRow, type Place, type Product } from '../types';
import { Field, Segmented, Sheet } from './kit';
import { toast } from './toast';

export { shortName };

export function productOfRow(row: Pick<FridgeRow, 'name'>): Product | undefined {
  return PRODUCT_BY_KEY.get(fridgeKey(row as FridgeRow));
}

export function QtyInput({ product, value, onChange }: { product?: Product; value: string; onChange: (v: string) => void }) {
  const step = stepFor(product);
  const n = parseQty(value, product).n;
  const bump = (d: number) => {
    const next = Math.max(0, Math.round(((n ?? 0) + d) * 100) / 100);
    onChange(formatQty(next, product));
  };
  return (
    <div className="qty">
      <div className="qty-row">
        <button type="button" className="round-btn" onClick={() => bump(-step)} aria-label="Меньше">
          −
        </button>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={product ? formatQty(product.unit === 'г' ? 500 : 1, product) : 'сколько'} />
        <button type="button" className="round-btn" onClick={() => bump(step)} aria-label="Больше">
          +
        </button>
      </div>
      {product && (
        <div className="chips">
          {quickAmounts(product).map((a) => (
            <button type="button" key={a} className="chip" onClick={() => onChange(formatQty(a, product))}>
              {formatQty(a, product)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExpiryInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const d = parseDate(value);
  const today = new Date();
  const opts: [string, number | null][] = [
    ['без срока', null],
    ['+3 дня', 3],
    ['+неделя', 7],
    ['+месяц', 30],
  ];
  return (
    <div className="expiry">
      <input type="date" value={d ? toIso(d) : ''} onChange={(e) => onChange(e.target.value ? formatDate(parseDate(e.target.value)!) : '')} />
      <div className="chips">
        {opts.map(([label, days]) => (
          <button type="button" key={label} className="chip" onClick={() => onChange(days == null ? '' : formatDate(addDays(today, days)))}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface ProductDraft {
  id?: string;
  product?: Product;
  name: string;
  qty: string;
  where: string;
  expires: string;
  note: string;
}

export function draftFor(product: Product | undefined, name?: string): ProductDraft {
  return {
    product,
    name: product ? shortName(product) : name ?? '',
    qty: product ? formatQty(product.unit === 'шт' ? 1 : product.unit === 'г' ? 500 : 1000, product) : '',
    where: product?.where ?? 'холодильник',
    expires: autoExpiry(product),
    note: '',
  };
}

const LAST_STORE = 'kukhnya.lastStore';

function lastStore(stores: string[]): string {
  try {
    const s = localStorage.getItem(LAST_STORE);
    if (s && stores.includes(s)) return s;
  } catch {
    /* нет доступа к localStorage — берём первый магазин */
  }
  return stores[0];
}

export function ProductForm({
  initial,
  onClose,
  onSaved,
  allowMore,
  title,
}: {
  initial: ProductDraft;
  onClose: () => void;
  onSaved?: (row: FridgeRow) => void;
  /** Показать «Сохранить и добавить ещё». */
  allowMore?: boolean;
  title?: string;
}) {
  const [d, setD] = useState(initial);
  const editing = !!initial.id;
  const stores = getState().view.settings.stores?.length ? getState().view.settings.stores! : DEFAULT_STORES;
  const [store, setStore] = useState(() => lastStore(stores));
  const [price, setPrice] = useState('');
  const set = (patch: Partial<ProductDraft>) => setD((x) => ({ ...x, ...patch }));

  const save = (more: boolean) => {
    if (!d.name.trim()) return;
    const row: FridgeRow = {
      id: d.id ?? newId(),
      name: d.name.trim(),
      where: d.where,
      qty: d.qty.trim(),
      expires: d.expires,
      note: d.note.trim(),
    };
    const ops: OpBody[] = [{ op: 'fridge.upsert', row }];
    const p = parseFloat(price.replace(',', '.'));
    if (!editing && !isNaN(p) && p > 0) {
      ops.push({
        op: 'price.upsert',
        row: { id: newId(), date: formatDate(new Date()), product: row.name, store, price: p.toFixed(2), per: row.qty },
      });
      try {
        localStorage.setItem(LAST_STORE, store);
      } catch {
        /* не запомним магазин — не страшно */
      }
    }
    mutate(ops);
    onSaved?.(row);
    toast(editing ? 'Сохранено' : `Добавлено: ${row.name}`);
    if (!more) onClose();
  };

  const remove = () => {
    if (!initial.id) return;
    const old = initial;
    mutate({ op: 'fridge.delete', id: initial.id });
    toast(`Закончилось: ${old.name}`, () =>
      mutate({ op: 'fridge.upsert', row: { id: old.id!, name: old.name, where: old.where, qty: old.qty, expires: old.expires, note: old.note } }),
    );
    onClose();
  };

  return (
    <Sheet
      title={title ?? (editing ? d.name : `Добавить: ${d.name}`)}
      onClose={onClose}
      footer={
        <div className="row-btns">
          {editing && (
            <button className="btn ghost danger" onClick={remove}>
              Закончилось
            </button>
          )}
          {allowMore && !editing && (
            <button className="btn ghost" onClick={() => save(true)}>
              И ещё
            </button>
          )}
          <button className="btn primary" onClick={() => save(false)}>
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      }
    >
      {(!d.product || editing) && (
        <Field label="Продукт">
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
      )}
      <Field label="Сколько">
        <QtyInput product={d.product} value={d.qty} onChange={(qty) => set({ qty })} />
      </Field>
      <Field label="Где">
        <Segmented<Place> small value={(PLACES.includes(d.where as Place) ? d.where : 'холодильник') as Place} options={PLACES.map((p) => ({ value: p, label: p }))} onChange={(where) => set({ where })} />
      </Field>
      <Field label="Годен до">
        <ExpiryInput value={d.expires} onChange={(expires) => set({ expires })} />
      </Field>
      <Field label="Заметка">
        <input value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="открыта, для супа…" />
      </Field>
      {!editing && (
        <Field label="Цена — по желанию, чтобы знать, где дешевле">
          <div className="price-row">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0,00 €"
              aria-label="Цена"
            />
            <select value={store} onChange={(e) => setStore(e.target.value)} aria-label="Магазин">
              {stores.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {price && <span className="muted small">за {d.qty || 'указанное количество'}</span>}
        </Field>
      )}
    </Sheet>
  );
}
