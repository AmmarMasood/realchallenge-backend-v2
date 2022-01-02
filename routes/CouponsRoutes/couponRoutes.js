const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAllCoupons,
  deleteCoupon,
  getCouponById,
  updateCoupon,
  getCouponByCode,
  useCoupon,
} = require("../../controllers/CouponController/couponsController");
const { protect } = require("../../middlewares/authMiddleware");

router.post("/create", createCoupon);
router.get("/all", getAllCoupons);
router.delete("/:couponId", deleteCoupon);
router.get("/:couponId", getCouponById);
router.get("/code/:couponCode", protect, getCouponByCode);
router.get("/use/:couponId", protect, useCoupon);
router.put("/:couponId", updateCoupon);

module.exports = router;
