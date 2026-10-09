/* Расчётный движок Васту: геометрия плана → зоны → оценки → итог. Без DOM. */
window.VASTU = window.VASTU || {};

(function (V) {
  'use strict';

  var DEG = 180 / Math.PI;

  function mod(a, n) { return ((a % n) + n) % n; }

  function bbox(rooms) {
    if (!rooms.length) return { x: 0, y: 0, w: 1, h: 1, cx: 0.5, cy: 0.5 };
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rooms.forEach(function (r) {
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // Азимут точки относительно центра плана (0 = север, по часовой).
  function bearing(geo, px, py, north) {
    var a = Math.atan2(px - geo.cx, -(py - geo.cy)) * DEG;
    return mod(a + north, 360);
  }
  function dir8(b) { return V.DIRS8[Math.floor(mod(b + 22.5, 360) / 45)]; }
  function zone16(b) { return V.ZONES16[Math.floor(mod(b + 11.25, 360) / 22.5)]; }
  function pada32(b) { return V.PADAS32[Math.floor(mod(b, 360) / 11.25)]; }
  // Перевод компасного направления в угол на плане (градусы от «вверх» по часовой)
  function compassToPlan(compassDeg, north) { return mod(compassDeg - north, 360); }
  var DIR_DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

  function brahma(geo) {
    return { x: geo.x + geo.w / 3, y: geo.y + geo.h / 3, w: geo.w / 3, h: geo.h / 3 };
  }
  function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
  function overlap(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    var h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  // Направление точки: центр (Брахмастхан) или одна из 8 сторон
  function locate(geo, px, py, north) {
    var b = bearing(geo, px, py, north);
    var inC = inRect(px, py, brahma(geo));
    return { bearing: b, dir: inC ? 'C' : dir8(b), dir8: dir8(b), zone: zone16(b), center: inC };
  }

  function verdictOf(s) {
    if (s >= 2) return { key: 'great', ru: 'Отлично', color: '#2a9d4b' };
    if (s >= 1) return { key: 'good', ru: 'Благоприятно', color: '#6bbf59' };
    if (s >= 0) return { key: 'neutral', ru: 'Нейтрально', color: '#e9b949' };
    if (s >= -1) return { key: 'bad', ru: 'Неблагоприятно', color: '#e76f51' };
    return { key: 'worst', ru: 'Сильный дефект', color: '#c0392b' };
  }
  V.verdictOf = verdictOf;

  // ---- рекомендации (традиционные «бесстроительные» коррекции)
  var REMEDY = {
    kitchen: 'Сместите плиту в юго-восточный угол кухни, готовьте лицом на восток; используйте тёплые цвета (оранжевый, красный), избегайте чёрного и синего.',
    toilet: 'Держите дверь и крышку закрытыми, установите вытяжку; чаша морской соли, светлые тона; по традиции — латунная/медная полоса по порогу.',
    bath: 'Хорошая вентиляция, светлые тона, не хранить мокрые вещи; дверь держать закрытой.',
    master: 'Если перенести нельзя — поставьте кровать в юго-западную часть комнаты, изголовьем на юг; землистые оттенки (бежевый, персиковый).',
    bedroom: 'Кровать — в юго-западную часть комнаты, изголовьем на юг или восток; уберите зеркала напротив кровати.',
    kids: 'Стол для занятий — лицом на восток или север; спокойные пастельные цвета.',
    guest: 'Светлые тона; кровать изголовьем на юг или восток.',
    puja: 'Держите место молитвы чистым и светлым, лицом на восток; не размещайте рядом с туалетом.',
    stairs: 'Подъём по часовой стрелке; не храните под лестницей ценное; тяжёлые элементы — на юг/запад.',
    store: 'Освободите северо-восток от тяжёлых вещей; храните запасы у южной/западной стены.',
    living: 'Оставьте больше свободного пространства и света; тяжёлую мебель — к югу/западу комнаты.',
    entrance: 'Порог, хорошее освещение, табличка с именем; по традиции — защитные символы и медная/латунная полоса или пирамидка над дверью; цвет двери по стороне света.',
    cut: 'Визуально «достройте» вырезанную зону: зеркало на прилегающей стене, растения, свет; по традиции — металлическая полоса или пирамиды по линии выреза.',
    center: 'Освободите центр: ничего тяжёлого, никаких санузлов и кухни; светлые тона, хорошее освещение.',
    item: 'Перенесите предмет в рекомендованную зону или разверните по благоприятному направлению.',
    plot: 'Компенсация: выше и массивнее сделайте юг и запад (забор, деревья), больше открытого пространства и воды — на севере и востоке.',
    director: 'Стол руководителя — в юго-западной части кабинета, лицом на север или восток; стена за спиной.',
    accounts: 'Касса/бухгалтерия — лицом на север, сейф у южной стены дверцей на север.',
    reception: 'Стойка — лицом к входу, светлая и открытая.',
    server: 'Перенесите щиты/серверы к юго-восточной стене; избегайте СВ.',
    pantry: 'Плита/кофемашина — в юго-восточном углу помещения.'
  };
  function remedyFor(key) { return REMEDY[key] || REMEDY.item; }

  function ayadi(geo, unitKey) {
    var unit = V.AYADI.units[unitKey] || V.AYADI.units.kol;
    var perimeter = 2 * (geo.w + geo.h) / unit.m;
    var P = Math.round(perimeter);
    var res = { unit: unit.ru, perimeterRaw: perimeter, P: P, values: {} };
    V.AYADI.formulas.forEach(function (f) {
      res.values[f.key] = { ru: f.ru, value: mod(P * f.mul, f.div), mul: f.mul, div: f.div };
    });
    var aya = res.values.aya.value, vy = res.values.vyaya.value;
    var y = res.values.yoni.value, va = res.values.vara.value;
    res.yoniName = V.AYADI.yoniNames[y];
    res.varaName = V.AYADI.varaNames[va];
    res.checks = [
      { ru: 'Ая > Вьяя (доход больше расхода)', ok: aya > vy, detail: aya + ' vs ' + vy },
      { ru: 'Благоприятная йони (нечётная)', ok: V.AYADI.goodYoni.indexOf(y) >= 0, detail: res.yoniName },
      { ru: 'Благоприятный день (вара)', ok: V.AYADI.goodVara.indexOf(va) >= 0, detail: res.varaName }
    ];
    res.score = res.checks.filter(function (c) { return c.ok; }).length; // 0..3
    return res;
  }

  /* Основной расчёт.
   * project: { objectType, name, north, rooms[], items[], plot } */
  V.calculate = function (project) {
    var north = Number(project.north) || 0;
    var rooms = project.rooms || [];
    var items = project.items || [];
    var geo = bbox(rooms);
    var bc = brahma(geo);
    var findings = [];
    var total = 0, max = 0;
    var seq = 0;

    function add(f, weight) {
      f.n = ++seq;
      f.weight = weight;
      f.verdict = verdictOf(f.s);
      f.points = (f.s + 2) / 4 * weight;
      total += f.points; max += weight;
      findings.push(f);
      return f;
    }

    // ---- 1. Помещения
    var roomResults = rooms.map(function (r, idx) {
      var t = V.ROOM_TYPES[r.type] || V.ROOM_TYPES.hall;
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      var loc = locate(geo, cx, cy, north);
      var s = t.rules[loc.dir];
      var note = t.why;
      if (r.type === 'toilet' && !loc.center && V.TOILET_ZONES16.indexOf(loc.zone.id) >= 0 && s < 1) {
        s = 1; note += ' Зона ' + loc.zone.ru + ' по 16-зонной системе подходит для санузла.';
      }
      var f = add({
        cat: 'room', idx: idx, title: r.name || t.ru, typeRu: t.ru, dir: loc.dir, zone: loc.zone,
        bearing: loc.bearing, s: s, text: note,
        remedy: s < 0 ? remedyFor(r.type) : '', x: cx, y: cy
      }, Math.max(t.w, 0.5));
      return f;
    });

    // ---- 2. Брахмастхан
    var heavyCenter = ['toilet', 'bath', 'kitchen', 'stairs', 'store', 'server', 'pantry', 'storeRaw', 'storeGoods', 'utility'];
    var bArea = bc.w * bc.h;
    var bad = rooms.filter(function (r) {
      return heavyCenter.indexOf(r.type) >= 0 && overlap(r, bc) > bArea * 0.15;
    });
    add({
      cat: 'center', title: 'Брахмастхан (центр)', dir: 'C', s: bad.length ? -2 : 2,
      text: bad.length
        ? 'В центре плана: ' + bad.map(function (r) { return r.name || V.ROOM_TYPES[r.type].ru; }).join(', ') + '. Центр должен оставаться открытым и лёгким.'
        : 'Центр плана свободен от санузлов, кухни и лестниц — это очень хорошо.',
      remedy: bad.length ? remedyFor('center') : '', x: geo.cx, y: geo.cy
    }, 3);

    // ---- 3. Форма: пропорции и вырезы (по сетке 3×3)
    var ratio = Math.max(geo.w, geo.h) / Math.max(0.01, Math.min(geo.w, geo.h));
    add({
      cat: 'shape', title: 'Пропорции плана', dir: '', s: ratio <= 1.25 ? 2 : ratio <= 1.6 ? 1 : ratio <= 2 ? 0 : -1,
      text: 'Соотношение сторон 1 : ' + ratio.toFixed(2) + '. Лучше всего квадрат или прямоугольник до 1:1,5; длиннее 1:2 — нежелательно.',
      remedy: ratio > 2 ? 'Зонируйте пространство на два почти квадратных блока (перегородкой, мебелью, напольным покрытием).' : '',
      x: geo.cx, y: geo.cy
    }, 2);

    var cuts = [];
    var cw = geo.w / 3, ch = geo.h / 3;
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      if (i === 1 && j === 1) continue;
      var cell = { x: geo.x + i * cw, y: geo.y + j * ch, w: cw, h: ch };
      var cov = rooms.reduce(function (a, r) { return a + overlap(r, cell); }, 0) / (cw * ch);
      if (cov < 0.6) {
        var d = dir8(bearing(geo, cell.x + cw / 2, cell.y + ch / 2, north));
        cuts.push({ dir: d, cov: cov, cell: cell });
      }
    }
    var CUT_S = { NE: -2, SW: -2, N: -1, E: -1, SE: -1, NW: -1, S: 0, W: 0 };
    if (!cuts.length) {
      add({ cat: 'shape', title: 'Вырезы / недостающие углы', dir: '', s: 2,
        text: 'План полный, без недостающих углов и вырезов.', remedy: '', x: geo.cx, y: geo.cy }, 3);
    } else {
      cuts.forEach(function (c) {
        add({ cat: 'cut', title: 'Вырез в зоне ' + V.DIR_INFO[c.dir].ru, dir: c.dir, s: CUT_S[c.dir],
          text: 'Зона заполнена на ' + Math.round(c.cov * 100) + '%. Отсутствие зоны ослабляет её сферу: ' + V.DIR_INFO[c.dir].meaning + '.',
          remedy: remedyFor('cut'), x: c.cell.x + c.cell.w / 2, y: c.cell.y + c.cell.h / 2, cell: c.cell }, c.dir === 'NE' || c.dir === 'SW' ? 3 : 2);
      });
    }

    // ---- 4. Вход и предметы
    var entrance = null;
    items.forEach(function (it, idx) {
      var t = V.ITEM_TYPES[it.type];
      if (!t) return;
      var loc = locate(geo, it.x, it.y, north);
      if (it.type === 'entrance') {
        var p = pada32(loc.bearing);
        entrance = { pada: p, bearing: loc.bearing, dir: loc.dir8 };
        add({ cat: 'entrance', idx: idx, title: 'Главный вход — пада ' + p.code + ' «' + p.name + '»', dir: loc.dir8,
          bearing: loc.bearing, s: p.s, pada: p,
          text: 'Азимут входа ' + Math.round(loc.bearing) + '°. Значение пады: ' + p.effect + '.',
          remedy: p.s < 0 ? remedyFor('entrance') : '', x: it.x, y: it.y }, 4);
        return;
      }
      var s = t.rules[loc.dir];
      var text = t.why;
      var w = ['bed', 'stove', 'safe', 'desk', 'counter'].indexOf(it.type) >= 0 ? 2 : 1;
      var fScore = null;
      if (t.facingGood && it.facing) {
        if (t.facingGood.indexOf(it.facing) >= 0) fScore = 2;
        else if (t.facingOk.indexOf(it.facing) >= 0) fScore = 1;
        else if (t.facingBad.indexOf(it.facing) >= 0) fScore = -2;
        else fScore = 0;
        text += ' ' + t.facingLabel + ' ' + V.DIR_INFO[it.facing].ru.toLowerCase() + '.';
      }
      var sc = fScore === null ? s : Math.round((s + fScore) / 2 * 2) / 2;
      if (fScore !== null && fScore <= -2) sc = Math.min(sc, -1);
      add({ cat: 'item', idx: idx, title: t.icon + ' ' + t.ru, dir: loc.dir, zone: loc.zone, bearing: loc.bearing,
        s: sc, placeS: s, facingS: fScore, facing: it.facing || '',
        text: text, remedy: sc < 0 ? remedyFor('item') + (fScore !== null && fScore < 0 ? ' Рекомендуемое направление: ' + t.facingGood.map(function (d) { return V.DIR_INFO[d].ru.toLowerCase(); }).join(' или ') + '.' : '') : '',
        x: it.x, y: it.y }, w);
    });
    if (!entrance) {
      add({ cat: 'entrance', title: 'Главный вход не указан', dir: '', s: 0,
        text: 'Добавьте предмет «Главный вход» на внешнюю стену — он оценивается по 32 падам.', remedy: '', x: geo.cx, y: geo.y }, 1);
    }

    // ---- 5. Участок (для частного дома)
    var ayadiRes = null;
    var ot = V.OBJECT_TYPES[project.objectType] || V.OBJECT_TYPES.apartment;
    if (ot.plot && project.plot) {
      var pl = project.plot;
      ['slope', 'water', 'tall'].forEach(function (k) {
        var v = pl[k]; if (!v) return;
        var cfg = V.PLOT[k];
        var s = cfg.good.indexOf(v) >= 0 ? 2 : cfg.ok.indexOf(v) >= 0 ? 0 : -2;
        add({ cat: 'plot', title: cfg.ru + ' ' + V.DIR_INFO[v].ru.toLowerCase(), dir: v, s: s, text: cfg.why,
          remedy: s < 0 ? remedyFor('plot') : '' }, 2);
      });
      if (pl.shoola) {
        var o = V.PLOT.shoola.opts.filter(function (x) { return x.v === pl.shoola; })[0];
        if (o) add({ cat: 'plot', title: 'Вити-шула: ' + o.ru, dir: '', s: o.s,
          text: 'Дорога, упирающаяся в участок, усиливает соответствующую зону: хорошо для С/В у северо-востока, плохо у юго-запада.',
          remedy: o.s < 0 ? 'Заслоните точку удара дороги: стена, ворота в другой паде, деревья; по традиции — зеркало Багуа или Ганеша.' : '' }, 2);
      }
      if (pl.roads && pl.roads.length) {
        var rs = pl.roads.map(function (d) { return V.PLOT.roads.good.indexOf(d) >= 0 ? 2 : V.PLOT.roads.ok.indexOf(d) >= 0 ? 1 : 0; });
        var avg = Math.max.apply(null, rs);
        add({ cat: 'plot', title: 'Дороги: ' + pl.roads.map(function (d) { return V.DIR_INFO[d].ru.toLowerCase(); }).join(', '), dir: '', s: avg,
          text: 'Дорога с севера или востока — лучшая для жилья; с запада — хороша для бизнеса; только с юга — допустимо при правильном входе.', remedy: '' }, 2);
      }
      add({ cat: 'plot', title: 'Открытое пространство на С и В', dir: '', s: pl.openNE ? 2 : -1,
        text: pl.openNE ? 'С севера и востока участка больше свободного места — правильно.' : 'Дом смещён к северу/востоку участка; должно быть наоборот.',
        remedy: pl.openNE ? '' : remedyFor('plot') }, 2);
      ayadiRes = ayadi(geo, pl.ayadiUnit || 'kol');
      add({ cat: 'ayadi', title: 'Аяди-шадварга (периметр ' + ayadiRes.P + ' ед.)', dir: '', s: [-1, 0, 1, 2][ayadiRes.score],
        text: ayadiRes.checks.map(function (c) { return (c.ok ? '[+] ' : '[–] ') + c.ru + ' (' + c.detail + ')'; }).join('; ') + '.',
        remedy: ayadiRes.score < 2 ? 'Аяди корректируют изменением размеров периметра на 1–2 единицы при проектировании.' : '' }, 2);
    }

    var score = max ? Math.round(total / max * 100) : 0;
    var band = score >= 80 ? { ru: 'Очень благоприятно', color: '#2a9d4b' }
      : score >= 65 ? { ru: 'Благоприятно', color: '#6bbf59' }
      : score >= 50 ? { ru: 'Нейтрально, есть что улучшить', color: '#e9b949' }
      : score >= 35 ? { ru: 'Неблагоприятно', color: '#e76f51' }
      : { ru: 'Сильно неблагоприятно', color: '#c0392b' };

    // сводка по 8 направлениям: что там расположено
    var dirMap = {};
    V.DIRS8.concat('C').forEach(function (d) { dirMap[d] = []; });
    roomResults.forEach(function (f) { dirMap[f.dir].push(f.title); });

    return {
      project: project, geo: geo, brahma: bc, north: north,
      findings: findings, rooms: roomResults, entrance: entrance, cuts: cuts, ayadi: ayadiRes,
      score: score, band: band, total: total, max: max, dirMap: dirMap,
      defects: findings.filter(function (f) { return f.s < 0; }).sort(function (a, b) { return a.s - b.s || b.weight - a.weight; }),
      strengths: findings.filter(function (f) { return f.s >= 2; })
    };
  };

  V.geo = { bbox: bbox, bearing: bearing, dir8: dir8, zone16: zone16, pada32: pada32, compassToPlan: compassToPlan, DIR_DEG: DIR_DEG, brahma: brahma, mod: mod };
})(window.VASTU);
