const express = require("express");
const router = express.Router();

const {
  createChallenge,
  getChallengeById,
  forceDeactivateChallenge,
  reactivateChallenge,
  getChallengeOwners,
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
  acquireEditLock,
  releaseEditLock,
  renewEditLock,
  releaseEditLockBeacon,
} = require("../../controllers/ChallengeControllers/challengesController");
const {
  protect,
  optionalAuth,
  admin,
} = require("../../middlewares/authMiddleware");

router.post(
  "/create",
  protect,
  // grantAccess("updateAny", "challenge"),
  createChallenge
);

router.get("/", optionalAuth, getAllChallenges);
router.get("/intensity-groups", protect, getIntensityGroups);
router.get("/group/:groupId", optionalAuth, getChallengesByGroup);
router.get("/users/all", protect, getAllUserChallenges);
router.get("/translations/:translationKey", getTranslationsByKey);
// optionalAuth (not protect): these stay public, but need to know the caller so
// an admin/owning trainer can still preview an unpublished challenge.
router.get(
  "/translation/:translationKey/:language",
  optionalAuth,
  getChallengeByTranslationKey
);
router.get("/:challengeId/version", protect, getChallengeVersion);
router.post("/:challengeId/lock", protect, acquireEditLock);
router.put("/:challengeId/lock", protect, renewEditLock);
router.delete("/:challengeId/lock", protect, releaseEditLock);
router.post("/:challengeId/unlock", releaseEditLockBeacon);
// Admin only. Force-deactivate removes a challenge for everyone including
// existing owners; un-publishing (isPublic) is the softer action that only stops
// new sales. Owners are returned so support can issue discount codes.
router.get("/:challengeId/owners", protect, admin, getChallengeOwners);
router.put("/:challengeId/force-deactivate", protect, admin, forceDeactivateChallenge);
router.put("/:challengeId/reactivate", protect, admin, reactivateChallenge);

router.get("/:challengeId", optionalAuth, getChallengeById);
// optionalAuth so the controller can identify the caller and refuse a
// non-owner. Not `protect`: staff and owning trainers reach it too, and the
// controller decides, not the router.
router.get("/:challengeId/:weekId", optionalAuth, getWeekByID);
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
