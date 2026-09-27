// «Приготовили»: записать в «Съели» и вычесть продукты из холодильника.

import { useMemo, useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { mutate } from '../api/store';
import { PRODUCT_BY_KEY } from '../data/products';
import { defaultPortions, leftoverExpiry, leftoverName, portionsText } from '../data/leftovers';
import { formatQty, parseQty } from '../data/quantity';
import type { Kitchen } from '../hooks/useKitchen';
import { usageFor, type RecipeCheck } from '../logic/availability';
import { formatDate } from '../logic/dates';
import { MEALS, type Meal, type Who } from '../types';
import { Field, Segmented, Sheet } from './kit';
import { QtyInput } from './ProductForm';
import { productLabel } from './labels';
import { toast } from './toast';

interface Left {
  key: string;
  known: boolean;
  /** Текст количества после готовки (для известного количества). */
  qty: string;
  finished: boolean;
  before: number;
}

export function CookedSheet({ check, k, defaultMeal, onClose }: { check: RecipeCheck; k: Kitchen; defaultMeal?: string; onClose: () => void }) {
  const r = check.recipe;
  const usage = useMemo(() => usageFor(check, k.stock), [check, k.stock]);
  const [meal, setMeal] = useState<Meal>(
    (defaultMeal as Meal) ?? (r.type === 'breakfast' ? 'завтрак' : new Date().getHours() < 16 ? 'обед' : 'ужин'),
  );
  const [who, setWho] = useState<Who>(r.type === 'breakfast' ? k.me : 'оба');
  const [left, setLeft] = useState<Left[]>(() =>
    usage.map((u) => {
      const item = k.stock.items.get(u.key)!;
      const p = PRODUCT_BY_KEY.get(u.key);
      const known = !item.unknown;
      const rest = Math.max(0, item.qty - (u.n ?? 0));
      // Количество неизвестно, а рецепт берёт целую упаковку — скорее всего, закончилось.
      const finished = known ? rest <= 0.01 : (u.n ?? 0) >= 1;
      return { key: u.key, known, qty: known ? formatQty(rest, p) : '', finished, before: item.qty };
    }),
  );
  const [rest, setRest] = useState(() => defaultPortions(r));
  const patch = (i: number, p: Partial<Left>) => setLeft((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const save = () => {
    const ops: OpBody[] = [
      {
        op: 'eaten.upsert',
        row: { id: newId(), date: formatDate(new Date()), meal, dish: r.name, who, score: '', recipeId: r.id },
      },
    ];
    left.forEach((l, i) => {
      const rows = usage[i].rows;
      const p = PRODUCT_BY_KEY.get(l.key);
      const n = l.known ? parseQty(l.qty, p).n : null;
      if (l.finished || n === 0) {
        rows.forEach((row) => ops.push({ op: 'fridge.delete', id: row.id }));
        return;
      }
      if (!l.known || n == null || Math.abs(n - l.before) < 0.01) return;
      // Несколько строк одного продукта сводим в первую.
      ops.push({ op: 'fridge.upsert', row: { id: rows[0].id, qty: formatQty(n, p) } });
      rows.slice(1).forEach((row) => ops.push({ op: 'fridge.delete', id: row.id }));
    });
    if (rest > 0) {
      ops.push({
        op: 'fridge.upsert',
        row: { id: newId(), name: leftoverName(r), where: 'холодильник', qty: portionsText(rest), expires: leftoverExpiry(r), note: 'готовое блюдо' },
      });
    }
    mutate(ops);
    toast(rest > 0 ? `Записано. В холодильнике: ${r.name}, ${portionsText(rest)}` : `Записано: ${r.name}`);
    onClose();
  };

  return (
    <Sheet
      title={`Приготовили: ${r.name}`}
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={save}>
          Записать
        </button>
      }
    >
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
      <div className="field">
        <span className="field-label">Осталось на потом</span>
        <div className="qty-row">
          <button type="button" className="round-btn" onClick={() => setRest((x) => Math.max(0, x - 1))} aria-label="Меньше">
            −
          </button>
          <div className="portions">{rest > 0 ? `🍲 ${portionsText(rest)}` : 'ничего не осталось'}</div>
          <button type="button" className="round-btn" onClick={() => setRest((x) => x + 1)} aria-label="Больше">
            +
          </button>
        </div>
        {rest > 0 && <span className="muted small">Положу в холодильник — завтра предложу доесть.</span>}
      </div>
      {left.length > 0 && (
        <div className="field">
          <span className="field-label">Что осталось в холодильнике</span>
          <ul className="left-list">
            {left.map((l, i) => (
              <li key={l.key} className={l.finished ? 'done' : ''}>
                <div className="left-head">
                  <b>{productLabel(l.key)}</b>
                  <label className="check">
                    <input type="checkbox" checked={l.finished} onChange={(e) => patch(i, { finished: e.target.checked })} />
                    закончилось
                  </label>
                </div>
                {l.known && !l.finished && <QtyInput product={PRODUCT_BY_KEY.get(l.key)} value={l.qty} onChange={(qty) => patch(i, { qty })} />}
                {!l.known && !l.finished && <p className="muted small">Количество не записано — оставим как есть.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
