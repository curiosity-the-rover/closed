/* 3D-модель плана на three.js: комнаты-«коробки» в цветах оценки, стены, детали, компас и 16 зон. */
window.VASTU = window.VASTU || {};

(function (V) {
  'use strict';

  var D = V.View3D = {
    ready: false, wallH: 2.7,

    init: function (container) {
      if (!window.THREE) return;
      this.container = container;
      var r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(r.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, .1, 500);
      this.controls = new THREE.OrbitControls(this.camera, r.domElement);
      this.controls.enableDamping = true;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = .8;
      this.controls.maxPolarAngle = Math.PI / 2.05;
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, .9));
      var sun = new THREE.DirectionalLight(0xffffff, .65); sun.position.set(10, 20, 8); this.scene.add(sun);
      this.root = new THREE.Group(); this.scene.add(this.root);
      this.pulses = [];
      var self = this;
      this.ready = true;
      window.addEventListener('resize', function () { self.resize(); });
      this.controls.addEventListener('start', function () { self.controls.autoRotate = false; });
      (function loop(t) {
        requestAnimationFrame(loop);
        if (!self.visible) return;
        self._tick(t || 0);
        self.controls.update();
        self.renderer.render(self.scene, self.camera);
      })();
    },

    show: function (on) { this.visible = on; if (on) this.resize(); },

    resize: function () {
      if (!this.ready) return;
      var w = this.container.clientWidth || 600, h = this.container.clientHeight || 400;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    },

    _label: function (text, opts) {
      opts = opts || {};
      var c = document.createElement('canvas'), ctx = c.getContext('2d');
      var fs = opts.size || 44;
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      var w = Math.ceil(ctx.measureText(text).width) + 24;
      c.width = w; c.height = fs + 20;
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      if (opts.bg !== false) { ctx.fillStyle = opts.bg || 'rgba(255,253,249,.92)'; ctx.beginPath(); ctx.rect(0, 0, w, c.height); ctx.fill(); }
      ctx.fillStyle = opts.color || '#2b2522'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 12, c.height / 2 + 2);
      var tex = new THREE.CanvasTexture(c);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      var k = (opts.scale || .011);
      sp.scale.set(w * k, c.height * k, 1);
      sp.renderOrder = 10;
      return sp;
    },

    build: function (project, result) {
      if (!this.ready) return;
      var root = this.root, self = this;
      while (root.children.length) root.remove(root.children[0]);
      this.pulses = []; this.risers = [];
      var rooms = project.rooms, north = Number(project.north) || 0;
      if (!rooms.length) return;
      var geo = V.geo.bbox(rooms);
      this.geo = geo;
      var H = this.wallH;
      function X(x) { return x - geo.cx; }
      function Z(y) { return y - geo.cy; }

      // основание
      var size = Math.max(geo.w, geo.h) + 8;
      var base = new THREE.Mesh(new THREE.CircleGeometry(size * .75, 64), new THREE.MeshLambertMaterial({ color: 0xe9e0d2 }));
      base.rotation.x = -Math.PI / 2; base.position.y = -.02; root.add(base);

      // кольцо 16 зон
      var R1 = Math.hypot(geo.w, geo.h) / 2 + .6, R2 = R1 + 1.1;
      for (var k = 0; k < 16; k++) {
        var start = (22.5 * k - 11.25 - north);
        var g = new THREE.RingGeometry(R1, R2, 8, 1, 0, 22.5 * Math.PI / 180);
        var col = k % 2 ? 0xd9822b : 0xf2c38b;
        var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .55, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        // Кольцо строится от оси +X против часовой (в плоскости XY). Переводим компасный угол → угол в сцене.
        m.rotation.z = (90 - start - 22.5) * Math.PI / 180;
        root.add(m);
        var a = (22.5 * k - north) * Math.PI / 180, rr = (R1 + R2) / 2;
        var lbl = this._label(V.ZONES16[k].ru, { bg: false, color: '#5b3a12', size: 40, scale: .0075 });
        lbl.position.set(Math.sin(a) * rr, .15, -Math.cos(a) * rr);
        root.add(lbl);
      }
      // стрелка севера
      var na = -north * Math.PI / 180;
      var cone = new THREE.ConeGeometry(.35, 1.1, 16);
      cone.rotateX(Math.PI / 2); // наконечник вдоль +Z, чтобы навести lookAt'ом
      var arrow = new THREE.Mesh(cone, new THREE.MeshLambertMaterial({ color: 0xc0392b }));
      arrow.position.set(Math.sin(na) * (R2 + .9), .3, -Math.cos(na) * (R2 + .9));
      root.add(arrow);
      arrow.lookAt(Math.sin(na) * (R2 + 5), .3, -Math.cos(na) * (R2 + 5));
      var nl = this._label('СЕВЕР', { color: '#c0392b', bg: false, size: 48, scale: .009 });
      nl.position.set(Math.sin(na) * (R2 + 2), .5, -Math.cos(na) * (R2 + 2)); root.add(nl);

      // Брахмастхан
      var bc = V.geo.brahma(geo);
      var bm = new THREE.Mesh(new THREE.PlaneGeometry(bc.w, bc.h), new THREE.MeshBasicMaterial({ color: 0x3d348b, transparent: true, opacity: .18 }));
      bm.rotation.x = -Math.PI / 2; bm.position.set(X(bc.x + bc.w / 2), .06, Z(bc.y + bc.h / 2)); root.add(bm);

      // комнаты
      var wallMat = new THREE.MeshLambertMaterial({ color: 0xf7f2ea, transparent: true, opacity: .78 });
      rooms.forEach(function (r, i) {
        var f = result && result.rooms[i];
        var t = V.ROOM_TYPES[r.type] || V.ROOM_TYPES.hall;
        var color = new THREE.Color(f ? f.verdict.color : t.color);
        var floor = new THREE.Mesh(new THREE.BoxGeometry(r.w - .06, .12, r.h - .06), new THREE.MeshLambertMaterial({ color: color }));
        floor.position.set(X(r.x + r.w / 2), .06, Z(r.y + r.h / 2));
        root.add(floor);
        // объём-«аура» комнаты (поднимается при расчёте)
        var vol = new THREE.Mesh(new THREE.BoxGeometry(r.w - .1, 1, r.h - .1), new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: .16, depthWrite: false }));
        vol.position.set(X(r.x + r.w / 2), .12, Z(r.y + r.h / 2));
        vol.scale.y = .001; vol.userData.target = f ? .4 + (f.s + 2) / 4 * 1.6 : .6;
        root.add(vol); self.risers.push(vol);
        // стены
        var th = .08;
        [[r.x, r.y, r.w, th], [r.x, r.y + r.h - th, r.w, th], [r.x, r.y, th, r.h], [r.x + r.w - th, r.y, th, r.h]].forEach(function (s) {
          var wm = new THREE.Mesh(new THREE.BoxGeometry(s[2], H, s[3]), wallMat);
          wm.position.set(X(s[0] + s[2] / 2), H / 2, Z(s[1] + s[3] / 2));
          root.add(wm);
        });
        var lb = self._label((r.name || t.ru) + (f ? ' · ' + V.DIR_INFO[f.dir].short : ''), { size: 38, scale: .0075 });
        lb.position.set(X(r.x + r.w / 2), H + .5, Z(r.y + r.h / 2));
        root.add(lb);
        if (f && f.s < 0) self._pulse(X(r.x + r.w / 2), H + 1.2, Z(r.y + r.h / 2), f.verdict.color);
      });

      // детали
      (project.items || []).forEach(function (it, i) {
        var t = V.ITEM_TYPES[it.type]; if (!t) return;
        var f = result && result.findings.filter(function (x) { return (x.cat === 'item' || x.cat === 'entrance') && x.idx === i; })[0];
        var col = new THREE.Color(f ? f.verdict.color : '#888');
        if (it.type === 'entrance') {
          var door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, .25), new THREE.MeshLambertMaterial({ color: 0xd9822b }));
          door.position.set(X(it.x), 1.1, Z(it.y));
          var dx = geo.cx - it.x, dy = geo.cy - it.y;
          door.rotation.y = Math.abs(dx) > Math.abs(dy) ? Math.PI / 2 : 0;
          root.add(door);
        } else {
          var pin = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .5, 20), new THREE.MeshLambertMaterial({ color: col }));
          pin.position.set(X(it.x), .37, Z(it.y)); root.add(pin);
        }
        var l = self._label(t.icon + ' ' + t.ru, { size: 30, bg: 'rgba(255,255,255,.85)', scale: .0062 });
        l.position.set(X(it.x), it.type === 'entrance' ? 2.7 : 1, Z(it.y)); root.add(l);
        if (f && f.s < 0) self._pulse(X(it.x), .7, Z(it.y), f.verdict.color, .25);
      });

      // камера
      var d = Math.max(geo.w, geo.h);
      this.camera.position.set(d * 1.05, d * 1.25, d * 1.35);
      this.controls.target.set(0, 0, 0);
      this.controls.autoRotate = true;
      this.riseStart = performance.now();
    },

    _pulse: function (x, y, z, color, r) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(r || .32, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: .85 }));
      s.position.set(x, y, z); this.root.add(s); this.pulses.push(s);
    },

    _tick: function (t) {
      var k = Math.sin(t / 260) * .5 + .5;
      this.pulses.forEach(function (p) { p.scale.setScalar(.8 + k * .5); p.material.opacity = .5 + k * .45; });
      if (this.risers && this.riseStart) {
        var e = Math.min(1, (performance.now() - this.riseStart) / 1600);
        var ease = 1 - Math.pow(1 - e, 3);
        this.risers.forEach(function (v, i) {
          var tt = Math.max(0, Math.min(1, ease * 1.4 - i * .04));
          var h = Math.max(.001, v.userData.target * tt);
          v.scale.y = h; v.position.y = .12 + h / 2;
        });
      }
    },

    toPNG: function () {
      if (!this.ready) return null;
      var was = this.visible;
      if (!was) { this.container.parentNode.classList.remove('hidden'); this.show(true); }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      var data = this.renderer.domElement.toDataURL('image/png');
      var w = this.renderer.domElement.width, h = this.renderer.domElement.height;
      if (!was) { this.show(false); this.container.parentNode.classList.add('hidden'); }
      return { data: data, w: w, h: h };
    }
  };
})(window.VASTU);
