const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

const blogSchema = mongoose.Schema(
  {
    translationKey: {
      type: String,
      index: true,
    },
    language: {
      type: String,
      required: true,
      enum: SUPPORTED_LANGUAGES,
    },
    // alternativeLanguage removed - using translationKey for multi-language support
    title: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    featuredImage: {
      type: String,
      required: true,
    },
    paragraph: {
      type: String,
      required: true,
    },
    videoLink: {
      type: String,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlogCategory",
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    allowReviews: {
      type: Boolean,
      default: false,
    },
    allowComments: {
      type: Boolean,
      default: false,
    },
    adminApproved: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

exports.Blog = mongoose.model("Blog", blogSchema);
