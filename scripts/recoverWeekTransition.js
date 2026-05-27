/**
 * One-off recovery script for users whose Monday week-transition never ran
 * (because ENABLE_WEEK_TRANSITION was off). Promotes the existing
 * next_week_plan into this_week_active and regenerates next_week_plan.
 *
 * Use cases:
 *  - A user who signed up on a Thu-Sun and prepared Next Week, but on
 *    Monday the scheduler didn't promote it -> their This Week shows
 *    stale/empty content while Next Week (now relabeled to W+1) holds
 *    the content they meant for this week.
 *
 * Dry-run by default. Apply with --apply.
 *
 *   node scripts/recoverWeekTransition.js                       # all users (dry)
 *   node scripts/recoverWeekTransition.js --apply               # all users
 *   node scripts/recoverWeekTransition.js --user=<userId>       # one user
 *   node scripts/recoverWeekTransition.js --user=<userId> --apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
// Register all referenced models so populate/ref lookups inside the
// lifecycle don't crash on "Schema hasn't been registered" errors.
require("../models/UserModels/customerDetailsModel");
require("../models/MealPlanModels/weekPlanModel");
require("../models/MealPlanModels/pinnedRecipeModel");
require("../models/MealPlanModels/pinnedDayModel");
require("../models/RecipeModels/recipeModel");
require("../models/RecipeModels/ingredientModel");
require("../models/RecipeModels/dietModel");
require("../models/RecipeModels/foodTypeModel");
require("../models/RecipeModels/mealTypeModel");
const { User } = require("../models/UserModels/userModel");
const { runTransitionForUser } = require("../services/mealPlanLifecycle");

const APPLY = process.argv.includes("--apply");
const userArg = process.argv.find((a) => a.startsWith("--user="));
const targetUserId = userArg ? userArg.split("=")[1] : null;

async function main() {
  await connectDB();

  const query = { customerDetails: { $ne: null } };
  if (targetUserId) query._id = targetUserId;

  const users = await User.find(query)
    .select("_id email timeZone customerDetails")
    .lean();

  console.log(
    `[recover] mode=${APPLY ? "APPLY" : "DRY-RUN"}  users=${users.length}`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const u of users) {
    const label = `${u.email || "(no email)"} (${u._id})`;
    if (!APPLY) {
      console.log(`[recover] would transition: ${label}`);
      skipped++;
      continue;
    }
    try {
      const r = await runTransitionForUser(u);
      console.log(
        `[recover] OK ${label} promoted=${r.promoted} week=${r.promotedWeekId}`,
      );
      ok++;
    } catch (e) {
      console.error(`[recover] FAIL ${label}: ${e.message}`);
      failed++;
    }
  }

  console.log(
    `[recover] done. ok=${ok} skipped=${skipped} failed=${failed}`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
