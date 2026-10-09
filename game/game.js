/* СТОП-КАДР — шутер от первого лица, где время идёт, только когда движешься ты.
 * three.js r128 (глобальный THREE). Мир — сетка клеток CELL×CELL метров. */
(function () {
  'use strict';

  var CELL = 2, WALL_H = 4, EYE = 1.6, PLAYER_R = 0.35, ENEMY_R = 0.4;
  var $ = function (s) { return document.querySelector(s); };
  var isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  // ---------- Оружие
  var WEAPONS = {
    pistol:  { name: 'Пистолет', ammo: 6,  cd: 0.32, spread: 0.008, pellets: 1, auto: false, speed: 70, eCd: 1.25, eSpread: 0.05 },
    rifle:   { name: 'Автомат',  ammo: 24, cd: 0.09, spread: 0.02,  pellets: 1, auto: true,  speed: 75, eCd: 0.13, eSpread: 0.07, burst: 5 },
    shotgun: { name: 'Дробовик', ammo: 3,  cd: 0.75, spread: 0.08,  pellets: 7, auto: false, speed: 60, eCd: 1.7,  eSpread: 0.1 },
    katana:  { name: 'Катана',   melee: true, cd: 0.42, range: 2.7 }
  };
  var PUNCH = { cd: 0.38, range: 1.8 };

  // ---------- Уровни. # стена, C колонна, T стол, P игрок, X точка подкрепления
  // враги: a пистолет, b автомат, c дробовик, d катана, e без оружия; на полу: p r s k
  var LEVELS = [
    { name: 'Ресепшн', weapon: null,
      hint: 'Время движется, только когда движешься ты. Подбери пистолет (E) и стреляй (ЛКМ).',
      map: [
        '#############',
        '#P...#......#',
        '#..p.#..e...#',
        '#....T......#',
        '#.......C...#',
        '#..T........#',
        '#.....#..a..#',
        '#..a..#.....#',
        '#############'] },
    { name: 'Бар', weapon: 'katana',
      hint: 'Катана рубит врагов и летящие пули. Подойди и ударь (ЛКМ).',
      map: [
        '###############',
        '#.....#.......#',
        '#.a...#...c...#',
        '#.....T.......#',
        '#.TTT...e..C..#',
        '#.............#',
        '#..C.....TTT..#',
        '#P......a...e.#',
        '###############'] },
    { name: 'Коридор', weapon: 'pistol', reinforce: { total: 9, alive: 4 },
      hint: 'Закончились патроны — брось пистолет во врага (ПКМ / Q), он выронит оружие.',
      map: [
        '#################',
        '#X.....C.....C.X#',
        '#...............#',
        '#..C...b...C..a.#',
        '#...............#',
        '#P.....T.....r..#',
        '#################'] },
    { name: 'Склад', weapon: 'rifle', reinforce: { total: 13, alive: 5 },
      hint: 'Автомат стреляет очередью, пока держишь кнопку. Не стой на месте долго — время всё равно идёт, когда стреляешь.',
      map: [
        '###################',
        '#X.......#.......X#',
        '#..TT..a.#..b..TT.#',
        '#.................#',
        '#..C...TTT...C..s.#',
        '#.....k...........#',
        '#..TT.....a....TT.#',
        '#P.......e........#',
        '#X.......#.......X#',
        '###################'] },
    { name: 'Крыша', weapon: 'shotgun', reinforce: { total: 16, alive: 6 },
      hint: 'Последний бой. Дробовик бьёт веером. Подбирай всё, что падает.',
      map: [
        '#####################',
        '#X........C........X#',
        '#...................#',
        '#..T..a.......b..T..#',
        '#.......C...C.......#',
        '#..d.............c..#',
        '#.......C...C.......#',
        '#..T..r...P...k..T..#',
        '#...................#',
        '#X........C........X#',
        '#####################'] }
  ];

  // ---------- Сохранение прогресса
  function loadProgress() { try { return Math.max(1, parseInt(localStorage.getItem('stopkadr-unlocked') || '1', 10) || 1); } catch (e) { return 1; } }
  function saveProgress(n) { try { localStorage.setItem('stopkadr-unlocked', String(n)); } catch (e) { /* недоступно */ } }
  var unlocked = loadProgress();

  // ---------- Звук (синтез)
  var Sound = {
    ctx: null,
    init: function () {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    noise: function (dur, freq, gain, type) {
      var c = this.ctx; if (!c) return;
      var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
      var g = c.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    },
    tone: function (freq, dur, gain, type) {
      var c = this.ctx; if (!c) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    },
    shot: function (big) { this.noise(big ? 0.35 : 0.18, big ? 1400 : 2200, big ? 0.5 : 0.35); this.tone(big ? 70 : 110, 0.15, 0.25, 'triangle'); },
    shatter: function () { this.noise(0.4, 5000, 0.25, 'highpass'); for (var i = 0; i < 3; i++) this.tone(1800 + Math.random() * 2200, 0.25 + Math.random() * 0.3, 0.05); },
    swing: function () { this.noise(0.2, 900, 0.18, 'bandpass'); },
    punch: function () { this.tone(90, 0.12, 0.3, 'square'); this.noise(0.08, 600, 0.2); },
    pick: function () { this.tone(900, 0.06, 0.12, 'square'); this.tone(1300, 0.08, 0.08, 'square'); },
    death: function () { this.tone(55, 0.9, 0.5, 'sawtooth'); this.noise(0.6, 400, 0.3); },
    click: function () { this.tone(1500, 0.03, 0.08, 'square'); }
  };

  // ---------- three.js
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
  renderer.shadowMap.enabled = !isTouch;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  $('#stage').appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeec);
  scene.fog = new THREE.Fog(0xeeeeec, 18, 60);
  var camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  // Отдельная сцена для оружия в руках — рисуется поверх, не проваливается в стены
  var viewScene = new THREE.Scene();
  var viewCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  viewScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.0));
  var vLight = new THREE.DirectionalLight(0xffffff, 0.6); vLight.position.set(1, 2, 1); viewScene.add(vLight);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b8b8, 0.95));
  var sun = new THREE.DirectionalLight(0xffffff, 0.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun); scene.add(sun.target);

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = viewCam.aspect = w / h;
    viewCam.fov = w < h ? 95 : 60; // на вертикальном экране оружие иначе уезжает за край
    camera.updateProjectionMatrix(); viewCam.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Материалы и геометрии
  var MAT = {
    wall: new THREE.MeshLambertMaterial({ color: 0xf6f6f4 }),
    floor: new THREE.MeshLambertMaterial({ color: 0xdcdcda }),
    ceil: new THREE.MeshLambertMaterial({ color: 0xfafafa }),
    table: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    enemy: new THREE.MeshLambertMaterial({ color: 0xe3241b, emissive: 0x4a0602, flatShading: true }),
    enemyHit: new THREE.MeshLambertMaterial({ color: 0xff6b5e, emissive: 0x8a1208, flatShading: true }),
    black: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    steel: new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
    blade: new THREE.MeshLambertMaterial({ color: 0x9a9a9a, emissive: 0x222222 }),
    bullet: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    trail: new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }),
    ring: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    shard: new THREE.MeshLambertMaterial({ color: 0xe3241b, emissive: 0x3a0402, flatShading: true }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffe9a8 })
  };
  var GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    shard: new THREE.TetrahedronGeometry(0.11),
    bullet: new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6).rotateX(Math.PI / 2),
    ring: new THREE.RingGeometry(0.45, 0.55, 28).rotateX(-Math.PI / 2),
    flash: new THREE.SphereGeometry(0.09, 8, 6)
  };
  function box(w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(GEO.box, mat); m.scale.set(w, h, d); m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true; return m;
  }

  // Модель оружия: ствол вдоль -Z
  function weaponMesh(type) {
    var g = new THREE.Group();
    if (type === 'pistol') {
      g.add(box(0.06, 0.07, 0.24, MAT.black, 0, 0.03, -0.06));
      g.add(box(0.05, 0.13, 0.06, MAT.black, 0, -0.06, 0.03));
    } else if (type === 'rifle') {
      g.add(box(0.07, 0.09, 0.62, MAT.black, 0, 0.02, -0.12));
      g.add(box(0.03, 0.03, 0.22, MAT.steel, 0, 0.04, -0.52));
      g.add(box(0.05, 0.16, 0.06, MAT.black, 0, -0.08, 0.02));
      g.add(box(0.05, 0.14, 0.05, MAT.steel, 0, -0.08, -0.16));
      g.add(box(0.06, 0.1, 0.18, MAT.black, 0, 0, 0.22));
    } else if (type === 'shotgun') {
      g.add(box(0.06, 0.06, 0.72, MAT.black, 0, 0.03, -0.18));
      g.add(box(0.05, 0.05, 0.3, MAT.steel, 0, -0.03, -0.3));
      g.add(box(0.06, 0.12, 0.24, MAT.black, 0, -0.02, 0.26));
    } else if (type === 'katana') {
      g.add(box(0.025, 0.06, 0.95, MAT.blade, 0, 0, -0.58));
      g.add(box(0.12, 0.1, 0.025, MAT.black, 0, 0, -0.1));
      g.add(box(0.035, 0.04, 0.22, MAT.black, 0, 0, 0.02));
    }
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ---------- Состояние
  var S = {
    state: 'menu', levelIdx: 0, grid: [], rows: 0, cols: 0, world: null,
    enemies: [], bullets: [], pickups: [], thrown: [], shards: [], flashes: [],
    player: null, timeScale: 0.05, burst: 0, look: 0, reinf: null, spawns: [],
    flow: null, flowCell: -1, flowT: 0, levelTime: 0, kills: 0
  };

  function solidType(ch) { return ch === '#' || ch === 'C' || ch === 'T'; }
  function cellAt(x, z) {
    var c = Math.round(x / CELL), r = Math.round(z / CELL);
    if (r < 0 || r >= S.rows || c < 0 || c >= S.cols) return '#';
    return S.grid[r][c];
  }
  function halfOf(ch) { return ch === '#' ? CELL / 2 : ch === 'C' ? 0.42 : 0.9; }
  // Препятствие в точке (x, y, z): стены и колонны — по всей высоте, столы — ниже 0,95 м
  function blockedAt(x, y, z) {
    var c = Math.round(x / CELL), r = Math.round(z / CELL);
    if (r < 0 || r >= S.rows || c < 0 || c >= S.cols) return true;
    var ch = S.grid[r][c];
    if (!solidType(ch)) return false;
    if (ch === 'T' && y > 0.95) return false;
    var h = halfOf(ch);
    return Math.abs(x - c * CELL) <= h && Math.abs(z - r * CELL) <= h;
  }
  function lineOfSight(ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz), n = Math.ceil(L / 0.2);
    for (var i = 1; i < n; i++) {
      var t = i / n;
      if (blockedAt(ax + dx * t, ay + dy * t, az + dz * t)) return false;
    }
    return true;
  }
  // Выталкивание круга из препятствий
  function collide(p, r) {
    var c0 = Math.round(p.x / CELL), r0 = Math.round(p.z / CELL);
    for (var rr = r0 - 1; rr <= r0 + 1; rr++) for (var cc = c0 - 1; cc <= c0 + 1; cc++) {
      var ch = (rr < 0 || rr >= S.rows || cc < 0 || cc >= S.cols) ? '#' : S.grid[rr][cc];
      if (!solidType(ch)) continue;
      var h = halfOf(ch), cx = cc * CELL, cz = rr * CELL;
      var qx = Math.max(cx - h, Math.min(p.x, cx + h)), qz = Math.max(cz - h, Math.min(p.z, cz + h));
      var dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d < 1e-6) { // центр внутри — выталкиваем по кратчайшей оси
          var ox = (p.x - cx), oz = (p.z - cz);
          if (Math.abs(ox) > Math.abs(oz)) p.x = cx + Math.sign(ox || 1) * (h + r); else p.z = cz + Math.sign(oz || 1) * (h + r);
        } else { p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
      }
    }
  }

  // ---------- Поле путей (BFS от клетки игрока)
  function passable(r, c) { return r >= 0 && r < S.rows && c >= 0 && c < S.cols && !solidType(S.grid[r][c]); }
  function buildFlow() {
    var pr = Math.round(S.player.pos.z / CELL), pc = Math.round(S.player.pos.x / CELL);
    var key = pr * S.cols + pc;
    if (key === S.flowCell && S.flow) return;
    S.flowCell = key;
    var dist = new Float32Array(S.rows * S.cols).fill(1e9);
    if (!passable(pr, pc)) { S.flow = dist; return; }
    var q = [[pr, pc]]; dist[key] = 0;
    var dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
    // Дейкстра на маленькой сетке — простой очередью с повторной релаксацией
    while (q.length) {
      var cur = q.shift(), d0 = dist[cur[0] * S.cols + cur[1]];
      for (var i = 0; i < 8; i++) {
        var nr = cur[0] + dirs[i][0], nc = cur[1] + dirs[i][1];
        if (!passable(nr, nc)) continue;
        if (dirs[i][2] > 1 && (!passable(cur[0], nc) || !passable(nr, cur[1]))) continue;
        var nd = d0 + dirs[i][2], k = nr * S.cols + nc;
        if (nd < dist[k] - 1e-6) { dist[k] = nd; q.push([nr, nc]); }
      }
    }
    S.flow = dist;
  }
  function flowStep(pos) {
    if (!S.flow) buildFlow();
    var r = Math.round(pos.z / CELL), c = Math.round(pos.x / CELL), best = null, bd = S.flow[r * S.cols + c];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var nr = r + dr, nc = c + dc;
      if (!passable(nr, nc)) continue;
      if (dr && dc && (!passable(r, nc) || !passable(nr, c))) continue;
      var d = S.flow[nr * S.cols + nc];
      if (d < bd) { bd = d; best = { x: nc * CELL, z: nr * CELL }; }
    }
    return best;
  }

  // ---------- Построение уровня
  function clearWorld() {
    if (S.world) scene.remove(S.world);
    S.world = new THREE.Group(); scene.add(S.world);
    S.enemies = []; S.bullets = []; S.pickups = []; S.thrown = []; S.shards = []; S.flashes = []; S.spawns = [];
    S.flow = null; S.flowCell = -1; S.flowT = 0;
  }

  function loadLevel(idx) {
    S.levelIdx = idx;
    var L = LEVELS[idx];
    clearWorld();
    S.grid = L.map.map(function (row) { return row.split(''); });
    S.rows = S.grid.length; S.cols = S.grid[0].length;
    var W = (S.cols - 1) * CELL, D = (S.rows - 1) * CELL;

    var floor = new THREE.Mesh(new THREE.PlaneGeometry(W + CELL, D + CELL), MAT.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); floor.receiveShadow = true;
    S.world.add(floor);
    // сетка плитки на полу
    var grid = new THREE.GridHelper(Math.max(W, D) + CELL, Math.round((Math.max(W, D) + CELL) / CELL), 0xc8c8c6, 0xc8c8c6);
    grid.position.set(W / 2, 0.003, D / 2); S.world.add(grid);
    var ceil = new THREE.Mesh(new THREE.PlaneGeometry(W + CELL, D + CELL), MAT.ceil);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(W / 2, WALL_H, D / 2); S.world.add(ceil);
    // светильники на потолке
    for (var lx = CELL * 2; lx < W; lx += CELL * 4) for (var lz = CELL * 2; lz < D; lz += CELL * 3) {
      var lamp = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lamp.scale.set(1.6, 0.04, 0.3); lamp.position.set(lx, WALL_H - 0.03, lz); S.world.add(lamp);
    }

    sun.position.set(W / 2 + 8, 22, D / 2 + 5); sun.target.position.set(W / 2, 0, D / 2);
    var sc = sun.shadow.camera, ext = Math.max(W, D) * 0.75 + 4;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 60; sc.updateProjectionMatrix();

    var start = { x: CELL, z: CELL };
    for (var r = 0; r < S.rows; r++) for (var c = 0; c < S.cols; c++) {
      var ch = S.grid[r][c], x = c * CELL, z = r * CELL;
      if (ch === '#') {
        // не рисуем стены, полностью окружённые стенами
        var inner = true;
        for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
          var rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < S.rows && cc >= 0 && cc < S.cols && S.grid[rr][cc] !== '#') inner = false;
        }
        if (!inner) S.world.add(box(CELL, WALL_H, CELL, MAT.wall, x, WALL_H / 2, z));
      } else if (ch === 'C') {
        S.world.add(box(0.84, WALL_H, 0.84, MAT.wall, x, WALL_H / 2, z));
      } else if (ch === 'T') {
        S.world.add(box(1.8, 0.08, 1.8, MAT.table, x, 0.9, z));
        S.world.add(box(1.5, 0.86, 1.5, MAT.wall, x, 0.43, z));
      } else if (ch === 'P') { start = { x: x, z: z }; S.grid[r][c] = '.'; }
      else if (ch === 'X') { S.spawns.push({ x: x, z: z }); S.grid[r][c] = '.'; }
      else if ('abcde'.indexOf(ch) >= 0) {
        spawnEnemy(x, z, { a: 'pistol', b: 'rifle', c: 'shotgun', d: 'katana', e: null }[ch]);
        S.grid[r][c] = '.';
      } else if ('prsk'.indexOf(ch) >= 0) {
        var t = { p: 'pistol', r: 'rifle', s: 'shotgun', k: 'katana' }[ch];
        addPickup(t, WEAPONS[t].ammo, x, z);
        S.grid[r][c] = '.';
      }
    }

    // игрок смотрит в сторону ближайшего врага
    var yaw = 0;
    if (S.enemies.length) {
      var e0 = S.enemies.slice().sort(function (a, b) { return Math.hypot(a.pos.x - start.x, a.pos.z - start.z) - Math.hypot(b.pos.x - start.x, b.pos.z - start.z); })[0];
      yaw = Math.atan2(-(e0.pos.x - start.x), -(e0.pos.z - start.z));
    }
    S.player = {
      pos: new THREE.Vector3(start.x, 0, start.z), yaw: yaw, pitch: 0,
      weapon: L.weapon, ammo: L.weapon && !WEAPONS[L.weapon].melee ? WEAPONS[L.weapon].ammo : 0,
      cd: 0, alive: true, bob: 0, swing: 0, recoil: 0, firing: false
    };
    S.reinf = L.reinforce ? { left: L.reinforce.total - S.enemies.length, alive: L.reinforce.alive, t: 2 } : null;
    S.levelTime = 0; S.kills = 0; S.timeScale = 0.05; S.burst = 0;
    setViewWeapon();
    updateHud();
    showHint(L.hint);
  }

  // ---------- Враги
  function makeEnemyMesh() {
    var g = new THREE.Group();
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.3), MAT.enemy); torso.position.y = 1.22;
    var head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), MAT.enemy); head.position.y = 1.8;
    function limb(w, h, x, y) {
      var pivot = new THREE.Group(); pivot.position.set(x, y, 0);
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), MAT.enemy); m.position.y = -h / 2; pivot.add(m);
      g.add(pivot); return pivot;
    }
    var legL = limb(0.2, 0.86, -0.14, 0.86), legR = limb(0.2, 0.86, 0.14, 0.86);
    var armL = limb(0.15, 0.66, -0.37, 1.55), armR = limb(0.15, 0.66, 0.37, 1.55);
    g.add(torso); g.add(head);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return { group: g, torso: torso, head: head, legL: legL, legR: legR, armL: armL, armR: armR };
  }
  function setEnemyWeapon(e, type) {
    if (e.wMesh) { e.parts.armR.remove(e.wMesh); e.wMesh = null; }
    e.weapon = type;
    if (type) {
      e.wMesh = weaponMesh(type);
      e.wMesh.rotation.x = -Math.PI / 2;
      e.wMesh.position.y = -0.66;
      if (type === 'katana') e.wMesh.position.z = 0;
      e.parts.armR.add(e.wMesh);
      e.ammo = WEAPONS[type].melee ? 0 : Math.ceil(WEAPONS[type].ammo * 0.6);
    }
  }
  function spawnEnemy(x, z, weapon) {
    var parts = makeEnemyMesh();
    var e = {
      pos: new THREE.Vector3(x, 0, z), yaw: 0, parts: parts, mesh: parts.group,
      weapon: null, wMesh: null, ammo: 0, hp: 2, stagger: 0, cd: 1 + Math.random(), react: 0.6 + Math.random() * 0.5,
      seen: false, walk: Math.random() * 6, windup: 0, burstLeft: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0, alive: true
    };
    parts.group.position.copy(e.pos);
    S.world.add(parts.group);
    setEnemyWeapon(e, weapon);
    S.enemies.push(e);
    return e;
  }
  function killEnemy(e, dir) {
    if (!e.alive) return;
    e.alive = false;
    S.kills++;
    if (e.weapon) addPickup(e.weapon, e.ammo, e.pos.x + (Math.random() - .5) * .6, e.pos.z + (Math.random() - .5) * .6);
    shatter(e, dir);
    S.world.remove(e.mesh);
    S.enemies = S.enemies.filter(function (x) { return x !== e; });
    Sound.shatter();
    updateHud();
  }
  function disarm(e) {
    if (e.weapon) {
      var t = e.weapon, a = e.ammo;
      setEnemyWeapon(e, null);
      addPickup(t, a, e.pos.x + (Math.random() - .5), e.pos.z + (Math.random() - .5));
    }
    e.stagger = 1.1;
  }
  function shatter(e, dir) {
    var base = e.pos;
    for (var i = 0; i < 34; i++) {
      var m = new THREE.Mesh(GEO.shard, MAT.shard);
      var y = 0.2 + Math.random() * 1.8;
      m.position.set(base.x + (Math.random() - .5) * .5, y, base.z + (Math.random() - .5) * .5);
      m.scale.setScalar(0.6 + Math.random() * 1.4);
      var v = new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 3 + 0.5, (Math.random() - .5) * 4);
      if (dir) v.addScaledVector(dir, 3 + Math.random() * 3);
      S.world.add(m);
      S.shards.push({ mesh: m, vel: v, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), life: 3 + Math.random() * 2 });
    }
  }

  // ---------- Подбираемое оружие
  function addPickup(type, ammo, x, z) {
    var g = new THREE.Group();
    var w = weaponMesh(type); w.position.y = 0.5; w.rotation.y = Math.random() * 6;
    var ring = new THREE.Mesh(GEO.ring, MAT.ring); ring.position.y = 0.01;
    g.add(w); g.add(ring); g.position.set(x, 0, z);
    S.world.add(g);
    var p = { type: type, ammo: ammo, mesh: g, w: w, pos: g.position, t: Math.random() * 6 };
    collide(p.pos, 0.3);
    S.pickups.push(p);
    return p;
  }
  function removePickup(p) { S.world.remove(p.mesh); S.pickups = S.pickups.filter(function (x) { return x !== p; }); }

  // ---------- Пули
  function fireBullet(origin, dir, speed, owner, shooter) {
    var m = new THREE.Mesh(GEO.bullet, MAT.bullet);
    m.position.copy(origin); m.lookAt(origin.clone().add(dir));
    var tg = new THREE.BufferGeometry().setFromPoints([origin.clone(), origin.clone()]);
    var trail = new THREE.Line(tg, MAT.trail);
    S.world.add(m); S.world.add(trail);
    S.bullets.push({ pos: origin.clone(), start: origin.clone(), vel: dir.clone().multiplyScalar(speed), owner: owner, shooter: shooter, mesh: m, trail: trail, life: 4, age: 0 });
  }
  function removeBullet(b) { S.world.remove(b.mesh); S.world.remove(b.trail); b.trail.geometry.dispose(); b.dead = true; }
  function muzzleFlash(pos) {
    var m = new THREE.Mesh(GEO.flash, MAT.flash); m.position.copy(pos); S.world.add(m);
    S.flashes.push({ mesh: m, life: 0.06 });
  }

  // ---------- Игрок: оружие в руках
  var view = { group: new THREE.Group(), weapon: null, fistL: null, fistR: null };
  viewScene.add(view.group);
  function setViewWeapon() {
    while (view.group.children.length) view.group.remove(view.group.children[0]);
    var w = S.player.weapon;
    var skin = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
    if (!w) {
      view.fistL = box(0.09, 0.09, 0.14, skin, -0.16, -0.22, -0.42);
      view.fistR = box(0.09, 0.09, 0.14, skin, 0.16, -0.22, -0.42);
      view.group.add(view.fistL); view.group.add(view.fistR);
      view.weapon = null;
    } else {
      view.weapon = weaponMesh(w);
      if (w === 'katana') { view.weapon.position.set(0.3, -0.34, -0.55); view.weapon.rotation.set(0.5, 0.15, -0.35); view.weapon.scale.setScalar(0.8); }
      else { view.weapon.position.set(0.18, -0.19, -0.6); view.weapon.rotation.set(0.04, 0.2, 0); }
      view.group.add(view.weapon);
      view.group.add(box(0.08, 0.1, 0.12, skin, w === 'katana' ? 0.3 : 0.18, w === 'katana' ? -0.37 : -0.27, -0.5));
    }
  }

  function forward() {
    var p = S.player;
    return new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
  }
  function eyePos() { return new THREE.Vector3(S.player.pos.x, EYE, S.player.pos.z); }

  function playerAttack() {
    var p = S.player;
    if (!p.alive || p.cd > 0) return;
    var w = p.weapon;
    S.burst = 0.22;
    if (!w || WEAPONS[w].melee) {
      var isKatana = w === 'katana';
      var range = isKatana ? WEAPONS.katana.range : PUNCH.range;
      p.cd = isKatana ? WEAPONS.katana.cd : PUNCH.cd;
      p.swing = 1;
      if (isKatana) Sound.swing(); else Sound.punch();
      var f = forward(); f.y = 0; f.normalize();
      S.enemies.slice().forEach(function (e) {
        var d = new THREE.Vector3(e.pos.x - p.pos.x, 0, e.pos.z - p.pos.z), L = d.length();
        if (L < range + ENEMY_R && d.normalize().dot(f) > 0.6 && lineOfSight(p.pos.x, 1.2, p.pos.z, e.pos.x, 1.2, e.pos.z)) {
          if (isKatana) killEnemy(e, f);
          else { e.hp--; disarm(e); if (e.hp <= 0) killEnemy(e, f); else flashEnemy(e); }
        }
      });
      if (isKatana) {
        S.bullets.forEach(function (b) {
          if (b.dead || b.owner !== 'enemy') return;
          var d = new THREE.Vector3(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z), L = d.length();
          if (L < range + 0.4 && d.normalize().dot(f) > 0.35) { removeBullet(b); Sound.tone(2600, 0.12, 0.08, 'square'); }
        });
      }
      return;
    }
    if (p.ammo <= 0) { playerThrow(); return; }
    var W = WEAPONS[w];
    p.cd = W.cd; p.ammo--; p.recoil = 1;
    var dir0 = forward(), origin = eyePos().addScaledVector(dir0, 0.6);
    origin.y -= 0.12;
    for (var i = 0; i < W.pellets; i++) {
      var d = dir0.clone();
      d.x += (Math.random() - .5) * W.spread * 2; d.y += (Math.random() - .5) * W.spread * 2; d.z += (Math.random() - .5) * W.spread * 2;
      fireBullet(origin, d.normalize(), W.speed, 'player', null);
    }
    muzzleFlash(origin);
    Sound.shot(w === 'shotgun');
    updateHud();
  }

  function playerThrow() {
    var p = S.player;
    if (!p.alive || !p.weapon) return;
    var f = forward();
    var g = weaponMesh(p.weapon);
    var pos = eyePos().addScaledVector(f, 0.5); pos.y -= 0.15;
    g.position.copy(pos);
    S.world.add(g);
    S.thrown.push({ type: p.weapon, ammo: p.ammo, mesh: g, pos: pos, vel: f.clone().multiplyScalar(19).add(new THREE.Vector3(0, 1.5, 0)), spin: 14, hit: false });
    p.weapon = null; p.ammo = 0; p.cd = 0.15;
    S.burst = 0.22;
    Sound.swing();
    setViewWeapon(); updateHud();
  }

  function nearestPickup() {
    var p = S.player, f = forward(); f.y = 0; f.normalize();
    var best = null, bs = 1e9;
    S.pickups.forEach(function (k) {
      var d = new THREE.Vector3(k.pos.x - p.pos.x, 0, k.pos.z - p.pos.z), L = d.length();
      if (L > 2.8) return;
      var dot = L > 0.01 ? d.normalize().dot(f) : 1;
      if (L > 1.2 && dot < 0.55) return;
      var s = L - dot;
      if (s < bs) { bs = s; best = k; }
    });
    return best;
  }
  function playerPickup(k) {
    var p = S.player;
    k = k || nearestPickup();
    if (!k || !p.alive) return;
    if (p.weapon) addPickup(p.weapon, p.ammo, p.pos.x, p.pos.z); // меняем оружие: старое падает под ноги
    p.weapon = k.type; p.ammo = k.ammo;
    removePickup(k);
    S.burst = 0.15;
    Sound.pick();
    setViewWeapon(); updateHud();
  }

  function flashEnemy(e) {
    e.parts.group.traverse(function (o) { if (o.isMesh && o.material === MAT.enemy) o.material = MAT.enemyHit; });
    setTimeout(function () { e.parts.group.traverse(function (o) { if (o.isMesh && o.material === MAT.enemyHit) o.material = MAT.enemy; }); }, 220);
  }

  function playerDie() {
    if (!S.player.alive) return;
    S.player.alive = false;
    S.state = 'dead';
    Sound.death();
    var fl = $('#flash'); fl.classList.add('on'); setTimeout(function () { fl.classList.remove('on'); }, 60);
    setTimeout(function () {
      if (S.state !== 'dead') return;
      $('#overTitle').textContent = 'Ты мёртв';
      $('#overText').textContent = LEVELS[S.levelIdx].name + ' · уничтожено врагов: ' + S.kills;
      showScreen('over');
    }, 900);
  }

  // ---------- Ввод
  var keys = {}, mouseDown = false, look = { x: 0, y: 0 }, touchMove = { x: 0, y: 0 };
  document.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (S.state === 'playing') {
      if (e.code === 'KeyE' || e.code === 'KeyF') playerPickup();
      if (e.code === 'KeyQ') playerThrow();
    }
    if (e.code === 'KeyR' && (S.state === 'playing' || S.state === 'dead')) restart();
    if (e.code === 'Enter' && S.state === 'cleared') nextLevel();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });
  renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { if (S.state === 'playing') e.preventDefault(); });
  renderer.domElement.addEventListener('mousedown', function (e) {
    if (isTouch) return;
    if (S.state === 'playing' && document.pointerLockElement !== renderer.domElement) { lock(); return; }
    if (S.state === 'cleared') { nextLevel(); return; }
    if (S.state !== 'playing') return;
    if (e.button === 0) { mouseDown = true; playerAttack(); }
    if (e.button === 2) playerThrow();
  });
  document.addEventListener('mouseup', function (e) { if (e.button === 0) mouseDown = false; });
  document.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement !== renderer.domElement || S.state !== 'playing') return;
    look.x += e.movementX; look.y += e.movementY;
  });
  function lock() {
    if (isTouch) return;
    try { var r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* без захвата курсора */ }
  }
  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement !== renderer.domElement && S.state === 'playing' && !isTouch) pause();
  });

  // Сенсорное управление
  (function () {
    if (!isTouch) return;
    document.body.classList.add('touch');
    var stick = $('#stick'), knob = stick.querySelector('i');
    var stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    window.addEventListener('touchstart', function (e) {
      if (S.state !== 'playing') return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.target.closest && t.target.closest('.tbtn')) continue;
        if (t.clientX < window.innerWidth * 0.42 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; stick.style.bottom = 'auto';
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === stickId) {
          var dx = t.clientX - sx, dy = t.clientY - sy, L = Math.hypot(dx, dy), m = Math.min(L, 50);
          if (L > 0) { dx = dx / L * m; dy = dy / L * m; }
          knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          touchMove.x = dx / 50; touchMove.y = dy / 50;
        } else if (t.identifier === lookId) {
          look.x += (t.clientX - lx) * 1.6; look.y += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    function end(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === stickId) { stickId = null; touchMove.x = touchMove.y = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    }
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    function btn(id, fn) {
      $(id).addEventListener('touchstart', function (e) { e.preventDefault(); if (S.state === 'playing') fn(true); else if (S.state === 'cleared') nextLevel(); }, { passive: false });
      $(id).addEventListener('touchend', function (e) { e.preventDefault(); fn(false); }, { passive: false });
    }
    btn('#tFire', function (down) { mouseDown = down; if (down) playerAttack(); });
    btn('#tThrow', function (down) { if (down) playerThrow(); });
    btn('#tPick', function (down) { if (down) playerPickup(); });
  })();

  // ---------- Обновление
  var tmpV = new THREE.Vector3();

  function updatePlayer(rdt) {
    var p = S.player;
    var mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchMove.x;
    var mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + touchMove.y;
    var mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > 0.01) {
      var L = Math.hypot(mx, mz); mx /= L; mz /= L;
      var sp = 5.2 * mag * rdt;
      var sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      p.pos.x += (mx * cos + mz * sin) * sp;
      p.pos.z += (-mx * sin + mz * cos) * sp;
      collide(p.pos, PLAYER_R);
      p.bob += rdt * 9 * mag;
    }
    // взгляд
    var sens = 0.0022;
    p.yaw -= look.x * sens; p.pitch -= look.y * sens;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
    S.look = Math.min(1, Math.hypot(look.x, look.y) / (rdt * 900 + 1e-6));
    look.x = look.y = 0;

    camera.position.set(p.pos.x, EYE + Math.sin(p.bob) * 0.03 * mag, p.pos.z);
    camera.rotation.y = p.yaw; camera.rotation.x = p.pitch;

    // время
    var target = Math.max(0.04, mag, S.look * 0.35, S.burst > 0 ? 1 : 0);
    S.timeScale += (target - S.timeScale) * Math.min(1, rdt * (target > S.timeScale ? 14 : 7));
    S.burst = Math.max(0, S.burst - rdt);
    $('#timeFill').style.width = Math.round(S.timeScale * 100) + '%';

    // автоогонь
    if (mouseDown && p.weapon && WEAPONS[p.weapon].auto && p.ammo > 0) playerAttack();

    // подсказка подобрать
    var k = nearestPickup();
    var pr = $('#prompt');
    if (k && p.alive) {
      if (!p.weapon && Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z) < 0.9) playerPickup(k);
      else { pr.hidden = false; pr.textContent = (isTouch ? 'Взять: ' : 'E — взять: ') + WEAPONS[k.type].name.toLowerCase(); }
    } else pr.hidden = true;
  }

  function updateView(rdt, gdt) {
    var p = S.player;
    p.cd = Math.max(0, p.cd - gdt * 1.0 - rdt * 0.15);
    p.recoil = Math.max(0, p.recoil - rdt * 8);
    p.swing = Math.max(0, p.swing - rdt * 4.5);
    view.group.position.set(Math.sin(p.bob) * 0.012, Math.abs(Math.cos(p.bob)) * 0.01, p.recoil * 0.06);
    view.group.rotation.set(p.recoil * 0.12, 0, 0);
    if (view.weapon && p.weapon === 'katana') {
      var s = p.swing, a = Math.sin(s * Math.PI);
      view.weapon.rotation.set(0.5 - a * 1.2, 0.15 + (1 - s) * 0 + a * 1.4, -0.35 - a * 0.6);
      view.weapon.position.x = 0.3 - a * 0.45;
    } else if (!p.weapon && view.fistR) {
      view.fistR.position.z = -0.42 - Math.sin(p.swing * Math.PI) * 0.3;
    }
  }

  function updateEnemies(gdt) {
    var p = S.player;
    S.flowT -= gdt;
    if (S.flowT <= 0) { buildFlow(); S.flowT = 0.2; }
    S.enemies.forEach(function (e) {
      var dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
      var see = p.alive && dist < 30 && lineOfSight(e.pos.x, 1.6, e.pos.z, p.pos.x, 1.4, p.pos.z);
      if (see && !e.seen) { e.seen = true; e.react = 0.45 + Math.random() * 0.5; }
      if (!see) e.seen = false;
      var face = Math.atan2(dx, dz);
      var move = null, speed = 2.6, armAim = false;

      if (e.stagger > 0) {
        e.stagger -= gdt; e.windup = 0;
        e.yaw += Math.sin(e.stagger * 20) * 0.03;
      } else {
        var W = e.weapon ? WEAPONS[e.weapon] : null;
        if (!e.weapon) {
          // без оружия: ищем ближайшее, иначе бежим драться
          var near = null, nd = 7;
          S.pickups.forEach(function (k) { var d = Math.hypot(k.pos.x - e.pos.x, k.pos.z - e.pos.z); if (d < nd && lineOfSight(e.pos.x, 1, e.pos.z, k.pos.x, 1, k.pos.z)) { nd = d; near = k; } });
          if (near && dist > 2.5) {
            move = { x: near.pos.x, z: near.pos.z }; face = Math.atan2(near.pos.x - e.pos.x, near.pos.z - e.pos.z);
            if (nd < 0.7) { setEnemyWeapon(e, near.type); e.ammo = near.ammo; removePickup(near); e.react = 0.5; }
          } else meleeLogic(e, PUNCH.range, 0.45, false);
        } else if (W.melee) {
          speed = 3.4; meleeLogic(e, 2.1, 0.32, true);
        } else {
          if (see && dist < 22) {
            armAim = true;
            // держим дистанцию и двигаемся вбок
            e.strafeT -= gdt; if (e.strafeT <= 0) { e.strafeT = 1 + Math.random() * 2; e.strafe *= -1; }
            var nx = dx / dist, nz = dz / dist;
            var want = dist > 9 ? 1 : dist < 4 ? -0.6 : 0;
            move = { x: e.pos.x + nx * want + -nz * e.strafe * 0.7, z: e.pos.z + nz * want + nx * e.strafe * 0.7 };
            speed = 1.6;
            if (e.react > 0) e.react -= gdt;
            else {
              e.cd -= gdt;
              if (e.cd <= 0) {
                if (e.ammo <= 0) { // пусто — бросает оружие и идёт в рукопашную
                  setEnemyWeapon(e, null);
                } else enemyShoot(e, W);
              }
            }
          } else {
            var st = flowStep(e.pos);
            if (st) move = st; else move = { x: p.pos.x, z: p.pos.z };
            if (st) face = Math.atan2(st.x - e.pos.x, st.z - e.pos.z);
          }
        }
      }
      function meleeLogic(e, range, windup, isKatana) {
        if (dist < range && see) {
          if (e.windup <= 0) e.windup = windup;
          e.windup -= gdt;
          if (e.windup <= 0) {
            if (dist < range + 0.3 && p.alive) { Sound[isKatana ? 'swing' : 'punch'](); playerDie(); }
            e.windup = 0; e.cd = 0.6;
          }
        } else {
          e.windup = 0;
          var st = see ? null : flowStep(e.pos);
          move = st || { x: p.pos.x, z: p.pos.z };
          if (st) face = Math.atan2(st.x - e.pos.x, st.z - e.pos.z);
        }
      }

      // поворот
      var dy = face - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      e.yaw += dy * Math.min(1, gdt * 8);
      // движение
      var moving = 0;
      if (move && e.stagger <= 0 && e.windup <= 0) {
        var mx = move.x - e.pos.x, mz = move.z - e.pos.z, L = Math.hypot(mx, mz);
        if (L > 0.05) {
          var s = Math.min(L, speed * gdt);
          e.pos.x += mx / L * s; e.pos.z += mz / L * s; moving = 1;
        }
      }
      // расталкивание
      S.enemies.forEach(function (o) {
        if (o === e) return;
        var ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d = Math.hypot(ox, oz);
        if (d > 0 && d < ENEMY_R * 2) { e.pos.x += ox / d * (ENEMY_R * 2 - d) * 0.5; e.pos.z += oz / d * (ENEMY_R * 2 - d) * 0.5; }
      });
      if (p.alive) {
        var px = e.pos.x - p.pos.x, pz = e.pos.z - p.pos.z, pd = Math.hypot(px, pz);
        if (pd > 0 && pd < ENEMY_R + PLAYER_R) { e.pos.x += px / pd * (ENEMY_R + PLAYER_R - pd); e.pos.z += pz / pd * (ENEMY_R + PLAYER_R - pd); }
      }
      collide(e.pos, ENEMY_R);

      // анимация
      e.walk += gdt * 9 * moving;
      var P = e.parts, sw = Math.sin(e.walk) * 0.7 * moving;
      P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
      P.armL.rotation.x = -sw * 0.6;
      if (e.windup > 0) P.armR.rotation.x = e.weapon === 'katana' ? -2.6 : -1.9;
      else if (armAim || (e.weapon && WEAPONS[e.weapon].melee && dist < 4)) P.armR.rotation.x = -Math.PI / 2;
      else P.armR.rotation.x = sw * 0.6;
      if (e.stagger > 0) { P.torso.rotation.x = -0.3; P.head.rotation.x = -0.4; } else { P.torso.rotation.x = 0; P.head.rotation.x = 0; }
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.y = e.yaw;
    });
  }

  function enemyShoot(e, W) {
    var p = S.player;
    var origin = new THREE.Vector3(e.pos.x, 1.45, e.pos.z);
    var fwd = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    origin.addScaledVector(fwd, 0.75);
    origin.x += Math.cos(e.yaw) * 0.37; origin.z -= Math.sin(e.yaw) * 0.37;
    var target = new THREE.Vector3(p.pos.x, 1.2 + Math.random() * 0.3, p.pos.z);
    var n = W.pellets || 1;
    for (var i = 0; i < n; i++) {
      var d = target.clone().sub(origin).normalize();
      d.x += (Math.random() - .5) * W.eSpread * 2; d.y += (Math.random() - .5) * W.eSpread; d.z += (Math.random() - .5) * W.eSpread * 2;
      fireBullet(origin, d.normalize(), 24, 'enemy', e);
    }
    muzzleFlash(origin);
    Sound.shot(e.weapon === 'shotgun');
    e.ammo--;
    if (W.burst) {
      if (e.burstLeft <= 0) e.burstLeft = W.burst;
      e.burstLeft--;
      e.cd = e.burstLeft > 0 ? W.eCd : 1.3 + Math.random() * 0.6;
    } else e.cd = W.eCd + Math.random() * 0.5;
  }

  function updateBullets(gdt) {
    var p = S.player;
    S.bullets.forEach(function (b) {
      if (b.dead) return;
      b.age += gdt; b.life -= gdt;
      var step = b.vel.length() * gdt, n = Math.max(1, Math.ceil(step / 0.2));
      var dir = b.vel.clone().normalize();
      for (var i = 0; i < n && !b.dead; i++) {
        b.pos.addScaledVector(b.vel, gdt / n);
        if (b.pos.y < 0 || b.pos.y > WALL_H || blockedAt(b.pos.x, b.pos.y, b.pos.z)) { removeBullet(b); break; }
        if (b.owner === 'enemy' && p.alive) {
          if (Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < PLAYER_R && b.pos.y < 1.85) { removeBullet(b); playerDie(); break; }
        }
        for (var j = 0; j < S.enemies.length; j++) {
          var e = S.enemies[j];
          if (b.shooter === e && b.age < 0.3) continue;
          if (Math.hypot(b.pos.x - e.pos.x, b.pos.z - e.pos.z) < ENEMY_R + 0.05 && b.pos.y < 2.0) { removeBullet(b); killEnemy(e, dir); break; }
        }
      }
      if (b.dead) return;
      if (b.life <= 0) { removeBullet(b); return; }
      b.mesh.position.copy(b.pos);
      var tailLen = Math.min(b.pos.distanceTo(b.start), 2.2);
      var tail = b.pos.clone().addScaledVector(dir, -tailLen);
      var arr = b.trail.geometry.attributes.position.array;
      arr[0] = tail.x; arr[1] = tail.y; arr[2] = tail.z; arr[3] = b.pos.x; arr[4] = b.pos.y; arr[5] = b.pos.z;
      b.trail.geometry.attributes.position.needsUpdate = true;
      b.trail.geometry.computeBoundingSphere();
    });
    S.bullets = S.bullets.filter(function (b) { return !b.dead; });
  }

  function updateThrown(gdt) {
    S.thrown.forEach(function (t) {
      var n = 4;
      for (var i = 0; i < n; i++) {
        var h = gdt / n;
        t.vel.y -= 9.8 * h;
        var nx = t.pos.x + t.vel.x * h, ny = t.pos.y + t.vel.y * h, nz = t.pos.z + t.vel.z * h;
        if (blockedAt(nx, ny, nz)) {
          if (blockedAt(nx, ny, t.pos.z)) t.vel.x *= -0.3; else t.vel.z *= -0.3;
          t.vel.multiplyScalar(0.5); t.hit = true; continue;
        }
        t.pos.set(nx, ny, nz);
        if (t.pos.y <= 0.08) { t.pos.y = 0.08; t.vel.y *= -0.25; t.vel.x *= 0.6; t.vel.z *= 0.6; t.hit = true; }
        if (!t.hit) {
          for (var j = 0; j < S.enemies.length; j++) {
            var e = S.enemies[j];
            if (Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z) < ENEMY_R + 0.2 && t.pos.y < 2.0) {
              var dir = t.vel.clone().setY(0).normalize();
              if (t.type === 'katana') killEnemy(e, dir);
              else { Sound.punch(); disarm(e); e.hp--; if (e.hp <= 0) killEnemy(e, dir); else flashEnemy(e); }
              t.vel.multiplyScalar(-0.2); t.hit = true;
              break;
            }
          }
        }
      }
      t.mesh.position.copy(t.pos);
      t.mesh.rotation.y += t.spin * gdt; t.mesh.rotation.x += t.spin * 0.4 * gdt;
      if (t.pos.y <= 0.1 && t.vel.length() < 0.6) t.done = true;
    });
    S.thrown = S.thrown.filter(function (t) {
      if (!t.done) return true;
      S.world.remove(t.mesh);
      addPickup(t.type, t.ammo, t.pos.x, t.pos.z);
      return false;
    });
  }

  function updateFx(gdt, rdt) {
    S.shards.forEach(function (s) {
      s.vel.y -= 9.8 * gdt;
      s.mesh.position.addScaledVector(s.vel, gdt);
      if (s.mesh.position.y < 0.05) { s.mesh.position.y = 0.05; s.vel.y *= -0.3; s.vel.x *= 0.7; s.vel.z *= 0.7; }
      s.mesh.rotation.x += s.spin.x * gdt; s.mesh.rotation.y += s.spin.y * gdt;
      s.life -= gdt;
      if (s.life < 1) s.mesh.scale.multiplyScalar(Math.max(0.9, 1 - gdt * 3));
    });
    S.shards = S.shards.filter(function (s) { if (s.life > 0) return true; S.world.remove(s.mesh); return false; });
    S.flashes.forEach(function (f) { f.life -= rdt; });
    S.flashes = S.flashes.filter(function (f) { if (f.life > 0) return true; S.world.remove(f.mesh); return false; });
    S.pickups.forEach(function (k) { k.t += rdt; k.w.rotation.y += rdt * 1.2; k.w.position.y = 0.5 + Math.sin(k.t * 2) * 0.06; });
  }

  function updateReinforcements(gdt) {
    var R = S.reinf;
    if (!R || R.left <= 0) return;
    R.t -= gdt;
    if (R.t > 0 || S.enemies.length >= R.alive) return;
    var p = S.player.pos;
    var spots = S.spawns.filter(function (s) { return Math.hypot(s.x - p.x, s.z - p.z) > 8; });
    if (!spots.length) return;
    var s = spots[Math.floor(Math.random() * spots.length)];
    var pool = ['pistol', 'pistol', 'rifle', 'shotgun', 'katana', null];
    spawnEnemy(s.x, s.z, pool[Math.floor(Math.random() * pool.length)]);
    R.left--; R.t = 1.2 + Math.random();
    updateHud();
  }

  function checkClear() {
    if (S.state !== 'playing' || !S.player.alive) return;
    if (S.enemies.length === 0 && (!S.reinf || S.reinf.left <= 0)) {
      S.state = 'cleared';
      if (document.pointerLockElement) document.exitPointerLock();
      var next = S.levelIdx + 2;
      if (next > unlocked && S.levelIdx + 1 < LEVELS.length) { unlocked = next; saveProgress(unlocked); }
      var last = S.levelIdx === LEVELS.length - 1;
      var seq = last ? ['СТОП', 'КАДР', 'СТОП', 'КАДР', 'ВСЁ.'] : ['СТОП', 'КАДР', 'СТОП', 'КАДР'];
      flashWords(seq, function () {
        if (last) {
          $('#overTitle').textContent = 'Пройдено';
          $('#overText').textContent = 'Все уровни зачищены. Время на последнем уровне: ' + S.levelTime.toFixed(1) + ' с.';
          showScreen('over');
        } else {
          $('#words').textContent = isTouch ? 'ДАЛЬШЕ ▸' : 'ДАЛЬШЕ ▸';
          $('#words').style.fontSize = 'clamp(32px, 8vw, 80px)';
          showHint(isTouch ? 'Нажми «Огонь», чтобы продолжить' : 'Клик или Enter — следующий уровень');
        }
      });
    }
  }

  function flashWords(seq, done) {
    var el = $('#words'), i = 0;
    el.style.fontSize = '';
    (function next() {
      if (i >= seq.length) { el.textContent = ''; if (done) done(); return; }
      el.textContent = seq[i++];
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      Sound.tone(i % 2 ? 180 : 140, 0.3, 0.25, 'sawtooth');
      setTimeout(next, 520);
    })();
  }

  // ---------- HUD и экраны
  var hintTimer = null;
  function showHint(t) {
    if (t && isTouch) t = t.replace(/ \((E|ЛКМ|ПКМ \/ Q)\)/g, '');
    var h = $('#hint'); h.textContent = t || ''; h.classList.toggle('show', !!t);
    clearTimeout(hintTimer); if (t) hintTimer = setTimeout(function () { h.classList.remove('show'); }, 7000);
  }
  function updateHud() {
    var p = S.player; if (!p) return;
    $('#hudLevel').textContent = (S.levelIdx + 1) + '. ' + LEVELS[S.levelIdx].name;
    var left = S.enemies.length + (S.reinf ? Math.max(0, S.reinf.left) : 0);
    $('#hudEnemies').textContent = 'Врагов: ' + left;
    $('#hudWeapon').textContent = p.weapon ? WEAPONS[p.weapon].name : 'Кулаки';
    $('#hudAmmo').textContent = p.weapon && !WEAPONS[p.weapon].melee ? (p.ammo > 0 ? 'патронов: ' + p.ammo : 'пусто — брось!') : '';
  }
  function showScreen(name) {
    ['menu', 'over', 'pause'].forEach(function (n) { $('#' + n).hidden = n !== name; });
    var playing = !name;
    $('#hud').hidden = !playing && S.state !== 'dead' && S.state !== 'cleared';
    $('#touch').hidden = !(isTouch && (S.state === 'playing' || S.state === 'cleared'));
    if (name && document.pointerLockElement) document.exitPointerLock();
  }
  function renderLevels() {
    var box = $('#levels'); box.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var b = document.createElement('button');
      b.textContent = (i + 1) + '. ' + L.name; b.disabled = i + 1 > unlocked;
      b.addEventListener('click', function () { start(i); });
      box.appendChild(b);
    });
  }

  function start(idx) {
    Sound.init();
    if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    loadLevel(idx);
    S.state = 'playing';
    $('#words').textContent = '';
    showScreen(null);
    lock();
  }
  function restart() { start(S.levelIdx); }
  function nextLevel() { if (S.levelIdx + 1 < LEVELS.length) start(S.levelIdx + 1); else { S.state = 'menu'; renderLevels(); showScreen('menu'); } }
  function pause() { if (S.state !== 'playing') return; S.state = 'paused'; showScreen('pause'); }
  function resume() { S.state = 'playing'; showScreen(null); lock(); }

  $('#btnPlay').addEventListener('click', function () { start(Math.min(unlocked, LEVELS.length) - 1); });
  $('#btnRetry').addEventListener('click', restart);
  $('#btnMenu').addEventListener('click', function () { S.state = 'menu'; renderLevels(); showScreen('menu'); });
  $('#btnMenu2').addEventListener('click', function () { S.state = 'menu'; renderLevels(); showScreen('menu'); });
  $('#btnResume').addEventListener('click', resume);
  $('#btnRestart').addEventListener('click', restart);
  document.addEventListener('keydown', function (e) { if (e.code === 'Escape' && S.state === 'paused') resume(); });
  renderLevels();
  $('#btnPlay').textContent = unlocked > 1 ? 'Продолжить (уровень ' + Math.min(unlocked, LEVELS.length) + ')' : 'Играть';

  // ---------- Главный цикл
  loadLevel(0); // фон под меню
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var rdt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.state === 'playing') {
      updatePlayer(rdt);
      var gdt = rdt * S.timeScale;
      S.levelTime += gdt;
      updateView(rdt, gdt);
      updateEnemies(gdt);
      updateBullets(gdt);
      updateThrown(gdt);
      updateReinforcements(gdt);
      updateFx(gdt, rdt);
      checkClear();
    } else if (S.state === 'dead' || S.state === 'cleared') {
      var g2 = rdt * (S.state === 'dead' ? 0.06 : 0.5);
      updateBullets(g2); updateThrown(g2); updateFx(g2, rdt);
    } else if (S.state === 'menu') {
      // медленный облёт уровня за меню
      var t = now / 1000, W = (S.cols - 1) * CELL, D = (S.rows - 1) * CELL;
      camera.position.set(W / 2 + Math.cos(t * 0.15) * W * 0.3, 2.2, D / 2 + Math.sin(t * 0.15) * D * 0.3);
      camera.lookAt(W / 2, 1.2, D / 2);
      updateFx(0, rdt);
    }
    renderer.clear();
    renderer.render(scene, camera);
    if (S.state === 'playing' || S.state === 'paused') { renderer.clearDepth(); renderer.render(viewScene, viewCam); }
  }
  requestAnimationFrame(frame);

  // для автотестов
  window.__game = { S: S, start: start, attack: playerAttack, throwW: playerThrow, pickup: playerPickup, keys: keys, look: look, LEVELS: LEVELS };
})();
