const asyncHandler = require("express-async-handler");
const { Coupons } = require("../../models/CouponModel/couponsModel");
const { body, validationResult } = require("express-validator");
const { validateCoupon } = require("../../services/couponService");
const { resolveOrderPrice } = require("../../services/pricing");

// @desc    Create Coupon
// @route   POST /api/coupon/create
// @access  Private ["Admin"]
const createCoupon = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    console.log(req.body);

    let newCoupon = new Coupons({
      name: req.body.name,
      code: req.body.code,
      discountPercent: req.body.discountPercent,
      limitUsage: req.body.limitUsage,
      isActive: req.body.isActive,
      applicableOn: req.body.applicableOn,
      challengesApplicableOn: req.body.challengesApplicableOn
        ? req.body.challengesApplicableOn
        : null,
    });

    newCoupon = await newCoupon.save();
    if (!newCoupon) {
      return res.status(400).json("Coupon cannot be created!");
    } else {
      return res.status(201).json({
        message: "Coupon Created Successfully",
        newCoupon,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All Coupons
// @route   GET /api/coupons/all
// @route   Public
const getAllCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupons.find({});

  if (coupons) {
    res.status(200).json({
      coupons,
    });
  } else {
    res.status(404);
    throw new Error("Coupons Cannot be fetched");
  }
});

// @desc    Get Coupons by id
// @route   GET /api/coupons/:couponId
// @route   Public
const getCouponById = asyncHandler(async (req, res) => {
  const coupon = await Coupons.findById(req.params.couponId).populate(
    "couponUsers"
  );

  if (coupon) {
    res.status(200).json({
      coupon,
      message: "Coupons retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Coupons Not found");
  }
});

// @desc    Delete Coupon
// @route   Delete /api/coupons/:couponId
// @access  Private Admin
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupons.findById(req.params.couponId);

  if (coupon) {
    await coupon.remove();
    res.json({ message: "Coupon removed" });
  } else {
    res.status(404);
    throw new Error("Coupon not found");
  }
});

// @desc    Update Product by Id
// @route   PUT /api/blog/:blogId
// @access  Admin & Blogger
// const updateBlog = asyncHandler(async (req, res, next) => {
//   try {
//     const update = req.body;
//     const blogId = req.params.blogId;
//     await Blog.findByIdAndUpdate(blogId, update, {
//       useFindAndModify: false,
//     });
//     const blog = await Blog.findById(blogId)
//       .populate("user")
//       .select("-passwordHash")
//       .populate("category");

//     res.status(200).json({
//       message: "Blog has been updated",
//       blog,
//     });
//   } catch (error) {
//     next(error);
//   }
// });

// @desc    Update Coupon by Id
// @route   PUT /api/coupons/:couponId
const updateCoupon = asyncHandler(async (req, res, next) => {
  try {
    const update = { ...req.body, updatedBy: req.user._id };
    const couponId = req.params.couponId;
    await Coupons.findByIdAndUpdate(couponId, update, {
      useFindAndModify: false,
    });
    const coupon = await Coupons.findById(couponId);
    res.status(200).json({
      data: coupon,
      message: "Coupon has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get Coupons by id
// @route   GET /api/coupons/:couponId
// @route   Public
const getCouponByCode = asyncHandler(async (req, res) => {
  const coupon = await Coupons.findOne({
    code: req.params.couponCode,
  }).populate("couponUsers");

  // A deactivated coupon must behave as if it does not exist. `isActive` was
  // never checked anywhere, so switching a coupon off in the admin panel had no
  // effect at all and the discount kept working.
  if (coupon && !coupon.isActive) {
    res.status(404);
    throw new Error("Coupons Not found");
  }

  if (coupon) {
    res.status(200).json({
      coupon,
      message: "Coupons retrieved successfully",
    });
  } else {
    res.status(404);
    throw new Error("Coupons Not found");
  }
});

// @desc    Check a coupon is redeemable, and preview the discounted price.
//          Deliberately spends nothing: this runs when the customer clicks
//          "Apply", which is before they reach Mollie. It used to redeem the
//          coupon there and then, so abandoning the checkout burned the code
//          permanently — the user was already in `couponUsers`. Redemption now
//          happens at fulfilment, once the payment is confirmed paid.
// @route   GET /api/coupons/use/:couponId
// @access  Private
const useCoupon = asyncHandler(async (req, res) => {
  // Sent as query params: this is a GET, and a body on a GET is not reliably
  // transmitted.
  const { packageType, challengeId } = {
    ...(req.body || {}),
    ...(req.query || {}),
  };

  let coupon;
  let pricing = null;
  try {
    coupon = await validateCoupon({
      couponId: req.params.couponId,
      packageType,
      challengeId,
      userId: req.user._id,
    });

    // Price the order here too, and let the browser display THIS number. The
    // discount used to be recomputed in the browser, which rounded the
    // half-cent the other way — the customer was shown €17.46 and charged
    // €17.47. One computation, one answer.
    if (packageType) {
      const priced = await resolveOrderPrice({
        packageType,
        challengeIds: challengeId ? [challengeId] : [],
        couponId: coupon._id,
        userId: req.user._id,
      });
      pricing = {
        listPrice: priced.listPrice,
        price: priced.gross,
        currency: priced.currency,
        discountPercent: coupon.discountPercent,
      };
    }
  } catch (err) {
    res.status(err.statusCode || 400);
    throw new Error(err.message);
  }

  res.status(200).json({
    coupon,
    pricing,
    valid: true,
    message: "Coupon applied",
  });
});

module.exports = {
  createCoupon,
  deleteCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  useCoupon,
  getCouponByCode,
};
