const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { Diet } = require("../../models/RecipeModels/dietModel");

// @desc    Create Diet
// @route   POST /api/recipes/diet/create
const createDiet = asyncHandler(async (req, res, next) => {
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
    let newDiet = new Diet({
      name: req.body.name,
      language: req.body.language,
    });

    newDiet = await newDiet.save();
    if (!newDiet) {
      return res.status(400).json("Diet cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Diet Created Successfully",
        newDiet,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get Diet by ID
// @route   GET /api/recipes/diet/:dietId
const getDietById = asyncHandler(async (req, res) => {
  const diet = await Diet.findById(req.params.dietId);

  if (diet) {
    res.json(diet);
  } else {
    res.status(404);
    throw new Error("Body not found");
  }
});

// @desc    Get All Diets
// @route   GET /api/recipes/diet/
const getAllDiets = asyncHandler(async (req, res) => {
  let diets;
  if (req.query.language && req.query.language.length > 0) {
    diets = await Diet.find({ language: req.query.language });
  } else {
    diets = await Diet.find({});
  }
  if (diets) {
    res.status(200).json({
      diets,
    });
  } else {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

// @desc    Update Diet by Id
// @route   PUT /api/recipes/diet/:dietId
const updateDiet = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const dietId = req.params.dietId;
    await Diet.findByIdAndUpdate(dietId, update, {
      useFindAndModify: false,
    });
    const diet = await Diet.findById(dietId);
    res.status(200).json({
      data: diet,
      message: "Diet has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete Diet
// @route   Delete /api/recipes/diet/:dietId
const deleteDiet = asyncHandler(async (req, res) => {
  const diet = await Diet.findById(req.params.dietId);

  if (diet) {
    await diet.remove();
    res.json({ message: "Diet removed" });
  } else {
    res.status(404);
    throw new Error("Diet not found");
  }
});

module.exports = {
  createDiet,
  getDietById,
  getAllDiets,
  deleteDiet,
  updateDiet,
};
