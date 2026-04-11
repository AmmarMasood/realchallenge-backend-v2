const express = require("express");
const router = express.Router();
const {
  getCreatorById,
  getChallengesByUserId,
  getRecipesByUserId,
} = require("../../controllers/UserControllers/creatorController");

router.get("/:id", getCreatorById);
router.get("/:id/challenges", getChallengesByUserId);
router.get("/:id/recipes", getRecipesByUserId);

module.exports = router;
