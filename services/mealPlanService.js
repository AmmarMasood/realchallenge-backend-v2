/**
 * Meal-plan generation, extracted verbatim (behavior-preserving) from
 * customerDetailsController#recommendedWeeklyDiet so the new WeekPlan /
 * lifecycle layer and the legacy endpoint share one algorithm.
 *
 * Phase 1: this service is the single home for generation. The legacy
 * controller still has its own inline copy and will be re-pointed here in
 * Phase 2 (after output is verified against the dev DB), to avoid
 * destabilizing the flow the client is currently testing.
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

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
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
async function generateDayPlans(customer, { language, pinnedSlots } = {}) {
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

  const breakfastRecipes = [];
  const lunchRecipes = [];
  const dinnerRecipes = [];
  const snackRecipes = [];

  let isFound = false;
  for (const recipe of recipes) {
    // Allergen exclusion runs first (spec §12: allergies > diet > macros).
    if (allergyNames.length) {
      const ra = (recipe.allergens || []).map((a) => a && a.name);
      if (ra.some((an) => allergyNames.includes(an))) continue;
    }
    for (const myDiet of dietOptions) {
      isFound = false;
      for (const diet of recipe.diet) {
        if (myDiet.name == diet.name) {
          isFound = true;
          break;
        }
      }
      if (!isFound) break;
    }
    if (isFound) {
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
        fatPerDay -= recipe.fat * 0.09;
        carbohydratePerDay -= recipe.carbohydrate * 0.04;
        proteinPerDay -= recipe.protein * 0.04;
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
      gateFat -= (r.fat || 0) * 0.09;
      gateCarb -= (r.carbohydrate || 0) * 0.04;
      gatePro -= (r.protein || 0) * 0.04;
    }

    const usedIds = new Set();
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
      // 2) Generate: first pool recipe that fits the per-slot gate and
      //    isn't already used today.
      const pick = (pool || []).find(
        (r) =>
          !usedIds.has(String(r._id)) &&
          (r.kCalPerPerson || 0) < gateCal / 4 &&
          (r.fat || 0) * 0.09 < gateFat / 4 &&
          (r.protein || 0) * 0.04 < gatePro / 4 &&
          (r.carbohydrate || 0) * 0.04 < gateCarb / 4
      );
      if (pick) {
        dayPlan[key] = pick;
        usedIds.add(String(pick._id));
      }
    }

    weeklyDietPlan.push(JSON.parse(JSON.stringify(dayPlan)));
    shuffle(breakfastRecipes);
    shuffle(lunchRecipes);
    shuffle(dinnerRecipes);
    shuffle(snackRecipes);
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
  const dayPlans = await generateDayPlans(customer, { language, pinnedSlots });

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
  normalizeSupplementOption,
  loadPlanInputs,
  generateDayPlans,
  buildWeekPlan,
  upsertWeekPlan,
  dayPlanToMeals,
  pinnedRecipeUsable,
  SLOT_KEY_MAP,
};
