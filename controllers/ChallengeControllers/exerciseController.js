const generateToken = require("../../utils/generateToken");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { Workout } = require("../../models/ChallengeModels/workoutModel");
const { Exercise } = require("../../models/ChallengeModels/exerciseModel");
const { hasRole } = require("../../middlewares/authMiddleware");
const { getOppositeLanguage } = require("../../utils/language");
const { generateTranslationKey } = require("../../utils/translationKey");

// Helper function to escape regex special characters
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// const createExercise = asyncHandler(async (exercise, isRendered) => {
//   try {
//     let newExercise;
//     isRendered
//       ? (newExercise = new Exercise({
//         title: exercise.title,
//         videoURL: exercise.videoURL ? exercise.videoURL : "",
//         exerciseLength: exercise.exerciseLength
//           ? exercise.exerciseLength
//           : null,
//         exerciseTime: exercise.exerciseTime ? exercise.exerciseTime : "",
//         exerciseGroupName: exercise.exerciseGroupName
//           ? exercise.exerciseGroupName
//           : "",
//         voiceOverLink: exercise.voiceOverLink ? exercise.voiceOverLink : "",
//       }))
//       : (newExercise = new Exercise({
//         title: exercise.title,
//         videoURL: exercise.videoURL ? exercise.videoURL : "",
//       }));

//     newExercise = await newExercise.save();

//     return newExercise._id;
//   } catch (err) {
//     console.log(err);
//     return err;
//   }
// });

// // @desc    Update Workout by Id
// // @route   PUT /api/workout/:workoutId
// const updateExercise = asyncHandler(async (exercise) => {
//   try {
//     const e = await Exercise.findById(exercise._id);
//     if (e) {
//       await Exercise.findByIdAndUpdate(exercise._id, exercise, {
//         useFindAndModify: false,
//       });
//       return e._id;
//     } else {
//       return null;
//     }
//   } catch (error) {
//     next(error);
//   }
// });

// @desc    Create Exercise
// @route   POST /api/exercise/create
const createExercise = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    console.log(req.body);

    // Check if exercise with same title already exists for this trainer and language (case-insensitive)
    const existingExercise = await Exercise.findOne({
      trainer: req.body.trainer,
      language: req.body.language,
      title: { $regex: new RegExp(`^${escapeRegex(req.body.title)}$`, 'i') },
    });

    if (existingExercise) {
      return res.status(409).json({
        message: "An exercise with this name already exists for this trainer",
        error: "DUPLICATE_EXERCISE_NAME",
      });
    }

    // Generate or use provided translationKey
    const translationKey = req.body.translationKey ||
      generateTranslationKey("exercise", req.body.title);

    let newExercise = new Exercise({
      user: req.user.id,
      translationKey,
      title: req.body.title,
      videoURL: req.body.videoURL,
      videoThumbnailURL: req.body.videoThumbnailURL,
      trainer: req.body.trainer,
      voiceOverLink: req.body.voiceOverLink,
      description: req.body.description,
      language: req.body.language,
      // alternativeLanguage removed - using translationKey for multi-language support
    });

    newExercise = await newExercise.save();
    if (!newExercise) {
      return res.status(400).json("Exercise cannot be created!");
    }

    // alternativeLanguage bidirectional update removed - using translationKey for multi-language support

    return res.status(201).json({
      message: "Exercise Created Successfully",
      newExercise,
    });
  } catch (err) {
    return next(err);
  }
});

// @desc    Update Exercise by Id
// @route   PUT /api/exercise/:exerciseId
const updateExercise = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const exerciseId = req.params.exerciseId;

    // If title or language is being updated, check for duplicates
    if (update.title || update.language) {
      // Get the current exercise to know which trainer and language it belongs to
      const currentExercise = await Exercise.findById(exerciseId);
      const trainerId = update.trainer || currentExercise.trainer;
      const language = update.language || currentExercise.language;
      const title = update.title || currentExercise.title;

      const existingExercise = await Exercise.findOne({
        trainer: trainerId,
        language: language,
        title: { $regex: new RegExp(`^${escapeRegex(title)}$`, 'i') },
        _id: { $ne: exerciseId }, // Exclude the current exercise
      });

      if (existingExercise) {
        return res.status(409).json({
          message: "An exercise with this name already exists for this trainer",
          error: "DUPLICATE_EXERCISE_NAME",
        });
      }
    }

    update.updatedBy = req.user._id;
    const exercise = await Exercise.findByIdAndUpdate(exerciseId, update, {
      useFindAndModify: false,
      new: true,
    });
    res.status(200).json({
      message: "Exercise has been updated",
      exercise,
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get All Exercises
// @route   GET /api/exercise/
const getAllExercises = asyncHandler(async (req, res) => {
  let exercises;
  if (req.query.language && req.query.language.length > 0) {
    exercises = await Exercise.find({ language: req.query.language }).populate([
      "user",
      "trainer",
    ]);
  } else {
    exercises = await Exercise.find({}).populate(["user", "trainer"]);
  }

  if (exercises) {
    res.status(200).json({
      exercises,
      message: "Exercises retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Exercises cannot be fetched");
  }
});

const getAllUserExercises = asyncHandler(async (req, res) => {
  let exercises;
  const includeAssigned = req.query.includeAssigned === 'true';
  const populateFields = ["user", "trainer", "updatedBy"];

  if (req.query.language && req.query.language.length > 0) {
    if (hasRole(req.user, "admin")) {
      exercises = await Exercise.find({
        language: req.query.language,
      }).populate(populateFields);
    } else {
      // For trainers: optionally include exercises where they are assigned trainer
      const query = includeAssigned
        ? {
            $or: [
              { user: req.user.id },
              { trainer: req.user.id }
            ],
            language: req.query.language,
          }
        : {
            user: req.user.id,
            language: req.query.language,
          };

      exercises = await Exercise.find(query).populate(populateFields);
    }
  } else {
    if (hasRole(req.user, "admin")) {
      exercises = await Exercise.find({}).populate(populateFields);
    } else {
      // For trainers: optionally include exercises where they are assigned trainer
      const query = includeAssigned
        ? {
            $or: [
              { user: req.user.id },
              { trainer: req.user.id }
            ]
          }
        : { user: req.user.id };

      exercises = await Exercise.find(query).populate(populateFields);
    }
  }

  if (exercises) {
    res.status(200).json({
      exercises,
      message: "Exercises retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Exercises cannot be fetched");
  }
});
// @desc    Get exercise by Id
// @route   GET /api/exercise/:exerciseId
const getExerciseById = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findById(req.params.exerciseId);

  if (exercise) {
    res.status(200).json({
      exercise,
      message: "Exercise retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Exercise not found");
  }
});

// @desc    Delete Exercise
// @route   Delete /api/exercise/:exerciseId
const deleteExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findById(req.params.exerciseId);

  if (exercise) {
    await exercise.remove();
    res.json({ message: "Exercise removed" });
  } else {
    res.status(404);
    throw new Error("Exercise not found");
  }
});

const destroy = asyncHandler(async (req, res, next) => {
  try {
    await Exercise.deleteMany({});

    console.log("deletesd");
    res.status(200).send({
      status: "Successfully removed all Exercise files",
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    Get all translations of an exercise by translationKey
// @route   GET /api/exercise/translations/:translationKey
// @access  Public
const getTranslationsByKey = asyncHandler(async (req, res) => {
  const { translationKey } = req.params;
  const { excludeLanguage } = req.query;

  let query = { translationKey };
  if (excludeLanguage) {
    query.language = { $ne: excludeLanguage };
  }

  const translations = await Exercise.find(query)
    .select('_id title language translationKey')
    .lean();

  res.status(200).json({
    translations,
    count: translations.length,
  });
});

// @desc    Get an exercise in a specific language by translationKey
// @route   GET /api/exercise/translation/:translationKey/:language
// @access  Public
const getExerciseByTranslationKey = asyncHandler(async (req, res) => {
  const { translationKey, language } = req.params;

  const exercise = await Exercise.findOne({ translationKey, language })
    .populate("user")
    .populate("trainer");

  if (exercise) {
    res.status(200).json({
      exercise,
      message: "Exercise retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Exercise not found for this language");
  }
});

module.exports = {
  createExercise,
  updateExercise,
  getExerciseById,
  getAllExercises,
  deleteExercise,
  getAllUserExercises,
  destroy,
  getTranslationsByKey,
  getExerciseByTranslationKey,
};
