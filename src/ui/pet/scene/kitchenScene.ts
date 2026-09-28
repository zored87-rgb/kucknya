// 3D-кухня: комната, предметы, свет, камера. Касания — лучом из камеры.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Face } from '../Cat';
import { Cat3D } from './cat3d';
import { basketTexture, calendarTexture, floorTexture, glyphTexture, cloudLayerTexture, dateTexture, doorInsideTexture, fridgeInsideTexture, precipTexture, rugTexture, skyTexture, wallTexture } from './textures';

export type Target = 'fridge' | 'recipes' | 'eaten' | 'buy' | 'feed' | 'settings';

export interface SceneState {
  face: Face;
  mood: string;
  talking: boolean;
  eating: boolean;
  reaction: string | null;
  outfit: string;
  wall: string;
  sky: string;
  night: boolean;
  spoiling: boolean;
  weekMeals: number;
  /** Сегодняшнее число и месяц (0–11) — на календаре. */
  day: number;
  month: number;
  /** Погода за окном: clear, partly, cloudy, fog, drizzle, rain, snow, storm. */
  weather: string;
  clouds: number;
}

export interface SceneHandlers {
  onTarget: (t: Target) => void;
  onCatTap: (part: 'head' | 'belly') => void;
  onCatStroke: () => void;
}

/** Точки для HTML-подписей поверх сцены. */
export const ANCHORS: Record<string, THREE.Vector3> = {
  fridge: new THREE.Vector3(-1.3, 2.45, -1.6),
  fridgeTop: new THREE.Vector3(-0.9, 2.25, -1.2),
  recipes: new THREE.Vector3(1.35, 2.45, -2.8),
  eaten: new THREE.Vector3(1.5, 1.33, -2.85),
  buy: new THREE.Vector3(1.1, 0.2, 1.2),
  buyTop: new THREE.Vector3(1.35, 0.85, 0.9),
  feed: new THREE.Vector3(-0.8, 0.45, 1.4),
  catHead: new THREE.Vector3(0, 1.95, 0.85),
  settings: new THREE.Vector3(1.3, 4.42, -2.9),
  window: new THREE.Vector3(-0.45, 4.3, -2.8),
};

function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
}

function tag<T extends THREE.Object3D>(o: T, target: Target): T {
  o.traverse((c) => (c.userData.target = target));
  return o;
}

export class KitchenScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  private cat = new Cat3D();
  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private ray = new THREE.Raycaster();
  private targets: THREE.Object3D[] = [];
  private wallMats: (THREE.MeshStandardMaterial | THREE.MeshBasicMaterial)[] = [];
  private skyMat!: THREE.MeshBasicMaterial;
  private calendarMat!: THREE.MeshStandardMaterial;
  private fridgeDoors: THREE.Object3D[] = [];
  /** Комната из простых фигур — пока не загрузилась запечённая из Blender. */
  private room = new THREE.Group();
  /** Материалы запечённой комнаты: ночью затемняем. */
  private baked: THREE.MeshBasicMaterial[] = [];
  private calendarNum: THREE.Mesh | null = null;
  /** Дождь/снег за окном и вспышка молнии. */
  private precip: THREE.Mesh;
  /** Облака за окном — плывут. */
  private cloudLayer: THREE.Mesh;
  private flash: THREE.Mesh;
  private nextFlash = 0;
  private lastFlash = -10;
  private fridgeOpenAt = -1;
  private stink = new THREE.Group();
  private food = new THREE.Group();
  private hearts = new THREE.Group();
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private lamp!: THREE.PointLight;
  private state: Partial<SceneState> = {};
  private drag: { x: number; y: number; dist: number; stroked: boolean; onCat: boolean } | null = null;
  private resizeObs: ResizeObserver;
  private clock3d: THREE.Group | null = null;
  private zoom: { from: THREE.Vector3; look: THREE.Vector3; to: THREE.Vector3; start: number } | null = null;
  /** Кипящая кастрюля в режиме готовки. */
  private pot: { bubbles: THREE.Mesh[]; steam: THREE.Mesh[]; lid: THREE.Object3D } | null = null;
  private look = new THREE.Vector3(0, 1.05, 0);

  constructor(
    private container: HTMLElement,
    private handlers: SceneHandlers,
    /** room — вся кухня; chef — крупный план: Гера-повар в режиме готовки. */
    private mode: 'room' | 'chef' = 'room',
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = 'room-canvas';
    canvas.style.touchAction = 'pan-y';
    container.prepend(canvas);

    this.camera.position.set(0, 1.85, 6.4);
    this.camera.lookAt(0, 1.05, 0);

    this.buildLights();
    this.buildRoom();
    this.buildObjects();
    this.precip = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    // Процедурное окно
    this.precip.position.set(0, 2.55, -2.965);
    this.flash.position.set(0, 2.55, -2.96);
    this.precip.visible = false;
    this.cloudLayer = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    this.cloudLayer.position.set(0, 2.55, -2.97);
    this.scene.add(this.precip, this.flash, this.cloudLayer);

    // На весь экран Гера сидит ближе и крупнее, как Том в игре
    this.cat.root.position.set(0, 0.03, this.mode === 'chef' ? 0.55 : 0.85);
    this.cat.root.scale.setScalar(this.mode === 'chef' ? 0.72 : 0.82);
    if (this.mode === 'chef') this.buildPot();
    this.scene.add(this.room);
    this.scene.add(this.cat.root);
    this.scene.add(this.hearts);
    // Тень кота на полу запечённой комнаты
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.ShadowMaterial({ opacity: 0.28 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.05, 0.85);
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    // Запечённая кухня из Blender
    new GLTFLoader().load(`${import.meta.env.BASE_URL}models/room.glb`, (gltf) => this.useRoomModel(gltf.scene), undefined, () => undefined);
    // Модель кота из Blender; пока грузится — кот из простых фигур
    new GLTFLoader().load(
      `${import.meta.env.BASE_URL}models/cat.glb`,
      (gltf) => this.cat.useModel(gltf.scene),
      undefined,
      () => undefined,
    );

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', () => (this.drag = null));
    document.addEventListener('visibilitychange', this.onVisibility);
    this.start();
    if (import.meta.env.DEV) (window as unknown as { __kitchen: KitchenScene }).__kitchen = this;
  }

  // ---------- Построение ----------

  private buildLights() {
    this.hemi = new THREE.HemisphereLight('#fff8ee', '#a58a70', 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.2);
    this.sun.position.set(2.2, 5, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -3;
    this.sun.shadow.camera.right = 3;
    this.sun.shadow.camera.top = 3;
    this.sun.shadow.camera.bottom = -2;
    this.sun.shadow.radius = 6;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    // Контровой свет сзади — пушистый край у игрушки
    const rim = new THREE.DirectionalLight('#dfe8ff', 1.1);
    rim.position.set(-3, 3, -3);
    this.scene.add(rim);
    // Тёплая лампа, которая горит ночью
    this.lamp = new THREE.PointLight('#ffc27a', 0, 7, 1.5);
    this.lamp.position.set(0, 3.6, 1);
    this.scene.add(this.lamp);
  }

  private buildRoom() {
    const W = 8;
    const D = 6;
    // Стены высокие: на весь экран телефона видно много стены над котом
    const H = 10;
    const floorTex = floorTexture();
    floorTex.repeat.set(3, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 16), mat('#ffffff', { map: floorTex, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 5;
    floor.receiveShadow = true;
    this.room.add(floor);

    const makeWall = (w: number) => {
      const t = wallTexture('base');
      t.repeat.set(w / 1.2, H / 1.2);
      const m = mat('#ffffff', { map: t, roughness: 0.95 });
      this.wallMats.push(m);
      return m;
    };
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), makeWall(W));
    back.position.set(0, H / 2, -3);
    back.receiveShadow = true;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), makeWall(D));
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, H / 2, 0);
    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.x = W / 2;
    this.room.add(back, left, right);

    // Плинтус
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, 0.05), mat('#9c6436'));
    skirting.position.set(0, 0.08, -2.97);
    this.room.add(skirting);

    // Окно
    const win = new THREE.Group();
    this.skyMat = new THREE.MeshBasicMaterial({ map: skyTexture('day') });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), this.skyMat);
    const frameMat = mat('#ffffff', { roughness: 0.4 });
    const bar = (w: number, h: number, x: number, y: number) => {
      const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.1, 2, 0.03), frameMat);
      b.position.set(x, y, 0.03);
      b.castShadow = true;
      win.add(b);
    };
    win.add(glass);
    bar(1.7, 0.12, 0, 0.6);
    bar(1.7, 0.12, 0, -0.6);
    bar(0.12, 1.3, -0.8, 0);
    bar(0.12, 1.3, 0.8, 0);
    bar(1.5, 0.06, 0, 0);
    bar(0.06, 1.1, 0, 0);
    const sill = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.08, 0.25, 2, 0.03), frameMat);
    sill.position.set(0, -0.68, 0.1);
    win.add(sill);
    win.position.set(0, 2.55, -2.98);
    this.room.add(win);

    // Коврик
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.03, 48), mat('#ffffff', { map: rugTexture(), roughness: 1 }));
    rug.scale.z = 0.62;
    rug.position.set(0, 0.015, 0.55);
    rug.receiveShadow = true;
    this.room.add(rug);
  }

  private buildObjects() {
    // ----- Холодильник -----
    const fridge = new THREE.Group();
    const white = mat('#f3f6f8', { roughness: 0.35, metalness: 0.05 });
    const edge = mat('#c9d3da', { roughness: 0.5 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.2, 0.85, 4, 0.12), edge);
    body.position.y = 1.1;
    body.castShadow = true;
    body.receiveShadow = true;
    fridge.add(body);
    const door = (h: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(-0.48, y, 0.43);
      const d = new THREE.Mesh(new RoundedBoxGeometry(0.96, h, 0.08, 3, 0.05), white);
      d.position.set(0.48, 0, 0.02);
      d.castShadow = true;
      const handle = new THREE.Mesh(new RoundedBoxGeometry(0.06, Math.min(0.5, h * 0.4), 0.08, 2, 0.02), mat('#9fb0bd', { metalness: 0.6, roughness: 0.3 }));
      handle.position.set(0.86, 0, 0.09);
      pivot.add(d, handle);
      fridge.add(pivot);
      this.fridgeDoors.push(pivot);
      return pivot;
    };
    door(0.66, 1.78);
    const main = door(1.42, 0.76);
    // Магниты и записка
    const magnet = (color: string, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 20), mat(color, { roughness: 0.3 }));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, 0.08);
      main.add(m);
    };
    magnet('#ff7a59', 0.25, 0.45);
    magnet('#3f8efc', 0.55, 0.35);
    magnet('#ffc83d', 0.3, 0.1);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.36), mat('#fff6c2', { roughness: 0.9 }));
    note.position.set(0.35, -0.2, 0.065);
    note.rotation.z = 0.06;
    main.add(note);
    fridge.position.set(-1.55, 0, -1.4);
    fridge.rotation.y = 0.35;
    this.room.add(tag(fridge, 'fridge'));
    this.targets.push(fridge);

    // Запах от испорченного: зелёные облачка над холодильником
    const stinkMat = new THREE.MeshStandardMaterial({ color: '#8fd16a', transparent: true, opacity: 0.6 });
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), stinkMat.clone());
      puff.userData.phase = i / 5;
      this.stink.add(puff);
    }
    const fly = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#222222'));
    fly.name = 'fly';
    this.stink.add(fly);
    this.stink.position.set(-1.55, 2.25, -1.4);
    this.stink.visible = false;
    this.scene.add(this.stink);

    // ----- Полка с книгами рецептов -----
    const shelf = new THREE.Group();
    const wood = mat('#b07a4a', { roughness: 0.8 });
    const board = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.08, 0.35, 2, 0.02), wood);
    board.castShadow = true;
    shelf.add(board);
    const colors = ['#e2483d', '#3f8efc', '#ffc83d', '#52b36b', '#a86bff'];
    let bx = -0.62;
    colors.forEach((c, i) => {
      const h = 0.38 + ((i * 7) % 3) * 0.06;
      const w = 0.12 + (i % 2) * 0.04;
      const book = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.26, 2, 0.015), mat(c, { roughness: 0.55 }));
      book.position.set(bx + w / 2, 0.04 + h / 2, 0);
      book.rotation.z = i === 4 ? -0.25 : 0;
      book.castShadow = true;
      shelf.add(book);
      bx += w + 0.015;
    });
    // Горшок с цветком
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.2, 20), mat('#d8744a'));
    pot.position.set(0.5, 0.14, 0);
    shelf.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), mat('#52b36b', { roughness: 0.5 }));
      leaf.scale.set(0.6, 1.6, 0.3);
      leaf.position.set(0.5 + Math.sin(i * 1.3) * 0.08, 0.36, Math.cos(i * 1.3) * 0.05);
      leaf.rotation.z = Math.sin(i * 1.3) * 0.5;
      shelf.add(leaf);
    }
    shelf.position.set(1.4, 2.2, -2.8);
    this.room.add(tag(shelf, 'recipes'));
    this.targets.push(shelf);

    // ----- Календарь-дневник -----
    this.calendarMat = mat('#ffffff', { map: calendarTexture(0), roughness: 0.8 });
    const cal = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.62, 0.04, 2, 0.03), this.calendarMat);
    cal.position.set(1.85, 1.3, -2.95);
    cal.castShadow = true;
    this.room.add(tag(cal, 'eaten'));
    this.targets.push(cal);

    // ----- Часы на стене — настройки -----
    const clock = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 40), mat('#e2483d', { roughness: 0.4 }));
    rim.rotation.x = Math.PI / 2;
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), mat('#fffaf0', { roughness: 0.6 }));
    dial.position.z = 0.045;
    clock.add(rim, dial);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, i % 3 ? 0.04 : 0.07, 0.01), mat('#2a211a'));
      tick.position.set(Math.sin(a) * 0.25, Math.cos(a) * 0.25, 0.05);
      tick.rotation.z = -a;
      clock.add(tick);
    }
    const hand = (len: number, w: number, name: string) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.012), mat('#2a211a'));
      m.position.y = len / 2;
      pivot.add(m);
      pivot.position.z = 0.06;
      pivot.name = name;
      clock.add(pivot);
    };
    hand(0.15, 0.03, 'hour');
    hand(0.23, 0.02, 'minute');
    clock.position.set(-1.45, 3.35, -2.94);
    this.clock3d = clock;
    this.room.add(tag(clock, 'settings'));
    this.targets.push(clock);

    // ----- Корзина из магазина -----
    const basket = new THREE.Group();
    const bt = basketTexture();
    bt.repeat.set(3, 1);
    const weave = mat('#ffffff', { map: bt, roughness: 0.9, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.42, 28, 1, true), weave);
    wall.position.y = 0.21;
    wall.castShadow = true;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.36, 28), weave);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.01;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 32, Math.PI), mat('#8f5c2c'));
    handle.position.y = 0.42;
    const baguette = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.6, 6, 12), mat('#e0a55e', { roughness: 0.7 }));
    baguette.position.set(-0.1, 0.55, 0);
    baguette.rotation.z = 0.5;
    const carrot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 12), mat('#ff8a2a'));
    carrot.position.set(0.18, 0.5, 0.05);
    carrot.rotation.z = Math.PI + 0.3;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 8), mat('#52b36b'));
    leaves.position.set(0.23, 0.72, 0.05);
    leaves.rotation.z = -0.3;
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), mat('#e2483d', { roughness: 0.3 }));
    apple.position.set(0.05, 0.43, 0.2);
    basket.add(wall, bottom, handle, baguette, carrot, leaves, apple);
    basket.position.set(1.55, 0, 1.0);
    basket.rotation.y = -0.4;
    this.room.add(tag(basket, 'buy'));
    this.targets.push(basket);

    // ----- Миска -----
    const bowl = new THREE.Group();
    const profile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.22, 0.0),
      new THREE.Vector2(0.3, 0.06),
      new THREE.Vector2(0.34, 0.16),
      new THREE.Vector2(0.3, 0.17),
      new THREE.Vector2(0.26, 0.08),
      new THREE.Vector2(0.0, 0.07),
    ];
    const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), new THREE.MeshPhysicalMaterial({ color: '#3f8efc', roughness: 0.25, clearcoat: 1 }));
    cup.castShadow = true;
    bowl.add(cup);
    const kibble = mat('#c9803f', { roughness: 0.7 });
    for (let i = 0; i < 14; i++) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), kibble);
      const a = i * 2.4;
      const r = 0.05 + (i % 4) * 0.045;
      k.position.set(Math.cos(a) * r, 0.12 + (i % 3) * 0.03, Math.sin(a) * r);
      this.food.add(k);
    }
    this.food.visible = false;
    bowl.add(this.food);
    bowl.position.set(-0.85, 0, 1.45);
    this.room.add(tag(bowl, 'feed'));
    this.targets.push(bowl);
  }

  /**
   * Кухня из Blender: свет и тени запечены в текстуры, поэтому материалы простые (без расчёта света).
   * Стены и пол — обои/доски из приложения поверх запечённой карты света (вторая развёртка).
   */
  private useRoomModel(model: THREE.Object3D) {
    const lightTex = { value: null as THREE.Texture | null };
    const wallMat = new THREE.MeshBasicMaterial({ map: wallTexture(this.state.wall || 'base') });
    const floorTex = floorTexture();
    const floorMat = new THREE.MeshBasicMaterial({ map: floorTex });
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      if (m.name === 'WindowGlass' || o.parent?.name === 'WindowGlass') {
        // В модели развёртка стекла перевёрнута — иначе облака и луна вверх ногами
        const uv = m.geometry.getAttribute('uv');
        if (uv) {
          for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
          uv.needsUpdate = true;
        }
        m.material = this.skyMat;
        return;
      }
      if (m.name.startsWith('Walls') || m.name.startsWith('Floor') || o.parent?.name === 'Walls' || o.parent?.name === 'Floor') {
        lightTex.value = src.map;
        m.material = m.name.startsWith('Floor') || o.parent?.name === 'Floor' ? floorMat : wallMat;
        return;
      }
      const basic = new THREE.MeshBasicMaterial({ map: src.map });
      this.baked.push(basic);
      m.material = basic;
    });
    for (const [mat, tex] of [
      [wallMat, wallMat.map],
      [floorMat, floorTex],
    ] as const) {
      if (!lightTex.value) continue;
      tex!.wrapS = tex!.wrapT = THREE.RepeatWrapping;
      tex!.repeat.set(1, 1);
      mat.lightMap = lightTex.value;
      mat.lightMap.channel = 1;
      // Свет стен запекали на 45% — возвращаем и делим на π (так считает three)
      mat.lightMapIntensity = Math.PI / 0.45;
      this.baked.push(mat);
    }
    this.wallMats = [wallMat];

    const node = (n: string) => model.getObjectByName(n);
    const targets: [string, Target][] = [
      ['Fridge', 'fridge'],
      ['FridgeDoorTop', 'fridge'],
      ['FridgeDoorMain', 'fridge'],
      ['Shelf', 'recipes'],
      ['Calendar', 'eaten'],
      ['Clock', 'settings'],
      ['Basket', 'buy'],
      ['Bowl', 'feed'],
    ];
    this.targets = [];
    for (const [n, t] of targets) {
      const o = node(n);
      if (!o) continue;
      tag(o, t);
      this.targets.push(o);
    }
    // Корзину чуть ближе к центру — иначе её обрезает край узкого экрана
    const basketNode = node('Basket');
    if (basketNode) basketNode.position.x -= 0.2;
    this.fridgeDoors = [node('FridgeDoorTop'), node('FridgeDoorMain')].filter((x): x is THREE.Object3D => !!x);
    // Внутренняя сторона дверец — светлая, с полочками (при запекании там была тень)
    this.fridgeDoors.forEach((door, i) => {
      const h = i === 0 ? 0.62 : 1.36;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, h), new THREE.MeshBasicMaterial({ map: doorInsideTexture(i === 1) }));
      inner.position.set(0.48, 0, -0.045);
      inner.rotation.y = Math.PI;
      door.add(inner);
    });

    // Корм в миске
    const bowl = node('Bowl');
    if (bowl) {
      this.food.removeFromParent();
      this.food.position.set(-0.8, 0.02, 1.4);
      this.scene.add(this.food);
    }
    // Число в календаре
    const today = new Date();
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: dateTexture(this.state.day ?? today.getDate(), this.state.month ?? today.getMonth()), transparent: true }));
    num.position.set(1.5, 1.75, -2.925);
    this.calendarNum = num;
    model.add(num);
    // Стрелки часов
    const hands = new THREE.Group();
    const handMat = new THREE.MeshBasicMaterial({ color: '#2a211a' });
    for (const [len, w, name] of [
      [0.15, 0.03, 'hour'],
      [0.23, 0.02, 'minute'],
    ] as const) {
      const pivot = new THREE.Group();
      const hm = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01), handMat);
      hm.position.y = len / 2;
      pivot.add(hm);
      pivot.name = name;
      hands.add(pivot);
    }
    hands.position.set(1.3, 4.85, -2.86);
    this.clock3d = hands;
    model.add(hands);
    // Нутро холодильника за дверцами — светлое, с полками (при запекании там была темнота)
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.05), new THREE.MeshBasicMaterial({ map: fridgeInsideTexture() }));
    inside.position.set(-1.35, 1.12, -1.245);
    model.add(inside);

    // Окно запечённой кухни больше и выше
    for (const m of [this.precip, this.flash, this.cloudLayer]) {
      m.scale.set(1.6 / 1.5, 1.3 / 1.1, 1);
      m.position.set(0, 3.45, m === this.flash ? -2.935 : m === this.cloudLayer ? -2.945 : -2.94);
    }
    // Запах — над новым холодильником
    this.stink.position.set(-1.35, 2.45, -1.6);

    this.room.visible = false;
    this.scene.add(model);
    // Ночь — применить сразу
    const night = this.state.night;
    this.state = { ...this.state, night: undefined };
    if (night !== undefined) this.setState({ ...(this.state as SceneState), night });
  }

  /** Плитка с кипящей кастрюлей перед Герой-поваром. */
  private buildPot() {
    const g = new THREE.Group();
    const stove = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.5, 0.7, 3, 0.06), mat('#f2f4f6', { roughness: 0.4 }));
    stove.position.y = 0.25;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 32), mat('#2a2a2e', { roughness: 0.6 }));
    plate.position.y = 0.515;
    // огонёк под кастрюлей
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 32), new THREE.MeshBasicMaterial({ color: '#ff6a2a' }));
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.535;
    const knob1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), mat('#e2483d'));
    knob1.rotation.x = Math.PI / 2;
    knob1.position.set(-0.22, 0.28, 0.36);
    const knob2 = knob1.clone();
    knob2.position.x = 0.22;
    // кастрюля
    const potMat = new THREE.MeshPhysicalMaterial({ color: '#e2483d', roughness: 0.3, clearcoat: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.34, 40, 1, true), potMat);
    (body.material as THREE.Material).side = THREE.DoubleSide;
    body.position.y = 0.7;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), potMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.535;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 10, 40), potMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.87;
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16, Math.PI), mat('#2a2a2e'));
      handle.position.set(side * 0.33, 0.82, 0);
      handle.rotation.z = side * -Math.PI / 2;
      g.add(handle);
    }
    // вода-суп
    const soup = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshPhysicalMaterial({ color: '#f2a65a', roughness: 0.15, clearcoat: 1 }));
    soup.rotation.x = -Math.PI / 2;
    soup.position.y = 0.83;
    // крышка лежит рядом, чуть приоткрыта — подпрыгивает от кипения
    const lid = new THREE.Group();
    const lidDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.02, 40), potMat);
    const lidKnob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), mat('#2a2a2e'));
    lidKnob.position.y = 0.03;
    lid.add(lidDisc, lidKnob);
    lid.position.set(0.12, 0.9, -0.05);
    lid.rotation.z = -0.35;
    g.add(stove, plate, glow, knob1, knob2, body, bottom, rim, soup, lid);
    // пузыри и пар
    const bubbleMat = new THREE.MeshPhysicalMaterial({ color: '#ffd9a8', roughness: 0.1, transmission: 0.2, clearcoat: 1 });
    const bubbles: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), bubbleMat);
      b.userData.phase = Math.random();
      b.userData.pos = [(Math.random() - 0.5) * 0.36, (Math.random() - 0.5) * 0.36];
      bubbles.push(b);
      g.add(b);
    }
    const steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
    const steam: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), steamMat.clone());
      p.userData.phase = i / 6;
      steam.push(p);
      g.add(p);
    }
    g.traverse((o) => (o.castShadow = true));
    g.position.set(0.48, 0, 1.3);
    g.rotation.y = -0.25;
    this.scene.add(g);
    this.pot = { bubbles, steam, lid };
  }

  // ---------- Состояние ----------

  setState(s: SceneState) {
    const prev = this.state;
    this.state = s;
    this.cat.setState({ face: s.face, mood: s.mood, talking: s.talking, eating: s.eating, reaction: s.reaction });
    if (s.outfit !== prev.outfit) this.cat.setOutfit(s.outfit);
    if (s.wall !== prev.wall) {
      for (const m of this.wallMats) {
        const rep = m.map?.repeat.clone();
        m.map?.dispose();
        m.map = wallTexture(s.wall || 'base');
        if (rep) m.map.repeat.copy(rep);
        m.needsUpdate = true;
      }
    }
    if (s.sky !== prev.sky || s.weather !== prev.weather || s.clouds !== prev.clouds) {
      this.skyMat.map?.dispose();
      this.skyMat.map = skyTexture(s.sky, s.weather, s.clouds, false);
      this.skyMat.needsUpdate = true;
      const cm = this.cloudLayer.material as THREE.MeshBasicMaterial;
      cm.map?.dispose();
      cm.map = cloudLayerTexture(s.sky, s.weather, s.clouds);
      cm.needsUpdate = true;
    }
    if (s.weather !== prev.weather) {
      const kind = s.weather === 'storm' ? 'rain' : s.weather;
      const pm = this.precip.material as THREE.MeshBasicMaterial;
      pm.map?.dispose();
      if (kind === 'rain' || kind === 'drizzle' || kind === 'snow') {
        pm.map = precipTexture(kind);
        pm.needsUpdate = true;
        this.precip.visible = true;
      } else {
        pm.map = null;
        this.precip.visible = false;
      }
    }
    if (s.night !== prev.night) {
      // Запечённая комната: ночью — тёплый полумрак
      for (const m of this.baked) m.color.set(s.night ? '#bdb8d2' : '#ffffff');
      // Ночью мягкий нейтральный свет лампы — шёрстка остаётся серой, а не бурой
      this.hemi.intensity = s.night ? 1.25 : 1.5;
      this.hemi.color.set(s.night ? '#f4f1ff' : '#fff8ee');
      this.sun.intensity = s.night ? 1.6 : 2.2;
      this.sun.color.set(s.night ? '#fff0de' : '#fff6ea');
      this.lamp.intensity = s.night ? 3 : 0;
    }
    if ((s.day !== prev.day || s.month !== prev.month) && this.calendarNum) {
      const m = this.calendarNum.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.map = dateTexture(s.day, s.month);
      m.needsUpdate = true;
    }
    if (s.day !== prev.day) {
      this.calendarMat.map?.dispose();
      this.calendarMat.map = calendarTexture(s.day);
      this.calendarMat.needsUpdate = true;
    }
    this.stink.visible = s.spoiling;
    if (s.eating && !prev.eating) this.food.visible = true;
  }

  /** Сердечки над котом, когда гладят. */
  hearts3(n = 3) {
    const tex = glyphTexture('❤', '#ff5a8a');
    const now = this.clock.getElapsedTime();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.userData = { born: now + i * 0.15, x: (Math.random() - 0.5) * 1.2 };
      s.scale.setScalar(0.01);
      this.hearts.add(s);
    }
  }

  /** Открыть дверцу холодильника, потом перейти. */
  openFridge(done: () => void) {
    this.fridgeOpenAt = this.clock.getElapsedTime();
    this.zoomTo('fridge', done);
  }

  /** Камера «подлетает» к предмету, потом переходим в раздел. При возвращении resize() вернёт камеру. */
  zoomTo(target: Target, done: () => void) {
    const focus: Record<Target, [number, number, number]> = {
      fridge: [-1.35, 1.3, -1.6],
      recipes: [1.35, 2.85, -2.8],
      eaten: [1.5, 1.75, -2.9],
      buy: [1.05, 0.45, 0.9],
      feed: [-0.8, 0.15, 1.4],
      settings: [1.3, 4.85, -2.9],
    };
    const [x, y, z] = focus[target];
    this.zoom = { from: this.camera.position.clone(), look: this.look.clone(), to: new THREE.Vector3(x, y, z), start: this.clock.getElapsedTime() };
    window.setTimeout(done, 420);
  }

  /** Экранные координаты якорей (px от левого верхнего угла контейнера). */
  project(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const [k, v] of Object.entries(ANCHORS)) {
      const p = v.clone().project(this.camera);
      out[k] = { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
    }
    return out;
  }

  // ---------- Цикл ----------

  private start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.start();
    else this.stop();
  };

  private tick() {
    // Кухня спрятана (открыт другой раздел) — не рисуем, бережём батарею
    if (!this.container.clientWidth) return;
    const t = this.clock.getElapsedTime();
    this.cat.update(t);

    // Дверцы холодильника
    const since = t - this.fridgeOpenAt;
    const open = this.fridgeOpenAt >= 0 && since < 1.4 ? Math.sin(Math.min(1, since / 0.4) * (Math.PI / 2)) * (since > 1 ? Math.max(0, 1 - (since - 1) / 0.4) : 1) : 0;
    this.fridgeDoors.forEach((d, i) => (d.rotation.y = -open * (i === 0 ? 1.2 : 1.6)));

    // Запах и муха
    if (this.stink.visible) {
      this.stink.children.forEach((p) => {
        if (p.name === 'fly') {
          p.position.set(Math.cos(t * 5) * 0.4, 0.2 + Math.sin(t * 9) * 0.1, Math.sin(t * 5) * 0.3);
          return;
        }
        const ph = (t * 0.4 + p.userData.phase) % 1;
        p.position.set(Math.sin(ph * 9 + p.userData.phase * 6) * 0.2, ph * 0.7, 0);
        p.scale.setScalar(0.5 + ph);
        ((p as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - ph);
      });
    }

    // Корм в миске исчезает, пока кот ест
    if (this.food.visible) {
      const s = this.state.eating ? Math.max(0.05, this.food.scale.x - 0.004) : 0;
      this.food.scale.setScalar(s);
      if (!s) {
        this.food.visible = false;
        this.food.scale.setScalar(1);
      }
    }

    // Сердечки
    for (const s of [...this.hearts.children]) {
      const age = t - s.userData.born;
      if (age < 0) continue;
      if (age > 1.6) {
        this.hearts.remove(s);
        (s as THREE.Sprite).material.dispose();
        continue;
      }
      s.position.set(s.userData.x, 1.6 + age * 1.1, 0.8);
      s.scale.setScalar(0.25 + age * 0.15);
      (s as THREE.Sprite).material.opacity = 1 - age / 1.6;
    }

    // Кипящая кастрюля: пузыри, пар, крышка подпрыгивает
    if (this.pot) {
      for (const b of this.pot.bubbles) {
        const ph = (t * 1.4 + b.userData.phase) % 1;
        const [x, z] = b.userData.pos as [number, number];
        b.position.set(x, 0.835 + Math.sin(ph * Math.PI) * 0.03, z);
        b.scale.setScalar(ph < 0.85 ? 0.4 + ph : 0.01);
      }
      for (const p of this.pot.steam) {
        const ph = (t * 0.45 + p.userData.phase) % 1;
        p.position.set(Math.sin(ph * 6 + p.userData.phase * 9) * 0.08, 0.95 + ph * 0.9, Math.cos(ph * 5) * 0.05);
        p.scale.setScalar(0.6 + ph * 1.8);
        ((p as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - ph);
      }
      this.pot.lid.position.y = 0.9 + Math.max(0, Math.sin(t * 9)) * 0.02 * (Math.sin(t * 0.7) > 0 ? 1 : 0);
    }

    // Подлёт камеры к предмету
    if (this.zoom) {
      const p = Math.min(1, (t - this.zoom.start) / 0.42);
      const e = p * p * (3 - 2 * p);
      const toward = this.zoom.to.clone();
      this.camera.position.lerpVectors(this.zoom.from, this.zoom.from.clone().lerp(toward, 0.55), e);
      this.camera.lookAt(this.zoom.look.clone().lerp(toward, e));
      if (p >= 1 && !this.container.clientWidth) this.zoom = null;
    }

    // Облака плывут за окном
    const cmap = (this.cloudLayer.material as THREE.MeshBasicMaterial).map;
    if (cmap) cmap.offset.x = (t * 0.008) % 1;

    // Дождь и снег за окном, молнии в грозу
    if (this.precip.visible) {
      const map = (this.precip.material as THREE.MeshBasicMaterial).map;
      if (map) {
        const snow = this.state.weather === 'snow';
        map.offset.y = (t * (snow ? 0.12 : 1.4)) % 1;
        map.offset.x = snow ? Math.sin(t * 0.7) * 0.05 : (t * 0.25) % 1;
      }
    }
    const fm = this.flash.material as THREE.MeshBasicMaterial;
    if (this.state.weather === 'storm') {
      if (t > this.nextFlash) {
        this.lastFlash = t;
        this.nextFlash = t + 4 + Math.random() * 6;
      }
      // Двойная вспышка молнии
      const f = t - this.lastFlash;
      fm.opacity = f < 0.12 ? 0.9 * (1 - f / 0.12) : f > 0.22 && f < 0.3 ? 0.5 : 0;
    } else fm.opacity = 0;

    if (this.clock3d) {
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      this.clock3d.getObjectByName('minute')!.rotation.z = -(m / 60) * Math.PI * 2;
      this.clock3d.getObjectByName('hour')!.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.zoom = null;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    if (this.mode === 'chef') {
      // Крупный план: Гера-повар
      const dist = 3.3;
      const halfW = 1.05;
      const hfov = 2 * Math.atan(halfW / dist);
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
      this.camera.position.set(0, 1.35, 0.55 + dist);
      this.look.set(0, 1.0, 0.5);
    } else if (aspect < 0.7) {
      // Весь экран телефона. Кадр чуть ближе и ниже: сверху картина, часы и окно,
      // без пустой стены; Гера в центре-внизу, под ним миска и коврик
      const dist = 5.6;
      const halfW = 1.45;
      const hfov = 2 * Math.atan(halfW / dist);
      const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
      this.camera.fov = THREE.MathUtils.radToDeg(vfov);
      this.camera.position.set(0, 1.6, dist);
      // Верх кадра — чуть выше картины на задней стене (y ≈ 6.1)
      const up = Math.atan((6.1 - 1.6) / (dist + 3)) - vfov / 2;
      this.look.set(0, 1.6 + Math.tan(up) * dist, 0);
    } else {
      this.camera.fov = 38;
      this.camera.position.set(0, 1.85, 6.4 * Math.max(1, 0.86 / aspect));
      this.look.set(0, 1.05, 0);
    }
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
    this.container.dispatchEvent(new CustomEvent('scene-resize'));
  }

  // ---------- Касания ----------

  private pick(e: PointerEvent): THREE.Intersection | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const hits = this.ray.intersectObjects([...this.cat.hitMeshes, ...this.targets], true);
    return hits[0] ?? null;
  }

  private isCat(o: THREE.Object3D): boolean {
    let x: THREE.Object3D | null = o;
    while (x) {
      if (x === this.cat.root) return true;
      x = x.parent;
    }
    return false;
  }

  private onDown = (e: PointerEvent) => {
    const hit = this.pick(e);
    this.drag = { x: e.clientX, y: e.clientY, dist: 0, stroked: false, onCat: !!hit && this.isCat(hit.object) };
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || !d.onCat) return;
    d.dist += Math.hypot(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.stroked && d.dist > 70) {
      d.stroked = true;
      this.cat.poke(0.35);
      this.handlers.onCatStroke();
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.stroked || d.dist > 12) return;
    const hit = this.pick(e);
    if (!hit) return;
    if (this.isCat(hit.object)) {
      this.cat.poke(1);
      this.handlers.onCatTap(this.cat.partAt(hit.point));
      return;
    }
    const target = hit.object.userData.target as Target | undefined;
    if (target) this.handlers.onTarget(target);
  };

  dispose() {
    this.stop();
    this.resizeObs.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => {
        (x as THREE.MeshStandardMaterial).map?.dispose();
        x.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
