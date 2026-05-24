const mongoose = require("mongoose");
const { MEAL_TYPE_SLOTS } = require("../RecipeModels/mealTypeModel");
const { WEEKDAY_KEYS } = require("../../utils/weekTime");

// Recipe pin: "keep this exact recipe in this exact slot" (client 2026-05-16).
// Weekday + slot based, not date based, so it can re-apply each cycle.
const pinnedRecipeSchema = mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerDetails",
      required: true,
      index: true,
    },
    recipe_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true,
    },
    weekday: { type: String, enum: WEEKDAY_KEYS, required: true },
    meal_slot: { type: String, enum: MEAL_TYPE_SLOTS, required: true },
    mode: {
      type: String,
      enum: ["just_once", "always"],
      required: true,
    },
    // Origin only — does not limit how long an `always` pin lives.
    source_week_type: {
      type: String,
      enum: ["this_week", "next_week"],
      required: true,
    },
    // Pins always target the upcoming planning cycle.
    applies_to_week_type: {
      type: String,
      enum: ["next_week"],
      default: "next_week",
    },
    // Set for just_once (the specific Next Week id); null for always.
    target_week_id: { type: String, default: null },
    // Set when the pin becomes invalid (recipe deleted / diet-incompatible)
    // — disabled-first per spec §13, removed only if unsupported.
    disabled: { type: Boolean, default: false },
    disabled_reason: { type: String, default: null },
  },
  { timestamps: true }
);

pinnedRecipeSchema.index({ customer: 1, weekday: 1, meal_slot: 1, mode: 1 });

exports.PinnedRecipe = mongoose.model("PinnedRecipe", pinnedRecipeSchema);
