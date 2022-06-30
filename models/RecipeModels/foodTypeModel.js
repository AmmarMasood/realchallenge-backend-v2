const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const foodTypeSchema = mongoose.Schema(
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

exports.FoodType = mongoose.model("FoodType", foodTypeSchema);
