const express = require("express");
const router = express.Router();

const {
    createMealType,
    getMealTypeById,
    getAllMealTypes,
    deleteMealType,
    updateMealType
} = require("../../controllers/RecipeControllers/mealTypeController");

router.get("/", getAllMealTypes);
router.post("/create", createMealType);
router.put("/:mealTypeId", updateMealType);
router.get("/:mealTypeId", getMealTypeById);
router.delete("/:mealTypeId", deleteMealType);

module.exports = router;