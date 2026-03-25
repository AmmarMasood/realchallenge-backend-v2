const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const foodTypeSchema = mongoose.Schema(
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

foodTypeSchema.index({ name: 1, language: 1 }, { unique: true });

exports.FoodType = mongoose.model("FoodType", foodTypeSchema);
