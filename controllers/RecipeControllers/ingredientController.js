const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { Ingredient } = require("../../models/RecipeModels/ingredientModel");

// @desc    Create Ingredient
// @route   POST /api/recipes/ingredient/create
const createIngredient = asyncHandler(async (req, res, next) => {
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
        let newIngredient = new Ingredient({
            name: req.body.name
        });

        newIngredient = await newIngredient.save();
        if (!newIngredient) {
            return res.status(400).json("Ingredient cannot be created!");
        } else {
            return res.status(201).json({
                mesage: "Ingredient Created Successfully",
                newIngredient,
            });
        }
    } catch (err) {
        return next(err);
    }
});

// @desc    Get Ingredient by ID
// @route   GET /api/recipes/ingredient/:ingredientId
const getIngredientById = asyncHandler(async (req, res) => {
    const ingredient = await Ingredient.findById(req.params.ingredientId);

    if (ingredient) {
        res.json(ingredient);
    } else {
        res.status(404);
        throw new Error("Body not found");
    }
});

// @desc    Get All Ingredients
// @route   GET /api/recipes/ingredient/
const getAllIngredients = asyncHandler(async (req, res) => {
    const ingredients = await Ingredient.find({});
    if (ingredients) {
        res.status(200).json({
            ingredients,
        });
    } else {
        res.status(404);
        throw new Error("Body Cannot be fetched");
    }
});

// @desc    Update Ingredient by Id
// @route   PUT /api/recipes/ingredient/:ingredientId
const updateIngredient = asyncHandler(async (req, res, next) => {
    try {
        const update = req.body;
        const ingredientId = req.params.ingredientId;
        await Ingredient.findByIdAndUpdate(ingredientId, update, {
            useFindAndModify: false,
        });
        const ingredient = await Ingredient.findById(ingredientId);
        res.status(200).json({
            data: ingredient,
            message: "Ingredient has been updated",
        });
    } catch (error) {
        next(error);
    }
});

// @desc    Delete Ingredient
// @route   Delete /api/recipes/ingredient/:ingredientId
const deleteIngredient = asyncHandler(async (req, res) => {
    const ingredient = await Ingredient.findById(req.params.ingredientId);

    if (ingredient) {
        await ingredient.remove();
        res.json({ message: "Ingredient removed" });
    } else {
        res.status(404);
        throw new Error("Ingredient not found");
    }
});

module.exports = {
    createIngredient,
    getIngredientById,
    getAllIngredients,
    deleteIngredient,
    updateIngredient
};