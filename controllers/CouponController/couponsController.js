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
    const update = req.body;
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

  if (
    coupon &&
    coupon.couponUsers &&
    coupon.limitUsage > coupon.couponUsers.length &&
    coupon.couponUsers.filter((user) => req.user._id).length <= 0
  ) {
    (coupon.couponUsers = [...coupon.couponUsers, req.user.id]),
      console.log("updatedCoupon", coupon);
    const response = await Coupons.findByIdAndUpdate(coupon._id, coupon, {
      useFindAndModify: false,
    });
    console.log("response", response);
    res.status(200).json({
      coupon: coupon,
      message: "Coupons used successfully",
    });
  } else {
    res.status(404);
    throw new Error("Coupons Not Valid");
  }
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
