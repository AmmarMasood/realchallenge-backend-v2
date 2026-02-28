const asyncHandler = require("express-async-handler");
const { Coupons } = require("../../models/CouponModel/couponsModel");
const { body, validationResult } = require("express-validator");

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

// @desc    Get Coupons by name
// @route   GET /api/coupons/use/:couponCode
// @route   Public
const useCoupon = asyncHandler(async (req, res) => {
  let coupon = await Coupons.findById(req.params.couponId).populate(
    "couponUsers"
  );
  console.log(coupon);

  if (!coupon || !coupon.couponUsers) {
    res.status(404);
    throw new Error("Coupon Not Found");
  }

  // Check if coupon has reached usage limit
  if (coupon.limitUsage <= coupon.couponUsers.length) {
    res.status(400);
    throw new Error("Coupon usage limit reached");
  }

  // Check if user has already used this coupon
  const alreadyUsed = coupon.couponUsers.some(
    (user) => user._id.toString() === req.user._id.toString()
  );
  if (alreadyUsed) {
    res.status(400);
    throw new Error("You have already used this coupon");
  }

  // Update coupon: add user to couponUsers and increment currentUsage
  const updatedCoupon = await Coupons.findByIdAndUpdate(
    coupon._id,
    {
      $push: { couponUsers: req.user._id },
      $inc: { currentUsage: 1 },
    },
    { new: true, useFindAndModify: false }
  );

  console.log("updatedCoupon", updatedCoupon);

  res.status(200).json({
    coupon: updatedCoupon,
    message: "Coupon used successfully",
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
