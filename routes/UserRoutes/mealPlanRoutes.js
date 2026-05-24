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

// Reads kept open to match the existing recommendedWeeklyDiet pattern;
// writes require auth.
router.get("/current/:customerId", getCurrentWeek);
router.get("/next/:customerId", getNextWeek);
router.post("/generate-next/:customerId", protect, regenerateNext);
router.post("/swap/:customerId", protect, swapMeal);
router.post("/pin/recipe/:customerId", protect, pinRecipe);
router.post("/pin/day/:customerId", protect, pinDay);

router.get("/shopping-list/:customerId", getShoppingList);
router.post("/shopping-list/add-recipe/:customerId", protect, addRecipeToShopping);
router.post("/shopping-list/remove-recipe/:customerId", protect, removeRecipeFromShopping);
router.post("/shopping-list/sync-week/:customerId", protect, syncWeekShopping);
router.put("/shopping-list/item/:customerId", protect, updateShoppingItem);

router.get("/delivery-status/:customerId", getDeliveryStatus);

router.get("/pins/count/:customerId", getPinCount);
router.post("/pins/invalidate/:customerId", protect, invalidatePins);

module.exports = router;
