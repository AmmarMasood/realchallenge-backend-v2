const express = require("express");
const {
  getAllTrainerGoals,
  getAllTrainerGoalsPublic,
  getTrainerGoalsByTrainerId,
  createTrainerGoal,
  deleteTrainerGoal,
  updateTrainerGoal,
} = require("../../controllers/UserControllers/trainerGoalController");
const router = express.Router();
const {
  createTrainer,
  getAllTrainers,
  getTrainerById,
  updateTrainerById,
  createtrainerComment,
} = require("../../controllers/UserControllers/trainersController");
const {
  protect,
  admin,
  trainer,
  blogger,
  nutrist,
  shopManager,
} = require("../../middlewares/authMiddleware");

router.post("/create", protect, createTrainer);
router.get("/all", getAllTrainers);
router.get("/:trainerId", getTrainerById);
router.put("/:trainerId", protect, updateTrainerById);

router.post("/:trainerId/comments", protect, createtrainerComment);

// Public route - get all trainer goals in database
router.get("/trainerGoals/public/all", getAllTrainerGoalsPublic);

// Trainer Goals routes - protected (for managing own goals)
router.get("/trainerGoals/all", protect, getAllTrainerGoals);
router.post("/trainerGoals", protect, createTrainerGoal);
router.delete("/trainerGoals/:goalId", protect, deleteTrainerGoal);
router.put("/trainerGoals/:goalId", protect, updateTrainerGoal);

// Public route - view trainer's goals on their profile
router.get("/trainerGoals/trainer/:trainerId", getTrainerGoalsByTrainerId);

module.exports = router;
