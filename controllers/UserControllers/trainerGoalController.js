const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { TrainerGoal } = require("../../models/UserModels/trainerGoalModel");
const {
  Discipline,
  toPickerShape,
} = require("../../models/DisciplineModels/disciplineModel");
const { DEFAULT_LANGUAGE } = require("../../utils/language");

/**
 * These endpoints keep their historical names and response shape
 * (`{ goals: [{ _id, name, icon }] }`) so the wizard, profile page and admin
 * pickers keep working unchanged — but the vocabulary they serve now comes
 * from the canonical `Discipline` collection instead of per-trainer
 * `TrainerGoal` documents. `_id` in the response is a Discipline id, which is
 * exactly what `fitnessInterests` and `trainersFitnessInterest` store.
 *
 * TrainerGoal is now only the trainer -> discipline join.
 */

// Turn a free-text name into a stable slug ("Boxing" -> "boxing").
const toSlug = (name) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Find a discipline by slug, creating it if new. Admin-created disciplines
 * arrive as a single name in one language; store it as the canonical name and
 * also as that language's translation.
 */
async function findOrCreateDiscipline({ name, icon, language }) {
  const slug = toSlug(name);
  if (!slug) return null;

  const existing = await Discipline.findOne({ slug });
  if (existing) {
    // Fill in a translation we don't have yet rather than duplicating.
    if (
      language &&
      !(existing.translations || []).some((t) => t.language === language)
    ) {
      existing.translations.push({ language, name: String(name).trim() });
      await existing.save();
    }
    return existing;
  }

  return Discipline.create({
    slug,
    name: String(name).trim(),
    icon: icon || "",
    translations: language ? [{ language, name: String(name).trim() }] : [],
  });
}

// POST /api/trainers/trainerGoals
// Creates the discipline if needed, then links it to the calling trainer.
const createTrainerGoal = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(400).json("Trainer goal cannot be empty.");
  }
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const discipline = await findOrCreateDiscipline({
      name: req.body.name,
      icon: req.body.icon,
      language: req.body.language,
    });
    if (!discipline) {
      return res.status(400).json("A discipline name is required.");
    }

    const trainerId = req.user._id;
    // Idempotent: a trainer listing the same discipline twice is a no-op.
    const link = await TrainerGoal.findOneAndUpdate(
      { trainerId, discipline: discipline._id },
      { $setOnInsert: { trainerId, discipline: discipline._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      mesage: "Trainer goal Created Successfully",
      // Shape kept: callers read `_id` and `name` off this.
      newBody: toPickerShape(discipline, req.body.language || DEFAULT_LANGUAGE),
      link: link._id,
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/trainers/trainerGoals/:goalId
// Renames the underlying discipline. Editing shared vocabulary affects every
// trainer that lists it — which is the point of having one canonical entry.
const updateTrainerGoal = asyncHandler(async (req, res, next) => {
  try {
    const trainerId = req.user._id;
    const link = await TrainerGoal.findById(req.params.goalId);
    if (!link) {
      res.status(404);
      throw new Error("Trainer Goal not found");
    }
    if (link.trainerId.toString() !== trainerId.toString()) {
      res.status(403);
      throw new Error("Not authorized to update this goal");
    }

    const discipline = await Discipline.findById(link.discipline);
    if (!discipline) {
      res.status(404);
      throw new Error("Discipline not found");
    }

    const language = req.body.language || DEFAULT_LANGUAGE;
    if (req.body.name) {
      const idx = (discipline.translations || []).findIndex(
        (t) => t.language === language
      );
      if (idx >= 0) discipline.translations[idx].name = req.body.name.trim();
      else
        discipline.translations.push({ language, name: req.body.name.trim() });

      // Keep the canonical label in step when editing the default language.
      if (language === DEFAULT_LANGUAGE) discipline.name = req.body.name.trim();
    }
    if (req.body.icon !== undefined) discipline.icon = req.body.icon;
    await discipline.save();

    res.status(200).json({
      data: toPickerShape(discipline, language),
      message: "Trainer Fitness Interest Updated",
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/trainers/trainerGoals/all — disciplines the CALLING trainer lists
const getAllTrainerGoals = asyncHandler(async (req, res) => {
  const language = req.query.language || DEFAULT_LANGUAGE;
  const links = await TrainerGoal.find({ trainerId: req.user._id }).populate(
    "discipline"
  );

  res.status(200).json({
    goals: links
      .filter((l) => l.discipline)
      .map((l) => toPickerShape(l.discipline, language)),
  });
});

// GET /api/trainers/trainerGoals/trainer/:trainerId — public trainer profile
const getTrainerGoalsByTrainerId = asyncHandler(async (req, res) => {
  const language = req.query.language || DEFAULT_LANGUAGE;
  const links = await TrainerGoal.find({
    trainerId: req.params.trainerId,
  }).populate("discipline");

  res.status(200).json({
    goals: links
      .filter((l) => l.discipline)
      .map((l) => toPickerShape(l.discipline, language)),
  });
});

// DELETE /api/trainers/trainerGoals/:goalId
// Unlinks the discipline from this trainer. The discipline itself survives —
// other trainers and existing challenge/customer references still need it.
const deleteTrainerGoal = asyncHandler(async (req, res) => {
  const trainerId = req.user._id;
  const link = await TrainerGoal.findById(req.params.goalId);

  if (!link) {
    res.status(404);
    throw new Error("Trainer Goal not found");
  }
  if (link.trainerId.toString() !== trainerId.toString()) {
    res.status(403);
    throw new Error("Not authorized to delete this goal");
  }

  await link.remove();
  res.json({ message: "Trainer Goal removed" });
});

// GET /api/trainers/trainerGoals/public/all
// The vocabulary itself — what the signup wizard, profile page and admin
// challenge forms populate their pickers from.
//
// The old implementation returned every TrainerGoal and de-duplicated by
// lowercased name, so which ObjectId a picker got depended on document order.
// Disciplines are unique by construction, so no de-duplication is needed.
const getAllTrainerGoalsPublic = asyncHandler(async (req, res) => {
  const language = req.query.language || DEFAULT_LANGUAGE;
  const disciplines = await Discipline.find({ isActive: true }).sort({
    sortOrder: 1,
    name: 1,
  });

  res.status(200).json({
    goals: disciplines.map((d) => toPickerShape(d, language)),
  });
});

module.exports = {
  createTrainerGoal,
  getAllTrainerGoals,
  getAllTrainerGoalsPublic,
  getTrainerGoalsByTrainerId,
  deleteTrainerGoal,
  updateTrainerGoal,
  findOrCreateDiscipline,
};
