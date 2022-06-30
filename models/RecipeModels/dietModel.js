const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const dietSchema = mongoose.Schema(
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

exports.Diet = mongoose.model("Diet", dietSchema);
