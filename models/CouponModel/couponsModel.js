const mongoose = require("mongoose");

const couponsSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
    },
    couponUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    discountPercent: {
      type: Number,
      required: true,
    },
    limitUsage: {
      type: Number,
      required: true,
    },
    currentUsage: {
      type: Number,
    },
    isActive: {
      type: Boolean,
      required: true,
    },
    applicableOn: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

exports.Coupons = mongoose.model("Coupons", couponsSchema);
