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
} = require("../../controllers/ChallengeControllers/exerciseController");

router.get("/", getAllExercises);
router.get("/user/all", protect, getAllUserExercises);
router.post("/create", protect, createExercise);
router.put("/:exerciseId", protect, updateExercise);
router.get("/:exerciseId", getExerciseById);
router.delete("/:exerciseId", deleteExercise);

module.exports = router;
