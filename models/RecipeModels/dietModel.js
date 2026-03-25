const mongoose = require("mongoose");
const { languages } = require("../../utils/language");

const dietSchema = mongoose.Schema(
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

dietSchema.index({ name: 1, language: 1 }, { unique: true });

exports.Diet = mongoose.model("Diet", dietSchema);
