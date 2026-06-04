const express = require("express");
const router = express.Router();

const {
  createAllergen,
  getAllergenById,
  getAllAllergens,
  deleteAllergen,
  updateAllergen,
} = require("../../controllers/RecipeControllers/allergenController");

router.get("/", getAllAllergens);
router.post("/create", createAllergen);
router.put("/:allergenId", updateAllergen);
router.get("/:allergenId", getAllergenById);
router.delete("/:allergenId", deleteAllergen);

module.exports = router;
