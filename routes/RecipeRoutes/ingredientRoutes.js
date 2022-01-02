const express = require("express");
const router = express.Router();

const {
    createIngredient,
    getIngredientById,
    getAllIngredients,
    deleteIngredient,
    updateIngredient
} = require("../../controllers/RecipeControllers/ingredientController");

router.get("/", getAllIngredients);
router.post("/create", createIngredient);
router.put("/:ingredientId", updateIngredient);
router.get("/:ingredientId", getIngredientById);
router.delete("/:ingredientId", deleteIngredient);

module.exports = router;