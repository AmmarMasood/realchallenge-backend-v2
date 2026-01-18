const mongoose = require("mongoose");
const { SUPPORTED_LANGUAGES } = require("../../utils/language");

const blogCategory = mongoose.Schema(
  {
    name: {
      type: String,
    },
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
    },
  },
  { timestamps: true }
);

exports.BlogCategory = mongoose.model("BlogCategory", blogCategory);
