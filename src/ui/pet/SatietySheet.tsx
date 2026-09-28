// «Как ты сейчас?» — ручная отметка сытости. Гера запоминает и подстраивает темп голода под тебя.

import { useState } from 'react';
import { mutate } from '../../api/store';
import type { Kitchen } from '../../hooks/useKitchen';
import { calibrate, DEFAULT_METABOLISM } from '../../logic/pet';
import type { EatenRow } from '../../types';
import { Sheet } from '../kit';
import { toast } from '../toast';
import { setPet, usePet } from './petStore';

const LEVELS: [number, string, string][] = [
  [5, '😫', 'Очень голоден'],
  [28, '🙁', 'Голоден'],
  [52, '😐', 'Так себе'],
  [80, '🙂', 'Сыт'],
  [100, '😋', 'Объелся'],
];

export function SatietySheet({ k, myEaten, sat, onClose }: { k: Kitchen; myEaten: EatenRow[]; sat: number; onClose: () => void }) {
  const pet = usePet();
  const [value, setValue] = useState(sat);
  const m = pet.metab ?? DEFAULT_METABOLISM;

  const save = (v: number) => {
    const next = calibrate(myEaten, pet.fed, Date.now(), v, m);
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
        {LEVELS.map(([v, emoji, label]) => (
          <button key={v} className={`sat-level${Math.abs(value - v) < 12 ? ' on' : ''}`} onClick={() => setValue(v)}>
            <span className="sat-emoji">{emoji}</span>
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
      <p className="muted small">
        {m.n > 0
          ? `Гера учится: ты проголодаешься примерно через ${Math.round(m.fullHours)} ч после еды · отметок: ${m.n}.`
          : 'Отмечай, как ты себя чувствуешь, — Гера научится угадывать твой голод по времени после еды.'}
      </p>
    </Sheet>
  );
}
