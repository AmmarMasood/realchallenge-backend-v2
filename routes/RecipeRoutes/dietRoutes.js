const express = require("express");
const router = express.Router();

const {
    createDiet,
    getDietById,
    getAllDiets,
    deleteDiet,
    updateDiet
} = require("../../controllers/RecipeControllers/dietController");

router.get("/", getAllDiets);
router.post("/create", createDiet);
router.put("/:dietId", updateDiet);
router.get("/:dietId", getDietById);
router.delete("/:dietId", deleteDiet);

module.exports = router;