const mongoose = require("mongoose");

const membershipSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    isValid: {
      type: String,
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    price: {
      type: Number,
    },
    coupons: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupons",
        required: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

exports.Membership = mongoose.model("Membership", membershipSchema);
