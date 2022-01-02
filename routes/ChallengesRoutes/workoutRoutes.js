const express = require("express");
const router = express.Router();

const {
  createWorkout,
  getAllWorkouts,
  getWorkoutById,
  updateWorkout,
  deleteWorkout,
} = require("../../controllers/ChallengeControllers/workoutController");
const {
  protect,
  admin,
  trainer,
  blogger,
  nutrist,
  shopManager,
} = require("../../middlewares/authMiddleware");

router.post(
  "/create",
  //   protect,
  //   grantAccess("updateAny", "challenge"),
  createWorkout
);
router.get("/:workoutId", getWorkoutById);
router.get("/", getAllWorkouts);
router.put(
  "/:workoutId",
  //   protect,
  //   grantAccess("updateAny", "challenge"),
  updateWorkout
);
router.delete(
  "/:workoutId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  deleteWorkout
);

module.exports = router;
