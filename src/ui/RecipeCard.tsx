// Карточка блюда: свёрнута — название и почему предлагаем; раскрыта — продукты, шаги, кнопки.

import { useMemo, useState } from 'react';
import { newId } from '../api/ops';
import { getState, mutate } from '../api/store';
import { normalize } from '../data/ingredients';
import { PRODUCT_BY_KEY } from '../data/products';
import { formatQty } from '../data/quantity';
import type { Kitchen } from '../hooks/useKitchen';
import { scaledCheck, type IngredientCheck, type RecipeCheck } from '../logic/availability';
import { pantryItems, scaledQty, scaleStep, servingsOf, servingsText, shortNote } from '../logic/portions';
import { reactionsFor } from '../logic/suggest';
import type { Person, Reaction, Recipe } from '../types';
import { CookedSheet } from './CookedSheet';
import { CookMode } from './CookMode';
import { IngredientRow } from './IngredientRow';
import { dishEmoji, dishTone } from './emoji';
import { productLabel } from './labels';
import { toast } from './toast';

/** «1 ч 30 мин, из них 30 активно» → «1 ч 30 мин» — подробности видно в раскрытой карточке. */
function shortTime(t: string): string {
  return t.split(',')[0];
}

const CUISINE: Record<string, string> = { ru: 'русская', es: 'испанская', world: 'мировая' };
const TYPE: Record<string, string> = {
  breakfast: 'завтрак',
  batch_lunch: 'обед',
  dinner: 'ужин',
  weekend: 'выходные',
  backup: 'запасной',
  extra: 'дополнительно',
};

function missingText(c: IngredientCheck, k: Kitchen): string {
  const name = productLabel(c.ing.p);
  if (c.have === 'short' && c.use) {
    const item = k.stock.items.get(c.use);
    const p = PRODUCT_BY_KEY.get(c.use);
    return `мало: ${productLabel(c.use).toLowerCase()} (есть ${formatQty(item?.qty ?? 0, p)}, нужно ${c.ing.q ?? ''})`;
  }
  return name.toLowerCase();
}

export function addMissingToShopping(checks: IngredientCheck[], recipe: Recipe) {
  const existing = new Set(getState().view.shopping.filter((s) => !s.bought).map((s) => normalize(s.name)));
  const ops = checks
    .filter((c) => !existing.has(normalize(productLabel(c.ing.p))))
    .map((c) => ({
      op: 'shopping.upsert' as const,
      row: { id: newId(), name: productLabel(c.ing.p), qty: c.ing.q ?? '', reason: `для «${recipe.name}»`, bought: false },
    }));
  if (ops.length) {
    mutate(ops);
    toast(`В список покупок: ${ops.map((o) => o.row.name.toLowerCase()).join(', ')}`);
  } else toast('Уже в списке покупок');
}

export function setReaction(recipe: Recipe, me: Person, current: Reaction, value: Reaction) {
  mutate({ op: 'rating.set', recipeId: recipe.id, dish: recipe.name, person: me, value: current === value ? '' : value });
}

export function Reactions({ recipe, k }: { recipe: Recipe; k: Kitchen }) {
  const r = reactionsFor(recipe.id, k.view.ratings);
  const other: Person = k.me === 'Крис' ? 'Кристина' : 'Крис';
  const mine = r[k.me];
  return (
    <div className="reactions">
      <button className={`react${mine === 'like' ? ' on' : ''}`} onClick={() => setReaction(recipe, k.me, mine, 'like')} aria-label="Нравится">
        👍
      </button>
      <button className={`react${mine === 'dislike' ? ' on bad' : ''}`} onClick={() => setReaction(recipe, k.me, mine, 'dislike')} aria-label="Не нравится">
        👎
      </button>
      {r[other] && (
        <span className="react-other">
          {other}: {r[other] === 'like' ? '👍' : '👎'}
        </span>
      )}
    </div>
  );
}

export function RecipeCard({
  check,
  reasons = [],
  k,
  defaultMeal,
  showAvailability,
  featured,
  defaultOpen,
  bare,
}: {
  check: RecipeCheck;
  reasons?: string[];
  k: Kitchen;
  defaultMeal?: string;
  showAvailability?: boolean;
  /** Первая, главная рекомендация — крупнее. */
  featured?: boolean;
  defaultOpen?: boolean;
  /** Без рамки карточки — внутри шторки. */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [cooking, setCooking] = useState(false);
  const [mode, setMode] = useState(false);
  const [scale, setScale] = useState(1);
  const r = check.recipe;
  // Под ×½ / ×2 заново проверяем, чего хватает.
  const sc = useMemo(() => scaledCheck(check, k.stock, scale), [check, k.stock, scale]);
  const react = reactionsFor(r.id, k.view.ratings);
  const disliked = react.Крис === 'dislike' || react.Кристина === 'dislike';

  return (
    <article className={`${bare ? 'recipe bare' : 'card recipe'}${open ? ' open' : ''}${disliked ? ' disliked' : ''}${featured ? ' featured' : ''}`}>
      <button className="recipe-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`dish-tile ${dishTone(r.type)}`} aria-hidden>
          {dishEmoji(r)}
        </span>
        <div className="recipe-title">
          {featured && <span className="eyebrow">Советуем</span>}
          <h4>{r.name}</h4>
          <div className="recipe-meta">
            <span>⏱ {shortTime(r.time)}</span>
            {r.cuisine && <span>{CUISINE[r.cuisine]}</span>}
            {(react.Крис === 'like' || react.Кристина === 'like') && <span>👍</span>}
            {disliked && <span>👎</span>}
            {r.custom && <span>мой</span>}
          </div>
          {reasons.length > 0 && (
            <div className="reasons">
              {reasons.slice(0, 1).map((x) => (
                <span key={x} className={`tag${x.startsWith('спасает') ? ' red' : x.startsWith('👍') ? ' green' : ''}`}>
                  {x}
                </span>
              ))}
            </div>
          )}
          {check.missing.length > 0 && (
            <div className="missing">Нет: {check.missing.map((m) => missingText(m, k)).join(', ')}</div>
          )}
        </div>
        {showAvailability && <span className={`badge ${check.ready ? 'ok' : ''}`}>{check.ready ? 'можно' : `нет ${check.missing.length}`}</span>}
        <span className="chev" aria-hidden>
          ›
        </span>
      </button>

      {open && (
        <div className="recipe-body">
          <div className="muted small">
            ⏱ {r.time} · {TYPE[r.type]}
            {r.origin ? ` · ${r.origin}` : ''}
            {r.cost_eur_for_two ? ` · ~${r.cost_eur_for_two} € на двоих` : ''}
          </div>
          <Portions r={r} scale={scale} setScale={setScale} />
          <ShortNotice check={sc} k={k} scale={scale} setScale={setScale} />
          <ul className="ings">
            {sc.items.map((c, i) =>
              c.have === 'pantry' ? null : <IngredientRow key={i} c={c} qText={scaledQty(c.ing, scale)} />,
            )}
          </ul>
          <PantryLine check={sc} scale={scale} />
          {r.tip && <p className="tip">💡 {r.tip}</p>}
          <ol className="steps">
            {r.steps.map((s, i) => (
              <li key={i}>{scaleStep(s, scale)}</li>
            ))}
          </ol>
          <div className="recipe-actions">
            <Reactions recipe={r} k={k} />
            <div className="row-btns">
              {sc.missing.length > 0 && (
                <button className="btn ghost" onClick={() => addMissingToShopping(sc.missing, r)}>
                  В покупки
                </button>
              )}
              <button className="btn ghost" onClick={() => setCooking(true)}>
                Приготовили
              </button>
              <button className="btn primary" onClick={() => setMode(true)}>
                ▶ Готовить
              </button>
            </div>
          </div>
        </div>
      )}
      {mode && (
        <CookMode
          check={sc}
          scale={scale}
          onClose={() => setMode(false)}
          onDone={() => {
            setMode(false);
            setCooking(true);
          }}
        />
      )}
      {cooking && <CookedSheet check={sc} k={k} defaultMeal={defaultMeal} scale={scale} onClose={() => setCooking(false)} />}
    </article>
  );
}

const SCALES: [number, string][] = [
  [0.5, '×½'],
  [1, '×1'],
  [2, '×2'],
];

/** «🍽 2 порции» и кнопки ×½ / ×1 / ×2 — пересчитывают граммы и штуки. */
export function Portions({ r, scale, setScale }: { r: Recipe; scale: number; setScale: (n: number) => void }) {
  const n = servingsOf(r) * scale;
  return (
    <div className="portions-row">
      <span className="portions-text">{servingsText(n)}</span>
      <div className="scale-btns" role="group" aria-label="Сколько готовить">
        {SCALES.map(([v, label]) => (
          <button key={v} className={scale === v ? 'on' : ''} onClick={() => setScale(v)} aria-pressed={scale === v}>
            {label}
          </button>
        ))}
        {!SCALES.some(([v]) => v === scale) && (
          <button className="on" aria-pressed>
            ×{String(scale).replace('.', ',')}
          </button>
        )}
      </div>
    </div>
  );
}

/** «Есть 250 из 400 г курицы — остального клади в ~1.6 раза меньше». */
export function ShortNotice({ check, k, scale, setScale }: { check: RecipeCheck; k: Kitchen; scale: number; setScale: (n: number) => void }) {
  const note = shortNote(check.items, k.stock, scale);
  if (!note) return null;
  const p = PRODUCT_BY_KEY.get(note.key);
  const have = formatQty(note.have, p);
  const need = formatQty(note.need, p);
  return (
    <div className="short-note">
      <p>
        {productLabel(note.key)}: есть {have} из {need}. Остального клади в ~{String(note.times).replace('.', ',')} раза меньше.
      </p>
      <button className="btn ghost small" onClick={() => setScale(note.fit)}>
        Пересчитать под то, что есть
      </button>
    </div>
  );
}

/** «🧂 Из кладовой: соль, перец, масло» — проверить до начала. */
export function PantryLine({ check, scale }: { check: RecipeCheck; scale: number }) {
  const items = pantryItems(check.items, check.recipe.steps, scale);
  if (!items.length) return null;
  return (
    <p className="pantry-line">
      <span aria-hidden>🧂 </span>
      <b>Из кладовой:</b> {items.map((x) => productLabel(x.key).toLowerCase() + (x.q ? ` (${x.q})` : '')).join(', ')}
    </p>
  );
}
