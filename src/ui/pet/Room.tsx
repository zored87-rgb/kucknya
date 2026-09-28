// Кухня-комната: кот в центре, вокруг холодильник, книга рецептов, дневник и корзина.
// Нажимаешь на предмет — открывается нужный раздел.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Kitchen } from '../../hooks/useKitchen';
import { parseDate, daysBetween } from '../../logic/dates';
import { useWeather, WEATHER_ICON, WEATHER_PHRASE } from '../../logic/weather';
import { hungerText, isNight, lastMealAt, levelOf, moodOf, phrase, satiety, xpOf, type Mood } from '../../logic/pet';
import { productLabel } from '../labels';
import { Cat, faceOf, type Reaction } from './Cat';
import type { SceneState, Target } from './scene/kitchenScene';
import { angryMeow, audioReady, giggle, hiss, meow, purr } from './sound';
import { LevelUp, Wardrobe } from './Wardrobe';
import { setPet, usePet } from './petStore';

const REACTION_TEXT: Record<Exclude<Reaction, null>, string> = {
  meow: 'Мяу!',
  purr: 'Мррррр 💛',
  giggle: 'Хи-хи, щекотно!',
  hiss: 'Ш-ш-ш! Сначала покорми!',
  wake: 'Мрр? Я сплю…',
};

const Scene3D = lazy(() => import('./scene/Scene3D'));

/** WebGL есть и 3D не падало раньше. */
function can3d(): boolean {
  try {
    if (localStorage.getItem('kukhnya.no3d')) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const TARGET_TAB: Record<Target, string> = { fridge: 'fridge', recipes: 'recipes', eaten: 'eaten', buy: 'buy', feed: '', settings: 'settings' };

/** Небо в окне по времени: утро, день, вечер, ночь. */
function skyOf(h: number): string {
  if (h >= 21 || h < 6) return 'night';
  if (h < 9) return 'morning';
  if (h < 18) return 'day';
  return 'evening';
}

export function Room({
  k,
  go,
  onFeed,
  full,
  sync,
}: {
  k: Kitchen;
  go: (tab: string) => void;
  onFeed: () => void;
  /** На весь экран — главный экран приложения. */
  full?: boolean;
  /** Значок синхронизации в углу. */
  sync?: React.ReactNode;
}) {
  const pet = usePet();
  const weather = useWeather();
  const [now, setNow] = useState(() => Date.now());
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100));
  const [say, setSay] = useState<string | null>(null);
  const [eating, setEating] = useState(false);
  const [xpFloat, setXpFloat] = useState<number | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [wardrobe, setWardrobe] = useState(false);
  const [try3d, setTry3d] = useState(can3d);
  const [ready3d, setReady3d] = useState(false);
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number }>>({});
  const [reaction, setReaction] = useState<Reaction>(null);
  const [heartsKey, setHeartsKey] = useState(0);
  const reactTimer = useRef<number | undefined>(undefined);
  const roomRef = useRef<HTMLDivElement>(null);

  // Раз в минуту пересчитываем голод, раз в 20 секунд — новая фраза.
  useEffect(() => {
    const a = window.setInterval(() => setNow(Date.now()), 60_000);
    const b = window.setInterval(() => setSeed((s) => s + 1), 20_000);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
    };
  }, []);

  const eaten = k.view.eaten;
  const sat = satiety(eaten, pet.fed, now);
  const last = lastMealAt(eaten, pet.fed, now);
  const spoiling = useMemo(
    () => [...k.stock.items.values()].filter((i) => i.daysLeft != null && i.daysLeft <= 1).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    [k.stock],
  );
  const mood: Mood = moodOf(sat, spoiling.length, new Date(now));
  const xp = useMemo(() => xpOf(eaten), [eaten]);
  const lvl = levelOf(xp);

  // Покормили на другой вкладке — кот доедает, когда вернулись на кухню.
  useEffect(() => {
    if (!pet.pendingFeed) return;
    const fresh = Date.now() - pet.pendingFeed < 15 * 60_000;
    setPet({ pendingFeed: 0 });
    if (!fresh) return;
    setEating(true);
    setSay('Ням-ням! 😋');
    const t = window.setTimeout(() => {
      setEating(false);
      setSay('Спасибо! Вкусно!');
    }, 3200);
    return () => window.clearTimeout(t);
  }, [pet.pendingFeed]);

  // «+30 опыта» — сколько прибавилось с прошлого раза.
  useEffect(() => {
    if (pet.lastXp < 0) {
      setPet({ lastXp: xp });
      return;
    }
    if (xp > pet.lastXp) {
      setXpFloat(xp - pet.lastXp);
      setPet({ lastXp: xp });
      const t = window.setTimeout(() => setXpFloat(null), 2600);
      return () => window.clearTimeout(t);
    }
    if (xp < pet.lastXp) setPet({ lastXp: xp });
  }, [xp, pet.lastXp]);

  // Первый запуск: запоминаем уровень без поздравления.
  useEffect(() => {
    if (!pet.seenLevel) setPet({ seenLevel: lvl.level });
  }, [pet.seenLevel, lvl.level]);
  const levelUp = pet.seenLevel > 0 && lvl.level > pet.seenLevel;

  // Сам по себе мяукает: сытый — изредка, голодный — часто, злой — сердито.
  useEffect(() => {
    if (!full) return;
    const chance: Record<Mood, number> = { happy: 0.12, peckish: 0.2, hungry: 0.38, angry: 0.45, sad: 0.16, sleeping: 0 };
    const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !audioReady() || eating || say) return;
      if (Math.random() > chance[mood]) return;
      if (mood === 'angry') {
        angryMeow();
        setSay(pick(['МЯУ!!', 'Р-р-мяу!', 'Мррау!!']));
      } else {
        meow(mood === 'hungry' ? 0.95 : 1, mood === 'hungry' ? 1.3 : 0.6);
        setSay(mood === 'hungry' ? pick(['Мя-я-яу…', 'Мяу! Есть хочу', 'Мррр-мяу?']) : pick(['Мяу!', 'Мрр?', 'Мяу 💛']));
      }
    }, 9000);
    return () => window.clearInterval(id);
  }, [full, mood, eating, say]);

  // Фраза гаснет через 3 секунды после реакции.
  useEffect(() => {
    if (!say) return;
    const t = window.setTimeout(() => setSay(null), 3000);
    return () => window.clearTimeout(t);
  }, [say]);

  const moodText = (() => {
    if (mood === 'sad') return `${productLabel(spoiling[0].key)} пропадает! 😿`;
    if (mood === 'hungry' || mood === 'angry') {
      const base = phrase(mood, seed);
      return `${base} ${last ? `Я ${hungerText(last, now)}!` : ''}`.trim();
    }
    // Иногда — про погоду за окном
    if (weather && (mood === 'happy' || mood === 'peckish') && seed % 3 === 0) return WEATHER_PHRASE[weather.kind];
    return phrase(mood, seed);
  })();
  const bubble = say ?? moodText;

  // Реакции 3D-кота на касания (у плоского кота они внутри Cat)
  const react = (r: Exclude<Reaction, null>, ms: number) => {
    setReaction(r);
    setSay(REACTION_TEXT[r]);
    window.clearTimeout(reactTimer.current);
    reactTimer.current = window.setTimeout(() => setReaction(null), ms);
  };
  const catTap = (part: 'head' | 'belly') => {
    if (eating) return;
    if (mood === 'angry') {
      hiss();
      react('hiss', 1400);
    } else if (mood === 'sleeping') {
      meow(0.85, 1.2);
      react('wake', 1600);
    } else if (part === 'belly') {
      giggle();
      react('giggle', 1200);
      setHeartsKey((x) => x + 1);
    } else {
      meow(mood === 'hungry' ? 0.92 : 1, mood === 'hungry' ? 1.3 : 0.9);
      react('meow', 1000);
    }
  };
  const catStroke = () => {
    if (mood === 'angry') {
      hiss();
      react('hiss', 1400);
    } else {
      purr(1.8);
      react('purr', 2000);
      setHeartsKey((x) => x + 1);
    }
  };

  const open = (tab: string) => {
    setOpening(tab);
    window.setTimeout(() => {
      setOpening(null);
      go(tab);
    }, 380);
  };

  const weekMeals = eaten.filter((r) => {
    const d = parseDate(r.date);
    const ago = d ? daysBetween(d, k.today) : -1;
    return ago >= 0 && ago < 7;
  }).length;
  const toBuy = k.view.shopping.filter((s) => !s.bought).length;
  const h = new Date(now).getHours();
  const sceneState: SceneState = useMemo(
    () => ({
      face: faceOf(mood, reaction, eating),
      mood,
      talking: !!say || mood === 'hungry' || mood === 'angry',
      eating,
      reaction,
      outfit: pet.outfit,
      wall: pet.wall,
      sky: skyOf(h),
      night: isNight(new Date(now)),
      spoiling: spoiling.length > 0,
      weekMeals,
      weather: weather?.kind ?? 'clear',
      clouds: weather?.clouds ?? 20,
    }),
    [mood, reaction, eating, say, pet.outfit, pet.wall, h, now, spoiling.length, weekMeals, weather?.kind, weather?.clouds],
  );
  const flat = !ready3d;
  // Подпись не вылезает за край экрана
  const at = (key: string, dy = 0): React.CSSProperties | undefined => {
    const a = anchors[key];
    if (!a) return undefined;
    const w = roomRef.current?.clientWidth ?? 400;
    return { left: Math.min(w - 62, Math.max(62, a.x)), top: a.y + dy };
  };

  const satTone = sat >= 65 ? 'good' : sat >= 35 ? 'ok' : sat >= 10 ? 'low' : 'empty';

  return (
    <div ref={roomRef} className={`room${full ? ' full' : ''} wall-${pet.wall || 'base'} sky-${skyOf(h)}${isNight(new Date(now)) ? ' night' : ''}${ready3d ? ' is-3d' : ''}`}>
      {try3d && (
        <Suspense fallback={null}>
          <Scene3D
            state={sceneState}
            heartsKey={heartsKey}
            onTarget={(t) => (t === 'feed' ? onFeed() : go(TARGET_TAB[t]))}
            onCatTap={catTap}
            onCatStroke={catStroke}
            onAnchors={setAnchors}
            onReady={() => setReady3d(true)}
            onFail={() => {
              try {
                localStorage.setItem('kukhnya.no3d', '1');
              } catch {
                /* ничего */
              }
              setReady3d(false);
              setTry3d(false);
            }}
          />
        </Suspense>
      )}

      <div className="hud">
        <div className="hud-pill hud-food" aria-label={`Сытость ${sat} из 100`}>
          <span className="hud-icon" aria-hidden>
            🍗
          </span>
          <div className="hud-col">
            <b className="hud-name">{pet.name || 'Кот'}</b>
            <div className="hud-bar">
              <i className={satTone} style={{ width: `${Math.max(4, sat)}%` }} />
            </div>
          </div>
        </div>
        {sync && <div className="hud-sync">{sync}</div>}
        <button className="hud-pill hud-level" onClick={() => setWardrobe(true)} aria-label={`Уровень ${lvl.level}. Наряды`}>
          <span className="hud-star">{lvl.level}</span>
          <div className="hud-bar">
            <i className="xp" style={{ width: `${Math.max(4, lvl.progress * 100)}%` }} />
          </div>
          {xpFloat != null && <span className="xp-float">+{xpFloat} опыта</span>}
        </button>
      </div>

      {flat ? (
        <>
          <div className="room-window" aria-hidden>
            <div className="sky">
              <span className="sun" />
              <span className="cloud c1" />
              <span className="cloud c2" />
              <span className="stars" />
            </div>
            <span className="frame-v" />
            <span className="frame-h" />
          </div>

          <button className="obj obj-shelf" onClick={() => open('recipes')} aria-label="Книга рецептов">
            <Shelf />
            <span className="obj-label">Рецепты</span>
          </button>

          <button className="obj obj-diary" onClick={() => open('eaten')} aria-label={`Дневник: ${weekMeals} за неделю`}>
            <span className="diary-page">
              <small>неделя</small>
              <b>{weekMeals}</b>
            </span>
            <span className="obj-label">Дневник</span>
          </button>

          <button className={`obj obj-fridge${opening === 'fridge' ? ' opening' : ''}`} onClick={() => open('fridge')} aria-label={`Холодильник: ${k.stock.items.size} продуктов`}>
            <Fridge spoiling={spoiling.length > 0} />
            {spoiling.length > 0 && <span className="obj-badge warn">{spoiling.length}</span>}
            <span className="obj-label">Холодильник</span>
          </button>

          <div className="floor" aria-hidden />
          <span className="rug" aria-hidden />

          <div className="room-cat">
            <div className={`bubble${mood === 'angry' && !say ? ' b-angry' : ''}`} key={bubble}>
              {bubble}
            </div>
            <Cat mood={mood} outfit={pet.outfit} eating={eating} talking={!!say || mood === 'hungry' || mood === 'angry'} onReact={(r) => setSay(REACTION_TEXT[r])} />
          </div>

          <button className={`obj obj-bowl${eating ? ' full' : ''}`} onClick={onFeed} aria-label="Миска: чем покормить">
            <Bowl full={eating} />
            <span className="obj-label">Покормить</span>
          </button>

          <button className="obj obj-basket" onClick={() => open('buy')} aria-label={`Магазин: купить ${toBuy}`}>
            <Basket />
            {toBuy > 0 && <span className="obj-badge">{toBuy}</span>}
            <span className="obj-label">Магазин</span>
          </button>
        </>
      ) : (
        <>
          {/* Подписи и значки над 3D-предметами — тоже кнопки */}
          <button className="obj-label pin" style={at('fridge', -34)} onClick={() => go('fridge')}>
            Холодильник
          </button>
          {spoiling.length > 0 && (
            <span className="obj-badge warn pin" style={at('fridgeTop')}>
              {spoiling.length}
            </span>
          )}
          <button className="obj-label pin" style={at('recipes', 6)} onClick={() => go('recipes')}>
            Рецепты
          </button>
          <button className="obj-label pin" style={at('eaten', 4)} onClick={() => go('eaten')}>
            Дневник
          </button>
          <button className="obj-label pin" style={at('buy', -34)} onClick={() => go('buy')}>
            Магазин
          </button>
          {toBuy > 0 && (
            <span className="obj-badge pin" style={at('buyTop')}>
              {toBuy}
            </span>
          )}
          {weather && (
            <span className="obj-label pin small weather-tag" style={at('window', 2)}>
              {WEATHER_ICON[weather.kind]} {weather.temp}° Валенсия
            </span>
          )}
          <button className="obj-label pin small" style={at('settings', 4)} onClick={() => go('settings')}>
            ⚙️ Настройки
          </button>
          <button className="obj-label pin feed" style={at('feed', -50)} onClick={onFeed}>
            🍽 Покормить
          </button>
          {anchors.catHead && (
            <div className={`bubble pin3d${mood === 'angry' && !say ? ' b-angry' : ''}`} key={bubble} style={{ left: anchors.catHead.x, top: anchors.catHead.y }}>
              {bubble}
            </div>
          )}
        </>
      )}

      {wardrobe && <Wardrobe level={lvl.level} xp={lvl} onClose={() => setWardrobe(false)} />}
      {levelUp && <LevelUp level={lvl.level} onClose={() => setPet({ seenLevel: lvl.level })} />}
    </div>
  );
}

function Fridge({ spoiling }: { spoiling: boolean }) {
  return (
    <svg viewBox="0 0 100 220" className="fridge-svg" aria-hidden>
      <rect x="4" y="4" width="92" height="212" rx="14" fill="#e9eef2" stroke="#9fb0bd" strokeWidth="3" />
      <g className="fridge-door-top">
        <rect x="8" y="8" width="84" height="64" rx="10" fill="#f7fafc" stroke="#b9c6d0" strokeWidth="2" />
        <rect x="76" y="24" width="7" height="32" rx="3.5" fill="#9fb0bd" />
      </g>
      <g className="fridge-door">
        <rect x="8" y="76" width="84" height="136" rx="10" fill="#f7fafc" stroke="#b9c6d0" strokeWidth="2" />
        <rect x="76" y="92" width="7" height="46" rx="3.5" fill="#9fb0bd" />
        <circle cx="28" cy="100" r="7" fill="#ff7a59" />
        <path d="M44 118 l6 -6 a4 4 0 0 1 6 6 l-6 6 l-6 -6 a4 4 0 0 1 6 -6" fill="#ff6fa0" />
        <rect x="20" y="130" width="26" height="30" rx="3" fill="#fff8d6" stroke="#e8d98a" strokeWidth="1.5" />
        <path d="M24 139 h18 M24 146 h14 M24 153 h16" stroke="#c9b75a" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      {spoiling && (
        <g className="stink" stroke="#7cbf4a" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M32 0 q -6 -8 0 -16 q 6 -8 0 -16" />
          <path d="M62 0 q -6 -8 0 -16 q 6 -8 0 -16" />
          <circle className="fly" cx="84" cy="-14" r="2.5" fill="#333" stroke="none" />
        </g>
      )}
    </svg>
  );
}

function Shelf() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden>
      <rect x="2" y="66" width="116" height="9" rx="3" fill="#b07a4a" />
      <rect x="8" y="22" width="16" height="44" rx="2" fill="#e2483d" />
      <rect x="25" y="16" width="14" height="50" rx="2" fill="#3f8efc" />
      <rect x="40" y="26" width="18" height="40" rx="2" fill="#ffc83d" />
      <rect x="59" y="20" width="12" height="46" rx="2" fill="#52b36b" />
      <path d="M12 30 h8 M29 24 h6 M44 34 h10" stroke="#fff" strokeWidth="2" opacity="0.7" />
      <path d="M86 66 h24 l-3 -18 h-18 z" fill="#d8744a" />
      <path d="M98 48 c -10 -10 -14 -24 -2 -30 c 2 10 6 14 4 30 M98 48 c 8 -12 18 -16 20 -8 c -8 2 -14 4 -20 8" fill="#52b36b" />
    </svg>
  );
}

function Bowl({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 80 44" aria-hidden>
      {full && (
        <g className="bowl-food">
          <circle cx="28" cy="16" r="9" fill="#e8a25a" />
          <circle cx="42" cy="12" r="10" fill="#d9854a" />
          <circle cx="54" cy="17" r="8" fill="#f0b86e" />
        </g>
      )}
      <path d="M6 18 h68 q -4 22 -34 22 q -30 0 -34 -22 z" fill="#3f8efc" stroke="#2b6fd1" strokeWidth="2.5" />
      <path d="M16 26 h48" stroke="#fff" strokeWidth="3" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

function Basket() {
  return (
    <svg viewBox="0 0 90 70" aria-hidden>
      <path d="M22 26 q 23 -30 46 0" stroke="#a0673a" strokeWidth="5" fill="none" />
      <text x="26" y="30" fontSize="20">🥖</text>
      <text x="46" y="30" fontSize="18">🥕</text>
      <path d="M8 28 h74 l-8 36 q -1 4 -5 4 h-48 q -4 0 -5 -4 z" fill="#d49a5c" stroke="#a0673a" strokeWidth="2.5" />
      <path d="M14 40 h62 M17 52 h56" stroke="#a0673a" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}
