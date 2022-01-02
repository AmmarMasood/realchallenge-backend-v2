const generateToken = require("../../utils/generateToken");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { Workout } = require("../../models/ChallengeModels/workoutModel");
const { Exercise } = require("../../models/ChallengeModels/exerciseModel");
// const { Chal } = require("../models/equipmentModel");

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
    let newExercise = new Exercise({
      user: req.user.id,
      title: req.body.title,
      videoURL: req.body.videoURL,
      trainer: req.body.trainer,
      // break: req.body.break,
      // exerciseLength: req.body.exerciseLength,
      // exerciseGroupName: req.body.exerciseGroupName,
      voiceOverLink: req.body.voiceOverLink,
      description: req.body.description,
    });

    newExercise = await newExercise.save();
    if (!newExercise) {
      return res.status(400).json("Exercise cannot be created!");
    } else {
      return res.status(201).json({
        message: "Exercise Created Successfully",
        newExercise,
      });
    }
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
  const exercises = await Exercise.find({}).populate(["user", "trainer"]);

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
  if (req.user.role === "admin") {
    exercises = await Exercise.find({}).populate(["user", "trainer"]);
  } else {
    exercises = await Exercise.find({ user: req.user.id }).populate([
      "user",
      "trainer",
    ]);
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

module.exports = {
  createExercise,
  updateExercise,
  getExerciseById,
  getAllExercises,
  deleteExercise,
  getAllUserExercises,
};
