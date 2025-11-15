const mongoose = require("mongoose");

const exerciseSchema = mongoose.Schema(
  {
    language: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    title: {
      required: true,
      type: String,
    },
    videoURL: {
      required: true,
      type: String,
    },
    videoThumbnailURL: {
      type: String,
      required: false,
    },
    trainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: {
      type: String, //0:34
    },
    // break: {
    //   type: Number,
    // },
    // exerciseGroupName: {
    //   type: String,
    // },
    voiceOverLink: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound unique index to prevent duplicate exercise titles per trainer
exerciseSchema.index({ trainer: 1, title: 1 }, { unique: true });

exports.Exercise = mongoose.model("Exercise", exerciseSchema);
