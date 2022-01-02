const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { MealType } = require("../../models/RecipeModels/mealTypeModel");

// @desc    Create MealType
// @route   POST /api/recipes/mealType/create
const createMealType = asyncHandler(async (req, res, next) => {
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
    let newMealType = new MealType({
      name: req.body.name,
    });

    newMealType = await newMealType.save();
    if (!newMealType) {
      return res.status(400).json("Meal Type cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Meal Type Created Successfully",
        newMealType,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get MealType by ID
// @route   GET /api/recipes/mealType/:mealTypeId
const getMealTypeById = asyncHandler(async (req, res) => {
  const mealType = await MealType.findById(req.params.mealTypeId);

  if (mealType) {
    res.json(mealType);
  } else {
    res.status(404);
    throw new Error("Body not found");
  }
});

// @desc    Get All MealTypes
// @route   GET /api/recipes/mealType/
const getAllMealTypes = asyncHandler(async (req, res) => {
  const mealTypes = await MealType.find({});
  if (mealTypes) {
    res.status(200).json({
      mealTypes,
    });
  } else {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

// @desc    Update MealType by Id
// @route   PUT /api/recipes/mealType/:mealTypeId
const updateMealType = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const mealTypeId = req.params.mealTypeId;
    await MealType.findByIdAndUpdate(mealTypeId, update, {
      useFindAndModify: false,
    });
    const mealType = await MealType.findById(mealTypeId);
    res.status(200).json({
      data: mealType,
      message: "Meal Type has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete MealType
// @route   Delete /api/recipes/mealType/:mealTypeId
const deleteMealType = asyncHandler(async (req, res) => {
  const mealType = await MealType.findById(req.params.mealTypeId);

  if (mealType) {
    await mealType.remove();
    res.json({ message: "Meal Type removed" });
  } else {
    res.status(404);
    throw new Error("Meal Type not found");
  }
});

module.exports = {
  createMealType,
  getMealTypeById,
  getAllMealTypes,
  deleteMealType,
  updateMealType,
};
