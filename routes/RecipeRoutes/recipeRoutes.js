const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/authMiddleware");
const {
  createRecipe,
  getRecipeById,
  deleteRecipe,
  getAllRecipes,
  updateRecipe,
  createRecipeReview,
  createRecipeComment,
  getAllUserRecipes,
  getTranslationsByKey,
  getRecipeByTranslationKey,
  clapRecipe,
  unclapRecipe,
} = require("../../controllers/RecipeControllers/recipeController");

router.get("/translations/:translationKey", getTranslationsByKey);
router.get("/translation/:translationKey/:language", getRecipeByTranslationKey);
router.get("/", getAllRecipes);
router.get("/all/users", protect, getAllUserRecipes);
router.post("/create", protect, createRecipe);
router.put("/:recipeId", protect, updateRecipe);
router.post("/:id/reviews", protect, createRecipeReview);
router.get("/:recipeId", getRecipeById);
router.delete("/:recipeId", deleteRecipe);
router.post("/:recipeId/comments", protect, createRecipeComment);
router.put("/:id/clap", protect, clapRecipe);
router.put("/:id/unclap", protect, unclapRecipe);

module.exports = router;
