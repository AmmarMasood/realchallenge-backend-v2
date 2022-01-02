const express = require("express");
const router = express.Router();

const {
  createCategory,
  getAllCategory,
  deleteCategory,
} = require("../../controllers/ShopControllers/categoryController");
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

module.exports = router;
