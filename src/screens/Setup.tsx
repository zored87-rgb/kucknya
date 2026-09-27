// Первый запуск: кто ты, код доступа, адрес скрипта. На iPhone — подсказка про «На экран Домой».

import { useState } from 'react';
import { ApiError } from '../api/client';
import { acceptSnapshot, getState, setConfig, tryConnect } from '../api/store';
import { PEOPLE, type Person } from '../types';
import { Field, Segmented } from '../ui/kit';

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function Setup() {
  const cfg = getState().config;
  const [me, setMe] = useState<Person | ''>(cfg.me);
  const [token, setToken] = useState(cfg.token);
  const [url, setUrl] = useState(cfg.url);
  const [showUrl, setShowUrl] = useState(!cfg.url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(getState().badToken ? 'Код доступа не подошёл — введи заново.' : null);
  const [skipInstall, setSkipInstall] = useState(false);

  if (isIos() && !isStandalone() && !skipInstall) {
    return (
      <main className="setup">
        <h1>Кухня</h1>
        <div className="card pad">
          <h3>Сначала установи на телефон</h3>
          <ol className="steps">
            <li>
              Внизу Safari нажми <b>«Поделиться»</b> (квадрат со стрелкой ⬆︎).
            </li>
            <li>
              Прокрути и выбери <b>«На экран «Домой»»</b> → <b>«Добавить»</b>.
            </li>
            <li>Открой «Кухню» с экрана «Домой» — там и введёшь код.</li>
          </ol>
          <p className="muted small">У установленного приложения своя память: код, введённый здесь, в Safari, туда не перейдёт.</p>
        </div>
        <button className="link" onClick={() => setSkipInstall(true)}>
          Продолжить в браузере
        </button>
      </main>
    );
  }

  const submit = async () => {
    setError(null);
    if (!me) return setError('Выбери, кто ты.');
    if (!token.trim()) return setError('Введи код доступа.');
    if (!url.trim()) return setError('Нужен адрес скрипта.');
    setBusy(true);
    try {
      const snap = await tryConnect(url.trim(), token.trim());
      setConfig({ me, token: token.trim(), url: url.trim() });
      acceptSnapshot(snap);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'bad_token') setError('Код не подошёл. Его показывает функция setup() в Apps Script.');
      else if (e instanceof ApiError && e.code === 'network') setError('Не удаётся связаться со скриптом. Проверь интернет и адрес.');
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="setup">
      <h1>Кухня</h1>
      <p className="muted">Что приготовить из того, что есть дома.</p>
      <Field label="Кто ты?">
        <Segmented<Person> value={me as Person} options={PEOPLE.map((p) => ({ value: p, label: p }))} onChange={setMe} />
      </Field>
      <Field label="Код доступа">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="xxxx-xxxx-xxxx"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {showUrl ? (
        <Field label="Адрес скрипта (…/exec)">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" />
        </Field>
      ) : (
        <button className="link" onClick={() => setShowUrl(true)}>
          Изменить адрес скрипта
        </button>
      )}
      {error && <p className="red">{error}</p>}
      <button className="btn primary wide" onClick={submit} disabled={busy}>
        {busy ? 'Проверяю…' : 'Готово'}
      </button>
    </main>
  );
}
