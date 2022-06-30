const mongoose = require("mongoose");

const equipmentSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    language: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.Equipment = mongoose.model("Equipment", equipmentSchema);
