const mongoose = require("mongoose");

const ingredientSchema = mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

exports.Ingredient = mongoose.model("Ingredient", ingredientSchema);
