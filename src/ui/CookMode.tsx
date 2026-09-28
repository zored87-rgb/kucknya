// Режим готовки: шаги по одному крупно, таймеры из текста («10 мин» → кнопка), экран не гаснет.

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RecipeCheck } from '../logic/availability';
import { scaledQty, servingsOf, servingsText, stepsWithQty } from '../logic/portions';
import { PantryLine } from './RecipeCard';
import { isNight } from '../logic/pet';
import { useWeather } from '../logic/weather';
import type { SceneState } from './pet/scene/kitchenScene';
import { usePet } from './pet/petStore';
import { chirp } from './pet/sound';

const Scene3D = lazy(() => import('./pet/scene/Scene3D'));
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

  // Гера «проговаривает» подсказку пару секунд после каждого шага
  const [talking, setTalking] = useState(true);
  useEffect(() => {
    setTalking(true);
    const t = window.setTimeout(() => setTalking(false), 2200);
    return () => window.clearTimeout(t);
  }, [page]);
  const pet = usePet();
  const weather = useWeather();
  const chefState: SceneState = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    return {
      face: 'smile',
      mood: 'happy',
      talking,
      eating: false,
      reaction: null,
      outfit: 'chef',
      wall: pet.wall,
      sky: h >= 21 || h < 6 ? 'night' : h < 9 ? 'morning' : h < 18 ? 'day' : 'evening',
      night: isNight(now),
      spoiling: false,
      weekMeals: 0,
      day: now.getDate(),
      month: now.getMonth(),
      weather: weather?.kind ?? 'clear',
      clouds: weather?.clouds ?? 20,
    };
  }, [talking, pet.wall, weather?.kind, weather?.clouds]);
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

      {/* Гера-повар: сверху подсказка, что делать сейчас и что дальше */}
      <section className="cm-stage">
        <div className="cm-bubble" key={page}>
          {page === 0 ? (
            <p className="cm-step">Сначала проверим продукты — всё на месте? Тогда жми «Начать» 👨‍🍳</p>
          ) : (
            <>
              <span className="cm-num">
                Шаг {page} из {r.steps.length}
              </span>
              {pages[page]}
            </>
          )}
        </div>
        {page > 0 && page < r.steps.length && <p className="cm-next">Потом: {nextHint(r.steps[page])}</p>}
        <div className="cm-chef">
          <Suspense fallback={null}>
            <Scene3D
              mode="chef"
              state={chefState}
              heartsKey={0}
              onTarget={() => undefined}
              onCatTap={() => chirp()}
              onCatStroke={() => chirp()}
              onAnchors={() => undefined}
              onReady={() => undefined}
              onFail={() => undefined}
            />
          </Suspense>
        </div>
      </section>

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
        {page === 0 && pages[0]}
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

/** Первые слова следующего шага: «Добавь лук, жарь ещё 4 мин…». */
function nextHint(step: string): string {
  // Делим по концу предложения, но не по сокращениям вроде «ст.л. масла»
  const first = step.split(/(?<=[.!?])\s(?=[А-ЯЁA-Z])/)[0];
  return first.length > 70 ? first.slice(0, 68).replace(/\s\S*$/, '') + '…' : first;
}
