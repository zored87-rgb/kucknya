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

export function skyTexture(sky: string): THREE.CanvasTexture {
  return canvasTexture(256, 192, (g, w, h) => {
    const stops: Record<string, [string, string]> = {
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
    if (sky === 'night') {
      g.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.4 + (i % 5) / 8;
        g.beginPath();
        g.arc((i * 71) % w, (i * 37) % h, i % 4 === 0 ? 1.8 : 1, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
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
      g.fillStyle = '#fff';
      for (const [x, y, s] of [
        [150, 60, 1],
        [200, 120, 0.8],
        [90, 140, 0.7],
      ]) {
        g.beginPath();
        g.ellipse(x, y, 34 * s, 13 * s, 0, 0, Math.PI * 2);
        g.arc(x - 8 * s, y - 10 * s, 15 * s, 0, Math.PI * 2);
        g.arc(x + 12 * s, y - 8 * s, 12 * s, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
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
    g.fillText('неделя', w / 2, 46);
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
