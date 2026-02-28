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
    // Display name - editable by admin (legacy fallback)
    displayName: {
      type: String,
      required: true,
    },
    // Per-language display names
    displayName_en: {
      type: String,
      default: "",
    },
    displayName_nl: {
      type: String,
      default: "",
    },
    // Short description (legacy fallback)
    description: {
      type: String,
      default: "",
    },
    // Per-language descriptions
    description_en: {
      type: String,
      default: "",
    },
    description_nl: {
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
    // Price display text (e.g., "€4.5 /Week") - legacy fallback
    priceDisplayText: {
      type: String,
      default: "",
    },
    // Per-language price display text
    priceDisplayText_en: {
      type: String,
      default: "",
    },
    priceDisplayText_nl: {
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
