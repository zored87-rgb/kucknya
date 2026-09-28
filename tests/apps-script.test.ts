// Code.gs запускается на подделанных SpreadsheetApp и компании — проверяем логику без Google.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

type Cell = unknown;

class FakeRange {
  constructor(
    private sh: FakeSheet,
    private r: number,
    private c: number,
    private nr = 1,
    private nc = 1,
  ) {}
  getValues(): Cell[][] {
    const out: Cell[][] = [];
    for (let i = 0; i < this.nr; i++) {
      const row: Cell[] = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  setValues(v: Cell[][]) {
    v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x)));
    return this;
  }
  setValue(v: Cell) {
    this.sh.set(this.r, this.c, v);
    return this;
  }
  getValue(): Cell {
    return this.sh.get(this.r, this.c);
  }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  insertCheckboxes() { return this; }
  setDataValidation() { return this; }
  setNote() { return this; }
}

class FakeSheet {
  rows: Cell[][] = [];
  hidden: number[] = [];
  constructor(public name: string) {}
  get(r: number, c: number): Cell {
    return this.rows[r - 1]?.[c - 1] ?? '';
  }
  set(r: number, c: number, v: Cell) {
    while (this.rows.length < r) this.rows.push([]);
    this.rows[r - 1][c - 1] = v;
  }
  getName() { return this.name; }
  setName(n: string) { this.name = n; return this; }
  getLastRow() {
    for (let i = this.rows.length; i > 0; i--) if (this.rows[i - 1].some((x) => x !== '' && x != null)) return i;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  getMaxRows() { return 1000; }
  getRange(a: number | string, c?: number, nr?: number, nc?: number) {
    if (typeof a === 'string') return new FakeRange(this, 1, 2, 1000, 1);
    return new FakeRange(this, a, c!, nr, nc);
  }
  getDataRange() { return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(v: Cell[]) { this.rows.splice(this.getLastRow(), 0, [...v]); }
  deleteRow(r: number) { this.rows.splice(r - 1, 1); }
  deleteRows(r: number, n: number) { this.rows.splice(r - 1, n); }
  hideColumns(c: number) { this.hidden.push(c); }
  setFrozenRows() {}
}

class FakeSpreadsheet {
  constructor(public sheets: FakeSheet[]) {}
  getSheetByName(n: string) { return this.sheets.find((s) => s.name === n) ?? null; }
  getSheets() { return this.sheets; }
  insertSheet(n: string) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
}

const pad = (n: number) => String(n).padStart(2, '0');

function makeEnv(main: FakeSpreadsheet, old: FakeSpreadsheet) {
  const props: Record<string, string> = {};
  let uuid = 0;
  const logs: string[] = [];
  const validation = { requireValueInList: () => validation, setAllowInvalid: () => validation, build: () => ({}) };
  const env = {
    SpreadsheetApp: {
      openById: (id: string) => (id.startsWith('1LC7') ? main : old),
      newDataValidation: () => validation,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] ?? null,
        setProperty: (k: string, v: string) => { props[k] = v; },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s: string) => ({ setMimeType: () => ({ body: s }) }),
    },
    Utilities: {
      getUuid: () => `uuid-${++uuid}`,
      formatDate: (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
      computeDigest: () => Array.from({ length: 32 }, (_, i) => (i * 37) % 256 - 128),
      DigestAlgorithm: { SHA_256: 'sha' },
    },
    Logger: { log: (s: string) => logs.push(s) },
    Date,
    JSON,
    String,
    Math,
    Object,
    Array,
    Error,
  };
  const ctx = createContext(env);
  runInContext(readFileSync('apps-script/Code.gs', 'utf8'), ctx);
  return { ctx, props, logs };
}

function sheetFrom(name: string, rows: Cell[][]) {
  const s = new FakeSheet(name);
  s.rows = rows.map((r) => [...r]);
  return s;
}

let main: FakeSpreadsheet;
let env: ReturnType<typeof makeEnv>;
const call = (body: object) => {
  const out = runInContext(`doPost(${JSON.stringify({ postData: { contents: JSON.stringify(body) } })})`, env.ctx) as { body: string };
  return JSON.parse(out.body);
};

beforeEach(() => {
  main = new FakeSpreadsheet([
    sheetFrom('Лист1', [
      ['Продукт', 'Где', 'Сколько', 'Годен до', 'Заметка'],
      ['Сметана', 'холодильник', 'почти полная, 200 г', new Date(2026, 8, 30), 'Открыта'],
      ['Лосось', 'холодильник', '~150 г', '27.09.2026', ''],
    ]),
  ]);
  const old = new FakeSpreadsheet([
    sheetFrom('Съели', [
      ['Дата', 'Приём', 'Блюдо', 'Кто', 'Понравилось (1-5)'],
      [new Date(2026, 8, 26), 'обед', 'Рис с соусом карри и сметаной (пример, можно удалить)', 'оба', 4],
      [new Date(2026, 8, 25), 'ужин', 'Борщ', 'оба', 5],
    ]),
  ]);
  env = makeEnv(main, old);
  runInContext('setup()', env.ctx);
});

describe('Apps Script', () => {
  it('setup: лист переименован, листы созданы, id проставлены, код доступа есть', () => {
    expect(main.sheets.map((s) => s.name)).toEqual(['Холодильник', 'Съели', 'Покупки', 'Оценки', 'Мои рецепты', 'Настройки', 'Входящие', 'Чеки', 'Цены']);
    const fridge = main.sheets[0];
    expect(fridge.rows[0]).toEqual(['Продукт', 'Где', 'Сколько', 'Годен до', 'Заметка', 'id']);
    expect(fridge.rows[1][5]).toMatch(/^uuid-/);
    expect(fridge.hidden).toContain(6);
    expect(env.props.TOKEN).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    expect(env.logs.join()).toContain(env.props.TOKEN);
  });

  it('импорт старой «Съели»: пример пропущен, повторный setup не задваивает', () => {
    runInContext('setup()', env.ctx);
    const eaten = main.getSheetByName('Съели')!;
    expect(eaten.getLastRow()).toBe(2);
    expect(eaten.rows[1][2]).toBe('Борщ');
  });

  it('без токена — отказ', () => {
    expect(call({ action: 'bootstrap' })).toEqual({ ok: false, error: 'bad_token' });
    expect(call({ action: 'bootstrap', token: 'wrong' }).ok).toBe(false);
  });

  it('bootstrap: даты в dd.mm.yyyy, кладовая и праздники из «Настроек»', () => {
    const r = call({ action: 'bootstrap', token: env.props.TOKEN });
    expect(r.ok).toBe(true);
    expect(r.data.fridge[0]).toMatchObject({ name: 'Сметана', expires: '30.09.2026', qty: 'почти полная, 200 г' });
    expect(r.data.fridge[1].expires).toBe('27.09.2026');
    expect(r.data.settings.pantry).toContain('паста');
    expect(r.data.settings.holidays).toContainEqual({ date: '12.10.2026', name: 'День Испании' });
    expect(r.data.eaten[0]).toMatchObject({ dish: 'Борщ', date: '25.09.2026', score: '5' });
  });

  it('batch: добавить, изменить, удалить — по id, повтор безопасен', () => {
    const token = env.props.TOKEN;
    const add = { op: 'fridge.upsert', opId: 'o1', row: { id: 'x1', name: 'Лук', where: 'полка круп', qty: '6 луковиц', expires: '', note: '' } };
    call({ action: 'batch', token, ops: [add] });
    const r = call({ action: 'batch', token, ops: [add] }); // повтор
    expect(r.data.fridge.filter((f: { id: string }) => f.id === 'x1')).toHaveLength(1);
    const upd = call({ action: 'batch', token, ops: [{ op: 'fridge.upsert', row: { id: 'x1', qty: '4 луковицы' } }] });
    expect(upd.data.fridge.find((f: { id: string }) => f.id === 'x1')).toMatchObject({ name: 'Лук', qty: '4 луковицы' });
    const del = call({ action: 'batch', token, ops: [{ op: 'fridge.delete', id: 'x1' }, { op: 'fridge.delete', id: 'x1' }] });
    expect(del.results.every((x: { ok: boolean }) => x.ok)).toBe(true);
    expect(del.data.fridge.some((f: { id: string }) => f.id === 'x1')).toBe(false);
  });

  it('удалённое не воскресает от опоздавшей правки, «Вернуть» — возвращает; всё в «Журнале»', () => {
    const token = env.props.TOKEN;
    const has = (d: { fridge: { id: string }[] }) => d.fridge.some((f) => f.id === 's1');
    call({ action: 'batch', token, me: 'Кристина', ops: [{ op: 'fridge.upsert', opId: 'a', row: { id: 's1', name: 'Сметана', qty: '1' } }] });
    call({ action: 'batch', token, me: 'Кристина', ops: [{ op: 'fridge.delete', opId: 'b', id: 's1' }] });
    // Старая правка со второго телефона — частичная и целиком
    let r = call({ action: 'batch', token, me: 'Крис', ops: [{ op: 'fridge.upsert', opId: 'c', row: { id: 's1', qty: '0,5' } }] });
    expect(has(r.data)).toBe(false);
    r = call({ action: 'batch', token, me: 'Крис', ops: [{ op: 'fridge.upsert', opId: 'd', row: { id: 's1', name: 'Сметана', qty: '1' } }] });
    expect(has(r.data)).toBe(false);
    expect(r.results[0]).toMatchObject({ ok: true, note: 'пропущено: уже удалено' });
    r = call({ action: 'batch', token, me: 'Кристина', ops: [{ op: 'fridge.upsert', opId: 'e', row: { id: 's1', name: 'Сметана', qty: '1' }, restore: true }] });
    expect(has(r.data)).toBe(true);
    // Убавить у строки, которой никогда не было, — не создаёт пустую строку
    r = call({ action: 'batch', token, ops: [{ op: 'fridge.upsert', opId: 'f', row: { id: 'ghost', qty: '1' } }] });
    expect(r.data.fridge.some((f: { id: string }) => f.id === 'ghost')).toBe(false);
    const log = main.getSheetByName('Журнал')!.rows;
    expect(log[0]).toEqual(['Когда', 'Кто', 'Действие', 'Что', 'Итог']);
    expect(log.slice(1).map((x) => [x[1], x[2], x[3], x[4]])).toEqual([
      ['Кристина', 'fridge.upsert', 'Сметана · 1', 'ок'],
      ['Кристина', 'fridge.delete', 'Сметана', 'ок'],
      ['Крис', 'fridge.upsert', 's1 · 0,5', 'пропущено: уже удалено'],
      ['Крис', 'fridge.upsert', 'Сметана · 1', 'пропущено: уже удалено'],
      ['Кристина', 'fridge.upsert', 'Сметана · 1 · вернули', 'ок'],
      ['', 'fridge.upsert', 'ghost · 1', 'пропущено: строки нет'],
    ]);
  });

  it('оценки: у каждого своя, в таблице 👍/👎', () => {
    const token = env.props.TOKEN;
    call({ action: 'batch', token, ops: [{ op: 'rating.set', recipeId: 'borsch', dish: 'Борщ', person: 'Крис', value: 'like' }] });
    const r = call({ action: 'batch', token, ops: [{ op: 'rating.set', recipeId: 'borsch', person: 'Кристина', value: 'dislike' }] });
    expect(r.data.ratings).toEqual([{ recipeId: 'borsch', dish: 'Борщ', Крис: 'like', Кристина: 'dislike' }]);
    expect(main.getSheetByName('Оценки')!.rows[1]).toContain('👍');
  });

  it('покупки с галочкой и кладовая', () => {
    const token = env.props.TOKEN;
    const r = call({
      action: 'batch',
      token,
      ops: [
        { op: 'shopping.upsert', row: { id: 's1', name: 'Фарш', qty: '500 г', reason: 'откроет 6 блюд', bought: false } },
        { op: 'shopping.upsert', row: { id: 's1', bought: true } },
        { op: 'pantry.set', items: ['соль', 'рис'] },
      ],
    });
    expect(r.data.shopping[0]).toMatchObject({ name: 'Фарш', bought: true });
    expect(r.data.settings.pantry).toEqual(['соль', 'рис']);
    expect(r.data.settings.holidays.length).toBeGreaterThan(20);
  });

  it('неизвестная операция не роняет остальные', () => {
    const r = call({ action: 'batch', token: env.props.TOKEN, ops: [{ op: 'nope.x' }, { op: 'eaten.upsert', row: { id: 'e1', date: '01.10.2026', dish: 'Плов', meal: 'обед', who: 'оба' } }] });
    expect(r.results[0].ok).toBe(false);
    expect(r.results[1].ok).toBe(true);
    expect(r.data.eaten.some((e: { dish: string }) => e.dish === 'Плов')).toBe(true);
  });

  it('quickAdd от Siri: строка во «Входящие», потом приложение её удаляет', () => {
    const token = env.props.TOKEN;
    expect(call({ action: 'quickAdd', token, text: '6 луковиц, фарш 500' })).toMatchObject({ ok: true, message: expect.stringContaining('6 луковиц') });
    const r = call({ action: 'bootstrap', token });
    expect(r.data.inbox).toHaveLength(1);
    expect(r.data.inbox[0].text).toBe('6 луковиц, фарш 500');
    const after = call({ action: 'batch', token, ops: [{ op: 'inbox.delete', id: r.data.inbox[0].id }] });
    expect(after.data.inbox).toHaveLength(0);
    expect(call({ action: 'quickAdd', text: 'x' }).ok).toBe(false);
  });

  it('чеки, цены и магазины', () => {
    const token = env.props.TOKEN;
    const r = call({
      action: 'batch',
      token,
      ops: [
        { op: 'receipt.upsert', row: { id: 'r1', date: '28.09.2026', store: 'Carrefour', total: '43.20', note: '' } },
        { op: 'price.upsert', row: { id: 'p1', date: '28.09.2026', product: 'Фарш', store: 'Carrefour', price: '3.99', per: '500 г' } },
        { op: 'stores.set', items: ['Mercadona', 'Carrefour', 'Kuups', 'Lidl'] },
      ],
    });
    expect(r.data.receipts[0]).toMatchObject({ store: 'Carrefour', total: '43.20', date: '28.09.2026' });
    expect(r.data.prices[0]).toMatchObject({ product: 'Фарш', price: '3.99', per: '500 г' });
    expect(r.data.settings.stores).toEqual(['Mercadona', 'Carrefour', 'Kuups', 'Lidl']);
    expect(r.data.settings.pantry).toContain('паста');
  });

  it('новая строка встаёт сразу под данными, даже если ниже 1000 пустых галочек', () => {
    const shop = main.getSheetByName('Покупки')!;
    for (let i = 2; i <= 1000; i++) shop.set(i, 4, false);
    call({ action: 'batch', token: env.props.TOKEN, ops: [{ op: 'shopping.upsert', row: { id: 's9', name: 'Лук', bought: false } }] });
    expect(shop.rows[1][0]).toBe('Лук');
  });
});
