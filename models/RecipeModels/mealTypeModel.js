const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const mealTypeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
    },
    language: {
      type: String,
      enum: languages,
    },
  },
  { timestamps: true }
);

exports.MealType = mongoose.model("MealType", mealTypeSchema);
