const express = require("express");
const router = express.Router();

const {
  createChallengeGoals,
  getChallengeGoalsById,
  getAllChallengeGoals,
  updateChallengeGoals,
  deleteChallengeGoals,
} = require("../../controllers/ChallengeControllers/challengeGoalsController");

router.post("/create", createChallengeGoals);
router.get("/:challengeGoalsId", getChallengeGoalsById);
router.get("/", getAllChallengeGoals);
router.put("/:challengeGoalsId", updateChallengeGoals);
router.delete("/:challengeGoalsId", deleteChallengeGoals);

module.exports = router;
