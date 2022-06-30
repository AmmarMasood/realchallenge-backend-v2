const mongoose = require("mongoose");

const blogSchema = mongoose.Schema(
  {
    language: {
      type: String,
      required: true,
    },
    alternativeLanguage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog",
    },
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
  },
  { timestamps: true }
);

exports.Blog = mongoose.model("Blog", blogSchema);
