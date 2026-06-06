const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const { validationResult } = require("express-validator");
const { Recipe } = require("../../models/RecipeModels/recipeModel");
const { User } = require("../../models/UserModels/userModel");
const NotificationService = require("../../services/notificationService");
const { hasRole } = require("../../middlewares/authMiddleware");
const { generateTranslationKey } = require("../../utils/translationKey");

// Each ingredient row must carry EXACTLY ONE active quantity unit
// (g | ml | pieces) — client requirement: "exactly one active quantity per
// row," guaranteed in the implementation, not just in the admin UI. This is
// the data-layer guard so a bad API call / import / legacy record can't slip
// a multi-unit row past us. Returns an error string, or null if all rows are
// valid. A row with zero quantities is allowed (e.g. "to taste").
function validateSingleUnitRows(ingredients) {
  if (!Array.isArray(ingredients)) return null;
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i] || {};
    const active = ["weight", "volume", "pieces"].filter(
      (k) => Number(ing[k]) > 0
    );
    if (active.length > 1) {
      const label =
        (ing.name && (ing.name.name || ing.name)) || `row ${i + 1}`;
      return `Ingredient "${label}" has more than one quantity unit set (${active.join(
        ", "
      )}). Each row may use only grams OR ml OR pieces.`;
    }
  }
  return null;
}

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
    const unitError = validateSingleUnitRows(req.body.ingredients);
    if (unitError) {
      return res.status(400).json({ message: unitError });
    }
    // Generate or use provided translationKey
    const translationKey = req.body.translationKey ||
      generateTranslationKey("recipe", req.body.name);

    let newRecipe = new Recipe({
      translationKey,
      language: req.body.language,
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
      allergens: req.body.allergens,
      ingredients: req.body.ingredients,
      cookingProcess: req.body.cookingProcess,
      notes: req.body.notes,
      tips: req.body.tips,
      persons: req.body.persons,
      isPublic: req.body.isPublic,
      allowComments: req.body.allowComments,
      allowReviews: req.body.allowReviews,
      adminApproved: hasRole(req.user, "admin") ? true : false,
      // alternativeLanguage removed - using translationKey for multi-language support
    });

    newRecipe = await newRecipe.save();

    if (req.body.sendNotification) {
      await NotificationService.recipeCreated(newRecipe, req.user.id);
    }
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
// @route   GET /api/recipes/recipe?language=eng[&supplementOnly=true]
const getAllRecipes = asyncHandler(async (req, res) => {
  const filter = {
    isPublic: true,
    adminApproved: true,
    language: req.query.language,
  };
  // Supplement-only callers (e.g., user-dashboard supplement picker) want
  // just the supplement-flagged recipes. Defaults to all when omitted.
  if (req.query.supplementOnly === "true") {
    filter.isSupplement = true;
  }
  const recipes = await Recipe.find(filter).populate("ingredients.name");
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
  console.log("yesss", hasRole(req.user, "admin"));
  let recipes;
  if (req.query.language && req.query.language.length > 0) {
    if (hasRole(req.user, "admin")) {
      recipes = await Recipe.find({ language: req.query.language })
        .populate("ingredients.name")
        .populate("updatedBy");
    } else {
      recipes = await Recipe.find({
        user: req.user.id,
        language: req.query.language,
      })
        .populate("ingredients.name")
        .populate("updatedBy");
    }
  } else {
    if (hasRole(req.user, "admin")) {
      recipes = await Recipe.find({})
        .populate("ingredients.name")
        .populate("updatedBy");
    } else {
      recipes = await Recipe.find({
        user: req.user.id,
      })
        .populate("ingredients.name")
        .populate("updatedBy");
    }
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
    // Guard the one-active-unit rule on update too (only when ingredients
    // are part of this update payload).
    if (req.body && req.body.ingredients) {
      const unitError = validateSingleUnitRows(req.body.ingredients);
      if (unitError) {
        return res.status(400).json({ message: unitError });
      }
    }
    const update = { ...req.body, updatedBy: req.user._id };
    const recipeId = req.params.recipeId;
    if (hasRole(req.user, "admin")) {
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
      if (!recipe.allowReviews) {
        res.status(403);
        throw new Error("Reviews are not allowed for this recipe");
      }

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
      if (!recipe.allowComments) {
        res.status(403);
        throw new Error("Comments are not allowed for this recipe");
      }

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

      // Notify recipe creator about the new comment
      if (recipe.user && recipe.user.toString() !== req.user._id.toString()) {
        await NotificationService.commentAdded(
          "recipe",
          recipe,
          recipe.user,
          req.user._id.toString(),
          req.user.username || req.user.firstName || "Someone"
        );
      }

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

const destroy = asyncHandler(async (req, res, next) => {
  try {
    const a = await Recipe.deleteMany({});
    console.log("deletesd");
    res.status(200).send({
      status: "Successfully removed all documents from reciepe files",
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// @desc    Get all translations of a recipe by translationKey
// @route   GET /api/recipes/recipe/translations/:translationKey
// @access  Public
const getTranslationsByKey = asyncHandler(async (req, res) => {
  const { translationKey } = req.params;
  const { excludeLanguage } = req.query;

  let query = { translationKey };
  if (excludeLanguage) {
    query.language = { $ne: excludeLanguage };
  }

  const translations = await Recipe.find(query)
    .select('_id name language translationKey')
    .lean();

  res.status(200).json({
    translations,
    count: translations.length,
  });
});

// @desc    Get a recipe in a specific language by translationKey
// @route   GET /api/recipes/recipe/translation/:translationKey/:language
// @access  Public
const getRecipeByTranslationKey = asyncHandler(async (req, res) => {
  const { translationKey, language } = req.params;

  const recipe = await Recipe.findOne({ translationKey, language })
    .populate("ingredients.name")
    .populate("mealTypes")
    .populate("foodTypes")
    .populate("reviews.user")
    .populate("comments.user");

  if (recipe) {
    res.status(200).json({
      recipe,
      message: "Recipe retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Recipe not found for this language");
  }
});

// @route    PUT /api/recipes/recipe/:id/clap
// @desc     Clap a Recipe
// @access   Private
const clapRecipe = asyncHandler(async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);

    if (!recipe) {
      return res.status(404).json({ msg: "Recipe not found" });
    }

    // Creator cannot clap their own recipe
    if (recipe.user && recipe.user.toString() === req.user.id) {
      return res.status(403).json({ msg: "Cannot clap your own recipe" });
    }

    // Check if already clapped by this user
    if (
      recipe.claps.filter((clap) => clap.user.toString() === req.user.id)
        .length > 0
    ) {
      return res.status(400).json({ msg: "Recipe already clapped" });
    }

    recipe.claps.unshift({ user: req.user.id });

    await recipe.save();

    res.status(200).json(recipe.claps);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @route    PUT /api/recipes/recipe/:id/unclap
// @desc     Unclap a Recipe
// @access   Private
const unclapRecipe = asyncHandler(async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);

    if (!recipe) {
      return res.status(404).json({ msg: "Recipe not found" });
    }

    // Check if not yet clapped
    if (
      recipe.claps.filter((clap) => clap.user.toString() === req.user.id)
        .length === 0
    ) {
      return res.status(400).json({ msg: "Recipe has not yet been clapped" });
    }

    // Get remove index
    const removeIndex = recipe.claps
      .map((clap) => clap.user.toString())
      .indexOf(req.user.id);

    recipe.claps.splice(removeIndex, 1);

    await recipe.save();

    res.json(recipe.claps);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Server Error");
  }
});

// @desc    Acquire edit lock on a recipe
// @route   POST /api/recipes/recipe/:id/lock
// @access  Private
const acquireEditLock = asyncHandler(async (req, res) => {
  const LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds — heartbeat renews every 10s
  const recipeId = req.params.id;
  const userId = req.user._id;
  const userName = req.user.firstName
    ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
    : req.user.username || "Someone";

  // Atomic: only acquire if unlocked, expired, or same user
  const result = await Recipe.findOneAndUpdate(
    {
      _id: recipeId,
      $or: [
        { "editLock.lockedBy": null },
        { "editLock.lockedBy": userId },
        { "editLock.lockedAt": { $lt: new Date(Date.now() - LOCK_TIMEOUT_MS) } },
      ],
    },
    {
      $set: {
        "editLock.lockedBy": userId,
        "editLock.lockedByName": userName,
        "editLock.lockedAt": new Date(),
      },
    },
    { new: true }
  );

  if (result) {
    return res.status(200).json({
      locked: true,
      expiresAt: new Date(result.editLock.lockedAt.getTime() + LOCK_TIMEOUT_MS),
    });
  }

  // Lock held by someone else — fetch to report who
  const recipe = await Recipe.findById(recipeId).select("editLock").lean();
  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  return res.status(423).json({
    error: "RECIPE_LOCKED",
    lockedBy: recipe.editLock.lockedByName || "Someone",
    lockedAt: recipe.editLock.lockedAt,
  });
});

// @desc    Release edit lock on a recipe
// @route   DELETE /api/recipes/recipe/:id/lock
// @access  Private
const releaseEditLock = asyncHandler(async (req, res) => {
  const recipeId = req.params.id;
  const userId = req.user._id;
  const isAdmin = hasRole(req.user, "admin");

  // Only the lock holder or an admin can release
  const filter = { _id: recipeId };
  if (!isAdmin) {
    filter["editLock.lockedBy"] = userId;
  }

  await Recipe.findOneAndUpdate(filter, {
    $set: {
      "editLock.lockedBy": null,
      "editLock.lockedByName": null,
      "editLock.lockedAt": null,
    },
  });

  res.status(200).json({ released: true });
});

// @desc    Renew (heartbeat) edit lock on a recipe
// @route   PUT /api/recipes/recipe/:id/lock
// @access  Private
const renewEditLock = asyncHandler(async (req, res) => {
  const recipeId = req.params.id;
  const userId = req.user._id;

  const result = await Recipe.findOneAndUpdate(
    { _id: recipeId, "editLock.lockedBy": userId },
    { $set: { "editLock.lockedAt": new Date() } },
    { new: true }
  );

  if (!result) {
    return res.status(403).json({ message: "You do not hold the lock on this recipe" });
  }

  const LOCK_TIMEOUT_MS = 30 * 1000;
  res.status(200).json({
    renewed: true,
    expiresAt: new Date(result.editLock.lockedAt.getTime() + LOCK_TIMEOUT_MS),
  });
});

// @desc    Release edit lock via sendBeacon (POST because sendBeacon only supports POST)
// @route   POST /api/recipes/recipe/:id/unlock
// NOTE: This route does NOT use protect middleware — it extracts the token from the body
//       because sendBeacon cannot set Authorization headers.
const releaseEditLockBeacon = asyncHandler(async (req, res) => {
  const recipeId = req.params.id;
  const token = req.body.token;

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  let decoded;
  try {
    const rawToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const user = await User.findById(decoded.id).select("roles");
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  const isAdmin = hasRole(user, "admin");
  const filter = { _id: recipeId };
  if (!isAdmin) {
    filter["editLock.lockedBy"] = user._id;
  }

  await Recipe.findOneAndUpdate(filter, {
    $set: {
      "editLock.lockedBy": null,
      "editLock.lockedByName": null,
      "editLock.lockedAt": null,
    },
  });

  res.status(200).json({ released: true });
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
  destroy,
  getTranslationsByKey,
  getRecipeByTranslationKey,
  clapRecipe,
  unclapRecipe,
  acquireEditLock,
  releaseEditLock,
  renewEditLock,
  releaseEditLockBeacon,
};
