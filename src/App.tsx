// Каркас: шапка, вкладки, нижняя навигация, обновление жестом вниз.

import { useEffect, useState } from 'react';
import type { OpBody } from './api/ops';
import { isConfigured, mutate, sync, useStore } from './api/store';
import { parseBulk } from './data/bulk';
import { useKitchen } from './hooks/useKitchen';
import { Buy } from './screens/Buy';
import { Feed } from './screens/Feed';
import { Eaten } from './screens/Eaten';
import { Fridge } from './screens/Fridge';
import { Recipes } from './screens/Recipes';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { IconGear } from './ui/icons';
import { usePet } from './ui/pet/petStore';
import { Room } from './ui/pet/Room';
import { TimerChips, useTimerTicker } from './ui/TimerBar';
import { dismissToast, toast, useToast } from './ui/toast';
import { usePullToRefresh } from './ui/usePullToRefresh';

// Главный экран — кухня-комната. Остальные разделы открываются предметами в ней.
type Tab = 'cook' | 'feed' | 'fridge' | 'buy' | 'eaten' | 'recipes' | 'settings';

const TITLES: Record<Exclude<Tab, 'cook'>, string> = {
  feed: 'Чем покормить',
  fridge: 'Холодильник',
  buy: 'Магазин',
  eaten: 'Дневник',
  recipes: 'Рецепты',
  settings: 'Настройки',
};

/** «Гера» → «Геру»: для «Чем покормить Геру». */
function accusative(name: string): string {
  if (/а$/.test(name)) return name.slice(0, -1) + 'у';
  if (/я$/.test(name)) return name.slice(0, -1) + 'ю';
  return name;
}

// Разобранные строки «Входящих» помним между запусками: старый кэш на телефоне не должен
// второй раз класть те же продукты в холодильник
const HANDLED_KEY = 'kukhnya.inboxDone';
const handledInbox = new Set<string>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
);
function rememberInbox() {
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify([...handledInbox].slice(-200)));
  } catch {
    /* приватный режим */
  }
}

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '') as Tab;
  return h in TITLES ? h : 'cook';
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const badToken = useStore((s) => s.badToken);
  const config = useStore((s) => s.config);
  if (!loaded) return <div className="splash">Кухня</div>;
  if (!isConfigured() || badToken || !config.me) return <Setup />;
  return <Shell />;
}

function Shell() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const k = useKitchen();
  const syncing = useStore((s) => s.syncing);
  const queue = useStore((s) => s.queue.length);
  const error = useStore((s) => s.error);
  const hasData = useStore((s) => s.server !== null);
  const pull = usePullToRefresh(() => sync(), tab !== 'cook');
  const pet = usePet();
  useTimerTicker();

  // Надиктованное через Siri лежит в листе «Входящие» — разбираем и кладём в холодильник.
  const inbox = useStore((s) => s.view.inbox);
  const fresh = useStore((s) => s.fresh);
  useEffect(() => {
    // Только по свежим данным с сервера: в кэше может лежать то, что уже разобрал другой телефон
    if (!fresh || !inbox?.length) return;
    const todo = inbox.filter((row) => !handledInbox.has(row.id));
    if (!todo.length) return;
    const ops: OpBody[] = [];
    const names: string[] = [];
    for (const row of todo) {
      handledInbox.add(row.id);
      parseBulk(row.text).forEach((l, i) => {
        // id из id входящей строки: если оба телефона разберут одновременно, строка не задвоится.
        ops.push({ op: 'fridge.upsert', row: { id: `${row.id}-${i}`, name: l.name, where: l.where, qty: l.qty, expires: l.expires, note: '' } });
        names.push(`${l.name}${l.qty ? ` ${l.qty}` : ''}`);
      });
      ops.push({ op: 'inbox.delete', id: row.id });
    }
    rememberInbox();
    mutate(ops);
    if (names.length) toast(`От Siri в холодильник: ${names.join(', ')}`);
  }, [inbox, fresh]);

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (t: string) => {
    location.hash = t;
    window.scrollTo(0, 0);
  };

  const title = tab === 'feed' ? `Чем покормить ${accusative(pet.name || 'кота')}` : TITLES[tab as Exclude<Tab, 'cook'>];

  // Кухня с котом не выгружается при переходе в разделы — возврат мгновенный, без загрузки 3D
  const room = (
    <div className={`room-screen${tab === 'cook' ? '' : ' hidden'}`} aria-hidden={tab !== 'cook'}>
      <Room k={k} go={go} full active={tab === 'cook'} onFeed={() => go('feed')} sync={<SyncBadge syncing={syncing} queue={queue} error={error} />} />
      <div className="room-timers">{tab === 'cook' && <TimerChips />}</div>
    </div>
  );

  if (tab === 'cook') {
    return (
      <>
        {room}
        <ToastView />
      </>
    );
  }

  return (
    <>
      {room}
      <div className="ptr" style={{ height: pull.distance }} aria-hidden>
        <span className={pull.ready ? 'ready' : ''}>{pull.ready ? '↻ отпусти' : '↓'}</span>
      </div>
      <header className="top">
        <button className="back-home" onClick={() => go('cook')} aria-label="На кухню">
          ‹ Кухня
        </button>
        <div className="top-right">
          <SyncBadge syncing={syncing} queue={queue} error={error} />
          {tab !== 'settings' && (
            <button className="icon-btn" onClick={() => go('settings')} aria-label="Настройки">
              <IconGear />
            </button>
          )}
        </div>
      </header>
      <h1 className="page-title" key={`t-${tab}`}>
        {title}
      </h1>

      <TimerChips />
      <main className={`content tab-${tab}`} key={tab}>
        {!hasData && syncing ? (
          <div className="empty">Загружаю данные из таблицы…</div>
        ) : (
          <>
            {tab === 'feed' && <Feed k={k} go={go} />}
            {tab === 'fridge' && <Fridge k={k} />}
            {tab === 'buy' && <Buy k={k} />}
            {tab === 'eaten' && <Eaten k={k} />}
            {tab === 'recipes' && <Recipes k={k} />}
            {tab === 'settings' && <Settings k={k} onBack={() => go('cook')} />}
          </>
        )}
      </main>
      <ToastView />
    </>
  );
}

function SyncBadge({ syncing, queue, error }: { syncing: boolean; queue: number; error: string | null }) {
  if (syncing) return <span className="sync spin" title="Синхронизация">↻</span>;
  // Без сети правки ждут в очереди — это нормально, показываем их число, а не ошибку.
  if (queue) return <span className="sync wait" title={`Ждут отправки: ${queue}${error ? ` (${error})` : ''}`}>{queue}</span>;
  if (error) return <span className="sync warn" title={error}>!</span>;
  return null;
}

function ToastView() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className="toast" role="status">
      <span>{t.text}</span>
      {t.undo && (
        <button
          onClick={() => {
            t.undo!();
            dismissToast();
          }}
        >
          Вернуть
        </button>
      )}
    </div>
  );
}
