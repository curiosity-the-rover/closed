/* UI: формы ввода, связка движка, 2D/3D, отчётов. */
(function (V) {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var STORE_KEY = 'vastu-calc-project-v1';

  var state = { project: null, result: null, view: '2d', filter: 'all', calculated: false };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state.project)); } catch (e) { /* хранилище недоступно */ } }
  function load() { try { var s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function opt(sel, items, val) {
    sel.innerHTML = '';
    items.forEach(function (it) { var o = document.createElement('option'); o.value = it[0]; o.textContent = it[1]; if (it[0] === val) o.selected = true; sel.appendChild(o); });
  }
  var DIR_OPTS = V.DIRS8.map(function (d) { return [d, V.DIR_INFO[d].ru]; });

  // ---------- инициализация статических списков
  function initStatic() {
    opt($('#exampleSelect'), Object.keys(V.EXAMPLES).map(function (k) { return [k, V.EXAMPLES[k].title]; }));
    opt($('#objectType'), Object.keys(V.OBJECT_TYPES).map(function (k) { return [k, V.OBJECT_TYPES[k].ru]; }));
    opt($('#plotSlope'), [['', '— не указано —']].concat(DIR_OPTS));
    opt($('#plotWater'), [['', 'нет']].concat(DIR_OPTS));
    opt($('#plotTall'), [['', 'нет']].concat(DIR_OPTS));
    opt($('#plotShoola'), [['', 'нет']].concat(V.PLOT.shoola.opts.map(function (o) { return [o.v, o.ru]; })));
    opt($('#plotUnit'), Object.keys(V.AYADI.units).map(function (k) { return [k, V.AYADI.units[k].ru]; }));

    $('#refZones').innerHTML = V.ZONES16.map(function (z) { return '<li><b>' + z.ru + '</b> (' + z.name + ') — ' + z.meaning + '</li>'; }).join('');
    $('#refDirs').innerHTML = V.DIRS8.concat('C').map(function (d) { var i = V.DIR_INFO[d]; return '<li><b>' + i.ru + '</b>: ' + i.deity + ', стихия — ' + i.element.toLowerCase() + '; ' + i.meaning + '. Цвета: ' + i.colors + '.</li>'; }).join('');
    $('#refSources').innerHTML = V.SOURCES.map(function (s) { return '<li><b>' + s.t + '</b> — ' + s.d + '</li>'; }).join('') +
      '<li>Методика: направление комнаты — по азимуту её центра от центра плана; вход — по 32 падам (11,25°); центральная 1/9 — Брахмастхан; итог — взвешенная сумма оценок −2…+2.</li>' +
      '<li><i>' + V.DISCLAIMER + '</i></li>';
  }

  // ---------- форма из проекта
  function fill() {
    var p = state.project;
    $('#projName').value = p.name || '';
    $('#objectType').value = p.objectType;
    $('#north').value = p.north; $('#northRange').value = p.north;
    document.querySelectorAll('#quickNorth button').forEach(function (b) { b.classList.toggle('on', +b.dataset.v === +p.north); });
    renderRoomsTable(); renderItemsTable();
    var isPlot = V.OBJECT_TYPES[p.objectType].plot;
    $('#plotCard').style.display = isPlot ? '' : 'none';
    if (isPlot) {
      p.plot = p.plot || { slope: '', water: '', tall: '', shoola: '', roads: [], openNE: false, ayadiUnit: 'kol' };
      $('#plotSlope').value = p.plot.slope || ''; $('#plotWater').value = p.plot.water || '';
      $('#plotTall').value = p.plot.tall || ''; $('#plotShoola').value = p.plot.shoola || '';
      $('#plotUnit').value = p.plot.ayadiUnit || 'kol'; $('#plotOpenNE').checked = !!p.plot.openNE;
      document.querySelectorAll('[data-road]').forEach(function (c) { c.checked = (p.plot.roads || []).indexOf(c.dataset.road) >= 0; });
    }
  }

  function roomTypeOptions() {
    var scope = V.OBJECT_TYPES[state.project.objectType].roomScope;
    var keys = Object.keys(V.ROOM_TYPES);
    var main = keys.filter(function (k) { return scope.indexOf(V.ROOM_TYPES[k].scope) >= 0; });
    var other = keys.filter(function (k) { return main.indexOf(k) < 0; });
    return main.concat(other).map(function (k) { return [k, V.ROOM_TYPES[k].ru]; });
  }

  function numInput(val, onChange) {
    var i = document.createElement('input'); i.type = 'number'; i.step = '0.1'; i.value = val;
    i.addEventListener('change', function () { var v = parseFloat(i.value.replace(',', '.')); if (!isNaN(v)) onChange(v); });
    return i;
  }

  function renderRoomsTable() {
    var tb = $('#roomsTable tbody'); tb.innerHTML = '';
    var opts = roomTypeOptions();
    state.project.rooms.forEach(function (r, idx) {
      var tr = document.createElement('tr'); tr.dataset.idx = idx;
      var sel = Plan.sel;
      if (sel && sel.kind === 'room' && sel.idx === idx) tr.classList.add('sel');
      var td = document.createElement('td'); var s = document.createElement('select');
      opt(s, opts, r.type);
      s.addEventListener('change', function () {
        var oldRu = V.ROOM_TYPES[r.type].ru;
        if (!r.name || r.name === oldRu) r.name = V.ROOM_TYPES[s.value].ru;
        r.type = s.value; changed(); renderRoomsTable();
      });
      td.appendChild(s); tr.appendChild(td);
      td = document.createElement('td'); td.className = 'name';
      var n = document.createElement('input'); n.type = 'text'; n.value = r.name || '';
      n.addEventListener('change', function () { r.name = n.value; changed(); });
      td.appendChild(n); tr.appendChild(td);
      ['x', 'y', 'w', 'h'].forEach(function (k) {
        var c = document.createElement('td');
        c.appendChild(numInput(r[k], function (v) { r[k] = (k === 'w' || k === 'h') ? Math.max(.3, v) : v; changed(); }));
        tr.appendChild(c);
      });
      td = document.createElement('td');
      var del = document.createElement('button'); del.className = 'del'; del.title = 'Удалить'; del.textContent = '✕';
      del.addEventListener('click', function () { state.project.rooms.splice(idx, 1); Plan.sel = null; changed(); renderRoomsTable(); });
      td.appendChild(del); tr.appendChild(td);
      tr.addEventListener('focusin', function () { Plan.select('room', idx); });
      tb.appendChild(tr);
    });
  }

  function renderItemsTable() {
    var tb = $('#itemsTable tbody'); tb.innerHTML = '';
    var keys = Object.keys(V.ITEM_TYPES);
    state.project.items.forEach(function (it, idx) {
      var t = V.ITEM_TYPES[it.type];
      var tr = document.createElement('tr');
      var sel = Plan.sel;
      if (sel && sel.kind === 'item' && sel.idx === idx) tr.classList.add('sel');
      var td = document.createElement('td'); var s = document.createElement('select');
      opt(s, keys.map(function (k) { return [k, V.ITEM_TYPES[k].icon + ' ' + V.ITEM_TYPES[k].ru]; }), it.type);
      s.addEventListener('change', function () { it.type = s.value; if (!V.ITEM_TYPES[it.type].facingGood) delete it.facing; else it.facing = it.facing || V.ITEM_TYPES[it.type].facingGood[0]; changed(); renderItemsTable(); });
      td.appendChild(s); tr.appendChild(td);
      ['x', 'y'].forEach(function (k) {
        var c = document.createElement('td');
        c.appendChild(numInput(it[k], function (v) { it[k] = v; changed(); }));
        tr.appendChild(c);
      });
      td = document.createElement('td');
      if (t.facingGood) {
        var f = document.createElement('select'); f.title = t.facingLabel;
        opt(f, DIR_OPTS, it.facing || t.facingGood[0]);
        f.addEventListener('change', function () { it.facing = f.value; changed(); });
        td.appendChild(f);
      } else { td.textContent = '—'; td.style.color = 'var(--muted)'; }
      tr.appendChild(td);
      td = document.createElement('td');
      var del = document.createElement('button'); del.className = 'del'; del.textContent = '✕'; del.title = 'Удалить';
      del.addEventListener('click', function () { state.project.items.splice(idx, 1); Plan.sel = null; changed(); renderItemsTable(); });
      td.appendChild(del); tr.appendChild(td);
      tr.addEventListener('focusin', function () { Plan.select('item', idx); });
      tb.appendChild(tr);
    });
  }

  // ---------- расчёт и отрисовка
  var Plan = V.Plan2D;
  var liveTimer = null;

  function opts2d() { return { zones: $('#tZones').checked, mandala: $('#tMandala').checked, labels: $('#tLabels').checked }; }

  function changed(dragging) {
    save();
    if (state.calculated) state.result = V.calculate(state.project);
    Plan.render(state.project, state.calculated ? state.result : null, opts2d());
    if (!dragging) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        if (state.calculated) { renderResults(false); if (state.view === '3d') V.View3D.build(state.project, state.result); }
        else $('#btnCalc').classList.add('pulse');
      }, 150);
    }
  }

  function calculate() {
    state.result = V.calculate(state.project);
    state.calculated = true;
    $('#btnCalc').classList.remove('pulse');
    Plan.render(state.project, state.result, opts2d());
    if (state.view === '2d') Plan.animateScan();
    V.View3D.build(state.project, state.result);
    renderResults(true);
  }

  function renderResults(animate) {
    var r = state.result;
    var arc = $('#gaugeArc');
    var C = 2 * Math.PI * 50;
    arc.style.stroke = r.band.color;
    if (animate) { arc.style.transition = 'none'; arc.style.strokeDashoffset = C; arc.getBoundingClientRect(); arc.style.transition = ''; }
    arc.style.strokeDashoffset = C * (1 - r.score / 100);
    countUp($('#scoreVal'), r.score, animate ? 1400 : 0);
    $('#bandText').textContent = r.band.ru;
    $('#bandText').style.color = r.band.color;
    var c = { great: 0, good: 0, neutral: 0, bad: 0, worst: 0 };
    r.findings.forEach(function (f) { c[f.verdict.key]++; });
    $('#miniStats').innerHTML =
      '<span>✔ хорошо: <b>' + (c.great + c.good) + '</b> · нейтрально: <b>' + c.neutral + '</b> · дефекты: <b>' + (c.bad + c.worst) + '</b></span>' +
      (r.entrance ? '<span>Вход: <b>' + r.entrance.pada.code + ' ' + r.entrance.pada.name + '</b></span>' : '<span>Вход не указан</span>') +
      '<span>Площадь ≈ ' + state.project.rooms.reduce(function (a, x) { return a + x.w * x.h; }, 0).toFixed(1) + ' м²</span>';
    renderFindings(animate);
  }

  function countUp(el, to, ms) {
    if (!ms) { el.textContent = to; return; }
    var start = performance.now();
    (function f(now) {
      var t = Math.min(1, (now - start) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(f);
    })(start);
  }

  var CAT = { room: 'помещение', center: 'центр', shape: 'форма', cut: 'вырез', entrance: 'вход', item: 'деталь', plot: 'участок', ayadi: 'аяди' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function renderFindings(animate) {
    var r = state.result, ol = $('#findings');
    var list = r.findings.slice();
    if (state.filter === 'bad') list = r.defects;
    if (state.filter === 'good') list = r.strengths;
    if (!list.length) { ol.innerHTML = '<li class="empty">Нет пунктов в этой категории.</li>'; return; }
    ol.innerHTML = list.map(function (f, i) {
      var meta = CAT[f.cat] + (f.dir ? ' · ' + V.DIR_INFO[f.dir].ru : '') + (f.zone && f.dir !== 'C' ? ' · зона ' + f.zone.ru : '') + (f.bearing !== undefined ? ' · ' + Math.round(f.bearing) + '°' : '');
      return '<li data-n="' + f.n + '" style="--c:' + f.verdict.color + ';animation-delay:' + (animate ? i * 40 : 0) + 'ms">' +
        '<div class="f-head"><span><span class="num">' + f.n + '</span>' + esc(f.title) + '</span><span class="tag">' + f.verdict.ru + '</span></div>' +
        '<div class="f-meta">' + esc(meta) + '</div>' +
        '<div class="f-text">' + esc(f.text) + '</div>' +
        (f.remedy ? '<div class="f-fix">💡 ' + esc(f.remedy) + '</div>' : '') + '</li>';
    }).join('');
  }

  // ---------- отчёты
  // В просмотрщике claude.ai прямые скачивания заблокированы — там файл отдаётся через capability downloads.
  var claudeDownloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(function (ns) { claudeDownloads = ns; }, function () {});
  }

  function download(blob, name) {
    if (claudeDownloads) {
      claudeDownloads.save({ filename: name, data: blob }).catch(function (e) {
        if (e && e.code !== 'declined') toast('Не удалось сохранить файл: ' + (e.message || e.code));
      });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function makeReport(fmt) {
    if (!state.project.rooms.length) { toast('Добавьте хотя бы одну комнату'); return; }
    if (!state.calculated) calculate();
    toast('Формирую отчёт…');
    // план без анимации для снимка
    Plan.render(state.project, state.result, { zones: true, mandala: false, labels: true });
    var images = {};
    Plan.toPNG().then(function (png) {
      images.plan = png;
      try { V.View3D.build(state.project, state.result); V.View3D.riseStart = performance.now() - 5000; V.View3D._tick(0); images.view3d = V.View3D.toPNG(); } catch (e) { console.warn('3D snapshot failed', e); }
      Plan.render(state.project, state.result, opts2d());
      return fmt === 'pdf' ? V.Report.pdf(state.result, images) : V.Report.pptx(state.result, images);
    }).then(function (out) {
      window.__lastReport = out; // для автотестов
      download(out.blob, out.name);
      toast('Готово: ' + out.name);
    }).catch(function (e) {
      console.error(e); toast('Ошибка при формировании отчёта: ' + e.message);
    });
  }

  // ---------- события
  function bind() {
    $('#btnCalc').addEventListener('click', function () {
      if (!state.project.rooms.length) { toast('Добавьте хотя бы одну комнату'); return; }
      calculate();
    });
    $('#btnLoadExample').addEventListener('click', function () { loadExample($('#exampleSelect').value); });
    $('#btnReport').addEventListener('click', function (e) { e.stopPropagation(); $('#reportMenu').classList.toggle('open'); });
    document.addEventListener('click', function () { $('#reportMenu').classList.remove('open'); });
    $('#reportMenu').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $('#reportMenu').classList.remove('open'); makeReport(b.dataset.fmt);
    });

    $('#projName').addEventListener('change', function (e) { state.project.name = e.target.value; save(); });
    $('#objectType').addEventListener('change', function (e) { state.project.objectType = e.target.value; fill(); changed(); });
    function setNorth(v) { v = ((Math.round(+v) % 360) + 360) % 360; state.project.north = v; $('#north').value = v; $('#northRange').value = v; document.querySelectorAll('#quickNorth button').forEach(function (b) { b.classList.toggle('on', +b.dataset.v === v); }); changed(); }
    $('#north').addEventListener('change', function (e) { setNorth(e.target.value || 0); });
    $('#northRange').addEventListener('input', function (e) { setNorth(e.target.value); });
    $('#quickNorth').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setNorth(b.dataset.v); });

    $('#btnAddRoom').addEventListener('click', function () {
      var g = V.geo.bbox(state.project.rooms);
      var x = state.project.rooms.length ? g.x + g.w + .5 : 0;
      var types = roomTypeOptions();
      state.project.rooms.push({ type: types[0][0], name: types[0][1], x: Math.round(x * 10) / 10, y: state.project.rooms.length ? g.y : 0, w: 3, h: 3 });
      changed(); renderRoomsTable();
    });
    $('#btnAddItem').addEventListener('click', function () {
      var g = V.geo.bbox(state.project.rooms);
      state.project.items.push({ type: 'bed', x: Math.round(g.cx * 10) / 10, y: Math.round(g.cy * 10) / 10, facing: 'S' });
      changed(); renderItemsTable();
    });

    function plotSet(k, v) { state.project.plot[k] = v; changed(); }
    $('#plotSlope').addEventListener('change', function (e) { plotSet('slope', e.target.value); });
    $('#plotWater').addEventListener('change', function (e) { plotSet('water', e.target.value); });
    $('#plotTall').addEventListener('change', function (e) { plotSet('tall', e.target.value); });
    $('#plotShoola').addEventListener('change', function (e) { plotSet('shoola', e.target.value); });
    $('#plotUnit').addEventListener('change', function (e) { plotSet('ayadiUnit', e.target.value); });
    $('#plotOpenNE').addEventListener('change', function (e) { plotSet('openNE', e.target.checked); });
    document.querySelectorAll('[data-road]').forEach(function (c) {
      c.addEventListener('change', function () {
        state.project.plot.roads = Array.prototype.filter.call(document.querySelectorAll('[data-road]'), function (x) { return x.checked; }).map(function (x) { return x.dataset.road; });
        changed();
      });
    });

    ['#tZones', '#tMandala', '#tLabels'].forEach(function (s) { $(s).addEventListener('change', function () { Plan.render(state.project, state.calculated ? state.result : null, opts2d()); }); });
    $('#btnWalk').addEventListener('click', function () {
      if (state.view !== '2d') switchView('2d');
      if (!state.calculated) calculate();
      setTimeout(function () { Plan.walk(); }, state.calculated ? 0 : 2300);
    });

    document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { switchView(t.dataset.view); }); });

    $('#filterTabs').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !state.result) return;
      document.querySelectorAll('#filterTabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
      state.filter = b.dataset.f; renderFindings(true);
    });
    $('#findings').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-n]'); if (!li) return;
      if (state.view !== '2d') switchView('2d');
      Plan.flash(+li.dataset.n);
    });

    $('#btnSave').addEventListener('click', function () {
      download(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), 'vastu-project.json');
    });
    $('#fileOpen').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var p = JSON.parse(txt);
        if (!p.rooms || !p.items) throw new Error('нет rooms/items');
        setProject(p); toast('Проект загружен');
      }).catch(function (err) { toast('Не удалось открыть файл: ' + err.message); });
      e.target.value = '';
    });
    $('#btnClear').addEventListener('click', function () {
      setProject({ objectType: state.project.objectType, name: 'Новый объект', north: 0, rooms: [], items: [], plot: null });
    });
  }

  function switchView(v) {
    state.view = v;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === v); });
    $('#view2d').classList.toggle('hidden', v !== '2d');
    $('#view3d').classList.toggle('hidden', v !== '3d');
    V.View3D.show(v === '3d');
    if (v === '3d') V.View3D.build(state.project, state.calculated ? state.result : null);
  }

  function setProject(p) {
    p.items = p.items || []; p.rooms = p.rooms || [];
    if (!V.OBJECT_TYPES[p.objectType]) p.objectType = 'apartment';
    state.project = p; state.calculated = false; state.result = null; Plan.sel = null;
    fill(); save();
    Plan.render(p, null, opts2d());
    if (state.view === '3d') V.View3D.build(p, null);
    $('#scoreVal').textContent = '—'; $('#bandText').textContent = 'Нажмите «Рассчитать»'; $('#bandText').style.color = '';
    $('#miniStats').innerHTML = ''; $('#gaugeArc').style.strokeDashoffset = 2 * Math.PI * 50;
    $('#findings').innerHTML = '<li class="empty">Здесь появится разбор: каждая комната, вход, предметы, форма плана и участок.</li>';
    $('#btnCalc').classList.add('pulse');
  }

  function loadExample(key) {
    var ex = clone(V.EXAMPLES[key]);
    setProject({ objectType: ex.objectType, name: ex.name, north: ex.north, rooms: ex.rooms, items: ex.items, plot: ex.plot });
    $('#exampleSelect').value = key;
    toast('Загружен пример. Нажмите «Рассчитать».');
  }

  document.addEventListener('DOMContentLoaded', function () {
    initStatic();
    Plan.init($('#plan'), {
      onChange: function (dragging, moved) {
        changed(dragging);
        if (!dragging && moved) { renderRoomsTable(); renderItemsTable(); }
      },
      onSelect: function () { renderRoomsTable(); renderItemsTable(); }
    });
    V.View3D.init($('#three'));
    bind();
    var saved = load();
    if (saved && saved.rooms && saved.rooms.length) setProject(saved);
    else loadExample('apartment');
  });
})(window.VASTU);
