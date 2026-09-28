// Общие типы приложения.

/** Единица учёта продукта. «шт» — всё, что считается штуками: луковицы, банки, пачки, пучки (слово берётся из forms). */
export type Unit = 'шт' | 'г' | 'мл';

export type Place = 'холодильник' | 'морозилка' | 'полка круп';
export const PLACES: Place[] = ['холодильник', 'морозилка', 'полка круп'];

export type Group =
  | 'Овощи'
  | 'Зелень'
  | 'Фрукты'
  | 'Птица'
  | 'Мясо'
  | 'Рыба'
  | 'Молочное'
  | 'Сыр'
  | 'Яйца'
  | 'Крупы и макароны'
  | 'Хлеб и тесто'
  | 'Консервы и соусы'
  | 'Специи'
  | 'Заготовки'
  | 'Прочее';

export interface Product {
  /** Канонический ключ, на него ссылаются рецепты. */
  key: string;
  /** Как показывать в списке. */
  name: string;
  aliases?: string[];
  unit: Unit;
  /** Для «шт»: 1 луковица, 2 луковицы, 5 луковиц. */
  forms?: [string, string, string];
  where: Place;
  group: Group;
  /** Семейство для кладовой и замен: «паста» покрывает спагетти и макароны. */
  family?: string;
  /** Красное мясо — для баланса недели. */
  redMeat?: boolean;
  /** Никогда не предлагать (чеддер, кислый йогурт). */
  banned?: boolean;
  /** Сколько дней хранится свежим — для автоматического «годен до». */
  shelfDays?: number;
}

export type RecipeType = 'breakfast' | 'batch_lunch' | 'dinner' | 'weekend' | 'backup' | 'extra';

export interface Ingredient {
  /** Ключ продукта из каталога. */
  p: string;
  /** Как написано в рецепте: «2 шт», «3 ст.л.». */
  q?: string;
  /** Сколько нужно в единицах продукта (для вычитания). Нет — хватает факта наличия. */
  n?: number;
  /** Чем можно заменить. */
  alt?: string[];
  /** По желанию: блюдо доступно и без него. */
  opt?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  type: RecipeType;
  cuisine: 'ru' | 'es' | 'world' | null;
  origin?: string | null;
  time: string;
  cost_eur_for_two?: number | null;
  has_egg_as_main: boolean;
  /** На сколько порций рецепт. Нет — по типу (servingsOf). */
  servings?: number;
  ingredients: Ingredient[];
  steps: string[];
  /** Совет: «нет сметаны — подайте с мёдом». */
  tip?: string;
  /** Рецепт из листа «Мои рецепты». */
  custom?: boolean;
}

// ---- Строки таблицы ----

export interface FridgeRow {
  id: string;
  name: string;
  where: string;
  qty: string;
  /** dd.mm.yyyy или пусто */
  expires: string;
  note: string;
}

export type Meal = 'завтрак' | 'обед' | 'ужин' | 'перекус';
export const MEALS: Meal[] = ['завтрак', 'обед', 'ужин', 'перекус'];

export type Person = 'Крис' | 'Кристина';
export const PEOPLE: Person[] = ['Крис', 'Кристина'];
export type Who = 'оба' | Person;

export interface EatenRow {
  id: string;
  date: string; // dd.mm.yyyy
  meal: string;
  dish: string;
  who: string;
  /** Старая оценка 1-5, если была. */
  score: string;
  recipeId: string;
}

export interface ShoppingRow {
  id: string;
  name: string;
  qty: string;
  reason: string;
  bought: boolean;
}

export type Reaction = 'like' | 'dislike' | '';

export interface RatingRow {
  recipeId: string;
  dish: string;
  Крис: Reaction;
  Кристина: Reaction;
}

export interface MyRecipeRow {
  id: string;
  name: string;
  type: string;
  cuisine: string;
  time: string;
  ingredients: string;
  steps: string;
  egg: boolean;
}

export interface Settings {
  pantry: string[];
  holidays: { date: string; name: string }[];
  /** Магазины, где покупаете. Пусто — стандартный список. */
  stores?: string[];
  /**
   * Личный темп голода и ручные отметки сытости: { Крис: {...}, Кристина: {...} }.
   * Нет поля — скрипт таблицы старый и не умеет их хранить.
   */
  pets?: Record<string, { fullHours: number; n: number; override?: { value: number; at: number } | null }>;
}

/** Строка, надиктованная через Siri: приложение разберёт её и положит в холодильник. */
export interface InboxRow {
  id: string;
  date: string;
  text: string;
}

/** Чек: сколько вышло за поход в магазин. */
export interface ReceiptRow {
  id: string;
  date: string;
  store: string;
  total: string;
  note: string;
}

/** Цена продукта в конкретном магазине. */
export interface PriceRow {
  id: string;
  date: string;
  product: string;
  store: string;
  price: string;
  /** За сколько: «500 г», «1 пачка», «1 кг». */
  per: string;
}

export interface Snapshot {
  fridge: FridgeRow[];
  eaten: EatenRow[];
  shopping: ShoppingRow[];
  ratings: RatingRow[];
  myRecipes: MyRecipeRow[];
  settings: Settings;
  inbox?: InboxRow[];
  receipts?: ReceiptRow[];
  prices?: PriceRow[];
}
