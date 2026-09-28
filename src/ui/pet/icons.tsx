// Рисованные значки для игры — вместо эмодзи: награды, лица сытости, сердечко.

const INK = '#3b2a1e';

/** Значок награды: бантик, колпак, очки, шарф, корона, обои. */
export function RewardIcon({ id, locked }: { id: string; locked?: boolean }) {
  if (locked) {
    return (
      <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
        <rect x="9" y="18" width="22" height="16" rx="4" fill="#c9bba6" />
        <path d="M13 18 v-4 a7 7 0 0 1 14 0 v4" stroke="#a8977e" strokeWidth="4" fill="none" />
        <circle cx="20" cy="26" r="2.5" fill="#8a7560" />
      </svg>
    );
  }
  switch (id) {
    case 'bow':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <path d="M20 20 L6 11 Q3 20 6 29 Z M20 20 L34 11 Q37 20 34 29 Z" fill="#ff6fa0" stroke="#d94a7c" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="20" cy="20" r="5" fill="#ff8fb5" stroke="#d94a7c" strokeWidth="2" />
        </svg>
      );
    case 'chef':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <circle cx="12" cy="16" r="7" fill="#fff" stroke="#d9d0c2" strokeWidth="2" />
          <circle cx="20" cy="12" r="8" fill="#fff" stroke="#d9d0c2" strokeWidth="2" />
          <circle cx="28" cy="16" r="7" fill="#fff" stroke="#d9d0c2" strokeWidth="2" />
          <rect x="10" y="18" width="20" height="14" rx="3" fill="#fff" stroke="#d9d0c2" strokeWidth="2" />
        </svg>
      );
    case 'glasses':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <circle cx="12" cy="21" r="7" fill="#dff1ff" stroke={INK} strokeWidth="3" />
          <circle cx="28" cy="21" r="7" fill="#dff1ff" stroke={INK} strokeWidth="3" />
          <path d="M19 20 Q20 17 21 20" stroke={INK} strokeWidth="3" fill="none" />
        </svg>
      );
    case 'scarf':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <path d="M6 14 Q20 22 34 14 L34 21 Q20 29 6 21 Z" fill="#e2483d" />
          <path d="M24 22 L28 36 L21 36 L19 24 Z" fill="#e2483d" />
          <path d="M11 17 v6 M17 19 v6 M23 19 v6 M29 17 v6" stroke="#fff" strokeWidth="2" opacity="0.6" />
        </svg>
      );
    case 'crown':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <path d="M7 30 L5 12 L14 20 L20 8 L26 20 L35 12 L33 30 Z" fill="#ffc83d" stroke="#d99a10" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="20" cy="24" r="3" fill="#e2483d" />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="4" fill="#fff6ee" />
          <path d="M6 13h28M6 22h28M6 31h28M13 6v28M22 6v28M31 6v28" stroke="#f2a49d" strokeWidth="4" opacity="0.7" />
        </svg>
      );
    case 'stars':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="4" fill="#33407a" />
          <path d="M16 12 l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#ffd966" />
          <circle cx="27" cy="26" r="2" fill="#ffd966" />
          <circle cx="12" cy="28" r="1.5" fill="#fff" />
        </svg>
      );
    case 'gold':
      return (
        <svg viewBox="0 0 40 40" className="reward-icon" aria-hidden>
          <rect x="6" y="6" width="28" height="28" rx="4" fill="#ffe08a" />
          <path d="M6 20 L20 6 M6 34 L34 6 M20 34 L34 20" stroke="#fff0bd" strokeWidth="5" />
        </svg>
      );
    default:
      return null;
  }
}

/** Лицо сытости: от «очень голоден» (0) до «объелся» (4). */
export function MoodFace({ level }: { level: 0 | 1 | 2 | 3 | 4 }) {
  const mouths = [
    'M13 27 Q20 21 27 27', // очень голоден — грустная дуга
    'M14 27 Q20 24 26 27',
    'M14 26 L26 26',
    'M14 24 Q20 29 26 24',
    'M13 23 Q20 31 27 23', // объелся — широкая улыбка
  ];
  const fill = ['#ffd2c2', '#ffe0c7', '#ffedc2', '#fff3b8', '#ffe79a'][level];
  return (
    <svg viewBox="0 0 40 40" className="mood-face" aria-hidden>
      <circle cx="20" cy="20" r="17" fill={fill} stroke="#e8c79e" strokeWidth="2" />
      {level === 0 ? (
        <>
          <path d="M11 15 L16 17 M29 15 L24 17" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="14" cy="19" r="2" fill={INK} />
          <circle cx="26" cy="19" r="2" fill={INK} />
        </>
      ) : level === 4 ? (
        <>
          <path d="M11 17 Q14 14 17 17 M23 17 Q26 14 29 17" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="11" cy="23" rx="3" ry="2" fill="#ff9aa6" opacity="0.7" />
          <ellipse cx="29" cy="23" rx="3" ry="2" fill="#ff9aa6" opacity="0.7" />
        </>
      ) : (
        <>
          <circle cx="14" cy="17" r="2.2" fill={INK} />
          <circle cx="26" cy="17" r="2.2" fill={INK} />
        </>
      )}
      <path d={mouths[level]} stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {level === 4 && <path d="M18 28 Q20 32 22 28" fill="#ff8095" />}
    </svg>
  );
}

/** Маленькое пухлое сердечко. */
export function HeartIcon() {
  return (
    <svg viewBox="0 0 32 30" className="heart-icon" aria-hidden>
      <path d="M16 28 C 6 20, 1 14, 1 9 C 1 4, 5 1, 9 1 C 12 1, 14.5 3, 16 6 C 17.5 3, 20 1, 23 1 C 27 1, 31 4, 31 9 C 31 14, 26 20, 16 28 Z" fill="#ff6f9a" />
      <ellipse cx="9" cy="8" rx="3.5" ry="2.2" fill="#fff" opacity="0.55" transform="rotate(-25 9 8)" />
    </svg>
  );
}
