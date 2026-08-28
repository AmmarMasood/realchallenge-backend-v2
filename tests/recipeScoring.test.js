/**
 * Unit tests for recipe slot scoring.
 *
 * These assert RELATIVE ordering rather than absolute scores, so tuning a
 * weight does not break the suite unless it actually changes which recipe
 * gets picked.
 */
const {
  WEIGHTS,
  VARIETY_WINDOW_DAYS,
  closeness,
  macroFitScore,
  calorieFitScore,
  varietyScore,
  favouriteScore,
  foodTypeSpreadScore,
  scoreRecipe,
  pickBest,
} = require("../services/recommendation/recipeScoring");
const { makeRng } = require("../services/mealPlanService");

// A 2000 kcal day on the 25/30/45 split, nothing consumed yet.
// Slot target is a quarter of each: 125 kcal protein, 150 fat, 225 carbs, 500 kcal.
const GATE = { cal: 2000, protein: 500, fat: 600, carb: 900 };

const recipe = (over = {}) => ({
  _id: over._id || "r1",
  name: over.name || "Recipe",
  kCalPerPerson: 0,
  protein: 0,
  carbohydrate: 0,
  fat: 0,
  foodTypes: [],
  ...over,
});

describe("closeness", () => {
  it("is 1 on target and falls off in both directions", () => {
    expect(closeness(100, 100)).toBe(1);
    expect(closeness(50, 100)).toBeCloseTo(0.5);
    expect(closeness(150, 100)).toBeCloseTo(0.5);
  });

  it("floors at 0 rather than going negative", () => {
    expect(closeness(500, 100)).toBe(0);
    expect(closeness(0, 100)).toBe(0);
  });

  it("returns null when there is no meaningful target", () => {
    expect(closeness(50, 0)).toBeNull();
    expect(closeness(50, undefined)).toBeNull();
  });
});

describe("macroFitScore", () => {
  it("scores a recipe on the slot target higher than one far from it", () => {
    // targets: fat 150 kcal (16.7g), protein 125 (31.3g), carbs 225 (56.3g)
    const onTarget = recipe({ fat: 16.7, protein: 31, carbohydrate: 56 });
    const lopsided = recipe({ fat: 2, protein: 2, carbohydrate: 5 });
    expect(macroFitScore(onTarget, GATE)).toBeGreaterThan(
      macroFitScore(lopsided, GATE)
    );
  });

  it("averages the macros so one wild value cannot dominate", () => {
    const twoGoodOneBad = recipe({ fat: 16.7, protein: 31, carbohydrate: 0 });
    const allBad = recipe({ fat: 0, protein: 0, carbohydrate: 0 });
    expect(macroFitScore(twoGoodOneBad, GATE)).toBeGreaterThan(
      macroFitScore(allBad, GATE)
    );
  });
});

describe("calorieFitScore", () => {
  it("prefers a recipe near the slot's calorie share", () => {
    const near = recipe({ kCalPerPerson: 500 }); // target = 2000/4
    const low = recipe({ kCalPerPerson: 120 });
    expect(calorieFitScore(near, GATE)).toBeGreaterThan(
      calorieFitScore(low, GATE)
    );
  });
});

describe("varietyScore", () => {
  it("gives an unused recipe the maximum", () => {
    expect(varietyScore(recipe({ _id: "a" }), {}, 3)).toBe(1);
  });

  it("penalises a recipe used on the same day", () => {
    expect(varietyScore(recipe({ _id: "a" }), { a: 3 }, 3)).toBe(0);
  });

  it("recovers monotonically as days pass", () => {
    // Deliberately expressed relative to VARIETY_WINDOW_DAYS rather than
    // hardcoding gaps — tuning the window should not break this test, only a
    // change in the SHAPE of the recovery should.
    const day = VARIETY_WINDOW_DAYS + 1;
    const scores = [1, 2, 3].map((gap) =>
      varietyScore(recipe({ _id: "a" }), { a: day - gap }, day)
    );
    expect(scores[1]).toBeGreaterThan(scores[0]);
    expect(scores[2]).toBeGreaterThan(scores[1]);
  });

  it("is fully recovered once a whole window has passed", () => {
    const day = VARIETY_WINDOW_DAYS;
    expect(varietyScore(recipe({ _id: "a" }), { a: 0 }, day)).toBe(1);
  });

  it("keeps discriminating across a full week, so rotation doesn't stall", () => {
    // A window shorter than the plan makes every older recipe score a flat 1,
    // so least-recently-used candidates tie and the plan settles into a short
    // repeating cycle (a 3-day window produced day 1 == day 4 == day 7).
    expect(VARIETY_WINDOW_DAYS).toBeGreaterThanOrEqual(7);
  });

  it("is skipped when no usage history is supplied", () => {
    expect(varietyScore(recipe(), undefined, 1)).toBeNull();
  });
});

describe("favouriteScore", () => {
  it("marks favourites and non-favourites", () => {
    expect(favouriteScore(recipe({ _id: "a" }), ["a", "b"])).toBe(1);
    expect(favouriteScore(recipe({ _id: "c" }), ["a", "b"])).toBe(0);
  });

  it("is skipped when the customer has no favourites", () => {
    expect(favouriteScore(recipe({ _id: "a" }), [])).toBeNull();
  });
});

describe("foodTypeSpreadScore", () => {
  it("penalises repeating a food type already used today", () => {
    const r = recipe({ foodTypes: [{ _id: "quick" }] });
    expect(foodTypeSpreadScore(r, new Set(["quick"]))).toBe(0);
    expect(foodTypeSpreadScore(r, new Set(["comfort"]))).toBe(1);
  });

  it("is skipped when the recipe has no food types", () => {
    expect(foodTypeSpreadScore(recipe(), new Set(["quick"]))).toBeNull();
  });
});

describe("scoreRecipe", () => {
  it("normalises over available signals, so a missing one is not a zero", () => {
    // Only macro + calorie signals available; both perfect -> full score.
    const perfect = recipe({
      kCalPerPerson: 500,
      fat: 150 / 9,
      protein: 125 / 4,
      carbohydrate: 225 / 4,
    });
    const { score } = scoreRecipe(perfect, { gate: GATE });
    expect(score).toBeCloseTo(1, 5);
  });

  it("reports only contributing signals, strongest first", () => {
    const r = recipe({
      _id: "a",
      kCalPerPerson: 500,
      fat: 16.7,
      protein: 31,
      carbohydrate: 56,
    });
    const { reasons } = scoreRecipe(r, {
      gate: GATE,
      usageByRecipeId: {},
      dayIndex: 1,
    });
    expect(reasons[0].signal).toBe("macroFit");
    expect(reasons.map((x) => x.signal)).toContain("variety");
    for (let i = 1; i < reasons.length; i++) {
      expect(reasons[i - 1].contribution).toBeGreaterThanOrEqual(
        reasons[i].contribution
      );
    }
  });

  it("scores zero without throwing when nothing is known", () => {
    expect(scoreRecipe(recipe(), {}).score).toBe(0);
  });
});

describe("pickBest", () => {
  const ctx = { gate: GATE, usageByRecipeId: {}, dayIndex: 1 };

  it("picks the best fit, not the first that fits", () => {
    // This is the whole point of the change: previously `pool[0]` won simply
    // by being first in a shuffled array.
    const pool = [
      recipe({ _id: "scraper", kCalPerPerson: 60, fat: 1, protein: 1, carbohydrate: 2 }),
      recipe({ _id: "onTarget", kCalPerPerson: 500, fat: 16.7, protein: 31, carbohydrate: 56 }),
    ];
    expect(pickBest(pool, ctx)._id).toBe("onTarget");
  });

  it("prefers an unused recipe over an identical one eaten yesterday", () => {
    const shape = { kCalPerPerson: 500, fat: 16.7, protein: 31, carbohydrate: 56 };
    const pool = [
      recipe({ _id: "recent", ...shape }),
      recipe({ _id: "fresh", ...shape }),
    ];
    const picked = pickBest(pool, {
      gate: GATE,
      usageByRecipeId: { recent: 3 },
      dayIndex: 3,
    });
    expect(picked._id).toBe("fresh");
  });

  it("prefers a favourite when everything else is equal", () => {
    const shape = { kCalPerPerson: 500, fat: 16.7, protein: 31, carbohydrate: 56 };
    const pool = [
      recipe({ _id: "plain", ...shape }),
      recipe({ _id: "loved", ...shape }),
    ];
    const picked = pickBest(pool, {
      gate: GATE,
      usageByRecipeId: {},
      dayIndex: 1,
      favouriteIds: ["loved"],
    });
    expect(picked._id).toBe("loved");
  });

  it("keeps pool order on an exact tie, preserving seeded variety", () => {
    const shape = { kCalPerPerson: 500, fat: 16.7, protein: 31, carbohydrate: 56 };
    const a = recipe({ _id: "a", ...shape });
    const b = recipe({ _id: "b", ...shape });
    expect(pickBest([a, b], ctx)._id).toBe("a");
    expect(pickBest([b, a], ctx)._id).toBe("b");
  });

  it("returns null for an empty pool", () => {
    expect(pickBest([], ctx)).toBeNull();
    expect(pickBest(undefined, ctx)).toBeNull();
  });

  it("REGRESSION: a seeded rng keeps near-equal picks varying between weeks", () => {
    // Scoring is deterministic, so without a jitter the seed became
    // irrelevant and every week produced an identical plan — silently undoing
    // the week-to-week variety the seeded shuffle was added for.
    const near = (id, kcal) =>
      recipe({ _id: id, kCalPerPerson: kcal, fat: 16.7, protein: 31, carbohydrate: 56 });
    const pool = [near("a", 495), near("b", 500), near("c", 505)];

    const withSeed = (seed) => {
      const rng = makeRng(seed);
      return pickBest(pool, { ...ctx, rng })._id;
    };

    const weekA = withSeed("cust:2026-W34");
    const weekB = withSeed("cust:2026-W35");
    // Same seed must reproduce...
    expect(withSeed("cust:2026-W34")).toBe(weekA);
    // ...and across many weeks the pick must not be constant.
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => withSeed(`cust:2026-W${i}`))
    );
    expect(picks.size).toBeGreaterThan(1);
    expect(typeof weekB).toBe("string");
  });

  it("jitter cannot promote a clearly worse recipe", () => {
    // The jitter is small by design: it reorders near-ties, never overrides a
    // real difference in fit.
    const good = recipe({ _id: "good", kCalPerPerson: 500, fat: 16.7, protein: 31, carbohydrate: 56 });
    const bad = recipe({ _id: "bad", kCalPerPerson: 40, fat: 0.5, protein: 1, carbohydrate: 1 });
    for (let i = 0; i < 50; i++) {
      const rng = makeRng(`seed-${i}`);
      expect(pickBest([bad, good], { ...ctx, rng })._id).toBe("good");
    }
  });

  it("macro fit outweighs favourites — nutrition is the point of the plan", () => {
    const pool = [
      recipe({ _id: "lovedButWrong", kCalPerPerson: 80, fat: 1, protein: 1, carbohydrate: 2 }),
      recipe({ _id: "rightSize", kCalPerPerson: 500, fat: 16.7, protein: 31, carbohydrate: 56 }),
    ];
    const picked = pickBest(pool, {
      gate: GATE,
      usageByRecipeId: {},
      dayIndex: 1,
      favouriteIds: ["lovedButWrong"],
    });
    expect(picked._id).toBe("rightSize");
    expect(WEIGHTS.macroFit).toBeGreaterThan(WEIGHTS.favourite);
  });
});
