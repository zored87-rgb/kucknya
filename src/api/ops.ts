// Изменения данных. Одни и те же операции применяются локально (сразу, оптимистично)
// и отправляются в Apps Script (сразу или позже, если нет сети).

import type { EatenRow, FridgeRow, MyRecipeRow, Person, PriceRow, Reaction, ReceiptRow, ShoppingRow, Snapshot } from '../types';

type WithId<T> = Partial<T> & { id: string };

export type OpBody =
  | { op: 'fridge.upsert'; row: WithId<FridgeRow>; restore?: boolean }
  | { op: 'fridge.delete'; id: string }
  | { op: 'eaten.upsert'; row: WithId<EatenRow>; restore?: boolean }
  | { op: 'eaten.delete'; id: string }
  | { op: 'shopping.upsert'; row: WithId<ShoppingRow>; restore?: boolean }
  | { op: 'shopping.delete'; id: string }
  | { op: 'rating.set'; recipeId: string; dish: string; person: Person; value: Reaction }
  | { op: 'myRecipe.upsert'; row: WithId<MyRecipeRow>; restore?: boolean }
  | { op: 'pantry.set'; items: string[] }
  | { op: 'stores.set'; items: string[] }
  | { op: 'pet.set'; person: string; data: { fullHours: number; n: number; override?: { value: number; at: number } | null } }
  | { op: 'inbox.delete'; id: string }
  | { op: 'receipt.upsert'; row: WithId<ReceiptRow>; restore?: boolean }
  | { op: 'receipt.delete'; id: string }
  | { op: 'price.upsert'; row: WithId<PriceRow>; restore?: boolean }
  | { op: 'price.delete'; id: string };

/** restore — вернуть удалённую строку (кнопка «Вернуть»); без него удалённое не воскресает. */
export type Op = OpBody & { opId: string; tries?: number };

export const EMPTY_SNAPSHOT: Snapshot = {
  fridge: [],
  eaten: [],
  shopping: [],
  ratings: [],
  myRecipes: [],
  settings: { pantry: [], holidays: [] },
  inbox: [],
  receipts: [],
  prices: [],
};

function upsert<T extends { id: string }>(list: T[], row: WithId<T>, blank: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) return [...list, { ...blank, ...row } as T];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...row };
  return copy;
}

const BLANK_FRIDGE: FridgeRow = { id: '', name: '', where: '', qty: '', expires: '', note: '' };
const BLANK_EATEN: EatenRow = { id: '', date: '', meal: '', dish: '', who: '', score: '', recipeId: '' };
const BLANK_SHOP: ShoppingRow = { id: '', name: '', qty: '', reason: '', bought: false };
const BLANK_RECEIPT: ReceiptRow = { id: '', date: '', store: '', total: '', note: '' };
const BLANK_PRICE: PriceRow = { id: '', date: '', product: '', store: '', price: '', per: '' };
const BLANK_MY: MyRecipeRow = { id: '', name: '', type: '', cuisine: '', time: '', ingredients: '', steps: '', egg: false };

export function applyOp(s: Snapshot, op: OpBody): Snapshot {
  switch (op.op) {
    case 'fridge.upsert':
      return { ...s, fridge: upsert(s.fridge, op.row, BLANK_FRIDGE) };
    case 'fridge.delete':
      return { ...s, fridge: s.fridge.filter((x) => x.id !== op.id) };
    case 'eaten.upsert':
      return { ...s, eaten: upsert(s.eaten, op.row, BLANK_EATEN) };
    case 'eaten.delete':
      return { ...s, eaten: s.eaten.filter((x) => x.id !== op.id) };
    case 'shopping.upsert':
      return { ...s, shopping: upsert(s.shopping, op.row, BLANK_SHOP) };
    case 'shopping.delete':
      return { ...s, shopping: s.shopping.filter((x) => x.id !== op.id) };
    case 'rating.set': {
      const i = s.ratings.findIndex((r) => r.recipeId === op.recipeId);
      const base = i >= 0 ? s.ratings[i] : { recipeId: op.recipeId, dish: op.dish, Крис: '' as Reaction, Кристина: '' as Reaction };
      const next = { ...base, dish: op.dish || base.dish, [op.person]: op.value };
      const ratings = s.ratings.slice();
      if (i >= 0) ratings[i] = next;
      else ratings.push(next);
      return { ...s, ratings };
    }
    case 'myRecipe.upsert':
      return { ...s, myRecipes: upsert(s.myRecipes, op.row, BLANK_MY) };
    case 'pantry.set':
      return { ...s, settings: { ...s.settings, pantry: op.items } };
    case 'stores.set':
      return { ...s, settings: { ...s.settings, stores: op.items } };
    case 'pet.set':
      return { ...s, settings: { ...s.settings, pets: { ...(s.settings.pets ?? {}), [op.person]: op.data } } };
    case 'inbox.delete':
      return { ...s, inbox: (s.inbox ?? []).filter((x) => x.id !== op.id) };
    case 'receipt.upsert':
      return { ...s, receipts: upsert(s.receipts ?? [], op.row, BLANK_RECEIPT) };
    case 'receipt.delete':
      return { ...s, receipts: (s.receipts ?? []).filter((x) => x.id !== op.id) };
    case 'price.upsert':
      return { ...s, prices: upsert(s.prices ?? [], op.row, BLANK_PRICE) };
    case 'price.delete':
      return { ...s, prices: (s.prices ?? []).filter((x) => x.id !== op.id) };
  }
}

export function applyAll(s: Snapshot, ops: OpBody[]): Snapshot {
  return ops.reduce(applyOp, s);
}

export function newId(): string {
  return crypto.randomUUID();
}
