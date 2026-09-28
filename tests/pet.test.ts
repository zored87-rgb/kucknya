import { describe, expect, it } from 'vitest';
import { awakeHours, hungerText, lastMealAt, levelOf, moodOf, satiety, xpForLevel, xpOf } from '../src/logic/pet';
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
