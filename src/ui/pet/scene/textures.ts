// Текстуры рисуем на canvas: мех с полосками, обои, пол, небо в окне, календарь.

import * as THREE from 'three';

export const FUR = '#8e9399';
export const FUR_LIGHT = '#c9ccd0';
export const FUR_DARK = '#3d4146';
export const WHITE = '#f3f1ec';
export const CREAM = WHITE;
export const PINK = '#e9a7aa';

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Ворсинки: тысячи коротких штрихов светлее и темнее основы. */
function fuzz(g: CanvasRenderingContext2D, w: number, h: number, n: number, light: string, dark: string) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = Math.random() * Math.PI * 2;
    const l = 2 + Math.random() * 5;
    g.strokeStyle = Math.random() < 0.5 ? light : dark;
    g.globalAlpha = 0.12 + Math.random() * 0.18;
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/**
 * Мех туловища (развёртка «вокруг»): u 0.5 — перед, 0.25/0.75 — бока, 0/1 — спина, v 0 — низ, 1 — макушка.
 * Как у игрушки Russ «Prudence»: серый полосатик со светлыми серебристыми пятнами, белые грудка и пузо.
 */
export function furTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 512, (g, w, h) => {
    const X = (u: number) => u * w;
    const Y = (v: number) => (1 - v) * h;
    g.fillStyle = FUR;
    g.fillRect(0, 0, w, h);

    // Серебристые пятна между полосками
    g.filter = 'blur(10px)';
    g.fillStyle = FUR_LIGHT;
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = 0.35 + Math.random() * 0.3;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 18 + Math.random() * 26, 8 + Math.random() * 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Полоски «макрель»: волнистые кольца вокруг тела, от спины к бокам
    g.filter = 'blur(2.5px)';
    g.strokeStyle = FUR_DARK;
    g.lineCap = 'round';
    for (let v = 0.06; v < 0.97; v += 0.07) {
      g.lineWidth = 13 + Math.random() * 7;
      g.globalAlpha = 0.95;
      let x = 0;
      while (x < w) {
        const len = 60 + Math.random() * 110;
        const u0 = x / w;
        const u1 = Math.min(1, (x + len) / w);
        // Спереди внизу — белое пузо, спереди посередине — мордочка: там полосок нет
        const front = (u: number) => Math.abs(u - 0.5) < (v < 0.52 ? 0.12 : v < 0.84 ? 0.09 : 0);
        if (!front(u0) && !front(u1) && !front((u0 + u1) / 2)) {
          const wob = (Math.random() - 0.5) * 0.03;
          // На спине полоски расходятся ёлочкой от хребта
          const tilt = (Math.abs(u0 - 0.5) > 0.35 ? (u0 < 0.5 ? -1 : 1) : 0) * 0.02;
          g.beginPath();
          g.moveTo(X(u0), Y(v + tilt));
          g.quadraticCurveTo(X((u0 + u1) / 2), Y(v + wob), X(u1), Y(v - tilt));
          g.stroke();
        }
        x += len + 14 + Math.random() * 24;
      }
    }
    // Лоб: «М»
    g.lineWidth = 10;
    for (const du of [-0.035, 0, 0.035]) {
      g.beginPath();
      g.moveTo(X(0.5 + du * 1.2), Y(0.95));
      g.lineTo(X(0.5 + du * 0.7), Y(0.86));
      g.stroke();
    }
    g.globalAlpha = 1;

    // Белые грудка и пузо
    g.filter = 'blur(7px)';
    g.fillStyle = WHITE;
    g.beginPath();
    g.ellipse(X(0.5), Y(0.28), X(0.1), 0.23 * h, 0, 0, Math.PI * 2);
    g.fill();
    g.filter = 'none';

    fuzz(g, w, h, 20000, '#d2d5d9', '#6b7076');
  });
}

/** Светлый мех для мордочки, лап и подушечек. */
export function creamTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = CREAM;
    g.fillRect(0, 0, w, h);
    fuzz(g, w, h, 5000, '#f3eee4', '#b8ae9c');
  });
}

/** Серый мех без рисунка — для ушей. */
export function plainFurTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = FUR;
    g.fillRect(0, 0, w, h);
    fuzz(g, w, h, 5000, '#d2d5d9', '#3f4247');
  });
}

/** Полосатый мех колечками — хвост и лапы (u — вдоль, v — вокруг). */
export function ringFurTexture(rings: number): THREE.CanvasTexture {
  const t = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = FUR;
    g.fillRect(0, 0, w, h);
    g.filter = 'blur(2px)';
    g.fillStyle = FUR_DARK;
    for (let i = 0; i < rings; i++) {
      const x = ((i + 0.5) / rings) * w;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(x - 9, 0);
      g.quadraticCurveTo(x + 10, h / 2, x - 9, h);
      g.lineTo(x + 9, h);
      g.quadraticCurveTo(x + 26, h / 2, x + 9, 0);
      g.fill();
    }
    g.globalAlpha = 1;
    g.filter = 'none';
    fuzz(g, w, h, 5000, '#d2d5d9', '#3f4247');
  });
  return t;
}

/** Карта рельефа для ворса: светлые и тёмные точки. */
export function bumpTexture(): THREE.CanvasTexture {
  const t = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    fuzz(g, w, h, 30000, '#ffffff', '#000000');
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function wallTexture(kind: string): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g, w, h) => {
    if (kind === 'check') {
      g.fillStyle = '#fff6ee';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(226,72,61,0.18)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 64, 0, 32, h);
        g.fillRect(0, i * 64, w, 32);
      }
    } else if (kind === 'stars') {
      g.fillStyle = '#33407a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd966';
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        g.arc((i * 97) % w, (i * 53) % h, 2 + (i % 3), 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'gold') {
      g.fillStyle = '#ffe08a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff0bd';
      for (let i = -4; i < 8; i++) {
        g.beginPath();
        g.moveTo(i * 48, 0);
        g.lineTo(i * 48 + 24, 0);
        g.lineTo(i * 48 + 24 + h, h);
        g.lineTo(i * 48 + h, h);
        g.fill();
      }
    } else {
      g.fillStyle = '#fde6cc';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f8d9b8';
      for (let i = 0; i < 4; i++) g.fillRect(i * 64, 0, 32, h);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 30, 0, 3, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function floorTexture(): THREE.CanvasTexture {
  const t = canvasTexture(512, 512, (g, w, h) => {
    const tones = ['#c98b52', '#bf8048', '#d19a62', '#c4884f'];
    const plank = 64;
    for (let i = 0; i < w / plank; i++) {
      g.fillStyle = tones[i % tones.length];
      g.fillRect(i * plank, 0, plank, h);
      g.fillStyle = 'rgba(80,45,15,0.35)';
      g.fillRect(i * plank, 0, 3, h);
      const cut = ((i * 173) % h) | 0;
      g.fillRect(i * plank, cut, plank, 3);
      g.strokeStyle = 'rgba(90,50,20,0.12)';
      g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        const x = i * plank + 8 + k * 9;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.6, x + 3, h);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Небо в окне: время суток + погода (облачность, пасмурно, туман). */
export function skyTexture(sky: string, weather = 'clear', clouds = 20, withClouds = true): THREE.CanvasTexture {
  return canvasTexture(256, 192, (g, w, h) => {
    const grey = weather === 'cloudy' || weather === 'rain' || weather === 'storm' || weather === 'drizzle' || weather === 'fog';
    const stops: Record<string, [string, string]> = grey
      ? {
          day: ['#8fa1b3', '#d3dbe2'],
          morning: ['#a9a3a6', '#dcd6d2'],
          evening: ['#7d7482', '#b8a9a8'],
          night: ['#141824', '#2c3345'],
        }
      : {
          day: ['#7cc8ff', '#d4f0ff'],
          morning: ['#ffc08c', '#ffeeda'],
          evening: ['#ff8457', '#ffcf8a'],
          night: ['#141b44', '#34447f'],
        };
    const [a, b] = stops[sky] ?? stops.day;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const night = sky === 'night';
    if (night && !grey) {
      g.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.4 + (i % 5) / 8;
        g.beginPath();
        g.arc((i * 71) % w, (i * 37) % h, i % 4 === 0 ? 1.8 : 1, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // Солнце или луна — если небо не затянуто
    if (!grey) {
      if (night) {
        g.fillStyle = '#fff3b0';
        g.beginPath();
        g.arc(70, 55, 26, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = a;
        g.beginPath();
        g.arc(84, 46, 24, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = '#ffd23d';
        g.shadowColor = 'rgba(255,210,61,0.8)';
        g.shadowBlur = 24;
        g.beginPath();
        g.arc(60, 55, 24, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
    }
    // Облака: чем больше облачность, тем больше и серее
    const n = !withClouds ? 0 : weather === 'clear' ? Math.round(clouds / 25) : grey ? 7 : 2 + Math.round(clouds / 20);
    const cloudColor = grey ? (night ? '#3d4456' : '#b9c2cb') : night ? '#5a6490' : '#ffffff';
    g.fillStyle = cloudColor;
    for (let i = 0; i < n; i++) {
      const x = ((i * 97 + 40) % (w + 60)) - 30;
      const y = 30 + ((i * 53) % (h - 70));
      const s = 0.6 + ((i * 37) % 10) / 16;
      g.globalAlpha = grey ? 0.85 : 0.95;
      g.beginPath();
      g.ellipse(x, y, 36 * s, 13 * s, 0, 0, Math.PI * 2);
      g.arc(x - 9 * s, y - 10 * s, 15 * s, 0, Math.PI * 2);
      g.arc(x + 13 * s, y - 8 * s, 13 * s, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (weather === 'fog') {
      g.fillStyle = 'rgba(235,238,240,0.65)';
      g.fillRect(0, 0, w, h);
    }
  });
}

/** Дождь или снег: полупрозрачная текстура, которую прокручиваем вниз. */
export function precipTexture(kind: 'rain' | 'drizzle' | 'snow'): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'snow') {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) {
        g.globalAlpha = 0.6 + Math.random() * 0.4;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.strokeStyle = '#dbe8f5';
      g.lineCap = 'round';
      const count = kind === 'rain' ? 90 : 35;
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const l = kind === 'rain' ? 14 + Math.random() * 12 : 6 + Math.random() * 6;
        g.globalAlpha = 0.45 + Math.random() * 0.4;
        g.lineWidth = kind === 'rain' ? 1.6 : 1.2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - l * 0.18, y + l);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function calendarTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e2483d';
    g.fillRect(0, 0, w, 64);
    g.fillStyle = '#fff';
    g.font = '800 34px "Nunito Variable", sans-serif';
    g.textAlign = 'center';
    g.fillText('сегодня', w / 2, 46);
    g.fillStyle = '#2a211a';
    g.font = '900 120px "Nunito Variable", sans-serif';
    g.fillText(String(n), w / 2, 200);
  });
}

export function rugTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const rings = ['#e2483d', '#f59a7a', '#e2483d', '#ffd0b8', '#e2483d', '#f59a7a'];
    rings.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(cx, cy, 128 - i * 20, 0, Math.PI * 2);
      g.fill();
    });
    fuzz(g, w, h, 3000, '#ffffff', '#7a1c14');
  });
}

/** Текст на прозрачном фоне для «Zzz» и сердечек. */
export function glyphTexture(text: string, color = '#2a211a'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g, w, h) => {
    g.font = '900 96px "Nunito Variable", "Apple Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 6);
  });
}

export function basketTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#c98f55';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8f5c2c';
    g.lineWidth = 5;
    for (let y = 8; y < h; y += 18) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + ((x / 16) % 2 ? 5 : -5));
      g.stroke();
    }
    g.lineWidth = 3;
    for (let x = 0; x < w; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Лист календаря поверх запечённого: месяц на красной полосе и сегодняшнее число. */
export function dateTexture(day: number, month: number): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w) => {
    g.clearRect(0, 0, w, 256);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = '800 30px "Nunito Variable", sans-serif';
    g.fillText(MONTHS[month] ?? '', w / 2, 38);
    g.fillStyle = '#2a211a';
    g.font = '900 128px "Nunito Variable", sans-serif';
    g.fillText(String(day), w / 2, 160);
  });
}

/** Нутро холодильника: светлые стенки, полки и продукты — видно, когда открывается дверца. */
export function fridgeInsideTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 576, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#fffdf2');
    grad.addColorStop(1, '#dff1f7');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // лампочка
    g.fillStyle = '#fff6c9';
    g.shadowColor = 'rgba(255,240,180,0.9)';
    g.shadowBlur = 30;
    g.fillRect(w / 2 - 30, 12, 60, 10);
    g.shadowBlur = 0;
    // морозилка сверху
    g.fillStyle = '#cfeaf7';
    g.fillRect(8, 30, w - 16, 150);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      g.arc(10 + ((i * 53) % (w - 20)), 36 + ((i * 37) % 140), 2, 0, Math.PI * 2);
      g.fill();
    }
    // полки
    const shelves = [196, 300, 404, 508];
    for (const y of shelves) {
      g.fillStyle = 'rgba(170,205,220,0.9)';
      g.fillRect(8, y, w - 16, 6);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(8, y, w - 16, 2);
    }
    // продукты — нарисованные
    drawFood(g, 176, ['ice', 'icecream', 'dumpling']);
    drawFood(g, 296, ['milk', 'cheese', 'eggs']);
    drawFood(g, 400, ['tomato', 'cucumber', 'carrot']);
    drawFood(g, 504, ['chicken', 'steak', 'lemon']);
  });
}

/** Внутренняя сторона дверцы: светлая панель, на большой — полочки с бутылками. */
export function doorInsideTexture(shelves: boolean): THREE.CanvasTexture {
  return canvasTexture(128, shelves ? 256 : 128, (g, w, h) => {
    g.fillStyle = '#eef8f5';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#cfe6df';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    if (!shelves) return;
    for (const [y, items] of [
      [80, ['juice', 'bottle']],
      [160, ['butter', 'can']],
      [240, ['honey', 'bottle']],
    ] as [number, string[]][]) {
      drawFood(g, y - 6, items, 36, 56, 0.7);
      g.fillStyle = '#b9dcd2';
      g.fillRect(10, y - 6, w - 20, 6);
    }
  });
}

/** Облака отдельным прозрачным слоем — их медленно сдвигаем, и они плывут за окном. */
export function cloudLayerTexture(sky: string, weather = 'clear', clouds = 20): THREE.CanvasTexture {
  const t = canvasTexture(512, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grey = weather === 'cloudy' || weather === 'rain' || weather === 'storm' || weather === 'drizzle' || weather === 'fog';
    const night = sky === 'night';
    const n = weather === 'clear' ? 1 + Math.round(clouds / 25) : grey ? 9 : 3 + Math.round(clouds / 18);
    g.fillStyle = grey ? (night ? '#3d4456' : '#b9c2cb') : night ? '#5a6490' : '#ffffff';
    for (let i = 0; i < n; i++) {
      const x = ((i * 131 + 40) % w) + 0.5;
      const y = 28 + ((i * 53) % (h - 70));
      const s = 0.6 + ((i * 37) % 10) / 16;
      g.globalAlpha = grey ? 0.85 : 0.95;
      // рисуем дважды со сдвигом на ширину — бесшовно по кругу
      for (const dx of [0, -w]) {
        g.beginPath();
        g.ellipse(x + dx, y, 36 * s, 13 * s, 0, 0, Math.PI * 2);
        g.arc(x + dx - 9 * s, y - 10 * s, 15 * s, 0, Math.PI * 2);
        g.arc(x + dx + 13 * s, y - 8 * s, 13 * s, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 0.5;
  return t;
}

/** Простые рисованные продукты для полок холодильника (вместо эмодзи). */
function drawFood(g: CanvasRenderingContext2D, baseY: number, items: string[], x0 = 48, step = 80, k = 1) {
  items.forEach((it, i) => {
    const x = x0 + i * step;
    const y = baseY;
    const R = (c: string, rx: number, ry: number, cx = x, cy = y - ry) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
      g.fill();
    };
    const box = (c: string, bw: number, bh: number, r = 6) => {
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(x - (bw * k) / 2, y - bh * k, bw * k, bh * k, r * k);
      g.fill();
    };
    switch (it) {
      case 'milk':
        box('#ffffff', 30, 50);
        box('#5aa7e8', 30, 16, 3);
        break;
      case 'cheese':
        g.fillStyle = '#ffc83d';
        g.beginPath();
        g.moveTo(x - 24 * k, y);
        g.lineTo(x + 24 * k, y);
        g.lineTo(x + 24 * k, y - 26 * k);
        g.closePath();
        g.fill();
        R('#f0b020', 4, 4, x + 12 * k, y - 8 * k);
        break;
      case 'eggs':
        R('#fff6e6', 10, 14, x - 12 * k);
        R('#fff6e6', 10, 14, x + 12 * k);
        break;
      case 'tomato':
        R('#e2483d', 18, 16);
        R('#52b36b', 6, 3, x, y - 30 * k);
        break;
      case 'cucumber':
        g.save();
        g.translate(x, y - 10 * k);
        g.rotate(-0.4);
        g.fillStyle = '#4fae66';
        g.beginPath();
        g.ellipse(0, 0, 26 * k, 8 * k, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
        break;
      case 'carrot':
        g.fillStyle = '#ff8a2a';
        g.beginPath();
        g.moveTo(x - 8 * k, y - 34 * k);
        g.lineTo(x + 8 * k, y - 34 * k);
        g.lineTo(x, y);
        g.closePath();
        g.fill();
        R('#52b36b', 6, 5, x, y - 38 * k);
        break;
      case 'chicken':
        R('#e7a45c', 20, 14);
        R('#fff3e0', 5, 5, x + 20 * k, y - 22 * k);
        break;
      case 'steak':
        R('#c8474f', 22, 12);
        R('#f5c6c9', 6, 4, x - 6 * k, y - 12 * k);
        break;
      case 'lemon':
        R('#ffe14d', 16, 13);
        break;
      case 'ice':
        box('#dff4ff', 34, 28, 4);
        box('#bfe6fa', 16, 12, 3);
        break;
      case 'icecream':
        box('#fbe3c8', 26, 36, 8);
        R('#ff9ab8', 14, 10, x, y - 36 * k);
        break;
      case 'dumpling':
        R('#fff4dc', 20, 12);
        break;
      case 'juice':
        box('#ff9a3d', 22, 40, 4);
        break;
      case 'bottle':
        box('#7cc4a0', 16, 44, 6);
        box('#4f8f70', 8, 10, 2);
        break;
      case 'butter':
        box('#fff0a8', 34, 18, 3);
        break;
      case 'can':
        box('#e2483d', 22, 30, 4);
        box('#ffffff', 22, 10, 1);
        break;
      case 'honey':
        box('#f2a93b', 26, 30, 8);
        box('#8a5a2b', 28, 8, 3);
        break;
    }
  });
}

/** Картина на стене: рыбка на голубом фоне — чтобы было понятно, что это рыба. */
export function fishPictureTexture(): THREE.CanvasTexture {
  return canvasTexture(320, 230, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#bfe8ff');
    grad.addColorStop(1, '#7cc4ef');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // водоросли
    g.strokeStyle = '#4fae66';
    g.lineWidth = 7;
    g.lineCap = 'round';
    for (const x of [40, 60, 270]) {
      g.beginPath();
      g.moveTo(x, h);
      g.quadraticCurveTo(x - 18, h - 50, x + 4, h - 90);
      g.stroke();
    }
    // пузырьки
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    for (const [x, y, r] of [
      [218, 62, 7],
      [232, 40, 5],
      [242, 22, 4],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }
    // рыбка: тело, хвост, плавник, глаз, улыбка, полоски
    const cx = 150;
    const cy = 120;
    g.fillStyle = '#ff8a3d';
    g.beginPath();
    g.moveTo(cx + 70, cy);
    g.bezierCurveTo(cx + 40, cy - 55, cx - 50, cy - 55, cx - 60, cy);
    g.bezierCurveTo(cx - 50, cy + 55, cx + 40, cy + 55, cx + 70, cy);
    g.fill();
    g.beginPath();
    g.moveTo(cx - 55, cy);
    g.lineTo(cx - 105, cy - 38);
    g.quadraticCurveTo(cx - 90, cy, cx - 105, cy + 38);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffb27a';
    g.beginPath();
    g.moveTo(cx - 5, cy - 38);
    g.quadraticCurveTo(cx + 10, cy - 68, cx + 30, cy - 36);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    for (const dx of [-18, 8]) {
      g.beginPath();
      g.moveTo(cx + dx, cy - 36);
      g.quadraticCurveTo(cx + dx + 10, cy, cx + dx, cy + 36);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx + 40, cy - 12, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a211a';
    g.beginPath();
    g.arc(cx + 43, cy - 12, 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c2461f';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx + 55, cy + 10, 8, 0.2, Math.PI - 0.6);
    g.stroke();
  });
}
