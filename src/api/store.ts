// Состояние приложения: последний снимок с сервера + очередь неотправленных изменений.
// Экран показывает снимок с уже применённой очередью — правки видны сразу, даже без сети.

import { get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import type { Person, Snapshot } from '../types';
import { ApiError, bootstrap, sendBatch } from './client';
import { applyAll, EMPTY_SNAPSHOT, newId, type Op, type OpBody } from './ops';

export interface Config {
  url: string;
  token: string;
  me: Person | '';
}

export interface State {
  config: Config;
  /** Данные с сервера (или из кэша) — без локальных правок. */
  server: Snapshot | null;
  queue: Op[];
  /** То, что показываем: server + queue. */
  view: Snapshot;
  syncing: boolean;
  error: string | null;
  badToken: boolean;
  lastSync: number | null;
  loaded: boolean;
  /** В этом запуске уже получили свежие данные с сервера (а не только кэш с телефона). */
  fresh: boolean;
}

const LS = { url: 'kukhnya.url', token: 'kukhnya.token', me: 'kukhnya.me' };
const IDB = { server: 'kukhnya.server', queue: 'kukhnya.queue', lastSync: 'kukhnya.lastSync' };

function lsGet(k: string): string {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* приватный режим — живём без сохранения */
  }
}

let state: State = {
  config: {
    url: lsGet(LS.url) || (import.meta.env.VITE_API_URL ?? ''),
    token: lsGet(LS.token),
    me: (lsGet(LS.me) as Person) || '',
  },
  server: null,
  queue: [],
  view: EMPTY_SNAPSHOT,
  syncing: false,
  error: null,
  badToken: false,
  lastSync: null,
  loaded: false,
  fresh: false,
};

const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  if ('server' in patch || 'queue' in patch) {
    state.view = applyAll(state.server ?? EMPTY_SNAPSHOT, state.queue);
  }
  listeners.forEach((l) => l());
}

export function getState(): State {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

async function persist() {
  try {
    await Promise.all([set(IDB.server, state.server), set(IDB.queue, state.queue), set(IDB.lastSync, state.lastSync)]);
  } catch {
    /* IndexedDB недоступен — данные просто не переживут перезапуск */
  }
}

export function isConfigured(): boolean {
  return !!(state.config.url && state.config.token && state.config.me);
}

export function setConfig(c: Partial<Config>) {
  const config = { ...state.config, ...c };
  if (c.url !== undefined) lsSet(LS.url, c.url);
  if (c.token !== undefined) lsSet(LS.token, c.token);
  if (c.me !== undefined) lsSet(LS.me, c.me);
  update({ config, badToken: false, error: null });
}

/** Загрузить кэш с телефона, потом обновиться с сервера. */
export async function init() {
  try {
    const [server, queue, lastSync] = await Promise.all([get(IDB.server), get(IDB.queue), get(IDB.lastSync)]);
    update({ server: server ?? null, queue: queue ?? [], lastSync: lastSync ?? null, loaded: true });
  } catch {
    update({ loaded: true });
  }
  if (isConfigured()) void sync();

  window.addEventListener('online', () => void sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isConfigured()) {
      const stale = !state.lastSync || Date.now() - state.lastSync > 30_000;
      if (stale || state.queue.length) void sync();
    }
  });
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Применить изменения сразу и поставить в очередь на отправку. */
export function mutate(ops: OpBody | OpBody[]) {
  const list = (Array.isArray(ops) ? ops : [ops]).map((o) => ({ ...o, opId: newId() }) as Op);
  update({ queue: [...state.queue, ...list] });
  void persist();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void sync(), 400);
}

let inflight: Promise<void> | null = null;

/** Отправить очередь (если есть) и получить свежие данные. */
export function sync(): Promise<void> {
  if (inflight) return inflight;
  inflight = doSync().then((ok) => {
    inflight = null;
    // Пока отправляли, могли появиться новые правки.
    if (ok && state.queue.length) void sync();
  });
  return inflight;
}

async function doSync(): Promise<boolean> {
  const { url, token } = state.config;
  if (!url || !token) return false;
  update({ syncing: true });
  try {
    if (state.queue.length) {
      const sent = state.queue.slice(0, 100);
      const { data, results } = await sendBatch(url, token, sent, state.config.me);
      const failedIds = new Set(results.filter((r) => !r.ok && r.opId).map((r) => r.opId));
      // Не сохранилось — пробуем ещё пару раз, а не теряем правку молча
      const retry = sent.filter((o) => failedIds.has(o.opId) && (o.tries ?? 0) < 2).map((o) => ({ ...o, tries: (o.tries ?? 0) + 1 }));
      const sentIds = new Set(sent.map((o) => o.opId));
      const failed = results.filter((r) => !r.ok);
      update({
        server: data,
        queue: [...retry, ...state.queue.filter((o) => !sentIds.has(o.opId))],
        lastSync: Date.now(),
        error: failed.length && !retry.length ? `Не сохранилось ${failed.length}: ${failed[0].error}` : null,
        badToken: false,
        fresh: true,
      });
    } else {
      const data = await bootstrap(url, token);
      update({ server: data, lastSync: Date.now(), error: null, badToken: false, fresh: true });
    }
    await persist();
    // Повторы отправим позже, а не в ту же секунду
    return !state.queue.some((o) => o.tries);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'bad_token') update({ badToken: true, error: e.message });
    else if (e instanceof ApiError && e.code === 'network') update({ error: navigator.onLine ? e.message : null });
    else update({ error: e instanceof Error ? e.message : String(e) });
    return false;
  } finally {
    update({ syncing: false });
  }
}

/** Проверка кода и адреса на экране настройки. */
export async function tryConnect(url: string, token: string): Promise<Snapshot> {
  return bootstrap(url, token);
}

export function acceptSnapshot(s: Snapshot) {
  update({ server: s, lastSync: Date.now(), error: null, badToken: false });
  void persist();
}
