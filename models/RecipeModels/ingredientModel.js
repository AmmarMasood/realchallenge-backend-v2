const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const ingredientSchema = mongoose.Schema(
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

ingredientSchema.index({ name: 1, language: 1 }, { unique: true });

exports.Ingredient = mongoose.model("Ingredient", ingredientSchema);
