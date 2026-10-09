/* Зона: построение карты «Окраина». x — восток, z — юг (север = −z). Размер 320×320 м. */
window.Z = window.Z || {};

(function (Z) {
  'use strict';
  var HALF = 160;

  // ---------- точки интереса
  var POI = {
    bunker:  { x: -112, z: 110, name: 'Бункер торговца' },
    village: { x: -78,  z: 8,   name: 'Деревня новичков' },
    depot:   { x: 84,   z: -82, name: 'АТП (бандиты)' },
    check:   { x: 4,    z: 126, name: 'Старый блокпост' },
    pond:    { x: 44,   z: 34,  name: 'Болото, аномальное поле' },
    cars:    { x: -26,  z: -46, name: 'Кладбище техники' },
    rail:    { x: 0,    z: -138, name: 'Железная дорога' }
  };
  Z.POI = POI;

  // дороги: асфальт (широкая) и грунтовка
  var ROAD = [[6, 168], [6, 126], [10, 80], [18, 32], [22, -8], [38, -46], [62, -58], [84, -58], [110, -62], [168, -70]];
  var TRACK = [[18, 32], [-20, 22], [-56, 12], [-78, 8], [-96, 40], [-106, 76], [-112, 100]];
  var TRACK2 = [[22, -8], [0, -30], [-26, -46]];
  var FLAT = [
    { x: POI.bunker.x, z: POI.bunker.z, r0: 10, r1: 18 },
    { x: POI.village.x, z: POI.village.z, r0: 34, r1: 50 },
    { x: POI.depot.x, z: POI.depot.z, r0: 34, r1: 48 },
    { x: POI.check.x, z: POI.check.z, r0: 14, r1: 24 },
    { x: POI.cars.x, z: POI.cars.z, r0: 16, r1: 28 }
  ];
  var POND_R = 24;

  function lowH(x, z) {
    var h = (Z.fbm(x * 0.006 + 10, z * 0.006 + 3, 4) - 0.5) * 26;
    var r = Math.max(Math.abs(x), Math.abs(z));
    h += Z.smoothstep(118, 158, r) * 24;
    h += 7 * Math.exp(-((x + 124) * (x + 124) + (z - 122) * (z - 122)) / 500);
    return h;
  }
  function segDist(px, pz, ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    var t = L2 ? Z.clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1) : 0;
    var qx = ax + dx * t, qz = az + dz * t;
    return { d: Math.hypot(px - qx, pz - qz), x: qx, z: qz };
  }
  function polyDist(px, pz, line) {
    var best = { d: 1e9, x: 0, z: 0 };
    for (var i = 0; i < line.length - 1; i++) {
      var s = segDist(px, pz, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
      if (s.d < best.d) best = s;
    }
    return best;
  }
  FLAT.forEach(function (f) { f.h = lowH(f.x, f.z); });
  var pondLevel = lowH(POI.pond.x, POI.pond.z) - 1.2;

  // Высота рельефа в точке — используется и для меша, и для физики
  Z.heightAt = function (x, z) {
    var h = lowH(x, z) + (Z.fbm(x * 0.04 + 40, z * 0.04, 3) - 0.5) * 2.4;
    for (var i = 0; i < FLAT.length; i++) {
      var f = FLAT[i], d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r1) h = Z.lerp(h, f.h, 1 - Z.smoothstep(f.r0, f.r1, d));
    }
    var r = polyDist(x, z, ROAD);
    if (r.d < 12) h = Z.lerp(h, lowH(r.x, r.z), 1 - Z.smoothstep(4.5, 11, r.d));
    var t = polyDist(x, z, TRACK); if (t.d < 8) h = Z.lerp(h, lowH(t.x, t.z), 1 - Z.smoothstep(2, 7, t.d));
    var t2 = polyDist(x, z, TRACK2); if (t2.d < 8) h = Z.lerp(h, lowH(t2.x, t2.z), 1 - Z.smoothstep(2, 7, t2.d));
    var pd = Math.hypot(x - POI.pond.x, z - POI.pond.z);
    if (pd < POND_R + 10) {
      var bowl = pondLevel - 2.2 * (1 - Math.pow(Math.min(1, pd / POND_R), 2));
      h = Z.lerp(h, Math.min(h, bowl), 1 - Z.smoothstep(POND_R - 4, POND_R + 10, pd));
    }
    return h;
  };
  Z.pondLevel = pondLevel;
  Z.onRoad = function (x, z) { return polyDist(x, z, ROAD).d < 4.5; };

  // ---------- построение
  Z.buildWorld = function (scene) {
    var W = {
      colliders: [], solids: [], anomalies: [], artifacts: [], radZones: [], boxes: [], npcSpots: [], lights: [],
      bandits: [], dogs: [], stalkers: [], fires: [], doors: [], trader: null, markers: []
    };
    var root = new THREE.Group(); scene.add(root);
    W.root = root;
    var rng = Z.rng(1337);

    var M = {
      ground: new THREE.MeshLambertMaterial({ map: Z.tex('ground', 70), vertexColors: true }),
      asphalt: new THREE.MeshLambertMaterial({ map: Z.tex('asphalt', 1, 1), polygonOffset: true, polygonOffsetFactor: -2 }),
      concrete: new THREE.MeshLambertMaterial({ map: Z.tex('concrete', 1) }),
      concreteBig: new THREE.MeshLambertMaterial({ map: Z.tex('concrete', 3, 1) }),
      brick: new THREE.MeshLambertMaterial({ map: Z.tex('brick', 2) }),
      plaster: new THREE.MeshLambertMaterial({ map: Z.tex('plaster', 2, 1) }),
      wood: new THREE.MeshLambertMaterial({ map: Z.tex('wood', 1) }),
      woodDark: new THREE.MeshLambertMaterial({ map: Z.tex('wood', 1), color: 0x8a7a68 }),
      roof: new THREE.MeshLambertMaterial({ map: Z.tex('roof', 3, 2), side: THREE.DoubleSide }),
      rust: new THREE.MeshLambertMaterial({ map: Z.tex('rust', 1) }),
      rustRoof: new THREE.MeshLambertMaterial({ map: Z.tex('rust', 4, 2), side: THREE.DoubleSide }),
      army: new THREE.MeshLambertMaterial({ map: Z.tex('paintMetal', 1) }),
      tire: new THREE.MeshLambertMaterial({ color: 0x1d1d1b }),
      dark: new THREE.MeshLambertMaterial({ color: 0x2a2826 }),
      glass: new THREE.MeshLambertMaterial({ color: 0x40504a, transparent: true, opacity: 0.45 }),
      water: new THREE.MeshPhongMaterial({ color: 0x2c3a2a, transparent: true, opacity: 0.86, shininess: 80, specular: 0x667766 }),
      sign: new THREE.MeshLambertMaterial({ map: Z.tex('sign', 1) }),
      radSign: new THREE.MeshLambertMaterial({ map: Z.tex('radSign', 1) }),
      sand: new THREE.MeshLambertMaterial({ color: 0x8c8466, map: Z.tex('ground', 1) }),
      crate: new THREE.MeshLambertMaterial({ map: Z.tex('wood', 1), color: 0x7c8a5a }),
      metalBox: new THREE.MeshLambertMaterial({ map: Z.tex('paintMetal', 1), color: 0x9aa0a0 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
      rail: new THREE.MeshLambertMaterial({ color: 0x5a4a3c }),
      wire: new THREE.LineBasicMaterial({ color: 0x222222 })
    };
    W.M = M;
    var GB = new THREE.BoxGeometry(1, 1, 1);
    var GC = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);

    function addCollider(x0, x1, y0, y1, z0, z1) { W.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: y0, y1: y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1) }); }
    // Коробка в мировых координатах (ry — поворот вокруг Y). collide: добавлять коллайдер (AABB, для произвольного угла — описанный)
    function box(w, h, d, mat, x, y, z, ry, collide, solid) {
      var m = new THREE.Mesh(GB, mat); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); m.rotation.y = ry || 0;
      m.castShadow = true; m.receiveShadow = true;
      // UV под размер — чтобы фактура не растягивалась
      root.add(m);
      if (collide !== false) {
        var c = Math.abs(Math.cos(ry || 0)), s = Math.abs(Math.sin(ry || 0));
        var hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
        addCollider(x - hw, x + hw, y, y + h, z - hd, z + hd);
      }
      if (solid !== false) W.solids.push(m);
      return m;
    }
    function cyl(r, h, mat, x, y, z, rx, rz) {
      var m = new THREE.Mesh(GC, mat); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z);
      m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
    }
    // Масштабированная фактура для коробки нужного размера
    var matCache = {};
    function mt(name, w, h) {
      var k = name + '|' + Math.round(w) + '|' + Math.round(h);
      if (!matCache[k]) {
        var base = M[name];
        var t = base.map.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(w / 2.5)), Math.max(1, Math.round(h / 2.5)));
        matCache[k] = new THREE.MeshLambertMaterial({ map: t, color: base.color, side: base.side });
      }
      return matCache[k];
    }

    // ---------- рельеф
    var SEG = 200;
    var tg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG); tg.rotateX(-Math.PI / 2);
    var pos = tg.attributes.position, cols = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = Z.heightAt(x, z);
      pos.setY(i, h);
      var n = Z.fbm(x * 0.05, z * 0.05, 3), n2 = Z.fbm(x * 0.012 + 7, z * 0.012, 3);
      // травяные тона: от выжженно-жёлтого к оливковому
      var r = 0.78 + n2 * 0.35, g = 0.86 + n * 0.22, b = 0.62 + n * 0.12;
      var tr = Math.min(polyDist(x, z, TRACK).d, polyDist(x, z, TRACK2).d);
      if (tr < 3.2) { var k = 1 - Z.smoothstep(1.5, 3.2, tr); r = Z.lerp(r, 0.95, k); g = Z.lerp(g, 0.78, k); b = Z.lerp(b, 0.58, k); }
      var rd = polyDist(x, z, ROAD).d;
      if (rd < 7) { var k2 = 1 - Z.smoothstep(4, 7, rd); r = Z.lerp(r, 0.9, k2); g = Z.lerp(g, 0.82, k2); b = Z.lerp(b, 0.66, k2); }
      var pd = Math.hypot(x - POI.pond.x, z - POI.pond.z);
      if (pd < POND_R + 4) { var k3 = 1 - Z.smoothstep(POND_R - 6, POND_R + 4, pd); r = Z.lerp(r, 0.55, k3); g = Z.lerp(g, 0.6, k3); b = Z.lerp(b, 0.42, k3); }
      var cd = Math.hypot(x - POI.cars.x, z - POI.cars.z);
      if (cd < 22) { var k4 = 1 - Z.smoothstep(10, 22, cd); r = Z.lerp(r, 0.85, k4); g = Z.lerp(g, 0.7, k4); b = Z.lerp(b, 0.5, k4); }
      cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    var terrain = new THREE.Mesh(tg, M.ground); terrain.receiveShadow = true;
    root.add(terrain); W.solids.push(terrain); W.terrain = terrain;

    // вода
    var water = new THREE.Mesh(new THREE.CircleGeometry(POND_R + 2, 48), M.water);
    water.rotation.x = -Math.PI / 2; water.position.set(POI.pond.x, pondLevel, POI.pond.z); root.add(water);
    W.water = water;

    // ---------- дорога (лента вдоль полилинии)
    function strip(line, width, mat, lift, vScale) {
      var P = [], U = [], idx = [], dist = 0, prev = null;
      var pts = [];
      for (var s = 0; s < line.length - 1; s++) {
        var ax = line[s][0], az = line[s][1], bx = line[s + 1][0], bz = line[s + 1][1], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 2);
        for (var j = 0; j < n; j++) pts.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n]);
      }
      pts.push(line[line.length - 1]);
      pts.forEach(function (p, i) {
        var q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
        var dx = q[0] - o[0], dz = q[1] - o[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        if (prev) dist += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        prev = p;
        for (var side = -1; side <= 1; side += 2) {
          var x = p[0] + nx * width / 2 * side, z = p[1] + nz * width / 2 * side;
          P.push(x, Z.heightAt(x, z) + lift, z); U.push(side < 0 ? 0 : 1, dist / vScale);
        }
        if (i > 0) { var a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(idx); g.computeVertexNormals();
      var m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m); return m;
    }
    var roadMat = M.asphalt.clone(); roadMat.map = Z.tex('asphalt', 1, 1);
    W.solids.push(strip(ROAD, 7, roadMat, 0.07, 7));

    // ---------- деревья (инстансы по типам)
    var treeData = { birch: [], pine: [], dead: [] };
    function blocked(x, z, pad) {
      if (polyDist(x, z, ROAD).d < 7 + pad) return true;
      if (polyDist(x, z, TRACK).d < 4 + pad || polyDist(x, z, TRACK2).d < 4 + pad) return true;
      if (Math.hypot(x - POI.pond.x, z - POI.pond.z) < POND_R + pad) return true;
      if (Math.abs(x - POI.depot.x) < 30 + pad && Math.abs(z - POI.depot.z) < 27 + pad) return true;
      if (Math.hypot(x - POI.village.x, z - POI.village.z) < 30 + pad) return true;
      if (Math.hypot(x - POI.check.x, z - POI.check.z) < 16 + pad) return true;
      if (Math.hypot(x - POI.bunker.x, z - POI.bunker.z) < 12 + pad) return true;
      if (Math.hypot(x - POI.cars.x, z - POI.cars.z) < 18 + pad) return true;
      if (Math.abs(z - POI.rail.z) < 6 + pad) return true;
      if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) return true;
      return false;
    }
    // рощи: березняк у деревни и вдоль дороги, сосны на севере и у границ
    var groves = [
      { x: -60, z: 50, r: 30, t: 'birch', n: 60 }, { x: -120, z: -20, r: 34, t: 'birch', n: 55 },
      { x: 30, z: 90, r: 26, t: 'birch', n: 35 }, { x: 120, z: 40, r: 40, t: 'pine', n: 70 },
      { x: -40, z: -100, r: 40, t: 'pine', n: 70 }, { x: 110, z: 120, r: 35, t: 'pine', n: 50 },
      { x: 70, z: 10, r: 20, t: 'dead', n: 18 }, { x: -130, z: 140, r: 24, t: 'pine', n: 30 },
      { x: 40, z: -110, r: 25, t: 'birch', n: 30 }
    ];
    groves.forEach(function (gv) {
      for (var i = 0; i < gv.n; i++) {
        var a = rng() * 6.283, d = Math.sqrt(rng()) * gv.r, x = gv.x + Math.cos(a) * d, z = gv.z + Math.sin(a) * d;
        if (blocked(x, z, 1)) continue;
        treeData[gv.t].push({ x: x, z: z, s: 0.75 + rng() * 0.6, r: rng() * 6.28 });
      }
    });
    for (var t = 0; t < 140; t++) { // одиночные деревья по всей карте
      var x2 = (rng() - .5) * 300, z2 = (rng() - .5) * 300;
      if (blocked(x2, z2, 2)) continue;
      var kind = rng() < 0.5 ? 'birch' : rng() < 0.7 ? 'pine' : 'dead';
      treeData[kind].push({ x: x2, z: z2, s: 0.7 + rng() * 0.6, r: rng() * 6.28 });
    }
    // мёртвые деревья у болота
    for (var p2 = 0; p2 < 10; p2++) { var a2 = rng() * 6.28, d2 = POND_R + 2 + rng() * 8; treeData.dead.push({ x: POI.pond.x + Math.cos(a2) * d2, z: POI.pond.z + Math.sin(a2) * d2, s: 0.8 + rng() * 0.4, r: rng() * 6 }); }
    W.trees = treeData;

    var leafTex = Z.tex('leaves', 1);
    var parts = {
      birch: [
        { geo: new THREE.CylinderGeometry(0.12, 0.2, 9, 7).translate(0, 4.5, 0), mat: new THREE.MeshLambertMaterial({ map: Z.tex('birch', 1, 3) }), trunk: true },
        { geo: new THREE.IcosahedronGeometry(2.3, 1).scale(1, 1.5, 1).translate(0.3, 8.2, 0), mat: new THREE.MeshLambertMaterial({ map: leafTex, color: 0xb7c48a, flatShading: true }) },
        { geo: new THREE.IcosahedronGeometry(1.7, 1).scale(1, 1.3, 1).translate(-0.8, 6.6, 0.5), mat: new THREE.MeshLambertMaterial({ map: leafTex, color: 0xa9b878, flatShading: true }) }
      ],
      pine: [
        { geo: new THREE.CylinderGeometry(0.16, 0.3, 12, 7).translate(0, 6, 0), mat: new THREE.MeshLambertMaterial({ map: Z.tex('bark', 1, 3) }), trunk: true },
        { geo: new THREE.ConeGeometry(2.6, 4.5, 8).translate(0, 7.2, 0), mat: new THREE.MeshLambertMaterial({ map: leafTex, color: 0x5d7050, flatShading: true }) },
        { geo: new THREE.ConeGeometry(2.0, 4, 8).translate(0, 9.6, 0), mat: new THREE.MeshLambertMaterial({ map: leafTex, color: 0x566a4a, flatShading: true }) },
        { geo: new THREE.ConeGeometry(1.3, 3.2, 8).translate(0, 11.8, 0), mat: new THREE.MeshLambertMaterial({ map: leafTex, color: 0x60744f, flatShading: true }) }
      ],
      dead: [
        { geo: new THREE.CylinderGeometry(0.08, 0.24, 7, 6).translate(0, 3.5, 0), mat: new THREE.MeshLambertMaterial({ map: Z.tex('bark', 1, 2), color: 0x8a8a80 }), trunk: true },
        { geo: new THREE.CylinderGeometry(0.03, 0.08, 3, 5).translate(0, 1.5, 0).rotateZ(0.9).translate(0, 4.2, 0), mat: new THREE.MeshLambertMaterial({ color: 0x4a443c }) },
        { geo: new THREE.CylinderGeometry(0.03, 0.07, 2.6, 5).translate(0, 1.3, 0).rotateZ(-0.8).rotateY(1.7).translate(0, 5.2, 0), mat: new THREE.MeshLambertMaterial({ color: 0x4a443c }) }
      ]
    };
    var mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    Object.keys(treeData).forEach(function (kind) {
      var list = treeData[kind];
      parts[kind].forEach(function (part) {
        var im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        im.castShadow = true; im.receiveShadow = !part.trunk ? false : true;
        list.forEach(function (tr, i) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr.r);
          sc.set(tr.s, tr.s, tr.s); ps.set(tr.x, Z.heightAt(tr.x, tr.z) - 0.2, tr.z);
          mtx.compose(ps, q, sc); im.setMatrixAt(i, mtx);
          if (!part.trunk) { var v = 0.85 + ((i * 37) % 30) / 100; col.setRGB(v, v * (0.95 + ((i * 13) % 10) / 100), v * 0.9); im.setColorAt(i, col); }
        });
        root.add(im);
        if (part.trunk) {
          W.solids.push(im);
          list.forEach(function (tr) { var r = 0.3 * tr.s, y = Z.heightAt(tr.x, tr.z); addCollider(tr.x - r, tr.x + r, y - 1, y + 10, tr.z - r, tr.z + r); });
        }
      });
    });

    // кусты
    var bushes = [];
    for (var b = 0; b < 260; b++) {
      var bx = (rng() - .5) * 300, bz = (rng() - .5) * 300;
      if (blocked(bx, bz, 0.5)) continue;
      bushes.push([bx, bz, 0.6 + rng() * 1.1]);
    }
    var bim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1).scale(1.3, 0.8, 1.2), new THREE.MeshLambertMaterial({ map: leafTex, color: 0x8c9a62, flatShading: true }), bushes.length);
    bushes.forEach(function (bb, i) { ps.set(bb[0], Z.heightAt(bb[0], bb[1]) + 0.4 * bb[2], bb[1]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i); sc.setScalar(bb[2]); mtx.compose(ps, q, sc); bim.setMatrixAt(i, mtx); });
    bim.castShadow = true; root.add(bim);

    // трава — перекрещенные плоскости с альфой
    var gTex = Z.tex('grass', 1); gTex.wrapS = gTex.wrapT = THREE.ClampToEdgeWrapping;
    var gGeo = new THREE.PlaneGeometry(1.4, 0.9).translate(0, 0.45, 0);
    var gGeo2 = gGeo.clone().rotateY(Math.PI / 2);
    var grassPts = [];
    for (var gi = 0; gi < 14000; gi++) {
      var gx = (rng() - .5) * 310, gz = (rng() - .5) * 310;
      if (polyDist(gx, gz, ROAD).d < 4.2) continue;
      if (Math.hypot(gx - POI.pond.x, gz - POI.pond.z) < POND_R - 3) continue;
      if (Math.hypot(gx - POI.bunker.x, gz - POI.bunker.z) < 7) continue;
      if (Math.abs(gx - POI.depot.x) < 22 && Math.abs(gz - POI.depot.z) < 20 && rng() < 0.7) continue;
      if (Z.fbm(gx * 0.03, gz * 0.03, 2) < 0.38 && rng() < 0.7) continue; // проплешины
      grassPts.push([gx, gz, 0.7 + rng() * 0.9, rng() * 3]);
    }
    var gMat = new THREE.MeshLambertMaterial({ map: gTex, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xc8c8a0 });
    [gGeo, gGeo2].forEach(function (geo) {
      var gim = new THREE.InstancedMesh(geo, gMat, grassPts.length);
      grassPts.forEach(function (g, i) {
        ps.set(g[0], Z.heightAt(g[0], g[1]) - 0.05, g[1]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), g[3]); sc.set(g[2], g[2] * (0.8 + (i % 5) * 0.1), g[2]);
        mtx.compose(ps, q, sc); gim.setMatrixAt(i, mtx);
        var v = 0.75 + (i % 7) * 0.05; col.setRGB(v, v, v * 0.9); gim.setColorAt(i, col);
      });
      root.add(gim);
    });

    // камыш у болота
    var reeds = [];
    for (var ri = 0; ri < 420; ri++) { var ra = rng() * 6.28, rd2 = POND_R - 6 + rng() * 9; reeds.push([POI.pond.x + Math.cos(ra) * rd2, POI.pond.z + Math.sin(ra) * rd2, 0.8 + rng() * 0.6]); }
    var reedIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.025, 1, 4).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8a8a52 }), reeds.length);
    reeds.forEach(function (r, i) { ps.set(r[0], Math.max(pondLevel - 0.3, Z.heightAt(r[0], r[1])), r[1]); q.setFromEuler(new THREE.Euler((i % 7 - 3) * 0.05, 0, (i % 5 - 2) * 0.06)); sc.set(1, r[2] * 1.6, 1); mtx.compose(ps, q, sc); reedIm.setMatrixAt(i, mtx); });
    root.add(reedIm);

    // ---------- постройки
    // Стены вдоль осей с проёмами: holes [{a, b, y0, y1}] вдоль стены
    function wallX(x0, x1, z, y, h, t, mat, holes) { // стена вдоль X
      var cuts = [x0].concat([].concat.apply([], (holes || []).map(function (o) { return [o.a, o.b]; }))).concat([x1]);
      for (var i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.01) box(cuts[i + 1] - cuts[i], h, t, mt(mat, cuts[i + 1] - cuts[i], h), (cuts[i] + cuts[i + 1]) / 2, y, z);
      (holes || []).forEach(function (o) {
        if (o.y0 > 0) box(o.b - o.a, o.y0, t, mt(mat, o.b - o.a, o.y0), (o.a + o.b) / 2, y, z);
        if (o.y1 < h) box(o.b - o.a, h - o.y1, t, mt(mat, o.b - o.a, h - o.y1), (o.a + o.b) / 2, y + o.y1, z);
      });
    }
    function wallZ(z0, z1, x, y, h, t, mat, holes) { // стена вдоль Z
      var cuts = [z0].concat([].concat.apply([], (holes || []).map(function (o) { return [o.a, o.b]; }))).concat([z1]);
      for (var i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.01) box(t, h, cuts[i + 1] - cuts[i], mt(mat, cuts[i + 1] - cuts[i], h), x, y, (cuts[i] + cuts[i + 1]) / 2);
      (holes || []).forEach(function (o) {
        if (o.y0 > 0) box(t, o.y0, o.b - o.a, mt(mat, o.b - o.a, o.y0), x, y, (o.a + o.b) / 2);
        if (o.y1 < h) box(t, h - o.y1, o.b - o.a, mt(mat, o.b - o.a, h - o.y1), x, y + o.y1, (o.a + o.b) / 2);
      });
    }
    // Двускатная крыша над прямоугольником (конёк вдоль X): выдавленный треугольник
    function gableRoof(cx, cz, w, d, y, rise, mat) {
      var sh = new THREE.Shape(), o = d / 2 + 0.4;
      sh.moveTo(-o, 0); sh.lineTo(o, 0); sh.lineTo(0, rise); sh.lineTo(-o, 0);
      var L = w + 0.6, geo = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
      geo.rotateY(-Math.PI / 2); geo.translate(L / 2, 0, 0);
      var uv = geo.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
      var m = new THREE.Mesh(geo, mat); m.position.set(cx, y, cz); m.castShadow = true; m.receiveShadow = true;
      root.add(m); W.solids.push(m);
    }

    // Деревенский дом. door: 'n'|'s'|'e'|'w'
    function house(cx, cz, w, d, mat, door, seed) {
      var r = Z.rng(seed), y = Z.heightAt(cx, cz), H = 2.8, t = 0.25;
      box(w + 0.6, 0.9, d + 0.6, mt('concrete', w, 1), cx, y - 0.6, cz); // фундамент
      box(w - 0.1, 0.06, d - 0.1, mt('wood', w, d), cx, y + 0.3, cz, 0, false); // пол
      var fy = y + 0.3, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      function win(a, b) { return { a: a, b: b, y0: 0.9, y1: 2.0 }; }
      function dr(a) { return { a: a - 0.55, b: a + 0.55, y0: 0, y1: 2.1 }; }
      var hN = [win(cx - w / 4 - 0.5, cx - w / 4 + 0.5), win(cx + w / 4 - 0.5, cx + w / 4 + 0.5)];
      var hS = hN.slice(), hE = [win(cz - 0.5, cz + 0.5)], hW = hE.slice();
      if (door === 'n') hN = [dr(cx + 0.2), win(cx - w / 4 - 0.9, cx - w / 4 + 0.1)];
      if (door === 's') hS = [dr(cx + 0.2), win(cx + w / 4 - 0.1, cx + w / 4 + 0.9)];
      if (door === 'e') hE = [dr(cz)];
      if (door === 'w') hW = [dr(cz)];
      wallX(x0, x1, z0, fy, H, t, mat, hN); wallX(x0, x1, z1, fy, H, t, mat, hS);
      wallZ(z0 + t / 2, z1 - t / 2, x0, fy, H, t, mat, hW); wallZ(z0 + t / 2, z1 - t / 2, x1, fy, H, t, mat, hE);
      // крыша: иногда провалена
      var broken = r() < 0.3;
      if (!broken) gableRoof(cx, cz, w, d, fy + H, 1.7, M.roof);
      else { var bm = box(w * 0.6, 0.05, d * 0.7, M.roof, cx + 0.4, fy + H - 0.4, cz - 0.3, 0, false, false); bm.rotation.z = 0.35; bm.rotation.x = 0.2; }
      box(0.6, 1.6, 0.6, mt('brick', 0.6, 1.6), cx + w / 4, fy + H + 0.4, cz + d / 6, 0, false); // труба
      // внутри: печь, стол, кровать, шкаф
      box(1.2, 1.6, 1.0, mt('plaster', 1.2, 1.6), x0 + 0.9, fy, z0 + 0.8);
      box(1.2, 0.08, 0.7, M.woodDark, cx, fy + 0.72, cz, 0.2, false);
      box(0.08, 0.72, 0.08, M.woodDark, cx - 0.5, fy, cz - 0.25, 0, false); box(0.08, 0.72, 0.08, M.woodDark, cx + 0.5, fy, cz + 0.25, 0, false);
      box(0.9, 0.45, 1.9, M.rust, x1 - 0.7, fy, z1 - 1.2);
      if (r() < 0.6) box(0.9, 1.8, 0.45, M.woodDark, x1 - 0.6, fy, z0 + 0.4);
      if (r() < 0.5) box(0.5, 0.5, 0.5, M.crate, x0 + 0.6, fy, z1 - 0.6, r());
      // забор из штакетника
      var fr = 3.5, fx0 = x0 - fr, fx1 = x1 + fr, fz0 = z0 - fr, fz1 = z1 + fr;
      function picket(ax, az, bx, bz) {
        var L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.18);
        for (var i = 0; i < n; i++) {
          if (r() < 0.22) continue; // выбитые доски
          var px = ax + (bx - ax) * i / n, pz = az + (bz - az) * i / n, hh = 1.0 + r() * 0.35;
          var m = box(0.1, hh, 0.03, M.woodDark, px, Z.heightAt(px, pz) - 0.05, pz, Math.atan2(bx - ax, bz - az) + Math.PI / 2, false, false);
          m.rotation.z = (r() - .5) * 0.25; m.castShadow = false;
        }
        var ang = Math.atan2(bz - az, bx - ax);
        box(L, 0.07, 0.05, M.woodDark, (ax + bx) / 2, Z.heightAt((ax + bx) / 2, (az + bz) / 2) + 0.75, (az + bz) / 2, -ang, false, false);
      }
      picket(fx0, fz0, fx1, fz0); picket(fx1, fz0, fx1, fz1); picket(fx0, fz1, cx - 1.5, fz1); picket(cx + 1.5, fz1, fx1, fz1); picket(fx0, fz0, fx0, fz1);
      W.npcSpots.push({ x: cx, z: cz, y: fy });
    }

    // ---------- Бункер торговца
    (function () {
      var c = POI.bunker, y = Z.heightAt(c.x, c.z), w = 9, d = 8, H = 3;
      var x0 = c.x - w / 2, x1 = c.x + w / 2, z0 = c.z - d / 2, z1 = c.z + d / 2, t = 0.5;
      box(w + 1, 0.4, d + 1, mt('concrete', w, d), c.x, y - 0.3, c.z);
      wallX(x0, x1, z0, y, H, t, 'concreteBig', [{ a: c.x - 0.8, b: c.x + 0.8, y0: 0, y1: 2.2 }]);
      wallX(x0, x1, z1, y, H, t, 'concreteBig');
      wallZ(z0, z1, x0, y, H, t, 'concreteBig'); wallZ(z0, z1, x1, y, H, t, 'concreteBig');
      box(w + 1.2, 0.5, d + 1.2, mt('concrete', w, d), c.x, y + H, c.z); // перекрытие
      // земляная обваловка на крыше
      var mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, 6.283, 0, 1.4), new THREE.MeshLambertMaterial({ map: Z.tex('ground', 4), color: 0x9a9a80 }));
      mound.scale.set(w * 0.75, 1.6, d * 0.75); mound.position.set(c.x, y + H + 0.3, c.z + 0.5); mound.receiveShadow = true; root.add(mound);
      // козырёк и мешки у входа
      box(3.2, 0.2, 1.6, M.concrete, c.x, y + 2.5, z0 - 0.8, 0, false);
      for (var i = 0; i < 6; i++) box(0.9, 0.35, 0.5, M.sand, c.x - 2.6 + (i % 3) * 0.95 - (i > 2 ? 0.45 : 0), y + Math.floor(i / 3) * 0.36, z0 - 2.4, 0.05 * i);
      // внутри: прилавок, полки, ящики, лампа
      box(4.5, 1.05, 0.7, M.woodDark, c.x, y, c.z + 1.4);
      box(4.6, 0.08, 0.9, M.wood, c.x, y + 1.05, c.z + 1.4, 0, false);
      box(3.5, 2.2, 0.5, M.woodDark, c.x, y, z1 - 0.6);
      for (var s = 0; s < 3; s++) box(3.4, 0.05, 0.55, M.wood, c.x, y + 0.6 + s * 0.6, z1 - 0.9, 0, false);
      box(0.8, 0.6, 0.6, M.crate, x0 + 0.9, y, z1 - 1); box(0.7, 0.5, 0.6, M.crate, x0 + 0.9, y + 0.6, z1 - 1.1, 0.3);
      box(0.6, 0.9, 0.6, M.metalBox, x1 - 0.8, y, z0 + 1.0);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M.lamp); bulb.position.set(c.x, y + H - 0.25, c.z); root.add(bulb);
      var lamp = new THREE.PointLight(0xffc27a, 1.3, 12, 2); lamp.position.set(c.x, y + H - 0.4, c.z); root.add(lamp);
      W.lights.push({ light: lamp, base: 1.3, flicker: 0.15 });
      W.trader = { x: c.x, z: c.z + 2.4, y: y, face: Math.PI }; // стоит за прилавком, смотрит на север
      W.spawn = { x: c.x - 0.6, z: c.z - 0.4, yaw: Math.PI }; // лицом к выходу (на север)
      W.markers.push({ x: c.x, z: c.z, label: 'Торговец', kind: 'trader' });
    })();

    // ---------- Деревня новичков
    (function () {
      var v = POI.village;
      house(v.x - 18, v.z - 14, 7, 6, 'plaster', 's', 3);
      house(v.x + 4, v.z - 18, 8, 6, 'wood', 's', 4);
      house(v.x + 20, v.z + 2, 6, 7, 'wood', 'w', 5);
      house(v.x - 20, v.z + 12, 7, 6, 'plaster', 'e', 6);
      house(v.x + 2, v.z + 20, 7, 6, 'wood', 'n', 7);
      // колодец-журавль, сарай, костёр
      var y = Z.heightAt(v.x - 6, v.z + 3);
      cyl(0.7, 0.8, M.concrete, v.x - 6, y + 0.4, v.z + 3);
      box(0.15, 3.2, 0.15, M.woodDark, v.x - 7.2, y, v.z + 3, 0, false);
      var beam = box(4.5, 0.1, 0.1, M.woodDark, v.x - 7.2, y + 3.1, v.z + 3, 0, false); beam.rotation.z = 0.5;
      var fx = v.x + 3, fz = v.z + 2, fy = Z.heightAt(fx, fz);
      for (var i = 0; i < 5; i++) { var lg = cyl(0.08, 1.0, M.woodDark, fx + Math.cos(i * 1.25) * 0.25, fy + 0.1, fz + Math.sin(i * 1.25) * 0.25, Math.PI / 2, 0); lg.rotation.y = i * 1.25; lg.rotation.order = 'YXZ'; }
      for (var j = 0; j < 8; j++) cyl(0.12, 0.15, M.concrete, fx + Math.cos(j * 0.8) * 0.75, fy + 0.07, fz + Math.sin(j * 0.8) * 0.75);
      W.fires.push({ x: fx, y: fy, z: fz });
      // брёвна-скамейки и сталкеры вокруг
      [[0, 0.8], [2.2, 0.9], [4.2, 0.7]].forEach(function (p, k) {
        var a = p[0], bx = fx + Math.cos(a) * 2.2, bz = fz + Math.sin(a) * 2.2;
        var log = cyl(0.22, 1.8, M.woodDark, bx, Z.heightAt(bx, bz) + 0.2, bz, 0, Math.PI / 2); log.rotation.y = a + Math.PI / 2; log.rotation.order = 'YXZ';
        W.stalkers.push({ x: bx, z: bz, face: Math.atan2(fx - bx, fz - bz), sit: true, name: ['Сталкер Вова', 'Сталкер Жека', 'Сталкер Лис'][k] });
      });
      W.stalkers.push({ x: v.x - 2, z: v.z - 8, face: 0.5, sit: false, name: 'Часовой Петрович' });
      // брошенный трактор
      var tx = v.x + 14, tz = v.z - 4, ty = Z.heightAt(tx, tz);
      box(2.2, 1.3, 1.6, M.rust, tx, ty + 0.7, tz); box(1.4, 1.5, 1.5, M.rust, tx - 1.4, ty + 0.7, tz);
      box(1.2, 0.05, 1.4, M.glass, tx - 1.4, ty + 2.2, tz, 0, false);
      cyl(0.8, 0.4, M.tire, tx - 1.5, ty + 0.8, tz + 1.0, Math.PI / 2); cyl(0.8, 0.4, M.tire, tx - 1.5, ty + 0.8, tz - 1.0, Math.PI / 2);
      cyl(0.5, 0.35, M.tire, tx + 0.9, ty + 0.5, tz + 0.9, Math.PI / 2); cyl(0.5, 0.35, M.tire, tx + 0.9, ty + 0.5, tz - 0.9, Math.PI / 2);
      W.markers.push({ x: v.x, z: v.z, label: 'Деревня', kind: 'camp' });
    })();

    // ---------- Машина (легковушка/грузовик) — остов
    function car(x, z, ry, kind, mat) {
      var y = Z.heightAt(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
      function b(w, h, d, m, px, py, pz) { var mm = new THREE.Mesh(GB, m); mm.scale.set(w, h, d); mm.position.set(px, py + h / 2, pz); mm.castShadow = true; mm.receiveShadow = true; g.add(mm); W.solids.push(mm); return mm; }
      function wheel(px, pz, r) { var mm = new THREE.Mesh(GC, M.tire); mm.scale.set(r * 2, 0.3, r * 2); mm.rotation.x = Math.PI / 2; mm.position.set(px, r * 0.8, pz); g.add(mm); }
      mat = mat || M.rust;
      if (kind === 'truck') {
        b(2.4, 1.2, 2.2, mat, 0, 0.7, -2.6); b(2.2, 1.4, 2.0, mat, 0, 1.9, -2.6); b(2.0, 0.6, 0.05, M.glass, 0, 2.5, -3.62);
        b(2.5, 0.3, 5.2, mat, 0, 0.9, 1.0); b(2.5, 1.2, 0.1, M.wood, 0, 1.2, 3.55); b(0.1, 1.2, 5.2, M.wood, -1.2, 1.2, 1.0); b(0.1, 1.2, 5.2, M.wood, 1.2, 1.2, 1.0);
        wheel(-1.15, -2.6, 0.55); wheel(1.15, -2.6, 0.55); wheel(-1.15, 1.6, 0.55); wheel(1.15, 1.6, 0.55); wheel(-1.15, 2.8, 0.55);
      } else if (kind === 'bus') {
        b(2.5, 2.3, 9, mat, 0, 0.5, 0);
        for (var i = -3; i < 4; i++) { b(0.06, 0.8, 0.9, M.glass, 1.26, 1.7, i * 1.15); b(0.06, 0.8, 0.9, M.glass, -1.26, 1.7, i * 1.15); }
        wheel(-1.15, -3, 0.55); wheel(1.15, -3, 0.55); wheel(-1.15, 3, 0.55);
      } else if (kind === 'btr') {
        b(2.8, 1.4, 7.2, M.army, 0, 0.7, 0);
        var nose = b(2.8, 0.9, 1.4, M.army, 0, 0.75, -4.0); nose.rotation.x = 0.5;
        b(1.4, 0.7, 1.4, M.army, 0, 2.1, -0.8); b(0.12, 0.12, 2.4, M.dark, 0, 2.45, -2.6);
        for (var k = 0; k < 4; k++) { wheel(-1.45, -2.6 + k * 1.75, 0.6); wheel(1.45, -2.6 + k * 1.75, 0.6); }
      } else { // легковушка «Жигули»
        b(1.6, 0.7, 4.1, mat, 0, 0.35, 0); b(1.5, 0.6, 2.0, mat, 0, 1.05, 0.15);
        b(1.4, 0.5, 0.04, M.glass, 0, 1.1, -0.86);
        wheel(-0.75, -1.3, 0.32); wheel(0.75, -1.3, 0.32); wheel(-0.75, 1.3, 0.32);
      }
      // коллайдер по габариту
      var dims = kind === 'truck' ? [2.5, 6.6] : kind === 'bus' ? [2.6, 9] : kind === 'btr' ? [3, 8.6] : [1.7, 4.2];
      var c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), hw = (dims[0] * c + dims[1] * s) / 2, hd = (dims[0] * s + dims[1] * c) / 2;
      addCollider(x - hw, x + hw, y - 1, y + (kind === 'car' ? 1.4 : 2.6), z - hd, z + hd);
      return g;
    }

    // ---------- АТП
    (function () {
      var c = POI.depot, y = Z.heightAt(c.x, c.z), w = 50, d = 44, x0 = c.x - w / 2, x1 = c.x + w / 2, z0 = c.z - d / 2, z1 = c.z + d / 2;
      // бетонный забор из плит (ПО-2), ворота на юге
      wallX(x0, x1, z0, y - 0.3, 2.8, 0.25, 'concreteBig');
      wallX(x0, x1, z1, y - 0.3, 2.8, 0.25, 'concreteBig', [{ a: c.x - 4, b: c.x + 4, y0: 0, y1: 9 }, { a: x1 - 9, b: x1 - 6, y0: 0, y1: 9 }]);
      wallZ(z0, z1, x0, y - 0.3, 2.8, 0.25, 'concreteBig', [{ a: c.z + 4, b: c.z + 7, y0: 0, y1: 9 }]);
      wallZ(z0, z1, x1, y - 0.3, 2.8, 0.25, 'concreteBig');
      // распахнутая створка ворот
      var gate = box(4, 2.2, 0.08, M.army, c.x - 5.8, y, z1 + 1.6, 1.1, true); gate.position.y = y + 1.2;
      // контора: кирпич, 2 комнаты
      var ox = c.x - 12, oz = c.z - 10, ow = 14, od = 8, H = 3.2, t = 0.3;
      box(ow + 0.4, 0.5, od + 0.4, mt('concrete', ow, od), ox, y - 0.3, oz);
      wallX(ox - ow / 2, ox + ow / 2, oz - od / 2, y + 0.2, H, t, 'brick', [{ a: ox - 4, b: ox - 2.6, y0: 1, y1: 2.2 }, { a: ox + 2.6, b: ox + 4, y0: 1, y1: 2.2 }]);
      wallX(ox - ow / 2, ox + ow / 2, oz + od / 2, y + 0.2, H, t, 'brick', [{ a: ox - 0.6, b: ox + 0.6, y0: 0, y1: 2.2 }, { a: ox - 5, b: ox - 3.6, y0: 1, y1: 2.2 }, { a: ox + 3.6, b: ox + 5, y0: 1, y1: 2.2 }]);
      wallZ(oz - od / 2, oz + od / 2, ox - ow / 2, y + 0.2, H, t, 'brick', [{ a: oz - 1, b: oz + 0.4, y0: 1, y1: 2.2 }]);
      wallZ(oz - od / 2, oz + od / 2, ox + ow / 2, y + 0.2, H, t, 'brick');
      wallZ(oz - od / 2, oz + od / 2, ox + 1, y + 0.2, H, 0.2, 'plaster', [{ a: oz + 0.5, b: oz + 1.5, y0: 0, y1: 2.1 }]);
      box(ow + 0.6, 0.3, od + 0.6, mt('concrete', ow, od), ox, y + 0.2 + H, oz);
      box(1.6, 0.8, 0.8, M.woodDark, ox - 3, y + 0.2, oz - 2.5); box(0.6, 1.9, 0.5, M.metalBox, ox + 6, y + 0.2, oz - 3.3);
      // ангар
      var hx = c.x + 12, hz = c.z - 8, hw = 18, hd = 13, HH = 6;
      wallX(hx - hw / 2, hx + hw / 2, hz - hd / 2, y, HH, 0.3, 'brick');
      wallZ(hz - hd / 2, hz + hd / 2, hx - hw / 2, y, HH, 0.3, 'brick');
      wallZ(hz - hd / 2, hz + hd / 2, hx + hw / 2, y, HH, 0.3, 'brick', [{ a: hz - 2, b: hz + 1, y0: 0, y1: 2.4 }]);
      wallX(hx - hw / 2, hx - hw / 2 + 2, hz + hd / 2, y, HH, 0.3, 'brick'); wallX(hx + hw / 2 - 2, hx + hw / 2, hz + hd / 2, y, HH, 0.3, 'brick');
      box(hw - 4, 1.6, 0.3, mt('brick', hw, 1.6), hx, y + HH - 1.6, hz + hd / 2);
      var rf = new THREE.Mesh(new THREE.CylinderGeometry(hw / 2 + 0.3, hw / 2 + 0.3, hd + 0.4, 24, 1, true, -Math.PI / 2, Math.PI), M.rustRoof);
      rf.rotation.x = Math.PI / 2; rf.rotation.y = 0; rf.scale.set(1, 1, 0.28); rf.rotation.z = 0;
      rf.position.set(hx, y + HH, hz); rf.castShadow = true; root.add(rf);
      car(hx - 3, hz + 1, 0.1, 'truck'); car(hx + 4.5, hz - 1, -0.05, 'truck', M.army);
      // двор: бочки, шины, ящики, костёр бандитов
      for (var bI = 0; bI < 9; bI++) cyl(0.3, 0.9, bI % 3 ? M.rust : M.army, c.x + 18 + (bI % 3) * 0.7, y + 0.45, c.z + 12 + Math.floor(bI / 3) * 0.7);
      for (var tI = 0; tI < 6; tI++) { var ti = cyl(0.45, 0.25, M.tire, c.x - 20, y + 0.13 + tI * 0.26, c.z + 14); ti.rotation.y = tI; }
      box(1.2, 0.8, 0.8, M.crate, c.x + 4, y, c.z + 6, 0.3); box(1, 0.7, 0.8, M.crate, c.x + 5.3, y, c.z + 6.4, -0.2); box(0.9, 0.7, 0.8, M.crate, c.x + 4.6, y + 0.8, c.z + 6.2, 0.6);
      car(c.x - 16, c.z + 8, 1.2, 'car'); car(c.x + 2, c.z + 15, -0.4, 'bus');
      var ffx = c.x - 4, ffz = c.z + 4; W.fires.push({ x: ffx, y: y, z: ffz });
      for (var j = 0; j < 7; j++) cyl(0.1, 0.12, M.concrete, ffx + Math.cos(j) * 0.6, y + 0.06, ffz + Math.sin(j) * 0.6);
      // вышка
      var wx = x0 + 4, wz = z0 + 4;
      for (var l = 0; l < 4; l++) box(0.15, 5, 0.15, M.woodDark, wx + (l % 2 ? 1.2 : -1.2), y, wz + (l > 1 ? 1.2 : -1.2), 0, false);
      box(3, 0.15, 3, M.wood, wx, y + 5, wz); box(3, 1, 0.08, M.wood, wx, y + 5.15, wz - 1.5, 0, false); box(3, 1, 0.08, M.wood, wx, y + 5.15, wz + 1.5, 0, false);
      gableRoof(wx, wz, 3, 3, y + 6.2, 0.8, M.roof);
      // бандиты: позиции
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
      var c = POI.check, y = Z.heightAt(c.x, c.z);
      // бетонные блоки «змейкой»
      for (var i = 0; i < 6; i++) box(2, 0.9, 0.8, M.concrete, c.x - 7 + (i % 2) * 3, y, c.z - 10 + i * 2.2);
      for (var k = 0; k < 4; k++) box(2, 0.9, 0.8, M.concrete, c.x + 8, Z.heightAt(c.x + 8, c.z - 6 + k * 2.1), c.z - 6 + k * 2.1, Math.PI / 2);
      // будка
      var bx = c.x - 6, bz = c.z + 3;
      wallX(bx - 1.5, bx + 1.5, bz - 1.5, y, 2.5, 0.12, 'plaster', [{ a: bx - 0.8, b: bx + 0.8, y0: 1, y1: 2 }]);
      wallX(bx - 1.5, bx + 1.5, bz + 1.5, y, 2.5, 0.12, 'plaster', [{ a: bx - 0.4, b: bx + 0.4, y0: 0, y1: 2.1 }]);
      wallZ(bz - 1.5, bz + 1.5, bx - 1.5, y, 2.5, 0.12, 'plaster'); wallZ(bz - 1.5, bz + 1.5, bx + 1.5, y, 2.5, 0.12, 'plaster', [{ a: bz - 0.8, b: bz + 0.8, y0: 1, y1: 2 }]);
      box(3.4, 0.15, 3.4, M.rust, bx, y + 2.5, bz);
      // шлагбаум
      box(0.3, 1.1, 0.3, M.concrete, c.x - 3.6, y, c.z);
      var bar = box(7, 0.12, 0.12, M.sign, c.x - 0.3, y + 0.95, c.z, 0, false); bar.rotation.z = 0.35;
      // табличка
      var sg = box(2.6, 0.65, 0.05, M.sign, c.x - 6, y + 2.6, c.z + 1.42, 0, false); sg.position.y = y + 2.9;
      // мешки с песком полукругом
      for (var s = 0; s < 14; s++) { var a = -1.2 + s * 0.18, rx = c.x + 4 + Math.cos(a) * 3, rz = c.z + 6 + Math.sin(a) * 3; box(0.9, 0.38, 0.5, M.sand, rx, Z.heightAt(rx, rz) + (s % 2) * 0.37, rz, a + Math.PI / 2); }
      // БТР
      car(c.x + 10, c.z + 10, 0.6, 'btr');
      W.boxes.push({ x: c.x + 11.5, y: y, z: c.z + 7.2, items: { flash: 1, ammo9: 16, bandage: 2 }, label: 'Ящик у БТР', quest: 'flash' });
      W.markers.push({ x: c.x, z: c.z, label: 'Блокпост', kind: 'poi' });
    })();

    // ---------- Кладбище техники (радиация)
    (function () {
      var c = POI.cars, r = Z.rng(77);
      var kinds = ['car', 'car', 'truck', 'bus', 'car', 'truck', 'car', 'btr', 'car', 'car'];
      kinds.forEach(function (k, i) {
        var a = i * 0.63 + r(), d = 4 + r() * 11;
        car(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, r() * 6.28, k, k === 'btr' ? M.army : M.rust);
      });
      // таблички радиации
      [[c.x + 15, c.z + 6], [c.x - 14, c.z - 8], [c.x + 3, c.z + 16]].forEach(function (p) {
        var py = Z.heightAt(p[0], p[1]);
        box(0.08, 1.6, 0.08, M.dark, p[0], py, p[1], 0, false);
        var s = box(0.6, 0.6, 0.03, M.radSign, p[0], py + 1.3, p[1], Math.atan2(c.x - p[0], c.z - p[1]), false); s.position.y = py + 1.6;
      });
      W.radZones.push({ x: c.x, z: c.z, r: 15, power: 7 });
      W.markers.push({ x: c.x, z: c.z, label: 'Кладбище техники', kind: 'rad' });
    })();

    // ---------- Железная дорога
    (function () {
      var z = POI.rail.z, sleepers = [];
      for (var x = -158; x < 158; x += 0.9) sleepers.push(x);
      var sim = new THREE.InstancedMesh(GB, M.woodDark, sleepers.length);
      sleepers.forEach(function (x, i) { ps.set(x, Z.heightAt(x, z) + 0.06, z); q.set(0, 0, 0, 1); sc.set(0.25, 0.14, 2.6); mtx.compose(ps, q, sc); sim.setMatrixAt(i, mtx); });
      sim.receiveShadow = true; root.add(sim);
      // рельсы сегментами по рельефу
      for (var xs = -158; xs < 158; xs += 4) {
        var y0 = Z.heightAt(xs, z) + 0.2, y1 = Z.heightAt(xs + 4, z) + 0.2;
        for (var side = -1; side <= 1; side += 2) {
          var rm = new THREE.Mesh(GB, M.rail); rm.scale.set(Math.hypot(4, y1 - y0), 0.12, 0.08);
          rm.position.set(xs + 2, (y0 + y1) / 2, z + side * 0.75); rm.rotation.z = Math.atan2(y1 - y0, 4); root.add(rm);
        }
      }
      // вагоны
      function wagon(x, tank) {
        var y = Z.heightAt(x, z) + 0.3;
        if (tank) { var t = cyl(1.4, 9, M.rust, x, y + 2.1, z, 0, Math.PI / 2); W.solids.push(t); box(10, 0.4, 2.6, M.dark, x, y + 0.5, z, 0, false); }
        else { box(12, 3.2, 3, mt('rust', 12, 3.2), x, y + 0.9, z); box(2.4, 2.6, 0.06, M.dark, x, y + 1.1, z + 1.52, 0, false); }
        cyl(0.45, 0.25, M.dark, x - 3.5, y + 0.45, z + 0.8, Math.PI / 2); cyl(0.45, 0.25, M.dark, x + 3.5, y + 0.45, z + 0.8, Math.PI / 2);
        addCollider(x - 6, x + 6, y - 1, y + 4, z - 1.6, z + 1.6);
      }
      wagon(-40); wagon(-27); wagon(-14, true); wagon(60, true); wagon(73);
      W.markers.push({ x: -27, z: z, label: 'Вагоны', kind: 'poi' });
    })();

    // ---------- ЛЭП
    (function () {
      var A = [-158, -36], B = [158, -18], n = 10, tops = [];
      for (var i = 0; i <= n; i++) {
        var x = Z.lerp(A[0], B[0], i / n), z = Z.lerp(A[1], B[1], i / n), y = Z.heightAt(x, z);
        if (Math.abs(x - POI.depot.x) < 28 && Math.abs(z - POI.depot.z) < 25) continue;
        var pole = box(0.35, 11, 0.35, M.concrete, x, y - 0.5, z, 0, true);
        var cross = box(0.25, 0.25, 4.5, M.concrete, x, y + 9.6, z, 0, false);
        if (i === 3) { pole.rotation.z = 0.18; cross.rotation.z = 0.18; cross.position.x += 1.4; } // покосившаяся опора
        tops.push([x, y + 9.8, z]);
      }
      for (var k = 0; k < tops.length - 1; k++) for (var s = -1; s <= 1; s++) {
        var a = tops[k], b = tops[k + 1], pts = [];
        for (var j = 0; j <= 12; j++) { var t = j / 12; pts.push(new THREE.Vector3(Z.lerp(a[0], b[0], t), Z.lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 1.6, Z.lerp(a[2], b[2], t) + s * 2)); }
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.wire));
      }
    })();

    // ---------- аномалии и артефакты
    var P = POI.pond;
    W.anomalies = [
      { type: 'voronka', x: P.x - 22, z: P.z + 8, r: 3.2 },
      { type: 'voronka', x: P.x + 10, z: P.z - 25, r: 3.0 },
      { type: 'electra', x: P.x - 16, z: P.z - 14, r: 2.6 },
      { type: 'electra', x: P.x + 25, z: P.z + 4, r: 2.6 },
      { type: 'zharka', x: P.x - 4, z: P.z - 26, r: 2.2 },
      { type: 'zharka', x: P.x + 20, z: P.z + 20, r: 2.2 },
      { type: 'electra', x: POI.cars.x + 3, z: POI.cars.z - 2, r: 2.4 },
      { type: 'voronka', x: 10, z: 70, r: 3 },
      { type: 'zharka', x: -40, z: -80, r: 2.2 }
    ];
    W.anomalies.forEach(function (a) { a.y = Math.max(Z.heightAt(a.x, a.z), pondLevel + 0.02); });
    W.artifacts = [
      { name: 'Капля', price: 1800, x: P.x - 20, z: P.z + 6.5, color: 0xff9a3c },
      { name: 'Искра', price: 2500, x: P.x - 15, z: P.z - 12.5, color: 0x7fd4ff },
      { name: 'Пузырь', price: 3200, x: P.x + 9, z: P.z - 23, color: 0xb3ff6a },
      { name: 'Кристалл', price: 4000, x: POI.cars.x + 2, z: POI.cars.z, color: 0xff4f6a },
      { name: 'Колючка', price: 1500, x: P.x + 22, z: P.z + 19, color: 0xd8d0ff }
    ];
    W.artifacts.forEach(function (a) { a.y = Math.max(Z.heightAt(a.x, a.z), pondLevel) + 0.25; });
    W.radZones.push({ x: P.x, z: P.z, r: 14, power: 2.5 });
    W.radZones.push({ x: 60, z: POI.rail.z, r: 8, power: 4 });

    // стая псов
    W.dogs = [{ x: 64, z: 72 }, { x: 66, z: 76 }, { x: 60, z: 77 }, { x: 70, z: 70 }, { x: -60, z: -70 }, { x: -64, z: -72 }];
    W.markers.push({ x: P.x, z: P.z, label: 'Аномалии', kind: 'anomaly' });

    return W;
  };

  // ---------- модели персонажей
  // opts: { jacket, pants, head, hood, mask }
  Z.makeHuman = function (o) {
    o = o || {};
    var g = new THREE.Group();
    var jm = new THREE.MeshLambertMaterial({ color: o.jacket || 0x4a4a3a, map: Z.tex('paintMetal', 1) });
    var pm = new THREE.MeshLambertMaterial({ color: o.pants || 0x3a3a34 });
    var sm = new THREE.MeshLambertMaterial({ color: o.skin || 0xc8a080 });
    var dm = new THREE.MeshLambertMaterial({ color: 0x1e1e1c });
    function B(w, h, d, m) { var mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.castShadow = true; return mm; }
    var hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
    var torso = B(0.48, 0.62, 0.28, jm); torso.position.y = 0.36; hips.add(torso);
    var pack = B(0.36, 0.42, 0.18, dm); pack.position.set(0, 0.4, -0.22); hips.add(pack);
    var neck = new THREE.Group(); neck.position.y = 0.72; hips.add(neck);
    var head = B(0.22, 0.26, 0.24, o.mask ? dm : sm); head.position.y = 0.14; neck.add(head);
    if (o.hood) { var hood = B(0.28, 0.3, 0.3, jm); hood.position.set(0, 0.17, -0.02); hood.scale.set(1, 1, 1); neck.add(hood); var face = B(0.2, 0.2, 0.02, o.mask ? dm : sm); face.position.set(0, 0.13, 0.14); neck.add(face); }
    if (o.mask) { var gm = B(0.12, 0.08, 0.08, new THREE.MeshLambertMaterial({ color: 0x555555 })); gm.position.set(0, 0.08, 0.14); neck.add(gm); }
    function limb(w, h, m, x, y, parent) { var p = new THREE.Group(); p.position.set(x, y, 0); var mm = B(w, h, w, m); mm.position.y = -h / 2; p.add(mm); parent.add(p); return p; }
    var legL = limb(0.18, 0.92, pm, -0.12, 0, hips), legR = limb(0.18, 0.92, pm, 0.12, 0, hips);
    var armL = limb(0.13, 0.62, jm, -0.32, 0.62, hips), armR = limb(0.13, 0.62, jm, 0.32, 0.62, hips);
    // автомат в руках
    var gun = new THREE.Group();
    var gb = B(0.06, 0.1, 0.7, dm); gb.position.z = 0.25; gun.add(gb);
    var mag = B(0.05, 0.18, 0.08, dm); mag.position.set(0, -0.12, 0.25); mag.rotation.x = 0.3; gun.add(mag);
    var stock = B(0.05, 0.12, 0.25, new THREE.MeshLambertMaterial({ color: 0x5a3a24 })); stock.position.z = -0.18; gun.add(stock);
    gun.position.set(0.1, 0.42, 0.3); hips.add(gun);
    return { group: g, hips: hips, torso: torso, neck: neck, legL: legL, legR: legR, armL: armL, armR: armR, gun: gun };
  };

  Z.makeDog = function () {
    var g = new THREE.Group();
    var m = new THREE.MeshLambertMaterial({ color: 0x6a5a48, map: Z.tex('bark', 1) });
    var pink = new THREE.MeshLambertMaterial({ color: 0x9a6a5a });
    function B(w, h, d, mm) { var x = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mm); x.castShadow = true; return x; }
    var body = B(0.38, 0.4, 1.0, m); body.position.y = 0.62; g.add(body);
    var head = new THREE.Group(); head.position.set(0, 0.78, 0.55); g.add(head);
    var skull = B(0.28, 0.28, 0.32, pink); head.add(skull);
    var snout = B(0.18, 0.15, 0.24, pink); snout.position.set(0, -0.05, 0.25); head.add(snout);
    function leg(x, z) { var p = new THREE.Group(); p.position.set(x, 0.5, z); var l = B(0.1, 0.5, 0.1, m); l.position.y = -0.25; p.add(l); g.add(p); return p; }
    var legs = [leg(-0.14, 0.38), leg(0.14, 0.38), leg(-0.14, -0.38), leg(0.14, -0.38)];
    var tail = B(0.06, 0.06, 0.4, m); tail.position.set(0, 0.75, -0.66); tail.rotation.x = 0.5; g.add(tail);
    return { group: g, body: body, head: head, legs: legs };
  };
})(window.Z);
