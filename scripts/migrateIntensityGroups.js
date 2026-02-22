/**
 * One-time migration script: backfill intensity group siblings
 *
 * For existing users who purchased a single variant of an intensity group,
 * this script adds all missing sibling challenge IDs to their customerDetails.challenges.
 *
 * Usage: node scripts/migrateIntensityGroups.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const { CustomerDetails } = require("../models/UserModels/customerDetailsModel");
const { Challenges } = require("../models/ChallengeModels/challengesModel");

async function migrate() {
  await mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log("Connected to MongoDB");

  // Build a map: intensityGroupId -> [challengeId, ...]
  const groupedChallenges = await Challenges.find({
    intensityGroupId: { $exists: true, $ne: null, $ne: "" },
  }).select("_id intensityGroupId").lean();

  const groupMap = {};
  for (const c of groupedChallenges) {
    if (!groupMap[c.intensityGroupId]) {
      groupMap[c.intensityGroupId] = [];
    }
    groupMap[c.intensityGroupId].push(c._id.toString());
  }

  console.log(`Found ${Object.keys(groupMap).length} intensity groups`);

  // Process all customer details
  const allCustomers = await CustomerDetails.find({
    challenges: { $exists: true, $not: { $size: 0 } },
  });

  let updatedCount = 0;

  for (const cd of allCustomers) {
    const existingIds = cd.challenges.map((id) => id.toString());
    let changed = false;
    const newIds = [...existingIds];

    for (const id of existingIds) {
      // Find which group this challenge belongs to
      for (const [groupId, siblingIds] of Object.entries(groupMap)) {
        if (siblingIds.includes(id)) {
          // Add missing siblings
          for (const sibId of siblingIds) {
            if (!newIds.includes(sibId)) {
              newIds.push(sibId);
              changed = true;
            }
          }
          break;
        }
      }
    }

    if (changed) {
      cd.challenges = newIds;
      await cd.save();
      updatedCount++;
      console.log(`Updated CustomerDetails ${cd._id}: added ${newIds.length - existingIds.length} sibling(s)`);
    }
  }

  console.log(`\nMigration complete. Updated ${updatedCount} customer records.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
