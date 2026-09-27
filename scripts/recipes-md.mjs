// Читаемый список рецептов для проверки глазами: node scripts/recipes-md.mjs > docs/РЕЦЕПТЫ.md
import { readFileSync } from 'node:fs';

const recipes = JSON.parse(readFileSync(new URL('../recipes.json', import.meta.url), 'utf8'));
const TYPES = [
  ['breakfast', 'Завтраки'],
  ['batch_lunch', 'Обеды (готовим на 2-3 дня)'],
  ['dinner', 'Ужины'],
  ['weekend', 'Выходные'],
  ['backup', 'Запасные (из кладовой)'],
  ['extra', 'Дополнительно'],
];
const CUISINE = { ru: 'русская', es: 'испанская', world: 'мировая' };
const out = ['# Рецепты «Кухни»', '', `Всего: ${recipes.length}. ✱ — по желанию, «или …» — чем можно заменить.`, ''];
for (const [type, title] of TYPES) {
  const list = recipes.filter((r) => r.type === type);
  out.push(`## ${title} — ${list.length}`, '');
  for (const r of list) {
    const meta = [r.time, CUISINE[r.cuisine], r.cost_eur_for_two ? `~${r.cost_eur_for_two} €` : '', r.has_egg_as_main ? 'яйцо — основа' : '']
      .filter(Boolean)
      .join(' · ');
    out.push(`### ${r.name}`, '', `_${meta}_`, '');
    for (const i of r.ingredients) {
      const alt = i.alt?.length ? ` _или ${i.alt.join(', ')}_` : '';
      out.push(`- ${i.opt ? '✱ ' : ''}${i.p}${i.q ? ` — ${i.q}` : ''}${alt}`);
    }
    out.push('');
  }
}
console.log(out.join('\n'));
