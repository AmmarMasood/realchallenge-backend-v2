/**
 * Pure scoring for meal-plan slot selection.
 *
 * The generator used to take the FIRST recipe in a shuffled pool that fitted
 * the budget gate. That made every eligible recipe equally good: one landing
 * exactly on the day's macro target ranked the same as one scraping under the
 * calorie cap, and nothing considered whether the customer had already eaten
 * it on Tuesday.
 *
 * The gate stays a HARD filter — a recipe must still fit the remaining budget.
 * These functions then choose the BEST of what fits rather than the first.
 *
 * Deliberately free of Mongoose and I/O so it can be unit-tested without a DB,
 * and deterministic so a seeded plan stays reproducible.
 *
 * Mirrors services/recommendation/challengeScoring.js: weights in one exported
 * object, only signals with data contribute, and the total is normalised by the
 * sum of the weights that actually applied — so adding a signal later does not
 * require re-tuning the existing ones.
 */

const WEIGHTS = {
  macroFit: 40,
  calorieFit: 25,
  variety: 20,
  favourite: 10,
  foodTypeSpread: 5,
};

// How long it takes a recipe to become "fully fresh" again. Set to a full week
// deliberately: with a shorter window everything older than the window scores
// a flat 1, so least-recently-used candidates TIE and rotation stalls into a
// short cycle (a 3-day window on a 5-recipe pool produced day 1 == day 4 ==
// day 7). Over a week the gap keeps discriminating, so the plan works its way
// through the pool.
const VARIETY_WINDOW_DAYS = 7;

// Scores are 0..1 and fully deterministic, which means the seeded shuffle only
// ever breaks EXACT ties — and with distinct macro profiles those are rare. So
// without this, every week produced an identical plan: scoring had quietly
// made the seed irrelevant.
//
// A small seeded jitter restores week-to-week variety while keeping any single
// week reproducible. Kept well below the gap a meaningful score difference
// creates, so it only reorders candidates that were already near-equal — it
// cannot promote a badly-fitting recipe over a well-fitting one.
const TIEBREAK_JITTER = 0.05;

const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;

/**
 * Closeness of `actual` to `target`, as 1 at the target falling to 0 at
 * double it (or zero). Returns null when there is no meaningful target, so
 * the signal is skipped rather than counted as a zero.
 */
function closeness(actual, target) {
  if (!target || target <= 0) return null;
  const ratio = Math.abs((actual || 0) - target) / target;
  return Math.max(0, 1 - ratio);
}

/**
 * How well the recipe's macros match this slot's share of the day's budget.
 * Averages the three macros so one wild value cannot dominate.
 *
 * `gate` holds the day's REMAINING budget in kcal; a slot is expected to take
 * roughly a quarter of it — the same fraction the hard gate uses, so scoring
 * and filtering agree about what "right sized" means.
 */
function macroFitScore(recipe, gate) {
  const parts = [
    closeness((recipe.fat || 0) * KCAL_PER_G_FAT, gate.fat / 4),
    closeness((recipe.protein || 0) * KCAL_PER_G_PROTEIN, gate.protein / 4),
    closeness((recipe.carbohydrate || 0) * KCAL_PER_G_CARB, gate.carb / 4),
  ].filter((p) => p !== null);

  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/** Closeness of the recipe's calories to the slot's share of the budget. */
function calorieFitScore(recipe, gate) {
  return closeness(recipe.kCalPerPerson || 0, gate.cal / 4);
}

/**
 * 1 when the recipe has not been used recently, falling toward 0 the more
 * recently it appeared. `usageByRecipeId` maps recipe id -> the most recent
 * day index it was placed on; `dayIndex` is the day being filled.
 */
function varietyScore(recipe, usageByRecipeId, dayIndex) {
  if (!usageByRecipeId) return null;
  const last = usageByRecipeId[String(recipe._id)];
  if (last === undefined) return 1; // never used — maximum variety
  const gap = dayIndex - last;
  if (gap <= 0) return 0;
  return Math.min(1, gap / VARIETY_WINDOW_DAYS);
}

/** 1 when the customer has favourited this recipe. */
function favouriteScore(recipe, favouriteIds) {
  if (!favouriteIds || !favouriteIds.length) return null;
  return favouriteIds.includes(String(recipe._id)) ? 1 : 0;
}

/**
 * Penalises repeating a food type already used on this day, so a day is not
 * three "Quick" items in a row.
 */
function foodTypeSpreadScore(recipe, usedFoodTypeIds) {
  const types = (recipe.foodTypes || [])
    .map((f) => String((f && f._id) || f))
    .filter(Boolean);
  if (!types.length || !usedFoodTypeIds) return null;
  const clash = types.some((t) => usedFoodTypeIds.has(t));
  return clash ? 0 : 1;
}

/**
 * Score one candidate for one slot.
 *
 * @param recipe   candidate (must already have passed the hard gate)
 * @param ctx      { gate, usageByRecipeId, dayIndex, favouriteIds,
 *                   usedFoodTypeIds }
 * @returns { score, reasons: [{ signal, detail, contribution }] }
 */
function scoreRecipe(recipe, ctx = {}) {
  const { gate, usageByRecipeId, dayIndex = 0, favouriteIds, usedFoodTypeIds } =
    ctx;
  const parts = [];

  const push = (signal, value, weight, detail) => {
    if (value === null || value === undefined) return;
    parts.push({ signal, value, weight, detail });
  };

  if (gate) {
    push(
      "macroFit",
      macroFitScore(recipe, gate),
      WEIGHTS.macroFit,
      "Macros close to this meal's share of your daily target"
    );
    push(
      "calorieFit",
      calorieFitScore(recipe, gate),
      WEIGHTS.calorieFit,
      "Calories close to this meal's share of your daily target"
    );
  }
  push(
    "variety",
    varietyScore(recipe, usageByRecipeId, dayIndex),
    WEIGHTS.variety,
    "Not eaten recently this week"
  );
  push(
    "favourite",
    favouriteScore(recipe, favouriteIds),
    WEIGHTS.favourite,
    "One of your favourites"
  );
  push(
    "foodTypeSpread",
    foodTypeSpreadScore(recipe, usedFoodTypeIds),
    WEIGHTS.foodTypeSpread,
    "Adds variety to the day"
  );

  const totalWeight = parts.reduce((acc, p) => acc + p.weight, 0);
  const score =
    totalWeight === 0
      ? 0
      : parts.reduce((acc, p) => acc + p.value * p.weight, 0) / totalWeight;

  const reasons = parts
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .map((p) => ({
      signal: p.signal,
      detail: p.detail,
      contribution:
        totalWeight === 0
          ? 0
          : Math.round((p.value * p.weight * 1000) / totalWeight) / 1000,
    }));

  return { score, reasons };
}

/**
 * Pick the best candidate from an already-gated pool.
 *
 * @param ctx.rng optional seeded RNG. When supplied, each candidate gets a
 *   small deterministic jitter so near-equal options vary between weeks while
 *   any single week stays reproducible. Without it, selection is purely
 *   deterministic and every week yields the same plan.
 * @returns the winning recipe, or null when the pool is empty
 */
function pickBest(pool, ctx = {}) {
  const { rng } = ctx;
  let best = null;
  let bestScore = -Infinity;
  for (const recipe of pool || []) {
    const { score } = scoreRecipe(recipe, ctx);
    const jittered = rng ? score + rng() * TIEBREAK_JITTER : score;
    if (jittered > bestScore) {
      bestScore = jittered;
      best = recipe;
    }
  }
  return best;
}

module.exports = {
  WEIGHTS,
  VARIETY_WINDOW_DAYS,
  TIEBREAK_JITTER,
  closeness,
  macroFitScore,
  calorieFitScore,
  varietyScore,
  favouriteScore,
  foodTypeSpreadScore,
  scoreRecipe,
  pickBest,
};
