const generateToken = require("../../utils/generateToken");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const { roles } = require("../../utils/roles");
const bcrypt = require("bcryptjs");
const { tags } = require("../../models/ChallengeModels/tagsModel");
const {
  ChallengeGoals,
} = require("../../models/ChallengeModels/challengeGoalsModel");

// @desc    Create challengeGoals
// @route   POST /api/challengeGoals/create
const createChallengeGoals = asyncHandler(async (req, res, next) => {
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
    let newChallengeGoals = new ChallengeGoals({
      name: req.body.name,
    });

    newChallengeGoals = await newChallengeGoals.save();
    if (!newChallengeGoals) {
      return res.status(400).json("ChallengeGoals cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "ChallengeGoals Created Successfully",
        newChallengeGoals,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get challengeGoals by ID
// @route   GET /api/challengeGoals/:challengeGoalsId
const getChallengeGoalsById = asyncHandler(async (req, res) => {
  const challengeGoals = await ChallengeGoals.findById(
    req.params.challengeGoalsId
  );

  if (challengeGoals) {
    res.json(challengeGoals);
  } else {
    res.status(404);
    throw new Error("ChallengeGoals not found");
  }
});

// @desc    Get All challengeGoals
// @route   GET /api/challengeGoals/
const getAllChallengeGoals = asyncHandler(async (req, res) => {
  const challengeGoals = await ChallengeGoals.find({});
  if (challengeGoals) {
    res.status(200).json({
      challengeGoals,
    });
  } else {
    res.status(404);
    throw new Error("ChallengeGoals Cannot be fetched");
  }
});

// @desc    Update ChallengeGoals by Id
// @route   PUT /api/challengeGoals/:challengeGoalsId
const updateChallengeGoals = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const challengeGoalsId = req.params.challengeGoalsId;
    await ChallengeGoals.findByIdAndUpdate(challengeGoalsId, update, {
      useFindAndModify: false,
    });
    const challengeGoals = await ChallengeGoals.findById(challengeGoalsId);
    res.status(200).json({
      data: challengeGoals,
      message: "challengeGoals has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete challengeGoals
// @route   Delete /api/challengeGoals/:challengeGoalsId
const deleteChallengeGoals = asyncHandler(async (req, res) => {
  const challengeGoals = await ChallengeGoals.findById(
    req.params.challengeGoalsId
  );

  if (challengeGoals) {
    await challengeGoals.remove();
    res.json({ message: "challengeGoals removed" });
  } else {
    res.status(404);
    throw new Error("challengeGoals not found");
  }
});

module.exports = {
  createChallengeGoals,
  getChallengeGoalsById,
  getAllChallengeGoals,
  updateChallengeGoals,
  deleteChallengeGoals,
};
