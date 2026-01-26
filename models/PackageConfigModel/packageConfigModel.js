const mongoose = require("mongoose");

const packageConfigSchema = mongoose.Schema(
  {
    // Internal ID - never changes (CHALLENGE_1, CHALLENGE_3, CHALLENGE_12)
    packageId: {
      type: String,
      required: true,
      unique: true,
      enum: ["CHALLENGE_1", "CHALLENGE_3", "CHALLENGE_12"],
    },
    // Display name - editable by admin
    displayName: {
      type: String,
      required: true,
    },
    // Short description
    description: {
      type: String,
      default: "",
    },
    // Price in EUR
    price: {
      type: Number,
      required: true,
    },
    // Currency (default EUR)
    currency: {
      type: String,
      default: "EUR",
    },
    // Billing interval in months
    billingInterval: {
      type: Number,
      required: true,
    },
    // Number of paid challenges allowed
    challengesAllowed: {
      type: Number,
      required: true,
    },
    // Savings percentage to display (e.g., "40%")
    savingsPercent: {
      type: String,
      default: "",
    },
    // Price display text (e.g., "€4.5 /Week")
    priceDisplayText: {
      type: String,
      default: "",
    },
    // Whether this package is active/visible
    isActive: {
      type: Boolean,
      default: true,
    },
    // Sort order for display
    sortOrder: {
      type: Number,
      default: 0,
    },
    // Last updated by
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Index for quick lookup
packageConfigSchema.index({ packageId: 1 });
packageConfigSchema.index({ isActive: 1, sortOrder: 1 });

exports.PackageConfig = mongoose.model("PackageConfig", packageConfigSchema);
