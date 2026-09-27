// Кладовая: рис, паста, масло… «всегда есть» — пока не закончатся.
// Закончилось → убираем из кладовой и кладём в список покупок; купили → возвращается сам.

import { newId, type OpBody } from '../api/ops';
import { mutate } from '../api/store';
import { normalize } from '../data/ingredients';
import type { Kitchen } from '../hooks/useKitchen';
import { toast } from './toast';

/** Причина в списке покупок, по которой узнаём продукт кладовой. */
export const PANTRY_REASON = 'кладовая';

function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Pantry({ k }: { k: Kitchen }) {
  const out = k.view.shopping.filter((s) => !s.bought && s.reason === PANTRY_REASON);
  const outNames = new Set(out.map((s) => normalize(s.name)));
  const have = k.pantry.filter((p) => !outNames.has(normalize(p)));

  const finish = (item: string) => {
    const id = newId();
    const ops: OpBody[] = [
      { op: 'pantry.set', items: k.pantry.filter((p) => p !== item) },
      { op: 'shopping.upsert', row: { id, name: title(item), qty: '', reason: PANTRY_REASON, bought: false } },
    ];
    mutate(ops);
    toast(`${title(item)} — в списке покупок`, () =>
      mutate([
        { op: 'pantry.set', items: k.pantry },
        { op: 'shopping.delete', id },
      ]),
    );
  };

  const back = (rowId: string, name: string) => {
    mutate([
      { op: 'pantry.set', items: k.pantry.some((p) => normalize(p) === normalize(name)) ? k.pantry : [...k.pantry, name.toLowerCase()] },
      { op: 'shopping.delete', id: rowId },
    ]);
  };

  return (
    <section className="section">
      <div className="section-head">
        <h3>🧂 Кладовая</h3>
      </div>
      <div className="chips">
        {have.map((p) => (
          <button key={p} className="chip pantry" onClick={() => finish(p)} title="Нажми, если закончилось">
            {title(p)}
          </button>
        ))}
        {out.map((s) => (
          <button key={s.id} className="chip pantry out" onClick={() => back(s.id, s.name)} title="Уже есть — вернуть">
            {s.name} · нет
          </button>
        ))}
      </div>
    </section>
  );
}
