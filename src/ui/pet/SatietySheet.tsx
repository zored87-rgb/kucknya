// «Как ты сейчас?» — ручная отметка сытости. Гера запоминает и подстраивает темп голода под тебя.

import { useState } from 'react';
import { mutate } from '../../api/store';
import type { Kitchen } from '../../hooks/useKitchen';
import { gainOf, kcalOf } from '../../logic/kcal';
import { calibrate, lastMealAt, mealTime, metabolismOf } from '../../logic/pet';
import type { EatenRow } from '../../types';
import { Sheet } from '../kit';
import { toast } from '../toast';
import { MoodFace } from './icons';
import { setPet, usePet } from './petStore';

const LEVELS: [number, 0 | 1 | 2 | 3 | 4, string][] = [
  [5, 0, 'Очень голоден'],
  [28, 1, 'Голоден'],
  [52, 2, 'Так себе'],
  [80, 3, 'Сыт'],
  [100, 4, 'Объелся'],
];

export function SatietySheet({ k, myEaten, sat, streak = 0, onClose }: { k: Kitchen; myEaten: EatenRow[]; sat: number; streak?: number; onClose: () => void }) {
  const pet = usePet();
  const [value, setValue] = useState(sat);
  const m = metabolismOf(k.me, pet.metab);
  const gain = (row: EatenRow) => gainOf(kcalOf(row, k.recipes, pet.kcal), k.me);
  // Последняя еда: что это было и сколько сытости дало
  const lastAt = lastMealAt(myEaten, pet.fed, Date.now());
  const lastRow = lastAt != null ? myEaten.find((r) => Math.min(mealTime(r, pet.fed) ?? 0, Date.now()) === lastAt) : undefined;
  const lastKcal = lastRow ? Math.round(kcalOf(lastRow, k.recipes, pet.kcal) / 10) * 10 : 0;

  const save = (v: number) => {
    const next = calibrate(myEaten, pet.fed, Date.now(), v, m, gain);
    setPet({ metab: next });
    // Скрипт таблицы умеет хранить — партнёр увидит мою сытость
    if (k.view.settings.pets !== undefined) mutate({ op: 'pet.set', person: k.me, data: next });
    toast(next.n > m.n ? 'Запомнил — буду точнее угадывать твой голод' : 'Запомнил');
    onClose();
  };

  return (
    <Sheet
      title="Как ты сейчас?"
      onClose={onClose}
      footer={
        <button className="btn primary wide" onClick={() => save(value)}>
          Запомнить · {value}%
        </button>
      }
    >
      <div className="sat-levels">
        {LEVELS.map(([v, face, label]) => (
          <button key={v} className={`sat-level${Math.abs(value - v) < 12 ? ' on' : ''}`} onClick={() => setValue(v)}>
            <MoodFace level={face} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <input
        className="sat-slider"
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label="Сытость в процентах"
      />
      {lastRow && (
        <p className="sat-last">
          Последнее: <b>{lastRow.dish}</b> · ≈ {lastKcal} ккал · +{gain(lastRow)}%
        </p>
      )}
      {streak >= 2 && <p className="sat-last">Дней подряд едим дома: <b>{streak}</b></p>}
      <p className="muted small">
        {m.n > 0
          ? `Гера учится: ты проголодаешься примерно через ${String(Math.round(m.fullHours * 0.65 * 10) / 10).replace('.', ',')} ч после еды · отметок: ${m.n}.`
          : `По росту и весу ты проголодаешься примерно через ${String(Math.round(m.fullHours * 0.65 * 10) / 10).replace('.', ',')} ч после еды. Отмечай, как себя чувствуешь, — Гера подстроится точнее.`}
      </p>
    </Sheet>
  );
}
