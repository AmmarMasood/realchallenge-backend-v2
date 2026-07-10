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

    // Get trainer ID from authenticated user
    const trainerId = req.user._id;

    let newBody = new TrainerGoal({
      name: req.body.name,
      icon: req.body.icon,
      language: req.body.language,
      trainerId: trainerId,
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
    const trainerId = req.user._id;
    const goalId = req.params.goalId;

    // Find the goal first to check ownership
    const existingGoal = await TrainerGoal.findById(goalId);

    if (!existingGoal) {
      res.status(404);
      throw new Error("Trainer Goal not found");
    }

    // Check if the goal belongs to the current user
    if (existingGoal.trainerId.toString() !== trainerId.toString()) {
      res.status(403);
      throw new Error("Not authorized to update this goal");
    }

    // Only allow updating name, icon, language (not trainerId)
    const update = {
      name: req.body.name,
      icon: req.body.icon,
      language: req.body.language,
    };

    await TrainerGoal.findByIdAndUpdate(goalId, update, {
      useFindAndModify: false,
    });

    const updatedGoal = await TrainerGoal.findById(goalId);
    res.status(200).json({
      data: updatedGoal,
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

// @desc    Get All trainer goals for the current user
// @route   GET /api/trainers/trainerGoals/all
const getAllTrainerGoals = asyncHandler(async (req, res) => {
  const trainerId = req.user._id;

  let query = { trainerId: trainerId };

  // Optionally filter by language
  if (req.query.language && req.query.language.length > 0) {
    query.language = req.query.language;
  }

  const goals = await TrainerGoal.find(query);

  if (goals) {
    res.status(200).json({
      goals: goals,
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

// @desc    Get trainer goals by trainer ID (public - for viewing trainer profiles)
// @route   GET /api/trainers/trainerGoals/trainer/:trainerId
const getTrainerGoalsByTrainerId = asyncHandler(async (req, res) => {
  const trainerId = req.params.trainerId;

  let query = { trainerId: trainerId };

  // Optionally filter by language
  if (req.query.language && req.query.language.length > 0) {
    query.language = req.query.language;
  }

  const goals = await TrainerGoal.find(query);

  res.status(200).json({
    goals: goals || [],
  });
});

// @desc    Delete trainer goal (only if owned by current user)
// @route   Delete /api/trainers/trainerGoals/:goalId
const deleteTrainerGoal = asyncHandler(async (req, res) => {
  const trainerId = req.user._id;
  const goal = await TrainerGoal.findById(req.params.goalId);

  if (!goal) {
    res.status(404);
    throw new Error("Trainer Goal not found");
  }

  // Check if the goal belongs to the current user
  if (goal.trainerId.toString() !== trainerId.toString()) {
    res.status(403);
    throw new Error("Not authorized to delete this goal");
  }

  await goal.remove();
  res.json({ message: "Trainer Goal removed" });
});

// @desc    Get all trainer goals in the database (public)
// @route   GET /api/trainers/trainerGoals/public/all
const getAllTrainerGoalsPublic = asyncHandler(async (req, res) => {
  let query = {};

  // Optionally filter by language
  if (req.query.language && req.query.language.length > 0) {
    query.language = req.query.language;
  }

  const goals = await TrainerGoal.find(query);

  // Multiple trainers can define the same goal name (e.g. two "Yoga" docs) —
  // surface each name once. The key includes language so that when no
  // language filter is passed, the same name still appears once per language.
  const seen = new Set();
  const uniqueGoals = (goals || []).filter((g) => {
    const key = `${(g.name || "").trim().toLowerCase()}|${g.language || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.status(200).json({
    goals: uniqueGoals,
  });
});

module.exports = {
  createTrainerGoal,
  getAllTrainerGoals,
  getAllTrainerGoalsPublic,
  getTrainerGoalsByTrainerId,
  deleteTrainerGoal,
  updateTrainerGoal,
};
