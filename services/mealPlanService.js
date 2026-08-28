/**
 * Meal-plan generation. THE single home for it.
 *
 * Originally extracted from customerDetailsController#recommendedWeeklyDiet
 * while both existed side by side. That legacy endpoint and its inline copy of
 * the algorithm have since been deleted, so there is no longer a second
 * implementation to keep in sync — extend this service rather than adding one.
 *
 * Reached via /api/meal-plan (mealPlanController -> buildWeekPlan).
 */
const { User } = require("../models/UserModels/userModel");
const { Recipe } = require("../models/RecipeModels/recipeModel");
const { WeekPlan } = require("../models/MealPlanModels/weekPlanModel");
const {
  getWeekStart,
  getWeekId,
  getZonedParts,
  WEEKDAY_KEYS,
} = require("../utils/weekTime");
const { pickBest } = require("./recommendation/recipeScoring");

// The frontend stores "none" | "during-the-day" | "extra-meal" (see
// Nutrient.js supplement modal). The original generator compared against
// spec wording ("During the day" / "Add as an extra meal" / "None"), so
// every real customer fell through to the no-supplement branch. Normalize
// both the stored values and the legacy spec wording to one internal enum.
function normalizeSupplementOption(raw) {
  const n = String(raw || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (n === "duringtheday" || n === "fuelmoment") return "during_day";
  if (n === "extrameal" || n === "addasanextrameal") return "extra_meal";
  return "none"; // "", "none", anything unrecognized
}

// Atwater factors: grams of each macro -> kilocalories. Budgets are held in
// kcal (a percentage split of caloriesPerDay), while recipes store grams, so
// every comparison between the two has to convert.
//
// These were previously written as 0.09 / 0.04 — 100x too small — which made
// every macro gate pass trivially: a 15 g fat recipe scored 1.35 against a
// budget of ~160. Only the calorie cap actually constrained a plan, so the
// customer's protein/carb/fat split had no effect on what they were served.
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;

/**
 * Deterministic PRNG (mulberry32) seeded from a string.
 *
 * Plan generation used Math.random(), so the same customer + week + recipe
 * pool produced a different plan on every call: plans could not be reproduced
 * for support ("why did I get this?"), regression-tested, or safely retried.
 * Seeding on customer + week keeps variety ACROSS weeks and between customers
 * while making any single week reproducible.
 */
function makeRng(seedString) {
  let h = 1779033703 ^ String(seedString).length;
  for (let i = 0; i < String(seedString).length; i++) {
    h = Math.imul(h ^ String(seedString).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates driven by the supplied rng, so shuffling is reproducible.
function shuffle(array, rng) {
  const rand = rng || Math.random;
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ── Pure candidate predicates ────────────────────────────────────────────
// Extracted from generateDayPlans so they can be unit-tested without a DB.
// Behaviour is unchanged; these are the rules that decide whether a recipe is
// eligible for a slot, in spec priority order: allergies > diet > macros.

/**
 * True when the recipe carries ANY allergen the customer must avoid.
 * Highest-priority exclusion — a false negative here serves someone food they
 * are allergic to, so it is covered by a permanent regression test.
 */
function recipeHasAllergen(recipe, allergyNames) {
  if (!allergyNames || !allergyNames.length) return false;
  return (recipe.allergens || [])
    .map((a) => a && a.name)
    .some((an) => allergyNames.includes(an));
}

/**
 * True when the recipe satisfies EVERY diet the customer follows. Someone on
 * "Vegetarian" + "Gluten Free" needs recipes that are both, so this is
 * intentionally AND, not OR.
 *
 * `.every()` on an empty list is true, which is the point: no diet set means
 * no dietary restriction. A previous version hoisted an `isFound` flag outside
 * the recipe loop and only assigned it inside the diet loop, so a customer
 * with no diets left it false for every recipe and got a completely empty
 * week — 7 days, zero meals, despite a full recipe pool.
 */
function recipeMatchesDiet(recipe, dietOptions) {
  const recipeDiets = (recipe.diet || []).map((d) => d && d.name);
  return (dietOptions || []).every((myDiet) =>
    recipeDiets.includes(myDiet && myDiet.name)
  );
}

/**
 * True when a recipe fits within a quarter of the day's remaining budget on
 * calories AND every macro. `gate` holds kcal figures; recipe macros are in
 * grams, hence the Atwater conversions.
 */
function fitsGate(recipe, gate) {
  return (
    (recipe.kCalPerPerson || 0) < gate.cal / 4 &&
    (recipe.fat || 0) * KCAL_PER_G_FAT < gate.fat / 4 &&
    (recipe.protein || 0) * KCAL_PER_G_PROTEIN < gate.protein / 4 &&
    (recipe.carbohydrate || 0) * KCAL_PER_G_CARB < gate.carb / 4
  );
}

// Load the populated customer the generator needs (mirrors the controller).
async function loadPlanInputs(customerUserId) {
  return User.findById(customerUserId)
    .select("-passwordHash")
    .populate({
      path: "customerDetails",
      model: "CustomerDetails",
      populate: [
        { path: "myDiet", select: "name -_id" },
        { path: "allergies", select: "name -_id" },
        {
          // _id is required to match per-supplement schedule entries.
          path: "supplementIntake.recipes",
          select: "name kCalPerPerson protein carbohydrate fat",
        },
      ],
    });
}

// A pinned recipe is usable only if it still exists, is public/approved,
// is not a supplement, matches the customer's diet, and contains none of
// the customer's allergens (same rules as generation). Keeps gen +
// applyPins + swap consistent. allergenNames is optional; when omitted, no
// allergen exclusion is applied (back-compat for diet-only callers).
function pinnedRecipeUsable(recipe, dietNames, allergenNames) {
  if (!recipe) return false;
  if (!recipe.isPublic || !recipe.adminApproved || recipe.isSupplement)
    return false;
  if (dietNames && dietNames.length) {
    const rd = (recipe.diet || []).map((d) => d && d.name);
    if (!dietNames.some((dn) => rd.includes(dn))) return false;
  }
  if (allergenNames && allergenNames.length) {
    const ra = (recipe.allergens || []).map((a) => a && a.name);
    // Exclude if the recipe carries ANY allergen the user must avoid.
    if (ra.some((an) => allergenNames.includes(an))) return false;
  }
  return true;
}

/**
 * Resolve VALID, applicable pins for a Next Week plan into a
 * { weekday: { <canonicalSlot>: recipeDoc } } map so generation can
 * reserve their macro budget and place them first (spec §12/§23).
 * Only next_week; just_once honored only for its target week_id.
 * Day pins contribute every locked meal as a pinned slot.
 */
async function resolvePinnedSlots(customerDetailsId, weekId, dietNames, allergenNames) {
  const { PinnedRecipe } = require("../models/MealPlanModels/pinnedRecipeModel");
  const { PinnedDay } = require("../models/MealPlanModels/pinnedDayModel");
  const out = {};
  const applies = (p) =>
    p.mode === "always" || !p.target_week_id || p.target_week_id === weekId;

  const pinPopulate = {
    path: "recipe_id",
    populate: [
      { path: "diet", select: "name -_id" },
      { path: "allergens", select: "name -_id" },
    ],
  };
  const [rPins, dPins] = await Promise.all([
    PinnedRecipe.find({ customer: customerDetailsId, disabled: false })
      .populate(pinPopulate),
    PinnedDay.find({ customer: customerDetailsId, disabled: false })
      .populate({
        path: "locked_meals.recipe_id",
        populate: [
          { path: "diet", select: "name -_id" },
          { path: "allergens", select: "name -_id" },
        ],
      }),
  ]);

  // Day pins win over recipe pins (spec §20) — seed them first.
  for (const dp of dPins) {
    if (!applies(dp)) continue;
    for (const lm of dp.locked_meals || []) {
      const r = lm.recipe_id;
      if (r && pinnedRecipeUsable(r, dietNames, allergenNames)) {
        out[dp.weekday] = out[dp.weekday] || {};
        out[dp.weekday][lm.meal_slot] = r;
      }
    }
  }
  // Recipe pins: always first, then just_once (just_once wins). Skip a
  // slot a day pin already claimed.
  const ordered = rPins
    .filter(applies)
    .sort((a, b) => (a.mode === "always" ? -1 : 1) - (b.mode === "always" ? -1 : 1));
  for (const rp of ordered) {
    const r = rp.recipe_id;
    if (!pinnedRecipeUsable(r, dietNames, allergenNames)) continue;
    out[rp.weekday] = out[rp.weekday] || {};
    out[rp.weekday][rp.meal_slot] = r;
  }
  return out;
}

/**
 * Day-plan generator. Pinned recipes are placed first and their macros
 * reserved from the day budget, then the remaining slots are filled
 * within what's left (spec §12/§23). Returns legacy-shaped dayPlan
 * objects (breakfast/lunch/dinner/snack1/snack2/lateMeal/extra/dayMeal).
 */
// `seed` makes generation reproducible — callers pass something stable for the
// customer + week (see buildWeekPlan). Omitted, it falls back to Math.random()
// so ad-hoc callers still work, just non-deterministically.
async function generateDayPlans(
  customer,
  { language, pinnedSlots, seed } = {}
) {
  const rng = seed ? makeRng(seed) : Math.random;
  const cd = customer.customerDetails;
  const caloriesPerDay_final = cd.caloriesPerDay;
  const fatPerDay_final = (cd.amountOfFat / 100) * caloriesPerDay_final;
  const carbohydratePerDay_final =
    (cd.amountOfCarbohydrate / 100) * caloriesPerDay_final;
  const proteinPerDay_final = (cd.amountOfProtein / 100) * caloriesPerDay_final;
  const dietOptions = cd.myDiet || [];
  // Allergens the user must avoid — the highest-priority filter (spec §12).
  // A recipe carrying ANY of these is dropped before diet/macro bucketing.
  const allergyNames = (cd.allergies || [])
    .map((a) => a && a.name)
    .filter(Boolean);
  const lateMeal = cd.lateMeal;
  const supplements = cd.supplementIntake || { supplementOption: "None", recipes: [] };
  // Fuel Moment replaces a user-chosen snack; legacy snack keys are
  // snack1=morningSnack, snack2=afternoonSnack (see SLOT_KEY_MAP).
  const fuelMomentSlot = supplements.fuelMomentSlot || null;
  const fuelMomentKey =
    fuelMomentSlot === "afternoonSnack"
      ? "snack2"
      : fuelMomentSlot === "morningSnack"
      ? "snack1"
      : null;
  // Per-supplement day scheduling. Map recipeId -> {everyDay, days}.
  // A supplement with no schedule entry defaults to every day.
  const scheduleMap = {};
  for (const s of supplements.schedule || []) {
    if (s && s.recipe)
      scheduleMap[String(s.recipe)] = {
        everyDay: s.everyDay !== false,
        days: s.days || [],
      };
  }
  // Day-loop index (1..7) maps to this weekday order (matches buildWeekPlan).
  const WEEK_ORDER = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const isSupplementScheduled = (recipe, weekday) => {
    const sc = scheduleMap[String(recipe._id)];
    if (!sc || sc.everyDay) return true;
    return (sc.days || []).includes(weekday);
  };

  const recipeFilter = {
    isPublic: true,
    adminApproved: true,
    isSupplement: { $ne: true },
  };
  if (language) recipeFilter.language = language;

  const recipes = await Recipe.find(recipeFilter)
    .populate("ingredients.name")
    .populate({ path: "diet", model: "Diet", select: "name -_id" })
    .populate({ path: "allergens", model: "Allergen", select: "name -_id" })
    .populate({ path: "mealTypes", model: "MealType", select: "name -_id" });

  const weeklyDietPlan = [];
  if (!recipes || !recipes.length) return weeklyDietPlan;

  // Scoring inputs. Favourites are a signal, not a filter — a favourite that
  // blows the macro budget still gets gated out.
  const favouriteIds = (cd.favouriteRecipes || []).map((r) =>
    String((r && r._id) || r)
  );
  // recipe id -> most recent day index it was placed on, so the variety signal
  // can push repeats apart across the week rather than only within a day.
  const usageByRecipeId = {};

  const breakfastRecipes = [];
  const lunchRecipes = [];
  const dinnerRecipes = [];
  const snackRecipes = [];

  for (const recipe of recipes) {
    // Allergen exclusion runs first (spec §12: allergies > diet > macros).
    if (recipeHasAllergen(recipe, allergyNames)) continue;

    const matchesDiet = recipeMatchesDiet(recipe, dietOptions);

    if (matchesDiet) {
      for (const mt of recipe.mealTypes || []) {
        const slot = mt && mt.name;
        if (slot === "breakfast") breakfastRecipes.push(recipe);
        else if (slot === "morningSnack" || slot === "afternoonSnack")
          snackRecipes.push(recipe);
        else if (slot === "lunch") lunchRecipes.push(recipe);
        else if (slot === "dinner") dinnerRecipes.push(recipe);
      }
    }
  }

  for (let i = 1; i <= 7; i++) {
    const dayPlan = {};
    let caloriesPerDay = caloriesPerDay_final;
    let fatPerDay = fatPerDay_final;
    let carbohydratePerDay = carbohydratePerDay_final;
    let proteinPerDay = proteinPerDay_final;

    const weekday = WEEK_ORDER[i - 1];
    let dayMealCount = 0;
    let extraMealCount = 0;
    const suppMode = normalizeSupplementOption(supplements.supplementOption);
    const dayMeal = suppMode === "during_day";
    const extraMeal = suppMode === "extra_meal";
    const noMeal = suppMode === "none";

    if (suppMode !== "none") {
      // Only this weekday's scheduled supplements count (and only their
      // macros are deducted on days they don't appear).
      const daySupps = (supplements.recipes || []).filter((r) =>
        isSupplementScheduled(r, weekday)
      );
      let fuelPlaced = false;
      for (const recipe of daySupps) {
        caloriesPerDay -= recipe.kCalPerPerson;
        fatPerDay -= recipe.fat * KCAL_PER_G_FAT;
        carbohydratePerDay -= recipe.carbohydrate * KCAL_PER_G_CARB;
        proteinPerDay -= recipe.protein * KCAL_PER_G_PROTEIN;
        if (dayMeal) {
          // Fuel Moment: the first scheduled supplement replaces the
          // user-chosen snack slot; extras fall back to dayMealN.
          if (fuelMomentKey && !fuelPlaced) {
            dayPlan[fuelMomentKey] = recipe;
            fuelPlaced = true;
          } else {
            dayMealCount++;
            if (dayMealCount <= 4) dayPlan[`dayMeal${dayMealCount}`] = recipe;
          }
        } else if (extraMeal) {
          extraMealCount++;
          if (extraMealCount <= 4) dayPlan[`extraMeal${extraMealCount}`] = recipe;
        }
      }
    }

    // ---- Linear, pin-aware slot fill (replaces the legacy nested
    // bail-loop). Pinned recipes are placed FIRST and their macros
    // reserved, so the remaining slots are generated within what's left
    // — keeping day totals on target even with pins (spec §12/§23).
    const dayPins = (pinnedSlots && pinnedSlots[weekday]) || {};
    // canonical pin slot -> legacy dayPlan key
    const PIN_TO_KEY = {
      breakfast: "breakfast",
      lunch: "lunch",
      dinner: "dinner",
      morningSnack: "snack1",
      afternoonSnack: "snack2",
    };

    // Gate budget = post-supplement budget minus reserved pinned macros,
    // so generated meals are sized against what pins leave behind.
    let gateCal = caloriesPerDay;
    let gateFat = fatPerDay;
    let gateCarb = carbohydratePerDay;
    let gatePro = proteinPerDay;
    for (const canonical of Object.keys(dayPins)) {
      const r = dayPins[canonical];
      gateCal -= r.kCalPerPerson || 0;
      gateFat -= (r.fat || 0) * KCAL_PER_G_FAT;
      gateCarb -= (r.carbohydrate || 0) * KCAL_PER_G_CARB;
      gatePro -= (r.protein || 0) * KCAL_PER_G_PROTEIN;
    }

    const usedIds = new Set();
    // Food types already placed today — feeds the spread signal so a day is
    // not three near-identical meals. Per-day, unlike usageByRecipeId.
    const usedFoodTypeIds = new Set();
    const fillOrder = [
      ["breakfast", breakfastRecipes, "breakfast"],
      ["lunch", lunchRecipes, "lunch"],
      ["dinner", dinnerRecipes, "dinner"],
    ];
    // Snacks: generated only for none / extra-meal modes (during-the-day
    // uses the Fuel Moment supplement instead, already placed above).
    if (noMeal || extraMeal) {
      fillOrder.push(["snack1", snackRecipes, "morningSnack"]);
      fillOrder.push(["snack2", snackRecipes, "afternoonSnack"]);
    }
    if (lateMeal) fillOrder.push(["lateMeal", snackRecipes, null]);

    for (const [key, pool, canonical] of fillOrder) {
      // A Fuel Moment supplement may already own this snack slot.
      if (dayPlan[key]) continue;
      // 1) Pinned slot: place the user's pin, no gate (explicit choice);
      //    its macros were already reserved from the gate budget.
      const pinned = canonical && dayPins[canonical];
      if (pinned) {
        dayPlan[key] = pinned;
        usedIds.add(String(pinned._id));
        continue;
      }
      // 2) Generate. The gate is a HARD filter — a recipe must fit what's left
      //    of the day's budget — but among those that fit we now pick the BEST
      //    rather than the first. Previously any eligible recipe was as good as
      //    any other, so a recipe landing exactly on the macro target ranked
      //    the same as one scraping under the calorie cap.
      const gate = {
        cal: gateCal,
        fat: gateFat,
        protein: gatePro,
        carb: gateCarb,
      };
      const eligible = (pool || []).filter(
        (r) => !usedIds.has(String(r._id)) && fitsGate(r, gate)
      );
      const pick = pickBest(eligible, {
        gate,
        usageByRecipeId,
        dayIndex: i,
        favouriteIds,
        usedFoodTypeIds,
        // Seeded — keeps this week reproducible while letting near-equal
        // candidates differ from week to week.
        rng,
      });
      if (pick) {
        dayPlan[key] = pick;
        usedIds.add(String(pick._id));
        usageByRecipeId[String(pick._id)] = i;
        for (const ft of pick.foodTypes || []) {
          usedFoodTypeIds.add(String((ft && ft._id) || ft));
        }
      }
    }

    weeklyDietPlan.push(JSON.parse(JSON.stringify(dayPlan)));
    shuffle(breakfastRecipes, rng);
    shuffle(lunchRecipes, rng);
    shuffle(dinnerRecipes, rng);
    shuffle(snackRecipes, rng);
  }

  return weeklyDietPlan;
}

// Legacy dayPlan key -> canonical meal-slot enum. Non-canonical extras
// (lateMeal / extraMealN / dayMealN) are supplement constructs handled
// properly in Phase 4 — flagged here, not jammed into the enum.
const SLOT_KEY_MAP = {
  breakfast: "breakfast",
  snack1: "morningSnack",
  lunch: "lunch",
  snack2: "afternoonSnack",
  dinner: "dinner",
};

function dayPlanToMeals(dayPlan) {
  const meals = [];
  for (const [legacyKey, slot] of Object.entries(SLOT_KEY_MAP)) {
    const r = dayPlan[legacyKey];
    if (r && r._id) {
      meals.push({ meal_slot: slot, recipe_id: r._id, source: "generated", lock_type: null });
    }
  }
  return meals;
}

function hasExtraSupplementSlot(dayPlan) {
  return Object.keys(dayPlan).some(
    (k) => k === "lateMeal" || k.startsWith("extraMeal") || k.startsWith("dayMeal")
  );
}

/**
 * Build (not persist) a WeekPlan document for a customer/week.
 * @param tz user's IANA timezone (GMT fallback handled by weekTime).
 */
async function buildWeekPlan({ customerUserId, customerDetailsId, type, status, refDate = new Date(), tz, language }) {
  const customer = await loadPlanInputs(customerUserId);
  const start = getWeekStart(refDate, tz);
  const week_id = getWeekId(refDate, tz);

  // Pins apply only to Next Week. Resolve VALID applicable pins up front
  // so generation can reserve their macro budget and place them first
  // (spec §12/§23). For next_week, week_id here equals getNextWeekId(now)
  // because the caller passes refDate = now + 7d.
  let pinnedSlots;
  if (type === "next_week") {
    const dietNames = ((customer.customerDetails || {}).myDiet || []).map(
      (d) => d && d.name
    );
    const allergenNames = ((customer.customerDetails || {}).allergies || [])
      .map((a) => a && a.name)
      .filter(Boolean);
    pinnedSlots = await resolvePinnedSlots(
      customerDetailsId,
      week_id,
      dietNames,
      allergenNames
    );
  }
  // Seed on customer + week so a given week is reproducible, while different
  // weeks (and different customers) still get different plans.
  const dayPlans = await generateDayPlans(customer, {
    language,
    pinnedSlots,
    seed: `${customerDetailsId}:${week_id}`,
  });

  const ends_at = new Date(start);
  ends_at.setUTCDate(ends_at.getUTCDate() + 6);

  // Client decision (2026-05-16): for This Week, days that are already in
  // the past relative to the user's local "today" render as EMPTY faded
  // read-only placeholders — not a backfilled generated plan. Compare each
  // day's UTC-anchored date against today's UTC-anchored date in user tz.
  const tp = getZonedParts(new Date(), tz);
  const todayAnchor = Date.UTC(tp.year, tp.month - 1, tp.day);

  const days = WEEKDAY_KEYS.slice(1).concat(WEEKDAY_KEYS[0]).map((weekday, idx) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + idx);
    const dp = dayPlans[idx] || {};
    const isPastThisWeekDay =
      type === "this_week" && date.getTime() < todayAnchor;
    return {
      weekday,
      date,
      is_day_pinned: false,
      day_pin_id: null,
      has_extra_supplement_slot: isPastThisWeekDay
        ? false
        : hasExtraSupplementSlot(dp),
      meals: isPastThisWeekDay ? [] : dayPlanToMeals(dp),
    };
  });

  return {
    customer: customerDetailsId,
    week_id,
    type,
    status,
    starts_at: start,
    ends_at,
    shopping_sync_status: "not_added",
    days,
  };
}

// Upsert a WeekPlan (one per customer+week_id+type). Strip _id so updating
// an existing doc doesn't try to modify the immutable _id field.
async function upsertWeekPlan(planDoc) {
  const { _id, ...rest } = planDoc || {};
  return WeekPlan.findOneAndUpdate(
    { customer: rest.customer, week_id: rest.week_id, type: rest.type },
    rest,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = {
  // Pure helpers — exported primarily so they can be unit-tested without a DB.
  recipeHasAllergen,
  recipeMatchesDiet,
  fitsGate,
  makeRng,
  shuffle,
  KCAL_PER_G_FAT,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_G_CARB,

  normalizeSupplementOption,
  loadPlanInputs,
  generateDayPlans,
  buildWeekPlan,
  upsertWeekPlan,
  dayPlanToMeals,
  pinnedRecipeUsable,
  SLOT_KEY_MAP,
};
