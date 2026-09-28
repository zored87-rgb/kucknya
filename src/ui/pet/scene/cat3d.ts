// 3D-кот по игрушке Russ «Prudence». Тело, лапки, уши и хвост — модель из Blender (cat.glb),
// пока она грузится — такой же кот из простых фигур. Лицо — в catFace.ts.
// Анимации: дыхание, плюшевое «сплющивание» от касаний, выражения и случайные дела,
// которыми кот занят сам (оглядывается, зевает, машет лапкой…).

import * as THREE from 'three';
import type { Face } from '../Cat';
import { chirp, yawnSound } from '../sound';
import { CatFace, type FaceTargets, type Surface } from './catFace';
import { creamTexture, FUR_DARK, furTexture, glyphTexture, PINK, plainFurTexture, ringFurTexture } from './textures';

/** Профиль тела снизу вверх: [радиус, высота]. Вращаем вокруг оси — получается «картофелина». */
const PROFILE: [number, number][] = [
  [0.0, 0.0],
  [0.55, 0.03],
  [0.86, 0.16],
  [0.98, 0.4],
  [0.98, 0.66],
  [0.9, 0.95],
  [0.85, 1.08],
  [0.87, 1.26],
  [0.84, 1.48],
  [0.73, 1.7],
  [0.5, 1.87],
  [0.2, 1.96],
  [0.0, 1.98],
];
/** Спереди-сзади тело чуть сплюснуто. */
const DEPTH = 0.86;

function profilePoints(): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(64);
}

const POINTS = profilePoints();

/** Радиус тела на высоте y. */
function radiusAt(y: number): number {
  for (let i = 1; i < POINTS.length; i++) {
    const a = POINTS[i - 1];
    const b = POINTS[i];
    if (y >= a.y && y <= b.y) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1);
  }
  return 0;
}

/** Точка на поверхности спереди: x — вбок, y — высота. */
export function surfaceZ(x: number, y: number): number {
  const r = radiusAt(y);
  return DEPTH * Math.sqrt(Math.max(0, r * r - x * x));
}

/** Плюш: матовый мех с лёгким бархатным отливом. Ворс нарисован прямо в текстуре. */
function plush(map: THREE.Texture, _bump?: THREE.Texture, sheen = '#aab0b8'): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.95,
    sheen: 0.4,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.5,
  });
}

function sphere(r: number, mat: THREE.Material, seg = 24): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat);
  m.castShadow = true;
  return m;
}


/** Выражение лица для каждого «лица» из Cat.tsx. Кот ленивый: глаза по умолчанию чуть прикрыты. */
const FACES: Record<Face, FaceTargets> = {
  smile: { lid: 0.92, lower: 0.08, tilt: 0, mouth: 0, smile: 'smile', eyeScale: 1 },
  flat: { lid: 0.82, lower: 0, tilt: 0, mouth: 0, smile: 'flat', eyeScale: 1 },
  hungry: { lid: 0.95, lower: 0, tilt: -0.28, mouth: 0, smile: 'frown', eyeScale: 1.08 },
  angry: { lid: 0.55, lower: 0.1, tilt: 0.5, mouth: 0.15, smile: 'frown', eyeScale: 0.95 },
  hiss: { lid: 0.42, lower: 0.2, tilt: 0.55, mouth: 0.9, smile: 'frown', eyeScale: 0.85 },
  sad: { lid: 0.6, lower: 0, tilt: -0.4, mouth: 0, smile: 'frown', eyeScale: 1.05 },
  sleep: { lid: 0, lower: 0.3, tilt: 0, mouth: 0, smile: 'smile', eyeScale: 1 },
  meow: { lid: 0.45, lower: 0.3, tilt: 0, mouth: 0.7, smile: 'smile', eyeScale: 1 },
  giggle: { lid: 0.2, lower: 0.9, tilt: 0, mouth: 0.6, smile: 'smile', eyeScale: 1 },
  purr: { lid: 0.12, lower: 0.7, tilt: 0, mouth: 0, smile: 'smile', eyeScale: 1 },
  eat: { lid: 0.25, lower: 0.8, tilt: 0, mouth: 0.5, smile: 'smile', eyeScale: 1 },
};

type Action = 'look' | 'tilt' | 'wave' | 'yawn' | 'slowblink' | 'bounce' | 'tailflick' | 'rub' | 'lookBowl' | 'stomp' | 'turnAway' | 'lookFridge' | 'sigh' | 'snore';

const ACTIONS: Record<string, Action[]> = {
  happy: ['look', 'tilt', 'wave', 'yawn', 'slowblink', 'bounce', 'tailflick', 'look'],
  peckish: ['look', 'tilt', 'yawn', 'lookBowl', 'slowblink', 'tailflick'],
  hungry: ['rub', 'lookBowl', 'sigh', 'rub', 'lookBowl'],
  angry: ['stomp', 'turnAway', 'stomp'],
  sad: ['lookFridge', 'sigh', 'lookFridge'],
  sleeping: ['snore', 'snore', 'tailflick'],
};

const DURATION: Record<Action, number> = {
  look: 3,
  tilt: 2.2,
  wave: 1.8,
  yawn: 2.6,
  slowblink: 1.8,
  bounce: 1.1,
  tailflick: 1.2,
  rub: 2.4,
  lookBowl: 2.6,
  stomp: 1.2,
  turnAway: 3,
  lookFridge: 2.6,
  sigh: 2.2,
  snore: 3.5,
};

/** Плавный «колокол» 0→1→0 по доле p с держанием в середине. */
function bell(p: number, hold = 0.5): number {
  const a = (1 - hold) / 2;
  if (p < a) return ease(p / a);
  if (p > 1 - a) return ease((1 - p) / a);
  return 1;
}

function ease(x: number): number {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}

function damp(cur: number, target: number, speed: number, dt: number): number {
  return cur + (target - cur) * (1 - Math.exp(-speed * dt));
}

export class Cat3D {
  readonly root = new THREE.Group();
  /** Всё, что дышит, качается и сплющивается. */
  private body = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private tail = new THREE.Group();
  /** Поворот всего хвоста вокруг кота: лежит сбоку-сзади и не задевает корзину. */
  private tailYaw = new THREE.Group();
  private furMat: THREE.MeshPhysicalMaterial;
  private face: CatFace | null = null;
  private faceKind: Face = 'smile';
  private steam = new THREE.Group();
  private zzz = new THREE.Group();
  private tear: THREE.Mesh;
  private outfits: Record<string, THREE.Object3D> = {};
  private mood = 'happy';
  private talking = false;
  private eating = false;
  private reaction: string | null = null;
  private reactionAt = 0;
  private lastT = 0;
  private blinkAt = 2;
  private action: { name: Action; start: number } | null = null;
  private nextActionAt = 3;
  /** Пружина «плюшевого» сплющивания. */
  private squash = 0;
  private squashV = 0;
  /** Текущая поза — к ней плавно тянемся. */
  private pose = { turn: 0, tilt: 0, lean: 0, lift: 0, armL: 0, armR: 0, tail: 0, stretch: 0, shiftX: 0, shiftZ: 0 };
  /** Меши, по которым ловим касания. */
  readonly hitMeshes: THREE.Object3D[] = [];
  private lidColor = '#8f949a';

  constructor() {
    const bump = undefined;
    const fur = furTexture();
    this.furMat = plush(fur, bump);
    const plainMat = plush(plainFurTexture(), bump);
    const whiteMat = plush(creamTexture(), bump, '#ffffff');
    const pinkMat = new THREE.MeshPhysicalMaterial({ color: PINK, roughness: 0.8, sheen: 0.6, sheenColor: new THREE.Color('#ffd7d9') });
    const lineMat = new THREE.MeshStandardMaterial({ color: '#2a292d', roughness: 0.6 });

    // Временное тело (пока грузится модель)
    const bodyGeo = new THREE.LatheGeometry(POINTS, 64, Math.PI, Math.PI * 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.furMat);
    bodyMesh.scale.z = DEPTH;
    bodyMesh.castShadow = true;
    bodyMesh.userData.proc = true;
    this.body.add(bodyMesh);
    this.hitMeshes.push(bodyMesh);

    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.5, 24), plainMat);
      outer.scale.z = 0.45;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 20), pinkMat);
      inner.scale.z = 0.3;
      inner.position.set(0, -0.05, 0.09);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 16), new THREE.MeshStandardMaterial({ color: FUR_DARK, roughness: 1 }));
      tip.scale.z = 0.45;
      tip.position.y = 0.19;
      ear.add(outer, inner, tip);
      ear.position.set(side * 0.5, 1.82, 0.04);
      ear.rotation.z = -side * 0.42;
      ear.userData.proc = true;
      this.head.add(ear);
    }

    // Слеза, пар, Zzz
    this.tear = sphere(0.035, new THREE.MeshPhysicalMaterial({ color: '#7cc4ff', roughness: 0.1, transmission: 0.3, clearcoat: 1 }), 12);
    this.tear.scale.y = 1.3;
    this.tear.visible = false;
    this.head.add(this.tear);
    const steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
    for (let i = 0; i < 4; i++) {
      const puff = sphere(0.09, steamMat, 12);
      puff.userData = { side: i % 2 ? 1 : -1, phase: i / 4 };
      this.steam.add(puff);
    }
    this.steam.visible = false;
    this.head.add(this.steam);
    const zTex = glyphTexture('z', '#3a4a8a');
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }));
      s.userData.phase = i / 3;
      this.zzz.add(s);
    }
    this.zzz.visible = false;
    this.head.add(this.zzz);
    this.body.add(this.head);

    const armMat = plush(ringFurTexture(3), bump);
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 8, 16), armMat);
      limb.position.set(0, -0.2, 0);
      const paw = sphere(0.165, whiteMat);
      paw.position.set(0, -0.4, 0.02);
      const inner = new THREE.Group();
      inner.add(limb, paw);
      inner.rotation.z = side * 0.75;
      inner.rotation.x = -0.55;
      inner.userData.proc = true;
      arm.add(inner);
      arm.position.set(side * 0.74, 1.0, 0.32);
      this.body.add(arm);
    }
    for (const side of [-1, 1]) {
      const foot = sphere(0.22, whiteMat, 20);
      foot.scale.set(1.05, 0.75, 1.2);
      foot.position.set(side * 0.43, 0.13, 0.6);
      foot.userData.proc = true;
      this.body.add(foot);
    }
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.25, 0.3, -0.65),
      new THREE.Vector3(0.75, 0.14, -0.62),
      new THREE.Vector3(1.15, 0.12, -0.25),
      new THREE.Vector3(1.25, 0.12, 0.2),
      new THREE.Vector3(1.08, 0.13, 0.58),
    ]);
    const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 48, 0.13, 16, false), plush(ringFurTexture(7), bump));
    tailMesh.userData.proc = true;
    this.tail.add(tailMesh);
    this.tailYaw.add(this.tail);
    this.tailYaw.rotation.y = 1.0;
    this.root.add(this.tailYaw);

    this.buildOutfits(lineMat);
    this.root.add(this.body);

    // Лицо на временном теле — по формуле поверхности
    this.buildFace((x, y) => {
      const z = surfaceZ(x, y);
      if (!z) return null;
      return { p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(x, 0, z / (DEPTH * DEPTH)).normalize() };
    });
  }

  private buildFace(surface: Surface) {
    if (this.face) {
      this.head.remove(this.face.group);
      this.face.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    this.face = new CatFace(surface, this.lidColor);
    this.head.add(this.face.group);
  }

  private buildOutfits(lineMat: THREE.Material) {
    const add = (id: string, obj: THREE.Object3D) => {
      obj.visible = false;
      obj.traverse((o) => (o.castShadow = true));
      this.outfits[id] = obj;
      this.head.add(obj);
    };
    // Бантик у уха
    const bow = new THREE.Group();
    const pink = new THREE.MeshPhysicalMaterial({ color: '#ff6fa0', roughness: 0.4, sheen: 1, sheenColor: new THREE.Color('#ffc2d6') });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 16), pink);
      wing.rotation.z = (side * Math.PI) / 2;
      wing.position.x = side * 0.11;
      wing.scale.z = 0.5;
      bow.add(wing);
    }
    bow.add(sphere(0.06, pink, 12));
    bow.position.set(0.32, 1.84, surfaceZ(0.32, 1.7) - 0.05);
    bow.rotation.z = -0.4;
    add('bow', bow);

    // Поварской колпак
    const chef = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.26, 32), cloth);
    band.position.y = 0.1;
    chef.add(band);
    for (const [x, y, z, r] of [
      [0, 0.45, 0, 0.36],
      [-0.25, 0.38, 0, 0.26],
      [0.25, 0.38, 0, 0.26],
      [0, 0.38, 0.2, 0.25],
      [0, 0.38, -0.2, 0.25],
    ]) {
      const puff = sphere(r, cloth, 16);
      puff.position.set(x, y, z);
      chef.add(puff);
    }
    chef.position.y = 1.78;
    add('chef', chef);

    // Очки
    const glasses = new THREE.Group();
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 8, 28), lineMat);
      rim.position.set(side * 0.27, 1.43, surfaceZ(side * 0.27, 1.43) + 0.05);
      rim.rotation.y = side * 0.35;
      glasses.add(rim);
    }
    const bridgeBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), lineMat);
    bridgeBar.rotation.z = Math.PI / 2;
    bridgeBar.position.set(0, 1.46, surfaceZ(0, 1.46) + 0.08);
    glasses.add(bridgeBar);
    add('glasses', glasses);

    // Шарф
    const scarfMat = new THREE.MeshPhysicalMaterial({ color: '#e2483d', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ffb0a8') });
    const scarf = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.1, 12, 48), scarfMat);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = DEPTH;
    ring.position.y = 1.04;
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.08), scarfMat);
    end.position.set(0.3, 0.84, surfaceZ(0.3, 0.84) + 0.08);
    end.rotation.z = 0.15;
    scarf.add(ring, end);
    add('scarf', scarf);

    // Корона
    const gold = new THREE.MeshPhysicalMaterial({ color: '#ffc83d', metalness: 0.8, roughness: 0.25 });
    const crown = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 32, 1, true), gold);
    (base.material as THREE.Material).side = THREE.DoubleSide;
    crown.add(base);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 12), gold);
      spike.position.set(Math.sin(a) * 0.32, 0.16, Math.cos(a) * 0.32);
      crown.add(spike);
      const gem = sphere(0.035, new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#4aa3ff' : '#e2483d', roughness: 0.1, clearcoat: 1 }), 10);
      gem.position.set(Math.sin(a) * 0.345, 0.0, Math.cos(a) * 0.345);
      crown.add(gem);
    }
    crown.position.y = 1.93;
    add('crown', crown);
  }


  /**
   * Подставить модель из Blender (cat.glb): тело, лапки, уши, хвост.
   * Временные фигуры прячем, лицо строим заново точно по поверхности мордочки.
   */
  useModel(model: THREE.Object3D) {
    const node = (n: string) => model.getObjectByName(n);
    const body = node('CatBody');
    if (!body) return;
    this.root.traverse((o) => {
      if (o.userData.proc) o.visible = false;
    });
    const shadows = (o: THREE.Object3D) =>
      o.traverse((c) => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
    const take = (o: THREE.Object3D, into: THREE.Group, pivot: boolean) => {
      shadows(o);
      if (pivot) {
        into.position.copy(o.position);
        into.rotation.set(0, 0, 0);
        o.position.set(0, 0, 0);
      }
      into.add(o);
    };
    take(body, this.body, false);
    this.hitMeshes.splice(0, this.hitMeshes.length, body);
    const mat = (body as THREE.Mesh).material;
    if (mat && !Array.isArray(mat) && 'emissive' in mat) this.furMat = mat as THREE.MeshPhysicalMaterial;
    for (const [n, g] of [
      ['ArmL', this.armL],
      ['ArmR', this.armR],
    ] as const) {
      const a = node(n);
      if (a) {
        take(a, g, true);
        this.hitMeshes.push(a);
      }
    }
    for (const n of ['EarL', 'EarR']) {
      const e = node(n);
      if (!e) continue;
      shadows(e);
      e.name = n === 'EarL' ? 'ear-l' : 'ear-r';
      this.head.add(e);
    }
    const tail = node('Tail');
    if (tail) {
      take(tail, this.tail, true);
    }
    // Слои ворса (fur.ts) давали мелкую «зернистость» — плюш без них чище

    // Лицо — по лучам на новую поверхность
    this.root.updateWorldMatrix(true, true);
    const ray = new THREE.Raycaster();
    const inv = new THREE.Matrix4();
    this.buildFace((x, y) => {
      const from = this.body.localToWorld(new THREE.Vector3(x, y, 5));
      const to = this.body.localToWorld(new THREE.Vector3(x, y, -5));
      ray.set(from, to.sub(from).normalize());
      const hit = ray.intersectObject(body, false)[0];
      if (!hit || !hit.face) return null;
      inv.copy(this.body.matrixWorld).invert();
      const p = hit.point.clone().applyMatrix4(inv);
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).transformDirection(inv);
      return { p, n };
    });
  }

  setOutfit(id: string) {
    for (const [k, o] of Object.entries(this.outfits)) o.visible = k === id;
  }

  setState(s: { face: Face; mood: string; talking: boolean; eating: boolean; reaction: string | null }) {
    if (s.reaction !== this.reaction && s.reaction) this.reactionAt = this.lastT;
    if (s.mood !== this.mood) this.action = null;
    this.mood = s.mood;
    this.talking = s.talking;
    this.eating = s.eating;
    this.reaction = s.reaction;
    this.faceKind = s.face;
    // Румянец всегда лёгкий, когда доволен — ярче
    if (this.face?.blushMat) this.face.blushMat.opacity = ['smile', 'meow', 'giggle', 'purr', 'eat'].includes(s.face) ? 0.5 : 0.25;
    this.tear.visible = s.face === 'sad';
    this.steam.visible = s.face === 'angry' || s.face === 'hiss';
    this.zzz.visible = s.face === 'sleep';
  }

  /** Касание: плюш сплющивается и пружинит обратно. */
  poke(strength = 1) {
    this.squashV -= 3.2 * strength;
    this.action = null;
  }

  /** Сделать что-то сейчас (например, помахать, когда нажали на холодильник). */
  play(name: Action) {
    this.action = { name, start: this.lastT };
  }

  private look = { turn: 0, until: 0 };

  /** Повернуться к точке (куда нажали) и немного так посидеть. */
  lookAt(world: THREE.Vector3) {
    const local = this.root.worldToLocal(world.clone());
    // Предметы за спиной (стена, окно) — только чуть в их сторону, а не разворот назад
    const turn = Math.atan2(local.x, Math.max(1.2, Math.abs(local.z)));
    this.look = { turn: Math.max(-0.75, Math.min(0.75, turn)), until: this.lastT + 1.8 };
  }

  /** t — секунды с начала. */
  update(t: number) {
    const dt = Math.min(0.05, t - this.lastT || 0.016);
    this.lastT = t;
    const r = this.reaction;
    const since = t - this.reactionAt;
    const angry = this.faceKind === 'angry' || this.faceKind === 'hiss';
    const sleeping = this.mood === 'sleeping' && !r;

    // Случайные дела, когда кота не трогают
    if (!r && !this.eating && !this.action && t > this.nextActionAt) {
      const list = ACTIONS[this.mood] ?? ACTIONS.happy;
      const name = list[Math.floor(Math.random() * list.length)];
      this.action = { name, start: t };
      if (name === 'yawn') yawnSound();
      if (name === 'bounce') chirp();
    }
    let act: Action | null = null;
    let p = 0;
    if (this.action) {
      p = (t - this.action.start) / DURATION[this.action.name];
      if (p >= 1) {
        this.action = null;
        this.nextActionAt = t + (sleeping ? 5 : 4) + Math.random() * 6;
      } else act = this.action.name;
    }
    const b = act ? bell(p) : 0;

    // Цели позы
    const pose = { turn: Math.sin(t * 0.35) * 0.06, tilt: 0, lean: 0, lift: 0, armL: Math.sin(t * 1.4) * 0.05, armR: -Math.sin(t * 1.4) * 0.05, tail: Math.sin(t * 1.6) * 0.08, stretch: 0, shiftX: 0, shiftZ: 0 };
    const face: FaceTargets = { ...FACES[this.faceKind] };

    if (act === 'look') pose.turn = Math.sin(p * Math.PI * 2) * 0.45;
    if (act === 'tilt') pose.tilt = b * 0.16;
    if (act === 'wave') {
      pose.armR = 1.5 * b + Math.sin(t * 14) * 0.3 * b;
      face.lid = Math.min(face.lid, 0.5);
      face.lower = 0.5 * b;
      face.mouth = 0.3 * b;
    }
    if (act === 'yawn') {
      pose.stretch = b;
      pose.armL = -1.2 * b;
      pose.armR = 1.2 * b;
      pose.lean = -0.08 * b;
      face.lid = 0.05;
      face.mouth = b;
    }
    if (act === 'slowblink') face.lid = 0.9 - 0.8 * b;
    if (act === 'bounce') pose.lift = Math.abs(Math.sin(p * Math.PI * 2)) * 0.18;
    if (act === 'tailflick') pose.tail = Math.abs(Math.sin(p * Math.PI * 6)) * 0.35;
    if (act === 'rub') {
      pose.armL = 0.2 + Math.sin(t * 6) * 0.08;
      pose.armR = -0.2 - Math.sin(t * 6) * 0.08;
      pose.lean = 0.05 * b;
    }
    if (act === 'lookBowl') {
      pose.turn = -0.35 * b;
      pose.lean = 0.1 * b;
      pose.tilt = 0.08 * b;
    }
    if (act === 'lookFridge') {
      pose.turn = -0.5 * b;
      pose.tilt = -0.06 * b;
    }
    if (act === 'sigh') {
      pose.stretch = -0.5 * b;
      pose.lean = 0.08 * b;
      face.lid = Math.min(face.lid, 0.5);
    }
    if (act === 'stomp') pose.lift = Math.abs(Math.sin(p * Math.PI * 3)) * 0.08;
    if (act === 'turnAway') {
      pose.turn = 1.1 * b;
      face.lid = 0.35;
    }
    if (act === 'snore') pose.stretch = Math.sin(p * Math.PI) * 0.35;

    // Настроение поверх
    if (angry) {
      pose.armL = -1.9 + Math.sin(t * 20) * 0.2;
      pose.armR = 1.9 - Math.sin(t * 20 + 1) * 0.2;
      pose.tail = Math.sin(t * 12) * 0.2;
      pose.turn = act === 'turnAway' ? pose.turn : 0;
    } else if ((this.mood === 'hungry' || this.mood === 'sad') && !act) {
      pose.armL = 0.12 + Math.sin(t * 2) * 0.04;
      pose.armR = -0.12 - Math.sin(t * 2) * 0.04;
      pose.lean = 0.04;
    } else if (sleeping) {
      pose.tilt = 0.1;
      pose.lean = 0.08;
      pose.turn = 0;
      pose.tail = 0;
      pose.armL = 0.1;
      pose.armR = -0.1;
    }

    // Реакции на касания
    if (r === 'meow' && since < 1.2) {
      pose.armR = 1.4 + Math.sin(t * 14) * 0.3;
      pose.lift = since < 0.45 ? Math.sin((since / 0.45) * Math.PI) * 0.15 : 0;
    }
    if (r === 'giggle') pose.tilt = Math.sin(t * 24) * 0.08;
    if (r === 'purr') {
      pose.tilt = Math.sin(t * 2.5) * 0.08;
      pose.turn = 0;
    }
    if (r === 'wake' && since < 0.6) pose.lift = Math.sin((since / 0.6) * Math.PI) * 0.1;
    if (this.eating) {
      // Держит миску лапками перед собой и жуёт, кивая
      pose.turn = 0;
      pose.lean = 0.1 + Math.sin(t * 11) * 0.04;
      pose.armL = 0.3;
      pose.armR = -0.3;
      pose.tail = 0.25 + Math.sin(t * 3) * 0.12;
    }

    // Смотрит туда, куда нажали
    if (t < this.look.until && !this.eating && !angry && !sleeping) pose.turn = this.look.turn;

    // Плавное следование позе
    const P = this.pose;
    const sp = r || angry ? 14 : 5;
    for (const key of Object.keys(P) as (keyof typeof P)[]) P[key] = damp(P[key], pose[key], sp, dt);

    // Пружина сплющивания
    this.squashV += (-this.squash * 90 - this.squashV * 9) * dt;
    this.squash += this.squashV * dt;

    // Дыхание
    const breath = Math.sin(t * (sleeping ? 1.1 : 2.1));
    const sy = 1 + breath * 0.012 + this.squash * 0.12 + P.stretch * 0.05;
    const sx = 1 + breath * 0.006 - this.squash * 0.08 - P.stretch * 0.02;
    this.body.scale.set(sx, sy, sx);
    this.body.rotation.set(P.lean, P.turn, P.tilt);
    const shake = angry ? Math.sin(t * 38) * 0.015 : 0;
    this.body.position.set(shake + P.shiftX, P.lift, P.shiftZ);
    this.armL.rotation.z = P.armL;
    this.armR.rotation.z = P.armR;
    this.tail.rotation.y = P.tail;

    // Уши подёргиваются
    const earL = this.head.getObjectByName('ear-l');
    if (earL) earL.rotation.x = t % 6.5 > 6.2 ? Math.sin(t * 40) * 0.12 : 0;

    // Моргание: ленивое, иногда двойное
    if (this.face) {
      if (t > this.blinkAt + 0.3) this.blinkAt = t + 2.5 + Math.random() * 4;
      const bt = t - this.blinkAt;
      this.face.blink = bt > 0 && bt < 0.3 ? 1 - Math.sin((bt / 0.3) * Math.PI) : 1;
      // Говорит: рот живо открывается и закрывается
      if (this.talking || r === 'meow' || r === 'giggle') {
        const talk = 0.25 + 0.75 * Math.abs(Math.sin(t * 9) * Math.sin(t * 5.3 + 1));
        face.mouth = Math.max(face.mouth * 0.6, talk * (r === 'giggle' ? 0.7 : 0.9));
      }
      if (this.eating) face.mouth = 0.2 + 0.6 * Math.abs(Math.sin(t * 13));
      this.face.update(face, dt);
    }

    // Злость: краснеет
    this.furMat.emissive?.setRGB(angry ? 0.9 : 0, angry ? 0.15 : 0, angry ? 0.1 : 0);
    this.furMat.emissiveIntensity = angry ? 0.12 + Math.abs(Math.sin(t * 4)) * 0.18 : 0;

    if (this.steam.visible) {
      this.steam.children.forEach((pf) => {
        const ph = (t * 0.9 + pf.userData.phase) % 1;
        pf.position.set(pf.userData.side * (0.55 + ph * 0.15), 1.95 + ph * 0.55, 0);
        pf.scale.setScalar(0.5 + ph * 1.2);
        ((pf as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.8 * (1 - ph);
      });
    }
    if (this.zzz.visible) {
      this.zzz.children.forEach((z) => {
        const ph = (t * 0.35 + z.userData.phase) % 1;
        z.position.set(0.55 + ph * 0.5, 1.9 + ph * 0.8, 0.2);
        z.scale.setScalar(0.18 + ph * 0.22);
        (z as THREE.Sprite).material.opacity = Math.sin(ph * Math.PI);
      });
    }
    if (this.tear.visible) {
      const ph = (t * 0.6) % 1;
      this.tear.position.set(-0.3, 1.36 - ph * 0.3, surfaceZ(0.3, 1.3) + 0.06);
      this.tear.scale.setScalar(ph < 0.9 ? 1 : 0.01);
    }
  }

  /** Куда попали: голова или пузо. */
  partAt(point: THREE.Vector3): 'head' | 'belly' {
    const local = this.root.worldToLocal(point.clone());
    return local.y > 1.02 ? 'head' : 'belly';
  }
}
