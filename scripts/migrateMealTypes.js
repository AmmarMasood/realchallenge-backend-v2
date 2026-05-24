/**
 * One-time migration: collapse legacy free-text MealType docs onto the
 * fixed canonical slot enum, remap every Recipe.mealTypes reference, then
 * delete the legacy docs.
 *
 * Dry-run by default (prints the plan, mutates nothing).
 * Apply for real:   node scripts/migrateMealTypes.js --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { MealType, MEAL_TYPE_SLOTS } = require("../models/RecipeModels/mealTypeModel");
const { Recipe } = require("../models/RecipeModels/recipeModel");

const APPLY = process.argv.includes("--apply");

// Legacy free-text name -> canonical slot key.
// Bare "snack" is ambiguous; we default it to morningSnack and log every hit
// so it can be corrected in the admin UI afterwards.
function normalize(rawName) {
  const n = String(rawName || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (n === "breakfast") return "breakfast";
  if (n === "lunch") return "lunch";
  if (n === "dinner" || n === "diner" || n === "diiner") return "dinner";
  if (n === "morningsnack") return "morningSnack";
  if (n === "afternoonsnack" || n === "latesnack") return "afternoonSnack";
  if (n === "snack") return { slot: "morningSnack", ambiguous: true };
  if (n === "mealtypedutch") return { drop: true }; // junk test data — strip & delete
  return null; // unknown — leave untouched, do not delete
}

async function run() {
  await connectDB();
  console.log(`\n=== MealType migration (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // 1. Ensure the 5 canonical docs exist.
  const existing = await MealType.find({}).lean();
  const present = new Set(existing.map((m) => m.name));
  const missing = MEAL_TYPE_SLOTS.filter((s) => !present.has(s));
  if (missing.length) {
    console.log(`Seeding missing canonical slots: ${missing.join(", ")}`);
    if (APPLY) await MealType.insertMany(missing.map((name) => ({ name })));
  }
  const canonicalDocs = APPLY
    ? await MealType.find({ name: { $in: MEAL_TYPE_SLOTS } }).lean()
    : [...existing, ...missing.map((name) => ({ name, _id: `(new:${name})` }))];
  const canonicalIdByName = {};
  for (const d of canonicalDocs) canonicalIdByName[d.name] = d._id;

  // 2. Identify legacy docs (name not in the enum).
  const legacyDocs = existing.filter((m) => !MEAL_TYPE_SLOTS.includes(m.name));
  if (!legacyDocs.length) {
    console.log("No legacy MealType docs found. Nothing to remap.\n");
    return mongoose.disconnect();
  }

  const remap = {};        // legacyIdStr -> canonicalId
  const dropIds = new Set(); // legacyIdStr -> strip from recipes & delete doc
  const unresolved = [];   // legacy docs we won't touch
  for (const doc of legacyDocs) {
    const res = normalize(doc.name);
    if (!res) {
      unresolved.push(doc);
      continue;
    }
    if (res.drop) {
      console.log(`DROP       "${doc.name}" -> removed from recipes & deleted`);
      dropIds.add(String(doc._id));
      continue;
    }
    const slot = typeof res === "string" ? res : res.slot;
    if (res.ambiguous) {
      console.log(`AMBIGUOUS  "${doc.name}" -> ${slot} (defaulted; verify in admin UI)`);
    } else {
      console.log(`map        "${doc.name}" -> ${slot}`);
    }
    remap[String(doc._id)] = canonicalIdByName[slot];
  }
  if (unresolved.length) {
    console.log(
      `\nUNRESOLVED (left as-is, NOT deleted): ${unresolved
        .map((d) => `"${d.name}"`)
        .join(", ")}`
    );
  }

  // 3. Remap Recipe.mealTypes references.
  const legacyIdSet = new Set(Object.keys(remap));
  const affected = await Recipe.find({
    mealTypes: { $in: legacyDocs.map((d) => d._id) },
  })
    .select("_id name mealTypes")
    .lean();

  console.log(`\nRecipes referencing a legacy MealType: ${affected.length}`);
  let recipesChanged = 0;
  for (const r of affected) {
    const next = [];
    const seen = new Set();
    for (const mtId of r.mealTypes || []) {
      const key = String(mtId);
      if (dropIds.has(key)) continue; // strip dropped junk refs entirely
      const mapped = legacyIdSet.has(key) ? remap[key] : mtId;
      const mappedKey = String(mapped);
      if (seen.has(mappedKey)) continue; // dedupe collisions
      seen.add(mappedKey);
      next.push(mapped);
    }
    recipesChanged++;
    if (APPLY) {
      await Recipe.updateOne({ _id: r._id }, { $set: { mealTypes: next } });
    }
  }
  console.log(`Recipes ${APPLY ? "updated" : "that would update"}: ${recipesChanged}`);

  // 4. Delete the legacy docs we remapped or explicitly dropped.
  const deletableIds = legacyDocs
    .filter((d) => remap[String(d._id)] || dropIds.has(String(d._id)))
    .map((d) => d._id);
  console.log(
    `Legacy MealType docs ${APPLY ? "deleted" : "to delete"}: ${deletableIds.length}` +
      (unresolved.length ? ` (keeping ${unresolved.length} unresolved)` : "")
  );
  if (APPLY && deletableIds.length) {
    await MealType.deleteMany({ _id: { $in: deletableIds } });
  }

  console.log(
    `\n=== Done (${APPLY ? "changes applied" : "dry-run, nothing changed"}) ===\n`
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
