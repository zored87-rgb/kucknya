// Mercadona закрыт по воскресеньям и праздникам. Работает 9:00–21:30.

import { addDays, formatDate, parseDate } from './dates';

export interface Holiday {
  date: string;
  name: string;
}

export function holidayOn(d: Date, holidays: Holiday[]): Holiday | null {
  const key = formatDate(d);
  return holidays.find((h) => {
    const p = parseDate(h.date);
    return p ? formatDate(p) === key : false;
  }) ?? null;
}

export function closedReason(d: Date, holidays: Holiday[]): string | null {
  const h = holidayOn(d, holidays);
  if (h) return h.name || 'праздник';
  if (d.getDay() === 0) return 'воскресенье';
  return null;
}

const CLOSE_MIN = 21 * 60 + 30;
const OPEN_MIN = 9 * 60;

/** Предупреждение для вкладки «Купить» или null. */
export function mercadonaWarning(now: Date, holidays: Holiday[]): string | null {
  const today = closedReason(now, holidays);
  const tomorrow = closedReason(addDays(now, 1), holidays);
  const min = now.getHours() * 60 + now.getMinutes();
  if (today) {
    return tomorrow
      ? `Mercadona закрыт сегодня и завтра (${today}, ${tomorrow}).`
      : `Сегодня Mercadona закрыт: ${today}. Откроется завтра в 9:00.`;
  }
  if (tomorrow) {
    if (min >= CLOSE_MIN) return `Завтра Mercadona закрыт (${tomorrow}), а сегодня уже после 21:30.`;
    return `Завтра Mercadona закрыт (${tomorrow}) — купи всё нужное сегодня до 21:30.`;
  }
  if (min >= CLOSE_MIN) return 'Mercadona уже закрыт, откроется завтра в 9:00.';
  if (min < OPEN_MIN) return 'Mercadona откроется в 9:00.';
  return null;
}
