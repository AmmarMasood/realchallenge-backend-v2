const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

/**
 * Which disciplines a trainer teaches — a join table, nothing more.
 *
 * This model used to OWN the discipline vocabulary (name + language + icon),
 * with a required `trainerId`. That made "Boxing" a per-trainer document and
 * silently split the taxonomy whenever two trainers named the same thing —
 * see the note in DisciplineModels/disciplineModel.js. The vocabulary now
 * lives in `Discipline`; this model only records the relationship.
 *
 * `name` / `language` / `icon` are retained as OPTIONAL legacy fields so old
 * documents still load during the transition. Nothing should read them —
 * resolve through `discipline` instead.
 */
const trainerGoalSchema = mongoose.Schema(
  {
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    discipline: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discipline",
      index: true,
    },

    // ---- legacy, do not read ----
    name: { type: String },
    language: { type: String, enum: SUPPORTED_LANGUAGES },
    icon: { type: String },
  },
  { timestamps: true }
);

// A trainer lists a discipline once.
trainerGoalSchema.index(
  { trainerId: 1, discipline: 1 },
  { unique: true, sparse: true }
);

exports.TrainerGoal = mongoose.model("TrainerGoal", trainerGoalSchema);
