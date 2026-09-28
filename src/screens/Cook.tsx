// «Готовим»: что можно приготовить прямо сейчас и чего не хватает одного продукта.

import { useMemo, useState } from 'react';
import type { Kitchen } from '../hooks/useKitchen';
import { EXPIRING_DAYS } from '../logic/availability';
import { daysLeftText } from '../logic/dates';
import { minutesOf } from '../logic/portions';
import { isLate, slotForTime, suggest, type Scored, type Slot } from '../logic/suggest';
import { dishEmoji, dishTone, productEmoji } from '../ui/emoji';
import { plural, Section, Segmented, Sheet } from '../ui/kit';
import { productLabel } from '../ui/labels';
import { Leftovers } from '../ui/Leftovers';
import { RecipeCard } from '../ui/RecipeCard';

const SLOT_MEAL: Record<Slot, string> = { breakfast: 'завтрак', lunch: 'обед', dinner: 'ужин' };
const SHOW = 5;

export function Cook({ k, go }: { k: Kitchen; go: (tab: string) => void }) {
  const [slot, setSlot] = useState<Slot>(() => slotForTime(new Date()));
  const [more, setMore] = useState(false);
  const [peek, setPeek] = useState<Scored | null>(null);
  const s = useMemo(() => suggest(slot, k.ctx), [slot, k.ctx]);

  const expiring = [...k.stock.items.values()]
    .filter((i) => i.daysLeft != null && i.daysLeft <= EXPIRING_DAYS)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  // Поздно вечером — сначала то, что готовится за 20 минут.
  const late = slot === 'dinner' && isLate(new Date());
  const quick = (x: Scored) => Number((minutesOf(x.recipe.time) ?? 99) <= 20);
  const all = late ? [...s.ready].sort((a, b) => quick(b) - quick(a)) : s.ready;
  const ready = more ? all : all.slice(0, SHOW);
  const h = new Date().getHours();
  const hello = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';

  return (
    <>
      <div className="hero">
        <p className="hero-hello">
          {hello}, {k.me}
        </p>
        <div className="hero-main">
          <span className="hero-num">{s.ready.length}</span>
          <span className="hero-label">{plural(s.ready.length, 'блюдо', 'блюда', 'блюд')} можно
            <br />
            приготовить
          </span>
        </div>
        <div className="hero-stats">
          <span>🧊 {k.stock.items.size} дома</span>
          {expiring.length > 0 && <span>⏳ {expiring.length} скоро {plural(expiring.length, 'испортится', 'испортятся', 'испортятся')}</span>}
          {k.leftoverRows.length > 0 && <span>🍲 {k.leftoverRows.length} доесть</span>}
        </div>
      </div>

      {slot !== 'breakfast' && <Leftovers k={k} />}

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
        <div className="expiring-row">
          {expiring.map((i) => (
            <span key={i.key} className={`exp-chip${(i.daysLeft ?? 0) <= 0 ? ' hot' : ''}`}>
              {productEmoji(i.key)} {productLabel(i.key)} <small>{daysLeftText(i.daysLeft!)}</small>
            </span>
          ))}
        </div>
      )}

      <Section
        title={slot === 'breakfast' ? 'Завтраки' : late ? 'Поздно — сначала быстрое' : 'Из того, что есть'}
      >
        {s.ready.length === 0 ? (
          <div className="empty-hero">
            <span className="empty-emoji">🥡</span>
            <b>Пока ничего не собрать</b>
            <button className="btn ghost" onClick={() => go('buy')}>
              Что купить?
            </button>
          </div>
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
        <Section title="Не хватает одного">
          <div className="carousel">
            {s.almost.slice(0, 10).map((x) => (
              <button key={x.recipe.id} className="mini-dish" onClick={() => setPeek(x)}>
                <span className={`dish-tile ${dishTone(x.recipe.type)}`}>{dishEmoji(x.recipe)}</span>
                <span className="mini-name">{x.recipe.name}</span>
                <span className="mini-need">+ {x.check.missing[0].ing.p}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      {peek && (
        <Sheet title={peek.recipe.name} onClose={() => setPeek(null)}>
          <RecipeCard check={peek.check} reasons={peek.reasons} k={k} defaultMeal={SLOT_MEAL[slot]} defaultOpen bare />
        </Sheet>
      )}
    </>
  );
}
