// Строка продукта в рецепте: есть / замена / по желанию / нет.

import type { IngredientCheck } from '../logic/availability';
import { IconCheck, IconSwap } from './icons';
import { productLabel } from './labels';

/** qText — количество с учётом ×½ / ×2. */
export function IngredientRow({ c, qText }: { c: IngredientCheck; qText?: string }) {
  const name = productLabel(c.ing.p);
  const qt = qText ?? c.ing.q;
  const q = qt ? <span className="ing-q">{qt}</span> : null;
  if (c.have === 'pantry' || c.have === 'enough') {
    return (
      <li className="ing ok">
        <span className="ing-mark">{c.substituted ? <IconSwap /> : <IconCheck />}</span>
        <span className="ing-name">
          {c.substituted ? (
            <>
              {productLabel(c.use!)} <span className="muted">вместо «{name.toLowerCase()}»</span>
            </>
          ) : (
            name
          )}
          {c.have === 'pantry' && <span className="muted"> · кладовая</span>}
          {c.daysLeft != null && c.daysLeft <= 2 && <span className="tag red">скоро испортится</span>}
        </span>
        {q}
      </li>
    );
  }
  if (c.ing.opt) {
    return (
      <li className="ing opt">
        <span className="ing-mark">○</span>
        <span className="ing-name">
          {name} <span className="muted">· по желанию</span>
        </span>
        {q}
      </li>
    );
  }
  return (
    <li className="ing no">
      <span className="ing-mark">✕</span>
      <span className="ing-name">
        {name}
        {c.have === 'short' && <span className="muted"> · маловато</span>}
        {c.ing.alt?.length ? <span className="muted"> · или {c.ing.alt.map((a) => productLabel(a).toLowerCase()).join(', ')}</span> : null}
      </span>
      {q}
    </li>
  );
}
