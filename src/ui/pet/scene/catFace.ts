// Лицо игрушки: глаза-бусины в меховых веках, войлочный нос, вышитый ниткой рот, усы.
// Всё сидит на поверхности головы и двигается вместе с ней. Выражение задаётся «целями»,
// а значения плавно подтягиваются к ним — поэтому лицо живое, без рывков.

import * as THREE from 'three';

/** Точка на мордочке: позиция и нормаль в координатах тела. */
export type Surface = (x: number, y: number) => { p: THREE.Vector3; n: THREE.Vector3 } | null;

export interface FaceTargets {
  /** Насколько открыты глаза: 1 — широко, 0 — закрыты. */
  lid: number;
  /** Нижнее веко: 0 — внизу, 1 — поднято (довольный прищур). */
  lower: number;
  /** Наклон век: + злой (внутренние уголки вниз), − грустный. */
  tilt: number;
  /** Рот открыт: 0..1. */
  mouth: number;
  smile: 'smile' | 'flat' | 'frown';
  /** Размер зрачков-бусин: 1 — обычные, больше — «кот из Шрека». */
  eyeScale: number;
}

const Z = new THREE.Vector3(0, 0, 1);

function orient(o: THREE.Object3D, s: { p: THREE.Vector3; n: THREE.Vector3 }, out = 0) {
  o.position.copy(s.p).addScaledVector(s.n, out);
  o.quaternion.setFromUnitVectors(Z, s.n);
}

export class CatFace {
  readonly group = new THREE.Group();
  private eyes: { root: THREE.Group; bead: THREE.Group; top: THREE.Group; topTilt: THREE.Group; bottom: THREE.Group; side: number }[] = [];
  private mouthCavity = new THREE.Group();
  private smiles: Record<string, THREE.Object3D> = {};
  private cur: FaceTargets = { lid: 0.85, lower: 0, tilt: 0, mouth: 0, smile: 'smile', eyeScale: 1 };
  /** Моргание сверху всего: 1 — не моргает. */
  blink = 1;
  readonly blush = new THREE.Group();
  blushMat: THREE.MeshBasicMaterial | null = null;

  constructor(surface: Surface, lidColor: string) {
    const lidMat = new THREE.MeshPhysicalMaterial({ color: lidColor, roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color('#c9cdd3'), side: THREE.DoubleSide });
    const beadMat = new THREE.MeshPhysicalMaterial({ color: '#15171c', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.25, sheenColor: new THREE.Color('#40506a') });
    const glint = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 });
    // У Геры глазки-бусинки маленькие и близко к переносице
    // Как у игрушки: маленькие бусинки, утопленные в мех
    const R = 0.05;

    // Глаза
    for (const side of [-1, 1]) {
      const s = surface(side * 0.23, 1.44);
      if (!s) continue;
      const root = new THREE.Group();
      orient(root, s, -0.03);
      // Чуть смотрят вперёд, а не строго по нормали
      root.rotateY(-side * 0.12);
      const bead = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), beadMat);
      ball.scale.z = 0.8;
      // Большой блик и маленький — «живые» милые глазки
      const g1 = new THREE.Mesh(new THREE.SphereGeometry(R * 0.34, 16, 10), glint);
      g1.position.set(R * 0.3, R * 0.36, R * 0.6);
      const g2 = new THREE.Mesh(new THREE.SphereGeometry(R * 0.15, 10, 8), glint);
      g2.position.set(-R * 0.32, -R * 0.3, R * 0.68);
      bead.add(ball, g1, g2);
      // Верхнее веко: купол, который поворачивается вперёд-вниз и закрывает глаз
      const topTilt = new THREE.Group();
      const top = new THREE.Group();
      const lidTop = new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      top.add(lidTop);
      topTilt.add(top);
      // Нижнее веко
      const bottom = new THREE.Group();
      const lidBot = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidMat);
      bottom.add(lidBot);
      root.add(bead, topTilt, bottom);
      this.group.add(root);
      this.eyes.push({ root, bead, top, topTilt, bottom, side });
    }

    // Нос: мягкий розовый треугольник из войлока
    const nose = surface(0, 1.285);
    if (nose) {
      const shape = new THREE.Shape();
      shape.moveTo(-0.07, 0.03);
      shape.quadraticCurveTo(0, 0.05, 0.07, 0.03);
      shape.quadraticCurveTo(0.08, 0.015, 0.012, -0.045);
      shape.quadraticCurveTo(0, -0.055, -0.012, -0.045);
      shape.quadraticCurveTo(-0.08, 0.015, -0.07, 0.03);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.016, bevelSegments: 5, curveSegments: 16 });
      geo.translate(0, 0, -0.02);
      const felt = new THREE.MeshPhysicalMaterial({ color: '#e59aa1', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#ffd0d5'), sheenRoughness: 0.6 });
      const m = new THREE.Mesh(geo, felt);
      m.scale.setScalar(0.72);
      m.castShadow = true;
      orient(m, nose, 0.012);
      this.group.add(m);
    }

    // Вышитый рот: нитка от носа вниз и «w»
    // Рот у игрушки спрятан в мехе — нитка тонкая и неяркая
    const thread = new THREE.MeshStandardMaterial({ color: '#5a4a46', roughness: 0.9 });
    const stitch = (pts: [number, number][], r = 0.0065) => {
      const v: THREE.Vector3[] = [];
      for (const [x, y] of pts) {
        const s = surface(x, y);
        if (s) v.push(s.p.clone().addScaledVector(s.n, 0.004));
      }
      if (v.length < 2) return new THREE.Group();
      return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), 40, r, 6, false), thread);
    };
    // У Геры рот спрятан в мехе — нитки не рисуем, рот появляется только когда открыт
    const w = (lift: number) => [
      [-0.1, 1.17 + lift],
      [-0.075, 1.152],
      [-0.035, 1.15],
      [0, 1.175],
      [0.035, 1.15],
      [0.075, 1.152],
      [0.1, 1.17 + lift],
    ] as [number, number][];
    this.smiles.smile = stitch(w(0.012));
    this.smiles.flat = stitch([
      [-0.08, 1.16],
      [-0.04, 1.157],
      [0, 1.175],
      [0.04, 1.157],
      [0.08, 1.16],
    ]);
    this.smiles.frown = stitch([
      [-0.09, 1.14],
      [-0.05, 1.158],
      [0, 1.175],
      [0.05, 1.158],
      [0.09, 1.14],
    ]);
    Object.values(this.smiles).forEach((o) => {
      o.visible = false;
      this.group.add(o);
    });

    // Открытый рот: тёмная ямка под ниткой с розовым язычком
    const mouth = surface(0, 1.1);
    if (mouth) {
      // Утопленная в мех ямка: видна только её кромка — выглядит как настоящий приоткрытый ротик
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), new THREE.MeshStandardMaterial({ color: '#6b3a40', roughness: 0.85 }));
      inner.scale.set(1.1, 0.8, 0.6);
      const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshPhysicalMaterial({ color: '#e7909a', roughness: 0.5, clearcoat: 0.3 }));
      tongue.scale.set(1.1, 0.6, 0.7);
      tongue.position.set(0, -0.018, 0.012);
      this.mouthCavity.add(inner, tongue);
      orient(this.mouthCavity, mouth, -0.02);
      this.group.add(this.mouthCavity);
    }

    // Усы: тонкие белые, чуть изогнутые
    const whiskerMat = new THREE.MeshStandardMaterial({ color: '#fbfbfb', roughness: 0.4, transparent: true, opacity: 0.9 });
    for (const side of [-1, 1]) {
      for (const [dy, lift] of [
        [0.03, 0.12],
        [-0.01, 0.02],
        [-0.05, -0.09],
      ]) {
        const s = surface(side * 0.19, 1.19 + dy);
        if (!s) continue;
        const a = s.p.clone().addScaledVector(s.n, -0.01);
        const b = a.clone().add(new THREE.Vector3(side * 0.22, lift * 0.5 + 0.015, 0.03));
        const c = a.clone().add(new THREE.Vector3(side * 0.46, lift, -0.06));
        const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, b, c), 16, 0.0035, 4, false);
        this.group.add(new THREE.Mesh(geo, whiskerMat));
      }
    }

    // Румянец
    const blushMat = new THREE.MeshBasicMaterial({ color: '#ff9aa6', transparent: true, opacity: 0.3, depthWrite: false });
    this.blushMat = blushMat;
    for (const side of [-1, 1]) {
      const s = surface(side * 0.42, 1.27);
      if (!s) continue;
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), blushMat);
      b.scale.y = 0.6;
      orient(b, s, 0.008);
      this.blush.add(b);
    }
    this.group.add(this.blush);
  }

  /** Плавно подтянуть выражение к целям. dt — секунды с прошлого кадра. */
  update(target: FaceTargets, dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    const c = this.cur;
    c.lid += (target.lid - c.lid) * k;
    c.lower += (target.lower - c.lower) * k;
    c.tilt += (target.tilt - c.tilt) * k;
    c.eyeScale += (target.eyeScale - c.eyeScale) * k;
    // Рот быстрее, чтобы успевал за «речью»
    c.mouth += (target.mouth - c.mouth) * (1 - Math.exp(-dt * 22));
    c.smile = target.smile;

    const open = Math.min(c.lid, this.blink);
    for (const e of this.eyes) {
      // 1 — купол спрятан за глазом, 0 — закрывает его спереди
      e.top.rotation.x = Math.PI / 2 - Math.PI * open;
      e.topTilt.rotation.z = e.side * c.tilt;
      // Нижнее: π/2 — спрятано за глазом, чем больше lower, тем выше поднимается спереди
      e.bottom.rotation.x = (Math.PI / 2) * (1 - c.lower * 0.6);
      e.bead.scale.setScalar(c.eyeScale);
    }
    for (const o of Object.values(this.smiles)) o.visible = false;
    this.mouthCavity.visible = c.mouth > 0.04;
    this.mouthCavity.scale.set(0.7 + c.mouth * 0.3, Math.max(0.05, c.mouth * 0.9), 1);
  }
}
