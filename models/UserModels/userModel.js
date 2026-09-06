const mongoose = require("mongoose");
// const userRole = require("../models/userRoles");

// trainer comment Schema
const commentSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    text: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

const userSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    points: {
      type: Number,
      default: 0,
    },
    email: {
      type: String,
      unique: true,
      required: true,
    },
    firstName: {
      type: String,
    },
    lastName: {
      type: String,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "customer",
      enum: [
        "admin",
        "trainer",
        "nutrist",
        "blogger",
        "shopmanager",
        "customer",
      ],
    },
    roles: {
      type: [String],
      default: function() {
        return this.role ? [this.role] : ["customer"];
      },
      enum: [
        "admin",
        "trainer",
        "nutrist",
        "blogger",
        "shopmanager",
        "customer",
      ],
      validate: [
        {
          validator: function(roles) {
            // Must have at least one role
            return roles && roles.length > 0;
          },
          message: "User must have at least one role"
        },
        {
          validator: function(roles) {
            // If user has "admin" role, they can ONLY have "admin"
            if (roles.includes("admin") && roles.length > 1) {
              return false;
            }
            return true;
          },
          message: "Admin role cannot be combined with other roles"
        },
        {
          validator: function(roles) {
            // If user has "customer" role, they can ONLY have "customer"
            if (roles.includes("customer") && roles.length > 1) {
              return false;
            }
            return true;
          },
          message: "Customer role cannot be combined with other roles"
        }
      ]
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    avatarLink: {
      type: String,
      default:
        "https://thumbs.dreamstime.com/b/default-avatar-photo-placeholder-profile-icon-eps-file-easy-to-edit-default-avatar-photo-placeholder-profile-icon-124557887.jpg",
    },
    country: {
      type: String,
      required: false,
    },
    // Billing address. Required on a VAT invoice by law, and by Mollie's sales
    // invoice API, which is why invoicing could not run until these existed.
    // `country` above doubles as the billing country and drives the VAT rate —
    // EU digital services are taxed where the CUSTOMER is, not the seller.
    streetAndNumber: {
      type: String,
      required: false,
      trim: true,
    },
    postalCode: {
      type: String,
      required: false,
      trim: true,
    },
    city: {
      type: String,
      required: false,
      trim: true,
    },
    // Optional. A business with a valid EU VAT number outside the seller's
    // country is reverse-charged: 0% VAT, they account for it themselves.
    vatNumber: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
    },
    // IANA zone (e.g. "Europe/Amsterdam"). All week/"today" logic resolves
    // through utils/weekTime, which falls back to GMT when this is empty.
    timeZone: {
      type: String,
      required: false,
    },
    customerDetails: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerDetails",
    },
    trainerGoals: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChallengeGoals",
      },
    ],
    trainersFitnessInterest: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TrainerGoal",
      },
    ],
    heroBanner: {
      type: String,
    },
    videoTrailerLink: {
      type: String,
    },
    motto: {
      type: String,
    },
    motto_en: {
      type: String,
      default: "",
    },
    motto_nl: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
    },
    bio_en: {
      type: String,
      default: "",
    },
    bio_nl: {
      type: String,
      default: "",
    },
    comments: [commentSchema],
    resetToken: String,
    resetTokenExpire: Date,
    googleIdHash: { type: String },
    facebookIdHash: { type: String },
    isActive: {
      type: Boolean,
      default: false,
    },
    mollieId: {
      type: String,
    },
    subcriptionId: {
      type: String,
    },
  },
  // Hero

  // Motto
  // bio

  {
    timestamps: true,
  }
);

exports.User = mongoose.model("User", userSchema);
