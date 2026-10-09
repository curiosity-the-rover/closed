/* Готовые примеры. Координаты в метрах: x — вправо, y — вниз по плану.
 * north — азимут (°), куда указывает верх плана (0 = верх смотрит на север). */
window.VASTU = window.VASTU || {};

(function (V) {
  'use strict';

  V.EXAMPLES = {
    apartment: {
      title: 'Пример: двухкомнатная квартира 108 м²',
      objectType: 'apartment',
      name: 'Квартира, ул. Примерная, 12',
      north: 0,
      rooms: [
        { type: 'kids',    name: 'Детская',        x: 0, y: 0,   w: 4, h: 5 },
        { type: 'hall',    name: 'Прихожая-холл',  x: 4, y: 0,   w: 2, h: 6.5 },
        { type: 'living',  name: 'Гостиная',       x: 6, y: 0,   w: 6, h: 4 },
        { type: 'master',  name: 'Спальня',        x: 0, y: 5,   w: 4, h: 4 },
        { type: 'bath',    name: 'Ванная',         x: 4, y: 6.5, w: 2, h: 2.5 },
        { type: 'dining',  name: 'Столовая',       x: 6, y: 4,   w: 3, h: 5 },
        { type: 'toilet',  name: 'Гостевой WC',    x: 9, y: 4,   w: 3, h: 2 },
        { type: 'kitchen', name: 'Кухня',          x: 9, y: 6,   w: 3, h: 3 }
      ],
      items: [
        { type: 'entrance', x: 5, y: 0 },
        { type: 'stove',  x: 11.6, y: 7.4, facing: 'E' },
        { type: 'sink',   x: 9.6, y: 8.6 },
        { type: 'bed',    x: 1.6, y: 7.2, facing: 'S' },
        { type: 'bed',    x: 1.5, y: 1.6, facing: 'N' },
        { type: 'safe',   x: 0.4, y: 8.6, facing: 'N' },
        { type: 'heavy',  x: 3.4, y: 8.6 },
        { type: 'mirror', x: 0.2, y: 6.0 },
        { type: 'puja',   x: 11.5, y: 0.5, facing: 'E' },
        { type: 'water',  x: 8.2, y: 0.4 },
        { type: 'tv',     x: 9.5, y: 3.6 },
        { type: 'desk',   x: 3.4, y: 0.6, facing: 'N' },
        { type: 'toiletSeat', x: 11.5, y: 5.4, facing: 'E' }
      ],
      plot: null
    },

    house: {
      title: 'Пример: частный дом 100 м² на участке',
      objectType: 'house',
      name: 'Дом в посёлке Солнечный',
      north: 10,
      rooms: [
        { type: 'living',  name: 'Гостиная',       x: 3, y: 0,   w: 4, h: 4 },
        { type: 'puja',    name: 'Комната медитации', x: 7, y: 0, w: 3, h: 3 },
        { type: 'study',   name: 'Кабинет',        x: 7, y: 3,   w: 3, h: 3 },
        { type: 'toilet',  name: 'Санузел',        x: 0, y: 3,   w: 3, h: 1.5 },
        { type: 'kids',    name: 'Детская',        x: 0, y: 4.5, w: 3, h: 2 },
        { type: 'hall',    name: 'Холл (центр)',   x: 3, y: 4,   w: 4, h: 2.5 },
        { type: 'master',  name: 'Спальня хозяев', x: 0, y: 6.5, w: 4, h: 3.5 },
        { type: 'stairs',  name: 'Лестница',       x: 4, y: 6.5, w: 3, h: 3.5 },
        { type: 'kitchen', name: 'Кухня',          x: 7, y: 6,   w: 3, h: 4 }
      ],
      items: [
        { type: 'entrance', x: 4.5, y: 0 },
        { type: 'stove',  x: 9.5, y: 9.3, facing: 'E' },
        { type: 'sink',   x: 7.5, y: 6.5 },
        { type: 'bed',    x: 1.5, y: 8.3, facing: 'S' },
        { type: 'puja',   x: 9.2, y: 0.8, facing: 'E' },
        { type: 'desk',   x: 8.5, y: 4.5, facing: 'N' },
        { type: 'tankUp', x: 0.6, y: 9.4 },
        { type: 'tankDown', x: 9.6, y: 2.6 },
        { type: 'plant',  x: 6.5, y: 0.5 },
        { type: 'panel',  x: 9.6, y: 6.4 }
      ],
      plot: { slope: 'NE', water: '', tall: 'SW', shoola: 'ENE', roads: ['N', 'E'], openNE: true, ayadiUnit: 'kol' }
    },

    office: {
      title: 'Пример: офис 150 м² (верх плана смотрит на восток)',
      objectType: 'office',
      name: 'Офис ООО «Пример»',
      north: 90,
      rooms: [
        { type: 'reception', name: 'Ресепшен',         x: 0,  y: 0, w: 6, h: 3 },
        { type: 'pantry',    name: 'Пантри',           x: 6,  y: 0, w: 2, h: 3 },
        { type: 'toilet',    name: 'Санузел',          x: 8,  y: 0, w: 3, h: 3 },
        { type: 'server',    name: 'Серверная',        x: 11, y: 0, w: 4, h: 3 },
        { type: 'accounts',  name: 'Бухгалтерия',      x: 0,  y: 3, w: 4, h: 4 },
        { type: 'workspace', name: 'Опенспейс',        x: 4,  y: 3, w: 6, h: 4 },
        { type: 'storeRaw',  name: 'Архив / склад',    x: 10, y: 3, w: 5, h: 3 },
        { type: 'conference',name: 'Переговорная',     x: 0,  y: 7, w: 5, h: 3 },
        { type: 'storeGoods',name: 'Склад продукции',  x: 5,  y: 7, w: 5, h: 3 },
        { type: 'director',  name: 'Кабинет директора', x: 10, y: 6, w: 5, h: 4 }
      ],
      items: [
        { type: 'entrance', x: 5.5, y: 0 },
        { type: 'desk',  x: 13, y: 8, facing: 'N' },
        { type: 'safe',  x: 14.6, y: 9.6, facing: 'N' },
        { type: 'desk',  x: 1.2, y: 5, facing: 'E' },
        { type: 'panel', x: 14.6, y: 0.4 },
        { type: 'water', x: 0.5, y: 0.5 },
        { type: 'mirror', x: 2, y: 9.8 },
        { type: 'plant', x: 3, y: 0.4 }
      ],
      plot: null
    },

    shop: {
      title: 'Пример: магазин 96 м² со входом с юга',
      objectType: 'shop',
      name: 'Магазин «Лавка»',
      north: 0,
      rooms: [
        { type: 'storeGoods', name: 'Склад товара',  x: 0, y: 0, w: 3, h: 4 },
        { type: 'toilet',     name: 'Санузел',       x: 3, y: 0, w: 2, h: 4 },
        { type: 'puja',       name: 'Алтарь / тихая зона', x: 5, y: 0, w: 3, h: 2 },
        { type: 'accounts',   name: 'Касса-офис',    x: 5, y: 2, w: 3, h: 2 },
        { type: 'sales',      name: 'Торговый зал',  x: 0, y: 4, w: 8, h: 8 }
      ],
      items: [
        { type: 'entrance', x: 5, y: 12 },
        { type: 'counter', x: 1, y: 11, facing: 'N' },
        { type: 'shelfGoods', x: 0.5, y: 6 },
        { type: 'shelfGoods', x: 7.5, y: 10 },
        { type: 'water', x: 7.5, y: 4.5 },
        { type: 'mirror', x: 7.8, y: 7 },
        { type: 'safe', x: 7.4, y: 3.5, facing: 'N' },
        { type: 'plant', x: 4, y: 4.4 }
      ],
      plot: null
    }
  };
})(window.VASTU);
