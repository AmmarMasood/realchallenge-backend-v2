const express = require("express");
const router = express.Router();
const {
  swapRecipe,
  createCustomer,
  getCustomerById,
  getAllCustomers,
  updateCustomer,
  getRecommendedChallenge,
  recommendedWeeklyDiet,
  setFavouriteRecipe,
  unfavouriteRecipe,
  getAllFavouriteRecipes,
  updateChallengeProgress,
  getChallengeProgress,
  replaceFreeChallenge,
  addFreeChallenge,
  getUserPoints,
  availUserPoints,
} = require("../../controllers/UserControllers/customerDetailsController");
const {
  protect,
  admin,
  customer,
} = require("../../middlewares/authMiddleware");

// TODO FIX THE PROTECTION OF ROUTES
router.post("/create", protect, createCustomer);
router.get("/all", protect, getAllCustomers);
router.get(
  "/recommendedChallenges/:customerId",
  protect,

  getRecommendedChallenge
);
router.get(
  "/recommendedWeeklyDiet/:customerId",
  // protect,
  recommendedWeeklyDiet
);
router.post("/swap/:customerId", protect, swapRecipe);
// TODO PLEASE FIX THIS PROTECTION AMD TEST AGAIN
router.get("/:customerId", getCustomerById);
router.put("/:customerId", protect, updateCustomer);
router.get(
  "/favouriteRecipe/:customerId",
  protect,

  getAllFavouriteRecipes
);
router.put(
  "/favouriteRecipe/:customerId",
  protect,

  setFavouriteRecipe
);
router.put(
  "/unfavouriteRecipe/:customerId",
  protect,

  unfavouriteRecipe
);

router.put(
  "/track-challenge/:customerId",
  protect,

  updateChallengeProgress
);

router.get("/points/get-points", protect, getUserPoints);
router.get("/points/use-points", protect, availUserPoints);
router.get("/track-challenge/:challengeId", protect, getChallengeProgress);
router.post("/replace-free-challenge", protect, replaceFreeChallenge);
router.post("/add-free-challenge", protect, addFreeChallenge);

module.exports = router;
