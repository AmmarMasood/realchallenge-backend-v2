/**
 * Seed challenge content for exercising the recommendation engine: disciplines
 * (TrainerGoal), body-focus areas, and 12 challenges in English + Dutch.
 *
 * Dry-run by default (prints the plan, mutates nothing).
 * Apply:            node scripts/seedChallenges.js --apply
 * Teardown:         node scripts/seedChallenges.js --teardown --apply
 * Link a customer:  node scripts/seedChallenges.js --apply --link-customer=<userId>
 *
 * Idempotent — upserts by natural key rather than duplicating.
 * Seeded challenges carry a translationKey prefixed `seed-`, which is what
 * --teardown matches on.
 *
 * The data is shaped to make each scoring behaviour observable:
 *
 *   - EN/NL pairs share a translationKey        → language filter + dedupe
 *   - challenges across all three goal slugs    → goal hard-filter, off-goal fallback
 *   - varied discipline tags                    → the primary ranking signal (weight 40)
 *   - Easy/Medium/Hard spread                   → intensity signal
 *   - one 5.0-with-a-single-review challenge    → rating confidence damping
 *   - one isPublic:false, one adminApproved:false → draft exclusion
 *
 * --link-customer sets fitnessInterests to [Boxing, HIIT] and preferredIntensity
 * to [Hard] on the given customer, which makes the expected ranking checkable:
 * "Boxing Burn" (tagged exactly Boxing+HIIT) should top the list.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { User } = require("../models/UserModels/userModel");
const {
  CustomerDetails,
} = require("../models/UserModels/customerDetailsModel");
const { TrainerGoal } = require("../models/UserModels/trainerGoalModel");
const {
  Discipline,
} = require("../models/DisciplineModels/disciplineModel");
const { Body } = require("../models/ChallengeModels/bodyModel");
const { Challenges } = require("../models/ChallengeModels/challengesModel");

const APPLY = process.argv.includes("--apply");
const TEARDOWN = process.argv.includes("--teardown");
const LINK_ARG = process.argv.find((a) => a.startsWith("--link-customer="));
const LINK_CUSTOMER = LINK_ARG ? LINK_ARG.split("=")[1] : null;
const SEED_PREFIX = "seed-";

// Cover image for every seeded challenge. `thumbnailLink` is the field the
// cards and the detail-page hero both read (it accepts a plain URL — nothing
// prepends a media base to it).
const COVER_IMAGE =
  "https://di4g2xj8fh8y9.cloudfront.net/6a715cf07ce2a2ea5ef86e49/c2bb0cad-8a52-4e36-8ac0-1fcd49221cb5_grok-image-a2530daf-b92e-404f-9b77-09842c5a2e5f.png";

const DISCIPLINES = [
  { en: "Boxing", nl: "Boksen" },
  { en: "Strength", nl: "Kracht" },
  { en: "HIIT", nl: "HIIT" },
  { en: "Yoga", nl: "Yoga" },
  { en: "Cardio", nl: "Cardio" },
  { en: "Pilates", nl: "Pilates" },
];

const BODY_AREAS = [
  { en: "Full Body", nl: "Hele Lichaam" },
  { en: "Core", nl: "Core" },
  { en: "Upper Body", nl: "Bovenlichaam" },
  { en: "Lower Body", nl: "Onderlichaam" },
];

// reviewCount drives the rating-confidence damping; the scorer needs ~5 reviews
// before a rating counts at full value.
const CHALLENGES = [
  // ---- goal: lose-weight (the seeded customer's goal)
  {
    key: "fat-burn-bootcamp",
    en: "Fat Burn Bootcamp",
    nl: "Vetverbranding Bootcamp",
    goal: "lose-weight",
    intensity: "Hard",
    disciplines: ["HIIT", "Cardio"],
    body: ["Full Body"],
    rating: 4.8,
    reviewCount: 12,
    duration: 28,
    price: 29.95,
  },
  {
    key: "lean-in-30",
    en: "Lean in 30",
    nl: "Slank in 30",
    goal: "lose-weight",
    intensity: "Medium",
    disciplines: ["Cardio"],
    body: ["Full Body"],
    rating: 4.2,
    reviewCount: 8,
    duration: 30,
    price: 24.95,
  },
  {
    key: "morning-cardio-kickstart",
    en: "Morning Cardio Kickstart",
    nl: "Ochtend Cardio Kickstart",
    goal: "lose-weight",
    intensity: "Easy",
    disciplines: ["Cardio"],
    body: ["Full Body"],
    rating: 5.0,
    reviewCount: 1, // deliberately: perfect score, almost no evidence
    duration: 14,
    price: 14.95,
  },
  {
    key: "boxing-burn",
    en: "Boxing Burn",
    nl: "Boks Burn",
    goal: "lose-weight",
    intensity: "Hard",
    disciplines: ["Boxing", "HIIT"], // exact match for the linked customer
    body: ["Upper Body"],
    rating: 4.5,
    reviewCount: 20,
    duration: 21,
    price: 27.5,
  },
  {
    key: "yoga-weight-loss",
    en: "Yoga for Weight Loss",
    nl: "Yoga voor Gewichtsverlies",
    goal: "lose-weight",
    intensity: "Easy",
    disciplines: ["Yoga"],
    body: ["Core"],
    rating: 4.0,
    reviewCount: 5,
    duration: 28,
    price: 19.95,
  },
  {
    key: "unpublished-shred",
    en: "Unpublished Shred",
    nl: "Ongepubliceerde Shred",
    goal: "lose-weight",
    intensity: "Medium",
    disciplines: ["HIIT"],
    body: ["Full Body"],
    rating: 4.9,
    reviewCount: 30,
    duration: 21,
    price: 22.0,
    isPublic: false, // must never be recommended
  },
  {
    key: "unapproved-slim",
    en: "Unapproved Slim",
    nl: "Niet-goedgekeurde Slim",
    goal: "lose-weight",
    intensity: "Medium",
    disciplines: ["Cardio"],
    body: ["Full Body"],
    rating: 4.9,
    reviewCount: 25,
    duration: 21,
    price: 22.0,
    adminApproved: false, // must never be recommended
  },

  // ---- goal: gain-muscle
  {
    key: "strength-foundations",
    en: "Strength Foundations",
    nl: "Kracht Fundament",
    goal: "gain-muscle",
    intensity: "Medium",
    disciplines: ["Strength"],
    body: ["Upper Body"],
    rating: 4.6,
    reviewCount: 15,
    duration: 42,
    price: 34.95,
  },
  {
    key: "power-lifting-basics",
    en: "Power Lifting Basics",
    nl: "Powerlifting Basis",
    goal: "gain-muscle",
    intensity: "Hard",
    disciplines: ["Strength"],
    body: ["Full Body"],
    rating: 4.4,
    reviewCount: 10,
    duration: 56,
    price: 39.95,
  },

  // ---- goal: get-fit
  {
    key: "total-fitness-reset",
    en: "Total Fitness Reset",
    nl: "Totale Fitness Reset",
    goal: "get-fit",
    intensity: "Medium",
    disciplines: ["HIIT", "Strength", "Cardio"],
    body: ["Full Body"],
    rating: 4.3,
    reviewCount: 9,
    duration: 28,
    price: 29.95,
  },
  {
    key: "pilates-core-flow",
    en: "Pilates Core Flow",
    nl: "Pilates Core Flow",
    goal: "get-fit",
    intensity: "Easy",
    disciplines: ["Pilates", "Yoga"],
    body: ["Core"],
    rating: 4.7,
    reviewCount: 11,
    duration: 21,
    price: 19.95,
  },
  {
    key: "everyday-movement",
    en: "Everyday Movement",
    nl: "Dagelijkse Beweging",
    goal: "get-fit",
    intensity: "Easy",
    disciplines: ["Yoga"],
    body: ["Full Body"],
    rating: 3.9,
    reviewCount: 6,
    duration: 14,
    price: 12.95,
  },
];

function buildReviews(count, targetRating, userId) {
  // Ratings that average to targetRating, so the denormalised `rating` field
  // and reviews.length stay consistent with each other.
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      name: `Seed reviewer ${i + 1}`,
      rating: targetRating,
      comment: "Seeded review.",
      user: userId,
    });
  }
  return out;
}

async function seed() {
  console.log(APPLY ? "APPLYING\n" : "DRY RUN — nothing will be written\n");

  const trainer = await User.findOne({ roles: "trainer" }).select("_id").lean();
  const admin = await User.findOne({ roles: "admin" }).select("_id").lean();
  if (!trainer && !admin) {
    throw new Error("No trainer or admin user to attach challenges to.");
  }
  const trainerId = (trainer || admin)._id;
  const reviewerId = (admin || trainer)._id;
  console.log(`Trainer for challenges: ${trainerId}`);

  // --- disciplines: resolve from the canonical Discipline collection (run
  // scripts/seedDisciplines.js first). One document per concept, so a single
  // id serves both languages — which is the whole point of the taxonomy.
  const discIds = {};
  for (const d of DISCIPLINES) {
    const slug = d.en.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const doc = await Discipline.findOne({ slug }).select("_id").lean();
    if (!doc) {
      throw new Error(
        `Discipline "${d.en}" (${slug}) not found — run scripts/seedDisciplines.js --apply first.`
      );
    }
    discIds[d.en] = doc._id;
    // Link the seed trainer to it, so the trainer profile shows specialities.
    if (APPLY) {
      await TrainerGoal.findOneAndUpdate(
        { trainerId, discipline: doc._id },
        { $setOnInsert: { trainerId, discipline: doc._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }
  console.log(
    `  disciplines: ${DISCIPLINES.length} resolved (language-independent)`
  );

  // --- body focus
  const bodyIds = {};
  for (const b of BODY_AREAS) {
    for (const [lang, name] of [
      ["english", b.en],
      ["dutch", b.nl],
    ]) {
      if (APPLY) {
        const doc = await Body.findOneAndUpdate(
          { name, language: lang },
          { $setOnInsert: { name, language: lang } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        bodyIds[`${lang}:${b.en}`] = doc._id;
      } else {
        bodyIds[`${lang}:${b.en}`] = null;
      }
    }
  }
  console.log(`  bodyFocus: ${BODY_AREAS.length} x 2 languages`);

  // --- challenges
  let created = 0;
  let updated = 0;
  for (const c of CHALLENGES) {
    for (const lang of ["english", "dutch"]) {
      if (!APPLY) continue;
      const name = lang === "english" ? c.en : c.nl;
      const translationKey = `${SEED_PREFIX}${c.key}`;

      const payload = {
        translationKey,
        language: lang,
        challengeName: name,
        description: `${name} — seeded test challenge.`,
        thumbnailLink: COVER_IMAGE,
        price: c.price,
        currency: "EUR",
        points: 100,
        trainers: [trainerId],
        challengeGoals: [c.goal],
        intensity: c.intensity,
        body: (c.body || []).map((b) => bodyIds[`${lang}:${b}`]).filter(Boolean),
        trainersFitnessInterest: (c.disciplines || [])
          .map((d) => discIds[d])
          .filter(Boolean),
        duration: c.duration,
        rating: c.rating,
        reviews: buildReviews(c.reviewCount, c.rating, reviewerId),
        isPublic: c.isPublic !== undefined ? c.isPublic : true,
        adminApproved:
          c.adminApproved !== undefined ? c.adminApproved : true,
        allowReviews: true,
        allowComments: true,
      };

      const existing = await Challenges.findOne({ translationKey, language: lang });
      if (existing) {
        await Challenges.updateOne({ _id: existing._id }, { $set: payload });
        updated++;
      } else {
        await Challenges.create(payload);
        created++;
      }
    }
  }

  const published = CHALLENGES.filter(
    (c) => c.isPublic !== false && c.adminApproved !== false
  ).length;
  const byGoal = ["lose-weight", "gain-muscle", "get-fit"]
    .map((g) => `${g}=${CHALLENGES.filter((c) => c.goal === g).length}`)
    .join("  ");

  console.log(`\nChallenges: ${CHALLENGES.length} x 2 languages`);
  console.log(`  by goal: ${byGoal}`);
  console.log(
    `  published: ${published}   hidden (draft/unapproved): ${
      CHALLENGES.length - published
    }`
  );

  if (APPLY) console.log(`\n  created: ${created}   updated: ${updated}`);
  else console.log("\n  (dry run — re-run with --apply to write)");

  // --- optionally give a customer interests so ranking has data
  if (LINK_CUSTOMER) {
    const user = await User.findById(LINK_CUSTOMER)
      .select("_id customerDetails")
      .lean();
    if (!user || !user.customerDetails) {
      console.log(`\n  link-customer: ${LINK_CUSTOMER} not found / no details`);
    } else if (APPLY) {
      await CustomerDetails.updateOne(
        { _id: user.customerDetails },
        {
          $set: {
            fitnessInterests: [
              discIds["Boxing"],
              discIds["HIIT"],
            ].filter(Boolean),
            preferredIntensity: ["Hard"],
          },
        }
      );
      console.log(
        `\n  linked customer ${LINK_CUSTOMER}: interests=[Boxing, HIIT] intensity=[Hard]`
      );
    } else {
      console.log(
        `\n  would link customer ${LINK_CUSTOMER}: interests=[Boxing, HIIT] intensity=[Hard]`
      );
    }
  }
}

async function teardown() {
  const filter = { translationKey: { $regex: `^${SEED_PREFIX}` } };
  const count = await Challenges.countDocuments(filter);
  console.log(
    APPLY ? "APPLYING TEARDOWN\n" : "DRY RUN — nothing will be deleted\n"
  );
  console.log(`  seeded challenges matched: ${count}`);
  console.log("  (disciplines and body-focus areas are left in place)");
  if (APPLY) {
    const res = await Challenges.deleteMany(filter);
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
