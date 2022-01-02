const express = require("express");
const router = express.Router();

const {
  createChallenge,
  getChallengeById,
  getAllChallenges,
  updateChallenge,
  deleteChallenge,
  createChallengeReview,
  grantAccess,
  getWeekByID,
  createChallengeComment,
  getAllUserChallenges,
} = require("../../controllers/ChallengeControllers/challengesController");
const { protect } = require("../../middlewares/authMiddleware");

router.post(
  "/create",
  protect,
  grantAccess("updateAny", "challenge"),
  createChallenge
);

router.get("/", getAllChallenges);
router.get("/users/all", protect, getAllUserChallenges);
router.get("/:challengeId", getChallengeById);
router.get("/:challengeId/:weekId", getWeekByID);
router.put("/:challengeId", protect, updateChallenge);
router.post("/:id/reviews", protect, createChallengeReview);
router.post("/:id/comments", protect, createChallengeComment);
router.delete(
  "/:challengeId",
  protect,
  grantAccess("deleteAny", "challenge"),
  deleteChallenge
);

module.exports = router;
