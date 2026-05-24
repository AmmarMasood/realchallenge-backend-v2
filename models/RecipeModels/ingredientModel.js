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
    // Supplements are their own item type (client 2026-05-16): they have
    // their own settings flow and must not be treated as ordinary items.
    itemType: {
      type: String,
      enum: ["ingredient", "supplement"],
      default: "ingredient",
    },
  },
  { timestamps: true }
);

ingredientSchema.index({ name: 1, language: 1 }, { unique: true });

exports.Ingredient = mongoose.model("Ingredient", ingredientSchema);
