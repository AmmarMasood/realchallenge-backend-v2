const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { MealType, MEAL_TYPE_SLOTS } = require("../../models/RecipeModels/mealTypeModel");

// Idempotently ensure all canonical slot docs exist. Cheap to call.
async function ensureCanonicalMealTypes() {
  const existing = await MealType.find({}).select("name").lean();
  const present = new Set(existing.map((m) => m.name));
  const missing = MEAL_TYPE_SLOTS.filter((s) => !present.has(s));
  if (missing.length === 0) return;
  await MealType.insertMany(missing.map((name) => ({ name })));
}

// @desc    Create (or fetch) a canonical MealType slot. Idempotent.
// @route   POST /api/recipes/mealType/create
const createMealType = asyncHandler(async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    const name = req.body && req.body.name;
    if (!MEAL_TYPE_SLOTS.includes(name)) {
      return res.status(400).json({
        message: "Meal Type name must be one of the fixed slot keys",
        allowed: MEAL_TYPE_SLOTS,
      });
    }
    let mealType = await MealType.findOne({ name });
    if (!mealType) mealType = await MealType.create({ name });
    return res.status(201).json({
      mesage: "Meal Type Ready",
      newMealType: mealType,
    });
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

// @desc    Get All MealTypes (lazy-seeds the 5 canonical slots if missing).
// @route   GET /api/recipes/mealType/
const getAllMealTypes = asyncHandler(async (req, res) => {
  await ensureCanonicalMealTypes();
  const mealTypes = await MealType.find({});
  res.status(200).json({ mealTypes });
});

// MealType slot keys are a fixed enum — renaming or deleting them would
// break recipe references. Both endpoints are intentionally disabled.
const updateMealType = asyncHandler(async (req, res) => {
  res.status(405).json({
    message:
      "Meal Type slots are fixed and cannot be renamed. Update the MEAL_TYPE_SLOTS enum to add a slot.",
  });
});

const deleteMealType = asyncHandler(async (req, res) => {
  res.status(405).json({
    message:
      "Meal Type slots are fixed and cannot be deleted. Update the MEAL_TYPE_SLOTS enum to remove a slot.",
  });
});

module.exports = {
  createMealType,
  getMealTypeById,
  getAllMealTypes,
  deleteMealType,
  updateMealType,
};
