"""Собирает zona/js/game3.js (модуль three r170) из логики старого game.js
с заменой рендера, персонажей, оружия и главного цикла."""
import os
D = os.path.join(os.path.dirname(__file__), '..', 'js')
old = open(os.path.join(D, 'game.js'), encoding='utf-8').read().split('\n')


def lines(a, b):  # 1-based включительно
    return '\n'.join(old[a - 1:b])


HEADER = r"""// Зона: Окраина — игровой цикл (three r170, PBR, glTF-персонажи).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadAll, A } from './assets.js';
import { buildWorld } from './world3.js';
import { createRenderer, setupScene, createComposer } from './render.js';

const Z = window.Z;
(async function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  var SAVE_KEY = 'zona-okraina-save-v2';
  var EYE = 1.65, CROUCH_EYE = 1.05, R = 0.35;
  var QKEY = 'zona-quality';
  var quality = (function () { try { return localStorage.getItem(QKEY) || (isTouch ? 'low' : 'mid'); } catch (e) { return isTouch ? 'low' : 'mid'; } })();

  // ---------- загрузка
  var bar = $('#loadBar'), note0 = $('#loadingNote');
  function progress(p, txt) { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (txt && note0) note0.textContent = txt; }
  progress(0.02, 'Загрузка моделей и фактур…');
  await loadAll(function (p) { progress(p * 0.6, 'Загрузка моделей и фактур… ' + Math.round(p * 100) + '%'); });

  // ---------- рендер
  var renderer = createRenderer($('#stage'), quality);
  renderer.setSize(window.innerWidth, window.innerHeight);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 900);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  var LIGHT = setupScene(scene, renderer, quality);
  var sun = LIGHT.sun, SUN_DIR = LIGHT.sunDir;

  // фонарик
  var flash = new THREE.SpotLight(0xfff1d6, 0, 40, 0.42, 0.5, 1.6);
  flash.position.set(0.25, -0.15, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0, -0.05, -5);

  // оружие в руках — отдельная сцена, рисуется поверх мира внутри композитора
  var vScene = new THREE.Scene(), vCam = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 20);
  vScene.environment = scene.environment; vScene.environmentIntensity = 0.7;
  var vSun = new THREE.DirectionalLight(0xffe4c0, 1.4); vSun.position.set(-1, 2, 1); vScene.add(vSun);
  vScene.add(new THREE.HemisphereLight(0xb8bcae, 0x3e3a30, 0.4));

  progress(0.62, 'Строю Зону: рельеф, деревья, постройки…');
  await new Promise(function (r) { setTimeout(r, 30); });
  var W = await buildWorld(scene, renderer, { quality: quality });
  var POST = createComposer(renderer, scene, camera, quality);
  // проход для оружия в руках: без очистки цвета, с очисткой глубины
  (function () {
    var RP = POST.composer.passes[0].constructor;
    var vp = new RP(vScene, vCam); vp.clear = false; vp.clearDepth = true;
    var idx = POST.gtao ? 2 : 1; POST.composer.insertPass(vp, idx);
  })();

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h); camera.aspect = vCam.aspect = w / h;
    vCam.fov = w < h ? 80 : 58;
    camera.updateProjectionMatrix(); vCam.updateProjectionMatrix(); POST.resize();
  }
  window.addEventListener('resize', resize); resize();
"""

WORLD_HELPERS = lines(69, 132).replace("  var W = null, colGrid = {};", "  var colGrid = {};")

DATA = r"""  // ---------- данные
  var WEAPONS = {
    ak: { name: 'АК-74', mag: 30, ammo: 'ammo545', dmg: 36, cd: 0.1, auto: true, spread: 0.028, aimSpread: 0.006, recoil: 0.016, reload: 2.6, sound: 'ak', pellets: 1 },
    shotgun: { name: 'Дробовик', mag: 6, ammo: 'ammo12', dmg: 16, cd: 0.85, spread: 0.07, aimSpread: 0.05, recoil: 0.07, reload: 3.0, sound: 'pm', pellets: 8 }
  };
  var ITEMS = {
    medkit: { name: 'Аптечка', use: function () { heal(55); }, price: 450 },
    bandage: { name: 'Бинт', use: function () { heal(18); }, price: 120 },
    bread: { name: 'Хлеб', use: function () { heal(8); P.stamina = 100; }, price: 60 },
    vodka: { name: 'Водка «Казаки»', use: function () { P.rad = Math.max(0, P.rad - 35); P.drunk = 8; }, price: 160 },
    antirad: { name: 'Антирад', use: function () { P.rad = 0; }, price: 550 },
    ammo12: { name: 'Патроны 12×70', price: 25 },
    ammo545: { name: 'Патроны 5,45×39', price: 18 },
    flash: { name: 'Флешка курьера', quest: true }
  };
  var SHOP = [['ammo545', 30], ['ammo12', 10], ['medkit', 1], ['bandage', 1], ['antirad', 1], ['vodka', 1], ['bread', 1]];
""" + lines(150, 159) + r"""
  function newPlayer() {
    return {
      pos: new THREE.Vector3(W.spawn.x, Z.heightAt(W.spawn.x, W.spawn.z), W.spawn.z), vy: 0, yaw: W.spawn.yaw, pitch: 0,
      hp: 100, stamina: 100, rad: 0, crouch: 0, onGround: true, drunk: 0,
      money: 600, items: { medkit: 1, bandage: 2, bread: 1, vodka: 1, antirad: 0, ammo545: 60, ammo12: 0, flash: 0 },
      arts: [], weapons: { ak: { mag: 30 }, shotgun: null }, cur: 'ak',
      cd: 0, reloading: 0, aim: 0, recoil: 0, bob: 0, stepAcc: 0, flash: false, bash: 0,
      quests: { art: 'none', bandits: 'none', flash: 'none' }, metTrader: false
    };
  }
"""

NPC = r"""  // ---------- NPC: персонажи из glTF с анимацией
  var MIXERS = [];
  function tintModel(root, tint, rough) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      if (tint) o.material.color.multiply(new THREE.Color(tint));
      if (rough !== undefined) o.material.roughness = rough;
    });
  }
  var hitMat = new THREE.MeshBasicMaterial({ visible: false });
  function addHitboxes(n, group, body, head) {
    var b = new THREE.Mesh(new THREE.BoxGeometry(body[0], body[1], body[2]), hitMat); b.position.y = body[3]; group.add(b); b.userData.npc = n;
    n.hit = [b];
    if (head) { var h = new THREE.Mesh(new THREE.SphereGeometry(head[0], 8, 6), hitMat); h.position.set(0, head[1], head[2] || 0); group.add(h); h.userData.npc = n; h.userData.head = true; n.hit.push(h); }
  }
  function makeNPC(kind, x, z, opts) {
    opts = opts || {};
    var g = SkeletonUtils.clone(A.models.soldier.scene);
    var tint = kind === 'bandit' ? [0x6a6460, 0x5a5a62, 0x707068][Math.floor(Math.random() * 3)] : kind === 'trader' ? 0xa08a70 : [0xb8c098, 0xa8b088, 0xc0b890][Math.floor(Math.random() * 3)];
    tintModel(g, tint, 0.9);
    var y = opts.y !== undefined ? opts.y : Z.heightAt(x, z);
    var group = new THREE.Group(); group.add(g); group.position.set(x, y, z); W.root.add(group);
    // оружие в правой руке
    var hand = g.getObjectByName('mixamorigRightHand'), gun = null;
    if (kind !== 'trader' && hand) {
      gun = A.models.shotgun.scene.clone(); gun.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
      gun.scale.setScalar(100); gun.position.set(2, 14, 4); gun.rotation.set(-Math.PI / 2 + 0.2, Math.PI, Math.PI / 2);
      hand.add(gun);
    }
    var mixer = new THREE.AnimationMixer(g); MIXERS.push(mixer);
    var acts = {}; A.models.soldier.animations.forEach(function (c) { acts[c.name] = mixer.clipAction(c); });
    acts.Idle.play();
    var n = {
      kind: kind, m: { group: group, model: g, gun: gun, mixer: mixer, acts: acts, cur: 'Idle' }, pos: new THREE.Vector3(x, y, z), yaw: opts.face || 0, hp: 100, dead: false,
      state: 'idle', patrol: opts.patrol || null, pi: 0, wait: Math.random() * 3, alert: 0, cd: 1 + Math.random(), burst: 0,
      losT: 0, sees: false, strafe: 1, strafeT: 0, walk: Math.random() * 6, sit: false, name: opts.name || '', tower: !!opts.tower,
      looted: false, idx: opts.idx, deathT: 0, lastSeen: null
    };
    mixer.setTime(Math.random() * 2);
    addHitboxes(n, group, [0.55, 1.5, 0.4, 0.75], [0.14, 1.62, 0.02]);
    NPC.push(n);
    return n;
  }
  function makeDogNPC(x, z) {
    var g = SkeletonUtils.clone(A.models.fox.scene);
    tintModel(g, 0x5a4a3c, 0.95);
    g.scale.setScalar(0.0078);
    var y = Z.heightAt(x, z), group = new THREE.Group(); group.add(g); group.position.set(x, y, z); W.root.add(group);
    var mixer = new THREE.AnimationMixer(g); MIXERS.push(mixer);
    var acts = {}; A.models.fox.animations.forEach(function (c) { acts[c.name] = mixer.clipAction(c); });
    acts.Survey.play();
    var n = { kind: 'dog', m: { group: group, model: g, mixer: mixer, acts: acts, cur: 'Survey' }, pos: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z), yaw: Math.random() * 6, hp: 45, dead: false, state: 'idle', wait: Math.random() * 3, cd: 0, walk: 0, target: null, deathT: 0, looted: true };
    addHitboxes(n, group, [0.35, 0.55, 1.1, 0.35], null);
    NPC.push(n); return n;
  }
  function playAnim(n, name, fade) {
    if (n.m.cur === name || !n.m.acts[name]) return;
    var a = n.m.acts[name], b = n.m.acts[n.m.cur];
    a.reset().play(); if (b) a.crossFadeFrom(b, fade || 0.25, false);
    n.m.cur = name;
  }
"""

EFFECTS = lines(200, 212).replace("color: new THREE.Color(color).convertSRGBToLinear()", "color: new THREE.Color(color)")

ANOMALIES = lines(213, 251).replace(
    """        var lens = new THREE.Mesh(new THREE.SphereGeometry(a.r * 0.55, 20, 12), new THREE.MeshPhongMaterial({ color: 0x9a9a88, transparent: true, opacity: 0.08, shininess: 120, specular: 0xffffff, depthWrite: false }));""",
    """        var lens = new THREE.Mesh(new THREE.SphereGeometry(a.r * 0.55, 32, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: 1.6, ior: 1.6, roughness: 0.04, metalness: 0, transparent: true, depthWrite: false }));""").replace(
    "var pl = new THREE.PointLight(0x8fd0ff, 0.6, 7);", "var pl = new THREE.PointLight(0x8fd0ff, 4, 9, 2);")

PICKUPS = lines(252, 276).replace("var l = new THREE.PointLight(0xff8a3a, 1.6, 14, 2);", "var l = new THREE.PointLight(0xff8a3a, 10, 16, 2); l.castShadow = false;").replace(
    "var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshLambertMaterial({ color: a.color, emissive: a.color, emissiveIntensity: 0.6 }));",
    "var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), new THREE.MeshPhysicalMaterial({ color: a.color, emissive: a.color, emissiveIntensity: 1.6, roughness: 0.1, transmission: 0.4, thickness: 0.3 }));")

VIEW = r"""  // ---------- оружие в руках: АК с руками (glTF, анимации), дробовик
  var vw = {};
  function buildViewModels() {
    var ak = A.models.ak47.scene;
    ak.scale.setScalar(0.05); ak.rotation.y = Math.PI;
    ak.traverse(function (o) { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    var akHolder = new THREE.Group(); akHolder.add(ak); vScene.add(akHolder);
    var mixer = new THREE.AnimationMixer(ak);
    var byName = {}; A.models.ak47.animations.forEach(function (c) { byName[c.name] = c; });
    vw.ak = { holder: akHolder, model: ak, mixer: mixer, idle: mixer.clipAction(byName.idle), fire: mixer.clipAction(byName.fire), reload: mixer.clipAction(byName.reload_empty) };
    vw.ak.idle.play();
    vw.ak.fire.setLoop(THREE.LoopOnce, 1); vw.ak.fire.clampWhenFinished = false;
    vw.ak.reload.setLoop(THREE.LoopOnce, 1); vw.ak.reload.clampWhenFinished = true;
    mixer.addEventListener('finished', function (e) { if (e.action === vw.ak.reload) { vw.ak.reload.fadeOut(0.2); vw.ak.idle.reset().fadeIn(0.2).play(); } });
    // вспышка у ствола
    var mf = A.models.muzzle_flash.scene.clone();
    mf.traverse(function (o) { if (o.isMesh) { o.material = o.material.clone(); o.material.blending = THREE.AdditiveBlending; o.material.depthWrite = false; o.material.transparent = true; } });
    mf.position.set(-0.3, -0.5, 8.3); mf.rotation.y = Math.PI; mf.visible = false; ak.add(mf); vw.ak.flash = mf;
    var flashLight = new THREE.PointLight(0xffc070, 0, 6, 2); camera.add(flashLight); flashLight.position.set(0.1, -0.1, -0.8); vw.flashLight = flashLight;
    // дробовик
    var sg = A.models.shotgun.scene.clone(); sg.traverse(function (o) { if (o.isMesh) o.frustumCulled = false; });
    var sgHolder = new THREE.Group(); sgHolder.add(sg); sgHolder.visible = false; vScene.add(sgHolder);
    vw.shotgun = { holder: sgHolder, model: sg };
  }
  function setWeapon(k) {
    if (!P.weapons[k]) return;
    P.cur = k; P.reloading = 0; P.swap = 0.35;
    vw.ak.holder.visible = k === 'ak'; vw.shotgun.holder.visible = k === 'shotgun';
    hud();
  }
"""

# действия игрока: shoot с дробью и хитбоксами, удар прикладом
ACTIONS = lines(321, 403)
ACTIONS = ACTIONS.replace("""    if (w.melee) { P.cd = w.cd; P.knife = 1; Z.Sound.knife(); meleeHit(w); return; }
""", "")
ACTIONS = ACTIONS.replace("""    var spread = Z.lerp(w.spread, w.aimSpread, P.aim) * (1 + P.recoil * 6) * (P.moving ? 1.6 : 1) * (P.crouch > 0.5 ? 0.7 : 1);
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
    }""", """    var spread = Z.lerp(w.spread, w.aimSpread, P.aim) * (1 + P.recoil * 6) * (P.moving ? 1.6 : 1) * (P.crouch > 0.5 ? 0.7 : 1);
    var origin = camera.position.clone();
    var targets = W.solids.concat([].concat.apply([], NPC.filter(function (n) { return !n.dead; }).map(function (n) { return n.hit; })));
    for (var pi = 0; pi < (w.pellets || 1); pi++) {
      var dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      dir.x += (Math.random() - .5) * spread * 2; dir.y += (Math.random() - .5) * spread * 2; dir.z += (Math.random() - .5) * spread * 2; dir.normalize();
      ray.set(origin, dir); ray.far = 400;
      var hit = ray.intersectObjects(targets, false)[0];
      var end = hit ? hit.point : origin.clone().addScaledVector(dir, 200);
      if (pi === 0 || Math.random() < 0.3) { var muzzle = origin.clone().addScaledVector(dir, 0.9); muzzle.y -= 0.1; tracer(muzzle, end); }
      if (hit) {
        var npc = hit.object.userData.npc;
        if (npc && !npc.dead) {
          var head = !!hit.object.userData.head;
          damageNPC(npc, w.dmg * (head ? 2.5 : 1) * (0.85 + Math.random() * 0.3), dir);
          puff(hit.point, 0x6a0c0c, 0.35, 0.4, new THREE.Vector3(0, -0.6, 0));
        } else { puff(hit.point, 0x8a826e, 0.45, 0.7); puff(hit.point, 0xffd080, 0.1, 0.06, null, true); }
      }
    }""")
ACTIONS = ACTIONS.replace("""    vw.muzzle.visible = true; P.muzzleT = 0.05;""", """    P.muzzleT = 0.05; vw.flashLight.intensity = 6;
    if (P.cur === 'ak') { vw.ak.flash.visible = true; vw.ak.flash.rotation.z = Math.random() * 6.28; vw.ak.fire.reset().setEffectiveWeight(1).play(); }""")
ACTIONS = ACTIONS.replace("""  function reload() {
    var w = WEAPONS[P.cur]; if (w.melee) return;
    var slot = P.weapons[P.cur];
    if (P.reloading > 0 || slot.mag >= w.mag || P.items[w.ammo] <= 0) return;
    P.reloading = w.reload; Z.Sound.reload();
  }""", """  function reload() {
    var w = WEAPONS[P.cur];
    var slot = P.weapons[P.cur];
    if (P.reloading > 0 || slot.mag >= w.mag || P.items[w.ammo] <= 0) return;
    P.reloading = w.reload; Z.Sound.reload();
    if (P.cur === 'ak') { vw.ak.idle.fadeOut(0.15); vw.ak.reload.reset().setEffectiveTimeScale(vw.ak.reload.getClip().duration / w.reload).fadeIn(0.15).play(); }
  }
  function bash() { // удар прикладом
    if (P.bash > 0 || state !== 'play') return;
    P.bash = 0.6; Z.Sound.knife();
    meleeHit({ dmg: 35, range: 1.9 });
  }""")

NPC_AI = lines(404, 533)
# анимация NPC: вместо процедурных костей — клипы Idle/Walk/Run
a = NPC_AI.index("    // анимация")
b = NPC_AI.index("    m.group.position.copy(n.pos); m.group.rotation.y = n.yaw;")
NPC_AI = NPC_AI[:a] + """    // анимация: клипы солдата / лисы
    if (n.kind === 'dog') playAnim(n, moving > 3 ? 'Run' : moving > 0 ? 'Walk' : 'Survey');
    else playAnim(n, moving > 2.5 ? 'Run' : moving > 0 ? 'Walk' : 'Idle');
    if (n.m.acts.Walk) n.m.acts.Walk.timeScale = Math.max(0.6, moving / 1.4);
    if (n.m.gun) n.m.gun.visible = true;
""" + NPC_AI[b:]
NPC_AI = NPC_AI.replace("""      if (n.kind === 'dog') { m.group.rotation.z = n.deathT * Math.PI / 2; m.group.position.y = n.pos.y + 0.1 * n.deathT; }
      else { m.group.rotation.x = -n.deathT * Math.PI / 2 * 0.98; m.group.position.y = n.pos.y + 0.15 * n.deathT; }""", """      if (n.m.mixer && n.deathT < 0.05) n.m.mixer.timeScale = 0;
      if (n.kind === 'dog') { m.group.rotation.z = n.deathT * Math.PI / 2; m.group.position.y = n.pos.y + 0.1 * n.deathT; }
      else { m.group.rotation.x = -n.deathT * Math.PI / 2 * 0.98; m.group.position.y = n.pos.y + 0.15 * n.deathT; }""")
NPC_AI = NPC_AI.replace("""    var g = new THREE.Vector3(); n.m.gun.getWorldPosition(g);
    var fwd = new THREE.Vector3(Math.sin(n.yaw), 0, Math.cos(n.yaw)); g.addScaledVector(fwd, 0.5);""", """    var fwd = new THREE.Vector3(Math.sin(n.yaw), 0, Math.cos(n.yaw));
    var g = new THREE.Vector3(n.pos.x, n.pos.y + 1.4, n.pos.z).addScaledVector(fwd, 0.7);
    g.x += Math.cos(n.yaw) * 0.2; g.z -= Math.sin(n.yaw) * 0.2;""")

REST = lines(534, 849)  # взаимодействие, торговля, КПК, UI, ввод
REST = REST.replace("""    if (n.dead && !n.looted) consider""", """    if (n.dead && !n.looted) consider""")
REST = REST.replace("""    if (!P.weapons.ak) { P.weapons.ak = { mag: 30 }; got.push('АК-74'); note('Подобран АК-74 — клавиша 2'); }""", "")
REST = REST.replace("""    Object.keys(b.def.items).forEach(function (k) { P.items[k] = (P.items[k] || 0) + b.def.items[k]; got.push(ITEMS[k].name + ' ×' + b.def.items[k]); });""", """    Object.keys(b.def.items).forEach(function (k) { P.items[k] = (P.items[k] || 0) + b.def.items[k]; got.push(ITEMS[k].name + ' ×' + b.def.items[k]); });
    if (b.def.quest === 'flash' && !P.weapons.shotgun) { P.weapons.shotgun = { mag: 6 }; got.push('дробовик'); note('Найден дробовик — клавиша 2'); }""")
REST = REST.replace("""    var wd = document.createElement('div'); wd.innerHTML = '<b>Оружие</b>Нож' + (P.weapons.pm ? ', ПМ' : '') + (P.weapons.ak ? ', АК-74' : ''); inv.appendChild(wd);""",
                    """    var wd = document.createElement('div'); wd.innerHTML = '<b>Оружие</b>АК-74' + (P.weapons.shotgun ? ', дробовик' : ''); inv.appendChild(wd);""")
REST = REST.replace("""    $('#wAmmo').textContent = w.melee ? '—' : P.weapons[P.cur].mag + ' / ' + P.items[w.ammo];""", """    $('#wAmmo').textContent = P.weapons[P.cur].mag + ' / ' + P.items[w.ammo];""")
REST = REST.replace("""    if (e.code === 'Digit1') setWeapon('knife');
    if (e.code === 'Digit2') setWeapon(P.weapons.ak ? 'ak' : 'pm');
    if (e.code === 'Digit3') setWeapon('pm');""", """    if (e.code === 'Digit1') setWeapon('ak');
    if (e.code === 'Digit2') setWeapon('shotgun');
    if (e.code === 'KeyV') bash();""")
REST = REST.replace("""var order = ['knife', 'pm'].concat(P.weapons.ak ? ['ak'] : []); var i = order.indexOf(P.cur); setWeapon(order[(i + (e.deltaY > 0 ? 1 : order.length - 1)) % order.length]);""",
                    """setWeapon(P.cur === 'ak' && P.weapons.shotgun ? 'shotgun' : 'ak');""")
REST = REST.replace("""        if (a === 'weapon') { var order = ['knife', 'pm'].concat(P.weapons.ak ? ['ak'] : []); setWeapon(order[(order.indexOf(P.cur) + 1) % order.length]); }""",
                    """        if (a === 'weapon') setWeapon(P.cur === 'ak' && P.weapons.shotgun ? 'shotgun' : 'ak');""")

SAVE_START = lines(850, 903).replace("""    buildAnomalies(); buildPickups(); buildFires();
    linearize(scene);
    setWeapon(P.cur);""", """    buildAnomalies(); buildPickups(); buildFires();
    setWeapon(P.weapons[P.cur] ? P.cur : 'ak');""").replace("""  function clearDynamic() {
    NPC.forEach(function (n) { W.root.remove(n.m.group); }); NPC = [];""", """  function clearDynamic() {
    NPC.forEach(function (n) { W.root.remove(n.m.group); }); NPC = []; MIXERS = [];""")

UPDATE_PLAYER = lines(913, 1005)
a = UPDATE_PLAYER.index("    if (P.muzzleT > 0) { P.muzzleT -= dt; if (P.muzzleT <= 0) vw.muzzle.visible = false; }")
b = UPDATE_PLAYER.index("    $('#cross').classList.toggle('hide', P.aim > 0.6);")
UPDATE_PLAYER = UPDATE_PLAYER[:a] + """    if (P.muzzleT > 0) { P.muzzleT -= dt; if (P.muzzleT <= 0) { vw.ak.flash.visible = false; vw.flashLight.intensity = 0; } }
    P.bash = Math.max(0, P.bash - dt);
    var a = P.aim, k = P.cur;
    var sway = P.moving ? Math.sin(P.bob) * 0.01 * (1 - a * 0.8) : Math.sin(Date.now() / 900) * 0.002;
    var sprintTilt = P.sprint && P.moving ? 1 : 0;
    var bs = Math.sin(P.bash / 0.6 * Math.PI);
    if (k === 'ak') {
      var h = vw.ak.holder;
      h.position.set(Z.lerp(0.075, 0.0, a) + sway, Z.lerp(-0.055, -0.012, a) + Math.abs(sway) * 0.6 - P.swap * 0.4 - sprintTilt * 0.03, Z.lerp(0.04, 0.035, a) + P.recoil * 0.035 - bs * 0.12);
      h.rotation.set(P.recoil * 0.05 - sprintTilt * 0.25 + bs * 0.3, sprintTilt * 0.6, sprintTilt * 0.2 - bs * 0.4);
      vw.ak.mixer.update(dt);
    } else {
      var hs = vw.shotgun.holder, rl2 = P.reloading > 0 ? Math.sin(Math.min(1, (WEAPONS[k].reload - P.reloading) / WEAPONS[k].reload) * Math.PI) : 0;
      hs.position.set(Z.lerp(0.17, 0.0, a) + sway, Z.lerp(-0.17, -0.105, a) - rl2 * 0.12 - P.swap * 0.4, Z.lerp(-0.42, -0.36, a) + P.recoil * 0.08 - bs * 0.15);
      hs.rotation.set(P.recoil * 0.15 + rl2 * 0.6 + bs * 0.3, 0, rl2 * 0.4 - bs * 0.4);
    }
""" + UPDATE_PLAYER[b:]
UPDATE_PLAYER = UPDATE_PLAYER.replace("var spread = WEAPONS[k].melee ? 4 : (6 + P.recoil * 30 + (P.moving ? 8 : 0)) * (1 - P.aim);", "var spread = (6 + P.recoil * 30 + (P.moving ? 8 : 0)) * (1 - P.aim);")
UPDATE_PLAYER = UPDATE_PLAYER.replace("P.swap = Math.max(0, (P.swap || 0) - dt); P.knife = Math.max(0, (P.knife || 0) - dt * 3);", "P.swap = Math.max(0, (P.swap || 0) - dt);")
UPDATE_PLAYER = UPDATE_PLAYER.replace("$('#radfx').style.opacity = Z.clamp(P.rad / 100, 0, 0.8) * (0.6 + Math.random() * 0.4);", "POST.grade.uniforms.uRad.value = Z.clamp(P.rad / 100, 0, 1);")
UPDATE_PLAYER = "  var tmp = new THREE.Vector3(), saveT = 0, ambT = 5, detT = 0, geigerAcc = 0, hudT = 0;\n" + UPDATE_PLAYER

UPDATE_WORLD = lines(1006, 1076).replace("""    sun.position.copy(P.pos).addScaledVector(SUN_DIR, 100); sun.target.position.copy(P.pos);
    sky.position.copy(camera.position);""", """    sun.position.copy(P.pos).addScaledVector(SUN_DIR, 120); sun.target.position.copy(P.pos);
    W.updateTrees(camera.position, now); W.updateGrass(camera.position, now); W.treeTime(now); W.updaters.forEach(function (f) { f(now); });
    MIXERS.forEach(function (mx) { mx.update(dt); });""").replace(
    "f.light.intensity = 1.3 + Math.sin(now * 13 + f.def.x) * 0.25 + Math.random() * 0.3;", "f.light.intensity = 9 + Math.sin(now * 13 + f.def.x) * 1.5 + Math.random() * 2;").replace(
    "A.light.intensity = 0.3 + Math.random() * 0.6 + (A.active > 0 ? 3 : 0);", "A.light.intensity = 2 + Math.random() * 4 + (A.active > 0 ? 30 : 0);")

LOOP = r"""
  // ---------- главный цикл
  var last = performance.now(), menuT = 0, hurtV = 0;
  var POIlook = { x: -78, z: 8 };
  function step(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'play' && !uiOpen) { updatePlayer(dt); updateWorld(dt); }
    else if (state === 'menu' || state === 'loading') {
      menuT += dt * 0.03;
      var cx = -60 + Math.cos(menuT) * 30, cz = 40 + Math.sin(menuT) * 30, t = now / 1000;
      camera.position.set(cx, Z.heightAt(cx, cz) + 4, cz); camera.lookAt(POIlook.x, Z.heightAt(POIlook.x, POIlook.z) + 2, POIlook.z);
      sun.position.copy(camera.position).addScaledVector(SUN_DIR, 120); sun.target.position.copy(camera.position);
      W.updateTrees(camera.position, t); W.updateGrass(camera.position, t); W.treeTime(t); W.updaters.forEach(function (f) { f(t); });
    }
    var hv = parseFloat($('#hurt').style.opacity || 0); hurtV = Z.lerp(hurtV, hv, 0.3);
    POST.grade.uniforms.uTime.value = now / 1000; POST.grade.uniforms.uHurt.value = hurtV;
    vw.ak.holder.visible = state === 'play' && P && P.cur === 'ak';
    if (vw.shotgun) vw.shotgun.holder.visible = state === 'play' && P && P.cur === 'shotgun';
    POST.composer.render(dt);
  }
  function frame(now) { requestAnimationFrame(frame); if (!window.__zonaPause) step(now); }

  indexColliders(); buildMapBase(); buildViewModels();
  progress(1, '');
  state = 'menu';
  $('#loading').hidden = true;
  $('#btnLoad').hidden = !hasSave();
  $$('#qualitySel button').forEach(function (b) {
    b.classList.toggle('on', b.dataset.q === quality);
    b.addEventListener('click', function () { try { localStorage.setItem(QKEY, b.dataset.q); } catch (e) { /* хранилище недоступно */ } location.reload(); });
  });
  requestAnimationFrame(frame);

  window.__zona = { get P() { return P; }, get NPC() { return NPC; }, get W() { return W; }, get state() { return state; }, start: startGame, shoot: shoot, interact: interact, keys: keys, look: look, damageNPC: damageNPC, openUI: openUI, closeUI: closeUI, throwBolt: throwBolt, completeQuest: completeQuest, step: step, camera: camera, renderer: renderer };
})();
"""

out = '\n'.join([HEADER, WORLD_HELPERS, DATA, NPC, EFFECTS, ANOMALIES, PICKUPS, VIEW, ACTIONS, NPC_AI, REST, SAVE_START, UPDATE_PLAYER, UPDATE_WORLD, LOOP])
# grain() из старого кода больше не нужен — зерно в шейдере постобработки
open(os.path.join(D, 'game3.js'), 'w', encoding='utf-8').write(out)
print('game3.js', len(out.split('\n')), 'строк')
