const generateToken = require("../../utils/generateToken");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const { Workout } = require("../../models/ChallengeModels/workoutModel");
const { Exercise } = require("../../models/ChallengeModels/exerciseModel");
const { Product } = require("../../models/ShopModels/productModel");
const { Equipment } = require("../../models/ChallengeModels/equipmentModel");

// const {
//   createExercise,
//   updateExercise,
// } = require("../ChallengeControllers/exerciseController");

const createWorkout = asyncHandler(async (workout) => {
  try {
    // let exerciseIdsResolved;
    // if (workout.exercises) {
    //   if (workout.exercises.length > 0) {
    //     const exercisesIds = Promise.all(
    //       workout.exercises.map(async (exercise) => {
    //         let newExercise;
    //         workout.isRendered
    //           ? (newExercise = new Exercise({
    //               title: exercise.title,
    //               videoURL: exercise.videoURL ? exercise.videoURL : "",
    //               exerciseLength: exercise.exerciseLength
    //                 ? exercise.exerciseLength
    //                 : null,
    //               exerciseTime: exercise.exerciseTime
    //                 ? exercise.exerciseTime
    //                 : "",
    //               exerciseGroupName: exercise.exerciseGroupName
    //                 ? exercise.exerciseGroupName
    //                 : "",
    //               voiceOverLink: exercise.voiceOverLink
    //                 ? exercise.voiceOverLink
    //                 : "",
    //             }))
    //           : (newExercise = new Exercise({
    //               title: exercise.title,
    //               videoURL: exercise.videoURL ? exercise.videoURL : "",
    //             }));

    //         newExercise = await newExercise.save();

    //         return newExercise._id;
    //       })
    //     );
    //     exerciseIdsResolved = await exercisesIds;
    //   }
    // }

    let newWorkout = new Workout({
      title: workout.title,
      subtitle: workout.subtitle,
      infoTitle: workout.infotitle,
      infoFile: workout.infoFile,
      relatedEquipments: workout.equipment, //ids resolved
      relatedProducts: workout.relatedProducts, //ids aayegi
      introVideoLink: workout.introVideoLink,
      introVideoLength: workout.introVideoLength,
      relatedEquipments: workout.relatedEquipments,
      isRendered: workout.isRendered,
      exercises: workout.exercises, //ids with extra stuff
    });

    newWorkout = await newWorkout.save();
    if (!newWorkout) {
      return null;
    } else {
      // console.log(newWorkout._id);
      return newWorkout._id;
      // return res.status(201).json({
      //   mesage: "Workkout Created Successfully",
      //   newWorkout,
      // });
    }
  } catch (err) {
    console.log(err);
    return err;
  }
});

// @desc    Get workout by ID
// @route   GET /api/workout/:workoutId
const getWorkoutById = asyncHandler(async (req, res) => {
  const workout = await Workout.findById(req.params.workoutId).populate([
    "exercises",
    "exercises.exerciseId",
    "relatedEquipments",
    "relatedProducts",
  ]);

  if (workout) {
    console.log(workout);
    res.json(workout);
  } else {
    res.status(404);
    throw new Error("Workout not found");
  }
});

// @desc    Get All workouts
// @route   GET /api/workouts/
const getAllWorkouts = asyncHandler(async (req, res) => {
  const workouts = await Workout.find({}).populate("exercises");
  if (workouts) {
    res.status(200).json({
      workouts,
    });
  } else {
    res.status(404);
    throw new Error("Workouts Cannot be fetched");
  }
});

// @desc    Update Workout by Id
// @route   PUT /api/workout/update
const updateWorkout = asyncHandler(async (req, res, next) => {
  try {
    if (req.body._id) {
      // console.log(req.body._id);
      // let exerciseIdsResolved;
      // if (req.body.exercises) {
      //   if (req.body.exercises.length > 0) {
      //     const exercisesIds = Promise.all(
      //       req.body.exercises.map(async (e) => {
      //         if (e._id) {
      //           return updateExercise(e);
      //         } else {
      //           return createExercise(e, req.body.isRendered);
      //         }
      //       })
      //     );
      //     exerciseIdsResolved = await exercisesIds;
      //   }
      // }
      const oldWorkout = await Workout.findById(req.body._id);
      let update = {
        title: req.body.title ? req.body.title : oldWorkout.title,
        subtitle: req.body.subtitle ? req.body.subtitle : oldWorkout.subtitle,
        infoTitle: req.body.infotitle
          ? req.body.infotitle
          : oldWorkout.infotitle,
        infoFile: req.body.infoFile ? req.body.infoFile : oldWorkout.infoFile,
        relatedEquipments: req.body.equipment
          ? req.body.equipment
          : oldWorkout.relatedEquipments,
        relatedProducts: req.body.relatedProducts
          ? req.body.relatedProducts
          : oldWorkout.relatedProducts,
        introVideoLink: req.body.introVideoLink
          ? req.body.introVideoLink
          : oldWorkout.introVideoLink,
          introVideoLength: req.body.introVideoLength
          ? req.body.introVideoLength
          : oldWorkout.introVideoLength,
        relatedEquipments: req.body.relatedEquipments
          ? req.body.relatedEquipments
          : oldWorkout.relatedEquipments,
        isRendered: req.body.isRendered
          ? req.body.isRendered
          : oldWorkout.isRendered,
        exercises: req.body.exercises, //ids
      };

      const workoutId = req.body._id;
      await Workout.findByIdAndUpdate(workoutId, update, {
        useFindAndModify: false,
      });
      const workout = await Workout.findById(req.body._id);
      res.status(200).json({
        data: workout._id,
        message: "Workout has been updated",
      });
    } else {
      let id = await createWorkout(req.body);
      res.status(200).json({
        data: id,
        message: "Workout has been created",
      });
    }
  } catch (error) {
    next(error);
  }
});

// @desc    Delete workout
// @route   Delete /api/workouts/:workoutId
const deleteWorkout = asyncHandler(async (req, res) => {
  const workout = await Workout.findById(req.params.workoutId);

  if (workout) {
    await workout.remove();
    res.json({ message: "Workout removed" });
  } else {
    res.status(404);
    throw new Error("Workout not found");
  }
});

module.exports = {
  createWorkout,
  getAllWorkouts,
  getWorkoutById,
  updateWorkout,
  deleteWorkout,
  // grantAccess,
};
