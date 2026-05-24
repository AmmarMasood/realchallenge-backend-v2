const mongoose = require("mongoose");

// Delivery cutoff / lead-time is NOT finalized and must stay configurable
// (client 2026-05-16): not hardcoded Thursday, not Amsterdam-bound, not
// tied to signup day. A single config doc drives eligibility logic.
// External ordering itself stays disabled ("coming soon") this sprint.
const deliveryConfigSchema = mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    // Ordering integration switch — off for the current sprint.
    orderingEnabled: { type: Boolean, default: false },
    // Days before the week start that the order must be placed by.
    leadTimeDays: { type: Number, default: 3 },
    // Weekday (0=Sun..6=Sat) the cutoff falls on, in the user's tz.
    cutoffWeekday: { type: Number, default: 4 }, // Thu (expectation, not law)
    // Hour of day (0-23) for the cutoff.
    cutoffHour: { type: Number, default: 23 },
    // Prefer whole-week delivery over partial-week (client preference).
    fullWeekOnly: { type: Boolean, default: true },
  },
  { timestamps: true }
);

exports.DeliveryConfig = mongoose.model(
  "DeliveryConfig",
  deliveryConfigSchema
);
