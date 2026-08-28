const express = require("express");
const router = express.Router();
const {
  swapRecipe,
  createCustomer,
  getCustomerById,
  getAllCustomers,
  updateCustomer,
  getRecommendedChallenge,
  setFavouriteRecipe,
  unfavouriteRecipe,
  getAllFavouriteRecipes,
  setFavouriteChallenge,
  unfavouriteChallenge,
  getAllFavouriteChallenges,
  updateChallengeProgress,
  getChallengeProgress,
  setLastPlayedChallenge,
  replaceFreeChallenge,
  addFreeChallenge,
  getUserPoints,
  availUserPoints,
  getPhotoUploadUrl,
  confirmPhotoUpload,
  addToShoppingCart,
  removeFromShoppingCart,
  getShoppingCart,
} = require("../../controllers/UserControllers/customerDetailsController");
const {
  protect,
  admin,
  customer,
} = require("../../middlewares/authMiddleware");

// TODO FIX THE PROTECTION OF ROUTES
router.post("/create", protect, createCustomer);
router.post("/photo-upload", protect, getPhotoUploadUrl);
router.post("/photo-upload/confirm", protect, confirmPhotoUpload);
router.get("/all", protect, getAllCustomers);
router.get(
  "/recommendedChallenges/:customerId",
  protect,

  getRecommendedChallenge
);
// REMOVED: GET /recommendedWeeklyDiet/:customerId — see the note in
// customerDetailsController.js. Meal plans are served by /api/meal-plan.
// (It was also unauthenticated, which is why `protect` is commented out above.)
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

router.get(
  "/favouriteChallenge/:customerId",
  protect,
  getAllFavouriteChallenges
);
router.put(
  "/favouriteChallenge/:customerId",
  protect,
  setFavouriteChallenge
);
router.put(
  "/unfavouriteChallenge/:customerId",
  protect,
  unfavouriteChallenge
);

router.put(
  "/track-challenge/:customerId",
  protect,

  updateChallengeProgress
);

router.get("/shoppingCart/:customerId", protect, getShoppingCart);
router.put("/shoppingCart/:customerId", protect, addToShoppingCart);
router.put("/removeShoppingCart/:customerId", protect, removeFromShoppingCart);

router.get("/points/get-points", protect, getUserPoints);
router.post("/points/redeem", protect, availUserPoints);
router.get("/track-challenge/:challengeId", protect, getChallengeProgress);
router.put("/last-played/:challengeId", protect, setLastPlayedChallenge);
router.post("/replace-free-challenge", protect, replaceFreeChallenge);
router.post("/add-free-challenge", protect, addFreeChallenge);

module.exports = router;
