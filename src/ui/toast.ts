// Короткое сообщение внизу экрана, при необходимости с кнопкой «Вернуть».

import { useSyncExternalStore } from 'react';

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

let current: Toast | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function toast(text: string, undo?: () => void) {
  current = { id: ++seq, text, undo };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, undo ? 5000 : 2500);
  emit();
}

export function dismissToast() {
  current = null;
  emit();
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
