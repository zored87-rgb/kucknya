// «Доесть»: готовые блюда в холодильнике. Съели порцию — минус из остатков и запись в «Съели».

import { newId, type OpBody } from '../api/ops';
import { mutate } from '../api/store';
import { dishOf, leftoverRecipeId, portions, portionsText } from '../data/leftovers';
import type { Kitchen } from '../hooks/useKitchen';
import { daysBetween, daysLeftText, formatDate, parseDate } from '../logic/dates';
import type { FridgeRow, Who } from '../types';
import { dishEmoji } from './emoji';
import { toast } from './toast';
import { mealForTime } from '../logic/suggest';

function eat(row: FridgeRow, n: number, who: Who, k: Kitchen) {
  const left = portions(row) - n;
  const meal = mealForTime(new Date());
  const ops: OpBody[] = [
    {
      op: 'eaten.upsert',
      row: { id: newId(), date: formatDate(new Date()), meal, dish: dishOf(row), who, score: '', recipeId: leftoverRecipeId(row, k.recipes) ?? '' },
    },
    left > 0 ? { op: 'fridge.upsert', row: { id: row.id, qty: portionsText(left) } } : { op: 'fridge.delete', id: row.id },
  ];
  mutate(ops);
  toast(left > 0 ? `Приятного! Осталось ${portionsText(left)}` : `Приятного! ${dishOf(row)} доели`);
}

export function Leftovers({ k }: { k: Kitchen }) {
  if (!k.leftoverRows.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h3>🍲 Доесть</h3>
      </div>
      <div className="cards">
        {k.leftoverRows.map((row) => {
          const n = portions(row);
          const d = parseDate(row.expires);
          const dl = d ? daysBetween(k.today, d) : null;
          return (
            <article key={row.id} className="card leftover">
              <span className="dish-tile tone-soup" aria-hidden>
                {dishEmoji({ name: dishOf(row) })}
              </span>
              <div className="leftover-main">
                <h4>{dishOf(row)}</h4>
                <span className="muted small">
                  {portionsText(n)}
                  {dl != null && <span className={dl <= 0 ? 'red' : ''}> · {dl < 0 ? daysLeftText(dl) : `годно ${daysLeftText(dl)}`}</span>}
                </span>
              </div>
              <div className="leftover-btns">
                <button className="pill" onClick={() => eat(row, 1, k.me, k)}>
                  −1
                </button>
                {n >= 2 && (
                  <button className="pill accent" onClick={() => eat(row, 2, 'оба', k)}>
                    Съели 2
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
