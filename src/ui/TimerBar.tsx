// Полоска активных таймеров под шапкой — видна на любой вкладке.

import { useEffect, useState } from 'react';
import { cancelTimer, checkTimers, formatLeft, useTimers } from './timers';
import { toast } from './toast';

export function useTimerTicker() {
  const timers = useTimers();
  const [, setTick] = useState(0);
  useEffect(() => {
    const check = () => checkTimers((t) => toast(`🔔 Готово: ${t.label}${t.dish ? ` — ${t.dish}` : ''}`));
    check();
    // Вернулись в приложение — сразу проверить, не вышло ли время, пока «Кухня» спала.
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    if (!timers.some((t) => !t.done)) return () => document.removeEventListener('visibilitychange', onVis);
    const id = setInterval(() => {
      check();
      setTick((x) => x + 1);
    }, 1000);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [timers]);
  return timers;
}

export function TimerChips({ big }: { big?: boolean }) {
  const timers = useTimers();
  if (!timers.length) return null;
  return (
    <div className={big ? 'cm-timers' : 'timer-bar'}>
      {timers.map((t) => (
        <button
          key={t.id}
          className={`cm-timer${t.done ? ' done' : ''}`}
          onClick={() => cancelTimer(t.id)}
          aria-label={t.done ? `Таймер ${t.label} готов, убрать` : `Таймер ${t.label}, отменить`}
        >
          {t.done ? '🔔 готово' : `⏱ ${formatLeft(t.endsAt - Date.now())}`} <small>{big ? t.label : t.dish || t.label}</small> ✕
        </button>
      ))}
    </div>
  );
}
