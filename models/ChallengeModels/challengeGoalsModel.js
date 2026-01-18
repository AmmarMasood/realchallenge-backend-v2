const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

const challengeGoalsSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
    },
  },
  { timestamps: true }
);

exports.ChallengeGoals = mongoose.model("ChallengeGoals", challengeGoalsSchema);
