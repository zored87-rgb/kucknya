// Режим готовки: шаги по одному крупно, таймеры из текста («10 мин» → кнопка), экран не гаснет.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RecipeCheck } from '../logic/availability';
import { scaledQty, servingsOf, servingsText, stepsWithQty } from '../logic/portions';
import { PantryLine } from './RecipeCard';
import { dishEmoji } from './emoji';
import { IconClose } from './icons';
import { IngredientRow } from './IngredientRow';
import { TimerChips } from './TimerBar';
import { startTimer, systemTimerEnabled } from './timers';

/** Время из текста шага: «8 мин», «3-4 мин», «1 ч», «1.5 ч». Секунды не берём — это «на глаз». */
export function stepTimes(text: string): { label: string; seconds: number }[] {
  const out: { label: string; seconds: number }[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(мин|ч)(?![а-я])/g)) {
    const a = parseFloat(m[1].replace(',', '.'));
    const b = m[2] ? parseFloat(m[2].replace(',', '.')) : a;
    const unit = m[3] === 'ч' ? 3600 : 60;
    const seconds = Math.round(b * unit);
    if (!seconds || seen.has(seconds)) continue;
    seen.add(seconds);
    out.push({ label: m[0].replace(/\s+/g, ' '), seconds });
  }
  return out;
}

export function CookMode({
  check,
  scale = 1,
  onClose,
  onDone,
}: {
  check: RecipeCheck;
  scale?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const r = check.recipe;
  const steps = stepsWithQty(r.steps, r.ingredients, scale);
  const pages: ReactNode[] = [
    <div key="ing" className="cm-ings">
      <h3>Что понадобится</h3>
      <p className="muted">{servingsText(servingsOf(r) * scale)}</p>
      <ul className="ings">
        {check.items.map((c, i) =>
          c.have === 'pantry' ? null : <IngredientRow key={i} c={c} qText={scaledQty(c.ing, scale)} />,
        )}
      </ul>
      <PantryLine check={check} scale={scale} />
    </div>,
    ...steps.map((parts, i) => (
      <p key={i} className="cm-step">
        {parts.map((x, j) => (
          <span key={j}>
            {x.text}
            {x.q && <span className="cm-q"> ({x.q})</span>}
          </span>
        ))}
      </p>
    )),
  ];
  const [page, setPage] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = page === pages.length - 1;

  // Экран не гаснет, пока готовим.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* браузер не дал — экран просто может погаснуть */
      }
    };
    void acquire();
    const onVis = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVis);
    // Страница под режимом не прокручивается.
    const body = document.body.style;
    const prev = body.overflow;
    body.overflow = 'hidden';
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
      body.overflow = prev;
    };
  }, []);

  const go = (d: number) => setPage((p) => Math.min(pages.length - 1, Math.max(0, p + d)));
  const times = page > 0 ? stepTimes(r.steps[page - 1]) : [];

  return createPortal(
    <div className="cook-mode" role="dialog" aria-label={`Готовим: ${r.name}`}>
      <header className="cm-top">
        <span className="cm-emoji" aria-hidden>
          {dishEmoji(r)}
        </span>
        <b className="cm-title">{r.name}</b>
        <button className="icon-btn" onClick={onClose} aria-label="Выйти из режима готовки">
          <IconClose />
        </button>
      </header>

      <TimerChips big />

      <div className="cm-progress" aria-hidden>
        {pages.map((_, i) => (
          <span key={i} className={i === page ? 'on' : i < page ? 'past' : ''} />
        ))}
      </div>

      <main
        className="cm-body"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        }}
      >
        {page > 0 && <span className="cm-num">Шаг {page} из {r.steps.length}</span>}
        {pages[page]}
        {times.length > 0 && !systemTimerEnabled() && (
          <p className="cm-hint">Чтобы таймер звонил в других приложениях — ⚙️ → «Таймер в фоне».</p>
        )}
        {times.length > 0 && (
          <div className="cm-times">
            {times.map((t) => (
              <button key={t.seconds} className="btn ghost" onClick={() => startTimer(t.label, t.seconds, r.name)}>
                ⏱ {t.label}
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="cm-nav">
        <button className="btn ghost" onClick={() => go(-1)} disabled={page === 0}>
          ‹ Назад
        </button>
        {last ? (
          <button className="btn primary" onClick={onDone}>
            Готово ✓
          </button>
        ) : (
          <button className="btn primary" onClick={() => go(1)}>
            {page === 0 ? 'Начать' : 'Дальше ›'}
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
