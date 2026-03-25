const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const mealTypeSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    language: {
      type: String,
      enum: languages,
    },
  },
  { timestamps: true }
);

mealTypeSchema.index({ name: 1, language: 1 }, { unique: true });

exports.MealType = mongoose.model("MealType", mealTypeSchema);
