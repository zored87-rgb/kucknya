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
  zoomReq,
  onZoomStart,
  active = true,
}: {
  /** Кухню снова показали — вернуть камеру на место. */
  active?: boolean;
  /** Камера начала подлёт — прячем подписи. */
  onZoomStart?: () => void;
  mode?: 'room' | 'chef';
  /** Нажали подпись предмета — камера подлетает к нему, потом переход. */
  zoomReq?: { t: Target; n: number } | null;
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
  const h = useRef({ onTarget, onCatTap, onCatStroke, onAnchors, onZoomStart });
  h.current = { onTarget, onCatTap, onCatStroke, onAnchors, onZoomStart };

  useEffect(() => {
    const el = box.current!;
    let s: KitchenScene;
    try {
      s = new KitchenScene(el, {
        onTarget: (t) => {
          h.current.onZoomStart?.();
          if (t === 'fridge') s.openFridge(() => h.current.onTarget(t));
          else s.zoomTo(t, () => h.current.onTarget(t));
        },
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

  useEffect(() => {
    if (!active) return;
    // Дать браузеру показать блок, потом пересчитать размер, камеру и облачко
    const id = requestAnimationFrame(() => scene.current?.refresh());
    return () => cancelAnimationFrame(id);
  }, [active]);

  useEffect(() => {
    const s = scene.current;
    if (!zoomReq || !s) return;
    h.current.onZoomStart?.();
    const done = () => h.current.onTarget(zoomReq.t);
    if (zoomReq.t === 'fridge') s.openFridge(done);
    else s.zoomTo(zoomReq.t, done);
  }, [zoomReq]);

  return <div ref={box} className="room-3d" />;
}
