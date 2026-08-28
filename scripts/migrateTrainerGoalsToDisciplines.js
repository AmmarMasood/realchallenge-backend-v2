/**
 * One-time migration: move the discipline vocabulary out of `TrainerGoal` and
 * into the canonical `Discipline` collection.
 *
 * Dry-run by default (prints the plan, mutates nothing).
 * Apply for real:   node scripts/migrateTrainerGoalsToDisciplines.js --apply
 *
 * BACKGROUND
 * ----------
 * `TrainerGoal` has a required `trainerId`, so "Boxing" existed once PER
 * TRAINER — and separately per language. Both `customerDetails.fitnessInterests`
 * and `challenge.trainersFitnessInterest` referenced those documents by
 * ObjectId, so the recommender's discipline join only worked while every
 * picker happened to resolve to the same duplicate. Two trainers naming the
 * same discipline, or a customer browsing in Dutch, silently broke it.
 *
 * WHAT THIS DOES
 * --------------
 * 1. Groups legacy TrainerGoal docs by slugified name (so "Boxing", "boxing"
 *    and Dutch "Boksen" listed under the same trainer collapse correctly —
 *    matching is by slug of the ENGLISH name; Dutch-only names become their
 *    own discipline and should be merged by hand afterwards, which is
 *    reported below).
 * 2. Creates a Discipline per group (or reuses one that already exists).
 * 3. Rewrites every reference on Challenge.trainersFitnessInterest and
 *    CustomerDetails.fitnessInterests from the old TrainerGoal id to the new
 *    Discipline id.
 * 4. Converts each legacy TrainerGoal into a pure join row (trainerId +
 *    discipline), de-duplicating per trainer.
 *
 * Idempotent: re-running finds everything already migrated and does nothing.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { TrainerGoal } = require("../models/UserModels/trainerGoalModel");
const {
  Discipline,
} = require("../models/DisciplineModels/disciplineModel");
const { Challenges } = require("../models/ChallengeModels/challengesModel");
const {
  CustomerDetails,
} = require("../models/UserModels/customerDetailsModel");

const APPLY = process.argv.includes("--apply");

const toSlug = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

(async () => {
  await connectDB();
  console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing will be written\n");

  const legacy = await TrainerGoal.find({
    $or: [{ discipline: { $exists: false } }, { discipline: null }],
  }).lean();

  console.log(`legacy TrainerGoal docs (no discipline ref): ${legacy.length}`);
  if (legacy.length === 0) {
    console.log("Nothing to migrate.");
    await mongoose.connection.close();
    return;
  }

  // --- 1. group by slug
  const groups = new Map(); // slug -> { name, language, icon, ids[] }
  for (const g of legacy) {
    const slug = toSlug(g.name);
    if (!slug) continue;
    if (!groups.has(slug)) {
      groups.set(slug, {
        slug,
        name: String(g.name).trim(),
        icon: g.icon || "",
        entries: [],
      });
    }
    groups.get(slug).entries.push(g);
  }

  console.log(`distinct discipline names: ${groups.size}\n`);

  const idMap = new Map(); // old TrainerGoal id -> Discipline id
  const nonEnglish = [];

  for (const [slug, grp] of groups) {
    const langs = [
      ...new Set(grp.entries.map((e) => e.language).filter(Boolean)),
    ];
    const trainers = [
      ...new Set(grp.entries.map((e) => String(e.trainerId))),
    ];
    console.log(
      `  ${slug.padEnd(14)} docs=${String(grp.entries.length).padEnd(3)}` +
        ` trainers=${String(trainers.length).padEnd(3)} langs=[${langs.join(",")}]`
    );
    if (langs.length && !langs.includes("english")) nonEnglish.push(slug);

    if (!APPLY) continue;

    let disc = await Discipline.findOne({ slug });
    if (!disc) {
      disc = await Discipline.create({
        slug,
        name: grp.name,
        icon: grp.icon,
        translations: grp.entries
          .filter((e) => e.language && e.name)
          .map((e) => ({ language: e.language, name: String(e.name).trim() }))
          // one translation per language
          .filter(
            (t, i, arr) =>
              arr.findIndex((x) => x.language === t.language) === i
          ),
      });
    }
    for (const e of grp.entries) idMap.set(String(e._id), disc._id);
  }

  if (nonEnglish.length) {
    console.log(
      `\n  NOTE: ${nonEnglish.length} discipline(s) had no English name and` +
        ` became their own entry — review and merge by hand: ${nonEnglish.join(", ")}`
    );
  }

  if (!APPLY) {
    console.log("\n(re-run with --apply to migrate)");
    await mongoose.connection.close();
    return;
  }

  // --- 2. rewrite references
  let challengesTouched = 0;
  const challenges = await Challenges.find({
    trainersFitnessInterest: { $exists: true, $ne: [] },
  }).select("trainersFitnessInterest");
  for (const c of challenges) {
    const next = (c.trainersFitnessInterest || []).map(
      (id) => idMap.get(String(id)) || id
    );
    const deduped = [...new Set(next.map(String))].map(
      (s) => new mongoose.Types.ObjectId(s)
    );
    if (
      JSON.stringify(deduped.map(String)) !==
      JSON.stringify((c.trainersFitnessInterest || []).map(String))
    ) {
      c.trainersFitnessInterest = deduped;
      await c.save();
      challengesTouched++;
    }
  }

  let customersTouched = 0;
  const customers = await CustomerDetails.find({
    fitnessInterests: { $exists: true, $ne: [] },
  }).select("fitnessInterests");
  for (const cd of customers) {
    const next = (cd.fitnessInterests || []).map(
      (id) => idMap.get(String(id)) || id
    );
    const deduped = [...new Set(next.map(String))].map(
      (s) => new mongoose.Types.ObjectId(s)
    );
    if (
      JSON.stringify(deduped.map(String)) !==
      JSON.stringify((cd.fitnessInterests || []).map(String))
    ) {
      cd.fitnessInterests = deduped;
      await cd.save();
      customersTouched++;
    }
  }

  // --- 3. convert legacy docs into join rows, de-duplicated per trainer
  let linksKept = 0;
  let linksDropped = 0;
  const seenPair = new Set();
  for (const g of legacy) {
    const discId = idMap.get(String(g._id));
    if (!discId) continue;
    const key = `${g.trainerId}:${discId}`;
    if (seenPair.has(key)) {
      await TrainerGoal.deleteOne({ _id: g._id });
      linksDropped++;
      continue;
    }
    seenPair.add(key);
    await TrainerGoal.updateOne(
      { _id: g._id },
      {
        $set: { discipline: discId },
        $unset: { name: "", language: "", icon: "" },
      }
    );
    linksKept++;
  }

  console.log("\n--- applied ---");
  console.log("disciplines now:      ", await Discipline.countDocuments({}));
  console.log("challenges rewritten: ", challengesTouched);
  console.log("customers rewritten:  ", customersTouched);
  console.log("join rows kept:       ", linksKept);
  console.log("duplicate rows removed:", linksDropped);

  await mongoose.connection.close();
})().catch((e) => {
  console.error("\nFailed:", e.message);
  process.exit(1);
});
