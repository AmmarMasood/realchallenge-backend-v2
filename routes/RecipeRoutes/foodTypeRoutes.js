const express = require("express");
const router = express.Router();

const {
    createFoodType,
    getFoodTypeById,
    getAllFoodTypes,
    deleteFoodType,
    updateFoodType
} = require("../../controllers/RecipeControllers/foodTypeController");

router.get("/", getAllFoodTypes);
router.post("/create", createFoodType);
router.put("/:foodTypeId", updateFoodType);
router.get("/:foodTypeId", getFoodTypeById);
router.delete("/:foodTypeId", deleteFoodType);

module.exports = router;