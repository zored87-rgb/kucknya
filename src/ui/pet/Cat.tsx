// Кот по фото игрушки: круглый серый полосатик, светлое пузо-сердечко, светлая мордочка,
// короткие лапки со светлыми кончиками, маленькие круглые ушки.
// Тап по голове — мяукает, по пузу — хихикает, погладить пальцем — мурчит.

import { useEffect, useRef, useState } from 'react';
import type { Mood } from '../../logic/pet';
import { chomp, giggle, hiss, meow, purr } from './sound';

export type Reaction = 'meow' | 'purr' | 'giggle' | 'hiss' | 'wake' | null;

const FUR = '#8c8e93';
const FUR_LIGHT = '#a3a5aa';
const FUR_DARK = '#5c5e63';
const CREAM = '#dcd5c8';
const CREAM_DARK = '#c9c0b0';
const INK = '#2a292d';

export type Face = 'smile' | 'flat' | 'hungry' | 'angry' | 'sad' | 'sleep' | 'meow' | 'purr' | 'giggle' | 'hiss' | 'eat';

export function faceOf(mood: Mood, reaction: Reaction, eating: boolean): Face {
  if (reaction === 'hiss') return 'hiss';
  if (reaction === 'purr') return 'purr';
  if (reaction === 'giggle') return 'giggle';
  if (reaction === 'meow' || reaction === 'wake') return 'meow';
  if (eating) return 'eat';
  return ({ happy: 'smile', peckish: 'flat', hungry: 'hungry', angry: 'angry', sad: 'sad', sleeping: 'sleep' } as const)[mood];
}

interface Heart {
  id: number;
  x: number;
}

export function Cat({
  mood,
  outfit,
  eating,
  talking,
  onReact,
}: {
  mood: Mood;
  outfit?: string;
  eating?: boolean;
  /** Рот открывается, пока кот «говорит» фразу. */
  talking?: boolean;
  onReact?: (r: Exclude<Reaction, null>) => void;
}) {
  const [reaction, setReaction] = useState<Reaction>(null);
  const [hearts, setHearts] = useState<Heart[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const drag = useRef<{ x: number; y: number; dist: number; stroked: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (eating) chomp(5);
  }, [eating]);

  const react = (r: Exclude<Reaction, null>, ms: number) => {
    setReaction(r);
    onReact?.(r);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReaction(null), ms);
  };

  const addHearts = (n: number) => {
    const now = Date.now();
    setHearts((h) => [...h.slice(-8), ...Array.from({ length: n }, (_, i) => ({ id: now + i, x: 25 + Math.random() * 50 }))]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => x.id < now || x.id >= now + n)), 1600);
  };

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, dist: 0, stroked: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.dist += Math.hypot(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
    // Погладили: провели пальцем по коту.
    if (!d.stroked && d.dist > 70) {
      d.stroked = true;
      if (mood === 'angry') {
        hiss();
        react('hiss', 1400);
      } else {
        purr(1.8);
        react('purr', 2000);
        addHearts(3);
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.stroked || d.dist > 12 || eating) return;
    const box = svg.current?.getBoundingClientRect();
    const y = box ? ((e.clientY - box.top) / box.height) * 240 : 0;
    if (mood === 'angry') {
      hiss();
      react('hiss', 1400);
    } else if (mood === 'sleeping') {
      meow(0.8, 0.8);
      react('wake', 1600);
    } else if (y > 125) {
      giggle();
      react('giggle', 1200);
      addHearts(1);
    } else {
      meow(mood === 'hungry' ? 0.9 : 1.1, mood === 'hungry' ? 0.8 : 0.55);
      react('meow', 900);
    }
  };

  const face = faceOf(mood, reaction, !!eating);
  const open = talking && (face === 'smile' || face === 'flat' || face === 'hungry' || face === 'sad');

  return (
    <div className={`cat-wrap mood-${mood}${reaction ? ` r-${reaction}` : ''}${eating ? ' eating' : ''}`}>
      <svg
        ref={svg}
        className="cat"
        viewBox="0 0 200 240"
        role="img"
        aria-label="Кот. Нажми, чтобы он мяукнул, проведи пальцем — погладить"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          <radialGradient id="cat-fur" cx="0.45" cy="0.3" r="0.75">
            <stop offset="0" stopColor={FUR_LIGHT} />
            <stop offset="1" stopColor={FUR} />
          </radialGradient>
          <radialGradient id="cat-cream" cx="0.5" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#e8e2d6" />
            <stop offset="1" stopColor={CREAM} />
          </radialGradient>
        </defs>

        <ellipse className="cat-shadow" cx="100" cy="230" rx="66" ry="8" />

        <g className="cat-tail">
          <path d="M150 204 C 172 200, 188 184, 184 160" stroke={FUR} strokeWidth="17" strokeLinecap="round" fill="none" />
          <path d="M176 186 L 186 180 M181 170 L 191 168" stroke={FUR_DARK} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
        </g>

        <g className="cat-body">
          {/* Лапки торчат в стороны, плечи прячутся за туловищем */}
          <g className="cat-arm arm-l">
            <Arm />
          </g>
          <g transform="translate(200 0) scale(-1 1)">
            <g className="cat-arm arm-r">
              <Arm />
            </g>
          </g>

          {/* Ушки */}
          <g className="cat-ear ear-l">
            <path d="M42 62 C 36 40, 44 24, 60 24 C 72 24, 80 34, 82 44 Z" fill={FUR} />
            <path d="M50 52 C 48 40, 53 32, 61 32 C 68 32, 72 38, 73 44 Z" fill={CREAM_DARK} />
          </g>
          <g className="cat-ear ear-r">
            <path d="M158 62 C 164 40, 156 24, 140 24 C 128 24, 120 34, 118 44 Z" fill={FUR} />
            <path d="M150 52 C 152 40, 147 32, 139 32 C 132 32, 128 38, 127 44 Z" fill={CREAM_DARK} />
          </g>

          {/* Туловище и голова одним «картофелем», пушистый край */}
          <path
            d="M100 30 C 146 30, 168 56, 168 96 C 168 120, 162 132, 165 152 C 171 192, 150 214, 100 214 C 50 214, 29 192, 35 152 C 38 132, 32 120, 32 96 C 32 56, 54 30, 100 30 Z"
            fill="url(#cat-fur)"
            stroke={FUR_DARK}
            strokeOpacity="0.35"
            strokeWidth="2"
          />
          <path
            d="M100 30 C 146 30, 168 56, 168 96 C 168 120, 162 132, 165 152 C 171 192, 150 214, 100 214 C 50 214, 29 192, 35 152 C 38 132, 32 120, 32 96 C 32 56, 54 30, 100 30 Z"
            fill="none"
            stroke={FUR}
            strokeWidth="7"
            strokeDasharray="0.1 6"
            strokeLinecap="round"
          />

          {/* Полоски: лоб, щёки, бока */}
          <g stroke={FUR_DARK} strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.65">
            <path d="M100 38 L 100 54 M89 41 L 91 55 M111 41 L 109 55" />
            <path d="M36 92 Q 44 91 50 96 M36 104 Q 44 103 49 107" />
            <path d="M164 92 Q 156 91 150 96 M164 104 Q 156 103 151 107" />
            <path d="M36 150 Q 46 147 53 154 M37 168 Q 47 165 54 172 M40 186 Q 49 183 56 190" />
            <path d="M164 150 Q 154 147 147 154 M163 168 Q 153 165 146 172 M160 186 Q 151 183 144 190" />
          </g>

          {/* Пузо-сердечко */}
          <path
            d="M100 128 C 84 114, 58 120, 60 150 C 62 180, 84 200, 100 204 C 116 200, 138 180, 140 150 C 142 120, 116 114, 100 128 Z"
            fill="url(#cat-cream)"
          />
          <path
            d="M100 128 C 84 114, 58 120, 60 150 C 62 180, 84 200, 100 204 C 116 200, 138 180, 140 150 C 142 120, 116 114, 100 128 Z"
            fill="none"
            stroke={CREAM}
            strokeWidth="5"
            strokeDasharray="0.1 5"
            strokeLinecap="round"
          />

          {/* Ножки */}
          <ellipse cx="72" cy="216" rx="21" ry="13" fill={FUR} />
          <ellipse cx="128" cy="216" rx="21" ry="13" fill={FUR} />
          <ellipse cx="72" cy="219" rx="15" ry="9" fill={CREAM} />
          <ellipse cx="128" cy="219" rx="15" ry="9" fill={CREAM} />

          <g className="cat-face">
            <Face face={face} open={!!open} />
          </g>

          <Outfit id={outfit} />
        </g>

        {mood === 'sleeping' && !reaction && (
          <g className="cat-zzz" fill={INK}>
            <text x="150" y="40">z</text>
            <text x="160" y="28">z</text>
            <text x="172" y="14">Z</text>
          </g>
        )}
        {(face === 'angry' || face === 'hiss') && (
          <g className="cat-steam" fill="#fff">
            <circle cx="40" cy="22" r="7" />
            <circle cx="160" cy="22" r="7" />
          </g>
        )}
      </svg>
      {hearts.map((h) => (
        <span key={h.id} className="cat-heart" style={{ left: `${h.x}%` }} aria-hidden>
          💛
        </span>
      ))}
    </div>
  );
}

function Arm() {
  return (
    <>
      <ellipse cx="28" cy="144" rx="16" ry="28" transform="rotate(48 28 144)" fill={FUR} />
      <path d="M24 132 Q 30 138 27 147" stroke={FUR_DARK} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.55" />
      <ellipse cx="13" cy="159" rx="13" ry="12.5" fill={CREAM} />
    </>
  );
}

function Face({ face, open }: { face: Face; open: boolean }) {
  const happyEyes = face === 'purr' || face === 'giggle' || face === 'eat';
  return (
    <>
      {/* Красное лицо, когда злится */}
      {(face === 'angry' || face === 'hiss') && <ellipse className="cat-red" cx="100" cy="84" rx="60" ry="46" fill="#ff4b3a" />}

      {/* Румянец */}
      {(face === 'smile' || happyEyes || face === 'meow') && (
        <g fill="#f08c8c" opacity="0.55">
          <ellipse cx="62" cy="102" rx="9" ry="5" />
          <ellipse cx="138" cy="102" rx="9" ry="5" />
        </g>
      )}

      {/* Мордочка */}
      <path d="M100 86 C 116 84, 124 94, 121 104 C 119 114, 109 118, 100 117 C 91 118, 81 114, 79 104 C 76 94, 84 84, 100 86 Z" fill={CREAM} />

      {/* Глаза */}
      {happyEyes || face === 'meow' ? (
        <g stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M69 84 Q 76 76 83 84" />
          <path d="M117 84 Q 124 76 131 84" />
        </g>
      ) : face === 'sleep' ? (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M69 81 Q 76 87 83 81" />
          <path d="M117 81 Q 124 87 131 81" />
        </g>
      ) : face === 'hungry' ? (
        <g className="cat-eyes">
          <ellipse cx="76" cy="81" rx="7.5" ry="8.5" fill={INK} />
          <ellipse cx="124" cy="81" rx="7.5" ry="8.5" fill={INK} />
          <circle cx="79" cy="77.5" r="2.8" fill="#fff" />
          <circle cx="127" cy="77.5" r="2.8" fill="#fff" />
          <circle cx="73.5" cy="84" r="1.4" fill="#fff" />
          <circle cx="121.5" cy="84" r="1.4" fill="#fff" />
        </g>
      ) : (
        <g className="cat-eyes">
          <ellipse cx="76" cy="81" rx="4.8" ry="5.8" fill={INK} />
          <ellipse cx="124" cy="81" rx="4.8" ry="5.8" fill={INK} />
          <circle cx="77.8" cy="79" r="1.6" fill="#fff" />
          <circle cx="125.8" cy="79" r="1.6" fill="#fff" />
        </g>
      )}

      {/* Брови */}
      {(face === 'angry' || face === 'hiss') && (
        <g stroke={INK} strokeWidth="4" strokeLinecap="round">
          <path d="M65 68 L 86 75" />
          <path d="M135 68 L 114 75" />
        </g>
      )}
      {(face === 'hungry' || face === 'sad') && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M67 71 L 84 66" />
          <path d="M133 71 L 116 66" />
        </g>
      )}
      {face === 'sad' && <path className="cat-tear" d="M70 90 Q 66 97 70 100 Q 74 97 70 90 Z" fill="#7cc4ff" />}

      {/* Нос */}
      <path d="M95 94 Q 100 91 105 94 Q 103 99 100 100 Q 97 99 95 94 Z" fill="#6f6366" />

      {/* Рот */}
      <Mouth face={face} open={open} />
    </>
  );
}

function Mouth({ face, open }: { face: Face; open: boolean }) {
  const stroke = { stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round' as const, fill: 'none' };
  if (face === 'angry' || face === 'hiss') {
    return (
      <g>
        <path d="M86 106 Q 100 101 114 106 Q 113 119 100 119 Q 87 119 86 106 Z" fill="#4a2a2e" />
        <path d="M89 106 L 92 111 L 95 105 L 98 110 L 101 104 L 104 110 L 107 105 L 110 111 L 112 106" fill="#fff" />
      </g>
    );
  }
  if (face === 'meow' || face === 'giggle' || open) {
    return (
      <g className={open ? 'cat-talk' : ''}>
        <path d="M90 101 Q 95 106 100 101 Q 105 106 110 101" {...stroke} />
        <ellipse className="cat-mouth-open" cx="100" cy="109" rx="7" ry="7.5" fill="#5a3438" />
        <ellipse cx="100" cy="113" rx="4" ry="2.6" fill="#e67a86" />
      </g>
    );
  }
  if (face === 'eat') {
    return (
      <g className="cat-chomp">
        <ellipse cx="100" cy="107" rx="8" ry="6" fill="#5a3438" />
      </g>
    );
  }
  if (face === 'hungry') return <ellipse cx="100" cy="108" rx="3.5" ry="4" fill="#5a3438" />;
  if (face === 'sad') return <path d="M92 109 Q 100 103 108 109" {...stroke} />;
  if (face === 'flat') return <path d="M91 103 Q 95 106 100 103 Q 105 106 109 103" {...stroke} />;
  return <path d="M89 101 Q 94.5 108 100 101 Q 105.5 108 111 101" {...stroke} />;
}

/** Наряды за уровни. */
function Outfit({ id }: { id?: string }) {
  switch (id) {
    case 'bow':
      return (
        <g transform="translate(138 38) rotate(18)">
          <path d="M0 0 L -16 -10 L -16 10 Z M0 0 L 16 -10 L 16 10 Z" fill="#ff6fa0" stroke="#d94a7c" strokeWidth="2" strokeLinejoin="round" />
          <circle r="5" fill="#ff8fb5" stroke="#d94a7c" strokeWidth="2" />
        </g>
      );
    case 'chef':
      return (
        <g>
          <circle cx="84" cy="10" r="15" fill="#fff" stroke="#d9d4cc" strokeWidth="2" />
          <circle cx="100" cy="4" r="17" fill="#fff" stroke="#d9d4cc" strokeWidth="2" />
          <circle cx="116" cy="10" r="15" fill="#fff" stroke="#d9d4cc" strokeWidth="2" />
          <rect x="74" y="12" width="52" height="22" rx="5" fill="#fff" stroke="#d9d4cc" strokeWidth="2" />
        </g>
      );
    case 'glasses':
      return (
        <g stroke={INK} strokeWidth="3" fill="rgba(255,255,255,0.18)">
          <circle cx="76" cy="81" r="12" />
          <circle cx="124" cy="81" r="12" />
          <path d="M88 80 Q 100 74 112 80" fill="none" />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path d="M44 118 Q 100 138 156 118 L 158 132 Q 100 152 42 132 Z" fill="#e2483d" />
          <path d="M120 132 L 128 170 L 112 172 L 108 136 Z" fill="#e2483d" />
          <path d="M60 126 L 58 136 M80 131 L 79 142 M100 133 L 100 144 M120 131 L 121 142 M140 126 L 142 136" stroke="#fff" strokeWidth="3" opacity="0.6" />
        </g>
      );
    case 'crown':
      return (
        <g transform="translate(0 2)">
          <path d="M74 30 L 70 6 L 86 18 L 100 0 L 114 18 L 130 6 L 126 30 Z" fill="#ffc83d" stroke="#d99a10" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="100" cy="20" r="4" fill="#e2483d" />
          <circle cx="84" cy="24" r="3" fill="#4aa3ff" />
          <circle cx="116" cy="24" r="3" fill="#4aa3ff" />
        </g>
      );
    default:
      return null;
  }
}
