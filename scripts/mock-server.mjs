// Локальный бэкенд для разработки: настоящий apps-script/Code.gs на таблице в памяти.
// Запуск: node scripts/mock-server.mjs  → http://localhost:8787, код доступа: test-test-test
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createContext, runInContext } from 'node:vm';

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) {
    Object.assign(this, { sh, r, c, nr, nc });
  }
  getValues() {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sh.get(this.r + i, this.c + j)));
  }
  setValues(v) {
    v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x)));
    return this;
  }
  setValue(v) {
    this.sh.set(this.r, this.c, v);
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  insertCheckboxes() { return this; }
  setDataValidation() { return this; }
  setNote() { return this; }
}

class Sheet {
  constructor(name, rows = []) {
    this.name = name;
    this.rows = rows;
  }
  get(r, c) { return this.rows[r - 1]?.[c - 1] ?? ''; }
  set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    this.rows[r - 1][c - 1] = v;
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() {
    for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some((x) => x !== '' && x != null)) return i;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  getMaxRows() { return 1000; }
  getRange(a, c, nr, nc) { return typeof a === 'string' ? new Range(this, 1, 2, 1000, 1) : new Range(this, a, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(v) { this.rows.splice(this.getLastRow(), 0, [...v]); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  hideColumns() {}
  setFrozenRows() {}
}

const d = (s) => {
  const [dd, mm, yy] = s.split('.');
  return new Date(+yy, +mm - 1, +dd);
};
const today = new Date();
const inDays = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);

const fridgeRows = [
  ['Продукт', 'Где', 'Сколько', 'Годен до', 'Заметка'],
  ['Сметана', 'холодильник', 'почти полная, 200 г', inDays(0), 'Открыта'],
  ['Филадельфия', 'холодильник', '½ банки', inDays(5), 'Открыта'],
  ['Томаты натураль (банка)', 'холодильник', '~145 г', inDays(1), 'Открыта, израсходовать первой'],
  ['Томато фрито', 'холодильник', '¼ банки', inDays(3), 'Открыта'],
  ['Соус карри', 'холодильник', 'до 200 мл', inDays(4), ''],
  ['Рукола', 'холодильник', '1 пачка', inDays(2), 'С клининга'],
  ['Табуле с кускусом', 'холодильник', '½ упаковки', inDays(0), ''],
  ['Огурец', 'холодильник', '1 огурец', inDays(2), 'Проверить'],
  ['Лимон', 'холодильник', '1 лимон', inDays(7), ''],
  ['Масло сливочное', 'холодильник', '1/2 пачки', inDays(23), ''],
  ['Сырники, заготовка', 'морозилка', '6 сырников', '', 'Жарить прямо из морозилки'],
  ['Рис', 'полка круп', '1 порция, ~80 г', '', ''],
  ['Нори', 'полка круп', '7 листов', '', ''],
  ['Соевый соус', 'полка круп', '~160 мл', '', ''],
  ['Мёд', 'полка круп', 'почти 350 г', '', ''],
  ['Оливковое масло', 'полка круп', '~20 мл', '', 'Почти закончилось'],
  ['Кофе молотый', 'полка круп', 'есть', '', ''],
  ['Спагетти', 'полка круп', '200 г', '', ''],
  ['Куриные бёдра', 'холодильник', '250 г', '', ''],
  ['Молоко', 'холодильник', '1 пакет', inDays(90), ''],
  ['Шоколад', 'холодильник', '1 плитка', '', ''],
  ['Яйца', 'холодильник', '11 яиц', '', ''],
];
const main = { sheets: [new Sheet('Лист1', fridgeRows)] };
main.getSheetByName = (n) => main.sheets.find((s) => s.name === n) ?? null;
main.getSheets = () => main.sheets;
main.insertSheet = (n) => {
  const s = new Sheet(n);
  main.sheets.push(s);
  return s;
};
const old = { getSheets: () => [new Sheet('Съели', [['Дата', 'Приём', 'Блюдо', 'Кто', 'Понравилось (1-5)'], [d('26.09.2026'), 'обед', 'Рис с соусом карри и сметаной (пример, можно удалить)', 'оба', 4]])] };

const props = { TOKEN: 'test-test-test' };
const validation = { requireValueInList: () => validation, setAllowInvalid: () => validation, build: () => ({}) };
const pad = (n) => String(n).padStart(2, '0');
const ctx = createContext({
  SpreadsheetApp: { openById: (id) => (id.startsWith('1LC7') ? main : old), newDataValidation: () => validation },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: s }) }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    formatDate: (x) => `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`,
    computeDigest: () => [],
    DigestAlgorithm: {},
  },
  Logger: { log: (s) => console.log('[gs]', s) },
  Date,
  JSON,
});
runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
runInContext('setup()', ctx);

const port = +(process.env.PORT ?? 8787);
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') {
    res.end(runInContext('doGet()', ctx).body);
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    ctx.__body = body;
    const out = runInContext('doPost({ postData: { contents: __body } })', ctx);
    // Как у Apps Script: ответ приходит не мгновенно.
    setTimeout(() => {
      res.setHeader('Content-Type', 'application/json');
      res.end(out.body);
    }, 300);
  });
}).listen(port, () => console.log(`mock Apps Script: http://localhost:${port}  token: ${props.TOKEN}`));
