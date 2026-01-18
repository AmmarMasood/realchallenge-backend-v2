const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

const exerciseSchema = mongoose.Schema(
  {
    translationKey: {
      type: String,
      index: true,
    },
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
    },
    // alternativeLanguage removed - using translationKey for multi-language support
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
      type: String,
    },
    voiceOverLink: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound unique index to prevent duplicate exercise titles per trainer and language
exerciseSchema.index({ trainer: 1, title: 1, language: 1 }, { unique: true });

exports.Exercise = mongoose.model("Exercise", exerciseSchema);
