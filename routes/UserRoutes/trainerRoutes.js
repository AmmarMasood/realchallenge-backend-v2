const express = require("express");
const {
  getAllTrainerGoals,
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
router.get("/trainerGoals/all", getAllTrainerGoals);
router.post("/trainerGoals", createTrainerGoal);
router.delete("/trainerGoals/:goalId", deleteTrainerGoal);
router.put("/trainerGoals/:goalId", updateTrainerGoal);

module.exports = router;
