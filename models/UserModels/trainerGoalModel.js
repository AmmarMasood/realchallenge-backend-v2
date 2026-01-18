const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

const trainerGoalSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    icon: {
      type: String,
    },
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
    },
  },
  { timestamps: true }
);

exports.TrainerGoal = mongoose.model("TrainerGoal", trainerGoalSchema);
