const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { FoodType } = require("../../models/RecipeModels/foodTypeModel");

// @desc    Create FoodType
// @route   POST /api/recipes/foodType/create
const createFoodType = asyncHandler(async (req, res, next) => {
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
    let newFoodType = new FoodType({
      name: req.body.name,
      language: req.body.language,
    });

    newFoodType = await newFoodType.save();
    if (!newFoodType) {
      return res.status(400).json("Food Type cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Food Type Created Successfully",
        newFoodType,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get FoodType by ID
// @route   GET /api/recipes/foodType/:foodTypeId
const getFoodTypeById = asyncHandler(async (req, res) => {
  const foodType = await FoodType.findById(req.params.foodTypeId);

  if (foodType) {
    res.json(foodType);
  } else {
    res.status(404);
    throw new Error("Body not found");
  }
});

// @desc    Get All FoodTypes
// @route   GET /api/recipes/foodType/
const getAllFoodTypes = asyncHandler(async (req, res) => {
  let foodTypes;

  if (req.query.language && req.query.language.length > 0) {
    foodTypes = await FoodType.find({ language: req.query.language });
  } else {
    foodTypes = await FoodType.find({});
  }

  if (foodTypes) {
    res.status(200).json({
      foodTypes,
    });
  } else {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

// @desc    Update FoodType by Id
// @route   PUT /api/recipes/foodType/:foodTypeId
const updateFoodType = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const foodTypeId = req.params.foodTypeId;
    await FoodType.findByIdAndUpdate(foodTypeId, update, {
      useFindAndModify: false,
    });
    const foodType = await FoodType.findById(foodTypeId);
    res.status(200).json({
      data: foodType,
      message: "Food Type has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete FoodType
// @route   Delete /api/recipes/foodType/:foodTypeId
const deleteFoodType = asyncHandler(async (req, res) => {
  const foodType = await FoodType.findById(req.params.foodTypeId);

  if (foodType) {
    await foodType.remove();
    res.json({ message: "Food Type removed" });
  } else {
    res.status(404);
    throw new Error("Food Type not found");
  }
});

module.exports = {
  createFoodType,
  getFoodTypeById,
  getAllFoodTypes,
  deleteFoodType,
  updateFoodType,
};
