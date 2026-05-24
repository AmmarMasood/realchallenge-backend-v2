/**
 * Delivery eligibility — a SEPARATE layer from plan visibility
 * (client 2026-05-16). The plan starts immediately; grocery delivery
 * starts from the first feasible full week based on configurable
 * cutoff + lead time. Nothing here is hardcoded; all knobs come from
 * DeliveryConfig and the user's timezone.
 */
const { DeliveryConfig } = require("../models/MealPlanModels/deliveryConfigModel");
const {
  getWeekStart,
  getWeekId,
  getZonedParts,
} = require("../utils/weekTime");

async function getConfig() {
  let cfg = await DeliveryConfig.findOne({ key: "default" });
  if (!cfg) cfg = await DeliveryConfig.create({ key: "default" });
  return cfg;
}

// First week the user could actually receive groceries for. If the
// upcoming week's order cutoff has already passed, eligibility shifts to
// the following full week (and so on). Plan visibility is unaffected.
async function getDeliveryStatus(tz) {
  const cfg = await getConfig();
  const now = new Date();

  // Start from next week's start (this week is execution, not delivered).
  let weekStart = getWeekStart(now, tz);
  weekStart = new Date(weekStart);
  weekStart.setUTCDate(weekStart.getUTCDate() + 7);

  // Walk forward until the cutoff for that week is still in the future.
  for (let i = 0; i < 6; i++) {
    const cutoff = new Date(weekStart);
    cutoff.setUTCDate(cutoff.getUTCDate() - cfg.leadTimeDays);
    cutoff.setUTCHours(cfg.cutoffHour, 0, 0, 0);
    if (cutoff.getTime() > now.getTime()) {
      return {
        orderingEnabled: cfg.orderingEnabled, // false this sprint
        fullWeekOnly: cfg.fullWeekOnly,
        firstDeliverableWeekId: getWeekId(weekStart, tz),
        orderCutoff: cutoff,
        reason: cfg.orderingEnabled
          ? "eligible"
          : "ordering_disabled_coming_soon",
      };
    }
    weekStart.setUTCDate(weekStart.getUTCDate() + 7);
  }
  return {
    orderingEnabled: cfg.orderingEnabled,
    fullWeekOnly: cfg.fullWeekOnly,
    firstDeliverableWeekId: getWeekId(weekStart, tz),
    reason: "no_feasible_week_found",
  };
}

module.exports = { getConfig, getDeliveryStatus };
