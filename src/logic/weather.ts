// Погода в Валенсии за окном кухни: Open-Meteo, без ключа. Обновляем раз в 20 минут,
// последнюю погоду помним — без сети окно показывает её.

import { useEffect, useState } from 'react';

/** Координаты города, не телефона. */
const VALENCIA = { lat: 39.47, lon: -0.38 };
const KEY = 'kukhnya.weather';
const TTL = 20 * 60_000;

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Weather {
  kind: WeatherKind;
  /** °C */
  temp: number;
  /** 0–100 */
  clouds: number;
  isDay: boolean;
  at: number;
}

/** Код погоды WMO → что рисуем в окне. */
export function kindOf(code: number, clouds: number): WeatherKind {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3 || clouds > 80) return 'cloudy';
  if (code === 1 || code === 2 || clouds > 30) return 'partly';
  return 'clear';
}

export const WEATHER_ICON: Record<WeatherKind, string> = {
  clear: '☀️',
  partly: '⛅',
  cloudy: '☁️',
  fog: '🌫',
  drizzle: '🌦',
  rain: '🌧',
  snow: '❄️',
  storm: '⛈',
};

/** Что Гера говорит о погоде. */
export const WEATHER_PHRASE: Record<WeatherKind, string> = {
  clear: 'На улице солнышко ☀️',
  partly: 'Облачка плывут ⛅',
  cloudy: 'Пасмурно… самое время для супа',
  fog: 'Туман, ничего не видно 🌫',
  drizzle: 'Моросит… хорошо, что мы дома',
  rain: 'Дождь! Никуда не пойдём 🌧',
  snow: 'Снег в Валенсии?! ❄️',
  storm: 'Гроза… мне страшно ⛈',
};

function load(): Weather | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Weather) : null;
  } catch {
    return null;
  }
}

export async function fetchWeather(): Promise<Weather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${VALENCIA.lat}&longitude=${VALENCIA.lon}` +
    '&current=temperature_2m,weather_code,is_day,cloud_cover&timezone=Europe%2FMadrid';
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number; cloud_cover: number } };
    const c = j.current;
    if (!c) return null;
    const w: Weather = { kind: kindOf(c.weather_code, c.cloud_cover), temp: Math.round(c.temperature_2m), clouds: c.cloud_cover, isDay: !!c.is_day, at: Date.now() };
    try {
      localStorage.setItem(KEY, JSON.stringify(w));
    } catch {
      /* ничего */
    }
    return w;
  } catch {
    return null;
  }
}

/** Текущая погода; обновляется сама. */
export function useWeather(): Weather | null {
  const [w, setW] = useState<Weather | null>(load);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      const cur = load();
      if (cur && Date.now() - cur.at < TTL) return;
      void fetchWeather().then((x) => alive && x && setW(x));
    };
    tick();
    const id = window.setInterval(tick, 5 * 60_000);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return w;
}
