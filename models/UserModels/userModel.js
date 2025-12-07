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
    bio: {
      type: String,
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
