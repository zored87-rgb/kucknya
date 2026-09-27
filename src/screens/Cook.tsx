// «Готовим»: что можно приготовить прямо сейчас и чего не хватает одного продукта.

import { useMemo, useState } from 'react';
import type { Kitchen } from '../hooks/useKitchen';
import { EXPIRING_DAYS } from '../logic/availability';
import { daysLeftText } from '../logic/dates';
import { slotForTime, suggest, type Slot } from '../logic/suggest';
import { productEmoji } from '../ui/emoji';
import { Empty, plural, Section, Segmented } from '../ui/kit';
import { productLabel } from '../ui/labels';
import { RecipeCard } from '../ui/RecipeCard';

const SLOT_MEAL: Record<Slot, string> = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин' };
const SHOW = 5;

export function Cook({ k, go }: { k: Kitchen; go: (tab: string) => void }) {
  const [slot, setSlot] = useState<Slot>(() => slotForTime(new Date()));
  const [more, setMore] = useState(false);
  const s = useMemo(() => suggest(slot, k.ctx), [slot, k.ctx]);

  const expiring = [...k.stock.items.values()]
    .filter((i) => i.daysLeft != null && i.daysLeft <= EXPIRING_DAYS)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  const ready = more ? s.ready : s.ready.slice(0, SHOW);
  const h = new Date().getHours();
  const hello = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';

  return (
    <>
      <div className="hero">
        <p className="hero-hello">
          {hello}, {k.me} 👋
        </p>
        <p className="hero-title">
          {s.ready.length ? (
            <>
              Можно приготовить <b>{s.ready.length}</b> {plural(s.ready.length, 'блюдо', 'блюда', 'блюд')}
            </>
          ) : (
            'Дома пока пустовато'
          )}
        </p>
        <p className="hero-sub">
          {k.stock.items.size} {plural(k.stock.items.size, 'продукт', 'продукта', 'продуктов')} дома
          {expiring.length > 0 && ` · ${expiring.length} скоро испортится`}
        </p>
      </div>

      <Segmented<Slot>
        value={slot}
        options={[
          { value: 'breakfast', label: '☀️ Завтрак' },
          { value: 'lunch', label: '🍲 Обед' },
          { value: 'dinner', label: '🌙 Ужин' },
        ]}
        onChange={(v) => {
          setSlot(v);
          setMore(false);
        }}
      />

      {expiring.length > 0 && (
        <div className="expiring">
          <span className="expiring-title">⏳ Скоро испортится — пустим в дело первым</span>
          <div className="expiring-row">
            {expiring.map((i) => (
              <span key={i.key} className={`exp-chip${(i.daysLeft ?? 0) <= 0 ? ' hot' : ''}`}>
                {productEmoji(i.key)} {productLabel(i.key)} <small>{daysLeftText(i.daysLeft!)}</small>
              </span>
            ))}
          </div>
        </div>
      )}

      <Section
        title={slot === 'breakfast' ? 'Завтраки из того, что есть' : 'Из того, что есть'}
        hint={slot === 'breakfast' ? 'Каждый выбирает себе сам.' : undefined}
      >
        {s.ready.length === 0 ? (
          <Empty>
            Полностью из того, что есть, ничего не собрать.
            <br />
            <button className="link" onClick={() => go('buy')}>
              Посмотреть, что купить →
            </button>
          </Empty>
        ) : (
          <div className="cards">
            {ready.map((x, i) => (
              <RecipeCard
                key={x.recipe.id}
                check={x.check}
                reasons={x.reasons}
                k={k}
                defaultMeal={SLOT_MEAL[slot]}
                featured={i === 0 && slot !== 'breakfast'}
              />
            ))}
            {!more && s.ready.length > SHOW && (
              <button className="btn ghost wide" onClick={() => setMore(true)}>
                Ещё {s.ready.length - SHOW}
              </button>
            )}
          </div>
        )}
      </Section>

      {s.almost.length > 0 && (
        <Section title="Не хватает одного продукта" hint="Докупить одно — и готово.">
          <div className="cards">
            {s.almost.slice(0, 8).map((x) => (
              <RecipeCard key={x.recipe.id} check={x.check} reasons={x.reasons} k={k} defaultMeal={SLOT_MEAL[slot]} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
