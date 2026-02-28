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
  destroy,
  getTranslationsByKey,
  getChallengeByTranslationKey,
  getIntensityGroups,
  getChallengesByGroup,
  getChallengeVersion,
} = require("../../controllers/ChallengeControllers/challengesController");
const { protect } = require("../../middlewares/authMiddleware");

router.post(
  "/create",
  protect,
  // grantAccess("updateAny", "challenge"),
  createChallenge
);

router.get("/", getAllChallenges);
router.get("/intensity-groups", protect, getIntensityGroups);
router.get("/group/:groupId", getChallengesByGroup);
router.get("/users/all", protect, getAllUserChallenges);
router.get("/translations/:translationKey", getTranslationsByKey);
router.get("/translation/:translationKey/:language", getChallengeByTranslationKey);
router.get("/:challengeId/version", protect, getChallengeVersion);
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

router.route("/destroyChallenges").get(destroy);

module.exports = router;
