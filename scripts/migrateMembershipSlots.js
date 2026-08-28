/**
 * Migrates Membership.challenges from bare ObjectIds to slot entries.
 *
 * The field used to be a plain list of challenge ids, counted as a lifetime
 * total. It is now a list of { challenge, grantedAt, holdUntil } so the plan cap
 * can mean "active at once": a slot frees when the challenge is completed or
 * when its hold elapses.
 *
 * Legacy bare ids hydrate into a malformed subdocument (no `challenge`, no
 * `holdUntil`), which the runtime treats as permanently occupied. This rewrites
 * them so those users get their slots back.
 *
 * Idempotent — entries already in the new shape are left alone.
 *
 *   node scripts/migrateMembershipSlots.js [--dry]
 */
// Resolve .env relative to this file so the script runs from any directory.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const DRY = process.argv.includes("--dry");
const DEFAULT_HOLD_WEEKS = 12;

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    dbName: "realChallengeProduction",
  });

  const { Challenges } = require("../models/ChallengeModels/challengesModel");
  const memberships = mongoose.connection.db.collection("memberships");

  const docs = await memberships
    .find({ "challenges.0": { $exists: true } })
    .toArray();

  let converted = 0;
  let skipped = 0;

  for (const m of docs) {
    // Anything already carrying a `challenge` key is in the new shape.
    if (m.challenges.every((c) => c && c.challenge)) {
      skipped += 1;
      continue;
    }

    const grantedAt = m.createdAt || m.startTime || new Date();
    const entries = [];

    for (const c of m.challenges) {
      if (c && c.challenge) {
        entries.push(c);
        continue;
      }
      const challengeId = c && c._id ? c._id : c;
      const challenge = await Challenges.findById(challengeId).select("weeks");
      const weeks =
        (challenge && challenge.weeks && challenge.weeks.length) ||
        DEFAULT_HOLD_WEEKS;
      const holdUntil = new Date(grantedAt);
      holdUntil.setDate(holdUntil.getDate() + weeks * 7);
      entries.push({ challenge: challengeId, grantedAt, holdUntil });
    }

    console.log(
      `${DRY ? "[dry] " : ""}${m._id} (${m.name}): ${m.challenges.length} entries -> slot entries`,
    );
    if (!DRY) {
      await memberships.updateOne(
        { _id: m._id },
        { $set: { challenges: entries } },
      );
    }
    converted += 1;
  }

  console.log(
    `\n${DRY ? "would convert" : "converted"}: ${converted}, already migrated: ${skipped}`,
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
