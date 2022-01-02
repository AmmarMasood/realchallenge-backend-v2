const mongoose = require("mongoose");

const trainerGoalSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
  },
  { timestamps: true }
);

exports.TrainerGoal = mongoose.model("TrainerGoal", trainerGoalSchema);
