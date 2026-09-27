// «Холодильник»: что есть дома, по местам хранения. Добавление с подсказками и списком после магазина.

import { useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { mutate } from '../api/store';
import { matchProduct } from '../data/ingredients';
import { formatQty, parseQty, stepFor } from '../data/quantity';
import type { Kitchen } from '../hooks/useKitchen';
import { EXPIRING_DAYS } from '../logic/availability';
import { daysBetween, daysLeftText, parseDate } from '../logic/dates';
import { PLACES, type FridgeRow, type Product } from '../types';
import { Empty, Section, Sheet } from '../ui/kit';
import { draftFor, productOfRow, ProductForm, shortName, type ProductDraft } from '../ui/ProductForm';
import { ProductPicker } from '../ui/ProductPicker';
import { toast } from '../ui/toast';

function daysLeft(row: FridgeRow, today: Date): number | null {
  const d = parseDate(row.expires);
  return d ? daysBetween(today, d) : null;
}

export function Fridge({ k }: { k: Kitchen }) {
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [bulk, setBulk] = useState(false);
  const rows = k.view.fridge;

  const groups = [...PLACES, 'другое'].map((place) => ({
    place,
    rows: rows
      .filter((r) => (place === 'другое' ? !PLACES.includes(r.where as never) : r.where === place))
      .sort((a, b) => {
        const da = daysLeft(a, k.today) ?? 9999;
        const db = daysLeft(b, k.today) ?? 9999;
        return da - db || a.name.localeCompare(b.name, 'ru');
      }),
  }));

  const finish = (row: FridgeRow) => {
    mutate({ op: 'fridge.delete', id: row.id });
    toast(`Закончилось: ${row.name}`, () => mutate({ op: 'fridge.upsert', row }));
  };

  const minus = (row: FridgeRow, p: Product | undefined) => {
    const n = parseQty(row.qty, p).n;
    if (n == null) return;
    const next = Math.round((n - stepFor(p)) * 100) / 100;
    if (next <= 0) return finish(row);
    mutate({ op: 'fridge.upsert', row: { id: row.id, qty: formatQty(next, p) } });
  };

  const edit = (row: FridgeRow) => {
    const product = productOfRow(row);
    setDraft({ id: row.id, product, name: row.name, qty: row.qty, where: row.where, expires: row.expires, note: row.note });
  };

  return (
    <>
      <ProductPicker onPick={(p) => setDraft(draftFor(p))} onRaw={(t) => setDraft(draftFor(undefined, t))} />
      <button className="btn ghost wide" onClick={() => setBulk(true)}>
        Добавить списком после магазина
      </button>

      {rows.length === 0 && <Empty>Холодильник пуст. Добавь продукты — и во вкладке «Готовим» появятся блюда.</Empty>}

      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <Section key={g.place} title={g.place[0].toUpperCase() + g.place.slice(1)}>
            <ul className="list">
              {g.rows.map((row) => {
                const p = productOfRow(row);
                const dl = daysLeft(row, k.today);
                const soon = dl != null && dl <= EXPIRING_DAYS;
                const counted = parseQty(row.qty, p).n != null;
                return (
                  <li key={row.id} className={`item${soon ? ' soon' : ''}`}>
                    <button className="item-main" onClick={() => edit(row)}>
                      <span className="item-name">{row.name}</span>
                      <span className="item-sub">
                        {row.qty && <span>{row.qty}</span>}
                        {row.expires && <span className={soon ? 'red' : ''}>{dl != null ? `до ${row.expires.slice(0, 5)} · ${daysLeftText(dl)}` : row.expires}</span>}
                        {row.note && <span className="muted">{row.note}</span>}
                      </span>
                    </button>
                    {counted && (
                      <button className="round-btn" onClick={() => minus(row, p)} aria-label="Меньше">
                        −
                      </button>
                    )}
                    <button className="pill" onClick={() => finish(row)}>
                      закончилось
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}

      {draft && <ProductForm initial={draft} allowMore={!draft.id} onClose={() => setDraft(null)} />}
      {bulk && <BulkAdd onClose={() => setBulk(false)} />}
    </>
  );
}

interface BulkLine {
  text: string;
  product: Product | undefined;
  name: string;
  qty: string;
  on: boolean;
}

/** «лук 6», «фарш 500», «сметана» — по строке, приложение само узнаёт продукт. */
export function parseBulk(text: string): BulkLine[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s,:–-]+(\d[\d.,/½¼¾]*\s*[^\d]*)$/);
      const namePart = (m ? m[1] : line).trim();
      const qtyPart = m ? m[2].trim() : '';
      const product = matchProduct(namePart)?.product;
      let qty = '';
      if (qtyPart) {
        const n = parseQty(/^\d[\d.,]*$/.test(qtyPart) && product?.unit === 'г' ? `${qtyPart} г` : qtyPart, product).n;
        qty = n != null && product ? formatQty(n, product) : qtyPart;
      } else if (product && product.unit === 'шт') qty = formatQty(1, product);
      return { text: line, product, name: product ? shortName(product) : namePart, qty, on: true };
    });
}

function BulkAdd({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const lines = parseBulk(text);
  const [off, setOff] = useState<Set<number>>(new Set());

  const add = () => {
    const ops: OpBody[] = lines
      .filter((_, i) => !off.has(i))
      .map((l) => ({
        op: 'fridge.upsert',
        row: { id: newId(), name: l.name, where: l.product?.where ?? 'холодильник', qty: l.qty, expires: '', note: '' },
      }));
    if (!ops.length) return;
    mutate(ops);
    toast(`Добавлено: ${ops.length}`);
    onClose();
  };

  return (
    <Sheet
      title="Список после магазина"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={add} disabled={!lines.length}>
          Добавить {lines.length - off.size || ''}
        </button>
      }
    >
      <p className="muted small">По продукту на строку, количество после названия. Сроки потом можно поправить, нажав на продукт.</p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'лук 6\nкартошка 8\nфарш 500\nсметана\nмолоко 2'} />
      {lines.length > 0 && (
        <ul className="list compact">
          {lines.map((l, i) => (
            <li key={i} className={`item${off.has(i) ? ' off' : ''}`}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!off.has(i)}
                  onChange={() =>
                    setOff((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <span>
                  <b>{l.name}</b> {l.qty && <span className="muted">· {l.qty}</span>}
                  {!l.product && <span className="tag">нет в каталоге</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
