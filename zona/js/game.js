/* Зона: Окраина — игровой цикл, игрок, оружие, NPC, аномалии, интерфейс. */
(function (Z) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  var SAVE_KEY = 'zona-okraina-save-v1';
  var EYE = 1.65, CROUCH_EYE = 1.05, R = 0.35;

  // ---------- рендер
  var renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  $('#stage').appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var FOG = new THREE.Color(0x8e9282);
  scene.fog = new THREE.FogExp2(FOG.clone().convertSRGBToLinear(), 0.0072);
  scene.background = FOG;
  var camera = new THREE.PerspectiveCamera(72, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // небо
  var sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.MeshBasicMaterial({ map: Z.TEX.sky(), side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  var hemi = new THREE.HemisphereLight(0xc4c8b4, 0x4a4436, 0.85); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xffe0b0, 1.05);
  sun.castShadow = true; sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  var sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  var SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.55).normalize();

  // фонарик
  var flash = new THREE.SpotLight(0xfff1d6, 0, 38, 0.42, 0.45, 1.4);
  flash.position.set(0.25, -0.15, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0, -0.05, -5);

  // оружие в руках — отдельная сцена
  var vScene = new THREE.Scene(), vCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  vScene.add(new THREE.HemisphereLight(0xd8d4c0, 0x3a3428, 1.1));
  var vSun = new THREE.DirectionalLight(0xffe0b0, 0.6); vSun.position.set(-1, 2, 1); vScene.add(vSun);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h); camera.aspect = vCam.aspect = w / h;
    vCam.fov = w < h ? 90 : 60;
    camera.updateProjectionMatrix(); vCam.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // Цвета материалов заданы в sRGB, а r128 при sRGB-выводе считает их линейными — переводим один раз
  function linearize(root) {
    root.traverse(function (o) {
      var ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach(function (m) {
        if (!m || m.userData.lin) return; m.userData.lin = true;
        if (m.color) m.color.convertSRGBToLinear();
        if (m.emissive) m.emissive.convertSRGBToLinear();
        if (m.specular) m.specular.convertSRGBToLinear();
      });
    });
  }

  // ---------- мир
  var W = null, colGrid = {};
  function gridKey(cx, cz) { return cx + ',' + cz; }
  function indexColliders() {
    colGrid = {};
    W.colliders.forEach(function (c) {
      for (var cx = Math.floor(c.x0 / 8); cx <= Math.floor(c.x1 / 8); cx++) for (var cz = Math.floor(c.z0 / 8); cz <= Math.floor(c.z1 / 8); cz++) {
        var k = gridKey(cx, cz); (colGrid[k] || (colGrid[k] = [])).push(c);
      }
    });
  }
  function nearColliders(x0, z0, x1, z1) {
    var out = [], seen = new Set();
    for (var cx = Math.floor(Math.min(x0, x1) / 8); cx <= Math.floor(Math.max(x0, x1) / 8); cx++)
      for (var cz = Math.floor(Math.min(z0, z1) / 8); cz <= Math.floor(Math.max(z0, z1) / 8); cz++) {
        var a = colGrid[gridKey(cx, cz)]; if (!a) continue;
        for (var i = 0; i < a.length; i++) if (!seen.has(a[i])) { seen.add(a[i]); out.push(a[i]); }
      }
    return out;
  }
  // земля под точкой: рельеф или верх коллайдера, на который можно встать
  function groundAt(x, z, feet, r) {
    var g = Z.heightAt(x, z);
    var cs = nearColliders(x - r, z - r, x + r, z + r);
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (x + r * 0.5 < c.x0 || x - r * 0.5 > c.x1 || z + r * 0.5 < c.z0 || z - r * 0.5 > c.z1) continue;
      if (c.y1 <= feet + 0.45 && c.y1 > g) g = c.y1;
    }
    return g;
  }
  function pushOut(p, feet, height, r) {
    var cs = nearColliders(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1);
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.y1 <= feet + 0.45 || c.y0 >= feet + height) continue;
      var qx = Z.clamp(p.x, c.x0, c.x1), qz = Z.clamp(p.z, c.z0, c.z1), dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d < 1e-5) {
          var l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b);
          if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
        } else { p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
      }
    }
    p.x = Z.clamp(p.x, -150, 150); p.z = Z.clamp(p.z, -150, 150);
  }
  // Прямая видимость: рельеф + коллайдеры (слэб-тест)
  function los(ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / 3);
    for (var i = 1; i < n; i++) { var t = i / n; if (Z.heightAt(ax + dx * t, az + dz * t) > ay + dy * t - 0.2) return false; }
    var cs = nearColliders(ax, az, bx, bz);
    for (var k = 0; k < cs.length; k++) {
      var c = cs[k], t0 = 0, t1 = 1;
      var ok = slab(ax, dx, c.x0, c.x1) && slab(ay, dy, c.y0, c.y1) && slab(az, dz, c.z0, c.z1);
      if (ok && t0 < t1 && t1 > 0.02 && t0 < 0.98) return false;
    }
    return true;
    function slab(o, d, mn, mx) {
      if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
      var a = (mn - o) / d, b = (mx - o) / d; if (a > b) { var tmp = a; a = b; b = tmp; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 <= t1;
    }
  }

  // ---------- данные
  var WEAPONS = {
    knife: { name: 'Нож', melee: true, dmg: 45, range: 2.0, cd: 0.55 },
    pm: { name: 'ПМ', mag: 8, ammo: 'ammo9', dmg: 30, cd: 0.22, spread: 0.014, aimSpread: 0.004, recoil: 0.035, reload: 1.5, sound: 'pm' },
    ak: { name: 'АК-74', mag: 30, ammo: 'ammo545', dmg: 36, cd: 0.1, auto: true, spread: 0.03, aimSpread: 0.008, recoil: 0.016, reload: 2.4, sound: 'ak' }
  };
  var ITEMS = {
    medkit: { name: 'Аптечка', use: function () { heal(55); }, price: 450 },
    bandage: { name: 'Бинт', use: function () { heal(18); }, price: 120 },
    bread: { name: 'Хлеб', use: function () { heal(8); P.stamina = 100; }, price: 60 },
    vodka: { name: 'Водка «Казаки»', use: function () { P.rad = Math.max(0, P.rad - 35); P.drunk = 8; }, price: 160 },
    antirad: { name: 'Антирад', use: function () { P.rad = 0; }, price: 550 },
    ammo9: { name: 'Патроны 9×18', price: 12 },
    ammo545: { name: 'Патроны 5,45×39', price: 18 },
    flash: { name: 'Флешка курьера', quest: true }
  };
  var SHOP = [['ammo9', 16], ['ammo545', 30], ['medkit', 1], ['bandage', 1], ['antirad', 1], ['vodka', 1], ['bread', 1]];
  var QUESTS = {
    art: { title: 'Артефакт для торговца', text: 'Найди на болоте к востоку от деревни любой артефакт и принеси торговцу. Аномалии проверяй болтами (G), артефакт покажет детектор.', reward: 1500, target: 'pond' },
    bandits: { title: 'Бандиты на АТП', text: 'На автопредприятии на северо-востоке засели бандиты. Зачисти территорию.', reward: 3000, target: 'depot' },
    flash: { title: 'Флешка курьера', text: 'Курьер погиб у старого блокпоста на юге. Флешка в ящике у брошенного БТР. Принеси её торговцу.', reward: 1200, target: 'check' }
  };

  // ---------- состояние
  var P, NPC = [], FX = [], bolts = [], artifacts = [], anomalies = [], boxes = [], fires = [];
  var state = 'loading', uiOpen = null, flags;

  function newPlayer() {
    return {
      pos: new THREE.Vector3(W.spawn.x, Z.heightAt(W.spawn.x, W.spawn.z), W.spawn.z), vy: 0, yaw: W.spawn.yaw, pitch: 0,
      hp: 100, stamina: 100, rad: 0, crouch: 0, onGround: true, drunk: 0,
      money: 600, items: { medkit: 1, bandage: 2, bread: 1, vodka: 1, antirad: 0, ammo9: 32, ammo545: 0, flash: 0 },
      arts: [], weapons: { knife: true, pm: { mag: 8 }, ak: null }, cur: 'pm',
      cd: 0, reloading: 0, aim: 0, recoil: 0, bob: 0, stepAcc: 0, flash: false,
      quests: { art: 'none', bandits: 'none', flash: 'none' }, metTrader: false
    };
  }

  // ---------- NPC
  function makeNPC(kind, x, z, opts) {
    opts = opts || {};
    var look = kind === 'bandit' ? { jacket: 0x2d2a26, pants: 0x262a30, hood: false, mask: Math.random() < 0.5 }
      : kind === 'trader' ? { jacket: 0x5a5244, pants: 0x3a3830, skin: 0xc09070 }
        : { jacket: [0x5c5a3e, 0x4a5240, 0x6a5e44][Math.floor(Math.random() * 3)], pants: 0x3d3b30, hood: true, mask: Math.random() < 0.3 };
    var m = Z.makeHuman(look);
    if (kind === 'trader') m.gun.visible = false;
    var y = opts.y !== undefined ? opts.y : Z.heightAt(x, z);
    m.group.position.set(x, y, z);
    W.root.add(m.group);
    var n = {
      kind: kind, m: m, pos: new THREE.Vector3(x, y, z), yaw: opts.face || 0, hp: kind === 'bandit' ? 100 : 100, dead: false,
      state: 'idle', patrol: opts.patrol || null, pi: 0, wait: Math.random() * 3, alert: 0, cd: 1 + Math.random(), burst: 0,
      losT: 0, sees: false, strafe: 1, strafeT: 0, walk: Math.random() * 6, sit: !!opts.sit, name: opts.name || '', tower: !!opts.tower,
      looted: false, idx: opts.idx, deathT: 0, lastSeen: null
    };
    m.group.traverse(function (o) { if (o.isMesh) o.userData.npc = n; });
    if (n.sit) { m.hips.position.y = 0.48; m.legL.rotation.x = -1.4; m.legR.rotation.x = -1.4; m.gun.rotation.x = 0.9; m.gun.position.y = 0.2; }
    NPC.push(n);
    return n;
  }
  function makeDogNPC(x, z) {
    var d = Z.makeDog(); var y = Z.heightAt(x, z); d.group.position.set(x, y, z); W.root.add(d.group);
    var n = { kind: 'dog', m: d, pos: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z), yaw: Math.random() * 6, hp: 45, dead: false, state: 'idle', wait: Math.random() * 3, cd: 0, walk: 0, target: null, deathT: 0, looted: true };
    d.group.traverse(function (o) { if (o.isMesh) o.userData.npc = n; });
    NPC.push(n); return n;
  }

  // ---------- эффекты
  var puffTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'); var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  function puff(pos, color, size, life, vel, additive) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: new THREE.Color(color).convertSRGBToLinear(), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0.8 }));
    s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
    FX.push({ obj: s, life: life, max: life, vel: vel || new THREE.Vector3(0, 0.4, 0), grow: size * 1.5 });
  }
  function tracer(a, b, color) {
    var g = new THREE.BufferGeometry().setFromPoints([a, b]);
    var l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: color || 0xffe2a0, transparent: true, opacity: 0.85 }));
    scene.add(l); FX.push({ obj: l, life: 0.06, max: 0.06, line: true });
  }

  // ---------- аномалии (визуал)
  function buildAnomalies() {
    anomalies = W.anomalies.map(function (a) {
      var g = new THREE.Group(); g.position.set(a.x, a.y, a.z); W.root.add(g);
      var A = { def: a, g: g, t: Math.random() * 10, active: 0, cd: 0, arcT: 1 + Math.random() * 3 };
      var n = a.type === 'voronka' ? 70 : a.type === 'electra' ? 50 : 30, pos = new Float32Array(n * 3), seed = [];
      for (var i = 0; i < n; i++) seed.push([Math.random() * 6.28, Math.random(), Math.random()]);
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var col = a.type === 'voronka' ? 0x8a8060 : a.type === 'electra' ? 0x9fd8ff : 0xff9a40;
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: a.type === 'voronka' ? 0.09 : 0.07, transparent: true, opacity: 0.8, depthWrite: false, blending: a.type === 'voronka' ? THREE.NormalBlending : THREE.AdditiveBlending }));
      g.add(pts); A.pts = pts; A.seed = seed;
      var decal = new THREE.Mesh(new THREE.CircleGeometry(a.r * (a.type === 'zharka' ? 0.8 : 0.6), 24), new THREE.MeshBasicMaterial({ color: a.type === 'zharka' ? 0x111008 : a.type === 'electra' ? 0x334455 : 0x2a2820, transparent: true, opacity: 0.45, depthWrite: false }));
      decal.rotation.x = -Math.PI / 2; decal.position.y = 0.05; g.add(decal);
      if (a.type === 'electra') { var pl = new THREE.PointLight(0x8fd0ff, 0.6, 7); pl.position.y = 1; g.add(pl); A.light = pl; }
      if (a.type === 'voronka') { // искажение — полупрозрачная «линза»
        var lens = new THREE.Mesh(new THREE.SphereGeometry(a.r * 0.55, 20, 12), new THREE.MeshPhongMaterial({ color: 0x9a9a88, transparent: true, opacity: 0.08, shininess: 120, specular: 0xffffff, depthWrite: false }));
        lens.position.y = 1; g.add(lens); A.lens = lens;
      }
      return A;
    });
  }
  function triggerAnomaly(A) {
    if (A.cd > 0) return;
    var a = A.def; A.active = a.type === 'zharka' ? 1.6 : a.type === 'electra' ? 0.35 : 1.2; A.cd = a.type === 'electra' ? 1.2 : 2.2;
    Z.Sound.anomaly(a.type, a.x, a.z);
    if (a.type === 'electra') arc(A, 6);
    if (a.type === 'zharka') for (var i = 0; i < 12; i++) puff(new THREE.Vector3(a.x + (Math.random() - .5), a.y + 0.3 + Math.random() * 2.5, a.z + (Math.random() - .5)), 0xff7a20, 0.9 + Math.random(), 0.6 + Math.random() * 0.6, new THREE.Vector3(0, 3, 0), true);
    if (a.type === 'voronka') for (var j = 0; j < 10; j++) puff(new THREE.Vector3(a.x + (Math.random() - .5) * 2, a.y + 0.3, a.z + (Math.random() - .5) * 2), 0x77705a, 1.4, 0.8, new THREE.Vector3(0, 1.5, 0));
  }
  function arc(A, n) {
    var a = A.def;
    for (var k = 0; k < n; k++) {
      var pts = [], ang = Math.random() * 6.28, len = a.r * (0.5 + Math.random() * 0.5);
      for (var i = 0; i <= 8; i++) { var t = i / 8; pts.push(new THREE.Vector3(a.x + Math.cos(ang) * len * t + (Math.random() - .5) * 0.3, a.y + 0.2 + Math.random() * 1.8 * (1 - t * 0.5), a.z + Math.sin(ang) * len * t + (Math.random() - .5) * 0.3)); }
      var l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xcfeeff, transparent: true }));
      scene.add(l); FX.push({ obj: l, life: 0.12, max: 0.12, line: true });
    }
  }

  // ---------- артефакты, ящики
  function buildPickups() {
    var glow = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    artifacts = W.artifacts.map(function (a, i) {
      var g = new THREE.Group(); g.position.set(a.x, a.y, a.z);
      var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshLambertMaterial({ color: a.color, emissive: a.color, emissiveIntensity: 0.6 }));
      var s = new THREE.Sprite(glow.clone()); s.material.color.set(a.color); s.scale.setScalar(0.9);
      g.add(core); g.add(s); g.visible = false; W.root.add(g);
      return { def: a, g: g, core: core, taken: flags.arts.indexOf(i) >= 0, idx: i };
    });
    artifacts.forEach(function (a) { if (a.taken) W.root.remove(a.g); });
    boxes = W.boxes.map(function (b, i) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), W.M.crate); m.position.set(b.x, b.y + 0.28, b.z); m.castShadow = true; W.root.add(m);
      return { def: b, mesh: m, opened: flags.boxes.indexOf(i) >= 0, idx: i };
    });
  }

  // ---------- огонь костров
  function buildFires() {
    fires = W.fires.map(function (f) {
      var l = new THREE.PointLight(0xff8a3a, 1.6, 14, 2); l.position.set(f.x, f.y + 0.8, f.z); W.root.add(l);
      return { def: f, light: l, t: 0 };
    });
  }

  // ---------- оружие в руках
  var view = new THREE.Group(); vScene.add(view);
  var vw = {};
  function vbox(w, h, d, color, x, y, z, parent, rx) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: color })); m.position.set(x, y, z); if (rx) m.rotation.x = rx; (parent || view).add(m); return m;
  }
  function buildViewModels() {
    var sleeve = 0x4e4c38, glove = 0x2a2724, metal = 0x262626, wood = 0x6b4426;
    // ПМ
    var pm = new THREE.Group();
    vbox(0.045, 0.06, 0.2, metal, 0, 0.03, -0.05, pm); vbox(0.04, 0.11, 0.05, 0x3a2a20, 0, -0.04, 0.03, pm, -0.2);
    vbox(0.06, 0.06, 0.1, glove, 0, -0.06, 0.07, pm); vbox(0.065, 0.065, 0.16, sleeve, 0.01, -0.1, 0.18, pm, -0.5);
    pm.scale.setScalar(0.8); vw.pm = pm;
    // АК-74
    var ak = new THREE.Group();
    vbox(0.06, 0.08, 0.42, metal, 0, 0, -0.05, ak);                 // ствольная коробка
    vbox(0.05, 0.05, 0.28, wood, 0, -0.005, -0.38, ak);              // цевьё
    var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8), new THREE.MeshLambertMaterial({ color: metal })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.6); ak.add(barrel);
    vbox(0.02, 0.05, 0.02, metal, 0, 0.05, -0.66, ak);               // мушка
    vbox(0.045, 0.13, 0.06, metal, 0, -0.1, -0.12, ak, 0.25);        // магазин
    vbox(0.045, 0.1, 0.06, metal, 0, -0.19, -0.1, ak, 0.5);
    vbox(0.04, 0.1, 0.04, 0x3a2a20, 0, -0.08, 0.08, ak, -0.3);       // рукоять
    vbox(0.05, 0.09, 0.26, wood, 0, -0.03, 0.28, ak, 0.08);          // приклад
    vbox(0.06, 0.06, 0.1, glove, 0, -0.1, 0.1, ak); vbox(0.065, 0.065, 0.16, sleeve, 0.02, -0.15, 0.2, ak, -0.5);
    vbox(0.06, 0.05, 0.09, glove, -0.02, -0.06, -0.38, ak); vbox(0.065, 0.065, 0.22, sleeve, -0.12, -0.12, -0.26, ak, 0.3);
    vw.ak = ak;
    // нож
    var kn = new THREE.Group();
    vbox(0.012, 0.035, 0.2, 0xb8b8b0, 0, 0.0, -0.13, kn); vbox(0.03, 0.04, 0.11, 0x1e1e1e, 0, 0, 0.02, kn);
    vbox(0.06, 0.06, 0.1, glove, 0, -0.01, 0.04, kn); vbox(0.065, 0.065, 0.16, sleeve, 0.01, -0.05, 0.15, kn, -0.5);
    vw.knife = kn;
    // болт в левой руке (для анимации броска)
    var flashM = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd080 }));
    flashM.visible = false; vw.muzzle = flashM;
    ['pm', 'ak', 'knife'].forEach(function (k) { vw[k].visible = false; view.add(vw[k]); });
    view.add(flashM);
  }
  function setWeapon(k) {
    if (k !== 'knife' && !P.weapons[k]) return;
    P.cur = k; P.reloading = 0; P.swap = 0.35;
    ['pm', 'ak', 'knife'].forEach(function (n) { vw[n].visible = n === k; });
    hud();
  }

  // ---------- игрок: действия
  var ray = new THREE.Raycaster();
  function shoot() {
    var w = WEAPONS[P.cur];
    if (P.cd > 0 || P.reloading > 0 || P.swap > 0 || state !== 'play') return;
    if (w.melee) { P.cd = w.cd; P.knife = 1; Z.Sound.knife(); meleeHit(w); return; }
    var slot = P.weapons[P.cur];
    if (slot.mag <= 0) { Z.Sound.click(); P.cd = 0.25; if (P.items[w.ammo] > 0) reload(); return; }
    slot.mag--; P.cd = w.cd;
    var spread = Z.lerp(w.spread, w.aimSpread, P.aim) * (1 + P.recoil * 6) * (P.moving ? 1.6 : 1) * (P.crouch > 0.5 ? 0.7 : 1);
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    dir.x += (Math.random() - .5) * spread * 2; dir.y += (Math.random() - .5) * spread * 2; dir.z += (Math.random() - .5) * spread * 2; dir.normalize();
    var origin = camera.position.clone();
    ray.set(origin, dir); ray.far = 400;
    var targets = W.solids.concat(NPC.filter(function (n) { return !n.dead; }).map(function (n) { return n.m.group; }));
    var hits = ray.intersectObjects(targets, true);
    var hit = hits[0];
    var end = hit ? hit.point : origin.clone().addScaledVector(dir, 200);
    var muzzle = origin.clone().addScaledVector(dir, 0.8); muzzle.y -= 0.12;
    tracer(muzzle, end);
    if (hit) {
      var npc = hit.object.userData.npc;
      if (npc && !npc.dead) {
        var head = npc.kind !== 'dog' && hit.point.y > npc.pos.y + 1.5;
        damageNPC(npc, w.dmg * (head ? 2.5 : 1) * (0.85 + Math.random() * 0.3), dir);
        puff(hit.point, 0x7a1010, 0.35, 0.35, new THREE.Vector3(0, -0.5, 0));
      } else { puff(hit.point, 0x8a826e, 0.5, 0.6); puff(hit.point, 0xffd080, 0.12, 0.06, null, true); }
    }
    P.recoil = Math.min(1, P.recoil + w.recoil * 10);
    P.pitch += w.recoil * (1 - P.aim * 0.5); P.yaw += (Math.random() - .5) * w.recoil * 0.6;
    vw.muzzle.visible = true; P.muzzleT = 0.05;
    Z.Sound.shot(w.sound);
    alertBandits(P.pos, 90);
    hud();
  }
  function meleeHit(w) {
    var f = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation); f.y = 0; f.normalize();
    NPC.forEach(function (n) {
      if (n.dead) return;
      var d = new THREE.Vector3(n.pos.x - P.pos.x, 0, n.pos.z - P.pos.z), L = d.length();
      if (L < w.range + 0.4 && d.normalize().dot(f) > 0.6) damageNPC(n, w.dmg, f);
    });
  }
  function reload() {
    var w = WEAPONS[P.cur]; if (w.melee) return;
    var slot = P.weapons[P.cur];
    if (P.reloading > 0 || slot.mag >= w.mag || P.items[w.ammo] <= 0) return;
    P.reloading = w.reload; Z.Sound.reload();
  }
  function finishReload() {
    var w = WEAPONS[P.cur], slot = P.weapons[P.cur];
    var need = w.mag - slot.mag, take = Math.min(need, P.items[w.ammo]);
    slot.mag += take; P.items[w.ammo] -= take; hud();
  }
  function throwBolt() {
    if (state !== 'play') return;
    var dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    var m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0x9a9890 }));
    m.position.copy(camera.position).addScaledVector(dir, 0.5); scene.add(m);
    bolts.push({ m: m, v: dir.multiplyScalar(13).add(new THREE.Vector3(0, 2.5, 0)), life: 25, rest: false });
    Z.Sound.knife();
  }
  function heal(n) { P.hp = Math.min(100, P.hp + n); hud(); }
  function useItem(k) {
    if (!P.items[k] || !ITEMS[k].use) return;
    P.items[k]--; ITEMS[k].use(); Z.Sound.pick(); note('Использовано: ' + ITEMS[k].name); hud(); if (uiOpen === 'pda') renderPDA();
  }
  function damagePlayer(n, src) {
    if (state !== 'play') return;
    P.hp -= n; Z.Sound.hurt();
    var h = $('#hurt'); h.style.transition = 'none'; h.style.opacity = Z.clamp(n / 25, 0.3, 0.9); h.getBoundingClientRect(); h.style.transition = ''; h.style.opacity = 0;
    if (src) P.yaw += (Math.random() - .5) * 0.04;
    if (P.hp <= 0) die(src);
    hud();
  }
  function die(src) {
    P.hp = 0; state = 'dead';
    if (document.pointerLockElement) document.exitPointerLock();
    $('#deadText').textContent = src === 'rad' ? 'Радиация добила тебя.' : src === 'anomaly' ? 'Аномалия не оставила шансов.' : src === 'dog' ? 'Слепые псы разорвали тебя.' : 'Пуля бандита оказалась быстрее.';
    $('#btnReload').disabled = !hasSave();
    show('dead');
  }

  // ---------- NPC: урон и ИИ
  function damageNPC(n, dmg, dir) {
    if (n.dead) return;
    n.hp -= dmg;
    if (n.kind === 'stalker' || n.kind === 'trader') { n.hp = 100; note(n.kind === 'trader' ? '«Ты что творишь?!»' : n.name + ': «Э, свои!»'); return; }
    n.alert = 30; n.state = 'combat';
    if (n.kind === 'bandit') alertBandits(n.pos, 40);
    if (n.hp <= 0) {
      n.dead = true; n.deathT = 0; n.deathDir = dir ? dir.clone() : new THREE.Vector3(0, 0, 1);
      if (n.kind === 'bandit') { flags.bandits.push(n.idx); checkBandits(); }
      if (n.kind === 'dog') Z.Sound.tone(300, 0.4, 0.2, 'sawtooth', 90);
    }
  }
  function alertBandits(pos, r) {
    NPC.forEach(function (n) { if (n.kind === 'bandit' && !n.dead && n.pos.distanceTo(pos) < r) { n.alert = Math.max(n.alert, 20); n.lastSeen = P.pos.clone(); } });
  }
  function checkBandits() {
    var left = NPC.filter(function (n) { return n.kind === 'bandit' && !n.dead; }).length;
    if (left === 0 && P.quests.bandits === 'active') { P.quests.bandits = 'ready'; note('АТП зачищено. Возвращайся к торговцу.'); }
  }

  function updateNPC(n, dt) {
    var m = n.m;
    if (n.dead) {
      n.deathT = Math.min(1, n.deathT + dt * 2);
      if (n.kind === 'dog') { m.group.rotation.z = n.deathT * Math.PI / 2; m.group.position.y = n.pos.y + 0.1 * n.deathT; }
      else { m.group.rotation.x = -n.deathT * Math.PI / 2 * 0.98; m.group.position.y = n.pos.y + 0.15 * n.deathT; }
      return;
    }
    var dx = P.pos.x - n.pos.x, dz = P.pos.z - n.pos.z, dist = Math.hypot(dx, dz);
    var moveTo = null, speed = 1.4, face = null, moving = 0;

    if (n.kind === 'dog') {
      if (state === 'play' && (dist < 26 || n.state === 'chase')) n.state = dist < 60 ? 'chase' : 'idle';
      if (n.state === 'chase' && state === 'play') {
        speed = 6.2; moveTo = P.pos; face = Math.atan2(dx, dz);
        if (dist < 1.6) { moveTo = null; n.cd -= dt; if (n.cd <= 0) { n.cd = 0.9 + Math.random() * 0.4; Z.Sound.bite(); damagePlayer(7 + Math.random() * 6, 'dog'); } }
        if (Math.random() < dt * 0.6) Z.Sound.bark(n.pos.x, n.pos.z);
      } else {
        n.wait -= dt;
        if (n.wait <= 0) { n.wait = 2 + Math.random() * 4; n.target = new THREE.Vector3(n.home.x + (Math.random() - .5) * 16, 0, n.home.z + (Math.random() - .5) * 16); }
        if (n.target) { moveTo = n.target; speed = 1.6; }
      }
    } else if (n.kind === 'bandit') {
      n.losT -= dt;
      if (n.losT <= 0) {
        n.losT = 0.25 + Math.random() * 0.15;
        var eyeY = n.pos.y + 1.6, pY = P.pos.y + (P.crouch > 0.5 ? 1.0 : 1.5);
        var inFov = Math.cos(Math.atan2(dx, dz) - n.yaw) > -0.1 || n.alert > 0 || dist < 10;
        n.sees = state === 'play' && dist < (P.crouch > 0.5 ? 45 : 70) && inFov && los(n.pos.x, eyeY, n.pos.z, P.pos.x, pY, P.pos.z);
        if (n.sees) { if (n.alert <= 0) { n.react = 0.7 + Math.random() * 0.6; alertBandits(n.pos, 45); } n.alert = 25; n.lastSeen = P.pos.clone(); }
      }
      if (n.alert > 0) {
        n.alert -= dt;
        face = Math.atan2(dx, dz);
        if (n.sees) {
          if (!n.tower) {
            n.strafeT -= dt; if (n.strafeT <= 0) { n.strafeT = 1.5 + Math.random() * 2; n.strafe = -n.strafe; }
            var nx = dx / dist, nz = dz / dist, want = dist > 32 ? 1 : dist < 10 ? -0.8 : 0;
            moveTo = new THREE.Vector3(n.pos.x + nx * want * 2 - nz * n.strafe * 1.5, 0, n.pos.z + nz * want * 2 + nx * n.strafe * 1.5);
            speed = 2.2;
          }
          if (n.react > 0) n.react -= dt;
          else {
            n.cd -= dt;
            if (n.cd <= 0) {
              banditShoot(n, dist);
              n.burst = (n.burst || 0) + 1;
              if (n.burst >= 3 + Math.floor(Math.random() * 3)) { n.burst = 0; n.cd = 1.0 + Math.random() * 1.2; } else n.cd = 0.12;
            }
          }
        } else if (n.lastSeen && !n.tower) {
          moveTo = n.lastSeen; speed = 3.2; face = Math.atan2(n.lastSeen.x - n.pos.x, n.lastSeen.z - n.pos.z);
          if (n.pos.distanceTo(n.lastSeen) < 2) n.lastSeen = null;
        }
      } else if (n.patrol && n.patrol.length > 1 && !n.tower) {
        var tp = n.patrol[n.pi];
        if (Math.hypot(tp[0] - n.pos.x, tp[1] - n.pos.z) < 0.6) { n.wait -= dt; if (n.wait <= 0) { n.pi = (n.pi + 1) % n.patrol.length; n.wait = 2 + Math.random() * 4; } }
        else { moveTo = new THREE.Vector3(tp[0], 0, tp[1]); speed = 1.2; }
      }
    } else if (n.kind === 'stalker' || n.kind === 'trader') {
      if (dist < 4 && !n.sit) face = Math.atan2(dx, dz);
    }

    if (moveTo) {
      var mx = moveTo.x - n.pos.x, mz = moveTo.z - n.pos.z, L = Math.hypot(mx, mz);
      if (L > 0.3) {
        var s = Math.min(L, speed * dt); n.pos.x += mx / L * s; n.pos.z += mz / L * s; moving = speed;
        if (face === null) face = Math.atan2(mx, mz);
      }
    }
    if (!n.tower) {
      pushOut(n.pos, n.pos.y, 1.7, n.kind === 'dog' ? 0.35 : 0.4);
      n.pos.y = groundAt(n.pos.x, n.pos.z, n.pos.y, 0.3);
    }
    // не даём NPC наступать на игрока
    var px = n.pos.x - P.pos.x, pz = n.pos.z - P.pos.z, pd = Math.hypot(px, pz);
    if (pd > 0 && pd < 0.8) { n.pos.x += px / pd * (0.8 - pd); n.pos.z += pz / pd * (0.8 - pd); }
    if (face !== null) { var dy = face - n.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; n.yaw += dy * Math.min(1, dt * 6); }

    // анимация
    n.walk += dt * moving * 2.6;
    var sw = Math.sin(n.walk) * Math.min(1, moving) * 0.7;
    if (n.kind === 'dog') {
      m.legs[0].rotation.x = sw * 1.2; m.legs[1].rotation.x = -sw * 1.2; m.legs[2].rotation.x = -sw * 1.2; m.legs[3].rotation.x = sw * 1.2;
      m.head.rotation.x = n.state === 'chase' ? 0.2 : Math.sin(Date.now() / 700) * 0.1;
    } else if (!n.sit) {
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw;
      var aiming = n.kind === 'bandit' && n.alert > 0;
      m.armL.rotation.x = aiming ? -1.2 : -sw * 0.5; m.armR.rotation.x = aiming ? -1.3 : sw * 0.5;
      m.gun.position.set(0.1, aiming ? 0.5 : 0.35, aiming ? 0.35 : 0.25); m.gun.rotation.x = aiming ? 0 : 0.6;
      m.hips.position.y = 0.95 + Math.abs(Math.sin(n.walk)) * 0.03 * Math.min(1, moving);
    }
    m.group.position.copy(n.pos); m.group.rotation.y = n.yaw;
  }

  function banditShoot(n, dist) {
    var g = new THREE.Vector3(); n.m.gun.getWorldPosition(g);
    var fwd = new THREE.Vector3(Math.sin(n.yaw), 0, Math.cos(n.yaw)); g.addScaledVector(fwd, 0.5);
    var target = new THREE.Vector3(P.pos.x, P.pos.y + (P.crouch > 0.5 ? 0.9 : 1.3), P.pos.z);
    var chance = Z.clamp(0.62 - dist * 0.008, 0.12, 0.6) * (P.moving ? (P.sprint ? 0.5 : 0.75) : 1) * (P.crouch > 0.5 ? 0.7 : 1);
    var hitP = Math.random() < chance;
    if (!hitP) target.add(new THREE.Vector3((Math.random() - .5) * 2.5, (Math.random() - .5) * 1.5, (Math.random() - .5) * 2.5));
    tracer(g, target, 0xffcf80);
    puff(g, 0xffd080, 0.25, 0.05, null, true);
    Z.Sound.shot('ak', n.pos.x, n.pos.z);
    if (hitP) damagePlayer(8 + Math.random() * 7, 'bandit');
    else if (Math.random() < 0.3) Z.Sound.noise(0.05, 4000, 0.08, 'highpass');
  }

  // ---------- взаимодействие
  function findInteract() {
    var f = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation); f.y = 0; f.normalize();
    var best = null, bs = 1e9;
    function consider(obj, x, z, range, label, y) {
      var d = new THREE.Vector3(x - P.pos.x, 0, z - P.pos.z), L = d.length();
      if (L > range) return;
      var dot = L > 0.3 ? d.normalize().dot(f) : 1;
      if (dot < 0.55) return;
      if (y !== undefined && Math.abs(y - P.pos.y) > 2.5) return;
      var sc = L - dot * 2; if (sc < bs) { bs = sc; best = { obj: obj, label: label }; }
    }
    NPC.forEach(function (n) {
      if (n.kind === 'trader') consider(n, n.pos.x, n.pos.z, 4, 'Говорить с торговцем');
      else if (n.kind === 'stalker') consider(n, n.pos.x, n.pos.z, 2.6, 'Говорить: ' + n.name);
      else if (n.dead && !n.looted) consider(n, n.pos.x, n.pos.z, 2.2, 'Обыскать тело');
    });
    boxes.forEach(function (b) { if (!b.opened) consider(b, b.def.x, b.def.z, 2.2, 'Открыть: ' + b.def.label, b.def.y); });
    artifacts.forEach(function (a) { if (!a.taken && a.g.visible) consider(a, a.def.x, a.def.z, 2.0, 'Подобрать артефакт «' + a.def.name + '»'); });
    return best;
  }
  function interact() {
    var t = findInteract(); if (!t) return;
    var o = t.obj;
    if (o.kind === 'trader') return openTrade();
    if (o.kind === 'stalker') return talkTo(o);
    if (o.kind && o.dead) { lootBody(o); return; }
    if (o.def && o.def.items) { openBox(o); return; }
    if (o.def && o.def.price) { takeArtifact(o); }
  }
  function lootBody(n) {
    n.looted = true;
    var got = [];
    var ammo = 10 + Math.floor(Math.random() * 25); P.items.ammo545 += ammo; got.push(ammo + ' патр. 5,45');
    if (!P.weapons.ak) { P.weapons.ak = { mag: 30 }; got.push('АК-74'); note('Подобран АК-74 — клавиша 2'); }
    var money = 80 + Math.floor(Math.random() * 220); P.money += money; got.push(money + ' руб.');
    if (Math.random() < 0.4) { P.items.bandage++; got.push('бинт'); }
    if (Math.random() < 0.25) { P.items.medkit++; got.push('аптечка'); }
    if (Math.random() < 0.3) { P.items.vodka++; got.push('водка'); }
    Z.Sound.pick(); note('Найдено: ' + got.join(', ')); hud();
  }
  function openBox(b) {
    b.opened = true; flags.boxes.push(b.idx);
    var got = [];
    Object.keys(b.def.items).forEach(function (k) { P.items[k] = (P.items[k] || 0) + b.def.items[k]; got.push(ITEMS[k].name + ' ×' + b.def.items[k]); });
    b.mesh.rotation.x = -0.4; b.mesh.position.y += 0.1;
    Z.Sound.pick(); note('Найдено: ' + got.join(', '));
    if (b.def.quest === 'flash' && P.quests.flash === 'active') { P.quests.flash = 'ready'; note('Флешка у тебя. Неси торговцу.'); }
    hud();
  }
  function takeArtifact(a) {
    a.taken = true; flags.arts.push(a.idx); W.root.remove(a.g);
    P.arts.push({ name: a.def.name, price: a.def.price });
    Z.Sound.pick(); Z.Sound.tone(660, 0.3, 0.1); note('Артефакт «' + a.def.name + '» в рюкзаке');
    if (P.quests.art === 'active') { P.quests.art = 'ready'; note('Задание: отнеси артефакт торговцу.'); }
  }

  var STALKER_LINES = [
    'К болоту без болтов не суйся. Видишь, листья кружатся — значит, «воронка».',
    'Бандиты на АТП совсем обнаглели. Человек пять, не меньше, и один на вышке сидит.',
    'Где трещит и синим светится — «электра». Брось болт, пусть разрядится, и проходи.',
    'На кладбище техники фонит страшно. Водку с собой бери, а лучше антирад.',
    'Псы слепые, но нюх у них — ого. Стаей ходят у поля на востоке.',
    'Слыхал, курьера у блокпоста подстрелили. Говорят, при нём что-то ценное было.'
  ];
  function talkTo(n) {
    $('#talkName').textContent = n.name;
    $('#talkText').textContent = '«' + STALKER_LINES[(n.name.length + Math.floor(Date.now() / 20000)) % STALKER_LINES.length] + '»';
    openUI('talk');
  }

  // ---------- торговля
  function openTrade() {
    if (!P.metTrader) {
      P.metTrader = true;
      ['art', 'bandits', 'flash'].forEach(function (k) { if (P.quests[k] === 'none') P.quests[k] = 'active'; });
      note('Новые задания в КПК (Tab)');
    }
    renderTrade(); openUI('trade'); save();
  }
  function renderTrade() {
    var first = P.quests.art === 'active' && P.quests.bandits === 'active' && P.quests.flash === 'active' && !P.arts.length;
    $('#tradeText').textContent = first
      ? '«Ну что, сталкер, работа есть. Мне нужен артефакт с болота — там аномалий полно, найдёшь. На АТП бандиты житья не дают — разберись. И у старого блокпоста курьер мой лежит, флешку его принеси. Заплачу честно.»'
      : '«Чего надо? Товар есть, деньги вперёд.»';
    $('#tradeMoney').textContent = P.money + ' руб.';
    var buy = $('#buyList'); buy.innerHTML = '';
    SHOP.forEach(function (s) {
      var it = ITEMS[s[0]], price = it.price * s[1];
      var li = document.createElement('li');
      li.innerHTML = '<span>' + it.name + (s[1] > 1 ? ' ×' + s[1] : '') + '</span>';
      var b = document.createElement('button'); b.textContent = price + ' р.'; b.disabled = P.money < price;
      b.addEventListener('click', function () { P.money -= price; P.items[s[0]] = (P.items[s[0]] || 0) + s[1]; Z.Sound.pick(); renderTrade(); hud(); });
      li.appendChild(b); buy.appendChild(li);
    });
    var sell = $('#sellList'); sell.innerHTML = '';
    if (!P.arts.length) sell.innerHTML = '<li><span style="color:var(--dim)">Нечего продать</span></li>';
    P.arts.forEach(function (a, i) {
      var li = document.createElement('li'); li.innerHTML = '<span>Артефакт «' + a.name + '»</span>';
      var b = document.createElement('button'); b.textContent = '+' + a.price + ' р.';
      b.addEventListener('click', function () { P.money += a.price; P.arts.splice(i, 1); Z.Sound.pick(); renderTrade(); save(); });
      li.appendChild(b); sell.appendChild(li);
    });
    var tq = $('#tqList'); tq.innerHTML = '';
    Object.keys(QUESTS).forEach(function (k) {
      var q = QUESTS[k], st = P.quests[k]; if (st === 'none') return;
      var li = document.createElement('li'); li.innerHTML = '<span>' + q.title + (st === 'done' ? ' — выполнено' : '') + '</span>';
      if (st !== 'done') {
        var can = st === 'ready' && (k !== 'art' || P.arts.length) && (k !== 'flash' || P.items.flash > 0);
        var b = document.createElement('button'); b.textContent = can ? 'Сдать (+' + q.reward + ')' : 'В процессе'; b.disabled = !can;
        b.addEventListener('click', function () { completeQuest(k); });
        li.appendChild(b);
      }
      tq.appendChild(li);
    });
  }
  function completeQuest(k) {
    var q = QUESTS[k];
    if (k === 'art') P.arts.shift();
    if (k === 'flash') P.items.flash = 0;
    if (k === 'art') { P.items.medkit += 2; }
    if (k === 'bandits') { P.items.ammo545 += 60; }
    if (k === 'flash') { P.items.antirad += 2; }
    P.money += q.reward; P.quests[k] = 'done';
    Z.Sound.tone(520, 0.2, 0.12); Z.Sound.tone(780, 0.35, 0.1);
    note('Задание выполнено: ' + q.title + ' (+' + q.reward + ' руб.)');
    if (['art', 'bandits', 'flash'].every(function (x) { return P.quests[x] === 'done'; })) note('Все задания торговца выполнены. Зона тебя приняла, сталкер.');
    renderTrade(); save(); hud();
  }

  // ---------- КПК
  var mapBase = null;
  function buildMapBase() {
    var c = document.createElement('canvas'); c.width = c.height = 320; var x = c.getContext('2d'), img = x.createImageData(320, 320);
    for (var j = 0; j < 320; j++) for (var i = 0; i < 320; i++) {
      var wx = i - 160, wz = j - 160, h = Z.heightAt(wx, wz), k = (j * 320 + i) * 4;
      var shade = Z.clamp(0.55 + h * 0.025, 0.3, 1);
      var water = h < Z.pondLevel - 0.1 && Math.hypot(wx - Z.POI.pond.x, wz - Z.POI.pond.z) < 26;
      img.data[k] = water ? 40 : 90 * shade; img.data[k + 1] = water ? 70 : 120 * shade; img.data[k + 2] = water ? 60 : 70 * shade; img.data[k + 3] = 255;
      if (Z.onRoad(wx, wz)) { img.data[k] = img.data[k + 1] = img.data[k + 2] = 70; }
    }
    x.putImageData(img, 0, 0);
    // трассы
    x.strokeStyle = 'rgba(30,20,10,.5)'; x.lineWidth = 1;
    for (var g = 0; g <= 320; g += 40) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 320); x.moveTo(0, g); x.lineTo(320, g); x.stroke(); }
    mapBase = c;
  }
  function renderMap() {
    var cv = $('#mapCanvas'), x = cv.getContext('2d'), S = cv.width / 320;
    x.imageSmoothingEnabled = true; x.drawImage(mapBase, 0, 0, cv.width, cv.height);
    x.fillStyle = 'rgba(15,26,18,.25)'; x.fillRect(0, 0, cv.width, cv.height);
    x.font = 'bold 13px monospace'; x.textAlign = 'center';
    W.markers.forEach(function (m) {
      var px = (m.x + 160) * S, pz = (m.z + 160) * S;
      x.fillStyle = m.kind === 'enemy' ? '#ff6a4a' : m.kind === 'rad' ? '#d6e04a' : m.kind === 'anomaly' ? '#7fd4ff' : m.kind === 'trader' ? '#ffd27a' : '#c8f0a0';
      x.beginPath(); x.arc(px, pz, 5, 0, 7); x.fill();
      x.fillStyle = '#e7f5d0'; x.fillText(m.label, px, pz - 9);
    });
    Object.keys(QUESTS).forEach(function (k) {
      if (P.quests[k] !== 'active') return;
      var t = Z.POI[QUESTS[k].target], px = (t.x + 160) * S, pz = (t.z + 160) * S;
      x.strokeStyle = '#ffb040'; x.lineWidth = 2; x.beginPath(); x.arc(px, pz, 14, 0, 7); x.stroke();
    });
    var px2 = (P.pos.x + 160) * S, pz2 = (P.pos.z + 160) * S;
    x.save(); x.translate(px2, pz2); x.rotate(-P.yaw); x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(0, -10); x.lineTo(6, 7); x.lineTo(0, 3); x.lineTo(-6, 7); x.closePath(); x.fill(); x.restore();
    x.fillStyle = '#a8e07a'; x.textAlign = 'left'; x.fillText('С ↑', 10, 18);
  }
  function renderPDA() {
    var ql = $('#questList'); ql.innerHTML = '';
    var any = false;
    Object.keys(QUESTS).forEach(function (k) {
      var st = P.quests[k]; if (st === 'none') return; any = true;
      var q = QUESTS[k], li = document.createElement('li');
      if (st === 'done') li.className = 'done';
      li.innerHTML = '<b>' + q.title + ' ' + (st === 'done' ? '[выполнено]' : st === 'ready' ? '[сдать торговцу]' : '') + '</b>' + q.text + '<br>Награда: ' + q.reward + ' руб.';
      ql.appendChild(li);
    });
    if (!any) ql.innerHTML = '<li>Поговори с торговцем в бункере (E), он даст работу.</li>';
    var inv = $('#invList'); inv.innerHTML = '';
    var head = document.createElement('div'); head.innerHTML = '<b>Деньги</b>' + P.money + ' руб.'; inv.appendChild(head);
    var wd = document.createElement('div'); wd.innerHTML = '<b>Оружие</b>Нож' + (P.weapons.pm ? ', ПМ' : '') + (P.weapons.ak ? ', АК-74' : ''); inv.appendChild(wd);
    Object.keys(ITEMS).forEach(function (k) {
      if (!P.items[k]) return;
      var d = document.createElement('div'); d.innerHTML = '<b>' + ITEMS[k].name + '</b>× ' + P.items[k];
      if (ITEMS[k].use) { var b = document.createElement('button'); b.textContent = 'Использовать'; b.addEventListener('click', function () { useItem(k); }); d.appendChild(b); }
      inv.appendChild(d);
    });
    P.arts.forEach(function (a) { var d = document.createElement('div'); d.innerHTML = '<b>Артефакт «' + a.name + '»</b>≈ ' + a.price + ' руб.'; inv.appendChild(d); });
    renderMap();
  }

  // ---------- интерфейс
  var notesEl = $('#notes');
  function note(t) {
    var d = document.createElement('div'); d.textContent = t; notesEl.appendChild(d);
    setTimeout(function () { d.remove(); }, 5200);
    while (notesEl.children.length > 5) notesEl.firstChild.remove();
  }
  function hud() {
    if (!P) return;
    $('#hpFill').style.width = Math.max(0, P.hp) + '%';
    $('#stFill').style.width = P.stamina + '%';
    $('#radFill').style.width = Math.min(100, P.rad) + '%';
    var w = WEAPONS[P.cur];
    $('#wName').textContent = w.name;
    $('#wAmmo').textContent = w.melee ? '—' : P.weapons[P.cur].mag + ' / ' + P.items[w.ammo];
    $('#qMed').textContent = P.items.medkit; $('#qBand').textContent = P.items.bandage;
  }
  function show(name) {
    ['menu', 'pause', 'dead'].forEach(function (n) { $('#' + n).hidden = n !== name; });
    $('#hud').hidden = !!name; $('#touch').hidden = !!name || !isTouch;
  }
  function openUI(name) {
    uiOpen = name; $('#' + name).hidden = false;
    if (name === 'pda') renderPDA();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function closeUI() {
    if (!uiOpen) return;
    $('#' + uiOpen).hidden = true; uiOpen = null; lock();
  }
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeUI); });
  $$('.pda nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.pda nav button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $$('[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== b.dataset.tab; });
      if (b.dataset.tab === 'map') renderMap();
    });
  });

  // компас
  var compass = $('#compassStrip');
  function updateCompass() {
    var w = compass.parentNode.clientWidth, deg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360, pxPerDeg = w / 120;
    var html = '';
    var marks = [['С', 0], ['СВ', 45], ['В', 90], ['ЮВ', 135], ['Ю', 180], ['ЮЗ', 225], ['З', 270], ['СЗ', 315]];
    for (var k = -1; k <= 1; k++) marks.forEach(function (m) {
      var d = m[1] + k * 360 - deg; if (Math.abs(d) > 62) return;
      html += '<span class="' + (m[0].length === 1 ? 'card' : '') + '" style="left:' + (w / 2 + d * pxPerDeg) + 'px">' + m[0] + '</span>';
    });
    Object.keys(QUESTS).forEach(function (k) {
      if (P.quests[k] !== 'active' && P.quests[k] !== 'ready') return;
      var t = P.quests[k] === 'ready' ? Z.POI.bunker : Z.POI[QUESTS[k].target];
      var b = (Math.atan2(t.x - P.pos.x, -(t.z - P.pos.z)) * 180 / Math.PI + 360) % 360;
      var d = ((b - deg + 540) % 360) - 180; if (Math.abs(d) > 62) return;
      html += '<span class="q" style="left:' + (w / 2 + d * pxPerDeg) + 'px">▼</span>';
    });
    compass.innerHTML = html;
  }

  // ---------- ввод
  var keys = {}, look = { x: 0, y: 0 }, mouse = false, tMove = { x: 0, y: 0 };
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Tab') { e.preventDefault(); if (state === 'play') { if (uiOpen === 'pda') closeUI(); else if (!uiOpen) openUI('pda'); } return; }
    if (e.code === 'Escape' && uiOpen) { closeUI(); return; }
    keys[e.code] = true;
    if (state !== 'play' || uiOpen) return;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyG') throwBolt();
    if (e.code === 'KeyF') { P.flash = !P.flash; flash.intensity = P.flash ? 2.2 : 0; Z.Sound.click(); }
    if (e.code === 'KeyH') useItem('medkit');
    if (e.code === 'KeyB') useItem('bandage');
    if (e.code === 'Digit1') setWeapon('knife');
    if (e.code === 'Digit2') setWeapon(P.weapons.ak ? 'ak' : 'pm');
    if (e.code === 'Digit3') setWeapon('pm');
    if (e.code === 'Space' && P.onGround) { P.vy = 4.6; P.onGround = false; P.stamina = Math.max(0, P.stamina - 8); }
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });
  renderer.domElement.addEventListener('mousedown', function (e) {
    if (isTouch || state !== 'play' || uiOpen) return;
    if (document.pointerLockElement !== renderer.domElement) { lock(); return; }
    if (e.button === 0) { mouse = true; shoot(); }
    if (e.button === 2) P.aiming = true;
  });
  document.addEventListener('mouseup', function (e) { if (e.button === 0) mouse = false; if (e.button === 2 && P) P.aiming = false; });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('mousemove', function (e) { if (document.pointerLockElement === renderer.domElement) { look.x += e.movementX; look.y += e.movementY; } });
  document.addEventListener('wheel', function (e) { if (state === 'play' && !uiOpen) { var order = ['knife', 'pm'].concat(P.weapons.ak ? ['ak'] : []); var i = order.indexOf(P.cur); setWeapon(order[(i + (e.deltaY > 0 ? 1 : order.length - 1)) % order.length]); } });
  function lock() { if (isTouch || state !== 'play') return; try { var r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* без захвата */ } }
  document.addEventListener('pointerlockchange', function () { if (!document.pointerLockElement && state === 'play' && !uiOpen && !isTouch) pause(); });

  (function touch() {
    if (!isTouch) return;
    document.body.classList.add('touch');
    var stick = $('#stick'), knob = stick.querySelector('i'), sid = null, lid = null, sx = 0, sy = 0, lx = 0, ly = 0;
    window.addEventListener('touchstart', function (e) {
      if (state !== 'play' || uiOpen) return;
      Array.prototype.forEach.call(e.changedTouches, function (t) {
        if (t.target.closest && t.target.closest('.tb')) return;
        if (t.clientX < innerWidth * 0.4 && sid === null) { sid = t.identifier; sx = t.clientX; sy = t.clientY; stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; stick.style.bottom = 'auto'; }
        else if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; }
      });
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      Array.prototype.forEach.call(e.changedTouches, function (t) {
        if (t.identifier === sid) { var dx = t.clientX - sx, dy = t.clientY - sy, L = Math.hypot(dx, dy), m = Math.min(L, 50); if (L) { dx = dx / L * m; dy = dy / L * m; } knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; tMove.x = dx / 50; tMove.y = dy / 50; }
        if (t.identifier === lid) { look.x += (t.clientX - lx) * 1.5; look.y += (t.clientY - ly) * 1.5; lx = t.clientX; ly = t.clientY; }
      });
    }, { passive: true });
    function end(e) { Array.prototype.forEach.call(e.changedTouches, function (t) { if (t.identifier === sid) { sid = null; tMove.x = tMove.y = 0; knob.style.transform = ''; } if (t.identifier === lid) lid = null; }); }
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    $$('.tb').forEach(function (b) {
      b.addEventListener('touchstart', function (e) {
        e.preventDefault(); if (state !== 'play') return;
        var a = b.dataset.act;
        if (a === 'fire') { mouse = true; shoot(); } if (a === 'aim') P.aiming = !P.aiming; if (a === 'jump' && P.onGround) { P.vy = 4.6; P.onGround = false; }
        if (a === 'use') interact(); if (a === 'reload') reload(); if (a === 'bolt') throwBolt(); if (a === 'pda') { if (uiOpen === 'pda') closeUI(); else openUI('pda'); }
        if (a === 'heal') useItem('medkit');
        if (a === 'weapon') { var order = ['knife', 'pm'].concat(P.weapons.ak ? ['ak'] : []); setWeapon(order[(order.indexOf(P.cur) + 1) % order.length]); }
      }, { passive: false });
      b.addEventListener('touchend', function (e) { e.preventDefault(); if (b.dataset.act === 'fire') mouse = false; }, { passive: false });
    });
  })();

  // ---------- сохранение
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function save() {
    if (!P || state === 'dead') return;
    var data = { p: { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, hp: P.hp, rad: P.rad, money: P.money, items: P.items, arts: P.arts, weapons: P.weapons, cur: P.cur, quests: P.quests, metTrader: P.metTrader }, flags: flags };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* хранилище недоступно */ }
  }
  function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }

  // ---------- запуск
  function clearDynamic() {
    NPC.forEach(function (n) { W.root.remove(n.m.group); }); NPC = [];
    artifacts.forEach(function (a) { W.root.remove(a.g); }); boxes.forEach(function (b) { W.root.remove(b.mesh); });
    anomalies.forEach(function (a) { W.root.remove(a.g); }); fires.forEach(function (f) { W.root.remove(f.light); });
    bolts.forEach(function (b) { scene.remove(b.m); }); bolts = [];
    FX.forEach(function (f) { scene.remove(f.obj); }); FX = [];
  }
  function startGame(saved) {
    Z.Sound.init();
    if (Z.Sound.ctx && Z.Sound.ctx.state === 'suspended') Z.Sound.ctx.resume();
    clearDynamic();
    flags = saved ? saved.flags : { bandits: [], arts: [], boxes: [] };
    P = newPlayer();
    if (saved) {
      var s = saved.p; P.pos.set(s.x, s.y, s.z); P.yaw = s.yaw; P.hp = s.hp; P.rad = s.rad; P.money = s.money;
      P.items = Object.assign(P.items, s.items); P.arts = s.arts; P.weapons = s.weapons; P.cur = s.cur; P.quests = s.quests; P.metTrader = s.metTrader;
    }
    // NPC
    var t = W.trader; makeNPC('trader', t.x, t.z, { face: t.face });
    W.stalkers.forEach(function (s) { makeNPC('stalker', s.x, s.z, { face: s.face, sit: s.sit, name: s.name }); });
    W.bandits.forEach(function (b, i) {
      var n = makeNPC('bandit', b.x, b.z, { patrol: b.patrol, y: b.y, tower: b.tower, idx: i, face: Math.random() * 6 });
      if (flags.bandits.indexOf(i) >= 0) { n.dead = true; n.deathT = 1; n.looted = true; }
    });
    W.dogs.forEach(function (d) { makeDogNPC(d.x, d.z); });
    buildAnomalies(); buildPickups(); buildFires();
    linearize(scene);
    setWeapon(P.cur);
    state = 'play'; uiOpen = null;
    show(null); hud();
    if (!saved) setTimeout(function () { note('Ты в бункере торговца. Подойди к прилавку и нажми E.'); }, 600);
    lock();
  }
  function pause() { if (state !== 'play') return; state = 'pause'; show('pause'); }
  function resume() { state = 'play'; show(null); lock(); }

  $('#btnNew').addEventListener('click', function () { startGame(null); });
  $('#btnLoad').addEventListener('click', function () { var s = load(); startGame(s); });
  $('#btnResume').addEventListener('click', resume);
  $('#btnSave').addEventListener('click', function () { state = 'play'; save(); state = 'pause'; note('Игра сохранена'); $('#btnSave').textContent = 'Сохранено'; setTimeout(function () { $('#btnSave').textContent = 'Сохранить'; }, 1500); });
  $('#btnToMenu').addEventListener('click', function () { state = 'menu'; $('#btnLoad').hidden = !hasSave(); show('menu'); });
  $('#btnReload').addEventListener('click', function () { var s = load(); if (s) startGame(s); });
  $('#btnRestart').addEventListener('click', function () { startGame(null); });

  // ---------- обновление
  var grainCtx = $('#grain').getContext('2d'), grainImg = grainCtx.createImageData(160, 160);
  function grain() {
    var d = grainImg.data;
    for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    grainCtx.putImageData(grainImg, 0, 0);
  }

  var tmp = new THREE.Vector3(), saveT = 0, ambT = 5, detT = 0, geigerAcc = 0, hudT = 0;
  function updatePlayer(dt) {
    // взгляд
    var sens = 0.0021 * (1 - P.aim * 0.4);
    P.yaw -= look.x * sens; P.pitch -= look.y * sens; look.x = look.y = 0;
    P.pitch = Z.clamp(P.pitch, -1.45, 1.45);
    // движение
    var fx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + tMove.x, fz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) + tMove.y;
    var mag = Math.min(1, Math.hypot(fx, fz));
    P.crouch = Z.lerp(P.crouch, keys.ControlLeft || keys.KeyC ? 1 : 0, Math.min(1, dt * 10));
    var inWater = P.pos.y < Z.pondLevel - 0.2;
    P.sprint = (keys.ShiftLeft || keys.ShiftRight) && fz < 0 && P.stamina > 5 && P.crouch < 0.5 && !P.aiming;
    var speed = (P.sprint ? 6.4 : 3.6) * (P.crouch > 0.5 ? 0.5 : 1) * (P.aim > 0.5 ? 0.6 : 1) * (inWater ? 0.55 : 1) * Math.max(0.5, P.hp / 100 + 0.3);
    P.moving = mag > 0.1;
    if (P.moving) {
      var L = Math.hypot(fx, fz); fx /= L; fz /= L;
      var s = Math.sin(P.yaw), c = Math.cos(P.yaw);
      P.pos.x += (fx * c + fz * s) * speed * mag * dt;
      P.pos.z += (-fx * s + fz * c) * speed * mag * dt;
      P.stepAcc += speed * mag * dt;
      if (P.stepAcc > (P.sprint ? 2.6 : 2.1)) { P.stepAcc = 0; if (P.onGround) Z.Sound.step(P.crouch > 0.5 || inWater); }
      P.bob += dt * speed * 2.1;
    }
    P.stamina = Z.clamp(P.stamina + (P.sprint && P.moving ? -14 : 9) * dt, 0, 100);
    pushOut(P.pos, P.pos.y, 1.75, R);
    // гравитация и земля
    var g = groundAt(P.pos.x, P.pos.z, P.pos.y, R);
    P.vy -= 14 * dt; P.pos.y += P.vy * dt;
    if (P.pos.y <= g) { if (P.vy < -9) damagePlayer((-P.vy - 9) * 6, 'fall'); P.pos.y = g; P.vy = 0; P.onGround = true; }
    else if (P.pos.y - g > 0.25) P.onGround = false;
    // прицел и камера
    P.aim = Z.lerp(P.aim, P.aiming && !WEAPONS[P.cur].melee ? 1 : 0, Math.min(1, dt * 12));
    camera.fov = Z.lerp(72, 52, P.aim); camera.updateProjectionMatrix();
    var eye = Z.lerp(EYE, CROUCH_EYE, P.crouch);
    var bobY = P.moving && P.onGround ? Math.sin(P.bob * 2) * 0.035 * (1 - P.aim * 0.8) : 0;
    var drunk = P.drunk > 0 ? Math.sin(Date.now() / 600) * 0.03 * Math.min(1, P.drunk / 3) : 0;
    P.drunk = Math.max(0, P.drunk - dt);
    camera.position.set(P.pos.x, P.pos.y + eye + bobY, P.pos.z);
    camera.rotation.set(P.pitch, P.yaw + drunk, drunk * 0.5);
    Z.Sound.listener.x = P.pos.x; Z.Sound.listener.z = P.pos.z;

    // оружие
    P.cd = Math.max(0, P.cd - dt); P.recoil = Math.max(0, P.recoil - dt * 3);
    P.swap = Math.max(0, (P.swap || 0) - dt); P.knife = Math.max(0, (P.knife || 0) - dt * 3);
    if (P.reloading > 0) { P.reloading -= dt; if (P.reloading <= 0) finishReload(); }
    if (mouse && WEAPONS[P.cur].auto) shoot();
    if (P.muzzleT > 0) { P.muzzleT -= dt; if (P.muzzleT <= 0) vw.muzzle.visible = false; }
    var a = P.aim, k = P.cur;
    var base = k === 'ak' ? [Z.lerp(0.16, 0, a), Z.lerp(-0.17, -0.098, a), Z.lerp(-0.35, -0.28, a)] : k === 'pm' ? [Z.lerp(0.19, 0, a), Z.lerp(-0.19, -0.1, a), Z.lerp(-0.45, -0.36, a)] : [0.2, -0.2, -0.36];
    var sway = P.moving ? Math.sin(P.bob) * 0.012 * (1 - a * 0.8) : Math.sin(Date.now() / 900) * 0.003;
    var rl = P.reloading > 0 ? Math.sin(Math.min(1, (WEAPONS[k].reload - P.reloading) / WEAPONS[k].reload) * Math.PI) : 0;
    view.position.set(base[0] + sway, base[1] + Math.abs(sway) * 0.6 - rl * 0.12 - P.swap * 0.4, base[2] + P.recoil * 0.05);
    view.rotation.set(P.recoil * 0.08 + rl * 0.6, 0, rl * 0.4);
    if (k === 'knife') { var ks = Math.sin(P.knife * Math.PI); view.rotation.set(-ks * 0.6, ks * 0.9, -ks * 0.5); view.position.x = 0.2 - ks * 0.2; }
    vw.muzzle.position.set(base[0], base[1] + 0.02, base[2] - (k === 'ak' ? 0.82 : 0.2));
    $('#cross').classList.toggle('hide', P.aim > 0.6);
    var spread = WEAPONS[k].melee ? 4 : (6 + P.recoil * 30 + (P.moving ? 8 : 0)) * (1 - P.aim);
    $$('#cross i').forEach(function (el, i) { el.style.transform = i === 0 ? 'translateY(' + (-spread - 8) + 'px)' : i === 1 ? 'translateY(' + spread + 'px)' : i === 2 ? 'translateX(' + (-spread - 8) + 'px)' : 'translateX(' + spread + 'px)'; });

    // радиация
    var radRate = 0;
    W.radZones.forEach(function (z) { var d = Math.hypot(P.pos.x - z.x, P.pos.z - z.z); if (d < z.r) radRate += z.power * (1 - d / z.r); });
    P.rad = Z.clamp(P.rad + radRate * dt * 2.2 - dt * 0.25, 0, 120);
    if (P.rad > 10) { P.hp -= (P.rad - 10) * 0.012 * dt; if (P.hp <= 0) die('rad'); }
    geigerAcc += radRate * dt * 7;
    while (geigerAcc > 1) { geigerAcc -= Math.random() * 1.5; Z.Sound.geiger(Math.min(1, radRate / 5)); }
    $('#radfx').style.opacity = Z.clamp(P.rad / 100, 0, 0.8) * (0.6 + Math.random() * 0.4);
    // аномалии
    var near = false;
    anomalies.forEach(function (A) {
      var d = Math.hypot(P.pos.x - A.def.x, P.pos.z - A.def.z);
      if (d < A.def.r + 4) near = true;
      if (d < A.def.r && Math.abs(P.pos.y - A.def.y) < 2.5) {
        triggerAnomaly(A);
        if (A.def.type === 'voronka') { var pull = (1 - d / A.def.r) * 7 * dt; P.pos.x += (A.def.x - P.pos.x) / (d || 1) * pull; P.pos.z += (A.def.z - P.pos.z) / (d || 1) * pull; if (A.active > 0) damagePlayer(28 * dt * 2, 'anomaly'); if (d < 0.6) { damagePlayer(45, 'anomaly'); P.vy = 7; P.pos.x += (Math.random() - .5) * 4; P.pos.z += 3; } }
        if (A.def.type === 'electra' && A.active > 0.3) damagePlayer(32, 'anomaly');
        if (A.def.type === 'zharka' && A.active > 0) damagePlayer(40 * dt, 'anomaly');
      }
    });
    $('#anomWarn').hidden = !near;
    // детектор артефактов
    var best = 1e9;
    artifacts.forEach(function (ar) {
      if (ar.taken) return;
      var d = Math.hypot(P.pos.x - ar.def.x, P.pos.z - ar.def.z); if (d < best) best = d;
      ar.g.visible = d < 7;
    });
    detT -= dt;
    var leds = $$('.leds i'), lv = best < 30 ? Math.ceil((1 - best / 30) * 5) : 0;
    leds.forEach(function (l, i) { l.classList.toggle('on', i < lv); });
    $('#detDist').textContent = best < 30 ? best.toFixed(1) + ' м' : '—';
    if (best < 30 && detT <= 0) { detT = 0.12 + best / 30 * 1.3; Z.Sound.beep(900 + (30 - best) * 30); }
  }

  function updateWorld(dt) {
    var now = performance.now() / 1000;
    // солнце следует за игроком (тени только рядом)
    sun.position.copy(P.pos).addScaledVector(SUN_DIR, 100); sun.target.position.copy(P.pos);
    sky.position.copy(camera.position);
    NPC.forEach(function (n) { if (n.pos.distanceTo(P.pos) < 140 || n.alert > 0) updateNPC(n, dt); });
    // аномалии
    anomalies.forEach(function (A) {
      var a = A.def; A.t += dt; A.cd = Math.max(0, A.cd - dt); A.active = Math.max(0, A.active - dt);
      var d = Math.hypot(P.pos.x - a.x, P.pos.z - a.z); if (d > 80) return;
      var arr = A.pts.geometry.attributes.position.array;
      A.seed.forEach(function (s, i) {
        var x, y, z;
        if (a.type === 'voronka') { var ang = s[0] + A.t * (1.5 + s[1] * 2) * (A.active > 0 ? 4 : 1), rr = a.r * (0.2 + s[1] * 0.8) * (A.active > 0 ? 0.4 : 1); x = Math.cos(ang) * rr; z = Math.sin(ang) * rr; y = 0.1 + ((s[2] + A.t * 0.25) % 1) * 2.2 * (1 - s[1] * 0.5); }
        else if (a.type === 'electra') { x = (Math.random() - .5) * a.r * 0.9; z = (Math.random() - .5) * a.r * 0.9; y = Math.random() * 1.5 + 0.1; }
        else { var an2 = s[0] + A.t * 0.4; x = Math.cos(an2) * a.r * 0.4 * s[1]; z = Math.sin(an2) * a.r * 0.4 * s[1]; y = ((s[2] + A.t * 0.6) % 1) * (A.active > 0 ? 3 : 0.6); }
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      });
      A.pts.geometry.attributes.position.needsUpdate = true;
      if (a.type === 'electra') { A.light.intensity = 0.3 + Math.random() * 0.6 + (A.active > 0 ? 3 : 0); A.arcT -= dt; if (A.arcT <= 0 && d < 50) { A.arcT = 1.5 + Math.random() * 3; arc(A, 2); Z.Sound.noise(0.1, 6000, Z.Sound.vol(a.x, a.z, 0.1, 30), 'highpass'); } }
      if (a.type === 'voronka' && A.lens) A.lens.scale.setScalar(1 + Math.sin(A.t * 3) * 0.05 + (A.active > 0 ? -0.3 : 0));
      if (a.type === 'zharka' && A.active > 0 && Math.random() < 0.5) puff(new THREE.Vector3(a.x + (Math.random() - .5) * 0.6, a.y + 0.3, a.z + (Math.random() - .5) * 0.6), 0xff6a10, 0.8, 0.5, new THREE.Vector3(0, 4, 0), true);
      // NPC в аномалиях
      NPC.forEach(function (n) { if (!n.dead && Math.hypot(n.pos.x - a.x, n.pos.z - a.z) < a.r * 0.8) { triggerAnomaly(A); if (A.active > 0) damageNPC(n, 60 * dt * 2); } });
    });
    // болты
    bolts.forEach(function (b) {
      b.life -= dt;
      if (!b.rest) {
        b.v.y -= 12 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 10;
        var g = Z.heightAt(b.m.position.x, b.m.position.z);
        if (b.m.position.y <= g + 0.03) { b.m.position.y = g + 0.03; b.v.multiplyScalar(0.3); b.v.y = Math.abs(b.v.y) * 0.3; if (b.v.length() < 0.6) b.rest = true; Z.Sound.tone(2400, 0.04, 0.03, 'triangle'); }
        anomalies.forEach(function (A) { if (Math.hypot(b.m.position.x - A.def.x, b.m.position.z - A.def.z) < A.def.r && b.m.position.y < A.def.y + 2.5) { triggerAnomaly(A); if (A.def.type === 'voronka') { b.v.set((A.def.x - b.m.position.x) * 2, 4, (A.def.z - b.m.position.z) * 2); } } });
      }
    });
    bolts = bolts.filter(function (b) { if (b.life > 0) return true; scene.remove(b.m); return false; });
    // артефакты: парят и мерцают
    artifacts.forEach(function (a) { if (!a.taken && a.g.visible) { a.g.position.y = a.def.y + 0.15 + Math.sin(now * 2 + a.idx) * 0.08; a.core.rotation.y += dt; } });
    // костры
    fires.forEach(function (f) {
      f.light.intensity = 1.3 + Math.sin(now * 13 + f.def.x) * 0.25 + Math.random() * 0.3;
      if (Math.random() < 0.6 && f.light.position.distanceTo(P.pos) < 70) puff(new THREE.Vector3(f.def.x + (Math.random() - .5) * 0.4, f.def.y + 0.2, f.def.z + (Math.random() - .5) * 0.4), Math.random() < 0.7 ? 0xff7a20 : 0xffc040, 0.4 + Math.random() * 0.3, 0.5, new THREE.Vector3(0, 1.4, 0), true);
      if (Math.random() < 0.08) puff(new THREE.Vector3(f.def.x, f.def.y + 1.4, f.def.z), 0x555550, 1.2, 3, new THREE.Vector3(0.3, 0.9, 0));
      if (Math.random() < dt * 3) Z.Sound.fire(f.def.x, f.def.z);
    });
    W.lights.forEach(function (l) { l.light.intensity = l.base * (1 - l.flicker * Math.random() * (Math.random() < 0.05 ? 3 : 0.3)); });
    // эффекты
    FX.forEach(function (f) {
      f.life -= dt;
      if (f.line) { f.obj.material.opacity = Math.max(0, f.life / f.max); return; }
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.material.opacity = Math.max(0, f.life / f.max) * 0.8;
      f.obj.scale.setScalar(f.obj.scale.x + f.grow * dt);
    });
    FX = FX.filter(function (f) { if (f.life > 0) return true; scene.remove(f.obj); if (f.obj.geometry && f.line) f.obj.geometry.dispose(); f.obj.material.dispose(); return false; });
    // фоновые звуки Зоны
    ambT -= dt;
    if (ambT <= 0) {
      ambT = 8 + Math.random() * 14;
      var r = Math.random();
      if (r < 0.35) Z.Sound.tone(260 + Math.random() * 80, 1.6, 0.04, 'sine', 140); // далёкий вой
      else if (r < 0.6) Z.Sound.noise(0.35, 900, 0.07); // далёкий выстрел
      else if (r < 0.8) { Z.Sound.tone(900, 0.12, 0.03, 'sawtooth', 700); setTimeout(function () { Z.Sound.tone(850, 0.12, 0.03, 'sawtooth', 650); }, 180); } // ворона
    }
    // подсказка взаимодействия
    var it = findInteract(), pr = $('#prompt');
    if (it && !uiOpen) { pr.hidden = false; pr.textContent = (isTouch ? '' : '[E] ') + it.label; } else pr.hidden = true;
    saveT += dt; if (saveT > 45) { saveT = 0; save(); }
    hudT -= dt; if (hudT <= 0) { hudT = 0.1; hud(); updateCompass(); }
  }

  // ---------- главный цикл
  var last = performance.now(), grainT = 0, menuT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'play' && !uiOpen) { updatePlayer(dt); updateWorld(dt); }
    else if (state === 'play' && uiOpen) { /* мир на паузе, пока открыт КПК/торговля */ }
    else if (state === 'menu' && W) {
      menuT += dt * 0.04;
      var cx = -60 + Math.cos(menuT) * 30, cz = 40 + Math.sin(menuT) * 30;
      camera.position.set(cx, Z.heightAt(cx, cz) + 6, cz); camera.lookAt(POIlook.x, Z.heightAt(POIlook.x, POIlook.z) + 2, POIlook.z);
      sun.position.copy(camera.position).addScaledVector(SUN_DIR, 100); sun.target.position.copy(camera.position);
      sky.position.copy(camera.position);
    }
    grainT -= dt; if (grainT <= 0) { grainT = 0.05; grain(); }
    renderer.clear();
    renderer.render(scene, camera);
    if (state === 'play' && !uiOpen) { renderer.clearDepth(); renderer.render(vScene, vCam); }
  }
  var POIlook = { x: -78, z: 8 };

  // ---------- загрузка мира (после первой отрисовки меню)
  setTimeout(function () {
    W = Z.buildWorld(scene);
    indexColliders(); buildMapBase(); buildViewModels();
    linearize(scene); linearize(vScene);
    state = 'menu';
    $('#loadingNote').textContent = '';
    $('#btnLoad').hidden = !hasSave();
    requestAnimationFrame(frame);
  }, 30);

  window.__zona = { get P() { return P; }, get NPC() { return NPC; }, get W() { return W; }, get state() { return state; }, start: startGame, shoot: shoot, interact: interact, keys: keys, look: look, damageNPC: damageNPC, openUI: openUI, closeUI: closeUI, throwBolt: throwBolt, completeQuest: completeQuest };
})(window.Z);
