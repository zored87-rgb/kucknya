// 3D-кот по игрушке Russ «Prudence»: пухлое тело-«груша», голова без шеи, белые грудка и мордочка,
// розовый нос и ушки, лапки с белыми кончиками, длинный полосатый хвост лежит на полу.
// Выражения лица — наборы деталей, которые показываем и прячем. Анимации — в update().

import * as THREE from 'three';
import type { Face } from '../Cat';
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

/** Дуга (для закрытых глаз, улыбки, бровей). up — выпуклостью вверх. */
function arc(r: number, tube: number, mat: THREE.Material, up: boolean): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 20, Math.PI), mat);
  if (!up) m.rotation.z = Math.PI;
  return m;
}

export class Cat3D {
  readonly root = new THREE.Group();
  /** Всё, что дышит и качается. */
  private body = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private tail = new THREE.Group();
  private furMat: THREE.MeshPhysicalMaterial;
  private faces: Record<string, THREE.Object3D> = {};
  private eyes = new THREE.Group();
  private mouthOpen = new THREE.Group();
  private blush = new THREE.Group();
  private steam = new THREE.Group();
  private zzz = new THREE.Group();
  private tear: THREE.Mesh;
  private outfits: Record<string, THREE.Object3D> = {};
  private face: Face = 'smile';
  private mood = 'happy';
  private talking = false;
  private eating = false;
  private reaction: string | null = null;
  private reactionAt = 0;
  private blinkAt = 2;
  /** Меши, по которым ловим касания. */
  readonly hitMeshes: THREE.Object3D[] = [];

  constructor() {
    const bump = undefined;
    const fur = furTexture();
    this.furMat = plush(fur, bump);
    const plainMat = plush(plainFurTexture(), bump);
    const whiteMat = plush(creamTexture(), bump, '#ffffff');
    const pinkMat = new THREE.MeshPhysicalMaterial({ color: PINK, roughness: 0.8, sheen: 0.6, sheenColor: new THREE.Color('#ffd7d9') });
    const inkMat = new THREE.MeshPhysicalMaterial({ color: '#111114', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
    const lineMat = new THREE.MeshStandardMaterial({ color: '#2a292d', roughness: 0.6 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: '#5a3438', roughness: 0.7 });
    const tongueMat = new THREE.MeshStandardMaterial({ color: '#e67a86', roughness: 0.5 });
    const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

    // Тело
    const bodyGeo = new THREE.LatheGeometry(POINTS, 64, Math.PI, Math.PI * 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.furMat);
    bodyMesh.scale.z = DEPTH;
    bodyMesh.castShadow = true;
    bodyMesh.name = 'cat-body';
    bodyMesh.userData.proc = true;
    this.body.add(bodyMesh);
    this.hitMeshes.push(bodyMesh);

    // Уши: треугольные, розовые внутри, тёмные кончики
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.5, 24), plainMat);
      outer.scale.z = 0.45;
      outer.castShadow = true;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 20), pinkMat);
      inner.scale.z = 0.3;
      inner.position.set(0, -0.05, 0.09);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 16), new THREE.MeshStandardMaterial({ color: FUR_DARK, roughness: 1 }));
      tip.scale.z = 0.45;
      tip.position.y = 0.19;
      ear.add(outer, inner, tip);
      ear.position.set(side * 0.5, 1.82, 0.04);
      ear.rotation.z = -side * 0.42;
      ear.rotation.x = -0.12;
      ear.userData.side = side;
      ear.name = side < 0 ? 'ear-l' : 'ear-r';
      ear.userData.proc = true;
      this.head.add(ear);
    }

    // Мордочка: белые щёчки-подушечки и подбородок
    const zM = surfaceZ(0, 1.18);
    for (const side of [-1, 1]) {
      const cheek = sphere(0.17, whiteMat);
      cheek.scale.set(1.05, 0.85, 0.7);
      cheek.position.set(side * 0.13, 1.19, zM - 0.02);
      cheek.userData.proc = true;
      this.head.add(cheek);
      this.hitMeshes.push(cheek);
    }
    const chin = sphere(0.12, whiteMat);
    chin.scale.set(1.2, 0.8, 0.7);
    chin.position.set(0, 1.05, zM - 0.06);
    chin.userData.proc = true;
    this.head.add(chin);
    // Белое пятно на лбу над носом
    const bridge = sphere(0.1, whiteMat);
    bridge.scale.set(0.9, 1.4, 0.5);
    bridge.position.set(0, 1.36, surfaceZ(0, 1.36) - 0.02);
    bridge.userData.proc = true;
    this.head.add(bridge);

    // Нос
    const nose = sphere(0.06, pinkMat);
    nose.scale.set(1.35, 0.85, 0.8);
    nose.position.set(0, 1.28, surfaceZ(0, 1.28) + 0.07);
    this.head.add(nose);

    // Усы
    const whiskerMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    for (const side of [-1, 1]) {
      for (const [dy, tilt] of [
        [0.03, 0.12],
        [-0.02, 0],
        [-0.07, -0.12],
      ]) {
        const from = new THREE.Vector3(side * 0.2, 1.19 + dy, zM + 0.08);
        const to = new THREE.Vector3(side * 0.62, 1.19 + dy + tilt, zM - 0.05);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), whiskerMat);
        line.userData.anchor = [side * 0.24, 1.19 + dy];
        this.head.add(line);
      }
    }

    // Глаза: маленькие чёрные бусинки с бликом
    const eyeY = 1.43;
    const eyeX = 0.27;
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = sphere(0.065, inkMat, 20);
      ball.scale.z = 0.6;
      const shine = sphere(0.02, shineMat, 8);
      shine.position.set(0.022, 0.025, 0.035);
      eye.add(ball, shine);
      eye.position.set(side * eyeX, eyeY, surfaceZ(side * eyeX, eyeY) + 0.01);
      eye.rotation.y = side * 0.35;
      this.eyes.add(eye);
    }
    this.head.add(this.eyes);
    this.faces.eyesOpen = this.eyes;

    const eyeArcs = (up: boolean) => {
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const a = arc(0.06, 0.014, lineMat, up);
        a.position.set(side * eyeX, eyeY - (up ? 0.02 : -0.01), surfaceZ(side * eyeX, eyeY) + 0.02);
        a.rotation.y = side * 0.35;
        g.add(a);
      }
      this.head.add(g);
      return g;
    };
    this.faces.eyesHappy = eyeArcs(true);
    this.faces.eyesSleep = eyeArcs(false);

    const brows = (angry: boolean) => {
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.13, 4, 8), lineMat);
        b.rotation.z = Math.PI / 2 + side * (angry ? 0.45 : -0.35);
        b.position.set(side * 0.27, 1.56, surfaceZ(side * 0.27, 1.56) + 0.02);
        b.rotation.y = side * 0.35;
        g.add(b);
      }
      this.head.add(g);
      return g;
    };
    this.faces.browsAngry = brows(true);
    this.faces.browsWorried = brows(false);

    // Рты
    const mouthZ = zM + 0.1;
    const smile = new THREE.Group();
    for (const side of [-1, 1]) {
      const a = arc(0.045, 0.011, lineMat, false);
      a.position.set(side * 0.045, 1.17, mouthZ);
      smile.add(a);
    }
    this.head.add(smile);
    this.faces.mouthSmile = smile;

    const open = sphere(0.07, mouthMat, 16);
    open.scale.set(1, 1.1, 0.45);
    const tongue = sphere(0.04, tongueMat, 12);
    tongue.scale.set(1.2, 0.6, 0.6);
    tongue.position.set(0, -0.04, 0.02);
    this.mouthOpen.add(open, tongue);
    this.mouthOpen.position.set(0, 1.12, mouthZ - 0.01);
    this.head.add(this.mouthOpen);
    this.faces.mouthOpen = this.mouthOpen;

    const angryMouth = new THREE.Group();
    const am = sphere(0.075, mouthMat, 16);
    am.scale.set(1.7, 0.9, 0.45);
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    teeth.position.set(0, 0.04, 0.03);
    angryMouth.add(am, teeth);
    angryMouth.position.set(0, 1.12, mouthZ - 0.01);
    this.head.add(angryMouth);
    this.faces.mouthAngry = angryMouth;

    const small = sphere(0.03, mouthMat, 12);
    small.scale.z = 0.5;
    small.position.set(0, 1.13, mouthZ);
    this.head.add(small);
    this.faces.mouthSmall = small;

    const frown = arc(0.05, 0.011, lineMat, true);
    frown.position.set(0, 1.11, mouthZ);
    this.head.add(frown);
    this.faces.mouthFrown = frown;

    // Румянец
    const blushMat = new THREE.MeshBasicMaterial({ color: '#f28c8c', transparent: true, opacity: 0.45, depthWrite: false });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), blushMat);
      b.scale.y = 0.6;
      const x = side * 0.42;
      b.position.set(x, 1.27, surfaceZ(x, 1.27) + 0.012);
      b.rotation.y = Math.asin(x / radiusAt(1.27)) * 0.9;
      this.blush.add(b);
    }
    this.head.add(this.blush);

    // Слеза
    this.tear = sphere(0.035, new THREE.MeshPhysicalMaterial({ color: '#7cc4ff', roughness: 0.1, transmission: 0.3, clearcoat: 1 }), 12);
    this.tear.scale.y = 1.3;
    this.head.add(this.tear);

    // Пар из ушей
    const steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 });
    for (let i = 0; i < 4; i++) {
      const puff = sphere(0.09, steamMat, 12);
      puff.userData = { side: i % 2 ? 1 : -1, phase: i / 4 };
      this.steam.add(puff);
    }
    this.head.add(this.steam);

    // Zzz
    const zTex = glyphTexture('z', '#3a4a8a');
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }));
      s.userData.phase = i / 3;
      this.zzz.add(s);
    }
    this.head.add(this.zzz);

    this.body.add(this.head);

    // Лапки: торчат вперёд-в стороны, белые кончики
    const armMat = plush(ringFurTexture(3), bump);
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 8, 16), armMat);
      limb.castShadow = true;
      limb.position.set(0, -0.2, 0);
      const paw = sphere(0.165, whiteMat);
      paw.scale.set(1, 0.9, 1);
      paw.position.set(0, -0.4, 0.02);
      const inner = new THREE.Group();
      inner.add(limb, paw);
      inner.rotation.z = side * 0.75;
      inner.rotation.x = -0.55;
      inner.userData.proc = true;
      arm.add(inner);
      arm.position.set(side * 0.74, 1.0, 0.32);
      this.body.add(arm);
      this.hitMeshes.push(paw);
    }

    // Задние лапки: белые «тапочки» спереди внизу
    for (const side of [-1, 1]) {
      const leg = sphere(0.26, plush(ringFurTexture(2), bump), 20);
      leg.scale.set(1, 0.7, 1.15);
      leg.position.set(side * 0.42, 0.16, 0.45);
      const foot = sphere(0.2, whiteMat, 20);
      foot.scale.set(1.05, 0.75, 1.1);
      foot.position.set(side * 0.44, 0.12, 0.66);
      leg.userData.proc = true;
      foot.userData.proc = true;
      this.body.add(leg, foot);
    }

    // Хвост: толстый, полосатый, лежит на полу и заворачивает вперёд справа
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.25, 0.3, -0.65),
      new THREE.Vector3(0.75, 0.14, -0.62),
      new THREE.Vector3(1.15, 0.12, -0.25),
      new THREE.Vector3(1.25, 0.12, 0.2),
      new THREE.Vector3(1.08, 0.13, 0.58),
    ]);
    const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 48, 0.13, 16, false), plush(ringFurTexture(7), bump));
    tailMesh.castShadow = true;
    const tip = sphere(0.13, plainMat, 16);
    tip.position.copy(tailCurve.getPoint(1));
    tailMesh.userData.proc = true;
    tip.userData.proc = true;
    this.tail.add(tailMesh, tip);
    this.tail.position.set(0, 0, 0);
    this.root.add(this.tail);

    // Наряды
    this.buildOutfits(lineMat);

    this.root.add(this.body);
    this.setFace('smile');
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
   * Самодельные фигуры прячем, черты лица сажаем точно на новую поверхность мордочки.
   */
  useModel(model: THREE.Object3D) {
    const node = (n: string) => model.getObjectByName(n);
    const body = node('CatBody');
    if (!body) return;
    // Убрать временные фигуры
    this.root.traverse((o) => {
      if (o.userData.proc) o.visible = false;
    });
    const shadows = (o: THREE.Object3D) =>
      o.traverse((c) => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
    // Позиции узлов glb — в координатах кота
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
    // Краснеет от злости уже новая шёрстка
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
    if (tail) take(tail, this.tail, true);

    // Черты лица — на поверхность новой модели: луч спереди на мордочку
    body.updateWorldMatrix(true, true);
    const ray = new THREE.Raycaster();
    const surface = (x: number, y: number): number | null => {
      // Луч в координатах кота: спереди, перпендикулярно мордочке
      const from = this.body.localToWorld(new THREE.Vector3(x, y, 5));
      const to = this.body.localToWorld(new THREE.Vector3(x, y, -5));
      ray.set(from, to.sub(from).normalize());
      const hit = ray.intersectObject(body, true)[0];
      return hit ? this.body.worldToLocal(hit.point.clone()).z : null;
    };
    this.root.updateWorldMatrix(true, true);
    const shift = (o: THREE.Object3D, x: number, y: number) => {
      const want = surface(x, y);
      if (want != null) o.position.z += want - surfaceZ(x, y);
    };
    const skip = new Set<THREE.Object3D>([this.steam, this.zzz, this.tear, ...Object.values(this.outfits)]);
    for (const c of [...this.head.children]) {
      if (skip.has(c) || c.userData.proc || c.name.startsWith('ear') || c.name.startsWith('Ear')) continue;
      if (c.userData.anchor) {
        const [x, y] = c.userData.anchor as [number, number];
        shift(c, x, y);
      } else if (c instanceof THREE.Group && c.children.length && c.position.lengthSq() === 0) {
        for (const g of c.children) shift(g, g.position.x, g.position.y);
      } else {
        shift(c, c.position.x, c.position.y);
      }
    }
  }

  setOutfit(id: string) {
    for (const [k, o] of Object.entries(this.outfits)) o.visible = k === id;
  }

  setState(s: { face: Face; mood: string; talking: boolean; eating: boolean; reaction: string | null }) {
    if (s.reaction !== this.reaction) this.reactionAt = performance.now() / 1000;
    this.mood = s.mood;
    this.talking = s.talking;
    this.eating = s.eating;
    this.reaction = s.reaction;
    if (s.face !== this.face) this.setFace(s.face);
  }

  private setFace(face: Face) {
    this.face = face;
    const show = (keys: string[]) => {
      for (const [k, o] of Object.entries(this.faces)) o.visible = keys.includes(k);
    };
    const map: Record<Face, string[]> = {
      smile: ['eyesOpen', 'mouthSmile'],
      flat: ['eyesOpen', 'mouthSmall'],
      hungry: ['eyesOpen', 'browsWorried', 'mouthSmall'],
      angry: ['eyesOpen', 'browsAngry', 'mouthAngry'],
      hiss: ['eyesOpen', 'browsAngry', 'mouthAngry'],
      sad: ['eyesOpen', 'browsWorried', 'mouthFrown'],
      sleep: ['eyesSleep', 'mouthSmile'],
      meow: ['eyesHappy', 'mouthOpen'],
      giggle: ['eyesHappy', 'mouthOpen'],
      purr: ['eyesHappy', 'mouthSmile'],
      eat: ['eyesHappy', 'mouthOpen'],
    };
    show(map[face]);
    this.blush.visible = ['smile', 'meow', 'giggle', 'purr', 'eat'].includes(face);
    this.tear.visible = face === 'sad';
    this.steam.visible = face === 'angry' || face === 'hiss';
    this.zzz.visible = face === 'sleep';
    // Голодные глаза — большие и блестящие
    const big = face === 'hungry' || face === 'sad' ? 1.35 : 1;
    this.eyes.children.forEach((e) => e.scale.setScalar(big));
  }

  /** t — секунды с начала. */
  update(t: number) {
    const r = this.reaction;
    const since = t - this.reactionAt;
    const angry = this.face === 'angry' || this.face === 'hiss';
    const sleeping = this.mood === 'sleeping' && !r;

    // Дыхание
    const breath = Math.sin(t * (sleeping ? 1.2 : 2.2));
    this.body.scale.set(1 + breath * 0.008, 1 + breath * 0.014, 1 + breath * 0.008);

    // Поза тела
    let rotZ = 0;
    let rotX = 0;
    let y = 0;
    let x = 0;
    let rotY = Math.sin(t * 0.4) * 0.12;
    if (angry) {
      x = Math.sin(t * 40) * 0.02;
      rotY = 0;
    } else if (r === 'giggle') {
      rotZ = Math.sin(t * 28) * 0.08;
    } else if (r === 'purr') {
      rotZ = Math.sin(t * 3) * 0.06;
      rotY = 0;
    } else if ((r === 'meow' || r === 'wake') && since < 0.5) {
      y = Math.sin((since / 0.5) * Math.PI) * 0.22;
    } else if (this.eating) {
      rotX = 0.12 + Math.sin(t * 14) * 0.05;
      rotY = 0;
    } else if (sleeping) {
      rotZ = 0.08;
      rotX = 0.08;
      rotY = 0;
    } else if (this.mood === 'sad' || this.mood === 'hungry') {
      rotZ = Math.sin(t * 0.8) * 0.05;
      rotX = 0.04;
    }
    this.body.rotation.set(rotX, rotY, rotZ);
    this.body.position.set(x, y, 0);
    this.head.rotation.z = sleeping ? 0.1 : this.mood === 'hungry' ? Math.sin(t * 1.3) * 0.06 : 0;

    // Лапки
    let armL = Math.sin(t * 1.6) * 0.06;
    let armR = -armL;
    if (angry) {
      armL = -1.9 + Math.sin(t * 22) * 0.2;
      armR = 1.9 - Math.sin(t * 22 + 1) * 0.2;
    } else if (r === 'meow' && since < 1.2) {
      armR = 1.6 + Math.sin(t * 16) * 0.35;
    } else if (this.mood === 'hungry' || this.mood === 'sad') {
      armL = 0.35 + Math.sin(t * 5) * 0.12;
      armR = -0.35 - Math.sin(t * 5) * 0.12;
    } else if (this.eating) {
      armL = 0.3;
      armR = -0.3;
    }
    this.armL.rotation.z = armL;
    this.armR.rotation.z = armR;

    // Хвост
    const wag = angry ? Math.sin(t * 14) * 0.18 : sleeping ? 0 : Math.sin(t * 1.8) * 0.07;
    this.tail.rotation.y = wag;

    // Уши подёргиваются
    const twitch = (t % 6.5) > 6.2 ? Math.sin(t * 40) * 0.12 : 0;
    this.head.getObjectByName('ear-l')!.rotation.x = -0.12 + twitch;

    // Моргание
    if (this.faces.eyesOpen.visible) {
      if (t > this.blinkAt + 0.14) this.blinkAt = t + 2.5 + Math.random() * 3;
      const blinking = t > this.blinkAt && t < this.blinkAt + 0.14;
      this.eyes.scale.y = blinking ? 0.1 : 1;
    }

    // Рот говорит / жуёт
    if (this.faces.mouthOpen.visible) {
      const speed = this.eating ? 16 : 11;
      const open = this.talking || this.eating || r === 'meow' || r === 'giggle' ? 0.35 + Math.abs(Math.sin(t * speed)) * 0.75 : 1;
      this.mouthOpen.scale.y = open;
    }

    // Злость: краснеет
    this.furMat.emissive.setRGB(angry ? 0.9 : 0, angry ? 0.15 : 0, angry ? 0.1 : 0);
    this.furMat.emissiveIntensity = angry ? 0.12 + Math.abs(Math.sin(t * 4)) * 0.18 : 0;

    // Пар
    if (this.steam.visible) {
      this.steam.children.forEach((p) => {
        const ph = (t * 0.9 + p.userData.phase) % 1;
        p.position.set(p.userData.side * (0.55 + ph * 0.15), 1.95 + ph * 0.55, 0);
        p.scale.setScalar(0.5 + ph * 1.2);
        ((p as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.8 * (1 - ph);
      });
    }

    // Zzz
    if (this.zzz.visible) {
      this.zzz.children.forEach((z) => {
        const ph = (t * 0.35 + z.userData.phase) % 1;
        z.position.set(0.55 + ph * 0.5, 1.9 + ph * 0.8, 0.2);
        z.scale.setScalar(0.18 + ph * 0.22);
        (z as THREE.Sprite).material.opacity = Math.sin(ph * Math.PI);
      });
    }

    // Слеза
    if (this.tear.visible) {
      const ph = (t * 0.6) % 1;
      this.tear.position.set(-0.3, 1.36 - ph * 0.3, surfaceZ(0.3, 1.3) + 0.04);
      this.tear.scale.setScalar(ph < 0.9 ? 1 : 0.01);
    }
  }

  /** Куда попали: голова или пузо. */
  partAt(point: THREE.Vector3): 'head' | 'belly' {
    const local = this.root.worldToLocal(point.clone());
    return local.y > 1.02 ? 'head' : 'belly';
  }
}
