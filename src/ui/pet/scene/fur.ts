// Пушистый ворс «слоями»: поверх меша несколько чуть раздутых копий, в каждой — только часть
// ворсинок (остальные пиксели выброшены). Вместе дают мягкий косматый край, как у плюша.

import * as THREE from 'three';

const LAYERS = 8;

let hairTex: THREE.DataTexture | null = null;

/** Карта ворсинок: случайная «высота» каждой ворсинки. */
function hairMap(): THREE.DataTexture {
  if (hairTex) return hairTex;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // Густой ворс: большинство ворсинок короткие, часть — длинные
    const v = Math.pow(Math.random(), 0.7) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  hairTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  hairTex.wrapS = hairTex.wrapT = THREE.RepeatWrapping;
  hairTex.magFilter = THREE.NearestFilter;
  hairTex.minFilter = THREE.NearestFilter;
  hairTex.needsUpdate = true;
  return hairTex;
}

/**
 * Добавить ворс к мешу (или ко всем мешам группы).
 * length — длина ворса в единицах кота; lengthAt — множитель по точке (короче у мордочки).
 */
export function addFur(obj: THREE.Object3D, length: number, lengthAt?: (p: THREE.Vector3) => number) {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.fur) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    if (!src?.map) continue;
    const geo = mesh.geometry;
    // Длина ворса по вершинам
    if (lengthAt && !geo.getAttribute('furLen')) {
      const pos = geo.getAttribute('position');
      const arr = new Float32Array(pos.count);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        arr[i] = lengthAt(v);
      }
      geo.setAttribute('furLen', new THREE.BufferAttribute(arr, 1));
    }
    const hasLen = !!geo.getAttribute('furLen');
    for (let i = 1; i <= LAYERS; i++) {
      const layer = i / LAYERS;
      const mat = new THREE.MeshStandardMaterial({ map: src.map, roughness: 1, color: src.color?.clone() ?? new THREE.Color('#ffffff') });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uOffset = { value: length * layer };
        shader.uniforms.uLayer = { value: layer };
        shader.uniforms.uHair = { value: hairMap() };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\nuniform float uOffset;\n${hasLen ? 'attribute float furLen;' : ''}`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(objectNormal) * uOffset${hasLen ? ' * furLen' : ''};`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uLayer;\nuniform sampler2D uHair;')
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float hair = texture2D(uHair, vMapUv * 48.0).r;
            if (hair < uLayer * 1.02) discard;
            // Ближе к коже — темнее: тень между ворсинками
            diffuseColor.rgb *= mix(0.9, 1.04, uLayer);`,
          );
      };
      mat.customProgramCacheKey = () => `fur-${hasLen}`;
      const shell = new THREE.Mesh(geo, mat);
      shell.userData.fur = true;
      shell.castShadow = false;
      shell.receiveShadow = false;
      shell.raycast = () => undefined;
      mesh.add(shell);
    }
  }
}
