const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { TrainerGoal } = require("../../models/UserModels/trainerGoalModel");

// post /api/trainers/trainerGoals
const createTrainerGoal = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Trainer goal cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    console.log(req.body);
    let newBody = new TrainerGoal({
      name: req.body.name,
    });

    newBody = await newBody.save();
    if (!newBody) {
      return res.status(400).json("Trainer goal cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Trainer goal Created Successfully",
        newBody,
      });
    }
  } catch (err) {
    return next(err);
  }
});

const updateTrainerGoal = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const mealTypeId = req.params.goalId;
    await TrainerGoal.findByIdAndUpdate(mealTypeId, update, {
      useFindAndModify: false,
    });
    const mealType = await TrainerGoal.findById(mealTypeId);
    res.status(200).json({
      data: mealType,
      message: "Trainer Fitness Interest Updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get body by ID
// @route   GET /api/body/:bodyId
// const getBodyById = asyncHandler(async (req, res) => {
//   const body = await Body.findById(req.params.bodyId);

//   if (body) {
//     res.json(body);
//   } else {
//     res.status(404);
//     throw new Error("Body not found");
//   }
// });

// @desc    Get All body
// @route   GET /api/trainers/trainerGoals/all
const getAllTrainerGoals = asyncHandler(async (req, res) => {
  const body = await TrainerGoal.find({});
  console.log("lmao");
  if (body) {
    res.status(200).json({
      goals: body,
    });
  } else {
    res.status(404);
    throw new Error("Goals Cannot be fetched");
  }
});

// @desc    Update Body by Id
// @route   PUT /api/body/:id
// const updateBody = asyncHandler(async (req, res, next) => {
//   try {
//     const update = req.body;
//     const bodyId = req.params.bodyId;
//     await Body.findByIdAndUpdate(bodyId, update, {
//       useFindAndModify: false,
//     });
//     const body = await Body.findById(bodyId);
//     res.status(200).json({
//       data: body,
//       message: "Body has been updated",
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// @desc    Delete body
// @route   Delete /api/trainers/trainerGoals/:goalId
const deleteTrainerGoal = asyncHandler(async (req, res) => {
  const body = await TrainerGoal.findById(req.params.goalId);
  console.log(req.params.goalId);
  if (body) {
    await body.remove();
    res.json({ message: "Trainer Goal removed" });
  } else {
    res.status(404);
    throw new Error("Trainer Goal not found");
  }
});

module.exports = {
  createTrainerGoal,
  //   getBodyById,
  getAllTrainerGoals,
  //   updateBody,
  deleteTrainerGoal,
  updateTrainerGoal,
};
