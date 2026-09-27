/**
 * «Кухня» — бэкенд в Google Apps Script.
 *
 * Приложение шлёт POST с Content-Type: text/plain (без CORS-preflight — Apps Script не отвечает на OPTIONS)
 * и телом {token, action, ...}. Ответ всегда JSON.
 *
 * Действия:
 *   bootstrap                      — все данные одним ответом
 *   quickAdd {text}                — строка от Siri: «6 луковиц, фарш 500» → лист «Входящие»
 *   batch {ops: [...]}             — пачка изменений (так же отправляется офлайн-очередь), в ответ — свежие данные
 *
 * Операции внутри batch:
 *   fridge.upsert {row}   fridge.delete {id}
 *   eaten.upsert {row}    eaten.delete {id}
 *   shopping.upsert {row} shopping.delete {id}
 *   rating.set {recipeId, dish, person, value: 'like'|'dislike'|''}
 *   myRecipe.upsert {row}
 *   pantry.set {items: [...]}     stores.set {items: [...]}
 *   inbox.delete {id}
 *   receipt.upsert {row}  receipt.delete {id}
 *   price.upsert {row}    price.delete {id}
 *
 * Строки находятся по скрытой колонке id: номера строк съезжают, а id — нет.
 * Повторная отправка той же операции ничего не ломает.
 */

var SPREADSHEET_ID = '1LC7o3yIus1-5o1fz_DlvmW75Hiq0ZjNEnC3h01mbYCE';
var OLD_EATEN_ID = '1pP0DFSjYXHDAHjRDnsdaVTvUIP--0Ic-HXE6qSHi4WM';
var TZ = 'Europe/Madrid';

// field → заголовок колонки. Колонки ищутся по заголовку, порядок в таблице не важен.
var SHEETS = {
  fridge: {
    name: 'Холодильник',
    fields: { name: 'Продукт', where: 'Где', qty: 'Сколько', expires: 'Годен до', note: 'Заметка', id: 'id' },
    dates: ['expires'],
    hidden: ['id'],
  },
  eaten: {
    name: 'Съели',
    fields: { date: 'Дата', meal: 'Приём', dish: 'Блюдо', who: 'Кто', score: 'Понравилось (1-5)', id: 'id', recipeId: 'recipe_id' },
    dates: ['date'],
    hidden: ['id', 'recipeId'],
  },
  shopping: {
    name: 'Покупки',
    fields: { name: 'Продукт', qty: 'Сколько', reason: 'Причина', bought: 'Куплено', id: 'id' },
    bools: ['bought'],
    hidden: ['id'],
  },
  ratings: {
    name: 'Оценки',
    fields: { dish: 'Блюдо', recipeId: 'recipe_id', 'Крис': 'Крис', 'Кристина': 'Кристина' },
    key: 'recipeId',
    hidden: ['recipeId'],
  },
  myRecipes: {
    name: 'Мои рецепты',
    fields: { id: 'id', name: 'Название', type: 'Тип', cuisine: 'Кухня', time: 'Время', ingredients: 'Продукты', steps: 'Шаги', egg: 'Яйцо главное' },
    bools: ['egg'],
    hidden: ['id'],
  },
  settings: {
    name: 'Настройки',
    fields: { kind: 'Тип', value: 'Значение', comment: 'Комментарий' },
  },
  inbox: {
    name: 'Входящие',
    fields: { date: 'Дата', text: 'Текст', id: 'id' },
    hidden: ['id'],
  },
  receipts: {
    name: 'Чеки',
    fields: { date: 'Дата', store: 'Магазин', total: 'Сумма €', note: 'Заметка', id: 'id' },
    dates: ['date'],
    hidden: ['id'],
  },
  prices: {
    name: 'Цены',
    fields: { date: 'Дата', product: 'Продукт', store: 'Магазин', price: 'Цена €', per: 'За', id: 'id' },
    dates: ['date'],
    hidden: ['id'],
  },
};

var DEFAULT_PANTRY = ['соль', 'перец', 'масло', 'мука', 'специи', 'чеснок', 'сахар', 'tomate triturado', 'соевый соус', 'мёд', 'майонез', 'кетчуп', 'рис', 'паста'];

// Праздники Валенсии 2026-2027 (DOGV). Местные на 2027 — по обычному правилу.
var DEFAULT_HOLIDAYS = [
  ['01.01.2026', 'Новый год'], ['06.01.2026', 'Крещение (Reyes)'], ['22.01.2026', 'Sant Vicent Màrtir (Валенсия)'],
  ['19.03.2026', 'Сан-Хосе (Fallas)'], ['03.04.2026', 'Страстная пятница'], ['06.04.2026', 'Пасхальный понедельник'],
  ['13.04.2026', 'Sant Vicent Ferrer (Валенсия)'], ['01.05.2026', 'День труда'], ['24.06.2026', 'Сан-Хуан'],
  ['15.08.2026', 'Успение'], ['09.10.2026', 'День Валенсийского сообщества'], ['12.10.2026', 'День Испании'],
  ['08.12.2026', 'Непорочное зачатие'], ['25.12.2026', 'Рождество'],
  ['01.01.2027', 'Новый год'], ['06.01.2027', 'Крещение (Reyes)'], ['22.01.2027', 'Sant Vicent Màrtir (Валенсия, ожидается)'],
  ['19.03.2027', 'Сан-Хосе (Fallas)'], ['26.03.2027', 'Страстная пятница'], ['29.03.2027', 'Пасхальный понедельник'],
  ['05.04.2027', 'Sant Vicent Ferrer (Валенсия, ожидается)'], ['01.05.2027', 'День труда'],
  ['09.10.2027', 'День Валенсийского сообщества'], ['12.10.2027', 'День Испании'], ['01.11.2027', 'День всех святых'],
  ['06.12.2027', 'День Конституции'], ['08.12.2027', 'Непорочное зачатие'], ['25.12.2027', 'Рождество'],
];

// ============================================================
// Веб-приложение
// ============================================================

function doGet() {
  return json_({ ok: true, app: 'kukhnya', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkToken_(body.token)) return json_({ ok: false, error: 'bad_token' });
    switch (body.action) {
      case 'ping':
        return json_({ ok: true });
      case 'bootstrap':
        return json_({ ok: true, data: withLock_(readAll_) });
      case 'quickAdd':
        return json_(withLock_(function () {
          var text = String(body.text || '').trim();
          if (!text) return { ok: false, error: 'empty', message: 'Ничего не расслышал' };
          upsert_('inbox', { id: Utilities.getUuid(), date: Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy'), text: text });
          return { ok: true, message: 'Записал в холодильник: ' + text };
        }));
      case 'batch':
        return json_(withLock_(function () {
          var results = (body.ops || []).map(applyOpSafe_);
          return { ok: true, results: results, data: readAll_() };
        }));
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected || !token) return false;
  // Сравнение без раннего выхода.
  var a = String(token), b = String(expected), diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// Чтение
// ============================================================

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_(key) {
  var def = SHEETS[key];
  var ss = ss_();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    // Новые листы (Входящие, Чеки, Цены) появляются сами — setup() перезапускать не нужно.
    sh = ss.insertSheet(def.name);
    var headers = Object.keys(def.fields).map(function (f) { return def.fields[f]; });
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var cols = columns_(key, sh);
    (def.hidden || []).forEach(function (f) { sh.hideColumns(cols[f]); });
  }
  return sh;
}

/** Номера колонок (с 1) для каждого поля. Недостающие колонки дописываются в конец. */
function columns_(key, sh) {
  var def = SHEETS[key];
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var cols = {};
  Object.keys(def.fields).forEach(function (f) {
    var i = headers.indexOf(def.fields[f]);
    if (i < 0) {
      headers.push(def.fields[f]);
      i = headers.length - 1;
      sh.getRange(1, i + 1).setValue(def.fields[f]).setFontWeight('bold');
    }
    cols[f] = i + 1;
  });
  return cols;
}

function cellOut_(v, isDate, isBool) {
  if (isBool) return v === true || String(v).toUpperCase() === 'TRUE';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'dd.MM.yyyy');
  if (v === null || v === undefined) return '';
  if (isDate) return normDate_(String(v).trim());
  return String(v).trim();
}

/** «1.10.26», «2026-10-01» → «01.10.2026». */
function normDate_(s) {
  var m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) {
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    return ('0' + m[1]).slice(-2) + '.' + ('0' + m[2]).slice(-2) + '.' + y;
  }
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + '.' + iso[2] + '.' + iso[1];
  return s;
}

function parseDateIn_(s) {
  if (!s) return '';
  var m = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return String(s);
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function readSheet_(key) {
  var def = SHEETS[key];
  var sh = sheet_(key);
  var cols = columns_(key, sh);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var width = sh.getLastColumn();
  var values = sh.getRange(2, 1, last - 1, width).getValues();
  var dates = def.dates || [];
  var bools = def.bools || [];
  var out = [];
  var missingIds = [];
  values.forEach(function (row, i) {
    var obj = {};
    var empty = true;
    Object.keys(cols).forEach(function (f) {
      obj[f] = cellOut_(row[cols[f] - 1], dates.indexOf(f) >= 0, bools.indexOf(f) >= 0);
      if (f !== 'id' && obj[f] !== '' && obj[f] !== false) empty = false;
    });
    if (empty) return;
    if (cols.id && !obj.id) {
      obj.id = Utilities.getUuid();
      missingIds.push([i + 2, obj.id]);
    }
    out.push(obj);
  });
  // Строки, добавленные руками в таблице, получают id.
  missingIds.forEach(function (p) { sh.getRange(p[0], cols.id).setValue(p[1]); });
  return out;
}

function readAll_() {
  var settingsRows = readSheet_('settings');
  var pantry = [];
  var holidays = [];
  var stores = [];
  settingsRows.forEach(function (r) {
    var kind = String(r.kind).toLowerCase();
    if (kind === 'кладовая' && r.value) pantry.push(r.value);
    if (kind === 'праздник' && r.value) holidays.push({ date: normDate_(r.value), name: r.comment || 'праздник' });
    if (kind === 'магазин' && r.value) stores.push(r.value);
  });
  var ratings = readSheet_('ratings').map(function (r) {
    return { recipeId: r.recipeId, dish: r.dish, 'Крис': reactionIn_(r['Крис']), 'Кристина': reactionIn_(r['Кристина']) };
  });
  return {
    fridge: readSheet_('fridge'),
    eaten: readSheet_('eaten'),
    shopping: readSheet_('shopping'),
    ratings: ratings,
    myRecipes: readSheet_('myRecipes'),
    settings: { pantry: pantry, holidays: holidays, stores: stores },
    inbox: readSheet_('inbox'),
    receipts: readSheet_('receipts'),
    prices: readSheet_('prices'),
  };
}

function reactionIn_(v) {
  var s = String(v || '').trim();
  if (s === '👍' || /^(like|да|\+)$/i.test(s)) return 'like';
  if (s === '👎' || /^(dislike|нет|-)$/i.test(s)) return 'dislike';
  return '';
}

function reactionOut_(v) {
  return v === 'like' ? '👍' : v === 'dislike' ? '👎' : '';
}

// ============================================================
// Запись
// ============================================================

function applyOpSafe_(op) {
  try {
    applyOp_(op);
    return { ok: true, opId: op.opId };
  } catch (err) {
    return { ok: false, opId: op.opId, error: String(err && err.message ? err.message : err) };
  }
}

function applyOp_(op) {
  var parts = String(op.op || '').split('.');
  var key = parts[0];
  var verb = parts[1];
  if (key === 'rating' && verb === 'set') return setRating_(op);
  if (key === 'pantry' && verb === 'set') return setKind_('кладовая', op.items || [], 'всегда есть дома');
  if (key === 'stores' && verb === 'set') return setKind_('магазин', op.items || [], '');
  if (key === 'myRecipe') key = 'myRecipes';
  if (key === 'receipt') key = 'receipts';
  if (key === 'price') key = 'prices';
  if (!SHEETS[key]) throw new Error('unknown op ' + op.op);
  if (verb === 'upsert') return upsert_(key, op.row || {});
  if (verb === 'delete') return deleteById_(key, op.id);
  throw new Error('unknown op ' + op.op);
}

function findRow_(sh, col, value) {
  var last = sh.getLastRow();
  if (last < 2 || !value) return -1;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(value)) return i + 2;
  return -1;
}

function cellIn_(key, f, v) {
  var def = SHEETS[key];
  if ((def.dates || []).indexOf(f) >= 0) return parseDateIn_(v);
  if ((def.bools || []).indexOf(f) >= 0) return v === true || v === 'TRUE';
  return v === null || v === undefined ? '' : v;
}

function upsert_(key, row) {
  if (!row.id) throw new Error('row.id обязателен');
  var sh = sheet_(key);
  var cols = columns_(key, sh);
  var r = findRow_(sh, cols.id, row.id);
  var fields = Object.keys(row).filter(function (f) { return cols[f]; });
  if (r < 0) {
    r = firstEmptyRow_(sh, cols);
    fields.forEach(function (f) { sh.getRange(r, cols[f]).setValue(cellIn_(key, f, row[f])); });
  } else {
    // Меняем только переданные поля: колонки, которые приложение не знает, не трогаем.
    fields.forEach(function (f) { sh.getRange(r, cols[f]).setValue(cellIn_(key, f, row[f])); });
  }
  (SHEETS[key].dates || []).forEach(function (f) { sh.getRange(r, cols[f]).setNumberFormat('dd.mm.yyyy'); });
}

/**
 * Первая строка без данных. Галочки (FALSE) не считаются данными — иначе в «Покупках»
 * новые строки уходили бы за 1000-ю строку.
 */
function firstEmptyRow_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2) return 2;
  var width = sh.getLastColumn();
  var values = sh.getRange(2, 1, last - 1, width).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var filled = values[i].some(function (v) { return v !== '' && v !== false && v !== null; });
    if (filled) return i + 3;
  }
  return 2;
}

function deleteById_(key, id) {
  var sh = sheet_(key);
  var cols = columns_(key, sh);
  var r = findRow_(sh, cols.id, id);
  if (r > 0) sh.deleteRow(r);
}

function setRating_(op) {
  if (op.person !== 'Крис' && op.person !== 'Кристина') throw new Error('person?');
  var sh = sheet_('ratings');
  var cols = columns_('ratings', sh);
  var r = findRow_(sh, cols.recipeId, op.recipeId);
  if (r < 0) {
    // Пустую строку appendRow не добавит, поэтому сразу пишем значения.
    var line = [];
    for (var i = 0; i < sh.getLastColumn(); i++) line.push('');
    line[cols.recipeId - 1] = op.recipeId;
    line[cols.dish - 1] = op.dish || '';
    line[cols[op.person] - 1] = reactionOut_(op.value);
    sh.appendRow(line);
    return;
  }
  if (op.dish) sh.getRange(r, cols.dish).setValue(op.dish);
  sh.getRange(r, cols[op.person]).setValue(reactionOut_(op.value));
}

/** Заменить все строки «Настроек» одного типа (кладовая, магазин). */
function setKind_(kind, items, comment) {
  var sh = sheet_('settings');
  var cols = columns_('settings', sh);
  var last = sh.getLastRow();
  if (last >= 2) {
    var kinds = sh.getRange(2, cols.kind, last - 1, 1).getValues();
    for (var i = kinds.length - 1; i >= 0; i--) {
      if (String(kinds[i][0]).toLowerCase() === kind) sh.deleteRow(i + 2);
    }
  }
  items.forEach(function (v) {
    var line = ['', '', ''];
    line[cols.kind - 1] = kind;
    line[cols.value - 1] = v;
    line[cols.comment - 1] = comment;
    sh.appendRow(line);
  });
}

// ============================================================
// Настройка (запускать руками из редактора)
// ============================================================

/**
 * Создаёт недостающие листы и колонки, прячет служебные id, заполняет «Настройки»,
 * переносит старую таблицу «Съели» и придумывает код доступа.
 * Можно запускать повторно — ничего не задвоит.
 */
function setup() {
  var ss = ss_();

  // Первый лист → «Холодильник».
  if (!ss.getSheetByName(SHEETS.fridge.name)) ss.getSheets()[0].setName(SHEETS.fridge.name);

  Object.keys(SHEETS).forEach(function (key) {
    var def = SHEETS[key];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) {
      var headers = Object.keys(def.fields).map(function (f) { return def.fields[f]; });
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    var cols = columns_(key, sh);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.setFrozenRows(1);
    (def.hidden || []).forEach(function (f) { sh.hideColumns(cols[f]); });
    (def.dates || []).forEach(function (f) { sh.getRange(2, cols[f], sh.getMaxRows() - 1, 1).setNumberFormat('dd.mm.yyyy'); });
    (def.bools || []).forEach(function (f) { sh.getRange(2, cols[f], sh.getMaxRows() - 1, 1).insertCheckboxes(); });
  });

  // Выпадающие списки, чтобы руками вписывать было удобно.
  var fridge = ss.getSheetByName(SHEETS.fridge.name);
  var fc = columns_('fridge', fridge);
  fridge.getRange(2, fc.where, fridge.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['холодильник', 'морозилка', 'полка круп'], true).setAllowInvalid(true).build());
  var eaten = ss.getSheetByName(SHEETS.eaten.name);
  var ec = columns_('eaten', eaten);
  eaten.getRange(2, ec.meal, eaten.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['завтрак', 'обед', 'ужин', 'перекус'], true).setAllowInvalid(true).build());
  eaten.getRange(2, ec.who, eaten.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['оба', 'Крис', 'Кристина'], true).setAllowInvalid(true).build());
  var ratings = ss.getSheetByName(SHEETS.ratings.name);
  var rc = columns_('ratings', ratings);
  [rc['Крис'], rc['Кристина']].forEach(function (c) {
    ratings.getRange(2, c, ratings.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['👍', '👎'], true).setAllowInvalid(true).build());
  });
  var my = ss.getSheetByName(SHEETS.myRecipes.name);
  var mc = columns_('myRecipes', my);
  my.getRange(2, mc.type, my.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['завтрак', 'обед', 'ужин', 'выходные', 'запасной'], true).setAllowInvalid(true).build());
  if (my.getLastRow() < 2) {
    my.getRange(1, mc.ingredients).setNote('По продукту на строку (Alt+Enter — новая строка в ячейке):\nФарш: 500 г\nЛук: 2\nКурица / индейка: 400 г\nСметана: 3 ст.л. (по желанию)');
    my.getRange(1, mc.steps).setNote('По шагу на строку.');
  }

  // Настройки: кладовая и праздники, если их ещё нет.
  var st = ss.getSheetByName(SHEETS.settings.name);
  st.getRange('B:B').setNumberFormat('@'); // даты праздников — текстом, чтобы Sheets не переделывал формат
  var existing = readSheet_('settings');
  var hasPantry = existing.some(function (r) { return String(r.kind).toLowerCase() === 'кладовая'; });
  var hasHolidays = existing.some(function (r) { return String(r.kind).toLowerCase() === 'праздник'; });
  if (!hasPantry) DEFAULT_PANTRY.forEach(function (v) { st.appendRow(['кладовая', v, 'всегда есть дома']); });
  if (!hasHolidays) DEFAULT_HOLIDAYS.forEach(function (h) { st.appendRow(['праздник', h[0], h[1]]); });
  var hasStores = existing.some(function (r) { return String(r.kind).toLowerCase() === 'магазин'; });
  if (!hasStores) ['Mercadona', 'Carrefour', 'Kuups'].forEach(function (v) { st.appendRow(['магазин', v, '']); });

  // Проставить id существующим строкам.
  ['fridge', 'eaten', 'shopping', 'myRecipes'].forEach(readSheet_);

  importOld_();

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = makeToken_();
    props.setProperty('TOKEN', token);
  }
  Logger.log('Готово. Код доступа для приложения: ' + token);
  return token;
}

/** Показать код доступа ещё раз. */
function showToken() {
  Logger.log('Код доступа: ' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

/** Сменить код доступа (старый перестанет работать на обоих телефонах). */
function resetToken() {
  var token = makeToken_();
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('Новый код доступа: ' + token);
}

function makeToken_() {
  var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  var s = '';
  for (var i = 0; i < 12; i++) s += alphabet[(bytes[i] + 256) % alphabet.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

/** Один раз переносит строки из старой таблицы «Съели». Строки-примеры пропускает. */
function importOld_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('OLD_IMPORTED')) return;
  var old;
  try {
    old = SpreadsheetApp.openById(OLD_EATEN_ID).getSheets()[0];
  } catch (err) {
    Logger.log('Старая таблица недоступна, пропускаю импорт: ' + err);
    return;
  }
  var values = old.getDataRange().getValues();
  if (values.length < 2) {
    props.setProperty('OLD_IMPORTED', '1');
    return;
  }
  var h = values[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var idx = function (re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; };
  var iDate = idx(/дата/), iMeal = idx(/при[её]м/), iDish = idx(/блюдо/), iWho = idx(/кто/), iScore = idx(/понрав|оценк/);
  var current = readSheet_('eaten');
  var seen = {};
  current.forEach(function (r) { seen[r.date + '|' + String(r.dish).toLowerCase()] = true; });
  var added = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var dish = iDish >= 0 ? String(row[iDish]).trim() : '';
    if (!dish || /пример/i.test(dish)) continue;
    var date = iDate >= 0 ? cellOut_(row[iDate], true, false) : '';
    var k = date + '|' + dish.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    upsert_('eaten', {
      id: Utilities.getUuid(),
      date: date,
      meal: iMeal >= 0 ? String(row[iMeal]).trim() : '',
      dish: dish,
      who: iWho >= 0 ? String(row[iWho]).trim() : 'оба',
      score: iScore >= 0 ? String(row[iScore]).trim() : '',
    });
    added++;
  }
  props.setProperty('OLD_IMPORTED', '1');
  Logger.log('Импорт из старой таблицы: ' + added + ' строк');
}
