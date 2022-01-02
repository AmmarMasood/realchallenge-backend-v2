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
} = require("../../controllers/RecipeControllers/recipeController");

router.get("/", getAllRecipes);
router.get("/all/users", protect, getAllUserRecipes);
router.post("/create", protect, createRecipe);
router.put("/:recipeId", protect, updateRecipe);
router.post("/:id/reviews", protect, createRecipeReview);
router.get("/:recipeId", getRecipeById);
router.delete("/:recipeId", deleteRecipe);
router.post("/:recipeId/comments", protect, createRecipeComment);

module.exports = router;
