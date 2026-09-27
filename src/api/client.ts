// Запросы к Apps Script. Content-Type text/plain — чтобы браузер не слал OPTIONS (Apps Script на него не отвечает).

import type { Snapshot } from '../types';
import type { Op } from './ops';

export class ApiError extends Error {
  constructor(
    public code: 'bad_token' | 'network' | 'server',
    message: string,
  ) {
    super(message);
  }
}

interface Response<T> {
  ok: boolean;
  error?: string;
  data?: T;
  results?: { ok: boolean; opId?: string; error?: string }[];
}

async function post<T>(url: string, body: object, timeoutMs = 30000): Promise<Response<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: globalThis.Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError('network', 'Нет связи с таблицей');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError('server', `Сервер ответил ${res.status}`);
  let json: Response<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('server', 'Скрипт вернул не JSON — проверьте, что развёрнута последняя версия и доступ «Все»');
  }
  if (!json.ok) {
    if (json.error === 'bad_token') throw new ApiError('bad_token', 'Неверный код доступа');
    throw new ApiError('server', json.error ?? 'Ошибка скрипта');
  }
  return json;
}

export async function bootstrap(url: string, token: string): Promise<Snapshot> {
  const r = await post<Snapshot>(url, { token, action: 'bootstrap' });
  return r.data as Snapshot;
}

export async function sendBatch(url: string, token: string, ops: Op[]) {
  const r = await post<Snapshot>(url, { token, action: 'batch', ops }, 60000);
  return { data: r.data as Snapshot, results: r.results ?? [] };
}
