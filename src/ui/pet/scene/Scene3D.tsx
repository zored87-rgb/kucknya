// React-обёртка над 3D-кухней. Грузится отдельным куском, чтобы приложение открывалось быстро.

import { useEffect, useRef } from 'react';
import { KitchenScene, type SceneState, type Target } from './kitchenScene';

export default function Scene3D({
  state,
  heartsKey,
  onTarget,
  onCatTap,
  onCatStroke,
  onAnchors,
  onReady,
  onFail,
  mode = 'room',
}: {
  mode?: 'room' | 'chef';
  state: SceneState;
  /** Меняется — над котом вылетают сердечки. */
  heartsKey: number;
  onTarget: (t: Target) => void;
  onCatTap: (part: 'head' | 'belly') => void;
  onCatStroke: () => void;
  onAnchors: (a: Record<string, { x: number; y: number }>) => void;
  onReady: () => void;
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<KitchenScene | null>(null);
  // Свежие обработчики без пересоздания сцены
  const h = useRef({ onTarget, onCatTap, onCatStroke, onAnchors });
  h.current = { onTarget, onCatTap, onCatStroke, onAnchors };

  useEffect(() => {
    const el = box.current!;
    let s: KitchenScene;
    try {
      s = new KitchenScene(el, {
        onTarget: (t) => (t === 'fridge' ? s.openFridge(() => h.current.onTarget(t)) : h.current.onTarget(t)),
        onCatTap: (p) => h.current.onCatTap(p),
        onCatStroke: () => h.current.onCatStroke(),
      }, mode);
    } catch {
      onFail();
      return;
    }
    scene.current = s;
    const anchors = () => h.current.onAnchors(s.project());
    el.addEventListener('scene-resize', anchors);
    anchors();
    const canvas = el.querySelector('canvas');
    const lost = (e: Event) => {
      e.preventDefault();
      onFail();
    };
    canvas?.addEventListener('webglcontextlost', lost);
    onReady();
    return () => {
      el.removeEventListener('scene-resize', anchors);
      canvas?.removeEventListener('webglcontextlost', lost);
      s.dispose();
      scene.current = null;
    };
    // Сцена создаётся один раз
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);

  useEffect(() => {
    if (heartsKey) scene.current?.hearts3();
  }, [heartsKey]);

  return <div ref={box} className="room-3d" />;
}
