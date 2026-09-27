// «Купить»: список покупок, какие продукты откроют больше блюд, что давно не ели, баланс недели.

import { useMemo, useState } from 'react';
import { newId, type OpBody } from '../api/ops';
import { getState, mutate } from '../api/store';
import { matchProduct, normalize } from '../data/ingredients';
import type { Kitchen } from '../hooks/useKitchen';
import { basket, keyBuys, longNotEaten, mealRecipes } from '../logic/keyBuys';
import { mercadonaWarning } from '../logic/mercadona';
import { cheapestAdvice, estimateList, money, OCU_2026, pricesFor, spending } from '../logic/money';
import { formatDate, parseDate, toIso } from '../logic/dates';
import type { Product, ReceiptRow, ShoppingRow } from '../types';
import { productEmoji } from '../ui/emoji';
import { Empty, Field, plural, Section, Segmented, Sheet } from '../ui/kit';
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
  const [receipt, setReceipt] = useState(false);
  const prices = k.view.prices ?? [];
  const receipts = k.view.receipts ?? [];
  const spent = useMemo(() => spending(receipts, k.today), [receipts, k.today]);
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
        <StorePlan names={pending.map((p) => p.name)} prices={prices} />
        <ListEstimate names={pending.map((p) => p.name)} />
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
                  <PriceHint name={s.name} prices={prices} />
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
                      {productEmoji(t.key)} {productLabel(t.key)} → откроется {t.unlocks.length} {plural(t.unlocks.length, 'блюдо', 'блюда', 'блюд')}
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
                <span>
                  {productEmoji(st.key)} {productLabel(st.key)}
                </span>
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

      <Section
        title="💶 Расходы"
        hint={
          <>
            Записывайте сумму по чеку — увидите, сколько уходит на еду и где. В среднем по стране (OCU 2026, меньше — дешевле):
            Mercadona {OCU_2026.Mercadona}, Carrefour {OCU_2026.Carrefour}, Carrefour Market {OCU_2026['Carrefour Market']}, Carrefour Express{' '}
            {OCU_2026['Carrefour Express']}. Kuups в исследовании нет — сравним по вашим ценам.
          </>
        }
        action={
          <button className="pill accent" onClick={() => setReceipt(true)}>
            + чек
          </button>
        }
      >
        <div className="stats">
          <div className="stat">
            <b>{money(spent.week)}</b>
            <span>за 7 дней</span>
            <small>в среднем {money(spent.avgWeek)}/нед.</small>
          </div>
          <div className="stat">
            <b>{money(spent.month)}</b>
            <span>в этом месяце</span>
            <small>прошлый: {money(spent.prevMonth)}</small>
          </div>
          <div className="stat">
            <b>{receipts.length}</b>
            <span>{plural(receipts.length, 'чек', 'чека', 'чеков')}</span>
            <small>всего записано</small>
          </div>
        </div>
        {spent.byStore.length > 0 && (
          <ul className="list compact">
            {spent.byStore.map((b) => (
              <li key={b.store} className="item">
                <span className="item-main static">
                  <span className="item-name">{b.store}</span>
                  <span className="item-sub">
                    {b.count} {plural(b.count, 'поход', 'похода', 'походов')} в этом месяце
                  </span>
                </span>
                <b>{money(b.total)}</b>
              </li>
            ))}
          </ul>
        )}
        {receipts.length > 0 && <RecentReceipts receipts={receipts} />}
      </Section>

      <Section title="Баланс недели" hint="Обеды и ужины за последние 7 дней. Подсказки учитываются в «Готовим».">
        <div className="stats">
          <div className={`stat ${wk.fish >= 1 ? 'good' : 'warn'}`}>
            <b>{wk.fish}</b>
            <span>🐟 рыба</span>
            <small>{wk.fish >= 1 ? 'норма: раз в неделю' : 'на неделе не было'}</small>
          </div>
          <div className={`stat ${wk.meals && wk.veggy / wk.meals >= 0.5 ? 'good' : 'warn'}`}>
            <b>
              {wk.veggy}/{wk.meals}
            </b>
            <span>🥦 с овощами</span>
            <small>хорошо — половина и больше</small>
          </div>
          <div className={`stat ${wk.redMeat <= 3 ? 'good' : 'warn'}`}>
            <b>{wk.redMeat}</b>
            <span>🥩 красное мясо</span>
            <small>до 3 раз в неделю</small>
          </div>
        </div>
      </Section>

      {receipt && <ReceiptSheet stores={k.stores} onClose={() => setReceipt(false)} />}
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

/** «💡 дешевле в Carrefour: 3,99 € (−12%)» — по ценам, которые вы записывали. */
function PriceHint({ name, prices }: { name: string; prices: Parameters<typeof pricesFor>[1] }) {
  const advice = cheapestAdvice(name, prices);
  if (advice) {
    const c = advice.cheapest;
    return (
      <span className="advice">
        💡 дешевле в {c.store}: {money(c.price)}
        {c.per ? ` за ${c.per}` : ''} (−{advice.savePct}%)
      </span>
    );
  }
  const one = pricesFor(name, prices)[0];
  if (!one) return null;
  return (
    <span className="advice muted">
      {one.ref ? '≈' : 'было'} {money(one.price)}
      {one.per ? ` за ${one.per}` : ''} в {one.store}
    </span>
  );
}

/** Какие покупки выгоднее в каком магазине. */
function StorePlan({ names, prices }: { names: string[]; prices: Parameters<typeof pricesFor>[1] }) {
  const byStore = new Map<string, string[]>();
  for (const n of names) {
    const a = cheapestAdvice(n, prices);
    if (a) byStore.set(a.cheapest.store, [...(byStore.get(a.cheapest.store) ?? []), n.toLowerCase()]);
  }
  if (!byStore.size) return null;
  return (
    <div className="banner green">
      🛍{' '}
      {[...byStore.entries()].map(([store, list], i) => (
        <span key={store}>
          {i > 0 && '; '}
          в <b>{store}</b> выгоднее: {list.join(', ')}
        </span>
      ))}
    </div>
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

/** «Список ≈ 18 € в Mercadona» — по справочным ценам, по одной упаковке. */
function ListEstimate({ names }: { names: string[] }) {
  if (!names.length) return null;
  const e = estimateList(names);
  if (!e.known) return null;
  return (
    <p className="muted small">
      🧮 Примерно {money(e.total)} в Mercadona
      {e.unknown > 0 && ` + ещё ${e.unknown} без цены`} — по одной упаковке, цены сайта Mercadona на 27.09.2026.
    </p>
  );
}
