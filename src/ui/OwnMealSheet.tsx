// «Своё блюдо или перекус»: что съели не по рецепту и какие продукты на это ушли.
// Отмеченные продукты убавляются в холодильнике, а Гера тоже «ест».

import { useMemo, useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { mutate } from '../api/store';
import { normalize } from '../data/ingredients';
import { isLeftover } from '../data/leftovers';
import { formatQty, parseQty } from '../data/quantity';
import { recipeIdForDish } from '../data/recipes';
import type { Kitchen } from '../hooks/useKitchen';
import { formatDate } from '../logic/dates';
import { mealForTime } from '../logic/suggest';
import { MEALS, type FridgeRow, type Meal, type Who } from '../types';
import { productEmoji } from './emoji';
import { Field, Segmented, Sheet } from './kit';
import { feedPet } from './pet/petStore';
import { productOfRow, QtyInput } from './ProductForm';
import { toast } from './toast';

interface Used {
  row: FridgeRow;
  qty: string;
  finished: boolean;
}

export function OwnMealSheet({ k, onClose }: { k: Kitchen; onClose: () => void }) {
  const [dish, setDish] = useState('');
  const [meal, setMeal] = useState<Meal>(() => {
    const h = new Date().getHours();
    // Между обедом и ужином — скорее перекус
    return h >= 16 && h < 19 ? 'перекус' : mealForTime(new Date());
  });
  const [who, setWho] = useState<Who>(k.me);
  const [used, setUsed] = useState<Used[]>([]);
  const [q, setQ] = useState('');

  const rows = useMemo(
    () => k.view.fridge.filter((r) => !isLeftover(r) && r.name.trim()).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [k.view.fridge],
  );
  const nq = normalize(q);
  const available = rows.filter((r) => !used.some((u) => u.row.id === r.id) && (!nq || normalize(r.name).includes(nq)));
  const hints = dish.trim() ? k.recipes.filter((r) => normalize(r.name).includes(normalize(dish))).slice(0, 4) : [];

  const add = (row: FridgeRow) => {
    const p = productOfRow(row);
    const n = parseQty(row.qty, p).n;
    // Сразу предлагаем «на одну меньше»; если количества нет — считаем, что закончилось
    const step = p?.unit === 'шт' ? (n != null && n < 1 ? n : 1) : 100;
    const rest = n != null ? Math.max(0, n - step) : null;
    setUsed((u) => [...u, { row, qty: rest != null ? formatQty(rest, p) : '', finished: rest === 0 || n == null }]);
  };
  const patch = (i: number, p: Partial<Used>) => setUsed((u) => u.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const save = () => {
    const name = dish.trim() || (meal === 'перекус' ? 'Перекус' : 'Своё блюдо');
    const id = newId();
    const ops: OpBody[] = [
      { op: 'eaten.upsert', row: { id, date: formatDate(new Date()), meal, dish: name, who, score: '', recipeId: recipeIdForDish(name, k.recipes) ?? '' } },
    ];
    for (const u of used) {
      const p = productOfRow(u.row);
      const n = parseQty(u.qty, p).n;
      if (u.finished || n === 0) ops.push({ op: 'fridge.delete', id: u.row.id });
      else if (n != null) ops.push({ op: 'fridge.upsert', row: { id: u.row.id, qty: formatQty(n, p) } });
    }
    mutate(ops);
    feedPet(id);
    toast(used.length ? `Записано: ${name}. Холодильник обновлён` : `Записано: ${name}`);
    onClose();
  };

  return (
    <Sheet
      tall
      title="Своё блюдо или перекус"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={save}>
          Записать
        </button>
      }
    >
      <Field label="Что ели">
        <input value={dish} onChange={(e) => setDish(e.target.value)} placeholder="Бутерброд, фрукты, паста…" />
      </Field>
      {hints.length > 0 && (
        <div className="chips">
          {hints.map((r) => (
            <button key={r.id} className="chip" onClick={() => setDish(r.name)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      <Field label="Приём">
        <Segmented<Meal> small value={meal} options={MEALS.map((m) => ({ value: m, label: m }))} onChange={setMeal} />
      </Field>
      <Field label="Кто ел">
        <Segmented<Who>
          small
          value={who}
          options={[
            { value: 'оба', label: 'оба' },
            { value: 'Крис', label: 'Крис' },
            { value: 'Кристина', label: 'Кристина' },
          ]}
          onChange={setWho}
        />
      </Field>

      {used.length > 0 && (
        <div className="field">
          <span className="field-label">Использовали — сколько осталось</span>
          <ul className="left-list">
            {used.map((u, i) => {
              const p = productOfRow(u.row);
              return (
                <li key={u.row.id} className={u.finished ? 'done' : ''}>
                  <div className="left-head">
                    <b>
                      {productEmoji(p?.key)} {u.row.name}
                    </b>
                    <label className="check">
                      <input type="checkbox" checked={u.finished} onChange={(e) => patch(i, { finished: e.target.checked })} />
                      закончилось
                    </label>
                    <button className="icon-btn" aria-label="Не использовали" onClick={() => setUsed((x) => x.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                  {!u.finished && parseQty(u.row.qty, p).n != null && <QtyInput product={p} value={u.qty} onChange={(qty) => patch(i, { qty })} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="field">
        <span className="field-label">Что взяли из холодильника</span>
        {rows.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти продукт" />}
        <div className="chips used-picker">
          {available.map((r) => (
            <button key={r.id} className="chip" onClick={() => add(r)}>
              {productEmoji(productOfRow(r)?.key)} {r.name}
            </button>
          ))}
          {available.length === 0 && <span className="muted small">{rows.length ? 'Всё выбрано' : 'Холодильник пуст'}</span>}
        </div>
      </div>
    </Sheet>
  );
}
