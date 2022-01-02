const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { Recipe } = require("../../models/RecipeModels/recipeModel");

// @desc    Create Recipe
// @route   POST /api/recipes/recipe/create
const createRecipe = asyncHandler(async (req, res, next) => {
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
    let newRecipe = new Recipe({
      name: req.body.name,
      user: req.user.id,
      description: req.body.description,
      image: req.body.image,
      prepTime: req.body.prepTime,
      kCalPerPerson: req.body.kCalPerPerson,
      saturationIndex: req.body.saturationIndex,
      protein: req.body.protein,
      carbohydrate: req.body.carbohydrate,
      fat: req.body.fat,
      fiber: req.body.fiber,
      mealTypes: req.body.mealTypes,
      foodTypes: req.body.foodTypes,
      diet: req.body.diet,
      ingredients: req.body.ingredients,
      cookingProcess: req.body.cookingProcess,
      notes: req.body.notes,
      tips: req.body.tips,
      persons: req.body.persons,
      isPublic: req.body.isPublic,
      allowComments: req.body.allowComments,
      allowReviews: req.body.allowReviews,
    });

    newRecipe = await newRecipe.save();
    if (!newRecipe) {
      return res.status(400).json("Recipe cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Recipe Created Successfully",
        newRecipe,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get Recipe by ID
// @route   GET /api/recipes/recipe/:recipeId
const getRecipeById = asyncHandler(async (req, res) => {
  const recipe = await Recipe.findById(req.params.recipeId)
    .populate("ingredients.name")
    .populate("mealTypes")
    .populate("foodTypes")
    .populate("reviews.user")
    .populate("comments.user");

  if (recipe) {
    res.json(recipe);
  } else {
    res.status(404);
    throw new Error("Body not found");
  }
});

// @desc    Get All Recipes
// @route   GET /api/recipes/recipe/
const getAllRecipes = asyncHandler(async (req, res) => {
  const recipes = await Recipe.find({ isPublic: true }).populate(
    "ingredients.name"
  );
  if (recipes) {
    res.status(200).json({
      recipes: recipes,
    });
  } else {
    res.status(404);
    throw new Error("Body Cannot be fetched");
  }
});

// @desc    Get All user Recipes
// @route   GET /api/recipes/recipe/
const getAllUserRecipes = asyncHandler(async (req, res) => {
  console.log("yesss", req.user.role);
  let recipes;
  if (req.user.role === "admin") {
    recipes = await Recipe.find({}).populate("ingredients.name");
  } else {
    console.log("jere", req.user.role);
    recipes = await Recipe.find({ user: req.user.id }).populate(
      "ingredients.name"
    );
  }
  if (recipes) {
    res.status(200).json({
      recipes: recipes,
    });
  } else {
    res.status(404);
    throw new Error("Recipes Cannot be fetched");
  }
});

// @desc    Update recipe by Id
// @route   PUT /api/recipes/recipe/:recipeId
const updateRecipe = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const recipeId = req.params.recipeId;
    if (req.user.role === "admin") {
      await Recipe.findByIdAndUpdate(recipeId, update, {
        useFindAndModify: false,
      });
    } else {
      await Recipe.findByIdAndUpdate(
        recipeId,
        { ...update, adminApproved: false, isPublic: false },
        {
          useFindAndModify: false,
        }
      );
    }

    const recipe = await Recipe.findById(recipeId);
    res.status(200).json({
      data: recipe,
      message: "Recipe has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create Recipe Review
// @route   GET /api/recipe/:id/reviews
// @access  Private
const createRecipeReview = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const { rating, comment } = req.body;

    const recipe = await Recipe.findById(req.params.id);

    if (recipe) {
      const alreadyReviewed = recipe.reviews.find(
        (r) => r.user.toString() === req.user._id.toString()
      );

      if (alreadyReviewed) {
        res.status(400);
        throw new Error("Recipe already reviewed");
      }

      const review = {
        name: req.user.username,
        rating: Number(rating),
        comment,
        user: req.user._id,
      };

      recipe.reviews.push(review);

      recipe.rating =
        recipe.reviews.reduce((acc, item) => item.rating + acc, 0) /
        recipe.reviews.length;

      await recipe.save();
      console.log(recipe);
      res.status(201).json({ message: "Review added" });
    } else {
      res.status(404);
      throw new Error("Recipe not found");
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Delete Recipe
// @route   Delete /api/recipes/recipe/:recipeId
const deleteRecipe = asyncHandler(async (req, res) => {
  const recipe = await Recipe.findById(req.params.recipeId);

  if (recipe) {
    await recipe.remove();
    res.json({ message: "Recipe removed" });
  } else {
    res.status(404);
    throw new Error("Recipe not found");
  }
});

// @desc    Create recipe Comment
// @route   post /api/recipes/recipe/:id/comment
// @access  Private
const createRecipeComment = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const { text } = req.body;

    const recipe = await Recipe.findById(req.params.recipeId);
    if (recipe) {
      const comment = {
        user: req.user._id,
        text: text,
      };

      recipe.comments.push(comment);

      await recipe.save();
      console.log(recipe);
      const updatedRecipe = await Recipe.findById(req.params.recipeId).populate(
        "comments.user"
      );
      res.status(201).json({ comments: updatedRecipe.comments });
    } else {
      res.status(404);
      throw new Error("Recipe not found");
    }
  } catch (err) {
    console.log("error", err);
    return next(err);
  }
});

module.exports = {
  createRecipe,
  getRecipeById,
  getAllRecipes,
  deleteRecipe,
  updateRecipe,
  createRecipeReview,
  createRecipeComment,
  getAllUserRecipes,
};
