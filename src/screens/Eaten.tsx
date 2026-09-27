// «Съели»: история, кто ел, 👍/👎 у каждого свои.

import { useMemo, useState } from 'react';
import { newId } from '../api/ops';
import { mutate } from '../api/store';
import { normalize } from '../data/ingredients';
import { recipeIdForDish } from '../data/recipes';
import type { Kitchen } from '../hooks/useKitchen';
import { agoText, daysBetween, formatDate, parseDate, toIso } from '../logic/dates';
import { reactionsFor } from '../logic/suggest';
import { MEALS, type EatenRow, type Meal, type Person, type Recipe, type Who } from '../types';
import { Empty, Field, Section, Segmented, Sheet } from '../ui/kit';
import { setReaction } from '../ui/RecipeCard';
import { toast } from '../ui/toast';

const MEAL_ICON: Record<string, string> = { завтрак: '☀️', обед: '🍲', ужин: '🌙', перекус: '🍎' };

export function Eaten({ k }: { k: Kitchen }) {
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(40);
  const byId = useMemo(() => new Map(k.recipes.map((r) => [r.id, r])), [k.recipes]);

  const rows = useMemo(
    () =>
      [...k.view.eaten].sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0)),
    [k.view.eaten],
  );

  const groups: { label: string; rows: EatenRow[] }[] = [];
  for (const row of rows.slice(0, limit)) {
    const d = parseDate(row.date);
    const ago = d ? daysBetween(d, k.today) : null;
    const label = ago == null ? row.date || 'без даты' : ago <= 1 ? agoText(ago) : row.date;
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  const recipeOf = (row: EatenRow): Recipe | undefined => byId.get(row.recipeId || recipeIdForDish(row.dish, k.recipes) || '');

  return (
    <>
      <button className="btn primary wide" onClick={() => setAdding(true)}>
        Записать, что ели
      </button>
      {rows.length === 0 && <Empty>Пока пусто. Нажимайте «Приготовили» в карточке блюда — и история появится сама.</Empty>}
      {groups.map((g) => (
        <Section key={g.label} title={g.label[0].toUpperCase() + g.label.slice(1)}>
          <ul className="list">
            {g.rows.map((row) => {
              const r = recipeOf(row);
              return (
                <li key={row.id} className="item">
                  <div className="item-main static">
                    <span className="item-name">
                      {MEAL_ICON[row.meal] ?? '🍽'} {row.dish}
                    </span>
                    <span className="item-sub">
                      <span>{row.meal}</span>
                      <span>{row.who}</span>
                      {row.score && <span>оценка {row.score}</span>}
                    </span>
                  </div>
                  {r && <MiniReactions recipe={r} k={k} />}
                  <button
                    className="icon-btn"
                    aria-label="Удалить запись"
                    onClick={() => {
                      mutate({ op: 'eaten.delete', id: row.id });
                      toast('Запись удалена', () => mutate({ op: 'eaten.upsert', row }));
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
      {rows.length > limit && (
        <button className="btn ghost wide" onClick={() => setLimit((l) => l + 40)}>
          Показать ещё
        </button>
      )}
      {adding && <AddEaten k={k} onClose={() => setAdding(false)} />}
    </>
  );
}

function MiniReactions({ recipe, k }: { recipe: Recipe; k: Kitchen }) {
  const r = reactionsFor(recipe.id, k.view.ratings);
  const mine = r[k.me];
  const other: Person = k.me === 'Крис' ? 'Кристина' : 'Крис';
  return (
    <div className="mini-react">
      <button className={mine === 'like' ? 'on' : ''} onClick={() => setReaction(recipe, k.me, mine, 'like')} aria-label="Нравится">
        👍
      </button>
      <button className={mine === 'dislike' ? 'on bad' : ''} onClick={() => setReaction(recipe, k.me, mine, 'dislike')} aria-label="Не нравится">
        👎
      </button>
      {r[other] && <small title={other}>{other[0]}{r[other] === 'like' ? '👍' : '👎'}</small>}
    </div>
  );
}

function AddEaten({ k, onClose }: { k: Kitchen; onClose: () => void }) {
  const [dish, setDish] = useState('');
  const [date, setDate] = useState(toIso(new Date()));
  const [meal, setMeal] = useState<Meal>(new Date().getHours() < 11 ? 'завтрак' : new Date().getHours() < 16 ? 'обед' : 'ужин');
  const [who, setWho] = useState<Who>('оба');
  const q = normalize(dish);
  const hints = q ? k.recipes.filter((r) => normalize(r.name).includes(q)).slice(0, 6) : [];

  const save = () => {
    if (!dish.trim()) return;
    const recipeId = recipeIdForDish(dish, k.recipes) ?? '';
    mutate({
      op: 'eaten.upsert',
      row: { id: newId(), date: formatDate(parseDate(date) ?? new Date()), meal, dish: dish.trim(), who, score: '', recipeId },
    });
    toast('Записано');
    onClose();
  };

  return (
    <Sheet
      title="Что ели"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={save} disabled={!dish.trim()}>
          Записать
        </button>
      }
    >
      <Field label="Блюдо">
        <input value={dish} onChange={(e) => setDish(e.target.value)} placeholder="Борщ, пицца в кафе…" autoFocus />
      </Field>
      {hints.length > 0 && hints[0].name !== dish && (
        <div className="chips">
          {hints.map((r) => (
            <button key={r.id} className="chip" onClick={() => setDish(r.name)}>
              {r.name}
            </button>
          ))}
        </div>
      )}
      <Field label="Когда">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
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
    </Sheet>
  );
}
