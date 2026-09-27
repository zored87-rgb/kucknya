// Простые иконки для нижней навигации и кнопок.

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconPot = () => (
  <svg {...base} aria-hidden>
    <path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6Z" />
    <path d="M2 10h2M20 10h2M9 4c0 1.2 1 1.8 1 3M13 4c0 1.2 1 1.8 1 3" />
  </svg>
);

export const IconFridge = () => (
  <svg {...base} aria-hidden>
    <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
    <path d="M5 10h14M8.5 6v1.5M8.5 13v3" />
  </svg>
);

export const IconCart = () => (
  <svg {...base} aria-hidden>
    <path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </svg>
);

export const IconHistory = () => (
  <svg {...base} aria-hidden>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4.5l3 2" />
  </svg>
);

export const IconBook = () => (
  <svg {...base} aria-hidden>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" />
    <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
  </svg>
);

export const IconGear = () => (
  <svg {...base} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base} width={20} height={20} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCheck = () => (
  <svg {...base} width={18} height={18} strokeWidth={2.4} aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconClose = () => (
  <svg {...base} width={18} height={18} strokeWidth={2.2} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconSwap = () => (
  <svg {...base} width={16} height={16} strokeWidth={2.2} aria-hidden>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
);

export const IconSearch = () => (
  <svg {...base} width={18} height={18} aria-hidden>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </svg>
);
