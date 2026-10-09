// Загрузка ассетов и библиотека PBR-материалов.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const BASE = new URL('../assets/', import.meta.url).href;
const manager = new THREE.LoadingManager();
const gltf = new GLTFLoader(manager);
const draco = new DRACOLoader(manager);
draco.setDecoderPath(new URL('../../vendor/three-r170/addons/libs/draco/', import.meta.url).href);
gltf.setDRACOLoader(draco);
const texLoader = new THREE.TextureLoader(manager);
const rgbe = new RGBELoader(manager);

export const A = { models: {}, hdr: null, tex: {}, mats: {} };

export function loadAll(onProgress) {
  manager.onProgress = (url, loaded, total) => onProgress && onProgress(loaded / total, url);
  const models = ['ak47', 'soldier', 'fox', 'shotgun', 'muzzle_flash', 'grass', 'rock1', 'rock2', 'rock3'];
  const jobs = models.map((m) => gltf.loadAsync(BASE + 'models/' + m + '.glb').then((g) => { A.models[m] = g; }));
  jobs.push(rgbe.loadAsync(BASE + 'hdri/wasteland_clouds_puresky_2k.hdr').then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; A.hdr = t; }));
  return Promise.all(jobs);
}

const anisotropy = 8;
function tex(name, srgb) {
  const key = name + (srgb ? ':s' : '');
  if (!A.tex[key]) {
    const t = texLoader.load(BASE + 'tex/' + name);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    A.tex[key] = t;
  }
  return A.tex[key];
}
export { tex };

// Материал по набору фактур: name_col / name_nrm / name_rgh. UV геометрии — в метрах, scale — метров на тайл.
export function pbr(name, o = {}) {
  const key = name + JSON.stringify(o);
  if (A.mats[key]) return A.mats[key];
  const has = PBR_SETS[name] || { col: name + '_col.jpg' };
  const m = new THREE.MeshStandardMaterial({
    map: tex(has.col, true),
    normalMap: has.nrm ? tex(has.nrm) : null,
    roughnessMap: has.rgh ? tex(has.rgh) : null,
    bumpMap: has.bump ? tex(has.bump) : null,
    bumpScale: has.bump ? 2 : 1,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    color: o.color ?? 0xffffff,
    side: o.side ?? THREE.FrontSide,
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1)
  });
  const s = 1 / (o.scale ?? has.scale ?? 2);
  // общий масштаб тайлинга задаём через matrix всех карт (UV в метрах)
  ['map', 'normalMap', 'roughnessMap', 'bumpMap'].forEach((k) => {
    if (!m[k]) return;
    const t = m[k].clone(); t.needsUpdate = true; t.repeat.set(s, s); m[k] = t;
  });
  A.mats[key] = m;
  return m;
}

const PBR_SETS = {
  concrete: { col: 'concrete_col.jpg', nrm: 'concrete_nrm.jpg', rgh: 'concrete_rgh.jpg', scale: 3 },
  fence: { col: 'fence_col.jpg', nrm: 'fence_nrm.jpg', rgh: 'fence_rgh.jpg', scale: 3 },
  rust: { col: 'rust_col.jpg', nrm: 'rust_nrm.jpg', rgh: 'rust_rgh.jpg', scale: 2 },
  army: { col: 'army_col.jpg', nrm: 'army_nrm.jpg', rgh: 'army_rgh.jpg', scale: 2.5 },
  bluepaint: { col: 'bluepaint_col.jpg', nrm: 'bluepaint_nrm.jpg', rgh: 'bluepaint_rgh.jpg', scale: 2.5 },
  asphalt: { col: 'asphalt_col.jpg', nrm: 'asphalt_nrm.jpg', rgh: 'asphalt_rgh.jpg', scale: 7 },
  corrugated: { col: 'corrugated_col.jpg', nrm: 'corrugated_nrm.jpg', rgh: 'corrugated_rgh.jpg', scale: 2.5 },
  slate: { col: 'slate_col.jpg', nrm: 'slate_nrm.jpg', rgh: 'slate_rgh.jpg', scale: 2.4 },
  planks: { col: 'planks_col.jpg', nrm: 'planks_nrm.jpg', rgh: 'planks_rgh.jpg', scale: 1.6 },
  plaster: { col: 'plaster_col.jpg', nrm: 'plaster_nrm.jpg', rgh: 'plaster_rgh.jpg', scale: 3 },
  burlap: { col: 'burlap_col.jpg', nrm: 'burlap_nrm.jpg', rgh: 'burlap_rgh.jpg', scale: 1 },
  brick: { col: 'brick_col.jpg', bump: 'brick_bump.jpg', rgh: 'brick_rgh.jpg', scale: 2.2 },
  stucco: { col: 'stucco_col.jpg', nrm: 'stucco_nrm.jpg', scale: 3 },
  stonebrick: { col: 'stonebrick_col.jpg', scale: 3 },
  rooftiles: { col: 'rooftiles_col.jpg', scale: 3 },
  gravel: { col: 'gravel_col.jpg', scale: 3 },
  dirt: { col: 'dirt_color.jpg', nrm: 'dirt_normal.jpg', scale: 3 }
};

// Коробка, у которой UV каждой грани в метрах (фактура не растягивается).
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const sx = nx > 0.5 ? d : w, sy = ny > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  }
  return g;
}

// Геометрия цилиндра с UV в метрах
export function cylGeo(rt, rb, h, seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv, c = 2 * Math.PI * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * c, uv.getY(i) * h);
  return g;
}
