/**
 * Per-user weekly lifecycle (client 2026-05-16):
 *  - both plans generated at signup, any join day
 *  - on the user's LOCAL first-day-of-week 00:00: next_week -> this_week,
 *    old this_week -> archived, a fresh next_week is generated,
 *    just_once pins for the promoted week are cleared, always pins re-applied.
 *
 * Timezone is per-user, so the transition is per-user (not a global cron).
 */
const { User } = require("../models/UserModels/userModel");
const { WeekPlan } = require("../models/MealPlanModels/weekPlanModel");
const { PinnedRecipe } = require("../models/MealPlanModels/pinnedRecipeModel");
const {
  getWeekId,
  getNextWeekId,
  isWeekTransitionMoment,
} = require("../utils/weekTime");
const { buildWeekPlan, upsertWeekPlan } = require("./mealPlanService");

// Generate This Week + Next Week for a customer. Idempotent (upsert).
// NOTE (open client Q-b): late-signup past days currently get a generated
// read-only plan (sensible default). If client says "empty placeholders",
// only the past-day `meals[]` mapping changes — not this orchestration.
async function ensurePlansAtSignup(customerUserId, customerDetailsId, tz, language) {
  const now = new Date();
  const thisWeek = await buildWeekPlan({
    customerUserId,
    customerDetailsId,
    type: "this_week",
    status: "active",
    refDate: now,
    tz,
    language,
  });
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 7);
  const nextWeek = await buildWeekPlan({
    customerUserId,
    customerDetailsId,
    type: "next_week",
    status: "draft",
    refDate: next,
    tz,
    language,
  });
  return {
    this_week: await upsertWeekPlan(thisWeek),
    next_week: await upsertWeekPlan(nextWeek),
  };
}

// Promote one user's Next Week into This Week and regenerate Next Week.
async function runTransitionForUser(user) {
  const tz = user.timeZone;
  const customerDetailsId = user.customerDetails;
  if (!customerDetailsId) return { skipped: "no customerDetails" };

  const promotedWeekId = getWeekId(new Date(), tz);

  // 1. Drop prior archived history, then archive the outgoing This Week
  //    (keeps at most one archived this_week — the immediately previous).
  await WeekPlan.deleteMany({
    customer: customerDetailsId,
    type: "this_week",
    status: "archived",
  });
  await WeekPlan.updateMany(
    { customer: customerDetailsId, type: "this_week", status: "active" },
    { $set: { status: "archived" } }
  );

  // 2. Promote the existing Next Week draft -> active This Week.
  const promoted = await WeekPlan.findOneAndUpdate(
    { customer: customerDetailsId, type: "next_week" },
    { $set: { type: "this_week", status: "active", week_id: promotedWeekId } },
    { new: true, sort: { createdAt: -1 } }
  );

  // Fallback (spec §5): no valid Next Week existed — generate one now.
  if (!promoted) {
    const built = await buildWeekPlan({
      customerUserId: user._id,
      customerDetailsId,
      type: "this_week",
      status: "active",
      refDate: new Date(),
      tz,
    });
    await upsertWeekPlan(built);
  }

  // 3. Clear just_once pins whose target week was just promoted.
  await PinnedRecipe.deleteMany({
    customer: customerDetailsId,
    mode: "just_once",
    target_week_id: promotedWeekId,
  });

  // 4. Generate a fresh Next Week draft (always pins are re-applied here;
  //    full pin-priority application lands in Phase 2's generator).
  const nextRef = new Date();
  nextRef.setUTCDate(nextRef.getUTCDate() + 7);
  const newNext = await buildWeekPlan({
    customerUserId: user._id,
    customerDetailsId,
    type: "next_week",
    status: "draft",
    refDate: nextRef,
    tz,
  });
  newNext.week_id = getNextWeekId(new Date(), tz);
  await upsertWeekPlan(newNext);

  return { promotedWeekId, promoted: !!promoted };
}

// Sweep all users; transition those whose local time is at the trigger.
// Designed to be called on an hourly tick.
async function runDueTransitions(at = new Date()) {
  const users = await User.find({ customerDetails: { $ne: null } })
    .select("_id timeZone customerDetails")
    .lean();
  const results = { checked: users.length, transitioned: 0, errors: 0 };
  for (const u of users) {
    try {
      if (isWeekTransitionMoment(at, u.timeZone)) {
        await runTransitionForUser(u);
        results.transitioned++;
      }
    } catch (e) {
      results.errors++;
      console.error(`[mealPlanLifecycle] transition failed for ${u._id}:`, e.message);
    }
  }
  return results;
}

module.exports = { ensurePlansAtSignup, runTransitionForUser, runDueTransitions };
