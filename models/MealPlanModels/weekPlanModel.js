const mongoose = require("mongoose");
const { MEAL_TYPE_SLOTS } = require("../RecipeModels/mealTypeModel");
const { WEEKDAY_KEYS } = require("../../utils/weekTime");

// One meal slot inside a day. `source` = how the recipe got here;
// `lock_type` = whether it's pinned (kept distinct per spec §25).
const mealSlotSchema = mongoose.Schema(
  {
    meal_slot: { type: String, enum: MEAL_TYPE_SLOTS, required: true },
    recipe_id: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
    is_supplement_slot: { type: Boolean, default: false },
    source: {
      type: String,
      enum: ["generated", "swapped"],
      default: "generated",
    },
    lock_type: {
      type: String,
      enum: [null, "day_pin", "recipe_pin"],
      default: null,
    },
    pin_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const daySchema = mongoose.Schema(
  {
    weekday: { type: String, enum: WEEKDAY_KEYS, required: true },
    date: { type: Date, required: true },
    is_day_pinned: { type: Boolean, default: false },
    day_pin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PinnedDay",
      default: null,
    },
    has_extra_supplement_slot: { type: Boolean, default: false },
    meals: [mealSlotSchema],
  },
  { _id: false }
);

const weekPlanSchema = mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerDetails",
      required: true,
      index: true,
    },
    // ISO-8601 week id from utils/weekTime#getWeekId, e.g. "2026-W20".
    week_id: { type: String, required: true },
    type: {
      type: String,
      enum: ["this_week", "next_week"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "draft", "archived"],
      required: true,
    },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
    shopping_sync_status: {
      type: String,
      enum: ["not_added", "synced", "needs_update"],
      default: "not_added",
    },
    days: [daySchema],
  },
  { timestamps: true }
);

// Uniqueness includes status so the Monday transition can archive an old
// this_week and promote a new active one for the same (week_id, type)
// without colliding. The transition prunes prior archived history so this
// stays bounded to one archived doc per (week_id, type).
weekPlanSchema.index(
  { customer: 1, week_id: 1, type: 1, status: 1 },
  { unique: true }
);

exports.WeekPlan = mongoose.model("WeekPlan", weekPlanSchema);
