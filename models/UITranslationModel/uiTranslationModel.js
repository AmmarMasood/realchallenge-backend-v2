const mongoose = require("mongoose");

const uiTranslationSchema = mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
      enum: ["english", "dutch"],
    },
    value: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for uniqueness on key + language
uiTranslationSchema.index({ key: 1, language: 1 }, { unique: true });

// Index for efficient language-based queries
uiTranslationSchema.index({ language: 1 });

exports.UITranslation = mongoose.model("UITranslation", uiTranslationSchema);
