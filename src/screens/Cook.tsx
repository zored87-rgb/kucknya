// «Готовим»: что можно приготовить прямо сейчас и чего не хватает одного продукта.

import { useMemo, useState } from 'react';
import type { Kitchen } from '../hooks/useKitchen';
import { EXPIRING_DAYS } from '../logic/availability';
import { daysLeftText } from '../logic/dates';
import { slotForTime, suggest, type Slot } from '../logic/suggest';
import { Empty, Section, Segmented } from '../ui/kit';
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

  return (
    <>
      <Segmented<Slot>
        value={slot}
        options={[
          { value: 'breakfast', label: 'Завтрак' },
          { value: 'lunch', label: 'Обед' },
          { value: 'dinner', label: 'Ужин' },
        ]}
        onChange={(v) => {
          setSlot(v);
          setMore(false);
        }}
      />

      {expiring.length > 0 && (
        <div className="banner red">
          <b>Скоро испортится:</b>{' '}
          {expiring.map((i) => `${productLabel(i.key).toLowerCase()} (${daysLeftText(i.daysLeft!)})`).join(', ')}
        </div>
      )}

      <Section
        title={slot === 'breakfast' ? 'Завтраки из того, что есть' : 'Можно приготовить сейчас'}
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
            {ready.map((x) => (
              <RecipeCard key={x.recipe.id} check={x.check} reasons={x.reasons} k={k} defaultMeal={SLOT_MEAL[slot]} />
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
        <Section title="Не хватает одного продукта">
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
