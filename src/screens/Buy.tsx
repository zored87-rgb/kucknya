// «Купить»: три вкладки — список, идеи (что откроет блюда, давно не ели, неделя), деньги (чеки и цены).

import { useMemo, useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { getState, mutate } from '../api/store';
import { matchProduct, normalize } from '../data/ingredients';
import type { Kitchen } from '../hooks/useKitchen';
import { basket, keyBuys, longNotEaten, mealRecipes } from '../logic/keyBuys';
import { closedReason } from '../logic/mercadona';
import { cheapestAdvice, estimateList, money, OCU_2026, pricesFor, spending } from '../logic/money';
import { addDays, formatDate, parseDate, toIso } from '../logic/dates';
import type { Product, ReceiptRow, ShoppingRow } from '../types';
import { dishEmoji, dishTone, productEmoji } from '../ui/emoji';
import { Field, plural, Section, Segmented, Sheet } from '../ui/kit';
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

type BuyTab = 'list' | 'ideas' | 'money';

export function Buy({ k }: { k: Kitchen }) {
  const [tab, setTab] = useState<BuyTab>('list');
  const [toFridge, setToFridge] = useState<{ draft: ProductDraft; item: ShoppingRow } | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [showBought, setShowBought] = useState(false);
  const prices = k.view.prices ?? [];
  const receipts = k.view.receipts ?? [];
  const spent = useMemo(() => spending(receipts, k.today), [receipts, k.today]);
  const meals = useMemo(() => mealRecipes(k.recipes, k.view.ratings), [k.recipes, k.view.ratings]);
  const top = useMemo(() => keyBuys(meals, k.stock, 6), [meals, k.stock]);
  const cart = useMemo(() => basket(meals, k.stock), [meals, k.stock]);
  const missed = useMemo(() => longNotEaten(k.recipes, k.view.ratings, k.history, k.stock), [k.recipes, k.view.ratings, k.history, k.stock]);

  const list = k.view.shopping;
  const pending = list.filter((s) => !s.bought);
  const bought = list.filter((s) => s.bought);
  const inList = new Set(pending.map((p) => normalize(p.name)));
  const names = pending.map((p) => p.name);
  const estimate = estimateList(names);
  const closed = closedNote(new Date(), k.holidays);

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
      {closed && <div className="notice">🔒 {closed}</div>}

      <Segmented<BuyTab>
        value={tab}
        options={[
          { value: 'list', label: pending.length ? `Список · ${pending.length}` : 'Список' },
          { value: 'ideas', label: 'Идеи' },
          { value: 'money', label: 'Деньги' },
        ]}
        onChange={setTab}
      />

      {tab === 'list' && (
        <>
          <ProductPicker placeholder="Что купить…" onPick={(p: Product) => addItem(productLabel(p.key))} onRaw={addItem} />

          {pending.length === 0 ? (
            <div className="empty-hero">
              <span className="empty-emoji">🧺</span>
              <b>Список пуст</b>
              <button className="btn ghost" onClick={() => setTab('ideas')}>
                Что купить?
              </button>
            </div>
          ) : (
            <>
              <div className="chip-row">
                {estimate.known > 0 && <span className="chip static">≈ {money(estimate.total)}</span>}
                <StorePlan names={names} prices={prices} />
              </div>
              <ul className="list">
                {pending.map((s) => (
                  <li key={s.id} className="item">
                    <label className="check big">
                      <input type="checkbox" checked={false} onChange={() => toggle(s)} />
                      <span className="item-emoji small" aria-hidden>
                        {productEmoji(matchProduct(s.name)?.product.key)}
                      </span>
                      <span className="item-main static">
                        <span className="item-name">{s.name}</span>
                        <PriceHint name={s.name} prices={prices} />
                      </span>
                    </label>
                    <button className="icon-btn" aria-label="Удалить" onClick={() => mutate({ op: 'shopping.delete', id: s.id })}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {bought.length > 0 && (
            <div className="row-between">
              <button className="link" onClick={() => setShowBought((x) => !x)}>
                Куплено · {bought.length} {showBought ? '▴' : '▾'}
              </button>
              <button className="link muted" onClick={() => mutate(bought.map((s) => ({ op: 'shopping.delete', id: s.id }) as OpBody))}>
                Очистить
              </button>
            </div>
          )}
          {showBought && bought.length > 0 && (
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
          )}
        </>
      )}

      {tab === 'ideas' && (
        <>
          {top.length > 0 && (
            <Section title="Откроют блюда">
              <div className="tiles">
                {top.map((t) => {
                  const name = productLabel(t.key);
                  const added = inList.has(normalize(name));
                  return (
                    <button
                      key={t.key}
                      className={`tile${added ? ' added' : ''}`}
                      onClick={() => addToList([name], `+${t.unlocks.length} ${plural(t.unlocks.length, 'блюдо', 'блюда', 'блюд')}`)}
                      title={t.unlocks.map((r) => r.name).join(', ')}
                    >
                      <span className="tile-emoji">{productEmoji(t.key)}</span>
                      <span className="tile-name">{name}</span>
                      <span className="tile-num">
                        +{t.unlocks.length}
                        <small>{plural(t.unlocks.length, 'блюдо', 'блюда', 'блюд')}</small>
                      </span>
                      <span className="tile-add">{added ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {cart.steps.length > 0 && (
            <Section title="Корзина из 5">
            <section className="card basket-card">
              <div className="basket-head">
                <span className="basket-from">{cart.before}</span>
                <span className="basket-arrow">→</span>
                <span className="basket-to">{cart.steps[cart.steps.length - 1].readyAfter}</span>
                <span className="muted small">{plural(cart.steps[cart.steps.length - 1].readyAfter, 'блюдо', 'блюда', 'блюд')}</span>
              </div>
              <div className="chip-row">
                {cart.steps.map((st) => (
                  <span key={st.key} className="chip static">
                    {productEmoji(st.key)} {productLabel(st.key)}
                  </span>
                ))}
              </div>
              <button className="btn primary wide" onClick={() => addToList(cart.steps.map((s) => productLabel(s.key)), 'корзина')}>
                Корзину в список
              </button>
            </section>
            </Section>
          )}

          {missed.length > 0 && (
            <Section title="Давно не ели">
              <div className="carousel">
                {missed.slice(0, 10).map((m) => (
                  <button
                    key={m.recipe.id}
                    className="mini-dish"
                    onClick={() => (m.check.ready ? toast(`${m.recipe.name}: всё есть, можно готовить`) : addMissingToShopping(m.check.missing, m.recipe))}
                  >
                    <span className={`dish-tile ${dishTone(m.recipe.type)}`}>{dishEmoji(m.recipe)}</span>
                    <span className="mini-name">{m.recipe.name}</span>
                    <span className="mini-sub">{m.check.ready ? '✓ всё есть' : m.daysAgo == null ? 'ещё не ели' : `${m.daysAgo} дн.`}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Неделя">
            <div className="stats">
              <div className={`stat ${wk.fish >= 1 ? 'good' : 'warn'}`}>
                <span className="stat-emoji">🐟</span>
                <b>{wk.fish}</b>
                <span>рыба</span>
              </div>
              <div className={`stat ${wk.meals && wk.veggy / wk.meals >= 0.5 ? 'good' : 'warn'}`}>
                <span className="stat-emoji">🥦</span>
                <b>
                  {wk.veggy}/{wk.meals}
                </b>
                <span>овощи</span>
              </div>
              <div className={`stat ${wk.redMeat <= 3 ? 'good' : 'warn'}`}>
                <span className="stat-emoji">🥩</span>
                <b>{wk.redMeat}</b>
                <span>красное</span>
              </div>
            </div>
          </Section>
        </>
      )}

      {tab === 'money' && (
        <>
          <button className="btn primary wide" onClick={() => setReceipt(true)}>
            🧾 Записать чек
          </button>
          <div className="stats">
            <div className="stat">
              <b>{money(spent.week)}</b>
              <span>неделя</span>
            </div>
            <div className="stat">
              <b>{money(spent.month)}</b>
              <span>месяц</span>
            </div>
            <div className="stat">
              <b>{money(spent.avgWeek)}</b>
              <span>в среднем</span>
            </div>
          </div>
          {spent.byStore.length > 0 && (
            <Section title="Магазины">
              <ul className="list">
                {spent.byStore.map((b) => (
                  <li key={b.store} className="item">
                    <span className="item-main static">
                      <span className="item-name">{b.store}</span>
                      <span className="item-sub">× {b.count}</span>
                    </span>
                    <b>{money(b.total)}</b>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {receipts.length > 0 && (
            <Section title="Чеки">
              <RecentReceipts receipts={receipts} />
            </Section>
          )}
          <div className="ocu">
            <span className="muted small">Индекс цен OCU 2026 · меньше — дешевле</span>
            <div className="chip-row">
              {(['Mercadona', 'Carrefour Market', 'Carrefour', 'Carrefour Express'] as const).map((s) => (
                <span key={s} className="chip static">
                  {s} <b>{OCU_2026[s]}</b>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {receipt && <ReceiptSheet stores={k.stores} onClose={() => setReceipt(false)} />}
      {toFridge && (
        <ProductForm
          initial={toFridge.draft}
          title={`Купил: ${toFridge.item.name}`}
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

/** Короткое «Mercadona закрыт сегодня · воскресенье» или null. */
function closedNote(now: Date, holidays: Kitchen['holidays']): string | null {
  const today = closedReason(now, holidays);
  if (today) return `Mercadona закрыт сегодня · ${today}`;
  const tomorrow = closedReason(addDays(now, 1), holidays);
  if (tomorrow) return `Завтра Mercadona закрыт · ${tomorrow}`;
  return null;
}

/** «Carrefour −12%» или «≈ 3,20 €» — одной строкой. */
function PriceHint({ name, prices }: { name: string; prices: Parameters<typeof pricesFor>[1] }) {
  const advice = cheapestAdvice(name, prices);
  if (advice) {
    const c = advice.cheapest;
    return (
      <span className="advice">
        {c.store} · {money(c.price)} · −{advice.savePct}%
      </span>
    );
  }
  const one = pricesFor(name, prices)[0];
  if (!one) return null;
  return (
    <span className="advice muted">
      ≈ {money(one.price)}
      {one.per ? ` · ${one.per.replace(/\s*\(.*\)/, '')}` : ''}
    </span>
  );
}

/** Какой магазин выгоднее для списка — чипами. */
function StorePlan({ names, prices }: { names: string[]; prices: Parameters<typeof pricesFor>[1] }) {
  const byStore = new Map<string, number>();
  for (const n of names) {
    const a = cheapestAdvice(n, prices);
    if (a) byStore.set(a.cheapest.store, (byStore.get(a.cheapest.store) ?? 0) + 1);
  }
  return (
    <>
      {[...byStore.entries()].map(([store, n]) => (
        <span key={store} className="chip static green">
          {store} выгоднее · {n}
        </span>
      ))}
    </>
  );
}

function RecentReceipts({ receipts }: { receipts: ReceiptRow[] }) {
  const recent = [...receipts].sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0)).slice(0, 5);
  return (
    <ul className="list compact">
      {recent.map((r) => (
        <li key={r.id} className="item">
          <span className="item-emoji" aria-hidden>
            🧾
          </span>
          <span className="item-main static">
            <span className="item-name">{r.store}</span>
            <span className="item-sub">
              {r.date}
              {r.note && ` · ${r.note}`}
            </span>
          </span>
          <b>{money(parseFloat(String(r.total).replace(',', '.')) || 0)}</b>
          <button
            className="icon-btn"
            aria-label="Удалить чек"
            onClick={() => {
              mutate({ op: 'receipt.delete', id: r.id });
              toast('Чек удалён', () => mutate({ op: 'receipt.upsert', row: r }));
            }}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReceiptSheet({ stores, onClose }: { stores: string[]; onClose: () => void }) {
  const [store, setStore] = useState(stores[0]);
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(toIso(new Date()));
  const [note, setNote] = useState('');
  const value = parseFloat(total.replace(',', '.'));
  const save = () => {
    if (isNaN(value) || value <= 0) return;
    mutate({
      op: 'receipt.upsert',
      row: { id: newId(), date: formatDate(parseDate(date) ?? new Date()), store, total: value.toFixed(2), note: note.trim() },
    });
    toast(`Чек записан: ${money(value)} в ${store}`);
    onClose();
  };
  return (
    <Sheet
      title="Чек из магазина"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={save} disabled={isNaN(value) || value <= 0}>
          Записать
        </button>
      }
    >
      <Field label="Магазин">
        <Segmented small value={store} options={stores.map((s) => ({ value: s, label: s }))} onChange={setStore} />
      </Field>
      <Field label="Сумма по чеку, €">
        <input className="big-input" value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus />
      </Field>
      <Field label="Когда">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Заметка">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="на неделю, к празднику…" />
      </Field>
    </Sheet>
  );
}

