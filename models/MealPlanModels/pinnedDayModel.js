const mongoose = require("mongoose");
const { MEAL_TYPE_SLOTS } = require("../RecipeModels/mealTypeModel");
const { WEEKDAY_KEYS } = require("../../utils/weekTime");

// Day pin: locks the EXACT recipes visible at pin time (client 2026-05-16)
// — a concrete snapshot, NOT a shape/template. Has priority over recipe
// pins inside the same day (spec §20).
const lockedMealSchema = mongoose.Schema(
  {
    meal_slot: { type: String, enum: MEAL_TYPE_SLOTS, required: true },
    recipe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true,
    },
    is_supplement_slot: { type: Boolean, default: false },
  },
  { _id: false }
);

const pinnedDaySchema = mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerDetails",
      required: true,
      index: true,
    },
    weekday: { type: String, enum: WEEKDAY_KEYS, required: true },
    locked_meals: {
      type: [lockedMealSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A day pin must lock at least one meal.",
      },
    },
    has_extra_supplement_slot: { type: Boolean, default: false },
    mode: {
      type: String,
      enum: ["just_once", "always"],
      required: true,
    },
    applies_to_week_type: {
      type: String,
      enum: ["next_week"],
      default: "next_week",
    },
    target_week_id: { type: String, default: null },
    // Whole day pin is disabled if ANY locked meal is invalid (spec §19).
    disabled: { type: Boolean, default: false },
    disabled_reason: { type: String, default: null },
  },
  { timestamps: true }
);

pinnedDaySchema.index({ customer: 1, weekday: 1, mode: 1 });

exports.PinnedDay = mongoose.model("PinnedDay", pinnedDaySchema);
