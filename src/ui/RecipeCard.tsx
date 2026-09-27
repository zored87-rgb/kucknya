// Карточка блюда: свёрнута — название и почему предлагаем; раскрыта — продукты, шаги, кнопки.

import { useState } from 'react';
import { newId } from '../api/ops';
import { getState, mutate } from '../api/store';
import { normalize } from '../data/ingredients';
import { PRODUCT_BY_KEY } from '../data/products';
import { formatQty } from '../data/quantity';
import type { Kitchen } from '../hooks/useKitchen';
import type { IngredientCheck, RecipeCheck } from '../logic/availability';
import { reactionsFor } from '../logic/suggest';
import type { Person, Reaction, Recipe } from '../types';
import { CookedSheet } from './CookedSheet';
import { IconCheck, IconSwap } from './icons';
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

function IngredientRow({ c }: { c: IngredientCheck }) {
  const name = productLabel(c.ing.p);
  const q = c.ing.q ? <span className="ing-q">{c.ing.q}</span> : null;
  if (c.have === 'pantry' || c.have === 'enough') {
    return (
      <li className="ing ok">
        <span className="ing-mark">{c.substituted ? <IconSwap /> : <IconCheck />}</span>
        <span className="ing-name">
          {c.substituted ? (
            <>
              {productLabel(c.use!)} <span className="muted">вместо «{name.toLowerCase()}»</span>
            </>
          ) : (
            name
          )}
          {c.have === 'pantry' && <span className="muted"> · кладовая</span>}
          {c.daysLeft != null && c.daysLeft <= 2 && <span className="tag red">скоро испортится</span>}
        </span>
        {q}
      </li>
    );
  }
  if (c.ing.opt) {
    return (
      <li className="ing opt">
        <span className="ing-mark">○</span>
        <span className="ing-name">
          {name} <span className="muted">· по желанию</span>
        </span>
        {q}
      </li>
    );
  }
  return (
    <li className="ing no">
      <span className="ing-mark">✕</span>
      <span className="ing-name">
        {name}
        {c.have === 'short' && <span className="muted"> · маловато</span>}
        {c.ing.alt?.length ? <span className="muted"> · или {c.ing.alt.map((a) => productLabel(a).toLowerCase()).join(', ')}</span> : null}
      </span>
      {q}
    </li>
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
  const r = check.recipe;
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
          <ul className="ings">
            {check.items.map((c, i) => (
              <IngredientRow key={i} c={c} />
            ))}
          </ul>
          {r.tip && <p className="tip">💡 {r.tip}</p>}
          <ol className="steps">
            {r.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="recipe-actions">
            <Reactions recipe={r} k={k} />
            <div className="row-btns">
              {check.missing.length > 0 && (
                <button className="btn ghost" onClick={() => addMissingToShopping(check.missing, r)}>
                  В покупки
                </button>
              )}
              <button className="btn primary" onClick={() => setCooking(true)}>
                Приготовили
              </button>
            </div>
          </div>
        </div>
      )}
      {cooking && <CookedSheet check={check} k={k} defaultMeal={defaultMeal} onClose={() => setCooking(false)} />}
    </article>
  );
}
