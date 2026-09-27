// Режим готовки: шаги по одному крупно, таймеры из текста («10 мин» → кнопка), экран не гаснет.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RecipeCheck } from '../logic/availability';
import { dishEmoji } from './emoji';
import { IconClose } from './icons';
import { IngredientRow } from './IngredientRow';

interface Timer {
  id: number;
  label: string;
  endsAt: number;
  done: boolean;
}

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

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function CookMode({ check, onClose, onDone }: { check: RecipeCheck; onClose: () => void; onDone: () => void }) {
  const r = check.recipe;
  const pages: ReactNode[] = [
    <div key="ing" className="cm-ings">
      <h3>Что понадобится</h3>
      <ul className="ings">
        {check.items.map((c, i) => (
          <IngredientRow key={i} c={c} />
        ))}
      </ul>
    </div>,
    ...r.steps.map((s, i) => (
      <p key={i} className="cm-step">
        {s}
      </p>
    )),
  ];
  const [page, setPage] = useState(0);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [, setTick] = useState(0);
  const audio = useRef<AudioContext | null>(null);
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
      void audio.current?.close().catch(() => undefined);
    };
  }, []);

  // Тикаем раз в секунду, пока есть таймеры.
  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const id = setInterval(() => {
      const now = Date.now();
      setTimers((list) =>
        list.map((t) => {
          if (!t.done && t.endsAt <= now) {
            beep();
            return { ...t, done: true };
          }
          return t;
        }),
      );
      setTick((x) => x + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [timers]);

  const beep = () => {
    const ctx = audio.current;
    if (!ctx) return;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.25;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.4;
      o.start(t);
      o.stop(t + 0.25);
    }
  };

  const startTimer = (label: string, seconds: number) => {
    // Звук на iPhone разрешён только после нажатия — создаём его здесь.
    if (!audio.current) {
      try {
        audio.current = new AudioContext();
      } catch {
        /* без звука — таймер всё равно покажет «готово» */
      }
    }
    void audio.current?.resume();
    setTimers((list) => [...list, { id: Date.now(), label, endsAt: Date.now() + seconds * 1000, done: false }]);
  };

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

      {timers.length > 0 && (
        <div className="cm-timers">
          {timers.map((t) => (
            <button
              key={t.id}
              className={`cm-timer${t.done ? ' done' : ''}`}
              onClick={() => setTimers((l) => l.filter((x) => x.id !== t.id))}
              aria-label={t.done ? `Таймер ${t.label} готов, убрать` : `Таймер ${t.label}, отменить`}
            >
              {t.done ? '🔔 готово' : `⏱ ${fmt(t.endsAt - Date.now())}`} <small>{t.label}</small> ✕
            </button>
          ))}
        </div>
      )}

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
        {times.length > 0 && (
          <div className="cm-times">
            {times.map((t) => (
              <button key={t.seconds} className="btn ghost" onClick={() => startTimer(t.label, t.seconds)}>
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
