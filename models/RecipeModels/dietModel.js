const mongoose = require("mongoose");

const dietSchema = mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

exports.Diet = mongoose.model("Diet", dietSchema);
