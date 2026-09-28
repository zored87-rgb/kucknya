// Наряды и обои за уровни, поздравление с новым уровнем.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { REWARDS, XP_MEAL, XP_NEW_DISH, type Reward } from '../../logic/pet';
import { Sheet } from '../kit';
import { setPet, usePet } from './petStore';
import { fanfare } from './sound';

export function Wardrobe({ level, xp, onClose }: { level: number; xp: { into: number; need: number }; onClose: () => void }) {
  const pet = usePet();
  const choose = (r: Reward) => {
    if (r.level > level) return;
    if (r.kind === 'outfit') setPet({ outfit: pet.outfit === r.id ? '' : r.id });
    else setPet({ wall: pet.wall === r.id ? '' : r.id });
  };
  return (
    <Sheet title={`Уровень ${level}`} onClose={onClose}>
      <div className="xp-line">
        <div className="hud-bar big">
          <i className="xp" style={{ width: `${Math.max(4, (xp.into / xp.need) * 100)}%` }} />
        </div>
        <span>
          {xp.into} / {xp.need} опыта
        </span>
      </div>
      <p className="muted small">
        +{XP_MEAL} за каждую домашнюю еду, +{XP_NEW_DISH} за новое блюдо.
      </p>
      <div className="rewards">
        {REWARDS.map((r) => {
          const locked = r.level > level;
          const on = (r.kind === 'outfit' ? pet.outfit : pet.wall) === r.id;
          return (
            <button key={r.id} className={`reward${locked ? ' locked' : ''}${on ? ' on' : ''}`} onClick={() => choose(r)} disabled={locked}>
              <span className="reward-emoji">{locked ? '🔒' : r.emoji}</span>
              <span className="reward-name">{r.name}</span>
              <small>{locked ? `уровень ${r.level}` : on ? 'надето' : r.kind === 'wall' ? 'обои' : 'надеть'}</small>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export function LevelUp({ level, onClose }: { level: number; onClose: () => void }) {
  const got = REWARDS.filter((r) => r.level === level);
  useEffect(() => {
    fanfare();
  }, []);
  const wear = (r: Reward) => {
    setPet(r.kind === 'outfit' ? { outfit: r.id } : { wall: r.id });
    onClose();
  };
  return createPortal(
    <div className="levelup" role="dialog" aria-label={`Новый уровень ${level}`}>
      <div className="confetti" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 8) * 0.12}s`, background: ['#ff6fa0', '#ffc83d', '#3f8efc', '#52b36b', '#ff7a59'][i % 5] }} />
        ))}
      </div>
      <div className="levelup-card">
        <div className="levelup-star">{level}</div>
        <h2>Новый уровень!</h2>
        {got.length ? (
          <>
            <p>Награда:</p>
            {got.map((r) => (
              <button key={r.id} className="btn primary wide" onClick={() => wear(r)}>
                {r.emoji} {r.kind === 'outfit' ? 'Надеть' : 'Поклеить'}: {r.name}
              </button>
            ))}
          </>
        ) : (
          <p>Кот гордится вами. Готовьте дальше — впереди новые наряды.</p>
        )}
        <button className="btn ghost wide" onClick={onClose}>
          Ура!
        </button>
      </div>
    </div>,
    document.body,
  );
}
