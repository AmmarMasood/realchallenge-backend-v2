/**
 * Coupon validation and redemption.
 *
 * Two rules the checkout depends on:
 *  - validating a coupon must NOT spend it. The browser validates on "Apply",
 *    which happens before the user is sent to Mollie; spending there meant an
 *    abandoned checkout burned the code permanently (the user lands in
 *    `couponUsers` and can never redeem it again).
 *  - the discount is applied server-side from the stored `discountPercent`.
 *    The browser used to compute the discounted price and post it as the amount
 *    to charge, so any price could be claimed for any purchase.
 */
const { Coupons } = require("../models/CouponModel/couponsModel");

// The admin panel stores scope as these labels rather than the package ids.
const PACKAGE_LABELS = {
  CHALLENGE_1: "CHALLENGE ONE",
  CHALLENGE_3: "CHALLENGE THREE",
  CHALLENGE_12: "CHALLENGE TWELVE",
};

/** An error carrying an HTTP status, so callers can pass the reason through. */
class CouponError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Checks a coupon is redeemable by this user for this purchase.
 * Returns the coupon document. Throws CouponError with a customer-facing
 * message otherwise. Spends nothing.
 */
const validateCoupon = async ({ code, couponId, packageType, challengeId, userId }) => {
  const coupon = couponId
    ? await Coupons.findById(couponId)
    : await Coupons.findOne({ code: (code || "").trim() });

  if (!coupon) throw new CouponError("Coupon not found", 404);

  // A deactivated coupon behaves as if it does not exist.
  if (!coupon.isActive) throw new CouponError("This coupon is no longer available");

  if (packageType) {
    const label = PACKAGE_LABELS[packageType];
    const scope = coupon.applicableOn || [];
    if (!scope.includes("ALL") && !(label && scope.includes(label))) {
      throw new CouponError("This code is not valid for this subscription package");
    }
  }

  const onlyFor = coupon.challengesApplicableOn || [];
  if (challengeId && onlyFor.length > 0) {
    if (!onlyFor.some((c) => c.toString() === challengeId.toString())) {
      throw new CouponError("This code is not valid for the selected challenge");
    }
  }

  const users = coupon.couponUsers || [];
  if (coupon.limitUsage <= users.length) {
    throw new CouponError("Coupon usage limit reached");
  }

  if (userId && users.some((u) => (u._id || u).toString() === userId.toString())) {
    throw new CouponError("You have already used this coupon");
  }

  return coupon;
};

/**
 * Spends the coupon, once. Called only after a payment is confirmed paid.
 *
 * The conditional update is the guard against a double redemption when the
 * redirect and the webhook fulfil the same order concurrently: whichever query
 * runs second no longer matches, because the user is already in `couponUsers`.
 */
const redeemCoupon = async (couponId, userId) => {
  if (!couponId || !userId) return null;

  return Coupons.findOneAndUpdate(
    { _id: couponId, couponUsers: { $ne: userId } },
    { $push: { couponUsers: userId }, $inc: { currentUsage: 1 } },
    { new: true, useFindAndModify: false },
  );
};

/** Applies a percentage discount to a gross price, rounded to cents. */
const applyDiscount = (amount, discountPercent) => {
  const pct = Number(discountPercent) || 0;
  if (pct <= 0) return Math.round(Number(amount || 0) * 100) / 100;
  const discounted = Number(amount || 0) * (1 - pct / 100);
  return Math.max(0, Math.round(discounted * 100) / 100);
};

module.exports = {
  CouponError,
  PACKAGE_LABELS,
  validateCoupon,
  redeemCoupon,
  applyDiscount,
};
