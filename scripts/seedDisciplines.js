/**
 * Seed the canonical Discipline vocabulary — the list customers pick interests
 * from and challenges are tagged with. Run this once after a DB wipe, BEFORE
 * any content is entered, so everything is tagged against the same taxonomy.
 *
 * Dry-run by default:  node scripts/seedDisciplines.js
 * Apply:               node scripts/seedDisciplines.js --apply
 *
 * Idempotent — upserts by slug, so re-running adds new entries and fills in
 * missing translations without duplicating.
 *
 * This list is a starting point. It is CONTENT: the client should confirm or
 * replace it before real challenges are tagged.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const {
  Discipline,
} = require("../models/DisciplineModels/disciplineModel");

const APPLY = process.argv.includes("--apply");

// slug, English name, Dutch name
const DISCIPLINES = [
  ["boxing", "Boxing", "Boksen"],
  ["strength", "Strength", "Kracht"],
  ["hiit", "HIIT", "HIIT"],
  ["yoga", "Yoga", "Yoga"],
  ["cardio", "Cardio", "Cardio"],
  ["pilates", "Pilates", "Pilates"],
  ["bootcamp", "Bootcamp", "Bootcamp"],
  ["mobility", "Mobility", "Mobiliteit"],
  ["running", "Running", "Hardlopen"],
  ["core", "Core", "Core"],
];

(async () => {
  await connectDB();
  console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing written\n");

  let created = 0;
  let updated = 0;

  for (let i = 0; i < DISCIPLINES.length; i++) {
    const [slug, en, nl] = DISCIPLINES[i];
    if (!APPLY) {
      console.log(`  ${slug.padEnd(10)} en="${en}"  nl="${nl}"`);
      continue;
    }

    const existing = await Discipline.findOne({ slug });
    if (existing) {
      // Fill gaps rather than overwrite — an admin may have renamed one.
      let touched = false;
      for (const [lang, name] of [
        ["english", en],
        ["dutch", nl],
      ]) {
        if (!(existing.translations || []).some((t) => t.language === lang)) {
          existing.translations.push({ language: lang, name });
          touched = true;
        }
      }
      if (existing.sortOrder !== i) {
        existing.sortOrder = i;
        touched = true;
      }
      if (touched) {
        await existing.save();
        updated++;
      }
    } else {
      await Discipline.create({
        slug,
        name: en,
        sortOrder: i,
        isActive: true,
        translations: [
          { language: "english", name: en },
          { language: "dutch", name: nl },
        ],
      });
      created++;
    }
  }

  console.log(`\n  disciplines: ${DISCIPLINES.length}`);
  if (APPLY) console.log(`  created: ${created}   updated: ${updated}`);
  else console.log("  (re-run with --apply to write)");

  await mongoose.connection.close();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
