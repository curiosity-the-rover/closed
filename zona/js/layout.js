/* Зона: раскладка карты «Окраина» — рельеф, дороги, точки интереса. Без three.js. */
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

  Z.LAYOUT = { ROAD: ROAD, TRACK: TRACK, TRACK2: TRACK2, FLAT: FLAT, POND_R: POND_R, HALF: HALF, polyDist: polyDist, lowH: lowH };
})(window.Z);
