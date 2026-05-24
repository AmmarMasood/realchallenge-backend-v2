/**
 * Shopping-list aggregation (client 2026-05-16):
 *  - aggregate by itemId + unit (never display name, never cross-unit)
 *  - shopping = derived plan data + user overrides, rebuildable
 *  - sync preserves manual adds, checked state, qty edits, deletions
 *  - a previously-deleted item needed again is NOT silently re-added —
 *    it is returned as a prompt for the user to decide
 */
const { ShoppingList } = require("../models/MealPlanModels/shoppingListModel");
const { Recipe } = require("../models/RecipeModels/recipeModel");

// One recipe row -> line items. A row contributes one line per quantity
// field that is set (g/ml/pieces). Rows flagged not-included-by-default
// are skipped; optionality is carried through for display.
function recipeToLineItems(recipe) {
  const out = [];
  // Ingredient quantities are stored for the recipe's serving count
  // (recipe.persons). Scale to a single serving for the shopping list
  // (Tightening §C1). persons missing / <=1 → no-op.
  const persons =
    recipe.persons && recipe.persons > 1 ? recipe.persons : 1;
  for (const ing of recipe.ingredients || []) {
    if (ing.includeInShoppingListByDefault === false) continue;
    if (!ing.name) continue;
    const itemId = ing.name._id || ing.name;
    const triples = [
      ["g", ing.weight],
      ["ml", ing.volume],
      ["pieces", ing.pieces],
    ];
    for (const [unit, qty] of triples) {
      if (qty && qty > 0) {
        out.push({
          itemId: String(itemId),
          unit,
          quantity: qty / persons,
          isOptional: !!ing.isOptional,
          isSupplement:
            (ing.name && ing.name.itemType === "supplement") || false,
        });
      }
    }
  }
  return out;
}

// Aggregate line items by itemId+unit.
function aggregate(lineItems) {
  const map = new Map();
  for (const li of lineItems) {
    const key = `${li.itemId}|${li.unit}`;
    const cur = map.get(key);
    if (cur) cur.quantity += li.quantity;
    else map.set(key, { ...li });
  }
  return [...map.values()];
}

async function getOrCreateList(customerDetailsId) {
  let list = await ShoppingList.findOne({ customer: customerDetailsId });
  if (!list)
    list = await ShoppingList.create({ customer: customerDetailsId, items: [] });
  return list;
}

function findItem(list, itemId, unit) {
  return list.items.find(
    (i) => String(i.itemId) === String(itemId) && i.unit === unit
  );
}

// Recipe-level add (allowed in This Week AND Next Week).
async function addRecipe(customerDetailsId, recipeId) {
  const recipe = await Recipe.findById(recipeId).populate(
    "ingredients.name"
  );
  if (!recipe) return { error: "Recipe not found" };
  const list = await getOrCreateList(customerDetailsId);
  const agg = aggregate(recipeToLineItems(recipe));
  const prompt = [];
  let pushedCount = 0;
  let mergedCount = 0;
  // Pre-build itemId -> name map from the populated recipe ingredients
  // so the "previously removed" prompt rows carry a human-readable name.
  const nameById = {};
  for (const ing of recipe.ingredients || []) {
    if (ing.name && ing.name._id) {
      nameById[String(ing.name._id)] = ing.name.name;
    }
  }

  for (const li of agg) {
    const existing = findItem(list, li.itemId, li.unit);
    if (existing) {
      if (existing.removedByUser) {
        // Don't silently bring back a user-deleted item.
        prompt.push({
          itemId: li.itemId,
          name: nameById[li.itemId] || null,
          unit: li.unit,
          quantity: li.quantity,
        });
        continue;
      }
      if (!existing.userEdited) {
        existing.quantity += li.quantity;
        mergedCount++;
      }
    } else {
      list.items.push({ ...li, source: "plan" });
      pushedCount++;
    }
  }
  // Track the recipe in selectedRecipes for the FE "Selected Recipes"
  // header. Only when the recipe actually contributed something — a recipe
  // with zero qty-bearing ingredients shouldn't sit in the chip row. Dedupe
  // — adding the same recipe twice is a no-op here.
  list.selectedRecipes = list.selectedRecipes || [];
  if (
    agg.length > 0 &&
    !list.selectedRecipes.some(
      (rid) => String(rid && (rid._id || rid)) === String(recipe._id)
    )
  ) {
    list.selectedRecipes.push(recipe._id);
  }
  await list.save();
  // Populate item names so the FE has display-ready data without an
  // extra round-trip to GET shopping-list. Mongoose 5.x requires
  // execPopulate() on doc instances.
  await list
    .populate("items.itemId", "name itemType")
    .populate("selectedRecipes", "name")
    .execPopulate();
  // emittedCount = how many line items this recipe contributed before
  // pin/dedupe (0 indicates the recipe has no shopping-listable
  // ingredients — likely missing qty in the data).
  return {
    list,
    prompt,
    added: { pushed: pushedCount, merged: mergedCount, emitted: agg.length },
  };
}

// Full-week sync (Next Week only — enforced by the controller). Rebuilds
// the plan-derived portion while preserving every user override.
async function syncWeek(customerDetailsId, weekPlan) {
  const recipeIds = [];
  for (const day of weekPlan.days || [])
    for (const meal of day.meals || [])
      if (meal.recipe_id) recipeIds.push(meal.recipe_id);
  const recipes = await Recipe.find({ _id: { $in: recipeIds } }).populate(
    "ingredients.name"
  );
  const desired = aggregate(recipes.flatMap(recipeToLineItems));

  // itemId -> name map across all populated week recipes for prompt rows.
  const nameById = {};
  for (const r of recipes) {
    for (const ing of r.ingredients || []) {
      if (ing.name && ing.name._id) {
        nameById[String(ing.name._id)] = ing.name.name;
      }
    }
  }

  const list = await getOrCreateList(customerDetailsId);
  const prompt = [];
  const desiredKeys = new Set();

  for (const li of desired) {
    desiredKeys.add(`${li.itemId}|${li.unit}`);
    const existing = findItem(list, li.itemId, li.unit);
    if (!existing) {
      list.items.push({ ...li, source: "plan" });
    } else if (existing.removedByUser) {
      prompt.push({
        itemId: li.itemId,
        name: nameById[li.itemId] || null,
        unit: li.unit,
        quantity: li.quantity,
      });
    } else if (!existing.userEdited) {
      existing.quantity = li.quantity; // refresh derived qty
      existing.isOptional = li.isOptional;
    }
    // userEdited items: leave quantity untouched.
  }

  // Plan items no longer needed and not user-owned/edited → drop them.
  list.items = list.items.filter((i) => {
    if (i.source === "user" || i.userEdited || i.removedByUser) return true;
    return desiredKeys.has(`${String(i.itemId)}|${i.unit}`);
  });

  // syncWeek owns the full set — replace selectedRecipes wholesale,
  // deduped (the same recipe can fill multiple slots in a week).
  const uniqueRecipeIds = [
    ...new Map(recipeIds.map((r) => [String(r), r])).values(),
  ];
  list.selectedRecipes = uniqueRecipeIds;
  list.lastSyncedWeekId = weekPlan.week_id;
  await list.save();
  await list
    .populate("items.itemId", "name itemType")
    .populate("selectedRecipes", "name")
    .execPopulate();
  return { list, prompt };
}

// Remove a recipe from the shopping list: re-derive its line items and
// subtract their quantities from existing items, dropping any item that
// reaches <= 0. Preserves user-edited rows untouched (they're owned by
// the user, not by recipe attribution). Also pulls the recipe id out of
// selectedRecipes so the chip disappears.
async function removeRecipe(customerDetailsId, recipeId) {
  const recipe = await Recipe.findById(recipeId).populate("ingredients.name");
  if (!recipe) return { error: "Recipe not found" };
  const list = await getOrCreateList(customerDetailsId);
  const agg = aggregate(recipeToLineItems(recipe));

  for (const li of agg) {
    const idx = list.items.findIndex(
      (i) => String(i.itemId) === String(li.itemId) && i.unit === li.unit
    );
    if (idx < 0) continue;
    const existing = list.items[idx];
    if (existing.userEdited) continue; // user-owned qty — leave alone
    const newQty = (existing.quantity || 0) - li.quantity;
    if (newQty <= 0) {
      list.items.splice(idx, 1);
    } else {
      existing.quantity = newQty;
    }
  }

  list.selectedRecipes = (list.selectedRecipes || []).filter(
    (rid) => String(rid && (rid._id || rid)) !== String(recipe._id)
  );

  await list.save();
  await list
    .populate("items.itemId", "name itemType")
    .populate("selectedRecipes", "name")
    .execPopulate();
  return { list };
}

module.exports = {
  recipeToLineItems,
  aggregate,
  addRecipe,
  syncWeek,
  removeRecipe,
};
