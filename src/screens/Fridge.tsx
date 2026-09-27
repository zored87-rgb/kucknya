// «Холодильник»: что есть дома, по местам хранения. Добавление с подсказками и списком после магазина.

import { useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { mutate } from '../api/store';
import { parseBulk } from '../data/bulk';
import { dishOf, isLeftover, portions, portionsText } from '../data/leftovers';
import { formatQty, parseQty, stepFor } from '../data/quantity';
import type { Kitchen } from '../hooks/useKitchen';
import { EXPIRING_DAYS } from '../logic/availability';
import { daysBetween, daysLeftText, parseDate } from '../logic/dates';
import { PLACES, type FridgeRow, type Product } from '../types';
import { productEmoji } from '../ui/emoji';
import { Pantry } from '../ui/Pantry';
import { IconList } from '../ui/icons';
import { Empty, Section, Sheet } from '../ui/kit';
import { draftFor, productOfRow, ProductForm, type ProductDraft } from '../ui/ProductForm';
import { ProductPicker } from '../ui/ProductPicker';
import { toast } from '../ui/toast';

const PLACE_EMOJI: Record<string, string> = { холодильник: '🧊', морозилка: '❄️', 'полка круп': '🫙' };

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
    if (isLeftover(row)) {
      const left = portions(row) - 1;
      if (left <= 0) return finish(row);
      mutate({ op: 'fridge.upsert', row: { id: row.id, qty: portionsText(left) } });
      return;
    }
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
      <div className="search-row">
        <ProductPicker onPick={(p) => setDraft(draftFor(p))} onRaw={(t) => setDraft(draftFor(undefined, t))} />
        <button className="square-btn" onClick={() => setBulk(true)} aria-label="Добавить списком после магазина" title="Списком">
          <IconList />
        </button>
      </div>

      {rows.length === 0 && <Empty>Холодильник пуст. Добавь продукты — и во вкладке «Готовим» появятся блюда.</Empty>}

      {groups
        .filter((g) => g.rows.length)
        .map((g) => (
          <Section key={g.place} title={`${PLACE_EMOJI[g.place] ?? '📦'} ${g.place[0].toUpperCase() + g.place.slice(1)}`} action={<span className="count">{g.rows.length}</span>}>
            <ul className="list">
              {g.rows.map((row) => {
                const p = productOfRow(row);
                const dl = daysLeft(row, k.today);
                const soon = dl != null && dl <= EXPIRING_DAYS;
                const counted = isLeftover(row) || parseQty(row.qty, p).n != null;
                return (
                  <li key={row.id} className={`item${soon ? ' soon' : ''}`}>
                    <span className="item-emoji" aria-hidden>
                      {isLeftover(row) ? '🍲' : productEmoji(p?.key)}
                    </span>
                    <button className="item-main" onClick={() => edit(row)}>
                      <span className="item-name">{isLeftover(row) ? `${dishOf(row)} (готовое)` : row.name}</span>
                      <span className="item-sub">
                        {row.qty && <span>{row.qty}</span>}
                        {row.expires && (
                          <span className={`exp-pill${soon ? ' hot' : dl != null && dl <= 5 ? ' warm' : ''}`}>
                            {dl != null ? daysLeftText(dl) : row.expires}
                          </span>
                        )}
                      </span>
                    </button>
                    {counted && (
                      <button className="round-btn" onClick={() => minus(row, p)} aria-label="Меньше">
                        −
                      </button>
                    )}
                    <button className="round-btn done" onClick={() => finish(row)} aria-label="Закончилось" title="Закончилось">
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}

      <Pantry k={k} />

      {draft && <ProductForm initial={draft} allowMore={!draft.id} onClose={() => setDraft(null)} />}
      {bulk && <BulkAdd onClose={() => setBulk(false)} />}
    </>
  );
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
        row: { id: newId(), name: l.name, where: l.where, qty: l.qty, expires: l.expires, note: '' },
      }));
    if (!ops.length) return;
    mutate(ops);
    toast(`Добавлено: ${ops.length}`);
    onClose();
  };

  return (
    <Sheet
      title="Списком"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={add} disabled={!lines.length}>
          Добавить {lines.length - off.size || ''}
        </button>
      }
    >
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'6 луковиц, фарш 500, молоко…\n\n🎤 можно надиктовать с клавиатуры'}
      />
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
                  {l.expires && <span className="muted"> · до {l.expires.slice(0, 5)}</span>}
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
