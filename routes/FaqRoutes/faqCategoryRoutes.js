const express = require("express");
const router = express.Router();

const {
  createCategory,
  getAllCategory,
  deleteCategory,
  updateCategory,
} = require("../../controllers/FaqControllers/faqCategoryController");
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
  createCategory
);
router.get("/", getAllCategory);

router.delete(
  "/:categoryId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  deleteCategory
);

router.put(
  "/:categoryId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  updateCategory
);
module.exports = router;
