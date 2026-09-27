// Мелкие общие компоненты: шторка снизу, переключатель, заголовок секции.

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons';

export function Sheet({
  title,
  onClose,
  children,
  footer,
  tall,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Постоянная высота: содержимое меняется, а шторка не прыгает. */
  tall?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Один раз на открытие: onClose часто новая функция на каждый рендер, и перезапуск
  // этого эффекта дёргал страницу под шторкой.
  useEffect(() => {
    // Не прокручивать страницу под шторкой. На iPhone overflow:hidden не помогает —
    // фиксируем body на месте и потом возвращаем прокрутку туда же.
    const y = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    body.position = 'fixed';
    body.top = `-${y}px`;
    body.width = '100%';
    body.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      Object.assign(body, prev);
      window.scrollTo(0, y);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  // В body, а не внутри карточки: у карточки бывает transform, и тогда position:fixed
  // считается от карточки — шторка застревает внутри неё (так было в «Рецептах» на iPhone).
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${tall ? ' tall' : ''}`} ref={ref} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <IconClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, hint, action, children }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/** Правильное окончание: 1 блюдо, 2 блюда, 5 блюд. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
