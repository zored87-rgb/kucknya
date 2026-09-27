// Потянуть вниз, чтобы обновить. В приложении с экрана «Домой» на iPhone своего такого жеста нет.

import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [distance, setDistance] = useState(0);
  const start = useRef<number | null>(null);
  const dist = useRef(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const down = (e: TouchEvent) => {
      // Только если страница в самом верху и не открыта шторка.
      if (window.scrollY > 0 || document.querySelector('.sheet-backdrop')) return;
      start.current = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        dist.current = 0;
        setDistance(0);
        return;
      }
      dist.current = Math.min(110, dy * 0.5);
      setDistance(dist.current);
    };
    const up = () => {
      if (start.current == null) return;
      start.current = null;
      if (dist.current >= THRESHOLD * 0.8) void cb.current();
      dist.current = 0;
      setDistance(0);
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);

  return { distance, ready: distance >= THRESHOLD * 0.8 };
}
