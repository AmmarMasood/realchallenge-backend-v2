const express = require("express");
const router = express.Router();

const {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductById,
} = require("../../controllers/ShopControllers/productController");
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
  createProduct
);
router.get("/", getAllProducts);
router.put(
  "/:productId",
  //   protect,
  //   grantAccess("updateAny", "challenge"),
  updateProduct
);
router.delete(
  "/:productId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  deleteProduct
);
router.get(
  "/:productId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  getProductById
);

module.exports = router;
