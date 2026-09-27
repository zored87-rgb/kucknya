// Настройки: кто я, кладовая, праздники, синхронизация.

import { useState } from 'react';
import { mutate, setConfig, sync, useStore } from '../api/store';
import { DEFAULT_PANTRY } from '../data/products';
import type { Kitchen } from '../hooks/useKitchen';
import { daysBetween, parseDate } from '../logic/dates';
import { PEOPLE, type Person } from '../types';
import { Field, Section, Segmented } from '../ui/kit';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1LC7o3yIus1-5o1fz_DlvmW75Hiq0ZjNEnC3h01mbYCE/edit';

export function Settings({ k, onBack }: { k: Kitchen; onBack: () => void }) {
  const st = useStore((s) => s);
  const [item, setItem] = useState('');
  const [store, setStore] = useState('');
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
        <p className="muted small">От этого зависят твои 👍/👎 и завтраки.</p>
      </Section>

      <Section title="Кладовая — всегда есть дома" hint="Эти продукты не нужно вносить в холодильник. «Паста», «специи», «масло» — это группы.">
        <div className="chips">
          {pantry.map((p) => (
            <button key={p} className="chip on removable" onClick={() => setPantry(pantry.filter((x) => x !== p))}>
              {p} ✕
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

      <Section title="Магазины" hint="Для чеков и цен. Нажми, чтобы убрать.">
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

      <Section title="Голосом через Siri" hint="«Привет, Siri, в холодильник» → «6 луковиц, фарш 500». Как настроить — docs/SIRI.md в репозитории.">
        <Field label="Адрес для команды">
          <input value={st.config.url} readOnly onFocus={(e) => e.target.select()} />
        </Field>
      </Section>

      <Section title="Ближайшие праздники" hint="В эти дни и по воскресеньям Mercadona закрыт. Список правится в таблице, лист «Настройки».">
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
