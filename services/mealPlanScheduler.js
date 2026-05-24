/**
 * Hourly tick that runs due per-user week transitions. No cron dependency —
 * matches the setInterval background-job pattern already in server.js.
 *
 * GATED OFF by default: the weekly-plan feature spans multiple phases
 * (endpoints + frontend not built yet). Enabling the sweep early would
 * generate/mutate WeekPlan data for every user at their local Monday while
 * the feature is incomplete. Turn on with ENABLE_WEEK_TRANSITION=true once
 * the full feature ships.
 */
const { runDueTransitions } = require("./mealPlanLifecycle");

const HOUR_MS = 60 * 60 * 1000;

function startWeekTransitionScheduler() {
  if (process.env.ENABLE_WEEK_TRANSITION !== "true") {
    console.log(
      "[mealPlanScheduler] disabled (set ENABLE_WEEK_TRANSITION=true to enable)"
    );
    return null;
  }
  console.log("[mealPlanScheduler] enabled — sweeping hourly for due transitions");
  return setInterval(async () => {
    try {
      const r = await runDueTransitions(new Date());
      if (r.transitioned || r.errors) {
        console.log("[mealPlanScheduler] tick", r);
      }
    } catch (e) {
      console.error("[mealPlanScheduler] tick failed:", e.message);
    }
  }, HOUR_MS);
}

module.exports = { startWeekTransitionScheduler };
