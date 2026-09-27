// «Купить»: список покупок, какие продукты откроют больше блюд, что давно не ели, баланс недели.

import { useMemo, useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { getState, mutate } from '../api/store';
import { matchProduct, normalize } from '../data/ingredients';
import type { Kitchen } from '../hooks/useKitchen';
import { basket, keyBuys, longNotEaten, mealRecipes } from '../logic/keyBuys';
import { mercadonaWarning } from '../logic/mercadona';
import type { Product, ShoppingRow } from '../types';
import { Empty, plural, Section } from '../ui/kit';
import { productLabel } from '../ui/labels';
import { draftFor, ProductForm, type ProductDraft } from '../ui/ProductForm';
import { ProductPicker } from '../ui/ProductPicker';
import { addMissingToShopping } from '../ui/RecipeCard';
import { toast } from '../ui/toast';

function addToList(names: string[], reason: string) {
  const existing = new Set(getState().view.shopping.filter((s) => !s.bought).map((s) => normalize(s.name)));
  const ops: OpBody[] = names
    .filter((n) => !existing.has(normalize(n)))
    .map((name) => ({ op: 'shopping.upsert', row: { id: newId(), name, qty: '', reason, bought: false } }));
  if (ops.length) {
    mutate(ops);
    toast(`В списке: ${names.map((n) => n.toLowerCase()).join(', ')}`);
  } else toast('Уже в списке');
}

export function Buy({ k }: { k: Kitchen }) {
  const [toFridge, setToFridge] = useState<{ draft: ProductDraft; item: ShoppingRow } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const warning = mercadonaWarning(new Date(), k.holidays);
  const meals = useMemo(() => mealRecipes(k.recipes, k.view.ratings), [k.recipes, k.view.ratings]);
  const top = useMemo(() => keyBuys(meals, k.stock), [meals, k.stock]);
  const cart = useMemo(() => basket(meals, k.stock), [meals, k.stock]);
  const missed = useMemo(() => longNotEaten(k.recipes, k.view.ratings, k.history, k.stock), [k.recipes, k.view.ratings, k.history, k.stock]);

  const list = k.view.shopping;
  const pending = list.filter((s) => !s.bought);
  const bought = list.filter((s) => s.bought);

  const toggle = (item: ShoppingRow) => {
    if (item.bought) {
      mutate({ op: 'shopping.upsert', row: { id: item.id, bought: false } });
      return;
    }
    // Купил — сразу предложить положить в холодильник.
    const match = matchProduct(item.name)?.product;
    setToFridge({ draft: draftFor(match, item.name), item });
  };

  const addItem = (name: string) => {
    mutate({ op: 'shopping.upsert', row: { id: newId(), name, qty: '', reason: '', bought: false } });
  };

  const wk = k.history.week;

  return (
    <>
      {warning && <div className="banner yellow">🛒 {warning}</div>}

      <Section title="Список покупок">
        <ProductPicker placeholder="Что купить…" onPick={(p: Product) => addItem(productLabel(p.key))} onRaw={addItem} />
        {pending.length === 0 && bought.length === 0 && <Empty>Список пуст. Ниже — что стоит купить.</Empty>}
        {pending.length > 0 && (
        <ul className="list">
          {pending.map((s) => (
            <li key={s.id} className="item">
              <label className="check big">
                <input type="checkbox" checked={false} onChange={() => toggle(s)} />
                <span>
                  <b>{s.name}</b>
                  {s.qty && <span className="muted"> · {s.qty}</span>}
                  {s.reason && <span className="item-sub muted">{s.reason}</span>}
                </span>
              </label>
              <button className="icon-btn" aria-label="Удалить" onClick={() => mutate({ op: 'shopping.delete', id: s.id })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        )}
        {bought.length > 0 && (
          <>
            <ul className="list">
              {bought.map((s) => (
                <li key={s.id} className="item off">
                  <label className="check big">
                    <input type="checkbox" checked onChange={() => toggle(s)} />
                    <span>
                      <s>{s.name}</s>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button className="btn ghost wide" onClick={() => mutate(bought.map((s) => ({ op: 'shopping.delete', id: s.id }) as OpBody))}>
              Убрать купленное
            </button>
          </>
        )}
      </Section>

      <Section title="Купи — и откроются блюда" hint="Сколько новых блюд станет можно приготовить, если купить только этот продукт.">
        {top.length === 0 ? (
          <Empty>Одной покупкой новых блюд не открыть — смотри корзину ниже.</Empty>
        ) : (
          <ul className="list">
            {top.map((t) => (
              <li key={t.key} className="item column">
                <div className="item-row">
                  <button className="item-main" onClick={() => setOpenKey(openKey === t.key ? null : t.key)}>
                    <span className="item-name">
                      {productLabel(t.key)} → откроется {t.unlocks.length} {plural(t.unlocks.length, 'блюдо', 'блюда', 'блюд')}
                    </span>
                    <span className="item-sub">нажми, чтобы увидеть какие</span>
                  </button>
                  <button className="pill" onClick={() => addToList([productLabel(t.key)], `откроет ${t.unlocks.length} ${plural(t.unlocks.length, 'блюдо', 'блюда', 'блюд')}`)}>
                    в список
                  </button>
                </div>
                {openKey === t.key && <p className="muted small">{t.unlocks.map((r) => r.name).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {cart.steps.length > 0 && (
        <Section title="Корзина на 5 продуктов" hint={`Сейчас можно приготовить ${cart.before} ${plural(cart.before, 'блюдо', 'блюда', 'блюд')} (обеды и ужины).`}>
          <ol className="basket">
            {cart.steps.map((st) => (
              <li key={st.key}>
                <span>{productLabel(st.key)}</span>
                <span className="muted">→ {st.readyAfter} {plural(st.readyAfter, 'блюдо', 'блюда', 'блюд')}</span>
              </li>
            ))}
          </ol>
          <button className="btn ghost wide" onClick={() => addToList(cart.steps.map((s) => productLabel(s.key)), 'корзина')}>
            Всё в список
          </button>
        </Section>
      )}

      <Section title="Давно не ели" hint="То, что вам нравится (👍), и чего не было 10+ дней.">
        {missed.length === 0 ? (
          <Empty>Ставьте 👍 блюдам — и здесь появятся любимые, о которых давно не вспоминали.</Empty>
        ) : (
          <ul className="list">
            {missed.slice(0, 10).map((m) => (
              <li key={m.recipe.id} className="item column">
                <div className="item-row">
                  <div className="item-main static">
                    <span className="item-name">{m.recipe.name}</span>
                    <span className="item-sub">
                      <span>{m.daysAgo == null ? 'ещё не ели' : `не ели ${m.daysAgo} дн.`}</span>
                      {m.check.ready ? (
                        <span className="green">можно приготовить сейчас</span>
                      ) : (
                        <span className="muted">нет: {m.check.missing.map((x) => productLabel(x.ing.p).toLowerCase()).join(', ')}</span>
                      )}
                    </span>
                  </div>
                  {!m.check.ready && (
                    <button className="pill" onClick={() => addMissingToShopping(m.check.missing, m.recipe)}>
                      в список
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Баланс недели" hint="Обеды и ужины за последние 7 дней. Подсказки учитываются в «Готовим».">
        <div className="stats">
          <div className={`stat ${wk.fish >= 1 ? 'good' : 'warn'}`}>
            <b>{wk.fish}</b>
            <span>рыба</span>
            <small>{wk.fish >= 1 ? 'норма: раз в неделю' : 'на неделе не было'}</small>
          </div>
          <div className={`stat ${wk.meals && wk.veggy / wk.meals >= 0.5 ? 'good' : 'warn'}`}>
            <b>
              {wk.veggy}/{wk.meals}
            </b>
            <span>с овощами</span>
            <small>хорошо — половина и больше</small>
          </div>
          <div className={`stat ${wk.redMeat <= 3 ? 'good' : 'warn'}`}>
            <b>{wk.redMeat}</b>
            <span>красное мясо</span>
            <small>до 3 раз в неделю</small>
          </div>
        </div>
      </Section>

      {toFridge && (
        <ProductForm
          initial={toFridge.draft}
          title={`Купил: ${toFridge.item.name} — в холодильник?`}
          onClose={() => {
            // Даже если в холодильник не положили — отметить купленным.
            mutate({ op: 'shopping.upsert', row: { id: toFridge.item.id, bought: true } });
            setToFridge(null);
          }}
        />
      )}
    </>
  );
}
