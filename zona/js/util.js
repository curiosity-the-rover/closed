/* Зона: общие утилиты — шум, процедурные фактуры, звук. */
window.Z = window.Z || {};

(function (Z) {
  'use strict';

  // ---------- детерминированный ГПСЧ и value-noise
  Z.rng = function (seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  };
  function hash(x, y) {
    var h = x * 374761393 + y * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  Z.noise = function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    var u = smooth(xf), v = smooth(yf);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };
  Z.fbm = function (x, y, oct) {
    var s = 0, a = 0.5, f = 1, n = 0;
    for (var i = 0; i < (oct || 4); i++) { s += Z.noise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  };
  Z.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  Z.smoothstep = function (a, b, x) { var t = Z.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  Z.lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---------- процедурные фактуры (canvas → THREE.CanvasTexture)
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function tex(c, rx, ry) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || rx || 1);
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function speckle(ctx, w, h, n, colors, rmin, rmax, alpha) {
    var r = Z.rng(n * 7 + w);
    for (var i = 0; i < n; i++) {
      ctx.globalAlpha = alpha * (0.4 + r() * 0.6);
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      var s = rmin + r() * (rmax - rmin);
      ctx.fillRect(r() * w, r() * h, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function noiseFill(ctx, w, h, scale, c1, c2, seed) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      // тайлируемый шум: суммируем по периоду
      var u = x / w, v = y / h, n = 0;
      n += Z.fbm(Math.cos(u * 6.283) * scale + seed, Math.sin(u * 6.283) * scale + Math.cos(v * 6.283) * scale, 4) * 0.6;
      n += Z.fbm(Math.sin(v * 6.283) * scale * 2 + seed, Math.cos(v * 6.283) * scale * 2 + u, 3) * 0.4;
      var i = (y * w + x) * 4;
      d[i] = c1[0] + (c2[0] - c1[0]) * n; d[i + 1] = c1[1] + (c2[1] - c1[1]) * n; d[i + 2] = c1[2] + (c2[2] - c1[2]) * n; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  var cache = {};
  Z.tex = function (name, rx, ry) {
    if (!cache[name]) cache[name] = Z.TEX[name]();
    var t = cache[name].clone(); t.needsUpdate = true; t.repeat.set(rx || 1, ry || rx || 1);
    return t;
  };

  Z.TEX = {
    ground: function () {
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 1.6, [70, 72, 44], [128, 120, 78], 3);
      speckle(x, 256, 256, 2200, ['#5b6a32', '#7a7b45', '#3e4a24', '#8d7f55', '#a89a6a'], 1, 3, 0.55);
      speckle(x, 256, 256, 260, ['#4d3f2c', '#6b5a40'], 2, 5, 0.4);
      return tex(c);
    },
    asphalt: function () {
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 3, [52, 53, 52], [92, 92, 88], 11);
      speckle(x, 256, 256, 3000, ['#2a2a2a', '#777', '#5a5a55'], 1, 2, 0.6);
      // трещины
      var r = Z.rng(5);
      x.strokeStyle = 'rgba(20,20,18,.75)'; x.lineWidth = 1.2;
      for (var i = 0; i < 18; i++) {
        x.beginPath(); var px = r() * 256, py = r() * 256; x.moveTo(px, py);
        for (var j = 0; j < 7; j++) { px += (r() - .5) * 30; py += (r() - .5) * 30; x.lineTo(px, py); }
        x.stroke();
      }
      // выцветшая разметка по центру
      x.fillStyle = 'rgba(210,205,170,.35)';
      for (var k = 0; k < 256; k += 64) x.fillRect(124, k, 8, 36);
      // заплаты
      x.fillStyle = 'rgba(30,30,30,.5)'; x.fillRect(30, 150, 50, 34); x.fillRect(180, 40, 38, 28);
      return tex(c);
    },
    concrete: function () {
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 2.2, [118, 116, 108], [170, 166, 154], 21);
      speckle(x, 256, 256, 1600, ['#6d6a62', '#9b968a', '#4d4b45'], 1, 2, 0.5);
      // потёки и швы панелей
      for (var i = 0; i < 40; i++) { x.fillStyle = 'rgba(60,55,45,' + (0.04 + Math.random() * 0.08) + ')'; x.fillRect(Math.random() * 256, 0, 2 + Math.random() * 5, 256 * Math.random()); }
      x.strokeStyle = 'rgba(50,48,44,.6)'; x.lineWidth = 2; x.strokeRect(1, 1, 254, 254);
      return tex(c);
    },
    brick: function () {
      var c = canvas(256), x = c.getContext('2d');
      x.fillStyle = '#8a8478'; x.fillRect(0, 0, 256, 256);
      var r = Z.rng(9), bw = 32, bh = 16;
      for (var row = 0; row < 16; row++) for (var col = -1; col < 9; col++) {
        var ox = col * bw + (row % 2 ? bw / 2 : 0);
        var t = r();
        x.fillStyle = 'rgb(' + (120 + t * 50 | 0) + ',' + (52 + t * 25 | 0) + ',' + (38 + t * 15 | 0) + ')';
        x.fillRect(ox + 1, row * bh + 1, bw - 2, bh - 2);
      }
      speckle(x, 256, 256, 1800, ['#3b2a20', '#c9b9a0', '#5a3a2a'], 1, 2, 0.35);
      for (var i = 0; i < 25; i++) { x.fillStyle = 'rgba(30,26,20,' + (0.05 + r() * 0.12) + ')'; x.fillRect(r() * 256, r() * 128, 3 + r() * 8, 60 + r() * 190); }
      return tex(c);
    },
    plaster: function () {
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 2, [150, 158, 140], [196, 198, 178], 31);
      // осыпавшаяся штукатурка — видна кладка
      var r = Z.rng(17);
      for (var i = 0; i < 9; i++) {
        var px = r() * 230, py = r() * 230, w = 16 + r() * 40, h = 10 + r() * 30;
        x.fillStyle = '#7e4e3a'; x.fillRect(px, py, w, h);
        x.strokeStyle = 'rgba(60,40,30,.6)'; x.strokeRect(px, py, w, h);
      }
      speckle(x, 256, 256, 1400, ['#7a7f68', '#5c6250', '#d0d1bc'], 1, 2, 0.4);
      for (var j = 0; j < 30; j++) { x.fillStyle = 'rgba(70,70,50,' + (0.05 + r() * 0.1) + ')'; x.fillRect(r() * 256, r() * 60, 2 + r() * 4, 80 + r() * 170); }
      return tex(c);
    },
    wood: function () {
      var c = canvas(256), x = c.getContext('2d');
      var r = Z.rng(13);
      for (var i = 0; i < 8; i++) {
        var t = r();
        x.fillStyle = 'rgb(' + (78 + t * 30 | 0) + ',' + (64 + t * 22 | 0) + ',' + (48 + t * 16 | 0) + ')';
        x.fillRect(i * 32, 0, 32, 256);
        x.fillStyle = 'rgba(25,20,15,.8)'; x.fillRect(i * 32, 0, 2, 256);
        for (var k = 0; k < 30; k++) { x.fillStyle = 'rgba(30,25,18,' + (0.1 + r() * 0.2) + ')'; x.fillRect(i * 32 + 3 + r() * 26, r() * 256, 1, 20 + r() * 60); }
      }
      speckle(x, 256, 256, 900, ['#2e2a24', '#6d6a5e'], 1, 3, 0.3);
      return tex(c);
    },
    roof: function () {
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 2, [78, 80, 76], [120, 118, 108], 41);
      // волнистый шифер
      for (var i = 0; i < 256; i += 16) {
        var g = x.createLinearGradient(i, 0, i + 16, 0);
        g.addColorStop(0, 'rgba(0,0,0,.25)'); g.addColorStop(0.5, 'rgba(255,255,255,.1)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
        x.fillStyle = g; x.fillRect(i, 0, 16, 256);
      }
      speckle(x, 256, 256, 900, ['#4b5a30', '#2d2d2a', '#6a7a40'], 2, 5, 0.45); // мох
      return tex(c);
    },
    rust: function () {
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 2.5, [74, 52, 36], [150, 84, 44], 51);
      speckle(x, 256, 256, 2400, ['#3b2b20', '#8f4f25', '#b06a30', '#5a5f50'], 1, 4, 0.5);
      return tex(c);
    },
    paintMetal: function () { // облупившаяся зелёная краска (техника)
      var c = canvas(256), x = c.getContext('2d');
      noiseFill(x, 256, 256, 2.2, [58, 70, 46], [96, 106, 70], 61);
      var r = Z.rng(23);
      for (var i = 0; i < 70; i++) { x.fillStyle = 'rgba(' + (120 + r() * 40 | 0) + ',' + (60 + r() * 20 | 0) + ',30,' + (0.4 + r() * 0.4) + ')'; x.beginPath(); x.arc(r() * 256, r() * 256, 2 + r() * 10, 0, 7); x.fill(); }
      speckle(x, 256, 256, 900, ['#2a2f20', '#8a8a70'], 1, 2, 0.4);
      return tex(c);
    },
    birch: function () {
      var c = canvas(64, 256), x = c.getContext('2d');
      x.fillStyle = '#ddd9cc'; x.fillRect(0, 0, 64, 256);
      var r = Z.rng(71);
      for (var i = 0; i < 40; i++) { x.fillStyle = 'rgba(25,25,22,' + (0.5 + r() * 0.5) + ')'; x.fillRect(r() * 64, r() * 256, 4 + r() * 18, 1 + r() * 4); }
      speckle(x, 64, 256, 300, ['#a9a597', '#6d6a60'], 1, 2, 0.5);
      return tex(c);
    },
    bark: function () {
      var c = canvas(64, 256), x = c.getContext('2d');
      noiseFill(x, 64, 256, 3, [52, 40, 30], [96, 74, 54], 81);
      for (var i = 0; i < 64; i += 5) { x.fillStyle = 'rgba(20,15,10,.5)'; x.fillRect(i + Math.random() * 2, 0, 1.5, 256); }
      return tex(c);
    },
    leaves: function () { // альфа-карта листвы для «облаков» кроны
      var c = canvas(128), x = c.getContext('2d');
      var r = Z.rng(91);
      for (var i = 0; i < 520; i++) {
        var t = r();
        x.fillStyle = 'rgba(' + (60 + t * 60 | 0) + ',' + (88 + t * 60 | 0) + ',' + (30 + t * 25 | 0) + ',1)';
        x.beginPath(); x.ellipse(r() * 128, r() * 128, 2 + r() * 4, 1 + r() * 2.5, r() * 3, 0, 7); x.fill();
      }
      var t2 = tex(c); return t2;
    },
    grass: function () { // пучок травы с альфой
      var c = canvas(128), x = c.getContext('2d');
      var r = Z.rng(101);
      for (var i = 0; i < 46; i++) {
        var bx = 10 + r() * 108, h = 50 + r() * 74, lean = (r() - .5) * 40, t = r();
        x.strokeStyle = 'rgb(' + (92 + t * 70 | 0) + ',' + (104 + t * 50 | 0) + ',' + (44 + t * 20 | 0) + ')';
        x.lineWidth = 1.5 + r() * 2;
        x.beginPath(); x.moveTo(bx, 128); x.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h); x.stroke();
      }
      var tt = tex(c); tt.wrapS = tt.wrapT = THREE.ClampToEdgeWrapping; return tt;
    },
    sky: function () {
      var c = canvas(512, 256), x = c.getContext('2d');
      var g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#5f6460'); g.addColorStop(0.45, '#8f9286'); g.addColorStop(0.62, '#c3b89a'); g.addColorStop(1, '#9a9a88');
      x.fillStyle = g; x.fillRect(0, 0, 512, 256);
      // облака
      var img = x.getImageData(0, 0, 512, 256), d = img.data;
      for (var yy = 0; yy < 150; yy++) for (var xx = 0; xx < 512; xx++) {
        var u = xx / 512;
        var n = Z.fbm(Math.cos(u * 6.283) * 3 + 5, Math.sin(u * 6.283) * 3 + yy / 40, 5);
        var a = Z.smoothstep(0.45, 0.75, n) * (1 - yy / 150) * 0.7;
        var i = (yy * 512 + xx) * 4;
        d[i] = d[i] * (1 - a) + 120 * a; d[i + 1] = d[i + 1] * (1 - a) + 122 * a; d[i + 2] = d[i + 2] * (1 - a) + 116 * a;
      }
      x.putImageData(img, 0, 0);
      var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; return t;
    },
    sign: function () {
      var c = canvas(256, 64), x = c.getContext('2d');
      x.fillStyle = '#d8d0a8'; x.fillRect(0, 0, 256, 64);
      x.fillStyle = '#b42a1e'; x.fillRect(0, 0, 256, 10); x.fillRect(0, 54, 256, 10);
      x.fillStyle = '#1f1f1f'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('СТОЙ! ПРОВЕРКА', 128, 42);
      speckle(x, 256, 64, 500, ['#6b5a40', '#3b2b20'], 1, 3, 0.5);
      return tex(c);
    },
    radSign: function () {
      var c = canvas(128), x = c.getContext('2d');
      x.fillStyle = '#d6b11e'; x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#151515'; x.beginPath(); x.arc(64, 64, 10, 0, 7); x.fill();
      for (var i = 0; i < 3; i++) { x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, 46, i * 2.094 - 0.52, i * 2.094 + 0.52); x.closePath(); x.fill(); }
      x.fillStyle = '#d6b11e'; x.beginPath(); x.arc(64, 64, 16, 0, 7); x.fill(); x.fillStyle = '#151515'; x.beginPath(); x.arc(64, 64, 10, 0, 7); x.fill();
      speckle(x, 128, 128, 400, ['#6b4a20', '#3b2b20'], 1, 4, 0.5);
      return tex(c);
    }
  };

  // ---------- звук
  Z.Sound = {
    ctx: null, master: null, wind: null, listener: { x: 0, z: 0 },
    init: function () {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      // ветер: зацикленный шум через полосовой фильтр с медленной модуляцией
      var c = this.ctx, len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.06; d[i] = last; }
      var src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
      var g = c.createGain(); g.gain.value = 0.9;
      var lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.wind = g;
    },
    vol: function (x, z, base, range) {
      if (x === undefined) return base;
      var d = Math.hypot(x - this.listener.x, z - this.listener.z);
      return base * Z.clamp(1 - d / (range || 120), 0, 1);
    },
    noise: function (dur, freq, gain, type, q) {
      var c = this.ctx; if (!c || gain <= 0.002) return;
      var len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      var s = c.createBufferSource(); s.buffer = buf;
      var f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; if (q) f.Q.value = q;
      var g = c.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
    },
    tone: function (freq, dur, gain, type, slide) {
      var c = this.ctx; if (!c || gain <= 0.002) return;
      var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    shot: function (kind, x, z) {
      var v = this.vol(x, z, 1, 250);
      if (kind === 'ak') { this.noise(0.28, 1800, 0.55 * v); this.tone(85, 0.18, 0.35 * v, 'triangle', 40); }
      else { this.noise(0.2, 2600, 0.4 * v); this.tone(130, 0.12, 0.25 * v, 'triangle', 60); }
    },
    click: function () { this.tone(1800, 0.02, 0.06, 'square'); },
    geiger: function (k) { this.noise(0.012, 3000 + Math.random() * 2000, 0.12 + k * 0.1, 'highpass'); },
    beep: function (f) { this.tone(f || 1400, 0.07, 0.07, 'sine'); },
    step: function (soft) { this.noise(0.08, soft ? 500 : 900, soft ? 0.05 : 0.09, 'lowpass'); },
    hurt: function () { this.tone(160, 0.25, 0.2, 'sawtooth', 70); },
    bark: function (x, z) { var v = this.vol(x, z, 1, 90); this.tone(420, 0.16, 0.22 * v, 'sawtooth', 180); this.noise(0.12, 900, 0.15 * v, 'bandpass', 2); },
    bite: function () { this.noise(0.1, 1200, 0.3); this.tone(220, 0.1, 0.2, 'square', 90); },
    anomaly: function (kind, x, z) {
      var v = this.vol(x, z, 1, 60);
      if (kind === 'electra') { this.noise(0.3, 5000, 0.35 * v, 'highpass'); this.tone(60, 0.3, 0.2 * v, 'square'); }
      else if (kind === 'zharka') { this.noise(0.8, 700, 0.4 * v, 'lowpass'); }
      else { this.tone(50, 0.9, 0.35 * v, 'sine', 25); this.noise(0.6, 300, 0.3 * v); }
    },
    reload: function () { var s = this; s.tone(700, 0.04, 0.08, 'square'); setTimeout(function () { s.tone(500, 0.05, 0.09, 'square'); }, 380); setTimeout(function () { s.tone(900, 0.04, 0.1, 'square'); }, 900); },
    pick: function () { this.tone(800, 0.05, 0.08, 'square'); this.tone(1200, 0.07, 0.06, 'square'); },
    knife: function () { this.noise(0.14, 1500, 0.15, 'bandpass', 3); },
    fire: function (x, z) { this.noise(0.05, 1200 + Math.random() * 1500, this.vol(x, z, 0.08, 25), 'bandpass', 4); }
  };
})(window.Z);
