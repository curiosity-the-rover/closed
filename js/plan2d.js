/* 2D-план на SVG: отрисовка, перетаскивание, оверлеи зон/мандалы, анимации. */
window.VASTU = window.VASTU || {};

(function (V) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var G = function () { return V.geo; };
  var PAD = 2.6;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, extra) {
    var t = el('text', Object.assign({ x: x, y: y, class: cls || '' }, extra || {}), parent);
    t.textContent = s;
    return t;
  }
  function planVec(compassDeg, north) {
    var a = (compassDeg - north) * Math.PI / 180;
    return { x: Math.sin(a), y: -Math.cos(a) };
  }
  // пересечение луча из (cx,cy) с границей прямоугольника
  function rayRect(cx, cy, dx, dy, r) {
    var ts = [];
    if (dx > 1e-9) ts.push((r.x + r.w - cx) / dx); else if (dx < -1e-9) ts.push((r.x - cx) / dx);
    if (dy > 1e-9) ts.push((r.y + r.h - cy) / dy); else if (dy < -1e-9) ts.push((r.y - cy) / dy);
    var t = Math.min.apply(null, ts.filter(function (v) { return v > 0; }));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  function lighten(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var P = V.Plan2D = {
    svg: null, project: null, result: null, opts: { zones: true, mandala: false, labels: true },
    sel: null, frozenVB: null, anim: null, onChange: null, onSelect: null,

    init: function (svg, cb) {
      this.svg = svg; this.onChange = cb.onChange; this.onSelect = cb.onSelect;
      this._bindDrag();
    },

    render: function (project, result, opts) {
      this.project = project; this.result = result;
      if (opts) Object.assign(this.opts, opts);
      var svg = this.svg, self = this;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var rooms = project.rooms, north = Number(project.north) || 0;
      var geo = G().bbox(rooms);
      this.geo = geo;
      var vb = this.frozenVB || [geo.x - PAD, geo.y - PAD, geo.w + PAD * 2, geo.h + PAD * 2];
      svg.setAttribute('viewBox', vb.join(' '));
      this.vb = vb;

      var defs = el('defs', {}, svg);
      var rg = el('radialGradient', { id: 'sweepGrad', cx: '0', cy: '0', r: '1', gradientUnits: 'userSpaceOnUse' }, defs);
      el('stop', { offset: '0', 'stop-color': '#d9822b', 'stop-opacity': '.35' }, rg);
      el('stop', { offset: '1', 'stop-color': '#d9822b', 'stop-opacity': '0' }, rg);
      var clip = el('clipPath', { id: 'clipPlan' }, defs);
      el('rect', { x: geo.x, y: geo.y, width: geo.w, height: geo.h }, clip);

      // сетка 1 м
      var grid = el('g', { opacity: 1 }, svg);
      for (var gx = Math.floor(vb[0]); gx <= vb[0] + vb[2]; gx++) el('line', { x1: gx, y1: vb[1], x2: gx, y2: vb[1] + vb[3], stroke: 'var(--plan-grid)', 'stroke-width': .02 }, grid);
      for (var gy = Math.floor(vb[1]); gy <= vb[1] + vb[3]; gy++) el('line', { x1: vb[0], y1: gy, x2: vb[0] + vb[2], y2: gy, stroke: 'var(--plan-grid)', 'stroke-width': .02 }, grid);

      if (!rooms.length) {
        txt(svg, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2, 'Добавьте комнаты или загрузите пример', 'dim');
        return;
      }

      // Брахмастхан
      var bc = G().brahma(geo);
      el('rect', { x: bc.x, y: bc.y, width: bc.w, height: bc.h, class: 'brahma', rx: .1 }, svg);

      // комнаты
      var gRooms = el('g', {}, svg);
      this.roomEls = [];
      rooms.forEach(function (r, i) {
        var t = V.ROOM_TYPES[r.type] || V.ROOM_TYPES.hall;
        var f = result && result.rooms[i];
        var g = el('g', { class: 'room' + (self.sel && self.sel.kind === 'room' && self.sel.idx === i ? ' selected' : ''), 'data-idx': i }, gRooms);
        var fill = f ? lighten(f.verdict.color, .45) : lighten(t.color, .35);
        var body = el('rect', { class: 'body', x: r.x, y: r.y, width: r.w, height: r.h, fill: fill, 'data-kind': 'room', 'data-idx': i }, g);
        if (self.opts.labels) {
          var fs = Math.max(.22, Math.min(.38, r.w / 7, r.h / 3));
          txt(g, r.x + r.w / 2, r.y + r.h / 2 - fs * .3, r.name || t.ru, '', { 'text-anchor': 'middle', style: 'font-size:' + fs + 'px' });
          var sub = f ? (V.DIR_INFO[f.dir].short + ' · ' + f.verdict.ru) : (r.w.toFixed(1) + '×' + r.h.toFixed(1) + ' м');
          txt(g, r.x + r.w / 2, r.y + r.h / 2 + fs * .9, sub, 'sub', { 'text-anchor': 'middle', style: 'font-size:' + fs * .75 + 'px' });
        }
        el('path', { class: 'handle', d: 'M' + (r.x + r.w) + ' ' + (r.y + r.h - .45) + 'L' + (r.x + r.w) + ' ' + (r.y + r.h) + 'L' + (r.x + r.w - .45) + ' ' + (r.y + r.h) + 'Z', 'data-kind': 'resize', 'data-idx': i }, g);
        self.roomEls.push({ body: body, f: f, base: lighten(t.color, .35) });
      });
      // внешний контур
      el('rect', { x: geo.x, y: geo.y, width: geo.w, height: geo.h, fill: 'none', stroke: 'var(--muted)', 'stroke-width': .04, 'stroke-dasharray': '.25 .15' }, svg);

      // вырезы
      if (result) result.cuts.forEach(function (c) {
        el('rect', { class: 'cut-area', x: c.cell.x, y: c.cell.y, width: c.cell.w, height: c.cell.h }, svg);
      });

      // 16 зон
      if (this.opts.zones) {
        var gz = el('g', {}, svg);
        var gl = el('g', { 'clip-path': 'url(#clipPlan)' }, gz);
        var diag = Math.hypot(geo.w, geo.h);
        for (var k = 0; k < 16; k++) {
          var v = planVec(11.25 + 22.5 * k, north);
          el('line', { class: 'zone-line', x1: geo.cx, y1: geo.cy, x2: geo.cx + v.x * diag, y2: geo.cy + v.y * diag }, gl);
          var lv = planVec(22.5 * k, north);
          var p = rayRect(geo.cx, geo.cy, lv.x, lv.y, { x: geo.x - .45, y: geo.y - .45, w: geo.w + .9, h: geo.h + .9 });
          txt(gz, p.x, p.y, V.ZONES16[k].ru, 'zone-label');
        }
      }

      // мандала 9×9
      if (this.opts.mandala) this._mandala(geo, north);

      // размеры
      txt(svg, geo.x + geo.w / 2, geo.y + geo.h + 1.05, geo.w.toFixed(2) + ' м', 'dim');
      txt(svg, geo.x - 1.05, geo.y + geo.h / 2, geo.h.toFixed(2) + ' м', 'dim', { transform: 'rotate(-90 ' + (geo.x - 1.05) + ' ' + (geo.y + geo.h / 2) + ')' });

      // предметы
      var gi = el('g', {}, svg);
      (project.items || []).forEach(function (it, i) {
        var t = V.ITEM_TYPES[it.type]; if (!t) return;
        var g = el('g', { class: 'item' + (self.sel && self.sel.kind === 'item' && self.sel.idx === i ? ' selected' : ''), 'data-kind': 'item', 'data-idx': i }, gi);
        if (it.type === 'entrance') {
          // стрелка входа направлена к центру плана
          var dx = geo.cx - it.x, dy = geo.cy - it.y, L = Math.hypot(dx, dy) || 1;
          dx /= L; dy /= L;
          el('path', { d: 'M' + (it.x - dx * 1.1) + ' ' + (it.y - dy * 1.1) + 'L' + (it.x - dx * .25) + ' ' + (it.y - dy * .25),
            stroke: '#d9822b', 'stroke-width': .12, 'marker-end': '', fill: 'none', 'stroke-linecap': 'round' }, g);
          el('path', { d: 'M' + (it.x - dx * .2) + ' ' + (it.y - dy * .2) + 'l' + (-dx * .35 - dy * .25) + ' ' + (-dy * .35 + dx * .25) + 'l' + (dy * .5) + ' ' + (-dx * .5) + 'Z', fill: '#d9822b' }, g);
        }
        if (t.facingGood && it.facing) {
          var fv = planVec(G().DIR_DEG[it.facing], north);
          el('line', { x1: it.x, y1: it.y, x2: it.x + fv.x * .62, y2: it.y + fv.y * .62, stroke: '#3d348b', 'stroke-width': .07, 'stroke-linecap': 'round' }, g);
          el('circle', { cx: it.x + fv.x * .62, cy: it.y + fv.y * .62, r: .08, fill: '#3d348b' }, g);
        }
        el('circle', { class: 'bg', cx: it.x, cy: it.y, r: .3, 'data-kind': 'item', 'data-idx': i }, g);
        txt(g, it.x, it.y + .02, t.icon, 'icon', { 'data-kind': 'item', 'data-idx': i });
        var title = el('title', {}, g); title.textContent = t.ru;
      });

      // номера находок
      if (result) {
        var gb = el('g', {}, svg);
        this.badges = {};
        result.findings.forEach(function (f) {
          if (f.x === undefined || f.cat === 'shape' || f.cat === 'plot' || f.cat === 'ayadi') return;
          var off = f.cat === 'item' || f.cat === 'entrance' ? { x: .32, y: -.32 } : f.cat === 'room' ? { x: 0, y: -.85 } : { x: 0, y: 0 };
          var r = f.cat === 'room' ? (rooms[f.idx] || {}) : null;
          if (r && r.h < 2.2) off.y = -.55;
          var b = el('g', { class: 'badge' + (f.s < 0 ? ' bad' : ''), 'data-n': f.n }, gb);
          el('circle', { cx: f.x + off.x, cy: f.y + off.y, r: .2, fill: f.verdict.color }, b);
          txt(b, f.x + off.x, f.y + off.y, String(f.n));
          self.badges[f.n] = b;
        });
      }

      // компас
      this._compass(vb, north);
    },

    _mandala: function (geo, north) {
      var g = el('g', { class: 'mandala' }, this.svg);
      var cw = geo.w / 9, ch = geo.h / 9, i, j;
      for (i = 0; i <= 9; i++) {
        el('line', { x1: geo.x + i * cw, y1: geo.y, x2: geo.x + i * cw, y2: geo.y + geo.h }, g);
        el('line', { x1: geo.x, y1: geo.y + i * ch, x2: geo.x + geo.w, y2: geo.y + i * ch }, g);
      }
      // внешнее кольцо — 32 пады
      for (i = 0; i < 9; i++) for (j = 0; j < 9; j++) {
        if (i !== 0 && i !== 8 && j !== 0 && j !== 8) continue;
        var px = geo.x + (i + .5) * cw, py = geo.y + (j + .5) * ch;
        var p = G().pada32(G().bearing(geo, px, py, north));
        txt(g, px, py - ch * .12, p.code, '');
        txt(g, px, py + ch * .18, p.name.split(' ')[0], '', { style: 'font-size:.13px' });
      }
      var inner = V.MANDALA_INNER;
      var spots = [[4.5, 2], [4.5, 7], [2, 4.5], [7, 4.5], [2, 2], [7, 2], [2, 7], [7, 7]];
      spots.forEach(function (s) {
        var px = geo.x + s[0] * cw, py = geo.y + s[1] * ch;
        var d = G().dir8(G().bearing(geo, px, py, north));
        var name = inner.sides[d] || (inner.corners[d] ? inner.corners[d].join(' / ') : '');
        txt(g, px, py, name, '', { style: 'font-size:.2px' });
      });
      txt(g, geo.cx, geo.cy, inner.brahma, '', { style: 'font-size:.3px;font-weight:700' });
    },

    _compass: function (vb, north) {
      var cx = vb[0] + vb[2] - 1.45, cy = vb[1] + 1.45;
      var g = el('g', { class: 'compass', transform: 'translate(' + cx + ' ' + cy + ')' }, this.svg);
      el('circle', { r: .8, fill: 'var(--panel)', stroke: 'var(--line)', 'stroke-width': .04 }, g);
      var rot = el('g', { transform: 'rotate(' + (-north) + ')' }, g);
      el('path', { class: 'needle-n', d: 'M0 -.65 L.14 0 L-.14 0Z' }, rot);
      el('path', { class: 'needle-s', d: 'M0 .65 L.14 0 L-.14 0Z' }, rot);
      [['С', 0], ['В', 90], ['Ю', 180], ['З', 270]].forEach(function (d) {
        var a = (d[1] - north) * Math.PI / 180;
        var t = txt(g, Math.sin(a) * 1.08, -Math.cos(a) * 1.08, d[0], '');
        if (d[0] === 'С') t.setAttribute('style', 'fill:#c0392b');
      });
    },

    select: function (kind, idx) {
      this.sel = kind ? { kind: kind, idx: idx } : null;
      this.render(this.project, this.result);
    },

    flash: function (n) {
      var b = this.badges && this.badges[n];
      if (!b) return;
      var c = b.querySelector('circle');
      c.animate([{ transform: 'scale(1)' }, { transform: 'scale(2.4)' }, { transform: 'scale(1)' }], { duration: 900, iterations: 2 });
      c.style.transformBox = 'fill-box'; c.style.transformOrigin = 'center';
    },

    // ---- Анимация расчёта: «радар» обходит план по часовой от севера и окрашивает комнаты
    animateScan: function (done) {
      var self = this, geo = this.geo, north = Number(this.project.north) || 0;
      if (!geo || !this.roomEls) { if (done) done(); return; }
      this.roomEls.forEach(function (r) { r.body.setAttribute('fill', r.base); });
      if (this.badges) for (var n in this.badges) this.badges[n].style.opacity = 0;
      var R = Math.hypot(geo.w, geo.h);
      var sweep = el('path', { class: 'sweep' }, this.svg);
      var grad = this.svg.querySelector('#sweepGrad');
      grad.setAttribute('cx', geo.cx); grad.setAttribute('cy', geo.cy); grad.setAttribute('r', R);
      var start = performance.now(), dur = 2200;
      cancelAnimationFrame(this.anim);
      var findings = this.result ? this.result.findings : [];
      function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        var ease = 1 - Math.pow(1 - t, 2);
        var ang = ease * 360; // компасный угол фронта
        var a1 = (ang - 40 - north) * Math.PI / 180, a2 = (ang - north) * Math.PI / 180;
        sweep.setAttribute('d', 'M' + geo.cx + ' ' + geo.cy +
          'L' + (geo.cx + Math.sin(a1) * R) + ' ' + (geo.cy - Math.cos(a1) * R) +
          'A' + R + ' ' + R + ' 0 0 1 ' + (geo.cx + Math.sin(a2) * R) + ' ' + (geo.cy - Math.cos(a2) * R) + 'Z');
        self.roomEls.forEach(function (r) {
          if (r.f && !r.done && (r.f.bearing <= ang || t === 1)) {
            r.done = true; r.body.setAttribute('fill', lighten(r.f.verdict.color, .45));
            r.body.parentNode.classList.add('reveal');
          }
        });
        findings.forEach(function (f) {
          var b = self.badges && self.badges[f.n];
          if (b && b.style.opacity === '0' && ((f.bearing !== undefined ? f.bearing : 0) <= ang || t === 1)) {
            b.style.transition = 'opacity .4s'; b.style.opacity = 1;
          }
        });
        if (t < 1) self.anim = requestAnimationFrame(frame);
        else { sweep.remove(); self.roomEls.forEach(function (r) { r.done = false; }); if (done) done(); }
      }
      this.anim = requestAnimationFrame(frame);
    },

    // ---- «Прогулка»: точка проходит от входа по всем комнатам
    walk: function (onStep) {
      var self = this, project = this.project, res = this.result;
      if (!project.rooms.length) return;
      var ent = (project.items || []).filter(function (i) { return i.type === 'entrance'; })[0];
      var pts = [];
      var cur = ent ? { x: ent.x, y: ent.y } : { x: this.geo.cx, y: this.geo.y };
      var left = project.rooms.map(function (r, i) { return { x: r.x + r.w / 2, y: r.y + r.h / 2, i: i }; });
      pts.push({ x: cur.x, y: cur.y, i: -1 });
      while (left.length) {
        left.sort(function (a, b) { return Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y); });
        cur = left.shift(); pts.push(cur);
      }
      var walker = el('circle', { class: 'walker', r: .22, cx: pts[0].x, cy: pts[0].y }, this.svg);
      var trail = el('polyline', { points: '', fill: 'none', stroke: '#d9822b', 'stroke-width': .05, 'stroke-dasharray': '.15 .1', opacity: .8 }, this.svg);
      var tag = el('g', {}, this.svg);
      var tagBg = el('rect', { rx: .12, fill: 'var(--ink)', opacity: .88 }, tag);
      var tagT = txt(tag, 0, 0, '', '', { style: 'font-size:.3px;fill:var(--panel);font-weight:600' });
      var seg = 0, segT = 0, last = performance.now(), trailPts = [pts[0].x + ',' + pts[0].y];
      var pause = 0;
      cancelAnimationFrame(this.anim);
      function showTag(p) {
        if (p.i < 0) { tagT.textContent = 'Вход' + (res && res.entrance ? ': пада ' + res.entrance.pada.code + ' ' + res.entrance.pada.name : ''); }
        else {
          var r = project.rooms[p.i], f = res && res.rooms[p.i];
          tagT.textContent = (r.name || V.ROOM_TYPES[r.type].ru) + (f ? ' — ' + V.DIR_INFO[f.dir].short + ', ' + f.verdict.ru : '');
          if (onStep) onStep(p.i);
        }
        tagT.setAttribute('x', p.x + .35); tagT.setAttribute('y', p.y - .4);
        var bb = tagT.getBBox();
        tagBg.setAttribute('x', bb.x - .12); tagBg.setAttribute('y', bb.y - .08);
        tagBg.setAttribute('width', bb.width + .24); tagBg.setAttribute('height', bb.height + .16);
      }
      showTag(pts[0]);
      function frame(now) {
        var dt = (now - last) / 1000; last = now;
        if (pause > 0) { pause -= dt; self.anim = requestAnimationFrame(frame); return; }
        var a = pts[seg], b = pts[seg + 1];
        if (!b) { setTimeout(function () { walker.remove(); trail.remove(); tag.remove(); }, 1500); return; }
        var L = Math.hypot(b.x - a.x, b.y - a.y) || .01;
        segT += dt * 3.2 / L;
        if (segT >= 1) {
          segT = 0; seg++; trailPts.push(b.x + ',' + b.y); showTag(b); pause = .7;
          walker.setAttribute('cx', b.x); walker.setAttribute('cy', b.y);
        } else {
          var x = a.x + (b.x - a.x) * segT, y = a.y + (b.y - a.y) * segT;
          walker.setAttribute('cx', x); walker.setAttribute('cy', y);
          trail.setAttribute('points', trailPts.concat(x + ',' + y).join(' '));
        }
        self.anim = requestAnimationFrame(frame);
      }
      this.anim = requestAnimationFrame(frame);
    },

    // ---- Перетаскивание комнат/предметов и изменение размера
    _bindDrag: function () {
      var self = this, svg = this.svg, drag = null;
      function pt(e) {
        var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
        return p.matrixTransform(svg.getScreenCTM().inverse());
      }
      function snap(v) { return Math.round(v * 10) / 10; }
      svg.addEventListener('pointerdown', function (e) {
        var t = e.target, kind = t.getAttribute('data-kind');
        if (!kind) {
          var g = t.closest && t.closest('[data-kind]');
          if (g) { kind = g.getAttribute('data-kind'); t = g; }
        }
        if (!kind) { self.select(null); if (self.onSelect) self.onSelect(null); return; }
        var idx = +t.getAttribute('data-idx');
        var p = pt(e);
        var obj = kind === 'item' ? self.project.items[idx] : self.project.rooms[idx];
        drag = { kind: kind, idx: idx, sx: p.x, sy: p.y, ox: obj.x, oy: obj.y, ow: obj.w, oh: obj.h, moved: false };
        self.frozenVB = self.vb.slice();
        svg.setPointerCapture(e.pointerId);
        self.sel = { kind: kind === 'resize' ? 'room' : kind, idx: idx };
        self.render(self.project, self.result);
        if (self.onSelect) self.onSelect(self.sel.kind, idx);
        e.preventDefault();
      });
      svg.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var p = pt(e), dx = p.x - drag.sx, dy = p.y - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < .05) return;
        drag.moved = true;
        if (drag.kind === 'resize') {
          var r = self.project.rooms[drag.idx];
          r.w = Math.max(.5, snap(drag.ow + dx)); r.h = Math.max(.5, snap(drag.oh + dy));
        } else {
          var o = drag.kind === 'item' ? self.project.items[drag.idx] : self.project.rooms[drag.idx];
          o.x = snap(drag.ox + dx); o.y = snap(drag.oy + dy);
        }
        if (self.onChange) self.onChange(true);
      });
      function end() {
        if (!drag) return;
        var moved = drag.moved;
        drag = null; self.frozenVB = null;
        if (self.onChange) self.onChange(false, moved);
      }
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
    },

    // PNG плана для отчёта
    toPNG: function (scale) {
      var svg = this.svg;
      var vb = svg.getAttribute('viewBox').split(' ').map(Number);
      var W = 1400, H = Math.round(W * vb[3] / vb[2]);
      var clone = svg.cloneNode(true);
      clone.setAttribute('width', W); clone.setAttribute('height', H);
      // встроить вычисленные стили (CSS-переменные и классы) — копируем ключевые свойства
      var src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
      var props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'fill-opacity', 'font-family'];
      for (var i = 0; i < src.length; i++) {
        var cs = getComputedStyle(src[i]), s = '';
        props.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) s += p + ':' + v + ';'; });
        dst[i].setAttribute('style', s + 'animation:none;transition:none');
      }
      var bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', vb[0]); bg.setAttribute('y', vb[1]); bg.setAttribute('width', vb[2]); bg.setAttribute('height', vb[3]);
      bg.setAttribute('fill', '#fbf8f2');
      clone.insertBefore(bg, clone.firstChild);
      var data = new XMLSerializer().serializeToString(clone);
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas'); c.width = W; c.height = H;
          var ctx = c.getContext('2d'); ctx.fillStyle = '#fbf8f2'; ctx.fillRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0, W, H);
          resolve({ data: c.toDataURL('image/png'), w: W, h: H });
        };
        img.onerror = reject;
        img.src = url;
      });
    }
  };
})(window.VASTU);
