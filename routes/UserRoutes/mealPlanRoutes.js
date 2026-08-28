const express = require("express");
const router = express.Router();
const {
  getCurrentWeek,
  getNextWeek,
  regenerateNext,
  swapMeal,
  pinRecipe,
  pinDay,
  getShoppingList,
  addRecipeToShopping,
  removeRecipeFromShopping,
  syncWeekShopping,
  updateShoppingItem,
  getDeliveryStatus,
  getPinCount,
  invalidatePins,
} = require("../../controllers/UserControllers/mealPlanController");
const { protect } = require("../../middlewares/authMiddleware");

const {
  requireNutritionAccess,
  nutritionAccessFor,
} = require("../../services/nutritionAccess");
const { User } = require("../../models/UserModels/userModel");

// Every route here is the Nutrition tab, so all of them require a logged-in user
// AND nutrition access (an active plan, or purchased days remaining).
//
// The reads used to be unauthenticated, held open by a worry that the frontend's
// Authorization header did not survive a page refresh. It does now —
// `setAuthToken` runs at app boot in index.js — so they are closed.
const nutrition = [protect, requireNutritionAccess];

// Access state for the UI. Deliberately NOT behind requireNutritionAccess —
// a locked-out user has to be able to read this to be told why, and what to do.
router.get("/access", protect, async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: "customerDetails",
    populate: { path: "membership" },
  });
  res.json(nutritionAccessFor(user && user.customerDetails));
});

router.get("/current/:customerId", ...nutrition, getCurrentWeek);
router.get("/next/:customerId", ...nutrition, getNextWeek);
router.post("/generate-next/:customerId", ...nutrition, regenerateNext);
router.post("/swap/:customerId", ...nutrition, swapMeal);
router.post("/pin/recipe/:customerId", ...nutrition, pinRecipe);
router.post("/pin/day/:customerId", ...nutrition, pinDay);

router.get("/shopping-list/:customerId", ...nutrition, getShoppingList);
router.post("/shopping-list/add-recipe/:customerId", ...nutrition, addRecipeToShopping);
router.post("/shopping-list/remove-recipe/:customerId", ...nutrition, removeRecipeFromShopping);
router.post("/shopping-list/sync-week/:customerId", ...nutrition, syncWeekShopping);
router.put("/shopping-list/item/:customerId", ...nutrition, updateShoppingItem);

router.get("/delivery-status/:customerId", ...nutrition, getDeliveryStatus);

router.get("/pins/count/:customerId", ...nutrition, getPinCount);
router.post("/pins/invalidate/:customerId", ...nutrition, invalidatePins);

module.exports = router;
