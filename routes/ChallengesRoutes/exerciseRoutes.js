const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/authMiddleware");

const {
  createExercise,
  updateExercise,
  getExerciseById,
  getAllExercises,
  deleteExercise,
  getAllUserExercises,
  destroy,
  getTranslationsByKey,
  getExerciseByTranslationKey,
} = require("../../controllers/ChallengeControllers/exerciseController");

router.get("/translations/:translationKey", getTranslationsByKey);
router.get("/translation/:translationKey/:language", getExerciseByTranslationKey);
router.get("/", getAllExercises);
router.get("/user/all", protect, getAllUserExercises);
router.post("/create", protect, createExercise);
router.put("/:exerciseId", protect, updateExercise);
router.get("/:exerciseId", getExerciseById);
router.delete("/:exerciseId", deleteExercise);
router.delete("/final/destroyExercises", destroy);
module.exports = router;
