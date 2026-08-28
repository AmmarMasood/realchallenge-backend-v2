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
const { protect, admin } = require("../../middlewares/authMiddleware");

// Admin only: these were open, so anyone could mint a 100%-off coupon or
// delete the lot. `updateCoupon` also reads req.user, so it threw without auth.
router.post("/create", protect, admin, createCoupon);
router.get("/all", protect, admin, getAllCoupons);
router.delete("/:couponId", protect, admin, deleteCoupon);
router.get("/:couponId", protect, admin, getCouponById);
router.get("/code/:couponCode", protect, getCouponByCode);
router.get("/use/:couponId", protect, useCoupon);
router.put("/:couponId", protect, admin, updateCoupon);

module.exports = router;
