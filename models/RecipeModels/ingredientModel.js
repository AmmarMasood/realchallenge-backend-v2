const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const ingredientSchema = mongoose.Schema(
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

exports.Ingredient = mongoose.model("Ingredient", ingredientSchema);
