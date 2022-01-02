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
    points:{
      type:Number,
      default:0
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
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    avatarLink: {
      type: String,
      required: true,
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
