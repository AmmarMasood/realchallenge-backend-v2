const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

// Allergens / exclusions (nuts, shellfish, dairy, gluten, …). Admin-managed
// collection so new allergens can be added without code changes (client
// checklist §2). Mirrors the Diet / FoodType tag collections.
const allergenSchema = mongoose.Schema(
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

allergenSchema.index({ name: 1, language: 1 }, { unique: true });

exports.Allergen = mongoose.model("Allergen", allergenSchema);
