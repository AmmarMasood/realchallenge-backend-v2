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
      ],
    },
    title: {
      type: String,
      required: true,
    },
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
      ],
    },
    body: { type: String, required: true },
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
