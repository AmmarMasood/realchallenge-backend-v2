/**
 * Unit tests for meal-plan generation.
 *
 * These cover the pure decision rules — allergen exclusion, diet matching,
 * macro gates, supplement-mode normalisation, slot mapping and the seeded
 * shuffle — without touching the database. They exist because every one of
 * these rules has produced a real defect: an empty week for customers with no
 * diet, macro gates that never bound, and plans nobody could reproduce.
 */
const {
  recipeHasAllergen,
  recipeMatchesDiet,
  fitsGate,
  makeRng,
  shuffle,
  normalizeSupplementOption,
  pinnedRecipeUsable,
  dayPlanToMeals,
  SLOT_KEY_MAP,
  KCAL_PER_G_FAT,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_G_CARB,
} = require("../services/mealPlanService");

const recipe = (over = {}) => ({
  _id: over._id || "r1",
  name: over.name || "Test recipe",
  kCalPerPerson: 0,
  protein: 0,
  carbohydrate: 0,
  fat: 0,
  diet: [],
  allergens: [],
  isPublic: true,
  adminApproved: true,
  isSupplement: false,
  ...over,
});

const named = (names) => names.map((n) => ({ name: n }));

// A 2000 kcal customer on the default 25/30/45 split.
const GATE = { cal: 2000, protein: 500, fat: 600, carb: 900 };

describe("Atwater factors", () => {
  it("converts grams to kilocalories, not hundredths", () => {
    // These were 0.09 / 0.04 — 100x too small — which made every macro gate
    // pass and left the customer's macro split with no effect on their plan.
    expect(KCAL_PER_G_FAT).toBe(9);
    expect(KCAL_PER_G_PROTEIN).toBe(4);
    expect(KCAL_PER_G_CARB).toBe(4);
  });
});

describe("recipeHasAllergen", () => {
  it("excludes a recipe carrying any avoided allergen", () => {
    const r = recipe({ allergens: named(["Dairy", "Gluten"]) });
    expect(recipeHasAllergen(r, ["Gluten"])).toBe(true);
    expect(recipeHasAllergen(r, ["Nuts"])).toBe(false);
  });

  it("allows everything when the customer has no allergies", () => {
    const r = recipe({ allergens: named(["Dairy"]) });
    expect(recipeHasAllergen(r, [])).toBe(false);
    expect(recipeHasAllergen(r, undefined)).toBe(false);
  });

  it("REGRESSION: an allergic customer is never served their allergen", () => {
    // Highest-priority exclusion in the spec. A false negative here serves
    // someone food they are allergic to — this test must never be relaxed.
    const allergies = ["Nuts", "Shellfish"];
    const pool = [
      recipe({ _id: "safe", allergens: named(["Dairy"]) }),
      recipe({ _id: "nuts", allergens: named(["Nuts"]) }),
      recipe({ _id: "shellfish", allergens: named(["Gluten", "Shellfish"]) }),
      recipe({ _id: "clean", allergens: [] }),
    ];
    const served = pool.filter((r) => !recipeHasAllergen(r, allergies));
    expect(served.map((r) => r._id)).toEqual(["safe", "clean"]);
  });

  it("tolerates malformed allergen entries", () => {
    const r = recipe({ allergens: [null, undefined, { name: "Nuts" }] });
    expect(recipeHasAllergen(r, ["Nuts"])).toBe(true);
    expect(recipeHasAllergen(r, ["Dairy"])).toBe(false);
  });
});

describe("recipeMatchesDiet", () => {
  it("requires the recipe to satisfy EVERY diet the customer follows", () => {
    const both = recipe({ diet: named(["Vegetarian", "Gluten Free"]) });
    const one = recipe({ diet: named(["Vegetarian"]) });
    const customer = named(["Vegetarian", "Gluten Free"]);

    expect(recipeMatchesDiet(both, customer)).toBe(true);
    // AND, not OR: satisfying one restriction is not enough.
    expect(recipeMatchesDiet(one, customer)).toBe(false);
  });

  it("REGRESSION: no diet set means no restriction, not an empty week", () => {
    // The old implementation hoisted an `isFound` flag outside the recipe
    // loop; with no diets it stayed false for every recipe and the customer
    // got 7 empty days despite a full pool.
    const pool = [
      recipe({ _id: "a", diet: named(["Vegetarian"]) }),
      recipe({ _id: "b", diet: [] }),
      recipe({ _id: "c", diet: named(["Standard"]) }),
    ];
    const eligible = pool.filter((r) => recipeMatchesDiet(r, []));
    expect(eligible).toHaveLength(3);
  });

  it("excludes a recipe with no diet tags when the customer has one", () => {
    expect(recipeMatchesDiet(recipe({ diet: [] }), named(["Vegan"]))).toBe(
      false
    );
  });
});

describe("fitsGate", () => {
  it("accepts a recipe within a quarter of the day's budget", () => {
    // 350 kcal, 12g fat (108), 25g protein (100), 40g carbs (160)
    const r = recipe({
      kCalPerPerson: 350,
      fat: 12,
      protein: 25,
      carbohydrate: 40,
    });
    expect(fitsGate(r, GATE)).toBe(true);
  });

  it("rejects on calories alone", () => {
    const r = recipe({ kCalPerPerson: 600, fat: 1, protein: 1, carbohydrate: 1 });
    expect(fitsGate(r, GATE)).toBe(false);
  });

  it("rejects on fat alone — the gate the 100x bug disabled", () => {
    // 30g fat = 270 kcal, over the 150 kcal quarter-budget. Under the old
    // 0.09 factor this scored 2.7 and sailed through.
    const r = recipe({
      kCalPerPerson: 300,
      fat: 30,
      protein: 5,
      carbohydrate: 5,
    });
    expect(fitsGate(r, GATE)).toBe(false);
    expect(r.fat * 0.09 < GATE.fat / 4).toBe(true); // the old, broken check
  });

  it("rejects on protein or carbs alone", () => {
    const highProtein = recipe({ kCalPerPerson: 300, protein: 40 });
    const highCarb = recipe({ kCalPerPerson: 300, carbohydrate: 70 });
    expect(fitsGate(highProtein, GATE)).toBe(false);
    expect(fitsGate(highCarb, GATE)).toBe(false);
  });

  it("treats missing macro fields as zero rather than failing", () => {
    expect(fitsGate({ kCalPerPerson: 100 }, GATE)).toBe(true);
  });
});

describe("seeded RNG", () => {
  it("reproduces the same sequence for the same seed", () => {
    const a = makeRng("customer:2026-W34");
    const b = makeRng("customer:2026-W34");
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different seeds, so weeks differ", () => {
    const a = makeRng("customer:2026-W34");
    const b = makeRng("customer:2026-W35");
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("stays within [0, 1)", () => {
    const rng = makeRng("x");
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("makes shuffle reproducible, which plans depend on", () => {
    const base = ["a", "b", "c", "d", "e", "f"];
    const one = [...base];
    const two = [...base];
    shuffle(one, makeRng("seed-1"));
    shuffle(two, makeRng("seed-1"));
    expect(one).toEqual(two);

    const three = [...base];
    shuffle(three, makeRng("seed-2"));
    expect(three).not.toEqual(one);
  });

  it("shuffle preserves every element", () => {
    const arr = [1, 2, 3, 4, 5];
    shuffle(arr, makeRng("s"));
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("normalizeSupplementOption", () => {
  it("maps the values the frontend actually stores", () => {
    expect(normalizeSupplementOption("during-the-day")).toBe("during_day");
    expect(normalizeSupplementOption("extra-meal")).toBe("extra_meal");
    expect(normalizeSupplementOption("none")).toBe("none");
  });

  it("also maps the original spec wording", () => {
    // Every real customer previously fell through to "none" because the code
    // compared against spec prose rather than the stored values.
    expect(normalizeSupplementOption("During the day")).toBe("during_day");
    expect(normalizeSupplementOption("Add as an extra meal")).toBe("extra_meal");
  });

  it("falls back to none for anything unrecognised", () => {
    expect(normalizeSupplementOption("")).toBe("none");
    expect(normalizeSupplementOption(undefined)).toBe("none");
    expect(normalizeSupplementOption("wat")).toBe("none");
  });
});

describe("pinnedRecipeUsable", () => {
  const pinned = (over = {}) =>
    recipe({ isPublic: true, adminApproved: true, isSupplement: false, ...over });

  it("rejects unpublished, unapproved or supplement recipes", () => {
    expect(pinnedRecipeUsable(pinned({ isPublic: false }), [], [])).toBe(false);
    expect(pinnedRecipeUsable(pinned({ adminApproved: false }), [], [])).toBe(
      false
    );
    expect(pinnedRecipeUsable(pinned({ isSupplement: true }), [], [])).toBe(
      false
    );
    expect(pinnedRecipeUsable(null, [], [])).toBe(false);
  });

  it("drops a pin that violates the customer's allergies", () => {
    const r = pinned({ allergens: named(["Nuts"]) });
    expect(pinnedRecipeUsable(r, [], ["Nuts"])).toBe(false);
    expect(pinnedRecipeUsable(r, [], ["Dairy"])).toBe(true);
  });

  it("keeps a pin that matches any of the customer's diets", () => {
    const r = pinned({ diet: named(["Vegetarian"]) });
    expect(pinnedRecipeUsable(r, ["Vegetarian", "Vegan"], [])).toBe(true);
    expect(pinnedRecipeUsable(r, ["Vegan"], [])).toBe(false);
  });
});

describe("dayPlanToMeals", () => {
  it("maps legacy slot keys onto the canonical meal-slot enum", () => {
    const meals = dayPlanToMeals({
      breakfast: { _id: "b" },
      snack1: { _id: "s1" },
      lunch: { _id: "l" },
      snack2: { _id: "s2" },
      dinner: { _id: "d" },
    });
    expect(meals.map((m) => m.meal_slot)).toEqual(
      expect.arrayContaining([
        "breakfast",
        "morningSnack",
        "lunch",
        "afternoonSnack",
        "dinner",
      ])
    );
    expect(meals).toHaveLength(5);
    expect(meals.every((m) => m.source === "generated")).toBe(true);
  });

  it("skips empty slots rather than emitting null recipes", () => {
    const meals = dayPlanToMeals({ breakfast: { _id: "b" }, lunch: null });
    expect(meals).toHaveLength(1);
    expect(meals[0].recipe_id).toBe("b");
  });

  it("ignores supplement-only keys that are not canonical slots", () => {
    // lateMeal / extraMealN / dayMealN are supplement constructs and must not
    // be jammed into the meal_slot enum.
    const meals = dayPlanToMeals({
      breakfast: { _id: "b" },
      lateMeal: { _id: "x" },
      extraMeal1: { _id: "y" },
      dayMeal1: { _id: "z" },
    });
    expect(meals).toHaveLength(1);
    expect(Object.keys(SLOT_KEY_MAP)).not.toContain("lateMeal");
  });
});
