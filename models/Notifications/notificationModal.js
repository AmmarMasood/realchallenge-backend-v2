const mongoose = require("mongoose");

const notificationSchema = mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "new-challenge",
        "new-recipe",
        "new-article",
        "new-video",
        "new-offer",
        "subscription",
        "next-workout",
        "system",
        "achievement",
      ],
    },
    // Multi-language support: use titleKey + params instead of hardcoded title
    titleKey: {
      type: String,
      required: true,
    },
    bodyKey: {
      type: String,
      required: true,
    },
    // Dynamic parameters for interpolation (e.g., { challengeName: "Summer Fitness" })
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Legacy fields (kept for backward compatibility with old notifications)
    title: { type: String },
    body: { type: String },
    userGroup: {
      type: String,
      required: true,
      enum: [
        "admin",
        "trainer",
        "nutrist",
        "blogger",
        "shopmanager",
        "customer",
        "all",
      ],
    },
    onClick: { type: String },
    createdAt: { type: Date, default: Date.now },
    readAt: { type: Date },
    sentBy: { type: String, required: true },
    notificationType: {
      type: String,
      default: "broadcast",
      enum: ["broadcast", "personal"],
    },
    notificationFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.notificationType === "personal";
      },
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

exports.Notification = mongoose.model("Notification", notificationSchema);
