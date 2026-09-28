// «Рецепты»: вся база с поиском и фильтрами, плюс свой рецепт.

import { useMemo, useState } from 'react';
import { newId } from '../api/ops';
import { mutate } from '../api/store';
import { normalize } from '../data/ingredients';
import { parseMyRecipe } from '../data/recipes';
import type { Kitchen } from '../hooks/useKitchen';
import { checkRecipe } from '../logic/availability';
import { minutesOf } from '../logic/portions';
import { reactionsFor } from '../logic/suggest';
import type { RecipeType } from '../types';
import { Empty, Field, Segmented, Sheet } from '../ui/kit';
import { productLabel } from '../ui/labels';
import { RecipeCard } from '../ui/RecipeCard';
import { toast } from '../ui/toast';

type TypeFilter = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'weekend';
type CuisineFilter = 'all' | 'ru' | 'es' | 'world';

const TYPE_MATCH: Record<TypeFilter, RecipeType[]> = {
  all: ['breakfast', 'batch_lunch', 'dinner', 'weekend', 'backup', 'extra'],
  breakfast: ['breakfast'],
  lunch: ['batch_lunch'],
  dinner: ['dinner', 'backup'],
  weekend: ['weekend'],
};

/** Карточек за раз: длинная лента тормозит и в ней не найти кнопки. */
const PAGE = 20;

export function Recipes({ k }: { k: Kitchen }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [cuisine, setCuisine] = useState<CuisineFilter>('all');
  const [onlyReady, setOnlyReady] = useState(false);
  const [quick, setQuick] = useState(false);
  const [liked, setLiked] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const nq = normalize(q);
    return k.recipes
      .filter((r) => TYPE_MATCH[type].includes(r.type))
      .filter((r) => cuisine === 'all' || r.cuisine === cuisine)
      .filter((r) => !quick || (minutesOf(r.time) ?? 999) <= 30)
      .filter((r) => {
        if (!liked) return true;
        const x = reactionsFor(r.id, k.view.ratings);
        return (x.Крис === 'like' || x.Кристина === 'like') && x.Крис !== 'dislike' && x.Кристина !== 'dislike';
      })
      .filter((r) => {
        if (!nq) return true;
        if (normalize(r.name).includes(nq)) return true;
        // Поиск и по продуктам: «фарш» найдёт котлеты.
        return r.ingredients.some((i) => normalize(productLabel(i.p)).includes(nq));
      })
      .map((r) => checkRecipe(r, k.stock))
      .filter((c) => !onlyReady || c.ready)
      .sort((a, b) => Number(b.ready) - Number(a.ready) || a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name, 'ru'));
  }, [k.recipes, k.stock, k.view.ratings, q, type, cuisine, onlyReady, quick, liked]);

  // Новый фильтр — снова первые 20.
  const filterKey = [q, type, cuisine, onlyReady, quick, liked].join('|');
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setShown(PAGE);
  }

  return (
    <>
      <div className="search-row">
        <div className="picker-input">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Блюдо или продукт" />
        </div>
        <button className="square-btn text" onClick={() => setAdding(true)}>
          + Свой
        </button>
      </div>
      <Segmented<TypeFilter>
        small
        value={type}
        options={[
          { value: 'all', label: 'Все' },
          { value: 'breakfast', label: 'Завтрак' },
          { value: 'lunch', label: 'Обед' },
          { value: 'dinner', label: 'Ужин' },
          { value: 'weekend', label: 'Выходные' },
        ]}
        onChange={setType}
      />
      <div className="chips scroll">
        <button className={`chip${onlyReady ? ' on' : ''}`} onClick={() => setOnlyReady((x) => !x)}>
          ✓ можно сейчас
        </button>
        <button className={`chip${quick ? ' on' : ''}`} onClick={() => setQuick((x) => !x)}>
          ⏱ до 30 мин
        </button>
        <button className={`chip${liked ? ' on' : ''}`} onClick={() => setLiked((x) => !x)}>
          👍 любимые
        </button>
        {(
          [
            ['ru', 'русская'],
            ['es', 'испанская'],
            ['world', 'мировая'],
          ] as [CuisineFilter, string][]
        ).map(([v, label]) => (
          <button key={v} className={`chip${cuisine === v ? ' on' : ''}`} onClick={() => setCuisine((c) => (c === v ? 'all' : v))}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">
        {list.length} из {k.recipes.length}
      </p>
      {list.length === 0 && <Empty>Ничего не нашлось.</Empty>}
      <div className="cards">
        {list.slice(0, shown).map((c) => (
          <RecipeCard key={c.recipe.id} check={c} k={k} showAvailability />
        ))}
      </div>
      {list.length > shown && (
        <button className="btn ghost wide" onClick={() => setShown((n) => n + PAGE)}>
          Показать ещё · осталось {list.length - shown}
        </button>
      )}
      {adding && <AddRecipe onClose={() => setAdding(false)} />}
    </>
  );
}

const TYPES = ['завтрак', 'обед', 'ужин', 'выходные', 'запасной'] as const;

function AddRecipe({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('ужин');
  const [cuisine, setCuisine] = useState('');
  const [time, setTime] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [egg, setEgg] = useState(false);

  const preview = parseMyRecipe({ id: 'x', name: name || '—', type, cuisine, time, ingredients, steps, egg });

  const save = () => {
    if (!name.trim()) return;
    mutate({ op: 'myRecipe.upsert', row: { id: 'my_' + newId().slice(0, 8), name: name.trim(), type, cuisine, time, ingredients, steps, egg } });
    toast('Рецепт добавлен');
    onClose();
  };

  return (
    <Sheet
      title="Свой рецепт"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={save} disabled={!name.trim()}>
          Сохранить
        </button>
      }
    >
      <Field label="Название">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Курица по-бабушкиному" />
      </Field>
      <Field label="Когда">
        <Segmented small value={type} options={TYPES.map((t) => ({ value: t, label: t }))} onChange={setType} />
      </Field>
      <Field label="Кухня">
        <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="русская / испанская / другая" />
      </Field>
      <Field label="Время">
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="30 мин" />
      </Field>
      <Field label="Продукты — по одному на строку">
        <textarea
          rows={6}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={'Фарш: 500 г\nЛук: 2\nКурица / индейка: 400 г\nСметана: 3 ст.л. (по желанию)'}
        />
      </Field>
      {preview && preview.ingredients.length > 0 && (
        <p className="muted small">
          Узнал: {preview.ingredients.map((i) => `${productLabel(i.p)}${i.alt?.length ? ' / ' + i.alt.map(productLabel).join(' / ') : ''}${i.opt ? ' (по желанию)' : ''}`).join(', ')}
        </p>
      )}
      <Field label="Шаги — по одному на строку">
        <textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={egg} onChange={(e) => setEgg(e.target.checked)} /> Яйца — главное в блюде (тогда только на завтрак)
      </label>
    </Sheet>
  );
}
