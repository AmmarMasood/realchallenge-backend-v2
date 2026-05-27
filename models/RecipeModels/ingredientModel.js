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
    // Pantry staples (salt, oil, pepper, …) are assumed to be on hand and
    // excluded from shopping-list aggregation by default.
    isPantryStaple: {
      type: Boolean,
      default: false,
    },
    // Free-form admin tag for future grouping (Dairy, Produce, Pantry…).
    // Required by Tightening §F1; no enforced use yet.
    category: {
      type: String,
      default: "",
    },
    // Preferred unit for this item — used by the recipe form to default
    // the active quantity input (Tightening §F1 "if easy to implement").
    defaultUnit: {
      type: String,
      enum: ["g", "ml", "pieces", ""],
      default: "",
    },
    // Soft-delete lifecycle. Inactive items stay in the DB so existing
    // recipes referencing them don't break, but are hidden in the admin
    // selector (Tightening §F1).
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

ingredientSchema.index({ name: 1, language: 1 }, { unique: true });

exports.Ingredient = mongoose.model("Ingredient", ingredientSchema);
