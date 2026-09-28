// Настройки: кто я, кладовая, праздники, синхронизация.

import { useState } from 'react';
import { mutate, setConfig, sync, useStore } from '../api/store';
import { DEFAULT_PANTRY } from '../data/products';
import type { Kitchen } from '../hooks/useKitchen';
import { daysBetween, parseDate } from '../logic/dates';
import { PEOPLE, type Person } from '../types';
import { Field, Section, Segmented } from '../ui/kit';
import { setSystemTimer, shortcutUrl, SHORTCUT_NAME, systemTimerEnabled } from '../ui/timers';
import { pantryLabel } from '../ui/labels';
import { setPet, usePet } from '../ui/pet/petStore';
import { meow } from '../ui/pet/sound';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1LC7o3yIus1-5o1fz_DlvmW75Hiq0ZjNEnC3h01mbYCE/edit';

export function Settings({ k, onBack }: { k: Kitchen; onBack: () => void }) {
  const st = useStore((s) => s);
  const [item, setItem] = useState('');
  const [store, setStore] = useState('');
  const [sysTimer, setSysTimer] = useState(systemTimerEnabled);
  const pantry = k.pantry;
  const setPantry = (items: string[]) => mutate({ op: 'pantry.set', items });

  const upcoming = k.holidays
    .map((h) => ({ ...h, d: parseDate(h.date) }))
    .filter((h) => h.d && daysBetween(k.today, h.d) >= 0)
    .slice(0, 6);

  return (
    <>
      <button className="link back" onClick={onBack}>
        ‹ Назад
      </button>

      <Section title="Кто пользуется этим телефоном">
        <Segmented<Person> value={k.me} options={PEOPLE.map((p) => ({ value: p, label: p }))} onChange={(me) => setConfig({ me })} />
      </Section>

      <PetSettings />

      <Section title="Кладовая" hint="Всегда есть дома">
        <div className="chips">
          {pantry.map((p) => (
            <button key={p} className="chip on removable" onClick={() => setPantry(pantry.filter((x) => x !== p))} aria-label={`Убрать ${pantryLabel(p)}`}>
              {pantryLabel(p)} ✕
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="добавить: гречка, горчица…" />
          <button
            className="btn"
            onClick={() => {
              if (item.trim() && !pantry.includes(item.trim())) setPantry([...pantry, item.trim()]);
              setItem('');
            }}
          >
            +
          </button>
        </div>
        <button className="link" onClick={() => setPantry(DEFAULT_PANTRY)}>
          Вернуть стандартный список
        </button>
      </Section>

      <Section title="Магазины">
        <div className="chips">
          {k.stores.map((p) => (
            <button key={p} className="chip on removable" onClick={() => k.stores.length > 1 && mutate({ op: 'stores.set', items: k.stores.filter((x) => x !== p) })}>
              {p} ✕
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input value={store} onChange={(e) => setStore(e.target.value)} placeholder="добавить: Lidl, Consum…" />
          <button
            className="btn"
            onClick={() => {
              const v = store.trim();
              if (v && !k.stores.includes(v)) mutate({ op: 'stores.set', items: [...k.stores, v] });
              setStore('');
            }}
          >
            +
          </button>
        </div>
      </Section>

      <Section title="Таймер в фоне" hint="Звонит, даже если «Кухня» свёрнута">
        <Segmented<'on' | 'off'>
          value={sysTimer ? 'on' : 'off'}
          options={[
            { value: 'off', label: 'Только в приложении' },
            { value: 'on', label: 'Через «Часы»' },
          ]}
          onChange={(v) => {
            setSystemTimer(v === 'on');
            setSysTimer(v === 'on');
          }}
        />
        {sysTimer && (
          <>
            <ol className="steps small">
              <li>
                «Команды» → <b>+</b> → действие <b>«Запустить таймер»</b>.
              </li>
              <li>
                Нажми на время → <b>«Входные данные команды»</b>, единицы — <b>минуты</b>.
              </li>
              <li>
                Назови команду <b>«{SHORTCUT_NAME}»</b>.
              </li>
            </ol>
            <button className="btn ghost" onClick={() => (window.location.href = shortcutUrl(1))}>
              Проверить: таймер на 1 минуту
            </button>
          </>
        )}
      </Section>

      <Section title="Siri" hint="«Привет, Siri, в холодильник»">
        <Field label="Адрес">
          <input value={st.config.url} readOnly onFocus={(e) => e.target.select()} />
        </Field>
      </Section>

      <Section title="Праздники" hint="Mercadona закрыт">
        <ul className="list compact">
          {upcoming.map((h) => (
            <li key={h.date} className="item">
              <span>
                <b>{h.date}</b> <span className="muted">{h.name}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Синхронизация">
        <p className="small">
          {st.lastSync ? `Последняя: ${new Date(st.lastSync).toLocaleString('ru-RU')}` : 'Ещё не было'}
          {st.queue.length > 0 && ` · ждут отправки: ${st.queue.length}`}
        </p>
        {st.error && <p className="small red">{st.error}</p>}
        <div className="row-btns">
          <button className="btn" onClick={() => void sync()} disabled={st.syncing}>
            {st.syncing ? 'Синхронизирую…' : 'Синхронизировать'}
          </button>
          <a className="btn ghost" href={SHEET_URL} target="_blank" rel="noreferrer">
            Открыть таблицу
          </a>
        </div>
      </Section>

      <Section title="Доступ">
        <Field label="Адрес скрипта">
          <input value={st.config.url} readOnly />
        </Field>
        <button
          className="btn ghost danger"
          onClick={() => {
            if (confirm('Сбросить код доступа на этом телефоне? Данные в таблице не пропадут.')) setConfig({ token: '' });
          }}
        >
          Сменить код доступа
        </button>
      </Section>
      <p className="muted small center">Кухня · версия {__APP_VERSION__}</p>
    </>
  );
}

function PetSettings() {
  const pet = usePet();
  return (
    <Section title="🐱 Кот">
      <Field label="Как зовут">
        <input value={pet.name} onChange={(e) => setPet({ name: e.target.value })} placeholder="Пухля" maxLength={20} />
      </Field>
      <Segmented<'on' | 'off'>
        value={pet.sound ? 'on' : 'off'}
        options={[
          { value: 'on', label: '🔊 Звуки' },
          { value: 'off', label: '🔇 Без звука' },
        ]}
        onChange={(v) => {
          setPet({ sound: v === 'on' });
          if (v === 'on') meow();
        }}
      />
      <button
        className="link"
        onClick={() => {
          try {
            localStorage.removeItem('kukhnya.no3d');
          } catch {
            /* ничего */
          }
          location.reload();
        }}
      >
        Кухня не в 3D? Попробовать снова
      </button>
    </Section>
  );
}
