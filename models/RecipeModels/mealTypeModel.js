const mongoose = require("mongoose");

// MealType is a fixed slot-key vocabulary — admins cannot create new values.
// Frontend translates these keys for display via i18n (e.g. userDashboard.nutrient.breakfast).
const MEAL_TYPE_SLOTS = [
  "breakfast",
  "morningSnack",
  "lunch",
  "afternoonSnack",
  "dinner",
];

const mealTypeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      enum: MEAL_TYPE_SLOTS,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

exports.MealType = mongoose.model("MealType", mealTypeSchema);
exports.MEAL_TYPE_SLOTS = MEAL_TYPE_SLOTS;
