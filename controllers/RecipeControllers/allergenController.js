const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { Allergen } = require("../../models/RecipeModels/allergenModel");

// @desc    Create Allergen
// @route   POST /api/recipes/allergen/create
const createAllergen = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    let newAllergen = new Allergen({
      name: req.body.name,
      language: req.body.language,
    });

    newAllergen = await newAllergen.save();
    if (!newAllergen) {
      return res.status(400).json("Allergen cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Allergen Created Successfully",
        newAllergen,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get Allergen by ID
// @route   GET /api/recipes/allergen/:allergenId
const getAllergenById = asyncHandler(async (req, res) => {
  const allergen = await Allergen.findById(req.params.allergenId);
  if (allergen) {
    res.json(allergen);
  } else {
    res.status(404);
    throw new Error("Allergen not found");
  }
});

// @desc    Get All Allergens
// @route   GET /api/recipes/allergen/
const getAllAllergens = asyncHandler(async (req, res) => {
  let allergens;
  if (req.query.language && req.query.language.length > 0) {
    allergens = await Allergen.find({ language: req.query.language });
  } else {
    allergens = await Allergen.find({});
  }
  if (allergens) {
    res.status(200).json({
      allergens,
    });
  } else {
    res.status(404);
    throw new Error("Allergens cannot be fetched");
  }
});

// @desc    Update Allergen by Id
// @route   PUT /api/recipes/allergen/:allergenId
const updateAllergen = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const allergenId = req.params.allergenId;
    await Allergen.findByIdAndUpdate(allergenId, update, {
      useFindAndModify: false,
    });
    const allergen = await Allergen.findById(allergenId);
    res.status(200).json({
      data: allergen,
      message: "Allergen has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete Allergen
// @route   Delete /api/recipes/allergen/:allergenId
const deleteAllergen = asyncHandler(async (req, res) => {
  const allergen = await Allergen.findById(req.params.allergenId);
  if (allergen) {
    await allergen.remove();
    res.json({ message: "Allergen removed" });
  } else {
    res.status(404);
    throw new Error("Allergen not found");
  }
});

module.exports = {
  createAllergen,
  getAllergenById,
  getAllAllergens,
  deleteAllergen,
  updateAllergen,
};
