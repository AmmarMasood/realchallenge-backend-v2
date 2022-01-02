const mongoose = require("mongoose");

const mealTypeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

exports.MealType = mongoose.model("MealType", mealTypeSchema);
