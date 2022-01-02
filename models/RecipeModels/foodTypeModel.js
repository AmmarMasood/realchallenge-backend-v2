const mongoose = require("mongoose");

const foodTypeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

exports.FoodType = mongoose.model("FoodType", foodTypeSchema);
