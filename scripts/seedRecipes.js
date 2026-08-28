/**
 * Seed the recipe domain with test content: taxonomy (meal types, diets, food
 * types, allergens, ingredients) plus 20 recipes in English and their Dutch
 * translations, so the meal-plan generator has enough to build a full week.
 *
 * Dry-run by default (prints the plan, mutates nothing).
 * Apply for real:   node scripts/seedRecipes.js --apply
 * Remove seeded recipes: node scripts/seedRecipes.js --teardown --apply
 *
 * Idempotent — re-running upserts by natural key rather than duplicating.
 *
 * Every seeded recipe carries a translationKey prefixed `seed-`, which is what
 * --teardown matches on. Taxonomy is left in place by teardown: meal types are
 * a fixed enum the app needs regardless, and the diets/allergens/ingredients
 * here are real reference data rather than throwaway fixtures.
 *
 * MACRO DESIGN NOTE — the generator gates each slot on
 *     kCalPerPerson       < caloriesPerDay / 4
 *     fat * 9             < fatPerDay / 4
 *     protein * 4         < proteinPerDay / 4
 *     carbohydrate * 4    < carbPerDay / 4
 * (the * 9 / * 4 factors are currently * 0.09 / * 0.04 in the code — a known
 * bug that makes the macro gates ~100x too lenient, see RECOMMENDATION-PLAN.md
 * R2). These recipes are sized to pass the gates BOTH as written today AND once
 * that bug is fixed, so the seed data stays valid either way. For a 2000 kcal
 * customer on the default 25/30/45 split that means staying under roughly
 * 500 kcal, 16g fat, 31g protein, 56g carbs per serving.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const {
  MealType,
  MEAL_TYPE_SLOTS,
} = require("../models/RecipeModels/mealTypeModel");
const { Diet } = require("../models/RecipeModels/dietModel");
const { FoodType } = require("../models/RecipeModels/foodTypeModel");
const { Allergen } = require("../models/RecipeModels/allergenModel");
const { Ingredient } = require("../models/RecipeModels/ingredientModel");
const { Recipe } = require("../models/RecipeModels/recipeModel");

const APPLY = process.argv.includes("--apply");
const TEARDOWN = process.argv.includes("--teardown");
const SEED_PREFIX = "seed-";

// ---------------------------------------------------------------- taxonomy

const DIETS = [
  { en: "Standard", nl: "Standaard" },
  { en: "Vegetarian", nl: "Vegetarisch" },
  { en: "Vegan", nl: "Veganistisch" },
  { en: "Pescatarian", nl: "Pescotarisch" },
  { en: "Gluten Free", nl: "Glutenvrij" },
];

const FOOD_TYPES = [
  { en: "Quick", nl: "Snel" },
  { en: "High Protein", nl: "Eiwitrijk" },
  { en: "Low Carb", nl: "Koolhydraatarm" },
  { en: "Comfort", nl: "Comfort" },
];

const ALLERGENS = [
  { en: "Dairy", nl: "Zuivel" },
  { en: "Gluten", nl: "Gluten" },
  { en: "Eggs", nl: "Eieren" },
  { en: "Fish", nl: "Vis" },
  { en: "Nuts", nl: "Noten" },
  { en: "Soy", nl: "Soja" },
];

// [english, dutch, isPantryStaple, category, defaultUnit]
const INGREDIENTS = [
  ["Oats", "Havermout", false, "Pantry", "g"],
  ["Blueberries", "Blauwe bessen", false, "Produce", "g"],
  ["Greek yogurt", "Griekse yoghurt", false, "Dairy", "g"],
  ["Honey", "Honing", true, "Pantry", "ml"],
  ["Eggs", "Eieren", false, "Dairy", "pieces"],
  ["Wholegrain bread", "Volkorenbrood", false, "Bakery", "g"],
  ["Banana", "Banaan", false, "Produce", "pieces"],
  ["Whey protein", "Wei-eiwit", false, "Pantry", "g"],
  ["Avocado", "Avocado", false, "Produce", "pieces"],
  ["Chicken breast", "Kipfilet", false, "Meat", "g"],
  ["Romaine lettuce", "Romaine sla", false, "Produce", "g"],
  ["Parmesan", "Parmezaan", false, "Dairy", "g"],
  ["Tuna", "Tonijn", false, "Fish", "g"],
  ["Green beans", "Sperziebonen", false, "Produce", "g"],
  ["Red lentils", "Rode linzen", false, "Pantry", "g"],
  ["Turkey slices", "Kalkoenreepjes", false, "Meat", "g"],
  ["Tortilla wrap", "Tortilla wrap", false, "Bakery", "pieces"],
  ["Quinoa", "Quinoa", false, "Pantry", "g"],
  ["Salmon fillet", "Zalmfilet", false, "Fish", "g"],
  ["Broccoli", "Broccoli", false, "Produce", "g"],
  ["Mixed peppers", "Gemengde paprika", false, "Produce", "g"],
  ["Soy sauce", "Sojasaus", true, "Pantry", "ml"],
  ["Minced beef", "Rundergehakt", false, "Meat", "g"],
  ["Kidney beans", "Kidneybonen", false, "Pantry", "g"],
  ["Basmati rice", "Basmatirijst", false, "Pantry", "g"],
  ["Chickpeas", "Kikkererwten", false, "Pantry", "g"],
  ["Cod fillet", "Kabeljauwfilet", false, "Fish", "g"],
  ["Potatoes", "Aardappelen", false, "Produce", "g"],
  ["Apple", "Appel", false, "Produce", "pieces"],
  ["Peanut butter", "Pindakaas", false, "Pantry", "g"],
  ["Cottage cheese", "Hüttenkäse", false, "Dairy", "g"],
  ["Hummus", "Hummus", false, "Deli", "g"],
  ["Carrot", "Wortel", false, "Produce", "g"],
  ["Mixed nuts", "Gemengde noten", false, "Pantry", "g"],
  ["Olive oil", "Olijfolie", true, "Pantry", "ml"],
  ["Salt", "Zout", true, "Pantry", "g"],
  ["Black pepper", "Zwarte peper", true, "Pantry", "g"],
];

// ----------------------------------------------------------------- recipes
// macros: [kcal, protein g, carbohydrate g, fat g, fiber g]

const RECIPES = [
  // ---- breakfast
  {
    key: "oatmeal-berries",
    en: "Oatmeal with Berries",
    nl: "Havermout met Bessen",
    slot: "breakfast",
    macros: [345, 18, 48, 9, 7],
    prepTime: 10,
    diets: ["Standard", "Vegetarian"],
    allergens: [],
    foodTypes: ["Quick"],
    ingredients: [
      ["Oats", { weight: 60 }],
      ["Blueberries", { weight: 80 }],
      ["Honey", { volume: 10 }],
    ],
    steps: [
      "Bring the oats to a simmer with 250 ml water or milk.",
      "Cook for 5 minutes, stirring occasionally.",
      "Top with blueberries and a drizzle of honey.",
    ],
  },
  {
    key: "yogurt-parfait",
    en: "Greek Yogurt Parfait",
    nl: "Griekse Yoghurt Parfait",
    slot: "breakfast",
    macros: [320, 24, 38, 8, 4],
    prepTime: 5,
    diets: ["Standard", "Vegetarian"],
    allergens: ["Dairy"],
    foodTypes: ["Quick", "High Protein"],
    ingredients: [
      ["Greek yogurt", { weight: 200 }],
      ["Blueberries", { weight: 60 }],
      ["Oats", { weight: 30 }],
    ],
    steps: [
      "Spoon half the yogurt into a glass.",
      "Add a layer of oats and berries, then repeat.",
    ],
  },
  {
    key: "eggs-on-toast",
    en: "Scrambled Eggs on Toast",
    nl: "Roerei op Toast",
    slot: "breakfast",
    macros: [334, 22, 30, 14, 5],
    prepTime: 12,
    diets: ["Standard", "Vegetarian"],
    allergens: ["Eggs", "Gluten"],
    foodTypes: ["Quick", "High Protein"],
    ingredients: [
      ["Eggs", { pieces: 3 }],
      ["Wholegrain bread", { weight: 60 }],
      ["Olive oil", { volume: 5 }],
      ["Salt", { weight: 1 }],
    ],
    steps: [
      "Beat the eggs with a pinch of salt.",
      "Cook gently in a non-stick pan, stirring until just set.",
      "Serve on toasted wholegrain bread.",
    ],
  },
  {
    key: "banana-protein-smoothie",
    en: "Banana Protein Smoothie",
    nl: "Banaan Protein Smoothie",
    slot: "breakfast",
    macros: [335, 26, 42, 7, 4],
    prepTime: 5,
    diets: ["Standard", "Vegetarian"],
    allergens: ["Dairy"],
    foodTypes: ["Quick", "High Protein"],
    ingredients: [
      ["Banana", { pieces: 1 }],
      ["Whey protein", { weight: 30 }],
      ["Greek yogurt", { weight: 100 }],
    ],
    steps: ["Blend everything with 200 ml water until smooth."],
  },
  {
    key: "avocado-toast",
    en: "Avocado Toast",
    nl: "Avocado Toast",
    slot: "breakfast",
    macros: [351, 14, 40, 15, 9],
    prepTime: 8,
    diets: ["Standard", "Vegetarian", "Vegan"],
    allergens: ["Gluten"],
    foodTypes: ["Quick"],
    ingredients: [
      ["Avocado", { pieces: 1 }],
      ["Wholegrain bread", { weight: 70 }],
      ["Black pepper", { weight: 1 }],
    ],
    steps: [
      "Toast the bread.",
      "Mash the avocado over it and season with pepper.",
    ],
  },

  // ---- lunch
  {
    key: "chicken-caesar",
    en: "Chicken Caesar Salad",
    nl: "Caesarsalade met Kip",
    slot: "lunch",
    macros: [333, 28, 26, 13, 5],
    prepTime: 20,
    diets: ["Standard"],
    allergens: ["Dairy", "Eggs"],
    foodTypes: ["High Protein", "Low Carb"],
    ingredients: [
      ["Chicken breast", { weight: 120 }],
      ["Romaine lettuce", { weight: 100 }],
      ["Parmesan", { weight: 20 }],
      ["Olive oil", { volume: 10 }],
    ],
    steps: [
      "Grill the chicken until cooked through, then slice.",
      "Toss the lettuce with olive oil and parmesan.",
      "Top with the sliced chicken.",
    ],
  },
  {
    key: "tuna-nicoise",
    en: "Tuna Nicoise Bowl",
    nl: "Tonijn Nicoise Bowl",
    slot: "lunch",
    macros: [344, 27, 32, 12, 6],
    prepTime: 18,
    diets: ["Standard", "Pescatarian"],
    allergens: ["Fish", "Eggs"],
    foodTypes: ["High Protein"],
    ingredients: [
      ["Tuna", { weight: 100 }],
      ["Potatoes", { weight: 120 }],
      ["Green beans", { weight: 80 }],
      ["Eggs", { pieces: 1 }],
    ],
    steps: [
      "Boil the potatoes and green beans until tender.",
      "Soft-boil the egg and halve it.",
      "Arrange in a bowl with the tuna.",
    ],
  },
  {
    key: "lentil-soup",
    en: "Lentil Soup with Bread",
    nl: "Linzensoep met Brood",
    slot: "lunch",
    macros: [344, 18, 50, 8, 12],
    prepTime: 30,
    diets: ["Standard", "Vegetarian", "Vegan"],
    allergens: ["Gluten"],
    foodTypes: ["Comfort"],
    ingredients: [
      ["Red lentils", { weight: 90 }],
      ["Carrot", { weight: 80 }],
      ["Wholegrain bread", { weight: 40 }],
      ["Olive oil", { volume: 5 }],
    ],
    steps: [
      "Soften the carrot in olive oil.",
      "Add the lentils and 500 ml stock, simmer 20 minutes.",
      "Blend to taste and serve with bread.",
    ],
  },
  {
    key: "turkey-wrap",
    en: "Turkey Wrap",
    nl: "Kalkoen Wrap",
    slot: "lunch",
    macros: [370, 26, 44, 10, 6],
    prepTime: 10,
    diets: ["Standard"],
    allergens: ["Gluten"],
    foodTypes: ["Quick", "High Protein"],
    ingredients: [
      ["Turkey slices", { weight: 100 }],
      ["Tortilla wrap", { pieces: 1 }],
      ["Romaine lettuce", { weight: 50 }],
      ["Hummus", { weight: 30 }],
    ],
    steps: [
      "Spread the hummus over the wrap.",
      "Layer the turkey and lettuce, then roll tightly.",
    ],
  },
  {
    key: "quinoa-veg-bowl",
    en: "Quinoa Vegetable Bowl",
    nl: "Quinoa Groentebowl",
    slot: "lunch",
    macros: [371, 16, 52, 11, 10],
    prepTime: 25,
    diets: ["Standard", "Vegetarian", "Vegan", "Gluten Free"],
    allergens: [],
    foodTypes: ["Quick"],
    ingredients: [
      ["Quinoa", { weight: 80 }],
      ["Mixed peppers", { weight: 100 }],
      ["Chickpeas", { weight: 80 }],
      ["Olive oil", { volume: 10 }],
    ],
    steps: [
      "Cook the quinoa according to the packet.",
      "Roast the peppers and chickpeas with olive oil.",
      "Combine and season.",
    ],
  },

  // ---- dinner
  {
    key: "grilled-salmon",
    en: "Grilled Salmon with Vegetables",
    nl: "Gegrilde Zalm met Groenten",
    slot: "dinner",
    macros: [343, 30, 22, 15, 7],
    prepTime: 25,
    diets: ["Standard", "Pescatarian", "Gluten Free"],
    allergens: ["Fish"],
    foodTypes: ["High Protein", "Low Carb"],
    ingredients: [
      ["Salmon fillet", { weight: 130 }],
      ["Broccoli", { weight: 150 }],
      ["Potatoes", { weight: 100 }],
      ["Olive oil", { volume: 5 }],
    ],
    steps: [
      "Grill the salmon 4 minutes per side.",
      "Steam the broccoli and boil the potatoes.",
      "Plate together and season.",
    ],
  },
  {
    key: "chicken-stir-fry",
    en: "Chicken Stir Fry",
    nl: "Kip Roerbak",
    slot: "dinner",
    macros: [366, 29, 40, 10, 6],
    prepTime: 20,
    diets: ["Standard"],
    allergens: ["Soy"],
    foodTypes: ["Quick", "High Protein"],
    ingredients: [
      ["Chicken breast", { weight: 120 }],
      ["Mixed peppers", { weight: 120 }],
      ["Basmati rice", { weight: 70 }],
      ["Soy sauce", { volume: 15 }],
    ],
    steps: [
      "Cook the rice.",
      "Stir-fry the chicken over high heat, then add the peppers.",
      "Finish with soy sauce and serve over rice.",
    ],
  },
  {
    key: "beef-chili",
    en: "Beef Chili",
    nl: "Chili con Carne",
    slot: "dinner",
    macros: [372, 28, 38, 12, 11],
    prepTime: 40,
    diets: ["Standard", "Gluten Free"],
    allergens: [],
    foodTypes: ["Comfort", "High Protein"],
    ingredients: [
      ["Minced beef", { weight: 110 }],
      ["Kidney beans", { weight: 100 }],
      ["Mixed peppers", { weight: 80 }],
      ["Basmati rice", { weight: 50 }],
    ],
    steps: [
      "Brown the mince, then add the peppers.",
      "Add the beans and simmer 25 minutes.",
      "Serve with rice.",
    ],
  },
  {
    key: "veg-curry",
    en: "Vegetable Curry with Rice",
    nl: "Groentecurry met Rijst",
    slot: "dinner",
    macros: [364, 14, 50, 12, 12],
    prepTime: 30,
    diets: ["Standard", "Vegetarian", "Vegan", "Gluten Free"],
    allergens: [],
    foodTypes: ["Comfort"],
    ingredients: [
      ["Chickpeas", { weight: 120 }],
      ["Broccoli", { weight: 100 }],
      ["Basmati rice", { weight: 60 }],
      ["Olive oil", { volume: 10 }],
    ],
    steps: [
      "Fry the spices in oil, add the vegetables.",
      "Add the chickpeas and simmer 15 minutes.",
      "Serve with rice.",
    ],
  },
  {
    key: "baked-cod",
    en: "Baked Cod with Potatoes",
    nl: "Kabeljauw uit de Oven met Aardappelen",
    slot: "dinner",
    macros: [351, 30, 42, 7, 6],
    prepTime: 35,
    diets: ["Standard", "Pescatarian", "Gluten Free"],
    allergens: ["Fish"],
    foodTypes: ["High Protein"],
    ingredients: [
      ["Cod fillet", { weight: 140 }],
      ["Potatoes", { weight: 180 }],
      ["Green beans", { weight: 80 }],
      ["Olive oil", { volume: 5 }],
    ],
    steps: [
      "Roast the potatoes for 25 minutes at 200°C.",
      "Add the cod for the final 12 minutes.",
      "Steam the green beans and serve.",
    ],
  },

  // ---- snacks
  {
    key: "apple-peanut-butter",
    en: "Apple with Peanut Butter",
    nl: "Appel met Pindakaas",
    slot: "morningSnack",
    macros: [240, 8, 25, 12, 5],
    prepTime: 3,
    diets: ["Standard", "Vegetarian", "Vegan", "Gluten Free"],
    allergens: ["Nuts"],
    foodTypes: ["Quick"],
    ingredients: [
      ["Apple", { pieces: 1 }],
      ["Peanut butter", { weight: 20 }],
    ],
    steps: ["Slice the apple and serve with peanut butter."],
  },
  {
    key: "protein-bar",
    en: "Homemade Protein Bar",
    nl: "Zelfgemaakte Proteïnereep",
    slot: "afternoonSnack",
    macros: [240, 18, 24, 8, 4],
    prepTime: 15,
    diets: ["Standard", "Vegetarian"],
    allergens: ["Dairy", "Gluten"],
    foodTypes: ["High Protein", "Quick"],
    ingredients: [
      ["Oats", { weight: 40 }],
      ["Whey protein", { weight: 25 }],
      ["Honey", { volume: 15 }],
    ],
    steps: [
      "Mix everything into a stiff dough.",
      "Press into a tin and chill for an hour, then cut into bars.",
    ],
  },
  {
    key: "cottage-cheese-fruit",
    en: "Cottage Cheese with Fruit",
    nl: "Hüttenkäse met Fruit",
    slot: "morningSnack",
    macros: [197, 20, 18, 5, 3],
    prepTime: 3,
    diets: ["Standard", "Vegetarian", "Gluten Free"],
    allergens: ["Dairy"],
    foodTypes: ["High Protein", "Quick", "Low Carb"],
    ingredients: [
      ["Cottage cheese", { weight: 150 }],
      ["Blueberries", { weight: 60 }],
    ],
    steps: ["Spoon the cottage cheese into a bowl and top with berries."],
  },
  {
    key: "hummus-veg-sticks",
    en: "Hummus with Vegetable Sticks",
    nl: "Hummus met Groentesticks",
    slot: "afternoonSnack",
    macros: [206, 7, 22, 10, 7],
    prepTime: 5,
    diets: ["Standard", "Vegetarian", "Vegan", "Gluten Free"],
    allergens: [],
    foodTypes: ["Quick", "Low Carb"],
    ingredients: [
      ["Hummus", { weight: 60 }],
      ["Carrot", { weight: 100 }],
    ],
    steps: ["Cut the carrot into sticks and serve with hummus."],
  },
  {
    key: "nuts-and-fruit",
    en: "Mixed Nuts and Fruit",
    nl: "Gemengde Noten en Fruit",
    slot: "afternoonSnack",
    macros: [251, 9, 20, 15, 5],
    prepTime: 2,
    diets: ["Standard", "Vegetarian", "Vegan", "Gluten Free"],
    allergens: ["Nuts"],
    foodTypes: ["Quick"],
    ingredients: [
      ["Mixed nuts", { weight: 30 }],
      ["Apple", { pieces: 1 }],
    ],
    steps: ["Combine and serve."],
  },
];

// ------------------------------------------------------------------ helpers

async function upsertTagged(model, label, rows, extraFor) {
  const map = {};
  for (const row of rows) {
    for (const [lang, name] of [
      ["english", row.en],
      ["dutch", row.nl],
    ]) {
      const extra = extraFor ? extraFor(row) : {};
      if (APPLY) {
        const doc = await model.findOneAndUpdate(
          { name, language: lang },
          { $setOnInsert: { name, language: lang, ...extra } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        map[`${lang}:${row.en}`] = doc._id;
      } else {
        map[`${lang}:${row.en}`] = null;
      }
    }
  }
  console.log(`  ${label}: ${rows.length} x 2 languages`);
  return map;
}

async function seed() {
  console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing will be written\n");
  console.log("Taxonomy:");

  // Meal types are a fixed enum with no language dimension.
  const mealTypeIds = {};
  for (const slot of MEAL_TYPE_SLOTS) {
    if (APPLY) {
      const doc = await MealType.findOneAndUpdate(
        { name: slot },
        { $setOnInsert: { name: slot } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      mealTypeIds[slot] = doc._id;
    } else {
      mealTypeIds[slot] = null;
    }
  }
  console.log(`  mealTypes: ${MEAL_TYPE_SLOTS.length} (fixed enum)`);

  const dietIds = await upsertTagged(Diet, "diets", DIETS);
  const foodTypeIds = await upsertTagged(FoodType, "foodTypes", FOOD_TYPES);
  const allergenIds = await upsertTagged(Allergen, "allergens", ALLERGENS);

  const ingredientIds = {};
  for (const [en, nl, staple, category, unit] of INGREDIENTS) {
    for (const [lang, name] of [
      ["english", en],
      ["dutch", nl],
    ]) {
      if (APPLY) {
        const doc = await Ingredient.findOneAndUpdate(
          { name, language: lang },
          {
            $setOnInsert: {
              name,
              language: lang,
              itemType: "ingredient",
              isPantryStaple: staple,
              category,
              defaultUnit: unit,
              isActive: true,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        ingredientIds[`${lang}:${en}`] = doc._id;
      } else {
        ingredientIds[`${lang}:${en}`] = null;
      }
    }
  }
  const stapleCount = INGREDIENTS.filter((i) => i[2]).length;
  console.log(
    `  ingredients: ${INGREDIENTS.length} x 2 languages ` +
      `(${stapleCount} pantry staples, excluded from shopping lists)`
  );

  console.log("\nRecipes:");
  let created = 0;
  let updated = 0;

  for (const r of RECIPES) {
    const [kcal, protein, carbs, fat, fiber] = r.macros;

    for (const lang of ["english", "dutch"]) {
      const name = lang === "english" ? r.en : r.nl;
      const translationKey = `${SEED_PREFIX}${r.key}`;

      if (!APPLY) continue;

      const payload = {
        translationKey,
        language: lang,
        name,
        description: `${name} — seeded test recipe.`,
        prepTime: r.prepTime,
        persons: 1,
        kCalPerPerson: kcal,
        protein,
        carbohydrate: carbs,
        fat,
        fiber,
        mealTypes: [mealTypeIds[r.slot]].filter(Boolean),
        foodTypes: (r.foodTypes || [])
          .map((f) => foodTypeIds[`${lang}:${f}`])
          .filter(Boolean),
        diet: (r.diets || [])
          .map((d) => dietIds[`${lang}:${d}`])
          .filter(Boolean),
        allergens: (r.allergens || [])
          .map((a) => allergenIds[`${lang}:${a}`])
          .filter(Boolean),
        ingredients: (r.ingredients || []).map(([ing, qty]) => ({
          name: ingredientIds[`${lang}:${ing}`],
          ...qty,
          isOptional: false,
          includeInShoppingListByDefault: true,
        })),
        cookingProcess: r.steps,
        isPublic: true,
        adminApproved: true,
        isSupplement: false,
        allowReviews: true,
        allowComments: true,
        rating: 0,
      };

      const existing = await Recipe.findOne({ translationKey, language: lang });
      if (existing) {
        await Recipe.updateOne({ _id: existing._id }, { $set: payload });
        updated++;
      } else {
        await Recipe.create(payload);
        created++;
      }
    }
  }

  const bySlot = MEAL_TYPE_SLOTS.map(
    (s) => `${s}=${RECIPES.filter((r) => r.slot === s).length}`
  ).join("  ");
  console.log(`  ${RECIPES.length} recipes x 2 languages`);
  console.log(`  by slot: ${bySlot}`);

  if (APPLY) {
    console.log(`\n  created: ${created}   updated: ${updated}`);
  } else {
    console.log("\n  (dry run — re-run with --apply to write)");
  }
}

async function teardown() {
  const filter = { translationKey: { $regex: `^${SEED_PREFIX}` } };
  const count = await Recipe.countDocuments(filter);
  console.log(
    APPLY ? "APPLYING TEARDOWN\n" : "DRY RUN — nothing will be deleted\n"
  );
  console.log(`  seeded recipes matched: ${count}`);
  console.log("  (taxonomy is left in place — it is real reference data)");
  if (APPLY) {
    const res = await Recipe.deleteMany(filter);
    console.log(`\n  deleted: ${res.deletedCount}`);
  } else {
    console.log("\n  (dry run — re-run with --apply to delete)");
  }
}

(async () => {
  await connectDB();
  try {
    if (TEARDOWN) await teardown();
    else await seed();
  } catch (e) {
    console.error("\nFailed:", e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
})();
