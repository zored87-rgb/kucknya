// Подбор блюд: что можно приготовить сейчас и чего не хватает одного продукта.

import { PRODUCT_BY_KEY } from '../data/products';
import { recipeIdForDish } from '../data/recipes';
import type { EatenRow, Person, RatingRow, Reaction, Recipe } from '../types';
import { checkRecipe, type RecipeCheck, type Stock } from './availability';
import { daysBetween, parseDate } from './dates';

export type Slot = 'breakfast' | 'lunch' | 'dinner';

/** Все веса в одном месте. Тесты опираются на знаки и порядок, не на точные числа. */
export const W = {
  expiringEach: 3,
  expiringMax: 9,
  neverEaten: 1,
  longAgoPerWeek: 1,
  longAgoMax: 3,
  recentPenalty: -5,
  recentDays: 3,
  likeEach: 1.5,
  similarLike: 0.5,
  similarLikeMax: 1,
  oldScoreFactor: 0.5,
  fishTooOften: -4,
  fishWanted: 1.5,
  vegWanted: 1,
  redMeatTooMuch: -1.5,
  redMeatWeekMax: 3,
  weekendOnWeekday: -1.5,
  otherSlotType: -1,
  backup: -3,
};

// ---------- Свойства блюда ----------

const PROTEIN_GROUPS = new Set(['Птица', 'Мясо', 'Рыба', 'Яйца']);
const NOT_VEG = new Set(['картошка', 'батат', 'лук', 'чеснок', 'имбирь']);

export interface RecipeTraits {
  fish: boolean;
  redMeat: boolean;
  veggy: boolean;
  /** Основной белок: для «похожих» блюд. */
  main: string;
}

export function traits(recipe: Recipe): RecipeTraits {
  let fish = false;
  let redMeat = false;
  let veg = 0;
  let main = '';
  for (const ing of recipe.ingredients) {
    const p = PRODUCT_BY_KEY.get(ing.p);
    if (!p) continue;
    if (!ing.opt && p.group === 'Рыба') fish = true;
    if (!ing.opt && p.redMeat) redMeat = true;
    if ((p.group === 'Овощи' || p.group === 'Зелень') && !NOT_VEG.has(p.key)) veg++;
    if (!main && !ing.opt && PROTEIN_GROUPS.has(p.group)) main = p.family ?? p.key;
  }
  return { fish, redMeat, veggy: veg >= 2, main: main || 'овощи' };
}

// ---------- История и оценки ----------

export interface History {
  /** Когда последний раз ели каждое блюдо (дней назад). */
  lastEaten: Map<string, number>;
  /** Средняя старая оценка 1-5. */
  oldScore: Map<string, number>;
  /** Сколько за последние 7 дней было рыбы / овощных / красного мяса среди обедов и ужинов. */
  week: { meals: number; fish: number; veggy: number; redMeat: number; fishDaysAgo: number | null };
}

export function buildHistory(eaten: EatenRow[], recipes: Recipe[], today: Date): History {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const lastEaten = new Map<string, number>();
  const scores = new Map<string, number[]>();
  const week = { meals: 0, fish: 0, veggy: 0, redMeat: 0, fishDaysAgo: null as number | null };
  for (const row of eaten) {
    const d = parseDate(row.date);
    if (!d) continue;
    const ago = daysBetween(d, today);
    if (ago < 0) continue;
    const id = row.recipeId || recipeIdForDish(row.dish, recipes);
    if (!id) continue;
    const prev = lastEaten.get(id);
    if (prev == null || ago < prev) lastEaten.set(id, ago);
    const sc = parseFloat(String(row.score).replace(',', '.'));
    if (sc >= 1 && sc <= 5) scores.set(id, [...(scores.get(id) ?? []), sc]);
    const r = byId.get(id);
    if (r && ago < 7 && row.meal !== 'завтрак' && row.meal !== 'перекус') {
      const t = traits(r);
      week.meals++;
      if (t.fish) {
        week.fish++;
        if (week.fishDaysAgo == null || ago < week.fishDaysAgo) week.fishDaysAgo = ago;
      }
      if (t.veggy) week.veggy++;
      if (t.redMeat) week.redMeat++;
    }
  }
  const oldScore = new Map([...scores].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  return { lastEaten, oldScore, week };
}

export function reactionsFor(recipeId: string, ratings: RatingRow[]): Record<Person, Reaction> {
  const r = ratings.find((x) => x.recipeId === recipeId);
  return { Крис: r?.Крис ?? '', Кристина: r?.Кристина ?? '' };
}

export function dislikedByAnyone(recipeId: string, ratings: RatingRow[]): boolean {
  const r = reactionsFor(recipeId, ratings);
  return r.Крис === 'dislike' || r.Кристина === 'dislike';
}

// ---------- Подбор ----------

export interface Scored {
  recipe: Recipe;
  check: RecipeCheck;
  score: number;
  reasons: string[];
}

export interface SuggestContext {
  recipes: Recipe[];
  stock: Stock;
  history: History;
  ratings: RatingRow[];
  today: Date;
  /** Кто смотрит (для завтраков). */
  me: Person;
}

function eligible(r: Recipe, slot: Slot, ctx: SuggestContext): boolean {
  if (r.type === 'extra') return false;
  if (slot === 'breakfast') {
    if (r.type !== 'breakfast') return false;
    return reactionsFor(r.id, ctx.ratings)[ctx.me] !== 'dislike';
  }
  if (r.type === 'breakfast') return false;
  if (r.has_egg_as_main) return false;
  if (dislikedByAnyone(r.id, ctx.ratings)) return false;
  return true;
}

export function scoreRecipe(check: RecipeCheck, slot: Slot, ctx: SuggestContext): Scored {
  const r = check.recipe;
  const reasons: string[] = [];
  let score = 0;

  // Продукты, которые скоро испортятся.
  if (check.expiring.length) {
    score += Math.min(W.expiringMax, check.expiring.length * W.expiringEach);
    // Сроки видны в ленте «скоро испортится», здесь — только названия.
    const names = check.expiring
      .map((e) => (PRODUCT_BY_KEY.get(e.key)?.name ?? e.key).replace(/\s*\(.*\)\s*$/, '').toLowerCase())
      .join(', ');
    reasons.push(`спасает: ${names}`);
  }

  // Давно не ели / недавно ели.
  const ago = ctx.history.lastEaten.get(r.id);
  if (ago == null) {
    score += W.neverEaten;
  } else if (ago <= W.recentDays) {
    score += W.recentPenalty;
    reasons.push(ago === 0 ? 'уже ели сегодня' : `ели ${ago} дн. назад`);
  } else {
    score += Math.min(W.longAgoMax, (ago / 7) * W.longAgoPerWeek);
    if (ago >= 10) reasons.push(`давно не ели (${ago} дн.)`);
  }

  // Лайки.
  const react = reactionsFor(r.id, ctx.ratings);
  const likers = (Object.keys(react) as Person[]).filter((p) => react[p] === 'like');
  if (likers.length) {
    score += likers.length * W.likeEach;
    reasons.push(likers.length === 2 ? '👍 обоим нравится' : `👍 ${likers[0]}`);
  } else {
    // Похожее на то, что нравится: тот же основной продукт.
    const t = traits(r);
    const similar = ctx.ratings.filter((x) => {
      if (x.recipeId === r.id || (x.Крис !== 'like' && x.Кристина !== 'like')) return false;
      const other = ctx.recipes.find((y) => y.id === x.recipeId);
      return !!other && traits(other).main === t.main && t.main !== 'овощи';
    }).length;
    score += Math.min(W.similarLikeMax, similar * W.similarLike);
  }
  const old = ctx.history.oldScore.get(r.id);
  if (old != null) score += (old - 3) * W.oldScoreFactor;

  if (slot !== 'breakfast') {
    // Баланс недели.
    const t = traits(r);
    const wk = ctx.history.week;
    if (t.fish) {
      if (wk.fishDaysAgo != null && wk.fishDaysAgo < 7) {
        score += W.fishTooOften;
        reasons.push('рыба уже была на неделе');
      } else {
        score += W.fishWanted;
        reasons.push('рыбы на неделе ещё не было');
      }
    }
    if (t.veggy && wk.meals >= 2 && wk.veggy / wk.meals < 0.5) {
      score += W.vegWanted;
      reasons.push('больше овощей');
    }
    if (t.redMeat && wk.redMeat >= W.redMeatWeekMax) {
      score += W.redMeatTooMuch;
      reasons.push('много красного мяса на неделе');
    }

    // Тип блюда.
    const dow = ctx.today.getDay();
    const weekend = dow === 0 || dow === 6 || (dow === 5 && slot === 'dinner');
    if (r.type === 'weekend' && !weekend) score += W.weekendOnWeekday;
    if (r.type === 'backup') score += W.backup;
    if (slot === 'lunch' && r.type === 'dinner') score += W.otherSlotType;
    if (slot === 'dinner' && r.type === 'batch_lunch') score += W.otherSlotType;
  }

  return { recipe: r, check, score: Math.round(score * 10) / 10, reasons };
}

export interface Suggestions {
  ready: Scored[];
  /** Не хватает ровно одного продукта. */
  almost: Scored[];
}

export function suggest(slot: Slot, ctx: SuggestContext): Suggestions {
  const ready: Scored[] = [];
  const almost: Scored[] = [];
  for (const r of ctx.recipes) {
    if (!eligible(r, slot, ctx)) continue;
    const check = checkRecipe(r, ctx.stock);
    if (check.banned) continue;
    if (check.ready) ready.push(scoreRecipe(check, slot, ctx));
    else if (check.missing.length === 1) almost.push(scoreRecipe(check, slot, ctx));
  }
  const byScore = (a: Scored, b: Scored) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, 'ru');
  if (slot === 'breakfast') {
    // Завтраки без предписаний: сначала то, что мне нравится, дальше по алфавиту.
    const mine = (s: Scored) => (reactionsFor(s.recipe.id, ctx.ratings)[ctx.me] === 'like' ? 0 : 1);
    const byName = (a: Scored, b: Scored) => mine(a) - mine(b) || a.recipe.name.localeCompare(b.recipe.name, 'ru');
    return { ready: ready.sort(byName), almost: almost.sort(byName) };
  }
  return { ready: ready.sort(byScore), almost: almost.sort(byScore) };
}

/** Слот по времени суток: до 11 — завтрак, до 16 — обед, дальше ужин. */
export function slotForTime(d: Date): Slot {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  return 'dinner';
}
