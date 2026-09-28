import { describe, expect, it } from 'vitest';
import { awakeHours, hungerText, lastMealAt, levelOf, moodOf, satiety, xpForLevel, xpOf, streakOf, streakTalk, weatherTalk } from '../src/logic/pet';
import type { EatenRow } from '../src/types';

const row = (id: string, date: string, meal: string, dish = 'Борщ', recipeId = 'borsch'): EatenRow => ({ id, date, meal, dish, who: 'оба', score: '', recipeId });
const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime();

describe('сытость', () => {
  it('сразу после еды — сыт, через полдня — голоден', () => {
    const eaten = [row('1', '28.09.2026', 'обед')];
    expect(satiety(eaten, {}, at(28, 14))).toBe(100);
    expect(satiety(eaten, {}, at(28, 20))).toBeLessThan(65);
    expect(satiety(eaten, {}, at(29, 13))).toBe(0);
  });

  it('ночью не голодает', () => {
    expect(awakeHours(at(28, 22), at(29, 8))).toBe(1);
  });

  it('точное время с телефона важнее приёма пищи', () => {
    const eaten = [row('x', '28.09.2026', 'ужин')];
    expect(lastMealAt(eaten, { x: at(28, 18) }, at(28, 19))).toBe(at(28, 18));
    // Ужин записали в 19:00 — считаем «сейчас», а не 20:00
    expect(lastMealAt(eaten, {}, at(28, 19))).toBe(at(28, 19));
  });

  it('нет записей — голодный', () => {
    expect(satiety([], {}, at(28, 12))).toBe(25);
    expect(hungerText(null, at(28, 12))).toBe('ещё ни разу не ел');
  });
});

describe('настроение', () => {
  const day = new Date(2026, 8, 28, 13);
  it('по сытости и порче продуктов', () => {
    expect(moodOf(90, 0, day)).toBe('happy');
    expect(moodOf(50, 0, day)).toBe('peckish');
    expect(moodOf(20, 0, day)).toBe('hungry');
    expect(moodOf(5, 0, day)).toBe('angry');
    expect(moodOf(80, 2, day)).toBe('sad');
    expect(moodOf(80, 0, new Date(2026, 8, 28, 2))).toBe('sleeping');
  });
});

describe('опыт и уровни', () => {
  it('+10 за еду, +20 за новое блюдо, без повторов', () => {
    const eaten = [row('1', '26.09.2026', 'обед'), row('2', '27.09.2026', 'обед'), row('3', '27.09.2026', 'обед'), row('4', '27.09.2026', 'ужин', 'Карри', 'curry')];
    expect(xpOf(eaten)).toBe(10 + 20 + 10 + 10 + 20);
  });

  it('уровни растут', () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(xpForLevel(2)).level).toBe(2);
    expect(levelOf(xpForLevel(5) + 5).level).toBe(5);
    expect(levelOf(60).progress).toBeCloseTo(0.25);
  });
});

import { kindOf } from '../src/logic/weather';

describe('погода за окном', () => {
  it('коды WMO → что рисовать', () => {
    expect(kindOf(0, 5)).toBe('clear');
    expect(kindOf(2, 50)).toBe('partly');
    expect(kindOf(3, 100)).toBe('cloudy');
    expect(kindOf(61, 100)).toBe('rain');
    expect(kindOf(53, 90)).toBe('drizzle');
    expect(kindOf(95, 100)).toBe('storm');
    expect(kindOf(45, 100)).toBe('fog');
    expect(kindOf(73, 100)).toBe('snow');
  });
});

import { calibrate, DEFAULT_METABOLISM, eatenBy, satietyOf } from '../src/logic/pet';

describe('личная сытость и метаболизм', () => {
  const eaten = [row('a', '28.09.2026', 'завтрак', 'Каша', 'kasha'), { ...row('b', '28.09.2026', 'обед'), who: 'Кристина' }];

  it('у каждого — свои записи и общие', () => {
    expect(eatenBy(eaten, 'Крис').map((r) => r.id)).toEqual(['a']);
    expect(eatenBy(eaten, 'Кристина').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('ручная отметка важнее расчёта и дальше убывает', () => {
    const now = at(28, 12);
    const m = calibrate(eatenBy(eaten, 'Крис'), {}, now, 40);
    expect(satietyOf(eatenBy(eaten, 'Крис'), {}, now, m)).toBe(40);
    expect(satietyOf(eatenBy(eaten, 'Крис'), {}, at(28, 15), m)).toBeLessThan(40);
  });

  it('голодаю быстрее — темп становится короче', () => {
    // Завтрак в 9, в 12 уже «голоден на 60%» → до пустого живота ~5 ч, а не 14
    const m = calibrate(eatenBy(eaten, 'Крис'), {}, at(28, 12), 40, DEFAULT_METABOLISM);
    expect(m.fullHours).toBeLessThan(DEFAULT_METABOLISM.fullHours);
    expect(m.n).toBe(1);
  });

  it('новая еда после отметки снова наполняет', () => {
    const m = calibrate(eatenBy(eaten, 'Кристина'), {}, at(28, 12), 20);
    expect(satietyOf(eatenBy(eaten, 'Кристина'), { b: at(28, 13) }, at(28, 13), m)).toBe(100);
  });
});

import { metabolismOf } from '../src/logic/pet';

describe('темп голода по росту и весу', () => {
  it('Крис голодает через ≈4,5 ч, Кристина — ≈5 ч', () => {
    expect(metabolismOf('Крис').fullHours * 0.65).toBeCloseTo(4.55, 1);
    expect(metabolismOf('Кристина').fullHours * 0.65).toBeCloseTo(5.2, 1);
  });
  it('выученный по отметкам темп важнее расчёта', () => {
    expect(metabolismOf('Крис', { fullHours: 9, n: 2, override: null }).fullHours).toBe(9);
  });
});

import { gainOf, kcalOf, productKcal } from '../src/logic/kcal';
import { BUILTIN_RECIPES } from '../src/data/recipes';

describe('сытость по калориям', () => {
  it('банан — перекус, а не полный обед', () => {
    const banana = { ...row('k1', '28.09.2026', 'перекус', 'Банан', ''), who: 'Крис' };
    expect(kcalOf(banana, BUILTIN_RECIPES)).toBe(105);
    expect(gainOf(105, 'Крис')).toBeLessThan(20);
    expect(gainOf(105, 'Кристина')).toBeGreaterThan(gainOf(105, 'Крис'));
  });

  it('обед по рецепту почти наполняет', () => {
    const borsch = row('k2', '28.09.2026', 'обед');
    expect(gainOf(kcalOf(borsch, BUILTIN_RECIPES), 'Крис')).toBeGreaterThan(80);
  });

  it('банан при голоде прибавляет немного', () => {
    const banana = { ...row('k3', '28.09.2026', 'перекус', 'Банан', ''), who: 'Крис' };
    const gain = (r: EatenRow) => gainOf(kcalOf(r, BUILTIN_RECIPES), 'Крис');
    // Голоден (ручная отметка 10), через минуту съел банан
    const m = { fullHours: 7, n: 0, override: { value: 10, at: at(28, 12) } };
    const v = satietyOf([banana], { k3: at(28, 12) + 60_000 }, at(28, 12) + 120_000, m, gain);
    expect(v).toBeGreaterThan(15);
    expect(v).toBeLessThan(35);
  });

  it('калории продуктов: штуки и граммы', () => {
    expect(productKcal('банан', 2)).toBe(210);
    expect(productKcal('рис', 100)).toBe(350);
  });
});

describe('серия, погода, перекус при калибровке', () => {
  const day = (offset: number) => {
    const d = new Date(2026, 8, 28 + offset);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  };
  const row = (date: string, dish = 'Суп', meal = 'обед'): EatenRow => ({ id: date + dish, date, meal, dish, who: 'оба', score: '', recipeId: '' }) as EatenRow;

  it('считает дни подряд, сегодня можно ещё не есть', () => {
    const today = new Date(2026, 8, 28, 10);
    expect(streakOf([row(day(0)), row(day(-1)), row(day(-2)), row(day(-4))], today)).toBe(3);
    expect(streakOf([row(day(-1)), row(day(-2))], today)).toBe(2);
    expect(streakOf([row(day(-3))], today)).toBe(0);
    expect(streakTalk(1)).toBeNull();
    expect(streakTalk(3)).toContain('3 дня');
    expect(streakTalk(5)).toContain('5 дней');
  });

  it('говорит о погоде без эмодзи', () => {
    const t = weatherTalk('rain', false, 3);
    expect(t.length).toBeGreaterThan(3);
    expect(/\p{Extended_Pictographic}/u.test(t)).toBe(false);
  });

  it('перекус не делает метаболизм «быстрым»', () => {
    const now = new Date(2026, 8, 28, 13).getTime();
    const snack = row(day(0), 'Банан', 'перекус');
    const exact = { [snack.id]: now - 2 * 3600e3 };
    const m = { fullHours: 7, n: 0, override: { value: 40, at: now - 3 * 3600e3 } };
    // Было 40%, банан +15 → 55, через 2 ч чувствую 30% — это голод, но не повод считать темп 5 ч
    const next = calibrate([snack], exact, now, 30, m, () => 15);
    expect(next.fullHours).toBeGreaterThan(6);
  });
});
