// Поле «Добавить продукт»: печатаешь «лук» — выпадают «Лук репчатый», «Лук зелёный»…

import { useState } from 'react';
import { suggestProducts } from '../data/ingredients';
import type { Product } from '../types';
import { IconPlus, IconSearch } from './icons';

export function ProductPicker({
  placeholder = 'Добавить продукт…',
  onPick,
  onRaw,
}: {
  placeholder?: string;
  onPick: (p: Product) => void;
  /** Продукта нет в каталоге — добавить как написано. */
  onRaw?: (text: string) => void;
}) {
  const [q, setQ] = useState('');
  const list = q.trim() ? suggestProducts(q, 8) : [];
  const pick = (p: Product) => {
    setQ('');
    onPick(p);
  };
  return (
    <div className="picker">
      <div className="picker-input">
        <IconSearch />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              if (list[0]) pick(list[0]);
              else if (onRaw) {
                onRaw(q.trim());
                setQ('');
              }
            }
          }}
        />
      </div>
      {q.trim() && (
        <ul className="picker-list">
          {list.map((p) => (
            <li key={p.key}>
              <button onClick={() => pick(p)}>
                <span>{p.name}</span>
                <small>{p.group}</small>
              </button>
            </li>
          ))}
          {onRaw && (
            <li>
              <button
                className="picker-raw"
                onClick={() => {
                  onRaw(q.trim());
                  setQ('');
                }}
              >
                <IconPlus /> <span>Добавить «{q.trim()}» как есть</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
