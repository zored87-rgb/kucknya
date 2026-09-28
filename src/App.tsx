// Каркас: шапка, вкладки, нижняя навигация, обновление жестом вниз.

import { useEffect, useState, type ReactNode } from 'react';
import type { OpBody } from './api/ops';
import { isConfigured, mutate, sync, useStore } from './api/store';
import { parseBulk } from './data/bulk';
import { useKitchen } from './hooks/useKitchen';
import { Buy } from './screens/Buy';
import { Cook } from './screens/Cook';
import { Eaten } from './screens/Eaten';
import { Fridge } from './screens/Fridge';
import { Recipes } from './screens/Recipes';
import { Settings } from './screens/Settings';
import { Setup } from './screens/Setup';
import { IconBook, IconCart, IconFridge, IconGear, IconHistory, IconPot } from './ui/icons';
import { TimerChips, useTimerTicker } from './ui/TimerBar';
import { dismissToast, toast, useToast } from './ui/toast';
import { usePullToRefresh } from './ui/usePullToRefresh';

type Tab = 'cook' | 'fridge' | 'buy' | 'eaten' | 'recipes' | 'settings';

const TABS: { id: Exclude<Tab, 'settings'>; label: string; title: string; icon: ReactNode }[] = [
  { id: 'cook', label: 'Кухня', title: 'Кухня', icon: <IconPot /> },
  { id: 'fridge', label: 'Холодильник', title: 'Холодильник', icon: <IconFridge /> },
  { id: 'buy', label: 'Магазин', title: 'Магазин', icon: <IconCart /> },
  { id: 'eaten', label: 'Дневник', title: 'Дневник', icon: <IconHistory /> },
  { id: 'recipes', label: 'Рецепты', title: 'Рецепты', icon: <IconBook /> },
];

const handledInbox = new Set<string>();

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '') as Tab;
  return [...TABS.map((t) => t.id), 'settings'].includes(h) ? h : 'cook';
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
  const pull = usePullToRefresh(() => sync());
  useTimerTicker();

  // Надиктованное через Siri лежит в листе «Входящие» — разбираем и кладём в холодильник.
  const inbox = useStore((s) => s.view.inbox);
  useEffect(() => {
    if (!inbox?.length) return;
    const fresh = inbox.filter((row) => !handledInbox.has(row.id));
    if (!fresh.length) return;
    const ops: OpBody[] = [];
    const names: string[] = [];
    for (const row of fresh) {
      handledInbox.add(row.id);
      parseBulk(row.text).forEach((l, i) => {
        // id из id входящей строки: если оба телефона разберут одновременно, строка не задвоится.
        ops.push({ op: 'fridge.upsert', row: { id: `${row.id}-${i}`, name: l.name, where: l.where, qty: l.qty, expires: l.expires, note: '' } });
        names.push(`${l.name}${l.qty ? ` ${l.qty}` : ''}`);
      });
      ops.push({ op: 'inbox.delete', id: row.id });
    }
    mutate(ops);
    if (names.length) toast(`От Siri в холодильник: ${names.join(', ')}`);
  }, [inbox]);

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (t: string) => {
    location.hash = t;
    window.scrollTo(0, 0);
  };

  const current = TABS.find((t) => t.id === tab);

  return (
    <>
      <div className="ptr" style={{ height: pull.distance }} aria-hidden>
        <span className={pull.ready ? 'ready' : ''}>{pull.ready ? '↻ отпусти' : '↓'}</span>
      </div>
      <header className="top">
        <h1>{current?.title ?? 'Настройки'}</h1>
        <div className="top-right">
          <SyncBadge syncing={syncing} queue={queue} error={error} />
          <button className="icon-btn" onClick={() => go('settings')} aria-label="Настройки">
            <IconGear />
          </button>
        </div>
      </header>

      <TimerChips />
      <main className={`content tab-${tab}`}>
        {!hasData && syncing ? (
          <div className="empty">Загружаю данные из таблицы…</div>
        ) : (
          <>
            {tab === 'cook' && <Cook k={k} go={go} />}
            {tab === 'fridge' && <Fridge k={k} />}
            {tab === 'buy' && <Buy k={k} />}
            {tab === 'eaten' && <Eaten k={k} />}
            {tab === 'recipes' && <Recipes k={k} />}
            {tab === 'settings' && <Settings k={k} onBack={() => go('cook')} />}
          </>
        )}
      </main>

      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
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
