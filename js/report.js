/* Отчёты: PDF (pdfmake, шрифт Roboto с кириллицей) и PowerPoint (PptxGenJS). */
window.VASTU = window.VASTU || {};

(function (V) {
  'use strict';

  function today() {
    var d = new Date();
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
  }
  function fileBase(res) {
    return 'Vastu_' + (res.project.name || 'report').replace(/[^\wА-Яа-яЁё-]+/g, '_').slice(0, 40);
  }
  function dirName(d) { return d ? (V.DIR_INFO[d] ? V.DIR_INFO[d].ru : d) : '—'; }
  function sFmt(s) { return (s > 0 ? '+' : '') + (Math.round(s * 10) / 10); }
  var CAT = { room: 'Помещение', center: 'Центр', shape: 'Форма', cut: 'Вырез', entrance: 'Вход', item: 'Деталь', plot: 'Участок', ayadi: 'Аяди' };

  function stats(res) {
    var c = { great: 0, good: 0, neutral: 0, bad: 0, worst: 0 };
    res.findings.forEach(function (f) { c[f.verdict.key]++; });
    return c;
  }

  // ---------------- PDF ----------------
  V.Report = {
    pdf: function (res, images) {
      if (!window.pdfMake) throw new Error('pdfmake не загружен');
      var p = res.project, st = stats(res);
      var objRu = V.OBJECT_TYPES[p.objectType].ru;
      var area = p.rooms.reduce(function (a, r) { return a + r.w * r.h; }, 0);

      var rowsRooms = [[{ text: '№', style: 'th' }, { text: 'Помещение', style: 'th' }, { text: 'Зона', style: 'th' }, { text: 'Оценка', style: 'th' }, { text: 'Комментарий', style: 'th' }]];
      res.findings.filter(function (f) { return f.cat === 'room'; }).forEach(function (f) {
        var r = p.rooms[f.idx];
        rowsRooms.push([String(f.n),
          { text: [{ text: f.title + '\n', bold: true }, { text: f.typeRu + ', ' + (r.w * r.h).toFixed(1) + ' м²', color: '#7a6f66', fontSize: 8 }] },
          dirName(f.dir) + '\n' + (f.zone ? f.zone.ru + ' · ' + Math.round(f.bearing) + '°' : ''),
          { text: f.verdict.ru + '\n(' + sFmt(f.s) + ')', color: f.verdict.color, bold: true },
          { text: f.text, fontSize: 8 }]);
      });

      var rowsOther = [[{ text: '№', style: 'th' }, { text: 'Объект проверки', style: 'th' }, { text: 'Тип', style: 'th' }, { text: 'Оценка', style: 'th' }, { text: 'Пояснение', style: 'th' }]];
      res.findings.filter(function (f) { return f.cat !== 'room'; }).forEach(function (f) {
        rowsOther.push([String(f.n), { text: f.title.replace(/^[^\wА-Яа-яЁё]+\s/, ''), bold: true },
          CAT[f.cat] + (f.dir ? '\n' + dirName(f.dir) : ''),
          { text: f.verdict.ru + '\n(' + sFmt(f.s) + ')', color: f.verdict.color, bold: true },
          { text: f.text, fontSize: 8 }]);
      });

      var defects = res.defects.map(function (f) {
        return { margin: [0, 0, 0, 6], stack: [
          { text: [{ text: '№' + f.n + '  ', color: f.verdict.color, bold: true }, { text: f.title.replace(/^[^\wА-Яа-яЁё]+\s/, ''), bold: true }, { text: '  — ' + f.verdict.ru, color: f.verdict.color }] },
          { text: f.text, fontSize: 9, color: '#4a403a' },
          f.remedy ? { text: 'Совет: ' + f.remedy, fontSize: 9, color: '#8a4b0f', margin: [8, 2, 0, 0] } : ''
        ] };
      });

      var dirTable = [[{ text: 'Сторона', style: 'th' }, { text: 'Божество / стихия', style: 'th' }, { text: 'Сфера жизни', style: 'th' }, { text: 'Что здесь у вас', style: 'th' }, { text: 'Цвета', style: 'th' }]];
      V.DIRS8.concat('C').forEach(function (d) {
        var i = V.DIR_INFO[d];
        dirTable.push([{ text: i.ru, bold: true }, i.deity + '\n' + i.element, i.meaning, (res.dirMap[d] || []).join(', ') || '—', i.colors]);
      });

      var content = [
        { columns: [
          { width: '*', stack: [
            { text: 'Отчёт по Васту-шастре', style: 'h1' },
            { text: p.name || 'Объект', style: 'h2' },
            { text: objRu + ' · площадь ≈ ' + area.toFixed(1) + ' м² · габарит ' + res.geo.w.toFixed(2) + ' × ' + res.geo.h.toFixed(2) + ' м', color: '#7a6f66' },
            { text: 'Верх плана направлен на азимут ' + res.north + '° · дата: ' + today(), color: '#7a6f66', margin: [0, 2, 0, 0] }
          ] },
          { width: 150, stack: [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 150, h: 70, r: 8, color: res.band.color }] },
            { text: String(res.score), fontSize: 30, bold: true, color: '#fff', alignment: 'center', relativePosition: { x: 0, y: -66 } },
            { text: 'из 100 · ' + res.band.ru, fontSize: 9, color: '#fff', alignment: 'center', relativePosition: { x: 0, y: -28 } }
          ] }
        ] },
        { text: 'Сводка', style: 'h3' },
        { ul: [
          'Проверено пунктов: ' + res.findings.length + ' — отлично: ' + st.great + ', благоприятно: ' + st.good + ', нейтрально: ' + st.neutral + ', неблагоприятно: ' + st.bad + ', сильные дефекты: ' + st.worst + '.',
          res.entrance ? 'Главный вход: пада ' + res.entrance.pada.code + ' «' + res.entrance.pada.name + '» (' + Math.round(res.entrance.bearing) + '°) — ' + res.entrance.pada.effect + '.' : 'Главный вход не указан.',
          res.cuts.length ? 'Вырезы плана: ' + res.cuts.map(function (c) { return dirName(c.dir); }).join(', ') + '.' : 'План без вырезов.',
          'Главные дефекты: ' + (res.defects.slice(0, 3).map(function (f) { return f.title.replace(/^[^\wА-Яа-яЁё]+\s/, ''); }).join('; ') || 'не обнаружены') + '.'
        ], margin: [0, 0, 0, 8] }
      ];
      if (images.plan) content.push({ text: 'План с зонами и номерами пунктов', style: 'h3' }, { image: images.plan.data, width: 515, margin: [0, 0, 0, 6] });
      if (images.view3d) content.push({ text: '3D-модель (цвет — оценка зоны, высота «ауры» — сила)', style: 'h3', pageBreak: 'before' }, { image: images.view3d.data, width: 515, margin: [0, 0, 0, 6] });
      content.push(
        { text: 'Помещения', style: 'h3', pageBreak: images.view3d ? undefined : 'before' },
        { table: { headerRows: 1, widths: [18, 105, 68, 78, '*'], body: rowsRooms }, layout: 'lightHorizontalLines', fontSize: 9 },
        { text: 'Вход, детали, форма, участок', style: 'h3' },
        { table: { headerRows: 1, widths: [18, 105, 68, 78, '*'], body: rowsOther }, layout: 'lightHorizontalLines', fontSize: 9 },
        { text: 'Дефекты и рекомендации', style: 'h3', pageBreak: 'before' },
        defects.length ? { stack: defects } : { text: 'Существенных дефектов не выявлено.' }
      );
      if (res.ayadi) {
        var a = res.ayadi;
        content.push({ text: 'Аяди-шадварга', style: 'h3' },
          { text: 'Периметр ' + a.perimeterRaw.toFixed(2) + ' → ' + a.P + ' ед. (' + a.unit + ')', fontSize: 9, color: '#7a6f66' },
          { table: { body: [[{ text: 'Показатель', style: 'th' }, { text: 'Формула', style: 'th' }, { text: 'Остаток', style: 'th' }]].concat(
            Object.keys(a.values).map(function (k) { var v = a.values[k]; return [v.ru, 'P × ' + v.mul + ' mod ' + v.div, String(v.value) + (k === 'yoni' ? ' — ' + a.yoniName : k === 'vara' ? ' — ' + a.varaName : '')]; })) }, layout: 'lightHorizontalLines', fontSize: 9 },
          { ul: a.checks.map(function (c) { return { text: (c.ok ? '[+] ' : '[–] ') + c.ru + ' — ' + c.detail, color: c.ok ? '#2a9d4b' : '#c0392b' }; }), fontSize: 9, margin: [0, 4, 0, 0] });
      }
      content.push(
        { text: 'Стороны света: что где расположено', style: 'h3', pageBreak: 'before' },
        { table: { headerRows: 1, widths: [70, 80, 100, '*', 90], body: dirTable }, layout: 'lightHorizontalLines', fontSize: 8 },
        { text: 'Методика и источники', style: 'h3' },
        { text: 'Центр плана — центр габаритного прямоугольника. Направление комнаты определяется по азимуту её центра: 8 сторон по 45°, 16 зон по 22,5°, вход — по 32 падам внешнего кольца мандалы (11,25°). Центральная 1/9 часть — Брахмастхан. Итог — взвешенная сумма оценок (−2…+2), нормированная к 100.', fontSize: 9 },
        { ul: V.SOURCES.map(function (s) { return { text: [{ text: s.t, bold: true }, ' — ' + s.d] }; }), fontSize: 9, margin: [0, 4, 0, 6] },
        { text: V.DISCLAIMER, fontSize: 8, italics: true, color: '#7a6f66' }
      );

      var doc = {
        pageSize: 'A4', pageMargins: [40, 40, 40, 44],
        info: { title: 'Отчёт Васту — ' + (p.name || ''), author: 'Калькулятор Васту' },
        footer: function (cur, total) { return { columns: [{ text: 'Калькулятор Васту · ' + (p.name || ''), fontSize: 8, color: '#9a8f86', margin: [40, 10, 0, 0] }, { text: cur + ' / ' + total, alignment: 'right', fontSize: 8, color: '#9a8f86', margin: [0, 10, 40, 0] }] }; },
        content: content,
        defaultStyle: { font: 'Roboto', fontSize: 10, color: '#2b2522' },
        styles: {
          h1: { fontSize: 20, bold: true, color: '#3d348b' },
          h2: { fontSize: 14, bold: true, margin: [0, 4, 0, 2] },
          h3: { fontSize: 12, bold: true, color: '#d9822b', margin: [0, 10, 0, 5] },
          th: { bold: true, color: '#7a6f66', fontSize: 8 }
        }
      };
      return new Promise(function (resolve) {
        var pdf = pdfMake.createPdf(doc);
        pdf.getBlob(function (blob) { resolve({ blob: blob, name: fileBase(res) + '.pdf' }); });
      });
    },

    // ---------------- PowerPoint ----------------
    pptx: function (res, images) {
      if (!window.PptxGenJS) throw new Error('PptxGenJS не загружен');
      var p = res.project, st = stats(res);
      var pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 in
      pptx.title = 'Отчёт Васту — ' + (p.name || '');
      var INK = '2B2522', MUTED = '7A6F66', ACC = 'D9822B', PRI = '3D348B', BG = 'FBF8F2';
      var font = 'Segoe UI';
      function hex(c) { return c.replace('#', '').toUpperCase(); }
      function header(s, title) {
        s.background = { color: BG };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: .12, fill: { color: ACC } });
        s.addText(title, { x: .5, y: .3, w: 12.3, h: .6, fontFace: font, fontSize: 26, bold: true, color: PRI });
        s.addText('Калькулятор Васту · ' + (p.name || ''), { x: .5, y: 7.05, w: 9, h: .3, fontFace: font, fontSize: 10, color: MUTED });
      }

      // 1. Титул
      var s = pptx.addSlide();
      s.background = { color: '1F1B2E' };
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: .35, h: 7.5, fill: { color: ACC } });
      s.addText('Отчёт по Васту-шастре', { x: .9, y: 1.4, w: 8, h: .9, fontFace: font, fontSize: 40, bold: true, color: 'FFFFFF' });
      s.addText(p.name || 'Объект', { x: .9, y: 2.4, w: 8, h: .6, fontFace: font, fontSize: 24, color: 'F2C38B' });
      s.addText(V.OBJECT_TYPES[p.objectType].ru + ' · ' + res.geo.w.toFixed(2) + ' × ' + res.geo.h.toFixed(2) + ' м · азимут верха плана ' + res.north + '° · ' + today(),
        { x: .9, y: 3.1, w: 8, h: .5, fontFace: font, fontSize: 14, color: 'C9C2D9' });
      s.addShape(pptx.ShapeType.ellipse, { x: 9.3, y: 1.3, w: 3.2, h: 3.2, fill: { color: hex(res.band.color) } });
      s.addText([{ text: String(res.score), options: { fontSize: 66, bold: true, breakLine: true } }, { text: 'из 100', options: { fontSize: 16 } }],
        { x: 9.3, y: 1.3, w: 3.2, h: 3.2, align: 'center', valign: 'middle', fontFace: font, color: 'FFFFFF' });
      s.addText(res.band.ru, { x: 8.8, y: 4.7, w: 4.2, h: .6, align: 'center', fontFace: font, fontSize: 20, bold: true, color: 'FFFFFF' });

      // 2. Сводка
      s = pptx.addSlide(); header(s, 'Итог расчёта');
      var cards = [['Отлично', st.great, '2A9D4B'], ['Благоприятно', st.good, '6BBF59'], ['Нейтрально', st.neutral, 'E9B949'], ['Неблагоприятно', st.bad, 'E76F51'], ['Сильные дефекты', st.worst, 'C0392B']];
      cards.forEach(function (c, i) {
        s.addShape(pptx.ShapeType.roundRect, { x: .5 + i * 2.5, y: 1.2, w: 2.3, h: 1.4, fill: { color: c[2] }, rectRadius: .12 });
        s.addText([{ text: String(c[1]), options: { fontSize: 36, bold: true, breakLine: true } }, { text: c[0], options: { fontSize: 13 } }],
          { x: .5 + i * 2.5, y: 1.2, w: 2.3, h: 1.4, align: 'center', valign: 'middle', color: 'FFFFFF', fontFace: font });
      });
      var bullets = [
        'Общий балл: ' + res.score + ' / 100 — ' + res.band.ru,
        res.entrance ? 'Вход: пада ' + res.entrance.pada.code + ' «' + res.entrance.pada.name + '» — ' + res.entrance.pada.effect : 'Главный вход не указан',
        res.cuts.length ? 'Вырезы: ' + res.cuts.map(function (c) { return dirName(c.dir); }).join(', ') : 'План без вырезов и недостающих углов',
        'Сильные стороны: ' + (res.strengths.slice(0, 4).map(function (f) { return f.title.replace(/^[^\wА-Яа-яЁё]+\s/, ''); }).join('; ') || '—'),
        'Главные дефекты: ' + (res.defects.slice(0, 4).map(function (f) { return f.title.replace(/^[^\wА-Яа-яЁё]+\s/, ''); }).join('; ') || 'не обнаружены')
      ];
      s.addText(bullets.map(function (b) { return { text: b, options: { bullet: true, breakLine: true } }; }),
        { x: .5, y: 3, w: 12.3, h: 3.8, fontFace: font, fontSize: 17, color: INK, valign: 'top', paraSpaceAfter: 8 });

      // 3. План
      if (images.plan) {
        s = pptx.addSlide(); header(s, 'План: 16 зон, Брахмастхан и номера пунктов');
        var maxW = 8.2, maxH = 6, ar = images.plan.w / images.plan.h, w = maxW, h = w / ar;
        if (h > maxH) { h = maxH; w = h * ar; }
        s.addImage({ data: images.plan.data, x: .5, y: 1, w: w, h: h });
        var lines = res.findings.filter(function (f) { return f.cat === 'room'; }).map(function (f) {
          return { text: f.n + '. ' + f.title + ' — ' + V.DIR_INFO[f.dir].short + ', ' + f.verdict.ru, options: { color: hex(f.verdict.color), breakLine: true } };
        });
        s.addText(lines, { x: 9, y: 1, w: 3.9, h: 5.8, fontFace: font, fontSize: 12, valign: 'top', bold: true });
      }
      // 4. 3D
      if (images.view3d) {
        s = pptx.addSlide(); header(s, '3D-модель');
        var a3 = images.view3d.w / images.view3d.h, w3 = 12.3, h3 = w3 / a3;
        if (h3 > 5.9) { h3 = 5.9; w3 = h3 * a3; }
        s.addImage({ data: images.view3d.data, x: (13.33 - w3) / 2, y: 1, w: w3, h: h3 });
      }

      // 5+. Таблица всех пунктов (по 12 строк на слайд)
      var rows = res.findings.map(function (f) {
        return [
          { text: String(f.n) },
          { text: f.title.replace(/^[^\wА-Яа-яЁё]+\s/, ''), options: { bold: true } },
          { text: CAT[f.cat] },
          { text: f.dir ? V.DIR_INFO[f.dir].short : '—' },
          { text: f.verdict.ru, options: { color: hex(f.verdict.color), bold: true } }
        ];
      });
      for (var i = 0; i < rows.length; i += 12) {
        s = pptx.addSlide(); header(s, 'Разбор по пунктам' + (rows.length > 12 ? ' (' + (i / 12 + 1) + ')' : ''));
        var head = ['№', 'Пункт', 'Категория', 'Зона', 'Оценка'].map(function (t) { return { text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PRI } } }; });
        s.addTable([head].concat(rows.slice(i, i + 12)), { x: .5, y: 1.1, w: 12.3, colW: [.6, 5.6, 2, 1.2, 2.9], fontFace: font, fontSize: 13, color: INK, border: { type: 'solid', pt: .5, color: 'E6DCCF' }, rowH: .42 });
      }

      // Дефекты и рекомендации (по 4 на слайд)
      var defs = res.defects;
      for (var j = 0; j < defs.length; j += 4) {
        s = pptx.addSlide(); header(s, 'Дефекты и рекомендации' + (defs.length > 4 ? ' (' + (j / 4 + 1) + ')' : ''));
        defs.slice(j, j + 4).forEach(function (f, k) {
          var y = 1.1 + k * 1.45;
          s.addShape(pptx.ShapeType.rect, { x: .5, y: y, w: .12, h: 1.3, fill: { color: hex(f.verdict.color) } });
          s.addText([
            { text: '№' + f.n + '  ' + f.title.replace(/^[^\wА-Яа-яЁё]+\s/, '') + ' — ' + f.verdict.ru, options: { bold: true, fontSize: 15, color: hex(f.verdict.color), breakLine: true } },
            { text: f.text, options: { fontSize: 11, color: INK, breakLine: true } },
            { text: f.remedy ? 'Совет: ' + f.remedy : '', options: { fontSize: 11, color: '8A4B0F' } }
          ], { x: .75, y: y, w: 12, h: 1.3, fontFace: font, valign: 'top' });
        });
      }
      if (!defs.length) { s = pptx.addSlide(); header(s, 'Дефекты'); s.addText('Существенных дефектов не выявлено.', { x: .5, y: 1.3, w: 12, h: 1, fontSize: 20, fontFace: font, color: INK }); }

      // Аяди
      if (res.ayadi) {
        var a = res.ayadi;
        s = pptx.addSlide(); header(s, 'Аяди-шадварга');
        s.addText('Периметр ' + a.perimeterRaw.toFixed(2) + ' → ' + a.P + ' ед. (' + a.unit + ')', { x: .5, y: 1.0, w: 12, h: .4, fontSize: 14, fontFace: font, color: MUTED });
        var arows = [['Показатель', 'Формула', 'Остаток'].map(function (t) { return { text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PRI } } }; })];
        Object.keys(a.values).forEach(function (k) { var v = a.values[k]; arows.push([v.ru, 'P × ' + v.mul + ' mod ' + v.div, String(v.value) + (k === 'yoni' ? ' — ' + a.yoniName : k === 'vara' ? ' — ' + a.varaName : '')]); });
        s.addTable(arows, { x: .5, y: 1.5, w: 7.5, fontFace: font, fontSize: 13, color: INK, border: { type: 'solid', pt: .5, color: 'E6DCCF' } });
        s.addText(a.checks.map(function (c) { return { text: (c.ok ? '[+] ' : '[–] ') + c.ru + ' — ' + c.detail, options: { color: c.ok ? '2A9D4B' : 'C0392B', breakLine: true } }; }),
          { x: 8.3, y: 1.5, w: 4.6, h: 3, fontFace: font, fontSize: 14, valign: 'top', paraSpaceAfter: 6 });
      }

      // Стороны света
      s = pptx.addSlide(); header(s, 'Стороны света: что где расположено');
      var drows = [['Сторона', 'Сфера', 'У вас здесь', 'Цвета'].map(function (t) { return { text: t, options: { bold: true, color: 'FFFFFF', fill: { color: PRI } } }; })];
      V.DIRS8.concat('C').forEach(function (d) { var i2 = V.DIR_INFO[d]; drows.push([{ text: i2.ru, options: { bold: true } }, i2.meaning, (res.dirMap[d] || []).join(', ') || '—', i2.colors]); });
      s.addTable(drows, { x: .5, y: 1.1, w: 12.3, colW: [2.4, 3.6, 3.6, 2.7], fontFace: font, fontSize: 12, color: INK, border: { type: 'solid', pt: .5, color: 'E6DCCF' } });

      // Источники
      s = pptx.addSlide(); header(s, 'Методика и источники');
      s.addText(V.SOURCES.map(function (x) { return { text: x.t + ' — ' + x.d, options: { bullet: true, breakLine: true } }; }),
        { x: .5, y: 1.1, w: 12.3, h: 4.2, fontFace: font, fontSize: 15, color: INK, valign: 'top', paraSpaceAfter: 6 });
      s.addText(V.DISCLAIMER, { x: .5, y: 5.6, w: 12.3, h: 1, fontFace: font, fontSize: 12, italic: true, color: MUTED });

      return pptx.write({ outputType: 'blob' }).then(function (blob) { return { blob: blob, name: fileBase(res) + '.pptx' }; });
    }
  };
})(window.VASTU);
