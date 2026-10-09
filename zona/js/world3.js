// Зона: построение карты на PBR-материалах (three r170).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Tree } from '../../vendor/ez-tree/index.js';
import { A, pbr, boxGeo, cylGeo, tex } from './assets.js';

const Z = window.Z, L = Z.LAYOUT, POI = Z.POI;
const HALF = L.HALF;
const UP = new THREE.Vector3(0, 1, 0);

// ---------- статический батчинг: всё неподвижное сливаем в один меш на материал
class Batch {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    ['position', 'normal', 'uv'].forEach((k) => { if (!g.attributes[k]) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * (k === 'uv' ? 2 : 3)), k === 'uv' ? 2 : 3)); });
    Object.keys(g.attributes).forEach((k) => { if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  finish(root, solids, shadow = true) {
    this.groups.forEach((list, mat) => {
      for (let i = 0; i < list.length; i += 400) {
        const m = new THREE.Mesh(mergeGeometries(list.slice(i, i + 400)), mat);
        m.castShadow = shadow && !mat.transparent; m.receiveShadow = true;
        root.add(m); if (solids && !mat.transparent) solids.push(m);
      }
    });
    this.groups.clear();
  }
}

export async function buildWorld(scene, renderer, opts = {}) {
  const quality = opts.quality || 'high';
  const W = {
    colliders: [], solids: [], anomalies: [], artifacts: [], radZones: [], boxes: [], lights: [],
    bandits: [], dogs: [], stalkers: [], fires: [], trader: null, markers: [], updaters: []
  };
  const root = new THREE.Group(); scene.add(root); W.root = root;
  const rng = Z.rng(1337);
  const batch = new Batch();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();

  // ---------- материалы
  const M = {
    concrete: pbr('concrete'), fence: pbr('fence', { scale: 3 }), brick: pbr('brick'), plaster: pbr('plaster'),
    plasterBlue: pbr('plaster', { color: 0xbcd0d8 }), planks: pbr('planks'), planksDark: pbr('planks', { color: 0x8a7f70 }),
    slate: pbr('slate', { side: THREE.DoubleSide }), rust: pbr('rust', { metalness: 0.35, roughness: 1 }),
    corrugated: pbr('corrugated', { metalness: 0.5, side: THREE.DoubleSide }), army: pbr('army', { metalness: 0.4 }),
    blue: pbr('bluepaint', { metalness: 0.4 }), burlap: pbr('burlap'), asphalt: pbr('asphalt'), stucco: pbr('stucco'),
    crate: pbr('planks', { color: 0xa0a878, scale: 1 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.55, metalness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x5a6a62, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 1.2 }),
    dirtyGlass: new THREE.MeshPhysicalMaterial({ color: 0x6a6a58, roughness: 0.6, transparent: true, opacity: 0.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc070, emissiveIntensity: 4 }),
    wire: new THREE.LineBasicMaterial({ color: 0x1a1a1a })
  };
  W.M = M;

  function addCollider(x0, x1, y0, y1, z0, z1) { W.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1) }); }
  // Коробка: позиция — центр основания; r = {x,y,z} повороты; collide=false — без коллайдера
  function box(w, h, d, mat, x, y, z, ry = 0, collide = true, r) {
    e.set(r ? r.x || 0 : 0, ry, r ? r.z || 0 : 0); q.setFromEuler(e);
    m4.compose(v.set(x, y + h / 2, z), q, s3.set(1, 1, 1));
    batch.add(boxGeo(w, h, d), mat, m4);
    if (collide) {
      const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
      const hw = (w * c + d * sn) / 2, hd = (w * sn + d * c) / 2;
      addCollider(x - hw, x + hw, y, y + h, z - hd, z + hd);
    }
  }
  function cyl(rt, rb, h, mat, x, y, z, rx = 0, rz = 0, seg = 16, ry = 0) {
    e.set(rx, ry, rz); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, s3.set(1, 1, 1));
    batch.add(cylGeo(rt, rb, h, seg), mat, m4);
  }
  function addGeo(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) {
    e.set(rx, ry, rz); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, s3.set(sc, sc, sc));
    batch.add(geo, mat, m4);
  }

  // =====================================================================
  // РЕЛЬЕФ: смешивание травы/грунта/гравия/грязи по маске в вершинах
  const SEG = quality === 'low' ? 160 : 220;
  const tg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, splat = new Float32Array(pos.count * 4), uvs = tg.attributes.uv;
  const railZ = POI.rail.z;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = Z.heightAt(x, z);
    pos.setY(i, h); uvs.setXY(i, x / 3, z / 3);
    let grass = 1, dirt = 0, grav = 0, mud = 0;
    const n = Z.fbm(x * 0.02 + 3, z * 0.02, 3), n2 = Z.fbm(x * 0.08, z * 0.08, 2);
    dirt += Z.smoothstep(0.58, 0.7, n) * 0.8 + Z.smoothstep(0.62, 0.75, n2) * 0.3;
    const tr = Math.min(L.polyDist(x, z, L.TRACK).d, L.polyDist(x, z, L.TRACK2).d);
    dirt += 1 - Z.smoothstep(1.2, 3.4, tr);
    const rd = L.polyDist(x, z, L.ROAD).d;
    grav += (1 - Z.smoothstep(3.6, 5.0, rd)) * 0.8;
    if (Math.abs(z - railZ) < 4) grav += 1 - Z.smoothstep(2.2, 4, Math.abs(z - railZ));
    const pd = Math.hypot(x - POI.pond.x, z - POI.pond.z);
    mud += 1 - Z.smoothstep(L.POND_R - 4, L.POND_R + 5, pd);
    [[POI.village, 30, 0.45], [POI.depot, 30, 0.8], [POI.cars, 20, 0.8], [POI.check, 16, 0.6], [POI.bunker, 12, 0.7]].forEach(([p, r, k]) => {
      dirt += (1 - Z.smoothstep(r * 0.5, r, Math.hypot(x - p.x, z - p.z))) * k * (0.6 + n2 * 0.6);
    });
    if (Math.abs(x - POI.depot.x) < 25 && Math.abs(z - POI.depot.z) < 22) grav += 0.6;
    // склоны — голый грунт
    const slope = Math.abs(Z.heightAt(x + 1, z) - h) + Math.abs(Z.heightAt(x, z + 1) - h);
    dirt += Z.smoothstep(0.5, 1.1, slope);
    const sum = grass + dirt + grav + mud;
    splat[i * 4] = grass / sum; splat[i * 4 + 1] = dirt / sum; splat[i * 4 + 2] = grav / sum; splat[i * 4 + 3] = mud / sum;
  }
  tg.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  tg.computeVertexNormals();
  const tMat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, normalMap: tex('dirt_normal.jpg'), normalScale: new THREE.Vector2(0.7, 0.7) });
  const tUni = {
    tGrass: { value: tex('grass.jpg', true) }, tGrass2: { value: tex('grass2_col.jpg', true) },
    tDirt: { value: tex('dirt_color.jpg', true) }, tGravel: { value: tex('gravel_col.jpg', true) },
    tMud: { value: tex('dirtpatch_col.jpg', true) }, tRoad: { value: tex('dirtroad_col.jpg', true) }
  };
  tMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, tUni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWp = (modelMatrix * vec4(position,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tGrass, tGrass2, tDirt, tGravel, tMud, tRoad;
      varying vec4 vSplat; varying vec2 vWp;
      vec3 tri(sampler2D t, vec2 p) { return texture2D(t, p).rgb; }`)
      .replace('#include <map_fragment>', `
      vec3 g1 = tri(tGrass, vWp / 2.6), g2 = tri(tGrass2, vWp / 9.0);
      float macro = texture2D(tGrass2, vWp / 70.0).g;
      vec3 grass = mix(g1, g2, 0.45);
      // выгоревшая трава Зоны: желтоватая, приглушённая
      float l = dot(grass, vec3(0.3, 0.59, 0.11));
      grass = mix(vec3(l), grass, 0.55) * vec3(1.05, 1.0, 0.62) * (0.75 + macro * 0.6);
      vec3 dirt = mix(tri(tDirt, vWp / 3.2), tri(tRoad, vWp / 6.0), 0.35);
      vec3 grav = tri(tGravel, vWp / 3.0) * 0.8;
      vec3 mud = tri(tMud, vWp / 5.0) * vec3(0.55, 0.55, 0.45);
      vec4 w = vSplat;
      // неровная граница переходов по высотной маске фактур
      float hd = dot(tri(tDirt, vWp / 3.2), vec3(0.33));
      w.y = clamp(w.y + (hd - 0.45) * 0.8 * w.y * (1.0 - w.y) * 4.0, 0.0, 1.0);
      w /= max(0.001, w.x + w.y + w.z + w.w);
      diffuseColor.rgb *= grass * w.x + dirt * w.y + grav * w.z + mud * w.w;`);
  };
  const terrain = new THREE.Mesh(tg, tMat); terrain.receiveShadow = true;
  root.add(terrain); W.solids.push(terrain); W.terrain = terrain;

  // вода болота: тёмная, отражает небо, рябь — анимированная карта нормалей
  const wn = tex('waternormals.jpg'); wn.repeat.set(6, 6);
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x0e130b, roughness: 0.12, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.32, specularIntensity: 0.6 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(L.POND_R + 2, 64), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(POI.pond.x, Z.pondLevel, POI.pond.z); root.add(water);
  W.updaters.push((t) => { wn.offset.set(t * 0.01, t * 0.006); });

  // =====================================================================
  // ДОРОГА: асфальт с выбоинами по краям
  (function road() {
    const P = [], U = [], idx = [], pts = [];
    for (let s = 0; s < L.ROAD.length - 1; s++) {
      const [ax, az] = L.ROAD[s], [bx, bz] = L.ROAD[s + 1], Ls = Math.hypot(bx - ax, bz - az), n = Math.ceil(Ls / 1.5);
      for (let j = 0; j < n; j++) pts.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n]);
    }
    pts.push(L.ROAD[L.ROAD.length - 1]);
    let dist = 0;
    const WIDTH = 7, COLS = 6;
    pts.forEach((p, i) => {
      const q2 = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const dx = q2[0] - o[0], dz = q2[1] - o[1], Ll = Math.hypot(dx, dz) || 1, nx = -dz / Ll, nz = dx / Ll;
      if (i) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (let k = 0; k <= COLS; k++) {
        const t = k / COLS - 0.5;
        // рваный край: обочина неровная
        const jag = (k === 0 || k === COLS) ? (Z.fbm(dist * 0.4, k, 2) - 0.5) * 1.2 : 0;
        const off = t * WIDTH + Math.sign(t) * jag;
        const x = p[0] + nx * off, z = p[1] + nz * off;
        P.push(x, Z.heightAt(x, z) + 0.05 + (k === 0 || k === COLS ? -0.02 : 0.015), z);
        U.push(off + WIDTH / 2, dist);
      }
      if (i) for (let k = 0; k < COLS; k++) { const a = (i - 1) * (COLS + 1) + k, b = a + COLS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = pbr('asphalt', { scale: 7 }).clone(); mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m); W.solids.push(m);
  })();

  // =====================================================================
  // ПОСТРОЙКИ
  function wallX(x0, x1, z, y, h, t, mat, holes = []) {
    const cuts = [x0, ...holes.flatMap((o) => [o.a, o.b]), x1];
    for (let i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.01) box(cuts[i + 1] - cuts[i], h, t, mat, (cuts[i] + cuts[i + 1]) / 2, y, z);
    holes.forEach((o) => {
      if (o.y0 > 0) box(o.b - o.a, o.y0, t, mat, (o.a + o.b) / 2, y, z);
      if (o.y1 < h) box(o.b - o.a, h - o.y1, t, mat, (o.a + o.b) / 2, y + o.y1, z);
      frame(o, 'x', z, y, t);
    });
  }
  function wallZ(z0, z1, x, y, h, t, mat, holes = []) {
    const cuts = [z0, ...holes.flatMap((o) => [o.a, o.b]), z1];
    for (let i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.01) box(t, h, cuts[i + 1] - cuts[i], mat, x, y, (cuts[i] + cuts[i + 1]) / 2);
    holes.forEach((o) => {
      if (o.y0 > 0) box(t, o.y0, o.b - o.a, mat, x, y, (o.a + o.b) / 2);
      if (o.y1 < h) box(t, h - o.y1, o.b - o.a, mat, x, y + o.y1, (o.a + o.b) / 2);
      frame(o, 'z', x, y, t);
    });
  }
  // оконные рамы, иногда с остатками стекла, дверные коробки
  function frame(o, axis, c, y, t) {
    if (o.noFrame) return;
    const fw = 0.07, isDoor = o.y0 === 0, mat = o.frameMat || M.planksDark;
    const len = o.b - o.a, mid = (o.a + o.b) / 2, hgt = o.y1 - o.y0;
    const put = (w, h, along, yy) => axis === 'x' ? box(w, h, t + 0.06, mat, along, yy, c, 0, false) : box(t + 0.06, h, w, mat, c, yy, along, 0, false);
    put(fw, hgt, o.a + fw / 2, y + o.y0); put(fw, hgt, o.b - fw / 2, y + o.y0);
    put(len, fw, mid, y + o.y1 - fw);
    if (!isDoor) {
      put(len + 0.2, 0.06, mid, y + o.y0 - 0.06); // подоконник
      put(0.04, hgt, mid, y + o.y0); put(len, 0.04, mid, y + o.y0 + hgt * 0.62);
      if (o.glass !== false && rng() < 0.55) { // уцелевшее мутное стекло в одной створке
        const gm = rng() < 0.5 ? M.dirtyGlass : M.glass;
        axis === 'x' ? box(len / 2 - 0.04, hgt * 0.6, 0.01, gm, mid - len / 4, y + o.y0 + 0.03, c, 0, false) : box(0.01, hgt * 0.6, len / 2 - 0.04, gm, c, y + o.y0 + 0.03, mid - len / 4, 0, false);
      }
    }
  }
  // Двускатная крыша (конёк вдоль X) — выдавленный треугольник + шифер по скатам
  function gableRoof(cx, cz, w, d, y, rise, mat, gableMat) {
    const o = d / 2 + 0.45, Lr = w + 0.7;
    const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, rise - 0.08); sh.lineTo(-d / 2, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); geo.rotateY(-Math.PI / 2); geo.translate(w / 2, 0, 0);
    addGeo(geo, gableMat || M.planksDark, cx, y, cz);
    const slope = Math.hypot(o, rise), ang = Math.atan2(rise, o);
    for (const sd of [-1, 1]) {
      const g2 = boxGeo(Lr, 0.04, slope + 0.1);
      e.set(sd * ang, 0, 0); q.setFromEuler(e);
      m4.compose(v.set(cx, y + rise / 2 + 0.03, cz + sd * o / 2), q, s3.set(1, 1, 1));
      batch.add(g2, mat, m4);
    }
    cyl(0.07, 0.07, Lr, M.planksDark, cx, y + rise + 0.02, cz, 0, Math.PI / 2, 6);
  }

  function house(cx, cz, w, d, mat, door, seed) {
    const r = Z.rng(seed), y = Z.heightAt(cx, cz), H = 2.8, t = 0.25;
    box(w + 0.6, 1.0, d + 0.6, M.concrete, cx, y - 0.7, cz);
    box(w - 0.1, 0.06, d - 0.1, M.planks, cx, y + 0.3, cz, 0, false);
    const fy = y + 0.3, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const win = (a, b) => ({ a, b, y0: 0.9, y1: 2.05, frameMat: rng() < 0.5 ? M.blue : M.planksDark });
    const dr = (a) => ({ a: a - 0.5, b: a + 0.5, y0: 0, y1: 2.1 });
    let hN = [win(cx - w / 4 - 0.5, cx - w / 4 + 0.5), win(cx + w / 4 - 0.5, cx + w / 4 + 0.5)];
    let hS = hN.map((o) => ({ ...o })), hE = [win(cz - 0.5, cz + 0.5)], hW = [win(cz - 0.5, cz + 0.5)];
    if (door === 'n') hN = [dr(cx + 0.2), win(cx - w / 4 - 0.9, cx - w / 4 + 0.1)];
    if (door === 's') hS = [dr(cx + 0.2), win(cx + w / 4 - 0.1, cx + w / 4 + 0.9)];
    if (door === 'e') hE = [dr(cz)];
    if (door === 'w') hW = [dr(cz)];
    wallX(x0, x1, z0, fy, H, t, mat, hN); wallX(x0, x1, z1, fy, H, t, mat, hS);
    wallZ(z0 + t / 2, z1 - t / 2, x0, fy, H, t, mat, hW); wallZ(z0 + t / 2, z1 - t / 2, x1, fy, H, t, mat, hE);
    // углы-бревна / наличники
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([px, pz]) => box(0.32, H, 0.32, M.planksDark, px, fy, pz, 0, false));
    // приоткрытая дверь
    const dd = door === 'n' ? [cx + 0.2, z0, 0] : door === 's' ? [cx + 0.2, z1, 0] : door === 'e' ? [x1, cz, 1] : [x0, cz, 1];
    box(0.95, 2.0, 0.05, M.planks, dd[0] + (dd[2] ? 0.35 : -0.25), fy, dd[1] + (dd[2] ? -0.2 : 0.38), dd[2] ? Math.PI / 2 + 1.1 : 1.1, false);
    // крыльцо
    box(1.6, 0.18, 1.0, M.planksDark, dd[0] + (dd[2] ? (door === 'e' ? 0.7 : -0.7) : 0), y + 0.1, dd[1] + (dd[2] ? 0 : (door === 's' ? 0.7 : -0.7)));
    const broken = r() < 0.3;
    if (!broken) gableRoof(cx, cz, w, d, fy + H, 1.7, M.slate, mat === M.planks ? M.planksDark : M.planks);
    else { box(w * 0.6, 0.04, d * 0.7, M.slate, cx + 0.4, fy + H - 0.4, cz - 0.3, 0, false, { x: 0.25, z: 0.35 }); box(0.12, 0.12, d, M.planksDark, cx, fy + H + 0.6, cz, 0, false, { x: 0, z: 0.3 }); }
    box(0.55, 1.7, 0.55, M.brick, cx + w / 4, fy + H + 0.2, cz + d / 6, 0, false);
    // обстановка
    box(1.2, 1.6, 1.0, M.plaster, x0 + 0.9, fy, z0 + 0.8);
    box(1.2, 0.06, 0.7, M.planksDark, cx, fy + 0.72, cz, 0.2, false);
    for (const [ax, az] of [[-0.5, -0.25], [0.5, 0.25], [-0.5, 0.25], [0.5, -0.25]]) box(0.06, 0.72, 0.06, M.planksDark, cx + ax, fy, cz + az, 0, false);
    box(0.9, 0.42, 1.9, M.rust, x1 - 0.7, fy, z1 - 1.2);
    box(0.85, 0.12, 1.8, M.burlap, x1 - 0.7, fy + 0.42, z1 - 1.2, 0, false);
    if (r() < 0.6) box(0.9, 1.8, 0.45, M.planksDark, x1 - 0.6, fy, z0 + 0.4);
    if (r() < 0.6) box(0.5, 0.5, 0.5, M.crate, x0 + 0.6, fy, z1 - 0.6, r());
    // покосившийся штакетник
    const fr = 3.5, fx0 = x0 - fr, fx1 = x1 + fr, fz0 = z0 - fr, fz1 = z1 + fr;
    const picket = (ax, az, bx, bz) => {
      const Ll = Math.hypot(bx - ax, bz - az), n = Math.floor(Ll / 0.16), ang = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        if (r() < 0.22) continue;
        const px = ax + (bx - ax) * i / n, pz = az + (bz - az) * i / n, hh = 1.0 + r() * 0.35;
        box(0.09, hh, 0.025, M.planksDark, px, Z.heightAt(px, pz) - 0.05, pz, ang + Math.PI / 2, false, { x: (r() - .5) * 0.1, z: (r() - .5) * 0.25 });
      }
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      for (const hy of [0.35, 0.85]) box(Ll, 0.06, 0.05, M.planksDark, mx, Z.heightAt(mx, mz) + hy, mz, ang - Math.PI / 2, false);
    };
    picket(fx0, fz0, fx1, fz0); picket(fx1, fz0, fx1, fz1); picket(fx0, fz1, cx - 1.5, fz1); picket(cx + 1.5, fz1, fx1, fz1); picket(fx0, fz0, fx0, fz1);
  }

  // ---------- Бункер торговца
  (function () {
    const c = POI.bunker, y = Z.heightAt(c.x, c.z), w = 9, d = 8, H = 3, t = 0.5;
    const x0 = c.x - w / 2, x1 = c.x + w / 2, z0 = c.z - d / 2, z1 = c.z + d / 2;
    box(w + 1, 0.4, d + 1, M.concrete, c.x, y - 0.3, c.z);
    box(w - 0.4, 0.04, d - 0.4, M.planks, c.x, y + 0.1, c.z, 0, false);
    wallX(x0, x1, z0, y, H, t, M.concrete, [{ a: c.x - 0.8, b: c.x + 0.8, y0: 0, y1: 2.2, frameMat: M.rust }]);
    wallX(x0, x1, z1, y, H, t, M.concrete); wallZ(z0, z1, x0, y, H, t, M.concrete); wallZ(z0, z1, x1, y, H, t, M.concrete);
    box(w + 1.2, 0.5, d + 1.2, M.concrete, c.x, y + H, c.z);
    // земляная обваловка
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, 6.283, 0, 1.35), terrain.material);
    const mg = mound.geometry, sp = new Float32Array(mg.attributes.position.count * 4);
    for (let i = 0; i < sp.length; i += 4) { sp[i] = 0.5; sp[i + 1] = 0.5; }
    mg.setAttribute('splat', new THREE.BufferAttribute(sp, 4));
    mound.scale.set(w * 0.78, 1.8, d * 0.78); mound.position.set(c.x, y + H + 0.25, c.z + 0.5); mound.receiveShadow = true; root.add(mound);
    box(3.2, 0.18, 1.6, M.concrete, c.x, y + 2.5, z0 - 0.8, 0, false);
    // распахнутая железная дверь
    box(1.5, 2.15, 0.06, M.rust, c.x - 1.2, y, z0 - 0.55, 1.2, false);
    for (let i = 0; i < 9; i++) box(0.9, 0.34, 0.5, M.burlap, c.x - 2.7 + (i % 3) * 0.92 - (i > 5 ? 0.45 : i > 2 ? 0.2 : 0), y + Math.floor(i / 3) * 0.33, z0 - 2.4, 0.06 * i);
    // прилавок, полки, ящики
    box(4.5, 1.05, 0.7, M.planksDark, c.x, y, c.z + 1.4);
    box(4.6, 0.06, 0.9, M.planks, c.x, y + 1.05, c.z + 1.4, 0, false);
    box(3.5, 2.2, 0.45, M.planksDark, c.x, y, z1 - 0.6);
    for (let k = 0; k < 3; k++) box(3.4, 0.04, 0.5, M.planks, c.x, y + 0.6 + k * 0.6, z1 - 0.85, 0, false);
    for (let k = 0; k < 12; k++) box(0.2 + (k % 3) * 0.05, 0.25, 0.18, k % 2 ? M.army : M.blue, c.x - 1.5 + k * 0.27, y + 0.64 + Math.floor(k / 6) * 0.6, z1 - 0.85, 0, false);
    box(0.8, 0.6, 0.6, M.crate, x0 + 0.9, y, z1 - 1); box(0.7, 0.5, 0.6, M.crate, x0 + 0.9, y + 0.6, z1 - 1.1, 0.3);
    box(0.6, 0.9, 0.6, M.blue, x1 - 0.8, y, z0 + 1.0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.lamp); bulb.position.set(c.x, y + H - 0.28, c.z); root.add(bulb);
    const lamp = new THREE.PointLight(0xffc27a, 6, 14, 2); lamp.position.set(c.x, y + H - 0.45, c.z); lamp.castShadow = quality === 'high'; lamp.shadow.mapSize.set(512, 512); root.add(lamp);
    W.lights.push({ light: lamp, base: 6, flicker: 0.15 });
    W.trader = { x: c.x, z: c.z + 2.4, y, face: Math.PI };
    W.spawn = { x: c.x - 0.6, z: c.z - 0.4, yaw: Math.PI };
    W.markers.push({ x: c.x, z: c.z, label: 'Торговец', kind: 'trader' });
  })();

  // ---------- Деревня
  (function () {
    const vv = POI.village;
    house(vv.x - 18, vv.z - 14, 7, 6, M.plaster, 's', 3);
    house(vv.x + 4, vv.z - 18, 8, 6, M.planks, 's', 4);
    house(vv.x + 20, vv.z + 2, 6, 7, M.planks, 'w', 5);
    house(vv.x - 20, vv.z + 12, 7, 6, M.plasterBlue, 'e', 6);
    house(vv.x + 2, vv.z + 20, 7, 6, M.planks, 'n', 7);
    // колодец-журавль
    const y = Z.heightAt(vv.x - 6, vv.z + 3);
    cyl(0.75, 0.75, 0.9, M.concrete, vv.x - 6, y + 0.45, vv.z + 3, 0, 0, 20);
    box(0.16, 3.4, 0.16, M.planksDark, vv.x - 7.2, y, vv.z + 3, 0, false);
    box(4.6, 0.1, 0.1, M.planksDark, vv.x - 7.2, y + 3.2, vv.z + 3, 0, false, { z: 0.5 });
    // костёр
    const fx = vv.x + 3, fz = vv.z + 2, fy = Z.heightAt(fx, fz);
    for (let i = 0; i < 6; i++) cyl(0.06, 0.08, 1.0, M.planksDark, fx + Math.cos(i * 1.05) * 0.22, fy + 0.15, fz + Math.sin(i * 1.05) * 0.22, Math.PI / 2 - 0.35, 0, 7, -i * 1.05 + Math.PI / 2);
    for (let j = 0; j < 9; j++) addGeo(A.models.rock1.scene.children[0].geometry, A.models.rock1.scene.children[0].material, fx + Math.cos(j * 0.7) * 0.75, fy, fz + Math.sin(j * 0.7) * 0.75, 0, j, 0, 0.12);
    W.fires.push({ x: fx, y: fy, z: fz });
    [[0, 'Сталкер Вова'], [2.2, 'Сталкер Жека'], [4.2, 'Сталкер Лис']].forEach(([a, name]) => {
      const bx = fx + Math.cos(a) * 2.2, bz = fz + Math.sin(a) * 2.2;
      cyl(0.2, 0.22, 1.8, M.planksDark, bx, Z.heightAt(bx, bz) + 0.2, bz, Math.PI / 2, 0, 10, a + Math.PI / 2);
      W.stalkers.push({ x: bx, z: bz, face: Math.atan2(fx - bx, fz - bz), sit: true, name });
    });
    W.stalkers.push({ x: vv.x - 2, z: vv.z - 8, face: 0.5, sit: false, name: 'Часовой Петрович' });
    vehicle(vv.x + 14, vv.z - 4, 0.2, 'tractor', M.blue);
    W.markers.push({ x: vv.x, z: vv.z, label: 'Деревня', kind: 'camp' });
  })();

  // ---------- Техника: силуэты выдавливаются из профиля (без «кубиков»)
  function profileGeo(points, width, bevel = 0.04) {
    const sh = new THREE.Shape(); sh.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(Math.PI / 2); // профиль по Z (длина), ширина по X
    return g;
  }
  function wheel(gx, gy, gz, r, wdt, ry, local) {
    const p = new THREE.Vector3(local[0], local[1], local[2]).applyAxisAngle(UP, ry).add(new THREE.Vector3(gx, gy, gz));
    cyl(r, r, wdt, M.tire, p.x, p.y, p.z, 0, Math.PI / 2, 18, ry);
    const p2 = new THREE.Vector3(local[0] + Math.sign(local[0]) * (wdt / 2 + 0.005), local[1], local[2]).applyAxisAngle(UP, ry).add(new THREE.Vector3(gx, gy, gz));
    cyl(r * 0.55, r * 0.55, 0.02, M.rust, p2.x, p2.y, p2.z, 0, Math.PI / 2, 14, ry);
  }
  function vehicle(x, z, ry, kind, mat) {
    const y = Z.heightAt(x, z);
    mat = mat || M.rust;
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(UP, ry).add(new THREE.Vector3(x, y, z));
    const put = (geo, m, lx, ly, lz, ex = 0, ez = 0) => { const p = at(lx, ly, lz); addGeo(geo, m, p.x, p.y, p.z, ex, ry, ez); };
    let dims;
    if (kind === 'car') { // «Жигули»: профиль кузова с крышей
      const prof = [[-2.05, 0.3], [2.05, 0.3], [2.1, 0.62], [1.95, 0.78], [0.95, 0.82], [0.55, 1.32], [-0.75, 1.36], [-1.2, 0.86], [-2.05, 0.82], [-2.1, 0.55]];
      put(profileGeo(prof, 1.6), mat, 0, 0.05, 0);
      const win = [[0.6, 0.9], [0.47, 1.26], [-0.7, 1.29], [-1.08, 0.9]];
      for (const sd of [-1, 1]) put(profileGeo(win, 0.04, 0.005), M.dirtyGlass, sd * 0.79, 0.05, 0);
      put(profileGeo([[0.9, 0.84], [0.55, 1.3], [0.5, 1.3], [0.85, 0.84]], 1.4, 0.01), M.glass, 0, 0.05, 0);
      [[-0.72, 1.3], [0.72, 1.3], [-0.72, -1.3]].forEach(([lx, lz]) => wheel(x, y, z, 0.31, 0.2, ry, [lx, 0.31, lz]));
      put(boxGeo(1.5, 0.12, 0.08), M.steel, 0, 0.42, 2.1);
      dims = [1.7, 4.2, 1.45];
    } else if (kind === 'truck') { // ЗИЛ-130
      const cab = [[-0.9, 0.9], [0.95, 0.9], [1.05, 1.5], [1.2, 1.55], [1.35, 1.55], [1.35, 2.5], [-0.75, 2.6], [-0.9, 2.4]];
      put(profileGeo(cab, 2.3), mat, 0, 0, -2.4);
      put(profileGeo([[0, 0.9], [1.6, 0.9], [1.6, 1.55], [0.1, 1.6]], 1.9, 0.08), mat, 0, 0, -1.05);
      for (const sd of [-1, 1]) put(boxGeo(0.02, 0.6, 1.0), M.dirtyGlass, sd * 1.15, 1.75, -2.55);
      put(boxGeo(2.0, 0.65, 0.02), M.glass, 0, 1.85, -1.08, -0.15);
      put(boxGeo(2.4, 0.18, 5.2), M.rust, 0, 0.9, 1.1);
      for (const sd of [-1, 1]) put(boxGeo(0.06, 0.9, 5.2), M.planksDark, sd * 1.17, 1.08, 1.1);
      put(boxGeo(2.4, 0.9, 0.06), M.planksDark, 0, 1.08, 3.67);
      [[-1.05, -2.0], [1.05, -2.0], [-1.05, 1.6], [1.05, 1.6], [-1.05, 2.8], [1.05, 2.8]].forEach(([lx, lz]) => wheel(x, y, z, 0.52, 0.32, ry, [lx, 0.52, lz]));
      dims = [2.5, 7.4, 2.7];
    } else if (kind === 'bus') { // ПАЗ
      const prof = [[-4.4, 0.45], [4.4, 0.45], [4.55, 1.2], [4.4, 2.75], [-4.3, 2.8], [-4.5, 1.2]];
      put(profileGeo(prof, 2.45, 0.12), mat, 0, 0, 0);
      for (const sd of [-1, 1]) for (let i = -3; i <= 3; i++) put(boxGeo(0.02, 0.75, 0.95), rng() < 0.4 ? M.dirtyGlass : M.glass, sd * 1.235, 1.75, i * 1.15);
      put(boxGeo(2.2, 0.9, 0.02), M.dirtyGlass, 0, 1.7, -4.52, 0.12);
      [[-1.05, -3.0], [1.05, -3.0], [-1.05, 3.0]].forEach(([lx, lz]) => wheel(x, y, z, 0.48, 0.3, ry, [lx, 0.48, lz]));
      dims = [2.6, 9, 2.9];
    } else if (kind === 'btr') { // БТР-70: скошенный нос, восемь колёс
      const hull = [[-3.6, 0.65], [3.3, 0.65], [3.75, 1.15], [3.2, 1.65], [2.2, 2.05], [-3.4, 2.05], [-3.75, 1.4]];
      put(profileGeo(hull, 2.8, 0.1), M.army, 0, 0, 0);
      put(cylGeo(0.62, 0.72, 0.55, 16), M.army, 0, 2.3, -0.3);
      put(cylGeo(0.05, 0.06, 2.2, 8), M.steel, 0, 2.45, -1.6, Math.PI / 2);
      for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) wheel(x, y, z, 0.6, 0.38, ry, [sd * 1.45, 0.6, -2.4 + k * 1.6 + (k > 1 ? 0.4 : 0)]);
      dims = [3, 7.6, 2.4];
    } else if (kind === 'tractor') { // «Беларусь»
      put(profileGeo([[-0.4, 0.7], [1.8, 0.7], [1.9, 1.3], [-0.4, 1.4]], 0.9, 0.05), mat, 0, 0, 0.6);
      put(profileGeo([[-1.3, 0.8], [-0.4, 0.8], [-0.4, 2.45], [-1.3, 2.45]], 1.4, 0.05), mat, 0, 0, 0);
      for (const sd of [-1, 1]) put(boxGeo(0.02, 0.8, 0.75), M.dirtyGlass, sd * 0.71, 1.5, -0.85);
      wheel(x, y, z, 0.78, 0.45, ry, [-0.95, 0.78, -0.85]); wheel(x, y, z, 0.78, 0.45, ry, [0.95, 0.78, -0.85]);
      wheel(x, y, z, 0.45, 0.25, ry, [-0.7, 0.45, 1.8]); wheel(x, y, z, 0.45, 0.25, ry, [0.7, 0.45, 1.8]);
      put(cylGeo(0.05, 0.05, 1.2, 8), M.steel, 0.3, 1.9, 1.4);
      dims = [2.0, 3.8, 2.5];
    }
    const c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry)), hw = (dims[0] * c + dims[1] * sn) / 2, hd = (dims[0] * sn + dims[1] * c) / 2;
    addCollider(x - hw, x + hw, y - 1, y + dims[2], z - hd, z + hd);
  }

  // ---------- АТП
  (function () {
    const c = POI.depot, y = Z.heightAt(c.x, c.z), w = 50, d = 44, x0 = c.x - w / 2, x1 = c.x + w / 2, z0 = c.z - d / 2, z1 = c.z + d / 2;
    const fenceH = 2.6;
    wallX(x0, x1, z0, y - 0.3, fenceH, 0.18, M.fence);
    wallX(x0, x1, z1, y - 0.3, fenceH, 0.18, M.fence, [{ a: c.x - 4, b: c.x + 4, y0: 0, y1: 9, noFrame: true }, { a: x1 - 9, b: x1 - 6, y0: 0, y1: 9, noFrame: true }]);
    wallZ(z0, z1, x0, y - 0.3, fenceH, 0.18, M.fence, [{ a: c.z + 4, b: c.z + 7, y0: 0, y1: 9, noFrame: true }]);
    wallZ(z0, z1, x1, y - 0.3, fenceH, 0.18, M.fence);
    for (let px = x0; px <= x1; px += 6) { box(0.25, fenceH + 0.3, 0.25, M.concrete, px, y - 0.3, z0, 0, false); }
    box(4, 2.3, 0.06, M.army, c.x - 5.6, y, z1 + 1.6, 1.1);
    box(4, 2.3, 0.06, M.army, c.x + 5.8, y, z1 + 1.2, -0.7);
    // контора
    const ox = c.x - 12, oz = c.z - 10, ow = 14, od = 8, H = 3.2, t = 0.3;
    box(ow + 0.4, 0.5, od + 0.4, M.concrete, ox, y - 0.3, oz);
    const win2 = (a) => ({ a, b: a + 1.4, y0: 1, y1: 2.3, frameMat: M.blue });
    wallX(ox - ow / 2, ox + ow / 2, oz - od / 2, y + 0.2, H, t, M.brick, [win2(ox - 4), win2(ox + 2.6)]);
    wallX(ox - ow / 2, ox + ow / 2, oz + od / 2, y + 0.2, H, t, M.brick, [{ a: ox - 0.6, b: ox + 0.6, y0: 0, y1: 2.2, frameMat: M.blue }, win2(ox - 5), win2(ox + 3.6)]);
    wallZ(oz - od / 2, oz + od / 2, ox - ow / 2, y + 0.2, H, t, M.brick, [win2(oz - 1)]);
    wallZ(oz - od / 2, oz + od / 2, ox + ow / 2, y + 0.2, H, t, M.brick);
    wallZ(oz - od / 2, oz + od / 2, ox + 1, y + 0.2, H, 0.2, M.plaster, [{ a: oz + 0.5, b: oz + 1.5, y0: 0, y1: 2.1 }]);
    box(ow + 0.7, 0.3, od + 0.7, M.concrete, ox, y + 0.2 + H, oz);
    box(ow - 0.2, 0.04, od - 0.2, M.planks, ox, y + 0.2, oz, 0, false);
    box(1.6, 0.8, 0.8, M.planksDark, ox - 3, y + 0.2, oz - 2.5); box(0.6, 1.9, 0.5, M.blue, ox + 6, y + 0.2, oz - 3.3);
    // ангар: кирпич + полукруглая крыша из профнастила
    const hx = c.x + 12, hz = c.z - 8, hw = 18, hd = 13, HH = 6;
    wallX(hx - hw / 2, hx + hw / 2, hz - hd / 2, y, HH, 0.3, M.brick);
    wallZ(hz - hd / 2, hz + hd / 2, hx - hw / 2, y, HH, 0.3, M.brick);
    wallZ(hz - hd / 2, hz + hd / 2, hx + hw / 2, y, HH, 0.3, M.brick, [{ a: hz - 2, b: hz + 1, y0: 0, y1: 2.4, frameMat: M.rust }]);
    wallX(hx - hw / 2, hx - hw / 2 + 2, hz + hd / 2, y, HH, 0.3, M.brick); wallX(hx + hw / 2 - 2, hx + hw / 2, hz + hd / 2, y, HH, 0.3, M.brick);
    box(hw - 4, 1.6, 0.3, M.brick, hx, y + HH - 1.6, hz + hd / 2);
    const arc = new THREE.CylinderGeometry(hw / 2 + 0.3, hw / 2 + 0.3, hd + 0.4, 32, 1, true, -Math.PI / 2, Math.PI);
    const au = arc.attributes.uv; for (let i = 0; i < au.count; i++) au.setXY(i, au.getX(i) * Math.PI * hw / 2, au.getY(i) * hd);
    arc.rotateX(Math.PI / 2); arc.scale(1, 0.3, 1); arc.rotateZ(0);
    addGeo(arc, M.corrugated, hx, y + HH, hz, 0, 0, 0);
    vehicle(hx - 3, hz + 1, 0.1, 'truck'); vehicle(hx + 4.5, hz - 1, -0.05, 'truck', M.army);
    // двор
    for (let b = 0; b < 9; b++) { cyl(0.3, 0.3, 0.88, b % 3 ? M.rust : M.blue, c.x + 18 + (b % 3) * 0.66, y + 0.44, c.z + 12 + Math.floor(b / 3) * 0.66, 0, 0, 18); }
    for (let k = 0; k < 6; k++) { const tq = new THREE.TorusGeometry(0.38, 0.14, 10, 20); addGeo(tq, M.tire, c.x - 20, y + 0.14 + k * 0.27, c.z + 14, Math.PI / 2, 0, k * 0.3); }
    box(1.2, 0.8, 0.8, M.crate, c.x + 4, y, c.z + 6, 0.3); box(1, 0.7, 0.8, M.crate, c.x + 5.3, y, c.z + 6.4, -0.2); box(0.9, 0.7, 0.8, M.crate, c.x + 4.6, y + 0.8, c.z + 6.2, 0.6);
    vehicle(c.x - 16, c.z + 8, 1.2, 'car', M.blue); vehicle(c.x + 2, c.z + 15, -0.4, 'bus', M.rust);
    const ffx = c.x - 4, ffz = c.z + 4; W.fires.push({ x: ffx, y, z: ffz });
    for (let j = 0; j < 8; j++) addGeo(A.models.rock2.scene.children[0].geometry, A.models.rock2.scene.children[0].material, ffx + Math.cos(j * 0.8) * 0.6, y, ffz + Math.sin(j * 0.8) * 0.6, 0, j, 0, 0.1);
    // вышка
    const wx = x0 + 4, wz = z0 + 4;
    for (let l = 0; l < 4; l++) box(0.16, 5, 0.16, M.planksDark, wx + (l % 2 ? 1.2 : -1.2), y, wz + (l > 1 ? 1.2 : -1.2), 0, false);
    box(3, 0.15, 3, M.planks, wx, y + 5, wz);
    box(3, 1, 0.06, M.planks, wx, y + 5.15, wz - 1.5, 0, false); box(3, 1, 0.06, M.planks, wx, y + 5.15, wz + 1.5, 0, false);
    for (let l = 0; l < 4; l++) box(0.1, 1.2, 0.1, M.planksDark, wx + (l % 2 ? 1.4 : -1.4), y + 5.15, wz + (l > 1 ? 1.4 : -1.4), 0, false);
    gableRoof(wx, wz, 3, 3, y + 6.35, 0.8, M.corrugated, M.planks);
    W.bandits = [
      { x: ffx + 1.5, z: ffz, patrol: [[ffx + 1.5, ffz], [c.x + 8, c.z + 10]] },
      { x: ffx - 1.4, z: ffz + 0.8, patrol: [[ffx - 1.4, ffz + 0.8]] },
      { x: c.x, z: z1 + 4, patrol: [[c.x - 3, z1 + 4], [c.x + 3, z1 + 6]] },
      { x: ox, z: oz, patrol: [[ox - 3, oz], [ox + 3, oz - 1]] },
      { x: hx, z: hz + 4, patrol: [[hx, hz + 4], [hx - 4, hz + 9]] },
      { x: wx, z: wz, y: y + 5.15, patrol: [[wx, wz]], tower: true }
    ];
    W.boxes.push({ x: ox + 6, y: y + 0.2, z: oz - 2.3, items: { ammo545: 60, medkit: 1 }, label: 'Металлический шкаф' });
    W.markers.push({ x: c.x, z: c.z, label: 'АТП', kind: 'enemy' });
  })();

  // ---------- Блокпост
  (function () {
    const c = POI.check, y = Z.heightAt(c.x, c.z);
    const fbGeo = (() => { // блок ФБС со скошенными гранями
      const g = profileGeo([[-1, 0], [1, 0], [1, 0.75], [0.9, 0.9], [-0.9, 0.9], [-1, 0.75]], 0.8, 0.03); return g;
    })();
    for (let i = 0; i < 6; i++) { const bx = c.x - 7 + (i % 2) * 3, bz = c.z - 10 + i * 2.2; addGeo(fbGeo, M.concrete, bx, y, bz, 0, Math.PI / 2); addCollider(bx - 1, bx + 1, y, y + 0.9, bz - 0.4, bz + 0.4); }
    for (let k = 0; k < 4; k++) { const bz = c.z - 6 + k * 2.1, by = Z.heightAt(c.x + 8, bz); addGeo(fbGeo, M.concrete, c.x + 8, by, bz); addCollider(c.x + 7.6, c.x + 8.4, by, by + 0.9, bz - 1, bz + 1); }
    const bx = c.x - 6, bz = c.z + 3;
    wallX(bx - 1.5, bx + 1.5, bz - 1.5, y, 2.5, 0.12, M.plaster, [{ a: bx - 0.8, b: bx + 0.8, y0: 1, y1: 2 }]);
    wallX(bx - 1.5, bx + 1.5, bz + 1.5, y, 2.5, 0.12, M.plaster, [{ a: bx - 0.4, b: bx + 0.4, y0: 0, y1: 2.1 }]);
    wallZ(bz - 1.5, bz + 1.5, bx - 1.5, y, 2.5, 0.12, M.plaster); wallZ(bz - 1.5, bz + 1.5, bx + 1.5, y, 2.5, 0.12, M.plaster, [{ a: bz - 0.8, b: bz + 0.8, y0: 1, y1: 2 }]);
    box(3.5, 0.12, 3.5, M.corrugated, bx, y + 2.5, bz);
    box(0.3, 1.1, 0.3, M.concrete, c.x - 3.6, y, c.z);
    // шлагбаум в красно-белую полоску
    const stripe = new THREE.MeshStandardMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 16; const x = cv.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ddd8c8' : '#a8261c'; x.fillRect(i * 32, 0, 32, 16); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.7 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 10), stripe);
    bar.rotation.z = Math.PI / 2 - 0.35; bar.position.set(c.x - 0.3, y + 1.0 + 1.1, c.z); bar.castShadow = true; root.add(bar);
    // табличка «СТОЙ! ПРОВЕРКА»
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x2 = cv.getContext('2d');
    x2.fillStyle = '#d8d0a8'; x2.fillRect(0, 0, 512, 128); x2.fillStyle = '#a8261c'; x2.fillRect(0, 0, 512, 18); x2.fillRect(0, 110, 512, 18);
    x2.fillStyle = '#1f1f1f'; x2.font = 'bold 56px sans-serif'; x2.textAlign = 'center'; x2.fillText('СТОЙ! ПРОВЕРКА', 256, 84);
    for (let i = 0; i < 900; i++) { x2.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 30},30,${Math.random() * 0.5})`; x2.fillRect(Math.random() * 512, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 6); }
    const st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: st, roughness: 0.8 }));
    sign.position.set(c.x - 6, y + 2.95, c.z + 1.44); root.add(sign);
    for (let s = 0; s < 16; s++) { const a = -1.3 + s * 0.17, rx = c.x + 4 + Math.cos(a) * 3, rz = c.z + 6 + Math.sin(a) * 3; box(0.9, 0.36, 0.5, M.burlap, rx, Z.heightAt(rx, rz) + (s % 2) * 0.35, rz, a + Math.PI / 2); }
    vehicle(c.x + 10, c.z + 10, 0.6, 'btr');
    W.boxes.push({ x: c.x + 11.5, y, z: c.z + 7.2, items: { flash: 1, ammo12: 10, bandage: 2 }, label: 'Ящик у БТР', quest: 'flash' });
    W.markers.push({ x: c.x, z: c.z, label: 'Блокпост', kind: 'poi' });
  })();

  // ---------- Кладбище техники
  (function () {
    const c = POI.cars, r = Z.rng(77);
    const kinds = ['car', 'car', 'truck', 'bus', 'car', 'truck', 'car', 'btr', 'car', 'car', 'tractor'];
    const mats = [M.rust, M.blue, M.rust, M.army, M.rust];
    kinds.forEach((k, i) => { const a = i * 0.6 + r(), d = 4 + r() * 11; vehicle(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, r() * 6.28, k, k === 'btr' ? M.army : mats[i % mats.length]); });
    const rs = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.fillStyle = '#d6b11e'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#151515'; x.beginPath(); x.arc(64, 64, 10, 0, 7); x.fill(); for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 46, i * 2.094 - 0.52, i * 2.094 + 0.52); x.closePath(); x.fill(); } x.fillStyle = '#d6b11e'; x.beginPath(); x.arc(64, 64, 16, 0, 7); x.fill(); x.fillStyle = '#151515'; x.beginPath(); x.arc(64, 64, 10, 0, 7); x.fill(); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(110,70,30,${Math.random() * 0.6})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 3); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    [[c.x + 15, c.z + 6], [c.x - 14, c.z - 8], [c.x + 3, c.z + 16]].forEach(([px, pz]) => {
      const py = Z.heightAt(px, pz);
      cyl(0.03, 0.03, 1.9, M.rust, px, py + 0.95, pz, 0, 0, 6);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: rs, roughness: 0.6, side: THREE.DoubleSide }));
      sg.position.set(px, py + 1.65, pz); sg.rotation.y = Math.atan2(c.x - px, c.z - pz); root.add(sg);
    });
    W.radZones.push({ x: c.x, z: c.z, r: 15, power: 7 });
    W.markers.push({ x: c.x, z: c.z, label: 'Кладбище техники', kind: 'rad' });
  })();

  // ---------- Железная дорога
  (function () {
    const z = railZ;
    const sl = boxGeo(0.25, 0.14, 2.6), slMat = M.planksDark;
    for (let x = -158; x < 158; x += 0.75) addGeo(sl, slMat, x, Z.heightAt(x, z) + 0.12, z, 0, (rng() - .5) * 0.05, 0);
    for (let xs = -158; xs < 158; xs += 4) {
      const y0 = Z.heightAt(xs, z) + 0.26, y1 = Z.heightAt(xs + 4, z) + 0.26;
      for (const sd of [-1, 1]) {
        const g = new THREE.Shape(); g.moveTo(-0.035, 0); g.lineTo(0.035, 0); g.lineTo(0.035, 0.03); g.lineTo(0.015, 0.04); g.lineTo(0.015, 0.11); g.lineTo(0.035, 0.12); g.lineTo(0.035, 0.15); g.lineTo(-0.035, 0.15); g.lineTo(-0.035, 0.12); g.lineTo(-0.015, 0.11); g.lineTo(-0.015, 0.04); g.lineTo(-0.035, 0.03);
        const rg = new THREE.ExtrudeGeometry(g, { depth: Math.hypot(4, y1 - y0), bevelEnabled: false }); rg.rotateY(Math.PI / 2);
        addGeo(rg, M.rust, xs, y0, z + sd * 0.76, 0, 0, Math.atan2(y1 - y0, 4));
      }
    }
    const wagon = (x, tank) => {
      const y = Z.heightAt(x, z) + 0.3;
      if (tank) { cyl(1.45, 1.45, 9, M.rust, x, y + 2.15, z, 0, Math.PI / 2, 28); box(10, 0.35, 2.6, M.rust, x, y + 0.55, z, 0, false); }
      else { box(12, 3.1, 2.9, M.corrugated, x, y + 0.9, z, 0, false); box(12.1, 0.2, 3.0, M.rust, x, y + 4.0, z, 0, false); box(2.4, 2.5, 0.05, M.rust, x - 0.8, y + 1.0, z + 1.48, 0, false); }
      for (const ax of [-3.6, 3.6]) for (const sd of [-0.76, 0.76]) cyl(0.45, 0.45, 0.12, M.steel, x + ax, y + 0.3, z + sd, Math.PI / 2, 0, 18);
      addCollider(x - 6, x + 6, y - 1, y + 4.2, z - 1.6, z + 1.6);
    };
    wagon(-40); wagon(-27); wagon(-14, true); wagon(60, true); wagon(73);
    W.markers.push({ x: -27, z, label: 'Вагоны', kind: 'poi' });
  })();

  // ---------- ЛЭП: бетонные опоры с траверсами и изоляторами, провисающие провода
  (function () {
    const A2 = [-158, -36], B = [158, -18], n = 10, tops = [];
    for (let i = 0; i <= n; i++) {
      const x = Z.lerp(A2[0], B[0], i / n), z = Z.lerp(A2[1], B[1], i / n), y = Z.heightAt(x, z);
      if (Math.abs(x - POI.depot.x) < 28 && Math.abs(z - POI.depot.z) < 25) continue;
      const tilt = i === 3 ? 0.16 : 0;
      cyl(0.16, 0.24, 11, M.concrete, x + tilt * 5.5, y + 5.2, z, 0, -tilt, 10);
      addCollider(x - 0.3, x + 0.3, y - 1, y + 11, z - 0.3, z + 0.3);
      box(0.2, 0.2, 4.6, M.rust, x + tilt * 10, y + 9.6, z, 0, false, { z: -tilt });
      for (const sd of [-2, 0, 2]) cyl(0.05, 0.07, 0.3, M.glass, x + tilt * 10, y + 9.95, z + sd, 0, 0, 8);
      tops.push([x + tilt * 10, y + 10.1, z]);
    }
    for (let k = 0; k < tops.length - 1; k++) for (const sd of [-2, 0, 2]) {
      const a = tops[k], b = tops[k + 1], pts = [];
      for (let j = 0; j <= 16; j++) { const t = j / 16; pts.push(new THREE.Vector3(Z.lerp(a[0], b[0], t), Z.lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 1.8, Z.lerp(a[2], b[2], t) + sd)); }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.wire));
    }
  })();

  batch.finish(root, W.solids);

  // =====================================================================
  // РАСТИТЕЛЬНОСТЬ
  await buildVegetation(W, root, renderer, rng, quality);

  // ---------- аномалии, артефакты, радиация, псы
  const P = POI.pond, pl = Z.pondLevel;
  W.anomalies = [
    { type: 'voronka', x: P.x - 22, z: P.z + 8, r: 3.2 }, { type: 'voronka', x: P.x + 10, z: P.z - 25, r: 3.0 },
    { type: 'electra', x: P.x - 16, z: P.z - 14, r: 2.6 }, { type: 'electra', x: P.x + 25, z: P.z + 4, r: 2.6 },
    { type: 'zharka', x: P.x - 4, z: P.z - 26, r: 2.2 }, { type: 'zharka', x: P.x + 20, z: P.z + 20, r: 2.2 },
    { type: 'electra', x: POI.cars.x + 3, z: POI.cars.z - 2, r: 2.4 }, { type: 'voronka', x: 10, z: 70, r: 3 },
    { type: 'zharka', x: -40, z: -80, r: 2.2 }
  ];
  W.anomalies.forEach((a) => { a.y = Math.max(Z.heightAt(a.x, a.z), pl + 0.02); });
  W.artifacts = [
    { name: 'Капля', price: 1800, x: P.x - 20, z: P.z + 6.5, color: 0xff9a3c },
    { name: 'Искра', price: 2500, x: P.x - 15, z: P.z - 12.5, color: 0x7fd4ff },
    { name: 'Пузырь', price: 3200, x: P.x + 9, z: P.z - 23, color: 0xb3ff6a },
    { name: 'Кристалл', price: 4000, x: POI.cars.x + 2, z: POI.cars.z, color: 0xff4f6a },
    { name: 'Колючка', price: 1500, x: P.x + 22, z: P.z + 19, color: 0xd8d0ff }
  ];
  W.artifacts.forEach((a) => { a.y = Math.max(Z.heightAt(a.x, a.z), pl) + 0.25; });
  W.radZones.push({ x: P.x, z: P.z, r: 14, power: 2.5 }, { x: 60, z: railZ, r: 8, power: 4 });
  W.dogs = [{ x: 64, z: 72 }, { x: 66, z: 76 }, { x: 60, z: 77 }, { x: 70, z: 70 }, { x: -60, z: -70 }, { x: -64, z: -72 }];
  W.markers.push({ x: P.x, z: P.z, label: 'Аномалии', kind: 'anomaly' });
  return W;
}

// =====================================================================
// Растительность: деревья ez-tree (вблизи — полная геометрия, вдали — импостеры), трава с ветром, кусты, камни
async function buildVegetation(W, root, renderer, rng, quality) {
  const blocked = (x, z, pad) => {
    if (L.polyDist(x, z, L.ROAD).d < 7 + pad) return true;
    if (L.polyDist(x, z, L.TRACK).d < 4 + pad || L.polyDist(x, z, L.TRACK2).d < 4 + pad) return true;
    if (Math.hypot(x - POI.pond.x, z - POI.pond.z) < L.POND_R + pad) return true;
    if (Math.abs(x - POI.depot.x) < 30 + pad && Math.abs(z - POI.depot.z) < 27 + pad) return true;
    if (Math.hypot(x - POI.village.x, z - POI.village.z) < 30 + pad) return true;
    if (Math.hypot(x - POI.check.x, z - POI.check.z) < 16 + pad) return true;
    if (Math.hypot(x - POI.bunker.x, z - POI.bunker.z) < 12 + pad) return true;
    if (Math.hypot(x - POI.cars.x, z - POI.cars.z) < 18 + pad) return true;
    if (Math.abs(z - POI.rail.z) < 6 + pad) return true;
    return Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4;
  };

  // --- варианты деревьев
  const SPECIES = {
    pine: { presets: ['Pine Medium', 'Pine Large'], h: [13, 19], leaves: 0xb8c4a0 },
    birch: { presets: ['Aspen Medium', 'Aspen Large'], h: [10, 15], bark: 'birch', leaves: 0xd8d090 },
    ash: { presets: ['Ash Medium'], h: [9, 13], leaves: 0xc8c890 },
    dead: { presets: ['Ash Medium'], h: [7, 10], dead: true }
  };
  const variants = {};
  const leafShaders = [];
  function fixTreeMaterials(t, cfg) {
    const ob = t.branchesMesh.material;
    t.branchesMesh.material = new THREE.MeshStandardMaterial({ map: ob.map, normalMap: ob.normalMap, roughnessMap: ob.roughnessMap, aoMap: ob.aoMap, color: ob.color, roughness: 1 });
    if (t.leavesMesh.geometry.attributes.position) {
      const ol = t.leavesMesh.material;
      const lm = new THREE.MeshStandardMaterial({ map: ol.map, color: ol.color, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
      lm.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = { value: 0 }; leafShaders.push(sh);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec4 o0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            #else
              vec4 o0 = vec4(0.0);
            #endif
            float ph = o0.x * 0.21 + o0.z * 0.17 + position.x * 0.05;
            float k = position.y * 0.004;
            transformed.x += (sin(uTime * 1.3 + ph) * 0.7 + sin(uTime * 3.7 + ph * 2.0) * 0.3) * k * 6.0;
            transformed.z += cos(uTime * 1.1 + ph) * k * 4.0;`);
      };
      t.leavesMesh.material = lm;
    }
  }
  const { TreePreset } = await import('../../vendor/ez-tree/presets/index.js');
  let seed = 100;
  for (const [sp, cfg] of Object.entries(SPECIES)) {
    variants[sp] = [];
    for (const pr of cfg.presets) for (let k = 0; k < (quality === 'low' ? 1 : 2); k++) {
      const t = new Tree();
      t.options.copy(JSON.parse(JSON.stringify(TreePreset[pr])));
      t.options.seed = seed++;
      if (cfg.bark) t.options.bark.type = cfg.bark;
      if (cfg.dead) { t.options.leaves.count = 0; t.options.bark.tint = 0x8a8478; t.options.branch.levels = Math.min(t.options.branch.levels, 2); }
      else t.options.leaves.tint = cfg.leaves;
      // экономим вершины: меньше секций и сегментов
      for (const lv of [0, 1, 2, 3]) { if (t.options.branch.sections[lv]) t.options.branch.sections[lv] = Math.max(3, Math.round(t.options.branch.sections[lv] * 0.6)); if (t.options.branch.segments[lv]) t.options.branch.segments[lv] = Math.max(3, Math.round(t.options.branch.segments[lv] * 0.75)); }
      if (t.options.leaves.count) t.options.leaves.count = Math.round(t.options.leaves.count * 0.8);
      t.generate();
      t.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(t);
      const height = bb.max.y - bb.min.y;
      fixTreeMaterials(t, cfg);
      variants[sp].push({ tree: t, height, scaleFor: (hm) => hm / height, branches: t.branchesMesh, leaves: t.leavesMesh, list: [] });
    }
  }

  // --- раскладка деревьев по рощам
  const groves = [
    { x: -60, z: 50, r: 30, t: 'birch', n: 60 }, { x: -120, z: -20, r: 34, t: 'birch', n: 55 },
    { x: 30, z: 90, r: 26, t: 'birch', n: 35 }, { x: 120, z: 40, r: 40, t: 'pine', n: 70 },
    { x: -40, z: -100, r: 40, t: 'pine', n: 70 }, { x: 110, z: 120, r: 35, t: 'pine', n: 50 },
    { x: 70, z: 10, r: 20, t: 'dead', n: 18 }, { x: -130, z: 140, r: 24, t: 'pine', n: 30 },
    { x: 40, z: -110, r: 25, t: 'ash', n: 30 }, { x: -100, z: 60, r: 20, t: 'ash', n: 20 }
  ];
  const all = [];
  const place = (sp, x, z) => {
    const vs = variants[sp], vi = Math.floor(rng() * vs.length), cfg = SPECIES[sp];
    const hm = Z.lerp(cfg.h[0], cfg.h[1], rng());
    all.push({ sp, vi, x, z, y: Z.heightAt(x, z) - 0.15, rot: rng() * 6.28, s: vs[vi].scaleFor(hm) });
  };
  groves.forEach((g) => { for (let i = 0; i < g.n; i++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * g.r, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d; if (!blocked(x, z, 1)) place(g.t, x, z); } });
  for (let i = 0; i < 140; i++) { const x = (rng() - .5) * 300, z = (rng() - .5) * 300; if (!blocked(x, z, 2)) place(rng() < 0.45 ? 'birch' : rng() < 0.6 ? 'pine' : rng() < 0.5 ? 'ash' : 'dead', x, z); }
  for (let i = 0; i < 10; i++) { const a = rng() * 6.28, d = L.POND_R + 2 + rng() * 8; place('dead', POI.pond.x + Math.cos(a) * d, POI.pond.z + Math.sin(a) * d); }
  all.forEach((t) => {
    variants[t.sp][t.vi].list.push(t);
    const r = 0.25 * t.s * 4; W.colliders.push({ x0: t.x - r, x1: t.x + r, y0: t.y - 1, y1: t.y + 10, z0: t.z - r, z1: t.z + r });
  });

  // --- импостер: снимок дерева в текстуру (вид сбоку) — для дальних деревьев
  const impScene = new THREE.Scene();
  impScene.add(new THREE.HemisphereLight(0xdde0d0, 0x4a4436, 2.2));
  const dl = new THREE.DirectionalLight(0xfff0d8, 2.0); dl.position.set(3, 5, 4); impScene.add(dl);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(), pp = new THREE.Vector3();
  const NEAR = quality === 'low' ? 45 : 75;
  const trees = [];
  for (const sp of Object.keys(variants)) for (const vr of variants[sp]) {
    if (!vr.list.length) continue;
    const t = vr.tree, bb = new THREE.Box3().setFromObject(t), size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
    const w = Math.max(size.x, size.z), h = size.y;
    const rt = new THREE.WebGLRenderTarget(256, Math.round(256 * h / w), { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1000);
    cam.position.set(ctr.x, ctr.y, ctr.z + 100); cam.lookAt(ctr);
    impScene.add(t);
    const prevClear = renderer.getClearAlpha(), prevColor = renderer.getClearColor(new THREE.Color()), prevTarget = renderer.getRenderTarget(), prevTM = renderer.toneMapping;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x6a6e5a, 0); renderer.clear(); renderer.render(impScene, cam);
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevClear);
    impScene.remove(t);
    // крестовина из двух плоскостей
    const pg = new THREE.PlaneGeometry(w, h); pg.translate(ctr.x, ctr.y - bb.min.y, 0);
    const pg2 = pg.clone().rotateY(Math.PI / 2);
    const imp = mergeGeometries([pg, pg2]);
    const impMat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    const n = vr.list.length;
    const nearB = new THREE.InstancedMesh(vr.branches.geometry, vr.branches.material, n);
    const nearL = vr.leaves.geometry.attributes.position ? new THREE.InstancedMesh(vr.leaves.geometry, vr.leaves.material, n) : null;
    const far = new THREE.InstancedMesh(imp, impMat, n);
    [nearB, nearL, far].forEach((m) => { if (!m) return; m.castShadow = true; m.receiveShadow = m !== far; m.frustumCulled = false; root.add(m); });
    // смещение по высоте: основание дерева в 0
    const lift = -bb.min.y;
    vr.list.forEach((it) => {
      qq.setFromAxisAngle(UP, it.rot); ss.set(it.s, it.s, it.s); pp.set(it.x, it.y + lift * it.s, it.z);
      it.matrix = new THREE.Matrix4().compose(pp.clone(), qq.clone(), ss.clone());
    });
    trees.push({ vr, nearB, nearL, far });
    W.solids.push(nearB);
  }
  // переключение «близко/далеко» раз в полсекунды
  let lastT = -1;
  W.updateTrees = (camPos, time) => {
    if (time - lastT < 0.5 && lastT >= 0) return;
    lastT = time;
    for (const T of trees) {
      let nn = 0, nf = 0;
      for (const it of T.vr.list) {
        const d = Math.hypot(it.x - camPos.x, it.z - camPos.z);
        if (d < NEAR) { T.nearB.setMatrixAt(nn, it.matrix); if (T.nearL) T.nearL.setMatrixAt(nn, it.matrix); nn++; }
        else { T.far.setMatrixAt(nf++, it.matrix); }
      }
      T.nearB.count = nn; if (T.nearL) T.nearL.count = nn; T.far.count = nf;
      T.nearB.instanceMatrix.needsUpdate = true; if (T.nearL) T.nearL.instanceMatrix.needsUpdate = true; T.far.instanceMatrix.needsUpdate = true;
    }
  };
  W.treeTime = (t) => { for (const sh of leafShaders) sh.uniforms.uTime.value = t; };

  // --- трава: модель пучка из ez-tree, инстансы по чанкам, ветер в шейдере
  const gMesh = A.models.grass.scene.getObjectByProperty('isMesh', true);
  const gMat = new THREE.MeshStandardMaterial({ map: gMesh.material.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: 0xa8b080 });
  let gShader = null;
  gMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; gShader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = wp0.x * 0.35 + wp0.z * 0.27;
        float sway = (sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.1 + ph * 1.7) * 0.25) * position.y;
        transformed.x += sway * 0.18; transformed.z += sway * 0.12;`);
  };
  const gBox = new THREE.Box3().setFromBufferAttribute(gMesh.geometry.attributes.position);
  const gH = gBox.max.y - gBox.min.y;
  const CH = 24, chunks = [];
  const density = quality === 'low' ? 260 : quality === 'mid' ? 520 : 800;
  for (let cx = -HALF; cx < HALF; cx += CH) for (let cz = -HALF; cz < HALF; cz += CH) {
    const pts = [];
    for (let i = 0; i < density; i++) {
      const x = cx + rng() * CH, z = cz + rng() * CH;
      if (L.polyDist(x, z, L.ROAD).d < 4.4) continue;
      const tr = Math.min(L.polyDist(x, z, L.TRACK).d, L.polyDist(x, z, L.TRACK2).d); if (tr < 1.4) continue;
      if (Math.hypot(x - POI.pond.x, z - POI.pond.z) < L.POND_R - 3) continue;
      if (Math.hypot(x - POI.bunker.x, z - POI.bunker.z) < 7) continue;
      if (Math.abs(x - POI.depot.x) < 25 && Math.abs(z - POI.depot.z) < 22 && rng() < 0.85) continue;
      if (Math.abs(z - POI.rail.z) < 2.5) continue;
      if (Z.fbm(x * 0.03, z * 0.03, 2) < 0.4 && rng() < 0.75) continue;
      pts.push([x, z]);
    }
    if (!pts.length) continue;
    const im = new THREE.InstancedMesh(gMesh.geometry, gMat, pts.length);
    const col = new THREE.Color();
    pts.forEach(([x, z], i) => {
      const hgt = (0.35 + rng() * 0.5) / gH, wd = hgt * (0.9 + rng() * 0.8);
      qq.setFromAxisAngle(UP, rng() * 6.28); ss.set(wd, hgt, wd); pp.set(x, Z.heightAt(x, z) - 0.03, z);
      mtx.compose(pp, qq, ss); im.setMatrixAt(i, mtx);
      const dry = Z.fbm(x * 0.05 + 9, z * 0.05, 2);
      col.setRGB(0.55 + dry * 0.45, 0.66 + dry * 0.2, 0.38 + dry * 0.08); im.setColorAt(i, col);
    });
    im.receiveShadow = true; im.castShadow = false; im.visible = false; root.add(im);
    chunks.push({ im, x: cx + CH / 2, z: cz + CH / 2 });
  }
  const GRASS_R = quality === 'low' ? 38 : 60;
  W.updateGrass = (camPos, t) => {
    if (gShader) gShader.uniforms.uTime.value = t;
    for (const c of chunks) c.im.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) < GRASS_R + CH;
  };

  // --- кусты (ez-tree bush) и камни
  const bushVars = [];
  for (const pr of ['Bush 1', 'Bush 2']) {
    const t = new Tree(); t.options.copy(JSON.parse(JSON.stringify(TreePreset[pr]))); t.options.seed = 900 + bushVars.length; t.options.leaves.tint = 0xbfc490; t.generate(); fixTreeMaterials(t, {});
    const bb = new THREE.Box3().setFromObject(t); bushVars.push({ t, h: bb.max.y - bb.min.y, lift: -bb.min.y, list: [] });
  }
  for (let b = 0; b < 220; b++) {
    const x = (rng() - .5) * 300, z = (rng() - .5) * 300;
    if (blocked(x, z, 0.5)) continue;
    bushVars[b % bushVars.length].list.push([x, z, (1.0 + rng() * 1.4), rng() * 6.28]);
  }
  bushVars.forEach((bv) => {
    if (!bv.list.length) return;
    const mB = new THREE.InstancedMesh(bv.t.branchesMesh.geometry, bv.t.branchesMesh.material, bv.list.length);
    const mL = new THREE.InstancedMesh(bv.t.leavesMesh.geometry, bv.t.leavesMesh.material, bv.list.length);
    bv.list.forEach(([x, z, hm, r], i) => { const sc = hm / bv.h; qq.setFromAxisAngle(UP, r); ss.setScalar(sc); pp.set(x, Z.heightAt(x, z) + bv.lift * sc - 0.1, z); mtx.compose(pp, qq, ss); mB.setMatrixAt(i, mtx); mL.setMatrixAt(i, mtx); });
    [mB, mL].forEach((m) => { m.castShadow = true; m.receiveShadow = true; root.add(m); });
  });
  ['rock1', 'rock2', 'rock3'].forEach((rk, ri) => {
    const rm = A.models[rk].scene.getObjectByProperty('isMesh', true);
    const list = [];
    for (let i = 0; i < 40; i++) { const x = (rng() - .5) * 300, z = (rng() - .5) * 300; if (!blocked(x, z, 0)) list.push([x, z]); }
    const im = new THREE.InstancedMesh(rm.geometry, rm.material, list.length);
    list.forEach(([x, z], i) => { qq.setFromEuler(new THREE.Euler(rng() * 0.4, rng() * 6.28, rng() * 0.4)); ss.setScalar(0.15 + rng() * 0.35); pp.set(x, Z.heightAt(x, z) - 0.1, z); mtx.compose(pp, qq, ss); im.setMatrixAt(i, mtx); });
    im.castShadow = true; im.receiveShadow = true; root.add(im); W.solids.push(im);
  });

  // --- камыш
  const reeds = [];
  for (let i = 0; i < 600; i++) { const a = rng() * 6.28, d = L.POND_R - 6 + rng() * 9; reeds.push([POI.pond.x + Math.cos(a) * d, POI.pond.z + Math.sin(a) * d, 0.7 + rng() * 0.6]); }
  const reedGeo = new THREE.ConeGeometry(0.008, 1, 3, 1, true).translate(0, 0.5, 0);
  const reedIm = new THREE.InstancedMesh(reedGeo, new THREE.MeshStandardMaterial({ color: 0x5e6238, roughness: 0.9 }), reeds.length);
  reeds.forEach(([x, z, hh], i) => { qq.setFromEuler(new THREE.Euler((rng() - .5) * 0.25, 0, (rng() - .5) * 0.25)); ss.set(1, hh * 1.3, 1); pp.set(x, Math.max(Z.pondLevel - 0.3, Z.heightAt(x, z)), z); mtx.compose(pp, qq, ss); reedIm.setMatrixAt(i, mtx); });
  root.add(reedIm);
}
