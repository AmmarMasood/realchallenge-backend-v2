const mongoose = require("mongoose");

const challengeGoalsSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.ChallengeGoals = mongoose.model("ChallengeGoals", challengeGoalsSchema);
